const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

/**
 * Resolves relative `/api/...` paths.
 * Uses `VITE_API_BASE_URL` when packaged inside a static Android APK / WebView wrapper
 * that loads local assets instead of the Node Express host.
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return RAW_BASE ? `${RAW_BASE}${cleanPath}` : cleanPath;
}
