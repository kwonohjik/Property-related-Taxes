/**
 * deduction-besshi-data — 상속세 3개 서식(부표3·별지5호·별지1호) 데이터 어댑터
 *
 * 단일 게이트웨이: result(+debtItems·estateItems·familyBusinessInput)만 읽어 양식 칸 값 도출.
 * 자체 산식 0, 집계·분류·도출만. 화면·PDF가 본 결과만 소비(재계산 0, dual-truth 0).
 *
 * 계획: docs/00-pm/inheritance-deduction-besshi-forms.plan.md
 * 설계: docs/02-design/features/inheritance-deduction-besshi-forms.engine.design.md
 */

import type {
  InheritanceTaxResult,
  DebtItem,
  DebtCategory,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  FamilyBusinessInheritanceInput,
  FamilyBusinessCategory,
} from "@/lib/tax-engine/types/inheritance-family-business.types";

// ── 코드 매핑 (Record<EnumType,…> — enum 추가 시 컴파일러 누락 catch) ──
export const DEBT_CATEGORY_LABEL: Record<DebtCategory, string> = {
  financial: "금융채무",
  tax: "공과금",
  personal: "개인사채",
  funeral: "장례비",
};

export const FAMILY_BUSINESS_CATEGORY_LABEL: Record<FamilyBusinessCategory, string> = {
  business_real_estate: "가업용 부동산",
  business_equipment: "기계장치·설비",
  corporate_stock: "법인 주식",
  intangible_asset: "무형자산",
  inventory: "재고자산",
  other: "기타",
};

/** 부표3 나.공과금 종류코드 (KoreanLaw 작성방법 §3 — 표시 전용; 소스 미수집) */
export const UTILITY_TYPE_CODE_LABEL = [
  { code: "01", label: "국세" },
  { code: "02", label: "지방세" },
  { code: "03", label: "공공요금" },
  { code: "04", label: "과태료/범칙금" },
  { code: "05", label: "회비" },
  { code: "06", label: "기타" },
] as const;

/** financialDeductionDetail.rows 금융채무 라벨 단일출처 (inheritance-tax.ts:457). 엔진 label 변경 시 동기화 */
export const FINANCIAL_DEBT_ROW_LABEL = "금융채무";
function isDebtLabel(label: string): boolean {
  return label === FINANCIAL_DEBT_ROW_LABEL;
}

const sumAmount = (rows: { amount: number }[]): number =>
  rows.reduce((acc, r) => acc + r.amount, 0);

// ============================================================
// 서식 A — 별지 제9호서식 부표 3
// ============================================================

export interface Buppyo3DebtRow {
  kindLabel: string; // ① name 우선 || DEBT_CATEGORY_LABEL
  incurredDate?: string; // ② 발생연월일
  endDate?: string; // ② 종료(예정)연월일 — 미수집
  creditorName?: string; // ③ 미수집
  creditorId?: string; // ④ 미수집
  creditorAddress?: string; // ⑤
  amount: number; // ⑥
}
export interface Buppyo3UtilityRow {
  codeLabel?: string; // ⑧ 미수집
  year?: string; // ⑨
  quarter?: string; // ⑩
  detailName?: string; // 보완 표시
  amount: number; // ⑪
}
export interface Buppyo3FuneralRow {
  payeeId?: string; // ⑬ 미수집
  payeeName?: string; // ⑭ 미수집
  detail: string; // ⑮
  amount: number; // ⑯
}
export interface Buppyo3DeductionValues {
  basic: number | null; // ⑱
  child: null; // ⑲ 개별 미노출
  minor: null; // ⑳
  elderly: null; // ㉑
  disabled: null; // ㉒
  lumpSum: number | null; // ㉓
  familyBusiness: number; // ㉔
  farming: number; // ㉕
  spouse: number; // ㉖
  financial: number; // ㉗
  disaster: number; // ㉘ §24 한도보정 입력값 echo
  cohabit: number; // ㉙
  ceiling: number | null; // ㉚
  total: number; // ㉛
}
export interface Buppyo3Data {
  debtRows: Buppyo3DebtRow[];
  debtTotal: number; // ⑦
  utilityRows: Buppyo3UtilityRow[];
  utilityTotal: number; // ⑫
  funeralRows: Buppyo3FuneralRow[];
  funeralTotal: number; // ⑰
  deduction: Buppyo3DeductionValues;
  selectedMethod: "lump_sum" | "itemized";
}

