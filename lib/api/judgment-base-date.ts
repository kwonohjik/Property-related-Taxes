/**
 * 판정 기준일(조회일) — **한국 날짜**를 엔진 날짜 형식(UTC 자정)으로 돌려준다 (2026-09-29).
 *
 * 1세대1주택 판정 메뉴가 「이 날까지 양도하면 비과세」를 안내할 때, 그 날이 **오늘 이미 지났으면**
 * 이룰 수 없는 조건이다. 엔진은 순수 함수라 「오늘」을 스스로 읽지 않으므로 route가 이 값을 만든다.
 *
 * 🔑 서버는 UTC로 돈다 — `new Date()`의 UTC 날짜를 그대로 쓰면 한국 00:00~08:59에 **하루 전날**이
 *    된다. 한국은 일광절약시간이 없으므로 +9시간 고정 오프셋이 정확하다.
 * 🔑 엔진 날짜는 date-only ISO를 파싱한 **UTC 자정**이다(`lib/api/date-coerce.ts`). 같은 형식으로
 *    맞춰야 `civil-period.ts`의 일(day) 비교가 어긋나지 않는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function resolveJudgmentBaseDate(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}
