/**
 * 상속세 Step4 공제 체크리스트 — 단일 출처 헬퍼
 *
 * 역할:
 *  - DeductionChecklistKey union 정의 (12항목)
 *  - 자동(AUTO) / 수동(MANUAL) 분류 상수
 *  - 각 key별 종속 FormState 필드 hasValue 판정
 *  - isManualItemActive / isAutoItemVisible 공개 헬퍼
 *
 * 정책:
 *  - autos(Step4Autos) 타입은 이 파일에서 import 금지 (역의존 차단).
 *    autoDetected boolean은 호출측(steps.tsx)이 계산해 전달.
 *  - useEffect → store 미러링 금지. 모든 상태는 파생(visible 계산)으로만.
 *  - 자동 항목 끄기 무효: isAutoItemVisible에서 autoDetected=true면 false 무시.
 *
 * 동기화 지점: ④⑤⑧ (buildInput·UI·validate 공유 헬퍼)
 */

// ────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────

/** 자동 도출 항목 (법정 강행 공제 — 끄기 무효) */
export type AutoChecklistKey = "spouse" | "financial" | "cohabit" | "farming";

/** 순수 수동 항목 (사용자만 아는 정보 — 체크박스 on/off) */
export type ManualChecklistKey =
  | "familyBusiness"
  | "legatee"
  | "priorGiftDeduction"
  | "disasterAdjust"
  | "casualtyLoss"
  | "appraisalFee"
  | "foreignTax"
  | "shortTermReinherit";

export type DeductionChecklistKey = AutoChecklistKey | ManualChecklistKey;

export const AUTO_KEYS: AutoChecklistKey[] = ["spouse", "financial", "cohabit", "farming"];
export const MANUAL_KEYS: ManualChecklistKey[] = [
  "familyBusiness",
  "legatee",
  "priorGiftDeduction",
  "disasterAdjust",
  "casualtyLoss",
  "appraisalFee",
  "foreignTax",
  "shortTermReinherit",
];

// ────────────────────────────────────────────────────
// 최소 FormState 인터페이스 (실제 shared.ts FormState의 부분집합)
// 역의존 없이 타입만 로컬 정의 — import는 호출측에서
// ────────────────────────────────────────────────────

/** 체크리스트 헬퍼에 필요한 FormState 필드만 추출한 구조 */
export interface ChecklistFormSlice {
  // 자동 항목 종속 필드
  spouseActualAmount: string;
  netFinancialAssets: string;
  cohabitHouseStdPrice: string;
  cohabitDirectAmount: string;
  ancillaryLandArea: string;
  buildingFootprintArea: string;
  ancillaryLandRegion: string;
  farmingAssetValue: string;
  farming?: unknown; // FarmingInheritanceInput | undefined
  // 수동 항목 종속 필드
  familyBusinessValue: string;
  familyBusinessYears: string;
  familyBusinessDirectAmount: string;
  familyBusiness?: unknown; // FamilyBusinessInheritanceInput | undefined
  legateeAmountNonHeir: string;
  priorGiftDeductionTotal: string;
  disasterLossDeduction: string;
  casualtyLossEnabled: boolean;
  appraisalRealEstateFee: string;
  appraisalUnlistedFee: string;
  appraisalTangibleFee: string;
  foreignTaxPaid: string;
  foreignInheritanceTaxBase: string;
  shortTermReinheritAssets: { name: string; value: string }[];
  shortTermReinheritPriorDeathDate: string;
  shortTermReinheritTaxPaid: string;
  shortTermReinheritAssetValue: string;
  shortTermReinheritPriorEstateValue: string;
  shortTermReinheritYears: string;
  // 체크리스트 override
  deductionChecklistOverrides: Partial<Record<DeductionChecklistKey, boolean>>;
}

// ────────────────────────────────────────────────────
// hasValue 판정 헬퍼
// ────────────────────────────────────────────────────

function hasStr(s: string): boolean {
  return s.trim() !== "";
}

/**
 * 자동 항목 종속 필드에 값이 하나라도 있는지 판정.
 * (사용자가 직접 값을 입력한 경우 — 자동감지 유무와 무관)
 */
