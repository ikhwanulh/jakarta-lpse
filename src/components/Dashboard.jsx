import { useState, useEffect, useCallback } from 'react';
import { StatusBadge } from './StatusBadge.jsx';

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

export default function Dashboard({ onTabChange }) {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/crawl-logs?limit=10'),
      ]);
      setStats(await statsRes.json());
      setLogs(await logsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: '80px', gap: '12px' }}>
        <div className="spinner" />
        <span className="text-secondary">Memuat dashboard...</span>
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Sumber LPSE',
      value: stats?.totalSources || 0,
      sub: `${stats?.activeSources || 0} aktif · ${stats?.uncrawlableSources || 0} un-crawlable`,
      icon: '🏛️',
      color: 'var(--color-accent)',
    },
    {
      label: 'Total Proyek Crawled',
      value: stats?.totalProjects || 0,
      sub: `${stats?.newProjects || 0} baru belum ditindaklanjuti`,
      icon: '📋',
      color: 'var(--color-primary)',
    },
    {
      label: 'Proyek Diikuti',
      value: stats?.followProjects || 0,
      sub: `${stats?.considerProjects || 0} dalam pertimbangan`,
      icon: '⭐',
      color: '#10b981',
    },
    {
      label: 'Proyek Diabaikan',
      value: stats?.ignoredProjects || 0,
      sub: `${stats?.wonProjects || 0} menang · ${stats?.lostProjects || 0} kalah`,
      icon: '🚫',
      color: '#64748b',
    },
  ];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {metricCards.map((m) => (
          <div key={m.label} className="card" style={{ padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
            {/* Glow accent */}
            <div style={{
              position: 'absolute', top: -20, right: -20, width: 80, height: 80,
              borderRadius: '50%', background: m.color, opacity: 0.08, filter: 'blur(20px)',
              pointerEvents: 'none',
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.75rem' }}>{m.icon}</span>
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, color: m.color,
                background: `${m.color}18`, border: `1px solid ${m.color}30`,
                padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>LIVE</span>
            </div>
            <div style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {m.value}
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ marginBottom: '4px' }}>Aksi Cepat</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Navigasi ke bagian portal</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button id="dash-btn-sources" className="btn btn-secondary" onClick={() => onTabChange('sources')}>
              🏛️ Kelola Sumber LPSE
            </button>
            <button id="dash-btn-projects" className="btn btn-primary" onClick={() => onTabChange('projects')}>
              📋 Lihat Semua Proyek
            </button>
          </div>
        </div>
      </div>

      {/* Status Overview */}
      {stats?.totalProjects > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Distribusi Status Proyek</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { status: 'new', count: stats.newProjects },
              { status: 'consider', count: stats.considerProjects },
              { status: 'follow', count: stats.followProjects },
              { status: 'ignored', count: stats.ignoredProjects },
              { status: 'won', count: stats.wonProjects },
              { status: 'lost', count: stats.lostProjects },
            ].map(({ status, count }) => (
              <div
                key={status}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                onClick={() => onTabChange('projects')}
              >
                <StatusBadge status={status} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crawl Logs */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3>Log Crawl Terbaru</h3>
          <button id="dash-btn-refresh" className="btn btn-secondary btn-sm" onClick={fetchData}>
            🔄 Refresh
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <span className="icon">📭</span>
            <p>Belum ada log crawl. Mulai dengan mengklik "Crawl Now" di halaman Sumber LPSE.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderLeft: `3px solid ${
                    log.type === 'success' ? 'var(--color-success)' :
                    log.type === 'uncrawlable' ? 'var(--color-danger)' : '#ef4444'
                  }`,
                }}
              >
                <span style={{ fontSize: '1.1rem', marginTop: '1px' }}>
                  {log.type === 'success' ? '✅' : log.type === 'uncrawlable' ? '⊘' : '❌'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{log.sourceName}</span>
                    {log.projectsAdded > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>
                        +{log.projectsAdded} proyek
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {log.message}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {formatDate(log.timestamp)} {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
