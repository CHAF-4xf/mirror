export function CoverageBadge({ grade, mini = false }: {
  grade: 'STRONG' | 'MODERATE' | 'THIN';
  mini?: boolean;
}) {
  const tone = grade === 'STRONG' ? 'var(--accent-2)'
             : grade === 'MODERATE' ? 'var(--warn)'
             : 'var(--muted)';
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: mini ? 10.5 : 11, color: tone,
      letterSpacing: '.04em', fontWeight: 500,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone }} />
      {grade}
    </span>
  );
}
