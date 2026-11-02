/**
 * 조특법 §97의3 — **임대기간 분 양도차익 안분**의 양도일 구간 (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 법·시행령 문언이 시기마다 달랐다. KoreanLaw MCP 시행일별 본문 실측(2026-11-02):
 *
 * | 구간 | 양도일 | 근거 문언 | 안분 |
 * |---|---|---|---|
 * | `whole_gain` | ~2020-12-31 | 법 §97의3① 2020-01-01 시행본(MST 212779): 「그 주택(…)을 **양도함으로써 발생하는 소득**에 대해서는」 | 없음 — 양도소득 전체 |
 * | `pre_decree` | 2021-01-01~2021-02-16 | 법 §97의3① 2021-01-01 시행본(MST 224851, 법률 제17759호): 「대통령령으로 정하는 바에 따라 **임대기간 중 발생하는 소득**에 대해서는」 — 위임 시행령(령 ⑤)은 아직 없음 | 현행 산식 준용 (사용자 결정 Q-6) |
 * | `no_formula` | 2021-02-17~2026-02-26 | 령 §97의3⑤ 신설(대통령령 제31444호): 「…임대기간 중 양도차익은 **기준시가를 기준으로 산정한다**」 — 산식 없음. 부칙 §2② 「이 영 시행 이후 양도하는 분부터」 | 현행 산식 준용 |
 * | `formula` | 2026-02-27~ | 령 §97의3⑤ 개정(제36127호, MST 283625): 산식 A × (B − C) / (D − E) 명문화. §97의3 전용 적용례 없음 | 현행 산식 |
 *
 * ⚠️ 조특칙에는 ⑤의 산식을 정한 조문이 없다(조특칙 목차 확인 — §44는 「주택임대기간의 계산」).
 *    그래서 `pre_decree`·`no_formula` 구간의 산식은 **명문화된 산식을 해석으로 준용**한 것이다.
 *    결과 화면은 이 사실을 고지한다.
 *
 * ⚠️ 정상 입력으로는 `whole_gain`·`pre_decree` 구간에 도달하지 않는 것으로 보인다(8년 임대가
 *    성립하려면 개시일이 2012~2013년이어야 한다 — 계획서 V-5). 그래도 법문이 명확하고 비용이
 *    작아 구현한다. 잘못된 입력이 현행 산식으로 조용히 계산되지 않게 하기 위해서다.
 *
 * 계획서: `docs/01-plan/features/rental-97-3-review-fixes.plan.md` §3.2 (#4)
 */

/** 법률 제17759호 시행일 — 이 날부터 「임대기간 중 발생하는 소득」으로 한정된다. */
export const RENTAL_97_3_PRORATION_LAW_FROM = "2021-01-01";

/** 조특령 §97의3⑤ 신설일(대통령령 제31444호) — 「기준시가를 기준으로 산정」. */
export const RENTAL_97_3_PRORATION_DECREE_FROM = "2021-02-17";

/** 조특령 §97의3⑤ 산식 명문화일(대통령령 제36127호). */
export const RENTAL_97_3_PRORATION_FORMULA_FROM = "2026-02-27";

export type Rental973ProrationEra = "whole_gain" | "pre_decree" | "no_formula" | "formula";

/** 양도일의 안분 구간 — 경계는 시행일 당일부터 신규 구간(`>=`). */
export function resolveRental973ProrationEra(transferDate: Date): Rental973ProrationEra {
  if (transferDate < new Date(RENTAL_97_3_PRORATION_LAW_FROM)) return "whole_gain";
  if (transferDate < new Date(RENTAL_97_3_PRORATION_DECREE_FROM)) return "pre_decree";
  if (transferDate < new Date(RENTAL_97_3_PRORATION_FORMULA_FROM)) return "no_formula";
  return "formula";
}

/**
 * 클라이언트(⑧ validate·⑤ UI)용 — YYYY-MM-DD 문자열 비교. 엔진 `resolveRental973ProrationEra`와
 * 같은 경계를 쓴다(단일 소스). 「안분 자체가 없는 구간인가」만 묻는다.
 */
export function isRental973WholeGainEraString(transferDate: string): boolean {
  return !!transferDate && transferDate < RENTAL_97_3_PRORATION_LAW_FROM;
}
