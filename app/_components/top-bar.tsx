'use client';

import Link from 'next/link';

export function TopBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 24px', borderBottom: '1px solid var(--line)',
      background: 'rgba(250,249,247,.85)', backdropFilter: 'blur(10px)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <Link href="/" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontWeight: 600, letterSpacing: '-.01em',
        textDecoration: 'none', color: 'var(--ink)',
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'var(--ink)', display: 'grid', placeItems: 'center',
          color: 'var(--paper)', fontFamily: 'var(--serif)',
          fontSize: 16, lineHeight: 1, fontStyle: 'italic',
        }}>M</span>
        <span style={{ fontSize: 17 }}>Mirror</span>
        <span className="mono" style={{
          fontSize: 11, color: 'var(--muted)',
          fontWeight: 400, marginLeft: 4,
        }}>v0.4</span>
      </Link>
    </div>
  );
}
