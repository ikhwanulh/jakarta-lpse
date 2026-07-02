import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBadge, STATUS_OPTIONS } from './StatusBadge.jsx';
import ProjectDetailModal from './ProjectDetailModal.jsx';

function formatRp(num) {
  if (!num || num === 0) return '-';
  if (num >= 1e12) return `Rp ${(num / 1e12).toFixed(2)} T`;
  if (num >= 1e9) return `Rp ${(num / 1e9).toFixed(2)} M`;
  if (num >= 1e6) return `Rp ${(num / 1e6).toFixed(1)} jt`;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function formatDate(isoStr) {
  if (!isoStr || isoStr === '-') return '-';
  try {
    return new Date(isoStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch { return isoStr; }
}

export default function ProjectsTable() {
  const [projects, setProjects] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  // Filters
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sort
  const [sortCol, setSortCol] = useState('crawledAt');
  const [sortDir, setSortDir] = useState('desc');

  // Debounce ref
  const debounceRef = useRef(null);

  const fetchProjects = useCallback(async (params = {}) => {
    const url = new URL('/api/projects', window.location.origin);
    if (params.query) url.searchParams.set('query', params.query);
    if (params.sourceId) url.searchParams.set('sourceId', params.sourceId);
    if (params.status && params.status !== 'all') url.searchParams.set('status', params.status);
    try {
      const res = await fetch(url.toString());
      setProjects(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      setSources(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchSources();
    fetchProjects({});
  }, [fetchProjects, fetchSources]);

  // Debounced filter fetch
  const applyFilters = (newQuery, newSourceId, newStatus) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchProjects({ query: newQuery, sourceId: newSourceId, status: newStatus });
    }, 300);
  };

  const handleQueryChange = (e) => {
    setQuery(e.target.value);
    applyFilters(e.target.value, sourceFilter, statusFilter);
  };

  const handleSourceChange = (e) => {
    setSourceFilter(e.target.value);
    applyFilters(query, e.target.value, statusFilter);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    applyFilters(query, sourceFilter, e.target.value);
  };

  // Client-side sort
  const sortedProjects = [...projects].sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (sortCol === 'hps') { av = av || 0; bv = bv || 0; }
    else { av = av || ''; bv = bv || ''; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3 }}>↕</span>;
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const handleUpdate = (updated) => {
    setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    if (selected?.id === updated.id) setSelected(updated);
  };

  // Inline quick status change (without opening modal)
  const handleQuickStatus = async (project, newStatus) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleUpdate(updated);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Proyek Pengadaan</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            {loading ? '...' : `${sortedProjects.length} proyek ditemukan`}
          </p>
        </div>
        <button
          id="projects-btn-refresh"
          className="btn btn-secondary btn-sm"
          onClick={() => { setLoading(true); fetchProjects({ query, sourceId: sourceFilter, status: statusFilter }); }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="proj-search">🔍 Cari Proyek</label>
            <input
              id="proj-search"
              className="input"
              placeholder="Nama paket, instansi..."
              value={query}
              onChange={handleQueryChange}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="proj-source-filter">🏛️ Filter Sumber</label>
            <select
              id="proj-source-filter"
              className="select"
              value={sourceFilter}
              onChange={handleSourceChange}
            >
              <option value="">Semua Sumber</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="proj-status-filter">📌 Filter Status</label>
            <select
              id="proj-status-filter"
              className="select"
              value={statusFilter}
              onChange={handleStatusChange}
            >
              <option value="all">Semua Status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ padding: '60px', gap: '12px' }}>
          <div className="spinner" />
          <span className="text-secondary">Memuat proyek...</span>
        </div>
      ) : sortedProjects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="icon">📭</span>
            <p style={{ fontWeight: 600 }}>Tidak ada proyek ditemukan</p>
            <p style={{ fontSize: '0.875rem' }}>
              Coba ubah filter pencarian, atau klik "Crawl Now" di halaman Sumber LPSE untuk mulai mengambil data.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th className="sortable" onClick={() => handleSort('name')}>
                    Nama Paket {sortIcon('name')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('sourceName')}>
                    Sumber {sortIcon('sourceName')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('hps')}>
                    HPS / Pagu {sortIcon('hps')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('deadline')}>
                    Batas Waktu {sortIcon('deadline')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('crawledAt')}>
                    Crawled {sortIcon('crawledAt')}
                  </th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((proj, i) => (
                  <tr key={proj.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(proj)}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{i + 1}</td>
                    <td style={{ maxWidth: '280px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.4 }}
                        title={proj.name}>
                        {proj.name?.length > 70 ? proj.name.slice(0, 70) + '…' : proj.name || '-'}
                      </div>
                      {proj.agency && proj.agency !== proj.sourceName && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {proj.agency}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {proj.sourceName || '-'}
                    </td>
                    <td style={{ fontWeight: 700, color: proj.hps > 0 ? 'var(--color-accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatRp(proj.hps)}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(proj.deadline)}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(proj.crawledAt)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        id={`proj-status-${proj.id}`}
                        className="select"
                        style={{ width: '130px', padding: '5px 28px 5px 8px', fontSize: '0.8125rem' }}
                        value={proj.status || 'new'}
                        onChange={(e) => handleQuickStatus(proj, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        id={`proj-detail-${proj.id}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelected(proj)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <ProjectDetailModal
          project={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
