import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  {
    to: '/', label: 'Home',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l6-4.5L14 6v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" /><path d="M6 14.5V8h4v6.5" /></svg>,
  },
  {
    to: '/shows', label: 'Shows',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg>,
  },
  {
    to: '/pipeline', label: 'Pipeline',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13" /></svg>,
  },
  {
    to: '/render', label: 'Render',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2" /><rect x="5" y="5" width="6" height="6" rx="1" /></svg>,
  },
  {
    to: '/assets', label: 'Assets',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" /></svg>,
  },
  {
    to: '/costs', label: 'Costs',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="2" x2="8" y2="14" /><path d="M11 4.5H6.5a2 2 0 000 4h3a2 2 0 010 4H5" /></svg>,
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h1>DEAD AIR</h1>
          <span>Pipeline Dashboard</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
