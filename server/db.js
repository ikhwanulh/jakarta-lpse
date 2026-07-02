import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DB_PATH env var allows Docker to redirect to a mounted volume directory
const SEED_PATH = join(__dirname, 'db.json');
const DB_PATH = process.env.DB_PATH || SEED_PATH;

// On first run in Docker: if the target path doesn't exist yet, copy the seed file
if (DB_PATH !== SEED_PATH && !existsSync(DB_PATH)) {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  copyFileSync(SEED_PATH, DB_PATH);
  console.log(`📋 Seeded database to ${DB_PATH}`);
}

function readDB() {
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Sources ---
export function getSources() {
  return readDB().sources;
}

export function addSource(source) {
  const db = readDB();
  const newSource = {
    id: `src-${Date.now()}`,
    name: source.name,
    url: source.url,
    platform: source.platform || 'Unknown',
    crawlability: source.crawlability || '-',
    notes: source.notes || '',
    status: 'idle',
    lastCrawled: null,
    lastError: null,
    projectCount: 0,
    active: true,
  };
  db.sources.push(newSource);
  writeDB(db);
  return newSource;
}

export function updateSource(id, updates) {
  const db = readDB();
  const idx = db.sources.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  db.sources[idx] = { ...db.sources[idx], ...updates };
  writeDB(db);
  return db.sources[idx];
}

export function getSourceById(id) {
  return readDB().sources.find((s) => s.id === id) || null;
}

// --- Projects ---
export function getProjects(filters = {}) {
  const db = readDB();
  let projects = db.projects;

  if (filters.query) {
    const q = filters.query.toLowerCase();
    projects = projects.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sourceId?.toLowerCase().includes(q) ||
        p.sourceName?.toLowerCase().includes(q) ||
        p.agency?.toLowerCase().includes(q)
    );
  }
  if (filters.sourceId) {
    projects = projects.filter((p) => p.sourceId === filters.sourceId);
  }
  if (filters.status && filters.status !== 'all') {
    projects = projects.filter((p) => p.status === filters.status);
  }
  if (filters.minHps) {
    projects = projects.filter((p) => (p.hps || 0) >= Number(filters.minHps));
  }
  if (filters.maxHps) {
    projects = projects.filter((p) => (p.hps || 0) <= Number(filters.maxHps));
  }

  return projects;
}

export function upsertProject(project) {
  const db = readDB();
  const existing = db.projects.findIndex((p) => p.tenderId === project.tenderId);
  if (existing !== -1) {
    // Update crawl data but preserve user-set status/notes
    db.projects[existing] = {
      ...project,
      status: db.projects[existing].status,
      notes: db.projects[existing].notes,
      userUpdatedAt: db.projects[existing].userUpdatedAt,
    };
  } else {
    db.projects.push({
      ...project,
      status: 'new',
      notes: '',
      userUpdatedAt: null,
    });
  }
  writeDB(db);
}

export function updateProject(id, updates) {
  const db = readDB();
  const idx = db.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.projects[idx] = {
    ...db.projects[idx],
    ...updates,
    userUpdatedAt: new Date().toISOString(),
  };
  writeDB(db);
  return db.projects[idx];
}

// --- Crawl Logs ---
export function addCrawlLog(log) {
  const db = readDB();
  db.crawlLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...log,
  });
  // Keep only last 100 logs
  db.crawlLogs = db.crawlLogs.slice(0, 100);
  writeDB(db);
}

export function getCrawlLogs(limit = 20) {
  return readDB().crawlLogs.slice(0, limit);
}

export function getStats() {
  const db = readDB();
  const projects = db.projects;
  return {
    totalSources: db.sources.length,
    activeSources: db.sources.filter((s) => s.active).length,
    uncrawlableSources: db.sources.filter((s) => s.status === 'uncrawlable').length,
    totalProjects: projects.length,
    newProjects: projects.filter((p) => p.status === 'new').length,
    followProjects: projects.filter((p) => p.status === 'follow').length,
    considerProjects: projects.filter((p) => p.status === 'consider').length,
    ignoredProjects: projects.filter((p) => p.status === 'ignored').length,
    wonProjects: projects.filter((p) => p.status === 'won').length,
    lostProjects: projects.filter((p) => p.status === 'lost').length,
  };
}
