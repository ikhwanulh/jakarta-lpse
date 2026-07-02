import { scrapeSPSE, scrapeGenericHTML, scrapeMRT, scrapeTransjakarta, scrapeAncol, scrapeEProcs } from './spseScraper.js';
import { updateSource, upsertProject, addCrawlLog, getSources } from '../db.js';

// ─── Portals classified by crawl strategy ────────────────────────────────────

// RC-3 Fix: Portals that are JS-rendered or have auth walls — mark immediately
// with accurate, portal-specific error messages instead of generic "no table found"
// Added conditional checks (check property) so updated crawlable URLs bypass this list.
const UNCRAWLABLE_PORTALS = {
  'jakartamrt.co.id': {
    check: (url) => !url.includes('/announcement'),
    reason:
      'Portal MRT Jakarta memerlukan akun Approved Vendor List (AVL). ' +
      'Detail tender tidak dapat diakses secara publik tanpa autentikasi AVL.',
  },
  'transjakarta.co.id': {
    check: (url) => !url.includes('/tender'),
    reason:
      'Portal Transjakarta menggunakan Microsoft Dynamics ERP dengan rendering ' +
      'JavaScript sisi klien penuh. Memerlukan headless browser (Playwright/Puppeteer) ' +
      'untuk mengeksekusi JavaScript sebelum data dapat diekstrak.',
  },
  'jiep.co.id': {
    check: () => true,
    reason:
      'Portal JIEP dilindungi oleh SSO Nexus. ' +
      'Autentikasi login diperlukan untuk mengakses daftar tender.',
  },
  'pamjaya.co.id': {
    check: (url) => !url.includes('/tender'),
    reason:
      'Portal PAM JAYA menggunakan rendering JavaScript sisi klien (Single Page App). ' +
      'Cheerio tidak dapat mengekstrak data dari halaman dinamis ini. ' +
      'Memerlukan headless browser untuk crawling.',
  },
  'paljaya.com': {
    check: (url) => !url.includes('/tender'),
    reason:
      'Portal PAL Jaya menggunakan rendering JavaScript sisi klien. ' +
      'Memerlukan headless browser untuk mengambil data tender.',
  },
  'kbn.co.id': {
    check: () => true,
    reason:
      'Portal KBN menggunakan rendering JavaScript sisi klien. ' +
      'Memerlukan headless browser untuk mengambil data tender.',
  },
  'pulomasjaya.co.id': {
    check: () => true,
    reason:
      'Portal Pulo Mas Jaya menggunakan rendering JavaScript sisi klien. ' +
      'Memerlukan headless browser untuk mengambil data tender.',
  },
  'pasarjaya.co.id': {
    check: (url) => !url.includes('/lelang'),
    reason:
      'Portal Pasar Jaya telah migrasi ke platform iProc ADW (pengadaan.com) ' +
      'yang menggunakan Single Page App dengan sesi terenkripsi. ' +
      'Memerlukan headless browser dengan session management.',
  },
  'dharmajaya.co.id': {
    check: () => true,
    reason:
      'Halaman pengadaan Dharma Jaya menggunakan WordPress blog post dengan barcode eksternal, ' +
      'bukan tabel HTML standar. ' +
      'Data tender dipublikasikan sebagai PDF atau post blog, bukan tabel terstruktur.',
  },
};

// Portals that use SPSE v4.5 DataTables AJAX (inaproc)
const SPSE_PATTERNS = ['spse.inaproc.id'];

function getUncrawlableInfo(url) {
  const match = Object.entries(UNCRAWLABLE_PORTALS).find(([pattern, obj]) =>
    url.includes(pattern) && (typeof obj.check === 'function' ? obj.check(url) : true)
  );
  return match ? match[1] : null;
}

function isSPSE(url) {
  return SPSE_PATTERNS.some((pat) => url.includes(pat));
}

// ─── Main crawl function ──────────────────────────────────────────────────────

