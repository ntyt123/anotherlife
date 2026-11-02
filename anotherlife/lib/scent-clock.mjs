// 三处气味计时只消费同一有效步长；世界时钟与其他系统仍保留原始跨度。
export const SCENT_MAX_STEP_HOURS = 24;
export function scentStepHours(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? Math.min(hours, SCENT_MAX_STEP_HOURS) : 0;
}
function ymd(value) {
  const match = String(value || '').match(/(\d{4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
  if (!match) return null;
  const parts = match.slice(1).map(Number), date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() + 1 === parts[1] && date.getUTCDate() === parts[2] ? parts : null;
}
// 成人机制不用于未成年人；年龄不明时也不靠外貌、身份猜测。
export function isAdultScentActor(actor, gameTime) {
  const sex = String(actor?.性别 || '');
  if (!sex.includes('女') || sex.includes('男')) return false;
  const value = actor?.年龄, explicit = value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  if (explicit !== null && explicit < 18) return false;
  const birth = ymd(actor?.生日), now = ymd(gameTime);
  if (birth && now) {
    const years = now[0] - birth[0] - (now[1] < birth[1] || now[1] === birth[1] && now[2] < birth[2] ? 1 : 0);
    return years >= 18;
  }
  return explicit !== null && explicit >= 18;
}
