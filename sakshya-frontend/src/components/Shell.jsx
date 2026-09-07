import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronDown,
  Contrast,
  FileCheck2,
  FilePlus2,
  Globe2,
  LayoutDashboard,
  LogOut,
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
  UserRound,
  X,
} from 'lucide-react';
import { BrandMark, OfficialSeal, cn, relativeTime } from './ui';
import { roles } from '../lib/auth';

const primaryNav = [
  { to: '/dashboard', label: 'Command centre', icon: LayoutDashboard, end: true },
  { to: '/dashboard?view=register', label: 'Evidence register', icon: FileCheck2 },
  { to: '/verify', label: 'Chain verifier', icon: ShieldCheck, permission: 'verify' },
  { to: '/demo', label: 'Judge demo mode', icon: Network, demo: true, permission: 'tamper' },
];

const operationsNav = [
  { to: '/upload', label: 'Seal new evidence', icon: FilePlus2, permission: 'upload' },
  { to: '/transfer', label: 'Transfer custody', icon: Send, permission: 'transfer' },
  { to: '/reports', label: 'Forensic reports', icon: BookOpen, permission: 'report' },
  { to: '/vault', label: 'Forensic Vault', icon: FileCheck2, permission: 'vault', allowedRoles: [roles.seniorAuthority, roles.systemAdmin] },
  { to: '/anomalies', label: 'Anomaly centre', icon: ShieldAlert, permission: 'incidents' },
  { to: '/admin', label: 'Authority console', icon: Users, permission: 'admin' },
];

function buildNotifications(documents = []) {
  const alerts = documents.flatMap((document) => {
    const hasIssue = document.status === 'compromised'
      || document.anomalyFlags?.brokenAuditChain
      || document.anomalyFlags?.hashMismatch
      || document.anomalyFlags?.intrusionAttempt;
    if (!hasIssue) return [];
    return [{
      id: `${document.docId}-alert`,
      type: 'alert',
      title: 'Integrity exception',
      detail: `${document.docId} · block ${document.tamperBlockIndex ?? 'review required'}`,
      time: document.lastActivity,
      to: `/document/${encodeURIComponent(document.docId)}`,
    }];
  });

  const verified = documents.flatMap((document) => (document.chain || [])
    .filter((entry) => entry.action === 'VERIFIED')
    .map((entry) => ({
      id: `${document.docId}-${entry.index}-verified`,
      type: 'verified',
      title: 'Chain verification recorded',
      detail: `${document.docId} · ${entry.officer || 'Verification engine'}`,
      time: entry.timestamp,
      to: `/document/${encodeURIComponent(document.docId)}`,
    })));

  return [...alerts, ...verified]
    .filter((item) => item.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 4);
}

function SidebarLink({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => cn('sidebar-link', isActive && 'sidebar-link--active')}>
      <Icon size={17} />
      <span>{item.label}</span>
      {item.demo && <span className="nav-pill">LIVE</span>}
      {item.count > 0 && <span className="nav-count">{item.count}</span>}
    </NavLink>
  );
}

