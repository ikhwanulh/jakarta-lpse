import { useState } from 'react';
import { StatusBadge, STATUS_OPTIONS } from './StatusBadge.jsx';

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
      day: '2-digit', month: 'long', year: 'numeric'
    });
  } catch { return isoStr; }
}

export default function ProjectDetailModal({ project, onClose, onUpdate }) {
  const [status, setStatus] = useState(project.status || 'new');
  const [notes, setNotes] = useState(project.notes || '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSaveMsg('✅ Tersimpan');
        onUpdate(updated);
        setTimeout(() => setSaveMsg(''), 2000);
      } else {
        setSaveMsg('❌ Gagal menyimpan');
      }
    } catch {
      setSaveMsg('❌ Tidak dapat terhubung ke server');
    } finally {
      setSaving(false);
    }
  };

  const detail = [
    { label: 'Sumber Portal', value: project.sourceName || '-' },
    { label: 'Instansi Penyelenggara', value: project.agency || '-' },
    { label: 'Nilai HPS / Pagu', value: formatRp(project.hps) },
    { label: 'Status Tender', value: project.tenderStatus || '-' },
    { label: 'Batas Penawaran', value: formatDate(project.deadline) },
    { label: 'ID Tender', value: project.tenderId || '-' },
    { label: 'Waktu Crawl', value: formatDate(project.crawledAt) },
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        {/* Header */}
        <div className="modal-header">
          <div style={{ flex: 1, marginRight: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <StatusBadge status={status} />
            </div>
            <h3 id="modal-title" style={{ lineHeight: 1.4, fontSize: '1rem' }}>
              {project.name || 'Detail Proyek'}
            </h3>
          </div>
          <button
            id="modal-close-btn"
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Detail Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {detail.map(({ label, value }) => (
              <div key={label} style={{
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                border: 'var(--border-glass)',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-all' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Link */}
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              id="modal-project-link"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                color: 'var(--color-accent)',
                textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.14)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)'}
            >
              🔗 Buka halaman tender resmi ↗
            </a>
          )}

          {/* Status selector */}
          <div className="form-group">
            <label className="form-label" htmlFor="modal-status-select">
              Status Tindak Lanjut
            </label>
            <select
              id="modal-status-select"
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label" htmlFor="modal-notes-input">
              Catatan Internal
            </label>
            <textarea
              id="modal-notes-input"
              className="textarea"
              placeholder="Tambahkan catatan, alasan keputusan, PIC, dll..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {saveMsg && (
            <span style={{ fontSize: '0.875rem', color: saveMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-danger)', marginRight: 'auto' }}>
              {saveMsg}
            </span>
          )}
          <button id="modal-cancel-btn" className="btn btn-secondary" onClick={onClose}>
            Tutup
          </button>
          <button
            id="modal-save-btn"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <><span className="spinner spinner-sm" /> Menyimpan...</> : '💾 Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
}
