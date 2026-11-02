// 三处气味计时只消费同一有效步长；世界时钟与其他系统仍保留原始跨度。
export const SCENT_MAX_STEP_HOURS = 24;
export function scentStepHours(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? Math.min(hours, SCENT_MAX_STEP_HOURS) : 0;
}
function ymd(value) {
  const match = String(value || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
  if (!match) return null;
  const parts = match.slice(1).map(Number), date = new Date(Date.UTC(2000, parts[1] - 1, parts[2]))
  date.setUTCFullYear(parts[0]);
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() + 1 === parts[1] && date.getUTCDate() === parts[2] ? parts : null;
}
// 气味机制自 10 岁起适用（阈值 10）；年龄不明时也不靠外貌、身份猜测。
export function isAdultScentActor(actor, gameTime) {
  const sex = String(actor?.性别 || '');
  if (!sex.includes('女') || sex.includes('男')) return false;
  const value = actor?.年龄;
  const numeric = Number(value);
  const ageText = String(value == null ? '' : value).match(/(\d{1,3})\s*岁/);
  const explicit = value !== '' && value != null && Number.isFinite(numeric) ? numeric : (ageText ? Number(ageText[1]) : null);
  // 明确写了年龄就按年龄判断；生日只在没给年龄时兜底，避免与世界年份不符的生日把明确年龄否掉。
  if (explicit !== null) return explicit >= 10;
  const birth = ymd(actor?.生日), now = ymd(gameTime);
  if (birth && now) {
    const years = now[0] - birth[0] - (now[1] < birth[1] || now[1] === birth[1] && now[2] < birth[2] ? 1 : 0);
    return years >= 10;
  }
  return false;
}
