/**
 * 장기임대주택 거주주택 특례 결과 **표시 문구** 단일 소스 (순수 leaf — 클라이언트에서 import 가능).
 *
 * 표시층(엔진 step · 판정 메뉴 근거 · 상세 카드 · 명세서 · 신고서 · PDF)이 문구를 각자 하드코딩하면
 * 엔진 판정(`eligibility.laws`)과 어긋난다(S06-13 · S06-8).
 *
 * - 근거 조문: 판정이 정한 `eligibility.laws`를 그대로 쓴다. §154⑩ 표준 경로(B · 임대주택 0호)는 양도일 현재
 *   장기임대주택이 없어 §155⑳ 본문이 성립하지 않으므로 §154⑩이다(`checkEligibility`가 정한다).
 * - 「소령 §161①」: 소득세법 시행령 §161①의 대상은 「제154조제10항에 따른 1세대 1주택 및 제155조제20항 각 호
 *   외의 부분 후단에 따른 직전거주주택보유주택」뿐이다 → B(RH-B1·B2)에만 붙인다. A(RH-A1·A2)는 §155⑳ 전단 →
 *   §154①이고 12억 초과분은 법 §95③·시행령 §160①2호로 계산한다.
 */
import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";

type RentalHousingScenarioId = "RH-A1" | "RH-A2" | "RH-B1" | "RH-B2";

/** B 시나리오(직전거주주택보유주택 양도 — 시행령 §161 안분 대상) 여부. */
export function isPhrpScenarioId(id: RentalHousingScenarioId | string | undefined): boolean {
  return id === "RH-B1" || id === "RH-B2";
}

/** 판정이 정한 근거 조문(`eligibility.laws[0]`). 없으면 §155⑳. */
export function rentalHousingBasisOf(laws: readonly string[] | undefined): string {
  return laws && laws.length > 0 ? laws[0] : TRANSFER_RENTAL_HOUSING.PIT_RD_155_20;
}

/** 「소득세법 시행령 §154⑩」 → 「§154⑩」 (산식 문구용 짧은 표기). */
export function rentalHousingBasisShort(basis: string): string {
  return basis.replace(/^소득세법 시행령 /, "");
}

/** 비과세 양도소득금액 행 라벨 — 「(소령 §161①)」은 B에만. */
export function nontaxableIncomeLabel(id: RentalHousingScenarioId | string | undefined): string {
  return isPhrpScenarioId(id) ? "비과세 양도소득금액 (소령 §161①)" : "비과세 양도소득금액";
}
