import { scrapeSPSE, scrapeGenericHTML } from './spseScraper.js';
import { updateSource, upsertProject, addCrawlLog, getSources } from '../db.js';

// Portals known to require login/AVL or JS-rendered pages - mark immediately uncrawlable
const UNCRAWLABLE_PATTERNS = [
  'jakartamrt.co.id',      // MRT - AVL required
  'transjakarta.co.id',    // Transjakarta - Microsoft Dynamics ERP (JS-heavy)
  'jiep.co.id',            // JIEP - SSO Nexus login
];

// Portals that use SPSE v4.5 DataTables AJAX
const SPSE_PATTERNS = [
  'spse.inaproc.id',
];

function isUncrawlable(url) {
  return UNCRAWLABLE_PATTERNS.some((pat) => url.includes(pat));
}

function isSPSE(url) {
  return SPSE_PATTERNS.some((pat) => url.includes(pat));
}

export async function crawlSource(source) {
  const { id, url, name } = source;

  // Mark as crawling
  updateSource(id, { status: 'crawling', lastError: null });

  // Known un-crawlable portals
  if (isUncrawlable(url)) {
    const reason = getUncrawlableReason(url);
    updateSource(id, {
      status: 'uncrawlable',
      lastCrawled: new Date().toISOString(),
      lastError: reason,
    });
    addCrawlLog({
      sourceId: id,
      sourceName: name,
      type: 'uncrawlable',
      message: reason,
      projectsAdded: 0,
    });
    return { success: false, reason, projectsAdded: 0 };
  }

  try {
    let projects = [];

    if (isSPSE(url)) {
      projects = await scrapeSPSE(url, id, name);
    } else {
      projects = await scrapeGenericHTML(url, id, name);
    }

    // Upsert each project (deduplicate by tenderId)
    let added = 0;
    for (const project of projects) {
      try {
        upsertProject(project);
        added++;
      } catch (e) {
        // Continue on individual project errors
      }
    }

    updateSource(id, {
      status: 'success',
      lastCrawled: new Date().toISOString(),
      lastError: null,
      projectCount: added,
    });

    addCrawlLog({
      sourceId: id,
      sourceName: name,
      type: 'success',
      message: `Berhasil mengambil ${added} proyek dari ${name}.`,
      projectsAdded: added,
    });

    return { success: true, projectsAdded: added };
  } catch (err) {
    const errorMsg = classifyError(err);

    updateSource(id, {
      status: 'uncrawlable',
      lastCrawled: new Date().toISOString(),
      lastError: errorMsg,
    });

    addCrawlLog({
      sourceId: id,
      sourceName: name,
      type: 'error',
      message: errorMsg,
      projectsAdded: 0,
    });

    return { success: false, reason: errorMsg, projectsAdded: 0 };
  }
}

export async function crawlAll() {
  const sources = getSources().filter((s) => s.active);
  const results = [];
  for (const source of sources) {
    // Add delay between requests to avoid WAF triggers
    await sleep(800 + Math.random() * 1200);
    const result = await crawlSource(source);
    results.push({ sourceId: source.id, sourceName: source.name, ...result });
  }
  return results;
}

function getUncrawlableReason(url) {
  if (url.includes('jakartamrt.co.id'))
    return 'Portal MRT Jakarta memerlukan akun Approved Vendor List (AVL). Tidak dapat diakses secara publik.';
  if (url.includes('transjakarta.co.id'))
    return 'Portal Transjakarta menggunakan Microsoft Dynamics ERP dengan rendering JavaScript sisi klien penuh. Memerlukan headless browser.';
  if (url.includes('jiep.co.id'))
    return 'Portal JIEP menggunakan proteksi login SSO Nexus. Tidak dapat diakses tanpa autentikasi.';
  return 'Portal tidak dapat diakses secara publik.';
}

function classifyError(err) {
  if (!err.response && err.code === 'ECONNREFUSED')
    return 'Koneksi ditolak (ECONNREFUSED). Server mungkin sedang offline.';
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED')
    return 'Request timeout. Server terlalu lambat merespons atau memblokir crawler.';
  if (err.response) {
    const status = err.response.status;
    if (status === 403)
      return `HTTP 403 Forbidden — Portal memblokir akses crawler (WAF atau proteksi anti-bot).`;
    if (status === 401)
      return `HTTP 401 Unauthorized — Diperlukan autentikasi untuk mengakses portal ini.`;
    if (status === 404)
      return `HTTP 404 Not Found — URL target tidak ditemukan.`;
    if (status >= 500)
      return `HTTP ${status} — Server portal sedang mengalami gangguan.`;
    return `HTTP ${status} — ${err.response.statusText || 'Unknown error'}`;
  }
  if (err.message?.includes('No usable data table'))
    return 'Tidak ada tabel data yang dapat diekstrak dari halaman ini. Struktur halaman mungkin memerlukan JavaScript atau login.';
  if (err.message?.includes('no extractable rows'))
    return 'Tabel ditemukan namun tidak ada baris data yang dapat diekstrak.';
  return `Error: ${err.message || 'Unknown error'}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