export function Navbar({ theme, onThemeChange, highContrast, onContrastChange, apiOnline, lastSync, apiError, documents = [], user, onLogout, onMenu }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const notifications = useMemo(() => buildNotifications(documents), [documents]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return documents.filter((document) => {
      const officers = (document.chain || []).flatMap((entry) => [entry.officer, entry.badge]).join(' ');
      return `${document.docId} ${document.caseId} ${document.name} ${officers}`.toLowerCase().includes(query);
    }).slice(0, 5);
  }, [documents, searchQuery]);
  const apiBase = import.meta.env.VITE_API_URL || 'Not configured';
  const displayName = user?.name || 'Authenticated operator';
  const displayRole = user?.role || 'Role not returned';
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '—';

  function openRecord(docId) {
    setSearchQuery('');
    navigate(`/document/${encodeURIComponent(docId)}`);
  }

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={onMenu}><Menu size={20} /></button>
        <Link to="/dashboard" className="topbar__brand"><BrandMark small /><span><strong>SAKSHYA</strong><small>Digital evidence integrity platform</small></span></Link>
      </div>
      <div className="topbar__center">
        <div className="global-search">
          <Search size={16} />
          <input aria-label="Search the evidence register" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search evidence, cases, officers…" />
          {searchQuery && <button className="global-search__clear" type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={13} /></button>}
          <span className="search-shortcut">⌘ K</span>
          {searchQuery.trim().length > 1 && <div className="search-results" role="listbox" aria-label="Evidence search results">
            {searchResults.length ? searchResults.map((document) => <button className="search-result" type="button" role="option" key={document.docId} onClick={() => openRecord(document.docId)}><span className="search-result__icon"><FileCheck2 size={14} /></span><span><strong>{document.docId}</strong><small>{document.caseId} · {document.name}</small></span><span className={cn('search-result__status', document.status === 'compromised' && 'search-result__status--bad')}>{document.status}</span></button>) : <div className="search-results__empty"><Search size={14} /><span>No live record matches this search.</span></div>}
          </div>}
        </div>
      </div>
      <div className="topbar__right">
        <div className="sync-wrap">
          <button className="sync-pill" type="button" onClick={() => setSyncOpen((value) => !value)} aria-expanded={syncOpen}>
            <span className={cn('sync-dot', apiOnline && 'sync-dot--online')} />
            {apiOnline ? 'Online · Synced' : 'Offline · API unavailable'}
            <ChevronDown size={13} />
          </button>
          {syncOpen && <div className="popover sync-popover">
            <div className="popover__eyebrow">EVIDENCE NODE STATUS</div>
            <div className="sync-popover__status"><span className={cn('sync-dot', apiOnline && 'sync-dot--online')} /><strong>{apiOnline ? 'Connected to live evidence API' : 'Backend unavailable'}</strong></div>
            <p>{apiOnline ? 'The register is polled every five seconds. All visible records come from the backend.' : apiError || 'Live evidence is not available until the backend reconnects.'}</p>
            <code>API · {apiBase}</code>
            <div className="sync-queue"><span>Last successful sync</span><strong className={!lastSync ? 'sync-queue__muted' : ''}>{lastSync ? relativeTime(lastSync) : 'Not connected'}</strong></div>
          </div>}
        </div>
        <button className="icon-button topbar__icon" type="button" onClick={() => setNotificationsOpen((value) => !value)} aria-label={`Open notifications${notifications.length ? `, ${notifications.length} available` : ''}`} aria-expanded={notificationsOpen}>
          <Bell size={18} />{notifications.length > 0 && <span className="notification-dot" />}
        </button>
        {notificationsOpen && <div className="popover notification-popover">
          <div className="popover__eyebrow">LIVE NOTIFICATIONS <span>{notifications.length} current</span></div>
          {notifications.length ? notifications.map((notification) => <Link to={notification.to} className="notification-item" key={notification.id} onClick={() => setNotificationsOpen(false)}><span className={cn('notification-item__icon', notification.type === 'alert' && 'notification-item__icon--alert')}>{notification.type === 'alert' ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}</span><span><strong>{notification.title}</strong><small>{notification.detail}</small></span><time>{relativeTime(notification.time)}</time></Link>) : <div className="notifications-empty"><ShieldCheck size={17} /><span>No new integrity events from the live register.</span></div>}
          {notifications.length > 0 && <Link to="/anomalies" className="popover__link" onClick={() => setNotificationsOpen(false)}>Open anomaly centre →</Link>}
        </div>}
        <button className={cn('theme-toggle', highContrast && 'theme-toggle--active')} type="button" onClick={onContrastChange} aria-label="Toggle high contrast mode" title="Toggle high contrast mode"><Contrast size={17} /></button>
        <button className="theme-toggle" type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle dark mode">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <div className="profile-wrap">
          <button className={cn('user-menu', profileOpen && 'user-menu--open')} type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-label="Open signed-in profile menu">
            <div className="avatar">{initials}</div><div className="user-menu__copy"><strong>{displayName}</strong><span>{displayRole}</span></div><ChevronDown size={14} />
          </button>
          {profileOpen && <div className="popover profile-popover">
            <div className="profile-popover__heading"><div className="avatar avatar--small">{initials}</div><div><strong>{displayName}</strong><span>{displayRole}</span></div></div>
            <div className="profile-popover__meta"><span>Badge / operator ID</span><code>{user?.badge || 'Not returned'}</code></div>
            <button className="profile-popover__action" type="button" onClick={() => { setProfileOpen(false); onLogout?.(); navigate('/'); }}><LogOut size={15} /><span><strong>Switch account / logout</strong><small>Clear the local session and return to sign-in</small></span></button>
          </div>}
        </div>
      </div>
    </header>
  );
}

