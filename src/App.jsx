import { useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import SourcesManager from './components/SourcesManager.jsx';
import ProjectsTable from './components/ProjectsTable.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'projects', label: 'Proyek Pengadaan', icon: '📋' },
  { id: 'sources', label: 'Sumber LPSE', icon: '🏛️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Sidebar / Header Nav ── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(8, 12, 24, 0.85)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', boxShadow: '0 0 16px rgba(99,102,241,0.4)',
            }}>
              🏛️
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em', lineHeight: 1 }}>
                Jakarta LPSE
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Portal Pemantau Pengadaan Internal
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav style={{ display: 'flex', gap: '4px' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                className="btn btn-secondary"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 16px',
                  fontSize: '0.875rem',
                  background: activeTab === tab.id
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'transparent',
                  color: activeTab === tab.id
                    ? 'var(--color-primary)'
                    : 'var(--text-secondary)',
                  border: activeTab === tab.id
                    ? '1px solid rgba(99, 102, 241, 0.3)'
                    : '1px solid transparent',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 12px', borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            fontSize: '0.75rem', color: '#10b981', fontWeight: 500,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10b981', display: 'inline-block',
              boxShadow: '0 0 6px #10b981',
            }} />
            Sistem Aktif
          </div>
        </div>
      </header>

      {/* ── Page Content ── */}
      <main style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'dashboard' && (
          <Dashboard onTabChange={setActiveTab} />
        )}
        {activeTab === 'projects' && (
          <ProjectsTable />
        )}
        {activeTab === 'sources' && (
          <SourcesManager />
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        background: 'rgba(8, 12, 24, 0.6)',
      }}>
        Portal Pengadaan Jakarta — Khusus Internal · Data bersumber dari portal LPSE & e-Procurement publik BUMD DKI Jakarta
      </footer>
    </div>
  );
}
