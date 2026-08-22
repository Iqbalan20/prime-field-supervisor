import { loadRemoteData, saveRemoteData, supabaseConfigured } from './supabase';

type StorageResult = { key: string; value: string } | null;
let remoteDataCache: any = null;

export const storage = {
  async get(key: string): Promise<StorageResult> {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? null : { key, value };
    } catch { return null; }
  },
  async set(key: string, value: string): Promise<StorageResult> {
    try { window.localStorage.setItem(key, value); } catch {}
    if (supabaseConfigured) {
      try { remoteDataCache = JSON.parse(value); await saveRemoteData(remoteDataCache); } catch (e) { console.warn(e); }
    }
    return { key, value };
  },
  async delete(key: string) { try { window.localStorage.removeItem(key); return {key, deleted:true}; } catch { return null; } },
  async list(prefix = '') { try { const keys=[] as string[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix))keys.push(k);} return {keys}; } catch { return null; } },
};

export { loadRemoteData };
