const STATUS_META = {
  new:          { label: 'Baru', dot: '●' },
  consider:     { label: 'Pertimbangkan', dot: '◆' },
  follow:       { label: 'Ikuti', dot: '★' },
  ignored:      { label: 'Abaikan', dot: '○' },
  won:          { label: 'Menang', dot: '✓' },
  lost:         { label: 'Kalah', dot: '✗' },
  // Source statuses
  idle:         { label: 'Idle', dot: '○' },
  crawling:     { label: 'Crawling...', dot: '◌' },
  success:      { label: 'Berhasil', dot: '✓' },
  uncrawlable:  { label: 'Un-crawlable', dot: '⊘' },
  error:        { label: 'Error', dot: '!' },
};

export function StatusBadge({ status, size = 'normal' }) {
  const meta = STATUS_META[status] || { label: status || '-', dot: '•' };
  const cls = `badge badge-${status}${size === 'sm' ? ' badge-sm' : ''}`;
  return (
    <span className={cls} title={meta.label}>
      <span style={{ fontSize: size === 'sm' ? '0.6rem' : '0.7rem' }}>{meta.dot}</span>
      {meta.label}
    </span>
  );
}

export function CrawlabilityBadge({ level }) {
  const normalized = (level || '-').toLowerCase();
  return (
    <span className={`badge badge-crawlability-${normalized}`}>
      {level || '-'}
    </span>
  );
}

export const STATUS_OPTIONS = [
  { value: 'new', label: 'Baru' },
  { value: 'consider', label: 'Pertimbangkan' },
  { value: 'follow', label: 'Ikuti' },
  { value: 'ignored', label: 'Abaikan' },
  { value: 'won', label: 'Menang' },
  { value: 'lost', label: 'Kalah' },
];