function Sidebar({ collapsed, mobileOpen, onCollapse, onClose, documents = [], permissions = {}, user }) {
  const openAlerts = documents.filter((document) => document.status === 'compromised' || document.anomalyFlags?.intrusionAttempt || document.anomalyFlags?.brokenAuditChain || document.anomalyFlags?.hashMismatch).length;
  const canShow = (item) => (!item.permission || permissions[item.permission]) && (!item.allowedRoles || item.allowedRoles.includes(user?.role));
  const nav = operationsNav.filter(canShow).map((item) => item.label === 'Anomaly centre' ? { ...item, count: openAlerts } : item);
  return <aside className={cn('sidebar', collapsed && 'sidebar--collapsed', mobileOpen && 'sidebar--mobile-open')}><div className="sidebar__header"><div className="sidebar__seal"><OfficialSeal compact /><span>Ministry of Home Affairs<br /><strong>Secure Operations</strong></span></div><button className="sidebar-collapse" type="button" onClick={onCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button className="sidebar-close" type="button" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div><nav className="sidebar__nav"><div className="sidebar-section"><span className="sidebar-section__label">Workspace</span>{primaryNav.filter(canShow).map((item) => <SidebarLink item={item} onNavigate={onClose} key={`${item.label}-${item.to}`} />)}</div><div className="sidebar-section"><span className="sidebar-section__label">Operations</span>{nav.map((item) => <SidebarLink item={item} onNavigate={onClose} key={`${item.label}-${item.to}`} />)}</div><div className="sidebar-section sidebar-section--bottom"><span className="sidebar-section__label">System</span><button className="sidebar-link" type="button"><Settings2 size={17} /><span>System settings</span></button><button className="sidebar-link" type="button"><Globe2 size={17} /><span>Language · English</span></button></div></nav><div className="sidebar__footer"><div className="classification-strip"><span className="classification-strip__dot" /><span>RESTRICTED SYSTEM</span></div><div className="sidebar-version">SIH26190 · v0.9.6</div></div></aside>;
}

export function AppFooter() {
  return <footer className="app-footer"><div><BrandMark small /><span>SAKSHYA · Digital Evidence Integrity Platform</span></div><span>Smart India Hackathon 2026 · Problem Statement SIH26190</span><span>Ministry of Home Affairs · Government of India</span></footer>;
}

export function AppShell({ children, theme, onThemeChange, highContrast, onContrastChange, apiOnline, lastSync, apiError, documents = [], user, permissions = {}, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className={cn('app-shell', theme === 'dark' && 'theme-dark', highContrast && 'high-contrast')}><Navbar theme={theme} onThemeChange={onThemeChange} highContrast={highContrast} onContrastChange={onContrastChange} apiOnline={apiOnline} lastSync={lastSync} apiError={apiError} documents={documents} user={user} onLogout={onLogout} onMenu={() => setMobileOpen(true)} /><div className="app-frame"><Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => setCollapsed((value) => !value)} onClose={() => setMobileOpen(false)} documents={documents} permissions={permissions} user={user} />{mobileOpen && <button className="mobile-overlay" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}<main className={cn('main-content', collapsed && 'main-content--wide')}><div className="breadcrumb"><span>SAKSHYA</span><span>/</span><strong><RouteLabel /></strong></div>{children}<AppFooter /></main></div></div>;
}

function RouteLabel() {
  const { pathname } = useLocation();
  const labels = { '/': 'Overview', '/dashboard': 'Command centre', '/upload': 'Seal new evidence', '/transfer': 'Transfer custody', '/verify': 'Chain verifier', '/demo': 'Judge demo mode', '/anomalies': 'Anomaly centre', '/reports': 'Forensic reports', '/vault': 'Forensic Vault', '/admin': 'Authority console' };
  if (labels[pathname]) return labels[pathname];
  if (pathname.startsWith('/document/')) return 'Document custody record';
  return 'Overview';
}
