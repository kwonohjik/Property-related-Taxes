/**
 * gift-credit-checklist.ts — 증여세 Step4(공제·세액공제) 칩 체크리스트 메타·게이트
 *
 * 비과세 Step3(ExemptionChecklist) / 상속세 Step4(inheritance-deduction-checklist.ts)와
 * 동일한 "칩 선택 → 해당 입력만 펼침" 패턴. Step4의 긴 스크롤을 컴팩트화.
 *
 * 의존 방향: full FormState가 아닌 narrow GiftCreditFormSlice만 받는다
 * (상속세 ChecklistFormSlice 패턴 — lib→component 역참조 회피).
 *
 * C1(계획서): active 판정은 validation trigger 필드(specialTreatment·
 * priorUsedMarriageBirthDeduction·splitPaymentEnabled 등)를 모두 포함해야
 * "안 보이는 입력으로 차단" 모순이 없다 → creditItemHasValue가 이를 보장.
 */

export type GiftCreditKey =
  | "marriageBirth"
  | "priorUsed"
  | "appraisalFee"
  | "foreignTax"
  | "specialTreatment"
  | "splitPayment";

/** 공제 그룹(sky) / 세액공제·특례·납부 그룹(violet) */
export type GiftCreditGroup = "deduction" | "credit_special";

export interface GiftCreditItemMeta {
  key: GiftCreditKey;
  group: GiftCreditGroup;
  label: string;
}

export const GIFT_CREDIT_ITEMS: GiftCreditItemMeta[] = [
  { key: "marriageBirth", group: "deduction", label: "혼인·출산 공제 (§53의2)" },
  { key: "priorUsed", group: "deduction", label: "10년 내 기사용 공제" },
  { key: "appraisalFee", group: "deduction", label: "감정평가수수료 (§55①)" },
  { key: "foreignTax", group: "credit_special", label: "외국납부세액 (§59)" },
  { key: "specialTreatment", group: "credit_special", label: "조특법 과세특례 (§30의5·6)" },
  { key: "splitPayment", group: "credit_special", label: "분납 신청 (§70②)" },
];

/** Step4 칩 게이트에 필요한 최소 폼 슬라이스 (full FormState 미참조) */
export interface GiftCreditFormSlice {
  donorRelation: string;
  marriageExemption: string;
  birthExemption: string;
  priorUsedMarriageBirthDeduction: string;
  priorUsedDeduction: string;
  appraisalRealEstateFee: string;
  appraisalUnlistedFee: string;
  appraisalTangibleFee: string;
  foreignTaxPaid: string;
  specialTreatment: string;
  splitPaymentEnabled: boolean;
}

const hasText = (v: string | undefined): boolean => (v ?? "").trim() !== "";

/** 직계존속 공여자 — 혼인·출산 공제 칩 노출 조건 (§53의2) */
export function isLinealAscendantDonor(slice: GiftCreditFormSlice): boolean {
  return (
    slice.donorRelation === "lineal_ascendant_adult" ||
    slice.donorRelation === "lineal_ascendant_minor"
  );
}

/**
 * 해당 항목에 값/선택이 있어 항상 노출되어야 하는가.
 * validation trigger 필드 포함(C1): specialTreatment·priorUsedMarriageBirthDeduction·splitPaymentEnabled.
 */
export function creditItemHasValue(
  slice: GiftCreditFormSlice,
  key: GiftCreditKey,
): boolean {
  switch (key) {
    case "marriageBirth":
      return (
        hasText(slice.marriageExemption) ||
        hasText(slice.birthExemption) ||
        hasText(slice.priorUsedMarriageBirthDeduction)
      );
    case "priorUsed":
      return hasText(slice.priorUsedDeduction);
    case "appraisalFee":
      return (
        hasText(slice.appraisalRealEstateFee) ||
        hasText(slice.appraisalUnlistedFee) ||
        hasText(slice.appraisalTangibleFee)
      );
    case "foreignTax":
      return hasText(slice.foreignTaxPaid);
    case "specialTreatment":
      return slice.specialTreatment !== "";
    case "splitPayment":
      return slice.splitPaymentEnabled === true;
  }
}

/** 칩 항목 활성(입력 블록 노출) = 수동 펼침 OR 값/선택 있음 */
export function isCreditItemActive(
  slice: GiftCreditFormSlice,
  key: GiftCreditKey,
  manuallyOpen: ReadonlySet<GiftCreditKey>,
): boolean {
  return manuallyOpen.has(key) || creditItemHasValue(slice, key);
}

/** 노출할 칩 목록 — 혼인·출산은 직계존속 공여자만 */
export function visibleCreditItems(
  slice: GiftCreditFormSlice,
): GiftCreditItemMeta[] {
  return GIFT_CREDIT_ITEMS.filter(
    (it) => it.key !== "marriageBirth" || isLinealAscendantDonor(slice),
  );
}
