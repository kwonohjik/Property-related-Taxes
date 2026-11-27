/**
 * 국외전출세(소득세법 §118의9~§118의18) 2027.1.1. 개정 — **출국일 기준 시행 게이트**
 * (확정 공포 개정의 정적 상수. 클라이언트도 직접 import — `utc-date` 외 무의존.)
 *
 * ── 개정 내용 (소득세법 lawId 001565, `efYd=20261231`(종전) ↔ `efYd=20270101`(개정) 실독) ──
 * - §118의9① 대상: 「제94조제1항제3호가목 및 나목」 → 「제94조제1항제3호가목부터 다목까지」
 *   (다목 = 국외주식등 신규 포함)
 * - §118의11: 단일 누진표 → 1호(3호 가·나목, 4호 다·라목: 종전 표) / 2호(3호 다목: 중소기업 10%, 그 밖 20%)
 *
 * ── 부칙 (법률 제21221호, 2025.12.23. 공포 — KoreanLaw MCP `jo="부칙"` 2026-11-27 verbatim) ──
 * > 제1조(시행일) 이 법은 2026년 1월 1일부터 시행한다. 다만, 다음 각 호의 개정규정은 해당 호에서
 * >   정하는 날부터 시행한다. … 2. 제17조제3항 및 제118조의9부터 제118조의18까지: 2027년 1월 1일
 * > 제8조(거주자의 출국 시 납세의무 등에 관한 적용례) 제118조의9부터 제118조의18까지의 개정규정은
 * >   2027년 1월 1일 이후 거주자가 출국하는 경우부터 적용한다.
 * ※ 부칙은 manifest(`verify:legal`)가 검증하지 않는다 — 시행 후 PR-8에서 원문으로 재확인한다.
 *
 * ⇒ 기준은 **출국일**이다. 실제 양도일·증여일·취득일이 아니다.
 *   (교재 사례는 2026.9.1. 출국·실제 양도 2027.3.1.이지만 종전 규정이 적용돼야 한다 —
 *    게이트를 양도일로 걸면 anchor가 깨진다.)
 *
 * ── 사용 규칙 ──
 * ⑧(클라이언트 validate)·⑫(Zod)·엔진·화면이 **같은 술어를 import**한다(`single-source-engine-helper`).
 * 한쪽만 막으면 API 직접 호출로 뚫린다. 날짜는 UTC 달력 기준(`lib/tax-engine/utc-date`) —
 * `new Date(x)`·ISO 문자열 비교 금지.
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §2.1
 */

import { isValid, parseISO } from "@/lib/tax-engine/utc-date";

/** 국외전출세 2027.1.1. 개정 규정 적용 개시일 — 이 날 **이후 출국분**부터(부칙 제1조 2호·제8조). */
export const EXIT_TAX_2027_START = "2027-01-01";

/**
 * 출국일이 2027.1.1. 이후인가 (= 개정 규정이 적용되는 구간).
 *
 * 인자는 **사실(출국일)만** 받는다 — 모드 플래그·시장 종류를 받지 않는다.
 * - `2026-12-31` → false(종전), `2027-01-01` → true.
 * - 시각이 붙은 값은 그 **순간(instant)** 을 UTC 자정 기준으로 비교한다.
 * - 빈 값·파싱 불가·Invalid Date는 **false** — 여기서 막지 않는다. 필수값 누락은 별도 검증의 몫이다.
 */
export function isExitTaxFrom2027(departureDate: Date | string | undefined | null): boolean {
  if (departureDate == null || departureDate === "") return false;
  const d = departureDate instanceof Date ? departureDate : parseISO(departureDate);
  if (!isValid(d)) return false;
  return d.getTime() >= parseISO(EXIT_TAX_2027_START).getTime();
}
