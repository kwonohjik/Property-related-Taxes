/**
 * 「오늘」 단일 소스 — 한국 표준시(KST) 달력일.
 *
 * 🔴 **이 파일은 Node 전용 import 를 가져서는 안 된다.** date-parser 를 거쳐
 *    클라이언트 컴포넌트(DecisionSearchTab)까지 번들되기 때문이다.
 *    실제로 client-core(파일 캐시 때문에 `fs/promises` 를 import)에 두었다가
 *    `/law` 페이지가 통째로 컴파일 실패했다 —
 *    `Module not found: Can't resolve 'fs/promises'` (2026-09-11 CI 실측).
 *    typecheck·vitest 는 번들링을 하지 않아 잡지 못하고, E2E 가 24분 헛돌다 타임아웃으로 드러났다.
 *
 * 🔴 종전엔 「오늘」이 세 벌이었고 서로 달랐다:
 *    applicable-law.todayYmd()   — getUTC*  → 항상 UTC
 *    time-travel.todayYmdLocal() — 이름은 Local 인데 내용은 UTC (중복 정의)
 *    date-parser.today()         — get*()   → 실행 환경 TZ
 *    applicable-law 주석은 "date-parser 와 동일 기준"이라 적었지만 사실이 아니다
 *    (실측: 2026-09-10 08:00 KST 에 전자 20260909 / 후자 20260910).
 *
 * 이 앱은 한국 세법 전용이고 기준일·시행일 판정은 **한국 달력**이어야 한다.
 * 대한민국은 서머타임이 없어 고정 +9h 로 충분하다.
 */

/** KST 기준 오늘 자정을 가리키는 Date (UTC 자정으로 표현 — 날짜 산술 전용). */
export function todayKstDate(): Date {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** KST 기준 오늘 YYYYMMDD. */
export function todayYmdKst(): string {
  const d = todayKstDate();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
