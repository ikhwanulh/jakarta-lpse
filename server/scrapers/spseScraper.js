import * as cheerio from 'cheerio';
import axios from 'axios';

const SPSE_BASE = 'https://spse.inaproc.id';

/**
 * Scrape public tender list from SPSE v4.5 (DataTables AJAX endpoint).
 * Returns array of project objects or throws on failure.
 */
export async function scrapeSPSE(sourceUrl, sourceId, sourceName) {
  // Extract slug from URL e.g. /jakarta/lelang → jakarta
  const urlParts = new URL(sourceUrl);
  const slug = urlParts.pathname.split('/').filter(Boolean)[0];

  const apiUrl = `${SPSE_BASE}/${slug}/dt/lelang`;

  const params = new URLSearchParams({
    draw: 1,
    start: 0,
    length: 100,
    'search[value]': '',
    'order[0][column]': 0,
    'order[0][dir]': 'desc',
  });

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: sourceUrl,
  };

  const response = await axios.get(`${apiUrl}?${params.toString()}`, {
    headers,
    timeout: 15000,
  });

  const json = response.data;

  if (!json || !Array.isArray(json.data)) {
    throw new Error('Unexpected SPSE response format');
  }

  return json.data.map((row, i) => {
    // SPSE DataTables returns HTML strings in each column
    const cols = row.map ? row : Object.values(row);

    const parseText = (html) => {
      if (typeof html !== 'string') return String(html || '');
      const $ = cheerio.load(html);
      return $.text().trim();
    };

    // Typical columns: [index, nama_paket, hps, instansi, jenis, metode, status, tanggal]
    const name = parseText(cols[1] || cols[0]);
    const hpsRaw = parseText(cols[2] || '');
    const agency = parseText(cols[3] || '');
    const status = parseText(cols[6] || '');
    const dateRaw = parseText(cols[7] || '');

    // Extract tender ID from link if present
    let tenderId = `${sourceId}-${i}`;
    if (typeof cols[1] === 'string') {
      const match = cols[1].match(/\/lelang\/(\d+)/);
      if (match) tenderId = match[1];
    }

    // Parse HPS value (strip Rp, dots)
    const hpsNum = parseInt(hpsRaw.replace(/[^\d]/g, ''), 10) || 0;

    return {
      id: `proj-${tenderId}`,
      tenderId,
      name,
      hps: hpsNum,
      agency,
      tenderStatus: status,
      deadline: dateRaw,
      sourceId,
      sourceName,
      url: `${SPSE_BASE}/${slug}/lelang/${tenderId}`,
      crawledAt: new Date().toISOString(),
    };
  });
}

/**
 * Generic HTML table scraper for simple eProc portals.
 * Tries to find the largest table and extract rows as project objects.
 */
export async function scrapeGenericHTML(sourceUrl, sourceId, sourceName) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  const response = await axios.get(sourceUrl, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
  });

  const $ = cheerio.load(response.data);
  const projects = [];

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

  const rows = $(bestTable).find('tr');
  // First row = header
  rows.each((i, row) => {
    if (i === 0) return; // skip header
    const cells = $(row).find('td');
    if (cells.length < 2) return;

    const name = $(cells[1]).text().trim() || $(cells[0]).text().trim();
    if (!name) return;

    const tenderId = `${sourceId}-${i}`;
    // Try to find an anchor for a URL
    const link = $(row).find('a').first().attr('href') || '';
    const fullLink = link.startsWith('http') ? link : `${new URL(sourceUrl).origin}${link}`;

    // Try to parse HPS from any cell containing "Rp" or numeric value
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