export function autoItemHasValue(form: ChecklistFormSlice, key: AutoChecklistKey): boolean {
  switch (key) {
    case "spouse":
      return hasStr(form.spouseActualAmount);
    case "financial":
      return hasStr(form.netFinancialAssets);
    case "cohabit":
      return (
        hasStr(form.cohabitHouseStdPrice) ||
        hasStr(form.cohabitDirectAmount) ||
        hasStr(form.ancillaryLandArea) ||
        hasStr(form.buildingFootprintArea) ||
        hasStr(form.ancillaryLandRegion)
      );
    case "farming":
      return hasStr(form.farmingAssetValue) || form.farming != null;
  }
}

/**
 * 수동 항목 종속 필드에 값이 하나라도 있는지 판정.
 * hasValue=true이면 체크 해제 시에도 amber 경고 점 표시.
 */
export function manualItemHasValue(form: ChecklistFormSlice, key: ManualChecklistKey): boolean {
  switch (key) {
    case "familyBusiness":
      return (
        hasStr(form.familyBusinessValue) ||
        hasStr(form.familyBusinessYears) ||
        hasStr(form.familyBusinessDirectAmount) ||
        form.familyBusiness != null
      );
    case "legatee":
      return hasStr(form.legateeAmountNonHeir);
    case "priorGiftDeduction":
      return hasStr(form.priorGiftDeductionTotal);
    case "disasterAdjust":
      return hasStr(form.disasterLossDeduction);
    case "casualtyLoss":
      // casualtyLoss는 토글(casualtyLossEnabled)이 단일 진실
      return form.casualtyLossEnabled === true;
    case "appraisalFee":
      return (
        hasStr(form.appraisalRealEstateFee) ||
        hasStr(form.appraisalUnlistedFee) ||
        hasStr(form.appraisalTangibleFee)
      );
    case "foreignTax":
      return hasStr(form.foreignTaxPaid) || hasStr(form.foreignInheritanceTaxBase);
    case "shortTermReinherit":
      return (
        (form.shortTermReinheritAssets?.length ?? 0) > 0 ||
        hasStr(form.shortTermReinheritPriorDeathDate) ||
        hasStr(form.shortTermReinheritTaxPaid) ||
        hasStr(form.shortTermReinheritAssetValue) ||
        hasStr(form.shortTermReinheritPriorEstateValue) ||
        hasStr(form.shortTermReinheritYears)
      );
  }
}

// ────────────────────────────────────────────────────
// 노출/활성 판정 공개 헬퍼
// ────────────────────────────────────────────────────

/**
 * 자동 항목 노출 여부.
 *
 * visible = autoDetected || autoItemHasValue || overrides[key] === true
 *
 * ★ autoDetected=true이면 overrides[key]=false를 무시 (법정 강행 공제 누락 방지).
 * ★ useEffect → store 미러링 없음. 렌더 시마다 순수 파생 계산.
 */
export function isAutoItemVisible(
  form: ChecklistFormSlice,
  key: AutoChecklistKey,
  autoDetected: boolean,
): boolean {
  if (autoDetected) return true; // 감지됨 → 항상 노출 (끄기 무효)
  if (autoItemHasValue(form, key)) return true;
  return form.deductionChecklistOverrides[key] === true;
}

/**
 * 수동 항목 활성(노출+계산 포함) 여부.
 *
 * - casualtyLoss: form.casualtyLossEnabled 단일 진실 (override 사용 안 함)
 * - 나머지: overrides[key] ?? manualItemHasValue(form, key)
 *
 * ④ buildInput·⑧ validate에서도 동일 함수 사용하여 3중 동기화.
 */
export function isManualItemActive(form: ChecklistFormSlice, key: ManualChecklistKey): boolean {
  if (key === "casualtyLoss") {
    // CasualtyLossSection 자체 ToggleCard(casualtyLossEnabled)가 단일 진실
    return form.casualtyLossEnabled === true;
  }
  const override = form.deductionChecklistOverrides[key];
  if (override !== undefined) return override;
  return manualItemHasValue(form, key);
}
