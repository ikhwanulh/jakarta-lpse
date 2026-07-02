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
  const dtUrl = `${baseUrl}/dt/tender`;

  const baseHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // ── Step 1: Get session cookie + auth token ──────────────────────────────
  const pageResp = await axios.get(lelangUrl, {
    headers: baseHeaders,
    httpsAgent,
    timeout: 15000,
    withCredentials: true,
  });

  // Extract Set-Cookie header
  const rawCookies = pageResp.headers['set-cookie'] || [];
  const cookieStr = rawCookies
    .map((c) => c.split(';')[0])
    .join('; ');

  // Extract ___AT auth token from cookie or page body
  let authToken = '';
  const cookieMatch = cookieStr.match(/___AT=([A-Za-z0-9]+)/);
  if (cookieMatch) {
    authToken = cookieMatch[1];
  } else {
    // Try to find it in the page HTML
    const htmlMatch = pageResp.data?.match(/___AT=([A-Za-z0-9]+)/);
    if (htmlMatch) authToken = htmlMatch[1];
  }

  // ── Step 2: POST to DataTables endpoint ──────────────────────────────────
  const params = new URLSearchParams({
    draw: '1',
    start: '0',
    length: '100',
    'search[value]': '',
    'order[0][column]': '1',
    'order[0][dir]': 'desc',
  });
  if (authToken) params.set('token', authToken);

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

    const name = parseText(cols[1] || cols[0]);
    const hpsRaw = parseText(cols[2] || '');
    const agency = parseText(cols[3] || '');
    const tenderStatus = parseText(cols[6] || '');
    const dateRaw = parseText(cols[7] || '');

    let tenderId = `${sourceId}-${i}`;
    if (typeof cols[1] === 'string') {
      const match = cols[1].match(/\/lelang\/(\d+)/);
      if (match) tenderId = match[1];
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
      url: `${baseUrl}/lelang/${tenderId}`,
      crawledAt: new Date().toISOString(),
    };
  });
}

/**
 * Generic HTML table scraper for simple eProc portals.
 *
 * Fix (RC-2): Use rejectUnauthorized:false httpsAgent.
 * Fix (RC-4): Detect login-redirect pages and throw descriptive error.
 */
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

    const name = $(cells[1]).text().trim() || $(cells[0]).text().trim();
    if (!name) return;

    const tenderId = `${sourceId}-${i}`;
    const link = $(row).find('a').first().attr('href') || '';
    const fullLink = link.startsWith('http')
      ? link
      : `${new URL(sourceUrl).origin}${link}`;

    let hps = 0;
    cells.each((_, cell) => {
      const txt = $(cell).text();
      if (txt.includes('Rp') || /^\s*[\d.,]+\s*$/.test(txt)) {
        const num = parseInt(txt.replace(/[^\d]/g, ''), 10);
        if (num > hps) hps = num;
      }
    });

    projects.push({
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps,
      agency: sourceName,
      tenderStatus: '-',
      deadline: '-',
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