export function buildBuppyo3Data(
  result: InheritanceTaxResult,
  debtItems: DebtItem[] | undefined,
  legacy?: { funeralExpense: number; funeralIncludesBongan: boolean; debts: number },
): Buppyo3Data {
  const items = debtItems ?? [];
  const useLegacy = items.length === 0 && legacy != null;

  let debtRows: Buppyo3DebtRow[] = items
    .filter((d) => d.category === "financial" || d.category === "personal")
    .map((d) => ({
      kindLabel: d.name.trim() || DEBT_CATEGORY_LABEL[d.category],
      incurredDate: d.incurredDate,
      creditorAddress: d.creditorAddress,
      amount: d.amount,
    }));
  let utilityRows: Buppyo3UtilityRow[] = items
    .filter((d) => d.category === "tax")
    .map((d) => ({ detailName: d.name.trim() || undefined, amount: d.amount }));
  let funeralRows: Buppyo3FuneralRow[] = items
    .filter((d) => d.category === "funeral")
    .map((d) => ({
      detail: (d.name.trim() || DEBT_CATEGORY_LABEL.funeral) + (d.isBongan ? " (봉안시설)" : ""),
      amount: d.amount,
    }));

  // legacy fallback (debtItems 미입력 — funeralExpense/debts 단일 행)
  if (useLegacy) {
    funeralRows =
      legacy!.funeralExpense > 0
        ? [{ detail: "장례비" + (legacy!.funeralIncludesBongan ? " (봉안시설)" : ""), amount: legacy!.funeralExpense }]
        : [];
    debtRows = legacy!.debts > 0 ? [{ kindLabel: "채무·공과금", amount: legacy!.debts }] : [];
    utilityRows = [];
  }

  const d = result.deductionDetail;
  const method: "lump_sum" | "itemized" =
    d.lumpSumComparisonDetail?.selectedMethod ?? d.chosenMethod;
  const lim = d.deductionLimitDetail;

  const deduction: Buppyo3DeductionValues = {
    basic: method === "itemized" ? d.basicDeduction : null,
    child: null,
    minor: null,
    elderly: null,
    disabled: null,
    lumpSum: method === "lump_sum" ? d.lumpSumDeduction : null,
    familyBusiness: d.familyBusinessDeduction,
    farming: d.farmingDeduction,
    spouse: d.spouseDeduction,
    financial: d.financialDeduction,
    disaster: lim?.disasterLossDeduction ?? 0,
    cohabit: d.cohabitationDeduction,
    ceiling: lim?.ceiling ?? null,
    total: d.totalDeduction,
  };

  return {
    debtRows,
    debtTotal: sumAmount(debtRows),
    utilityRows,
    utilityTotal: sumAmount(utilityRows),
    funeralRows,
    funeralTotal: sumAmount(funeralRows),
    deduction,
    selectedMethod: method,
  };
}

// ============================================================
// 서식 C — 별지 제5호서식 (금융재산 상속공제)
// ============================================================

export interface Besshi5AssetRow {
  kindLabel: string;
  account?: string;
  institution?: string;
  bizNo?: string;
  unitPrice?: number;
  amount: number;
}
export type Besshi5DebtRow = Besshi5AssetRow;
export interface Besshi5Data {
  assetRows: Besshi5AssetRow[];
  assetTotal: number; // ①
  debtRows: Besshi5DebtRow[];
  debtTotal: number; // ②
  netFinancial: number; // ③
  capLimit: number; // ④
  deduction: number; // ⑤
}

