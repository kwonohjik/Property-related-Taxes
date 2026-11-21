/**
 * ISO 시각 문자열(UTC, `new Date().toISOString()`) → 한국 시간 기준 달력 날짜 `YYYY-MM-DD`.
 *
 * 이력 record의 `updatedAt`은 UTC라 `slice(0, 10)`으로 자르면 한국 시간 00:00~08:59에 저장한 기록이
 * 하루 전 날짜로 보인다(R-c07-06). 표시 전용 — 세액 계산 날짜에는 쓰지 않는다(엔진은 `lib/tax-engine/utc-date`).
 * 해석할 수 없는 값은 종전처럼 앞 10자를 그대로 돌려준다.
 */
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function kstDateOfIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso.slice(0, 10) : KST_DATE.format(ms);
}
