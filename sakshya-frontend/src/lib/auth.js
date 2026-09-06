const SESSION_STORAGE_KEY = 'sakshya.auth.session.v1';

export const roles = {
  investigatingOfficer: 'Investigating Officer',
  forensicAnalyst: 'Forensic Analyst',
  seniorAuthority: 'Senior Authority',
  courtViewer: 'Court Viewer',
  systemAdmin: 'System Admin',
};

export const rolePermissions = {
  [roles.investigatingOfficer]: {
    upload: true,
    view: true,
    action: true,
    transfer: true,
  },
  [roles.forensicAnalyst]: {
    view: true,
    verify: true,
    report: true,
  },
  [roles.seniorAuthority]: {
    view: true,
    action: true,
    transfer: true,
    tamper: true,
    report: true,
    incidents: true,
  },
  [roles.courtViewer]: {
    view: true,
    verify: true,
    report: true,
  },
  [roles.systemAdmin]: {
    view: true,
    admin: true,
  },
};

export function permissionsFor(role) {
  return rolePermissions[role] || {};
}

export function hasPermission(roleOrUser, permission) {
  const role = typeof roleOrUser === 'string' ? roleOrUser : roleOrUser?.role;
  return Boolean(permissionsFor(role)[permission]);
}

export function readAuthSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token) return null;
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
      clearAuthSession();
      return null;
    }
    return session;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession(payload) {
  const session = {
    token: payload?.token,
    tokenType: payload?.tokenType || 'Bearer',
    expiresAt: payload?.expiresAt || null,
    user: payload?.user || null,
  };
  if (!session.token) throw new Error('The authentication service did not return a session token.');
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in a restricted browser context.
  }
}

export function authToken() {
  return readAuthSession()?.token || '';
}

export function sessionUser() {
  return readAuthSession()?.user || null;
}
