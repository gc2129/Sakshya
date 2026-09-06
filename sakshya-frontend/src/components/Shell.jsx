import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronDown,
  Contrast,
  FileCheck2,
  FilePlus2,
  Globe2,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { BrandMark, OfficialSeal, cn } from './ui';

const primaryNav = [
  { to: '/dashboard', label: 'Command centre', icon: LayoutDashboard },
  { to: '/dashboard', label: 'Evidence register', icon: FileCheck2 },
  { to: '/verify', label: 'Chain verifier', icon: ShieldCheck },
  { to: '/demo', label: 'Judge demo mode', icon: Network, demo: true },
];

const operationsNav = [
  { to: '/upload', label: 'Seal new evidence', icon: FilePlus2 },
  { to: '/transfer', label: 'Transfer custody', icon: Send },
  { to: '/reports', label: 'Forensic reports', icon: BookOpen },
  { to: '/anomalies', label: 'Anomaly centre', icon: ShieldAlert, count: 2 },
  { to: '/admin', label: 'Authority console', icon: Users },
];

function SidebarLink({ item, onNavigate }) {
  const Icon = item.icon;
  return <NavLink to={item.to} onClick={onNavigate} className={({ isActive }) => cn('sidebar-link', isActive && 'sidebar-link--active')}><Icon size={17} /><span>{item.label}</span>{item.demo && <span className="nav-pill">LIVE</span>}{item.count && <span className="nav-count">{item.count}</span>}</NavLink>;
}

export function Navbar({ theme, onThemeChange, highContrast, onContrastChange, apiOnline, onMenu }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return <header className="topbar">
    <div className="topbar__left"><button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={onMenu}><Menu size={20} /></button><Link to="/dashboard" className="topbar__brand"><BrandMark small /><span><strong>SAKSHYA</strong><small>Evidence custody grid</small></span></Link></div>
    <div className="topbar__center"><div className="global-search"><Search size={16} /><input aria-label="Search the evidence register" placeholder="Search documents, cases, officers…" /><span className="search-shortcut">⌘ K</span></div></div>
    <div className="topbar__right"><div className="sync-wrap"><button className="sync-pill" type="button" onClick={() => setSyncOpen((value) => !value)}><span className={cn('sync-dot', apiOnline && 'sync-dot--online')} />{apiOnline ? 'Online · Synced' : 'Demo dataset'}<ChevronDown size={13} /></button>{syncOpen && <div className="popover sync-popover"><div className="popover__eyebrow">LOCAL NODE STATUS</div><div className="sync-popover__status"><span className="sync-dot sync-dot--online" /><strong>{apiOnline ? 'Connected to evidence API' : 'Running in presentation mode'}</strong></div><p>{apiOnline ? 'Latest custody records are being polled every 5 seconds.' : 'Backend connection is optional. Interactions remain available with seeded records.'}</p><code>API · {import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}</code><div className="sync-queue"><span>Last sync</span><strong>Just now</strong></div></div>}</div><button className="icon-button topbar__icon" type="button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Open notifications"><Bell size={18} /><span className="notification-dot" /></button>{notificationsOpen && <div className="popover notification-popover"><div className="popover__eyebrow">NOTIFICATIONS <span>2 unread</span></div><div className="notification-item notification-item--alert"><ShieldAlert size={16} /><div><strong>Integrity anomaly</strong><span>DOC-2026-00172 · Block 3</span></div><time>9m</time></div><div className="notification-item"><ShieldCheck size={16} /><div><strong>Chain verified</strong><span>DOC-2026-00217 · Court bundle</span></div><time>14m</time></div><Link to="/anomalies" className="popover__link" onClick={() => setNotificationsOpen(false)}>Open anomaly centre →</Link></div>}<button className={cn('theme-toggle', highContrast && 'theme-toggle--active')} type="button" onClick={onContrastChange} aria-label="Toggle high contrast mode" title="Toggle high contrast mode"><Contrast size={17} /></button><button className="theme-toggle" type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle dark mode">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><div className="user-menu"><div className="avatar">RM</div><div className="user-menu__copy"><strong>Rajiv Menon</strong><span>Senior Authority</span></div><ChevronDown size={14} /></div></div>
  </header>;
}

function Sidebar({ collapsed, mobileOpen, onCollapse, onClose }) {
  return <aside className={cn('sidebar', collapsed && 'sidebar--collapsed', mobileOpen && 'sidebar--mobile-open')}><div className="sidebar__header"><div className="sidebar__seal"><OfficialSeal compact /><span>Ministry of Home Affairs<br /><strong>Secure Operations</strong></span></div><button className="sidebar-collapse" type="button" onClick={onCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button className="sidebar-close" type="button" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div><nav className="sidebar__nav"><div className="sidebar-section"><span className="sidebar-section__label">Workspace</span>{primaryNav.map((item) => <SidebarLink item={item} onNavigate={onClose} key={`${item.label}-${item.to}`} />)}</div><div className="sidebar-section"><span className="sidebar-section__label">Operations</span>{operationsNav.map((item) => <SidebarLink item={item} onNavigate={onClose} key={`${item.label}-${item.to}`} />)}</div><div className="sidebar-section sidebar-section--bottom"><span className="sidebar-section__label">System</span><button className="sidebar-link" type="button"><Settings2 size={17} /><span>System settings</span></button><button className="sidebar-link" type="button"><Globe2 size={17} /><span>Language · English</span></button></div></nav><div className="sidebar__footer"><div className="classification-strip"><span className="classification-strip__dot" /><span>RESTRICTED SYSTEM</span></div><div className="sidebar-version">SIH26190 · v0.9.6</div></div></aside>;
}

export function AppFooter() {
  return <footer className="app-footer"><div><BrandMark small /><span>SAKSHYA · Secure Evidence Custody Grid</span></div><span>Smart India Hackathon 2026 · Problem Statement SIH26190</span><span>Ministry of Home Affairs · Government of India</span></footer>;
}

export function AppShell({ children, theme, onThemeChange, highContrast, onContrastChange, apiOnline }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className={cn('app-shell', theme === 'dark' && 'theme-dark', highContrast && 'high-contrast')}><Navbar theme={theme} onThemeChange={onThemeChange} highContrast={highContrast} onContrastChange={onContrastChange} apiOnline={apiOnline} onMenu={() => setMobileOpen(true)} /><div className="app-frame"><Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => setCollapsed((value) => !value)} onClose={() => setMobileOpen(false)} />{mobileOpen && <button className="mobile-overlay" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}<main className={cn('main-content', collapsed && 'main-content--wide')}><div className="breadcrumb"><span>SAKSHYA</span><span>/</span><strong><RouteLabel /></strong></div>{children}<AppFooter /></main></div></div>;
}

function RouteLabel() {
  const { pathname } = useLocation();
  const labels = { '/': 'Overview', '/dashboard': 'Command centre', '/upload': 'Seal new evidence', '/transfer': 'Transfer custody', '/verify': 'Chain verifier', '/demo': 'Judge demo mode', '/anomalies': 'Anomaly centre', '/reports': 'Forensic reports', '/admin': 'Authority console' };
  if (labels[pathname]) return labels[pathname];
  if (pathname.startsWith('/document/')) return 'Document custody record';
  return 'Overview';
}
