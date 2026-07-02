import { useState, useEffect, useCallback } from 'react';
import { StatusBadge, CrawlabilityBadge } from './StatusBadge.jsx';

export default function SourcesManager() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crawlingIds, setCrawlingIds] = useState(new Set());
  const [crawlingAll, setCrawlingAll] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [form, setForm] = useState({ name: '', url: '', platform: '', crawlability: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      setSources(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Poll for status updates every 3s when crawling is in progress
  useEffect(() => {
    if (crawlingIds.size === 0 && !crawlingAll) return;
    const interval = setInterval(fetchSources, 2500);
    return () => clearInterval(interval);
  }, [crawlingIds, crawlingAll, fetchSources]);

  const handleCrawl = async (source) => {
    setCrawlingIds((prev) => new Set([...prev, source.id]));
    try {
      await fetch(`/api/sources/${source.id}/crawl`, { method: 'POST' });
      // Poll until status changes from 'crawling'
      let attempts = 0;
      const poll = setInterval(async () => {
        await fetchSources();
        attempts++;
        const updated = sources.find((s) => s.id === source.id);
        if (!updated || updated.status !== 'crawling' || attempts > 30) {
          clearInterval(poll);
          setCrawlingIds((prev) => { const n = new Set(prev); n.delete(source.id); return n; });
        }
      }, 2000);
    } catch (e) {
      setCrawlingIds((prev) => { const n = new Set(prev); n.delete(source.id); return n; });
    }
  };

  const handleCrawlAll = async () => {
    setCrawlingAll(true);
    try {
      await fetch('/api/sources/crawl-all', { method: 'POST' });
      // Refresh after a delay to catch status updates
      setTimeout(() => { fetchSources(); setCrawlingAll(false); }, 5000);
    } catch {
      setCrawlingAll(false);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.url.trim()) {
      setFormError('Nama dan URL wajib diisi.');
      return;
    }
    try { new URL(form.url); } catch {
      setFormError('Format URL tidak valid. Pastikan dimulai dengan https://');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingSourceId ? `/api/sources/${editingSourceId}` : '/api/sources';
      const method = editingSourceId ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Gagal menyimpan sumber.');
        return;
      }
      setForm({ name: '', url: '', platform: '', crawlability: '', notes: '' });
      setShowAddForm(false);
      setEditingSourceId(null);
      fetchSources();
    } catch {
      setFormError('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (src) => {
    setForm({
      name: src.name,
      url: src.url,
      platform: src.platform || '',
      crawlability: src.crawlability || '',
      notes: src.notes || '',
    });
    setEditingSourceId(src.id);
    setShowAddForm(true);
    setFormError('');
  };

  const handleCancelClick = () => {
    setForm({ name: '', url: '', platform: '', crawlability: '', notes: '' });
    setShowAddForm(false);
    setEditingSourceId(null);
    setFormError('');
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Sumber LPSE & e-Procurement</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            {sources.length} portal terdaftar
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            id="sources-btn-crawl-all"
            className="btn btn-accent"
            onClick={handleCrawlAll}
            disabled={crawlingAll}
          >
            {crawlingAll ? <><span className="spinner spinner-sm" /> Crawling Semua...</> : '🕷️ Crawl Semua'}
          </button>
          <button
            id="sources-btn-add"
            className="btn btn-primary"
            onClick={() => {
              setForm({ name: '', url: '', platform: '', crawlability: '', notes: '' });
              setEditingSourceId(null);
              setShowAddForm(true);
            }}
          >
            + Tambah Portal
          </button>
        </div>
      </div>

      {/* Add Source Form */}
      {showAddForm && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3>{editingSourceId ? 'Edit Portal LPSE / e-Procurement' : 'Tambah Portal LPSE / e-Procurement Baru'}</h3>
            <button className="btn btn-secondary btn-sm" onClick={handleCancelClick}>
              ✕ Tutup
            </button>
          </div>
          <form onSubmit={handleAddSource} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="src-name">Nama Instansi / BUMD *</label>
              <input
                id="src-name"
                className="input"
                placeholder="contoh: PT Dharma Jaya"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-url">URL Target Publikasi Pengadaan *</label>
              <input
                id="src-url"
                className="input"
                type="url"
                placeholder="https://eproc.example.co.id/tender"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-platform">Jenis Platform</label>
              <input
                id="src-platform"
                className="input"
                placeholder="contoh: Custom e-Procurement, SPSE v4.5"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-crawlability">Kemudahan Crawling</label>
              <select
                id="src-crawlability"
                className="select"
                value={form.crawlability}
                onChange={(e) => setForm({ ...form, crawlability: e.target.value })}
              >
                <option value="">-- Pilih --</option>
                <option value="Tinggi">Tinggi</option>
                <option value="Sedang">Sedang</option>
                <option value="Rendah">Rendah</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="src-notes">Catatan / Hambatan Teknis</label>
              <textarea
                id="src-notes"
                className="textarea"
                placeholder="contoh: Portal menggunakan WAF, memerlukan headless browser, dll."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
            {formError && (
              <div className="alert alert-error" style={{ gridColumn: '1 / -1' }}>
                ⚠️ {formError}
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancelClick}>
                Batal
              </button>
              <button id="src-submit-btn" type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <><span className="spinner spinner-sm" /> Menyimpan...</> : editingSourceId ? '💾 Simpan Perubahan' : '+ Tambah Sumber'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sources Table */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ padding: '60px', gap: '12px' }}>
          <div className="spinner" />
          <span className="text-secondary">Memuat sumber...</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Instansi / BUMD</th>
                  <th>Platform</th>
                  <th>Crawlability</th>
                  <th>Status</th>
                  <th>Proyek</th>
                  <th>Terakhir Crawl</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((src, i) => {
                  const isCrawling = crawlingIds.has(src.id) || src.status === 'crawling';
                  return (
                    <tr key={src.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '3px' }}>{src.name}</div>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.75rem', color: 'var(--color-accent)', textDecoration: 'none' }}
                          title={src.url}
                        >
                          {src.url.length > 45 ? src.url.slice(0, 45) + '…' : src.url} ↗
                        </a>
                        {src.lastError && (
                          <p style={{ fontSize: '0.725rem', color: 'var(--color-danger)', marginTop: '4px', lineHeight: 1.4 }}>
                            ⚠️ {src.lastError.length > 90 ? src.lastError.slice(0, 90) + '…' : src.lastError}
                          </p>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {src.platform || '-'}
                      </td>
                      <td>
                        <CrawlabilityBadge level={src.crawlability} />
                      </td>
                      <td>
                        <StatusBadge status={src.status} />
                      </td>
                      <td style={{ fontWeight: 700, color: src.projectCount > 0 ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                        {src.projectCount ?? 0}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(src.lastCrawled)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            id={`src-crawl-${src.id}`}
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCrawl(src)}
                            disabled={isCrawling}
                            title="Crawl sumber ini sekarang"
                          >
                            {isCrawling
                              ? <><span className="spinner spinner-sm pulse" /> Crawling</>
                              : '🕷️ Crawl'}
                          </button>
                          <button
                            id={`src-edit-${src.id}`}
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEditClick(src)}
                            disabled={isCrawling}
                            title="Edit detail portal ini"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sources.length === 0 && (
              <div className="empty-state">
                <span className="icon">🏛️</span>
                <p>Belum ada sumber terdaftar. Klik "+ Tambah Portal" untuk mulai.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
