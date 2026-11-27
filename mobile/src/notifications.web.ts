/** Web has no local notification alarms — reminder alarms are native-only. */
export async function setupNotifications() {}
export function getScheduleError(): string { return ''; }
export function getCachedReminders(): any[] { return []; }
export async function canScheduleExactAlarms(): Promise<boolean> { return false; }
export async function requestExactAlarms(): Promise<boolean> { return false; }
export async function checkNotifications() {
  return { ok: false, status: 'unavailable', reason: 'Native notifications are not available in a browser' };
}
export async function ensureNotifications(): Promise<boolean> { return false; }
export async function scheduleReminder(_r: any) {}
export async function syncReminders(_list: any[]): Promise<boolean> { return false; }
export async function scheduledReminderCount(): Promise<number> { return 0; }
export async function testNotification(): Promise<boolean> { return false; }
export async function notifyNow(_title?: string): Promise<boolean> { return false; }
export async function checkDueReminders(_list: any[]): Promise<number[]> { return []; }
export function parseTimeOfDay(_raw: any): { hour: number; minute: number } | null { return null; }
export async function cancelReminderIds(_ids: number[]) {}
