import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = join(__dirname, '..', 'dist');
import {
  getSources,
  addSource,
  updateSource,
  getSourceById,
  getProjects,
  updateProject,
  getCrawlLogs,
  getStats,
} from './db.js';
import { crawlSource, crawlAll } from './scrapers/scraperManager.js';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = existsSync(DIST_DIR);

app.use(cors());
app.use(express.json());

// ─── Serve built React app in production ─────────────────────────────────────
if (IS_PROD) {
  app.use(express.static(DIST_DIR));
  console.log(`📦 Serving React build from ${DIST_DIR}`);
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// ─── Crawl Logs ──────────────────────────────────────────────────────────────
app.get('/api/crawl-logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(getCrawlLogs(limit));
});

// ─── Sources ──────────────────────────────────────────────────────────────────
app.get('/api/sources', (req, res) => {
  res.json(getSources());
});

app.post('/api/sources', (req, res) => {
  const { name, url, platform, crawlability, notes } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required.' });
  }
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }
  const newSource = addSource({ name, url, platform, crawlability, notes });
  res.status(201).json(newSource);
});

app.patch('/api/sources/:id', (req, res) => {
  const updated = updateSource(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Source not found.' });
  res.json(updated);
});

// ─── Crawl (single source) ────────────────────────────────────────────────────
app.post('/api/sources/:id/crawl', async (req, res) => {
  const source = getSourceById(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found.' });

  // Non-blocking: respond immediately, crawl runs in background
  res.json({ message: `Crawl dimulai untuk ${source.name}`, sourceId: source.id });

  try {
    await crawlSource(source);
  } catch (err) {
    console.error(`Crawl error for ${source.name}:`, err.message);
  }
});

// ─── Crawl All ────────────────────────────────────────────────────────────────
app.post('/api/sources/crawl-all', async (req, res) => {
  const sources = getSources().filter((s) => s.active);
  res.json({ message: `Crawl dimulai untuk ${sources.length} sumber aktif.` });

  try {
    await crawlAll();
  } catch (err) {
    console.error('Crawl-all error:', err.message);
  }
});

// ─── Projects ─────────────────────────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const { query, sourceId, status, minHps, maxHps } = req.query;
  const projects = getProjects({ query, sourceId, status, minHps, maxHps });
  res.json(projects);
});

app.patch('/api/projects/:id', (req, res) => {
  const { status, notes } = req.body;

  const validStatuses = ['new', 'consider', 'follow', 'ignored', 'won', 'lost'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}` });
  }

  const updated = updateProject(req.params.id, { status, notes });
  if (!updated) return res.status(404).json({ error: 'Project not found.' });
  res.json(updated);
});

// ─── SPA Fallback (must be AFTER all /api routes) ───────────────────────────
if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const mode = IS_PROD ? 'production' : 'development';
  console.log(`\n🚀 Jakarta LPSE Portal [${mode}] running at http://0.0.0.0:${PORT}\n`);
});