export async function crawlSource(source) {
  const { id, url, name } = source;

  // Mark as crawling
  updateSource(id, { status: 'crawling', lastError: null });

  // Check if URL is matched in the uncrawlable list
  const uncrawlableInfo = getUncrawlableInfo(url);
  if (uncrawlableInfo) {
    updateSource(id, {
      status: 'uncrawlable',
      lastCrawled: new Date().toISOString(),
      lastError: uncrawlableInfo.reason,
    });
    addCrawlLog({
      sourceId: id,
      sourceName: name,
      type: 'uncrawlable',
      message: uncrawlableInfo.reason,
      projectsAdded: 0,
    });
    return { success: false, reason: uncrawlableInfo.reason, projectsAdded: 0 };
  }

  try {
    let projects = [];

    if (isSPSE(url)) {
      projects = await scrapeSPSE(url, id, name);
    } else if (url.includes('jakartamrt.co.id')) {
      projects = await scrapeMRT(url, id, name);
    } else if (url.includes('transjakarta.co.id')) {
      projects = await scrapeTransjakarta(url, id, name);
    } else if (url.includes('ancol.com')) {
      projects = await scrapeAncol(url, id, name);
    } else if (url.includes('pamjaya.co.id') || url.includes('paljaya.com')) {
      projects = await scrapeEProcs(url, id, name);
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
    await sleep(600 + Math.random() * 800);
    const result = await crawlSource(source);
    results.push({ sourceId: source.id, sourceName: source.name, ...result });
  }
  return results;
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(err) {
  // RC-4: Login redirect detected by scraper
  if (err.message?.includes('LOGIN_REQUIRED')) {
    return (
      'Portal mengarahkan ke halaman login. ' +
      'Akses data tender memerlukan autentikasi. Tidak dapat diakses secara publik.'
    );
  }

  if (!err.response && err.code === 'ECONNREFUSED') {
    return 'Koneksi ditolak (ECONNREFUSED). Server portal mungkin sedang offline atau tidak dapat dijangkau.';
  }

  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    return 'Request timeout. Server terlalu lambat merespons atau secara aktif memblokir crawler.';
  }

  // RC-2: TLS errors
  if (
    err.message?.includes('unable to verify') ||
    err.message?.includes('certificate') ||
    err.message?.includes('TLS') ||
    err.message?.includes('SSL') ||
    err.message?.includes('socket disconnected')
  ) {
    return (
      'Gagal terkoneksi karena masalah sertifikat SSL/TLS. ' +
      'Portal menggunakan sertifikat self-signed atau chain tidak lengkap.'
    );
  }

  if (err.response) {
    const status = err.response.status;
    if (status === 403) {
      return 'HTTP 403 Forbidden — Portal memblokir akses crawler (WAF atau proteksi anti-bot aktif).';
    }
    if (status === 401) {
      return 'HTTP 401 Unauthorized — Diperlukan autentikasi untuk mengakses portal ini.';
    }
    if (status === 404) {
      return 'HTTP 404 Not Found — URL target tidak ditemukan. Periksa apakah URL portal masih aktif.';
    }
    if (status >= 500) {
      return `HTTP ${status} — Server portal sedang mengalami gangguan internal.`;
    }
    return `HTTP ${status} — ${err.response.statusText || 'Unknown error'}`;
  }

  if (err.message?.includes('No usable data table')) {
    return (
      'Tidak ada tabel data yang dapat diekstrak dari halaman ini. ' +
      'Kemungkinan halaman memerlukan JavaScript atau autentikasi untuk menampilkan data.'
    );
  }

  if (err.message?.includes('no extractable rows') || err.message?.includes('0 rows')) {
    return 'Tabel ditemukan namun tidak ada baris data yang dapat diekstrak. Portal mungkin kosong atau memerlukan login.';
  }

  if (err.message?.includes('SPSE returned 0 records')) {
    return 'SPSE portal tidak mengembalikan data. Mungkin tidak ada tender aktif atau session tidak valid.';
  }

  return `Error: ${err.message || 'Unknown error'}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
