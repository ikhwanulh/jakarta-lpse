import * as cheerio from 'cheerio';
import axios from 'axios';
import https from 'https';

const SPSE_BASE = 'https://spse.inaproc.id';

// Shared HTTPS agent that tolerates self-signed / incomplete SSL chains
// common on Indonesian government & BUMD portals
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Scrape public tender list from SPSE v4.5 (inaproc).
 *
 * Fix (RC-1 + RC-2):
 *  - Step 1: GET /lelang to obtain SPSE_SESSION cookie + ___AT auth token
 *  - Step 2: POST /dt/tender with session cookie + auth token + DataTables params
 *  - Use rejectUnauthorized:false to handle non-standard SSL (RC-2)
 */
export async function scrapeSPSE(sourceUrl, sourceId, sourceName) {
  const urlParts = new URL(sourceUrl);
  const slug = urlParts.pathname.split('/').filter(Boolean)[0]; // e.g. "jakarta"

  const baseUrl = `${SPSE_BASE}/${slug}`;
  const lelangUrl = `${baseUrl}/lelang`;

  const baseHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // ── Step 1: Get session cookie + auth token + ajax url path ────────────────
  const pageResp = await axios.get(lelangUrl, {
    headers: baseHeaders,
    httpsAgent,
    timeout: 15000,
    withCredentials: true,
  });

  const html = pageResp.data || '';

  // Extract authenticityToken
  const tokenMatch = html.match(/authenticityToken\s*[=:]\s*['"]([a-f0-9]+)['"]/i);
  const token = tokenMatch ? tokenMatch[1] : null;

  // Extract dynamic dt/lelang url path
  const urlMatch = html.match(/url\s*:\s*['"]([^'"]+dt\/lelang[^'"]*)['"]/i);
  const dtUrlPath = urlMatch ? urlMatch[1] : `/${slug}/dt/lelang?tahun=${new Date().getFullYear()}`;
  const dtUrl = `${SPSE_BASE}${dtUrlPath}`;

  // Extract Set-Cookie header
  const rawCookies = pageResp.headers['set-cookie'] || [];
  const cookieStr = rawCookies
    .map((c) => c.split(';')[0])
    .join('; ');

  // ── Step 2: POST to DataTables endpoint ──────────────────────────────────
  const params = new URLSearchParams({
    draw: '1',
    start: '0',
    length: '100',
    'search[value]': '',
    'order[0][column]': '0',
    'order[0][dir]': 'desc',
  });
  if (token) {
    params.set('authenticityToken', token);
  }

  const dtResp = await axios.post(dtUrl, params.toString(), {
    headers: {
      ...baseHeaders,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: lelangUrl,
      Cookie: cookieStr,
    },
    httpsAgent,
    timeout: 20000,
  });

  const json = dtResp.data;

  if (!json || !Array.isArray(json.data)) {
    throw new Error(`Unexpected SPSE response format: ${JSON.stringify(json).slice(0, 200)}`);
  }

  if (json.data.length === 0) {
    throw new Error('SPSE returned 0 records — portal may require auth or be empty');
  }

  return json.data.map((row, i) => {
    const cols = Array.isArray(row) ? row : Object.values(row);

    const parseText = (html) => {
      if (!html) return '';
      if (typeof html !== 'string') return String(html);
      const $ = cheerio.load(html);
      return $('body').text().trim();
    };

    const tenderId = cols[0] ? String(cols[0]) : `${sourceId}-${i}`;
    const name = parseText(cols[1] || '');
    const agency = parseText(cols[2] || '');
    const tenderStatus = parseText(cols[3] || '');
    let hpsRaw = parseText(cols[10] || cols[4] || '');
    const dateRaw = '-'; // not returned in list data

    if (hpsRaw.includes(',')) {
      hpsRaw = hpsRaw.split(',')[0];
    }
    const hpsNum = parseInt(hpsRaw.replace(/[^\d]/g, ''), 10) || 0;

    return {
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps: hpsNum,
      agency,
      tenderStatus,
      deadline: dateRaw,
      sourceId,
      sourceName,
      url: `${baseUrl}/lelang/${tenderId}/pengumumanlelang`,
      crawledAt: new Date().toISOString(),
    };
  });
}

export async function scrapeGenericHTML(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      'Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const response = await axios.get(sourceUrl, {
    headers,
    httpsAgent,           // RC-2: tolerate non-standard SSL
    timeout: 15000,
    maxRedirects: 5,
  });

  const $ = cheerio.load(response.data);

  // RC-4: Detect login/auth redirect pages
  const hasLoginForm =
    $('form input[type="password"]').length > 0 ||
    $('input[name="password"], input[name="passwd"], input[name="pass"]').length > 0 ||
    $('button[type="submit"]').filter((_, el) => {
      const txt = $(el).text().toLowerCase();
      return txt.includes('login') || txt.includes('masuk') || txt.includes('sign in');
    }).length > 0;

  if (hasLoginForm) {
    throw new Error('LOGIN_REQUIRED: Halaman mengharuskan login sebelum menampilkan data tender.');
  }

  // Find the table with the most rows
  let bestTable = null;
  let bestCount = 0;
  $('table').each((_, table) => {
    const rowCount = $(table).find('tr').length;
    if (rowCount > bestCount) {
      bestCount = rowCount;
      bestTable = table;
    }
  });

  if (!bestTable || bestCount < 2) {
    throw new Error('No usable data table found on page');
  }

  const projects = [];
  const rows = $(bestTable).find('tr');

  rows.each((i, row) => {
    if (i === 0) return; // skip header
    const cells = $(row).find('td');
    if (cells.length < 2) return;

    // Smart mapping: name is usually in cell[2] if it exists, otherwise cell[1]
    const name = $(cells[2]).text().trim() || $(cells[1]).text().trim() || $(cells[0]).text().trim();
    if (!name) return;

    // Use cell[1] as ref if name is in cell[2]
    const ref = $(cells[1]).text().trim();
    const tenderId = ref && ref !== name ? ref : `${sourceId}-${i}`;

    const link = $(row).find('a').first().attr('href') || '';
    const fullLink = link.startsWith('http')
      ? link
      : `${new URL(sourceUrl).origin}${link}`;

    let hps = 0;
    cells.each((_, cell) => {
      const txt = $(cell).text();
      if (txt.includes('Rp') || /^\s*[\d.,]+\s*$/.test(txt)) {
        let hpsRaw = txt;
        if (hpsRaw.includes(',')) hpsRaw = hpsRaw.split(',')[0];
        const num = parseInt(hpsRaw.replace(/[^\d]/g, ''), 10);
        if (num > hps) hps = num;
      }
    });

    let deadline = '-';
    if (cells.length >= 5) {
      deadline = $(cells[4]).text().trim() || $(cells[3]).text().trim() || '-';
    }

    projects.push({
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps,
      agency: sourceName,
      tenderStatus: 'Aktif',
      deadline,
      sourceId,
      sourceName,
      url: fullLink || sourceUrl,
      crawledAt: new Date().toISOString(),
    });
  });

  if (projects.length === 0) {
    throw new Error('Table found but no extractable rows');
  }

  return projects;
}

/**
 * Custom scraper for MRT Jakarta announcement page.
 */
export async function scrapeMRT(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const projects = [];

  $('div.font-secondary.p-2.mb-1.bg-hover').each((i, el) => {
    const titleEl = $(el).find('.pi-card-title');
    if (titleEl.length === 0) return;
    const name = titleEl.text().trim();
    
    const linkEl = $(el).find('a').first();
    const href = linkEl.attr('href') || '';
    const fullLink = href.startsWith('http') ? href : `${new URL(sourceUrl).origin}${href}`;
    
    const statusEl = $(el).find('.badge');
    const status = statusEl.length > 0 ? statusEl.text().trim() : 'Active';

    const tenderId = href.match(/\/detail\/([a-zA-Z0-9]+)/)?.[1] || `${sourceId}-${i}`;

    projects.push({
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps: 0,
      agency: 'PT MRT Jakarta (Perseroda)',
      tenderStatus: status,
      deadline: '-',
      sourceId,
      sourceName,
      url: fullLink,
      crawledAt: new Date().toISOString(),
    });
  });

  if (projects.length === 0) {
    throw new Error('No MRT projects could be parsed from the page structure.');
  }
  return projects;
}

/**
 * Custom scraper for Transjakarta index POST API.
 */
export async function scrapeTransjakarta(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // Step 1: GET main page to extract current period date range
  const getResp = await axios.get(sourceUrl, { headers, httpsAgent, timeout: 15000 });
  const $ = cheerio.load(getResp.data);
  const period = $('input[name="periode"]').val() || '';

  // Step 2: POST request to retrieve DataTable JSON
  const params = new URLSearchParams({
    antarmuka: 'Indeks',
    periode: period,
  });

  const response = await axios.post(sourceUrl, params.toString(), {
    headers: {
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    httpsAgent,
    timeout: 20000,
  });

  const json = response.data;
  const dataObj = typeof json === 'string' ? JSON.parse(json) : json;
  const rawList = dataObj.data || dataObj;
  const items = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

  if (items.length === 0) {
    throw new Error('Transjakarta returned empty list of projects.');
  }

  return items.map((item, i) => {
    let hps = 0;
    if (item.tombol) {
      const match = item.tombol.match(/data-detail23="([^"]+)"/);
      if (match) {
        let hpsRaw = match[1];
        if (hpsRaw.includes(',')) hpsRaw = hpsRaw.split(',')[0];
        hps = parseInt(hpsRaw.replace(/[^\d]/g, ''), 10) || 0;
      }
    }

    const tenderId = item.nomor || `${sourceId}-${i}`;
    return {
      id: `proj-${tenderId}`,
      tenderId,
      name: item.judul || '-',
      hps,
      agency: 'PT Transportasi Jakarta (Transjakarta)',
      tenderStatus: 'Aktif',
      deadline: item.penutupan || '-',
      sourceId,
      sourceName,
      url: sourceUrl,
      crawledAt: new Date().toISOString(),
    };
  });
}

/**
 * Custom scraper for Ancol eProc URL (ASP.NET dynamic session + AJAX POST).
 */
export async function scrapeAncol(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const getResp = await axios.get(sourceUrl, {
    headers,
    httpsAgent,
    timeout: 15000,
    maxRedirects: 10,
  });

  const finalUrl = getResp.request.res.responseUrl || sourceUrl;
  const urlObj = new URL(finalUrl);
  
  const pathMatch = urlObj.pathname.match(/^(\/\(X\(1\)S\([^)]+\)\)\/eProc)\//);
  const pathPrefix = pathMatch ? pathMatch[1] : '/eProc';
  
  const ajaxUrl = `https://eproc.ancol.com${pathPrefix}/tenderAnnouncementManage`;

  const rawCookies = getResp.headers['set-cookie'] || [];
  const cookieStr = rawCookies.map((c) => c.split(';')[0]).join('; ');

  const params = new URLSearchParams({
    draw: '1',
    start: '0',
    length: '100',
    'SearchName': '',
    'Flag': 'ptm_subject_of_work',
  });

  const postResp = await axios.post(ajaxUrl, params.toString(), {
    headers: {
      ...headers,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': finalUrl,
      'Cookie': cookieStr,
    },
    httpsAgent,
    timeout: 20000,
  });

  const resData = postResp.data;
  const resultList = resData?.result || [];

  if (resultList.length === 0) {
    throw new Error('Ancol returned 0 records or failed to parse.');
  }

  return resultList.map((item, i) => {
    const tenderId = item.ptm_number || `${sourceId}-${i}`;
    
    let deadline = '-';
    if (item.ptp_reg_closing_date) {
      const tsMatch = item.ptp_reg_closing_date.match(/\/Date\((\d+)\)\//);
      if (tsMatch) {
        deadline = new Date(parseInt(tsMatch[1], 10)).toLocaleDateString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric'
        });
      }
    }

    return {
      id: `proj-${tenderId}`,
      tenderId,
      name: item.ptm_subject_of_work || '-',
      hps: 0,
      agency: item.ptm_district || sourceName,
      tenderStatus: item.statusCaption || 'Open',
      deadline,
      sourceId,
      sourceName,
      url: `https://eproc.ancol.com${pathPrefix}/TenderView`,
      crawledAt: new Date().toISOString(),
    };
  });
}

