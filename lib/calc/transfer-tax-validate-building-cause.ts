/**
 * ⑧ 건물 상속·증여 + 토지 매매(D2) — 자산 취득 검증 분기.
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 · 엔진 설계 `transfer-acq-cause-mixed-d2.engine.design.md` §4 · UI 설계 §5.1
 *
 * ## 왜 별도 분기인가
 * 자산 단위 상속 규칙(`sec164PartialInputError`·E-1 `clauseADeclarationError`·PD-1·`postDeemedClauseARequiredError`)은
 * 「상속개시일 평가액(상속세 신고가액)」 또는 §164④~⑦ 가액을 **자산 단위**로 요구한다. D2에서 건물 평가액은 건물 파트
 * 취득가액 칸(`buildingAcquisitionPrice`)이 정본이고 ④는 자산 단위 평가 payload를 싣지 않는다(V-11) — 그대로 두면
 * 입력할 칸이 화면에 없는 요구에 막힌다(막다른 길). 이 분기가 그 규칙들보다 **앞**에서 갈라 `validateSplitDirectInputs`로
 * 보낸다(신축 분기가 같은 함수로 끝나는 모양과 같다).
 *
 * 순서 = 칸 순서: 건물 취득일 → 피상속인 취득일(상속) → 동일세대 시작일(§154⑧3호 통산을 켠 경우) → 분리 검증 전체
 * (첫 줄 `validateLandPartCause` = 엔진·⑫와 같은 leaf: 구조 규칙·토지 취득일·건물 경계일·Q-4 같은 날).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";
import { validateSplitDirectInputs } from "./transfer-tax-validate-split";

export function validateBuildingCauseSplit(asset: AssetForm, label: string): string | null {
  const isInheritance = asset.acquisitionCause === "inheritance";
  const dayLabel = isInheritance ? "상속개시일" : "증여일";
  if (!asset.acquisitionDate) return fieldError("acquisitionDate", `${label}: 건물 ${dayLabel}을 입력하세요.`);
  if (isInheritance) {
    // 건물 §104②1호 통산의 기산일 — ⑫가 자산 단위로 이미 필수(「상속의 경우 피상속인 취득일이 필수입니다」).
    if (!asset.decedentAcquisitionDate)
      return fieldError("decedentAcquisitionDate", `${label}: 피상속인 취득일을 입력하세요.`);
    // 영 §154⑧3호(건물만 상속에도 적용 — 계획서 §12 D2-Q3): 동일세대 통산을 켰으면 시작일 필수(자산 단위 상속 분기의 같은 규칙).
    if (asset.assetKind === "housing" && asset.decedentSameHouseholdBeforeInheritance && !asset.decedentCohabitationHoldingStartDate)
      return fieldError(
        "decedentCohabitationHoldingStartDate",
        `${label}: 동일세대 상속이면 동일세대 거주·보유 개시일을 입력하세요. (§154⑧3호 통산)`,
      );
  }
  return validateSplitDirectInputs(asset, label);
}