/** financialDeductionDetail 단일출처. 미적용 시 null (렌더 가드) */
export function buildBesshi5Data(result: InheritanceTaxResult): Besshi5Data | null {
  const fdd = result.deductionDetail.financialDeductionDetail;
  const finalDeduction = result.deductionDetail.financialDeduction;
  if (!fdd || (fdd.netFinancial <= 0 && finalDeduction <= 0)) return null;

  const assetRows: Besshi5AssetRow[] = fdd.rows
    .filter((r) => !isDebtLabel(r.label))
    .map((r) => ({ kindLabel: r.label, amount: r.amount }));
  const debtRows: Besshi5DebtRow[] = fdd.rows
    .filter((r) => isDebtLabel(r.label))
    .map((r) => ({ kindLabel: r.label, amount: r.amount }));

  return {
    assetRows,
    assetTotal: sumAmount(assetRows),
    debtRows,
    debtTotal: sumAmount(debtRows),
    netFinancial: fdd.netFinancial,
    capLimit: fdd.cappedDeduction,
    deduction: finalDeduction,
  };
}

// ============================================================
// 서식 B — 별지 제1호서식 (가업상속공제신고서)
// ============================================================

export interface Besshi1AssetRow {
  kindLabel: string;
  quantity?: string;
  unitPrice?: number;
  amount: number;
  note?: string;
}
export interface Besshi1Data {
  // 가. 가업현황 — 미수집(undefined)
  businessName?: string;
  representativeName?: string;
  openDate?: string;
  industry?: string;
  baseSalary?: number;
  baseHeadcount?: number;
  bizNo?: string;
  residentId?: string;
  // 나. 중소·중견·상장
  isSme?: boolean;
  isMedium?: boolean;
  isListed?: boolean;
  listingDate?: string;
  avgRevenue3Y?: number;
  // 다. 피상속인
  operatingYears: number;
  isMajorShareholder?: boolean;
  decedentName?: string;
  decedentResidentId?: string;
  ceoTenure?: string;
  shareRatio?: string;
  // 라. 가업상속인 — 미수집
  heirName?: string;
  heirEngagement?: string;
  officerAppointDate?: string;
  heirAddress?: string;
  // 마. 가업상속 재산가액
  assetRows: Besshi1AssetRow[];
  // 바. 신고액
  declaredAmount: number;
  appliedCap?: number;
}

/** familyBusinessDetail.deduction>0 시만 반환 (렌더 가드). familyBusinessInput 전달 시 나·다 추가 채움 */
export function buildBesshi1Data(
  result: InheritanceTaxResult,
  estateItems: EstateItem[] | undefined,
  familyBusinessInput?: FamilyBusinessInheritanceInput,
): Besshi1Data | null {
  const fbd = result.deductionDetail.familyBusinessDetail;
  if (!fbd || fbd.deduction <= 0) return null;

  const fbi = familyBusinessInput;
  const valuatedAmountOf = (id: string): number =>
    result.valuationResults.find((v) => v.estateItemId === id)?.valuatedAmount ?? 0;

  const assetRows: Besshi1AssetRow[] = (estateItems ?? [])
    .filter((e) => e.familyBusinessCategory != null)
    .map((e) => ({
      kindLabel: FAMILY_BUSINESS_CATEGORY_LABEL[e.familyBusinessCategory!],
      amount: valuatedAmountOf(e.id),
      note: e.name.trim() || undefined,
    }));

  return {
    isSme: fbi ? fbi.enterpriseSize === "sme" : undefined,
    isMedium: fbi ? fbi.enterpriseSize === "medium" : undefined,
    isListed: fbi?.isListedOnExchange,
    avgRevenue3Y: fbi?.averageRevenue3Y,
    operatingYears: fbd.operatingYears,
    isMajorShareholder: fbi?.decedentMajorShareholdingMet,
    assetRows,
    declaredAmount: fbd.deduction,
    appliedCap: fbd.appliedCap,
  };
}