/**
 * Custom scraper for PAM JAYA / PAL Jaya ePROCs (Procuriza) platform.
 */
export async function scrapeEProcs(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const response = await axios.get(sourceUrl, { headers, httpsAgent, timeout: 15000 });
  const $ = cheerio.load(response.data);
  const projects = [];

  $('div.col-md-12').each((i, el) => {
    const nameEl = $(el).find('strong a, a.hver');
    if (nameEl.length === 0) return;
    const name = nameEl.text().trim();

    const href = nameEl.attr('href') || '';
    const fullLink = href.startsWith('http')
      ? href
      : href.startsWith('/')
        ? `${new URL(sourceUrl).origin}${href}`
        : `${new URL(sourceUrl).origin}/${href}`;

    const textBlock = $(el).text();
    const packetMatch = textBlock.match(/No\.\s*Paket:\s*([^\s]+)/i);
    const tenderId = packetMatch ? packetMatch[1].trim() : `${sourceId}-${i}`;

    const hpsMatch = textBlock.match(/Harga\s*Perkiraan\s*IDR\s*([0-9.,]+)/i);
    let hps = 0;
    if (hpsMatch) {
      let hpsRaw = hpsMatch[1];
      if (hpsRaw.includes(',')) hpsRaw = hpsRaw.split(',')[0];
      hps = parseInt(hpsRaw.replace(/[^\d]/g, ''), 10) || 0;
    }

    const statusEl = $(el).find('.badge-primary');
    const status = statusEl.length > 0 ? statusEl.text().trim() : 'Aktif';

    projects.push({
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps,
      agency: sourceName,
      tenderStatus: status,
      deadline: '-',
      sourceId,
      sourceName,
      url: fullLink,
      crawledAt: new Date().toISOString(),
    });
  });

  if (projects.length === 0) {
    throw new Error('No ePROCs projects could be parsed from the page.');
  }
  return projects;
}
