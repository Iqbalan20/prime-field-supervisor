const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);
const authKey = 'pfs-supabase-session';

function headers(token?: string) {
  return {
    apikey: anonKey || '',
    Authorization: `Bearer ${token || anonKey || ''}`,
    'Content-Type': 'application/json',
  };
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabaseConfigured) throw new Error('Supabase environment variables are missing.');
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.msg || body.message || 'Unable to sign in.');
  const withExpiry = { ...body, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
  localStorage.setItem(authKey, JSON.stringify(withExpiry));
  return withExpiry;
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(authKey) || 'null'); } catch { return null; }
}
export function signOut() { localStorage.removeItem(authKey); }

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.msg || 'Session expired. Please log in again.');
  const withExpiry = { ...body, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
  localStorage.setItem(authKey, JSON.stringify(withExpiry));
  return withExpiry;
}

/**
 * Returns a session with a still-valid access token, transparently
 * refreshing it first if it's expired or about to expire. Supabase
 * access tokens are short-lived (typically 1 hour) — without this, a
 * supervisor mid-shift would silently stop syncing to the backend once
 * their token expired, with writes quietly falling back to local-only.
 */
async function ensureFreshSession() {
  const session = getSession();
  if (!session?.access_token) return null;
  const bufferMs = 60_000;
  if (session.expires_at && Date.now() < session.expires_at - bufferMs) return session;
  if (!session.refresh_token) return session; // let the request fail naturally and surface the error
  try {
    return await refreshAccessToken(session.refresh_token);
  } catch {
    signOut();
    return null;
  }
}

/**
 * Creates a new Auth user via Supabase's public signup endpoint (uses the
 * anon key only — NOT the admin API, so this never needs the service role
 * key in the browser). Does not touch the currently stored session, so
 * the logged-in admin stays logged in as themselves.
 *
 * IMPORTANT: this only works end-to-end if "Confirm email" is turned OFF
 * in Supabase (Authentication -> Providers -> Email), since supervisor
 * accounts use synthetic @primefield.local addresses that can never
 * receive or click a real confirmation link.
 */
export async function createAuthAccount(email: string, password: string, metadata: Record<string, any> = {}) {
  if (!supabaseConfigured) throw new Error('Supabase environment variables are missing.');
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.msg || body.message || 'Unable to create account.');
  // Supabase returns identities: [] (with 200 OK) when the email already exists,
  // to avoid leaking which emails are registered.
  if (Array.isArray(body.identities) && body.identities.length === 0 && !body.access_token) {
    throw new Error('An account for this email/Employee ID may already exist.');
  }
  const confirmed = Boolean(body.access_token) || Boolean(body.user?.confirmed_at) || Boolean(body.user?.email_confirmed_at);
  return { confirmed };
}

async function rest(path: string, options: RequestInit = {}) {
  const session = await ensureFreshSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers(session.access_token), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Supabase request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const ENTITIES = ['sites','supervisors','employees','visits','attendance','incidents','tasks','reports','notifications','requirements','labour','supervisorAttendance'];

function ownerKeyForRecord(entity: string, record: any, data: any) {
  if (entity === 'supervisors') return record.empId || null;
  const supervisorId = record.supervisorId || null;
  if (!supervisorId) return null;
  return data?.supervisors?.find((s: any) => s.id === supervisorId)?.empId || supervisorId;
}

export async function loadRemoteData(seed: any, isManagement: boolean) {
  if (!supabaseConfigured) return null;
  try {
    const rows = await rest('pfs_records?select=entity,record,record_id,owner_key');
    if (!rows?.length) {
      await saveRemoteData(seed, true);
      return seed;
    }
    const data: any = {};
    for (const e of ENTITIES) data[e] = [];
    for (const row of rows) {
      if (!data[row.entity]) data[row.entity] = [];
      data[row.entity].push(row.record);
    }
    // A supervisor should always have their own supervisor profile and assigned sites/employees.
    if (!isManagement) {
      const email = (getSession()?.user?.email || '').toLowerCase();
      const empId = email.endsWith('@primefield.local') ? email.split('@')[0].toUpperCase() : '';
      data.supervisors = data.supervisors.filter((s: any) => s.empId?.toUpperCase() === empId);
      const sup = data.supervisors[0];
      if (!sup) return null;
    }
    return { ...seed, ...data };
  } catch (e) {
    console.warn('Supabase load failed; falling back to local cache.', e);
    return null;
  }
}

export async function saveRemoteData(data: any, forceAll = false) {
  if (!supabaseConfigured) return;
  const payload: any[] = [];
  for (const entity of ENTITIES) {
    for (const record of data?.[entity] || []) {
      if (!record?.id && !record?.supervisorId) continue;
      payload.push({
        entity,
        record_id: record.id || `${entity}-${record.supervisorId}`,
        owner_key: ownerKeyForRecord(entity, record, data),
        record,
      });
    }
  }
  if (!payload.length) return;
  await rest('pfs_records?on_conflict=entity,record_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function uploadSelfie(path: string, base64: string) {
  if (!supabaseConfigured) return null;
  const session = await ensureFreshSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const binary = atob(base64.split(',')[1] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const res = await fetch(`${url}/storage/v1/object/pfs-selfies/${path}`, {
    method: 'POST', headers: { apikey: anonKey || '', Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(await res.text());
  return `${url}/storage/v1/object/public/pfs-selfies/${path}`;
}
