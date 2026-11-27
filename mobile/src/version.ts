import Constants from 'expo-constants';

export const FALLBACK_VERSION = '1.0.2';
export const FALLBACK_BUILD_CODE = '3';

/** Installed app version & native build code, synced with app.json and build.gradle. */
export function getInstalledAppVersion(): { version: string; buildCode: string } {
  const version = String(Constants.expoConfig?.version || FALLBACK_VERSION);
  const buildCode = String(
    Constants.nativeBuildVersion
    || Constants.expoConfig?.android?.versionCode
    || FALLBACK_BUILD_CODE
  );
  return { version, buildCode };
}

/** True strictly when remote semver (e.g. "1.0.2") is newer than local ("1.0.1"). */
export function isNewerVersion(remote?: string | null, local?: string | null): boolean {
  if (!remote || !local) return false;
  const r = String(remote).trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const l = String(local).trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] || 0) !== (l[i] || 0)) return (r[i] || 0) > (l[i] || 0);
  }
  return false;
}
