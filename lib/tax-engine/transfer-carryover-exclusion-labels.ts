/**
 * 이월과세 적용배제 사유 — 한국어 라벨과 「비교 시나리오가 실제로 계산됐는가」 술어 (단일 소스).
 *
 * 종전에는 라벨이 결과 카드(`CarryoverComparisonCard`)에만 있어, 엔진의 계산 과정 step(`transfer-tax-precalc.ts`)이
 * 내부 enum(`one_house_exemption` 등)을 그대로 화면·인쇄본에 적었다(G4-6). 엔진이 components를 import하지 않으므로
 * 두 소비자가 이 파일을 읽는다.
 *
 * 법령 근거: 「소득세법」 제97조의2 ① 본문(10년·배우자/직계존비속)·① 괄호(사망·혼인관계 소멸)·② 1~3호·③(연수는 등기부 소유기간)·④(가업상속공제).
 */
import type { CarryoverTaxationDetail } from "./types/transfer-carryover.types";

export type CarryoverExclusionReason = NonNullable<CarryoverTaxationDetail["exclusionReason"]>;

export const CARRYOVER_EXCLUSION_REASON_LABELS = {
  expropriation: "§97조의2 ② 1호 — 사업인정고시일 2년 이전 증여받은 토지·건물의 협의매수·수용",
  one_house_exemption: "§97조의2 ② 2호 — 이월과세 적용 시 1세대1주택 비과세 해당 (고가주택 포함)",
  tax_comparison: "§97조의2 ② 3호 — 비교과세 (시나리오 B 세액이 더 큼)",
  // 적용기간(10년, 종전 5년)은 ① 본문에 있고, ③은 그 연수를 「등기부에 기재된 소유기간」으로 센다고만 정한다 — ③ 단독 인용은 부정확하다.
  period_exceeded: "§97조의2 ① 본문·③ — 적용기간 초과 (등기부 소유기간 기준)",
  // 🔴 **두 사유를 한 값이 나눠 쓴다** — 「사망」만 적으면 O-2로 들어온 「그 외 관계」가 거짓 사유를 본다.
  //    ⓐ 대상 관계가 아님(배우자·직계존비속 외) — ① 본문 요건. 증여자 생존과 무관하다.
  //    ⓑ 증여자 사망 — 본문 **괄호**(「단서」가 아니다). 배우자=사망으로 혼인관계 소멸 / 직계존비속=양도 당시 사망.
  relation_invalid: "§97조의2 ① — 대상 요건 미충족 (배우자·직계존비속이 아니거나, 증여자가 사망)",
  family_business: "§97조의2 ④ — 가업상속공제 적용 자산",
} as const satisfies Record<CarryoverExclusionReason, string>;

/** 사유가 없으면 「없음」 — 종전 step 문구와 같다. */
export function carryoverExclusionReasonLabel(reason: CarryoverExclusionReason | undefined): string {
  return reason ? CARRYOVER_EXCLUSION_REASON_LABELS[reason] : "없음";
}

/**
 * 시나리오 A·B 금액이 **실제로 계산된** detail인가 — 엔진이 `finishScenarios`를 탄 경우다.
 *
 * `judgeCarryoverEligibility`에서 걸러진 배제(수용·기간 초과·관계·가업·레거시 ②2호 선언)는 A·B를 계산하지 않고
 * 빈 시나리오(`makeEmptyScenarioA/B`, 결정세액 0)로 돌아온다. 계산된 경우는 ②3호 비교(사유 없음·`tax_comparison`)와
 * ②2호 **자동 판정**(`oneHouseExclusionSource === "auto"`)뿐이다. 이 값으로 가르지 않으면 카드가 빈 시나리오의 0원을 금액처럼 그린다.
 */
export function carryoverScenariosComputed(
  detail: Pick<CarryoverTaxationDetail, "exclusionReason" | "oneHouseExclusionSource">,
): boolean {
  const reason = detail.exclusionReason;
  if (reason === undefined || reason === "tax_comparison") return true;
  return reason === "one_house_exemption" && detail.oneHouseExclusionSource === "auto";
}

/** ②3호 세액 비교가 **실제로 수행된** detail인가 — 이때만 채택 시나리오가 「더 큰 세액」이다. 배제 사유로 비교 없이 B를 채택한 경우는 아니다. */
export function carryoverComparisonPerformed(
  detail: Pick<CarryoverTaxationDetail, "exclusionReason">,
): boolean {
  return detail.exclusionReason === undefined || detail.exclusionReason === "tax_comparison";
}
