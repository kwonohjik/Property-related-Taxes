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
  AssetCategory,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  resolveFinancialEligibility,
  resolveFinancialDebt,
} from "./financial-deduction-resolver";
import { resolveEstateItemValue } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { sortHeirs } from "./heir-allocation-summary";
import type {
  FamilyBusinessInheritanceInput,
  FamilyBusinessCategory,
} from "@/lib/tax-engine/types/inheritance-family-business.types";
import {
  capFuneralRowAmounts,
  calcFuneralExpenseDeduction,
  FUNERAL_MIN,
} from "@/lib/tax-engine/inheritance-gift-common";
import { toCollateralDebtItems } from "@/lib/tax-engine/inheritance-collateral-debt";
import { COLLATERAL_FINANCIAL_DEBT_ROW_LABEL } from "@/lib/tax-engine/inheritance-tax-financial-rows";

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
  return label === FINANCIAL_DEBT_ROW_LABEL || label === COLLATERAL_FINANCIAL_DEBT_ROW_LABEL;
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
  disaster: number; // ㉘ §23 상속세 재해손실공제 (casualtyLossDeduction)
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
  // §14 담보채무 자동도출분(result.collateralDebtDetail)을 「가. 채무」에 합산.
  // 엔진이 협의분할 합산(inheritance-tax.ts:725)에 쓰는 동일 헬퍼 재사용(category="personal" → 가.채무 필터 통과).
  const collateralItems = toCollateralDebtItems(result.collateralDebtDetail ?? []);
  const items = [...(debtItems ?? []), ...collateralItems];
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
  // 장례비 §14③: 식대 1,000만 + 봉안 500만 한도 내 공제 인정액만 표시 (행별 한도 적용, 합계 = funeralDeduction)
  const funeralItems = items.filter((d) => d.category === "funeral");
  const cappedFuneralAmounts = capFuneralRowAmounts(
    funeralItems.map((d) => ({ amount: d.amount, isBongan: !!d.isBongan })),
  );
  let funeralRows: Buppyo3FuneralRow[] = funeralItems.map((d, i) => ({
    detail: (d.name.trim() || DEBT_CATEGORY_LABEL.funeral) + (d.isBongan ? " (봉안시설)" : ""),
    amount: cappedFuneralAmounts[i],
  }));
  // §9②1호 식대 최소 500만: 식대 행이 하나도 없으면(봉안만/채무만) capFuneralRowAmounts가
  // 보정할 행이 없으므로 합성 행 추가 → 별지서식 합계 = 엔진 funeralDeduction 정합.
  if (!useLegacy && !funeralItems.some((d) => !d.isBongan)) {
    funeralRows = [{ detail: "장례비", amount: FUNERAL_MIN }, ...funeralRows];
  }

  // legacy fallback (debtItems 미입력 — funeralExpense/debts 단일 행)
  if (useLegacy) {
    const legacyFuneralDeduction = calcFuneralExpenseDeduction(
      legacy!.funeralExpense,
      legacy!.funeralIncludesBongan,
    ).deduction;
    // 식대 최소 500만은 funeralExpense=0이어도 항상 적용 → 행 표시 (엔진 정합).
    funeralRows = [
      { detail: "장례비" + (legacy!.funeralIncludesBongan ? " (봉안시설)" : ""), amount: legacyFuneralDeduction },
    ];
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
    disaster: d.casualtyLossDeduction ?? 0, // ㉘ §23 상속세 재해손실공제 (§54 lim.disasterLossDeduction와 별개)
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
  /** 피상속인 성명 (Step1 입력) */
  decedentName?: string;
  /** 피상속인 주민등록번호 (Step1 입력) */
  decedentResidentNumber?: string;
  /** 신고인(대표 상속인) 성명 — sortHeirs 우선순위 1순위 */
  heirName?: string;
  /** 신고인(대표 상속인) 주민등록번호 */
  heirResidentNumber?: string;
  assetRows: Besshi5AssetRow[];
  assetTotal: number; // ①
  debtRows: Besshi5DebtRow[];
  debtTotal: number; // ②
  netFinancial: number; // ③
  capLimit: number; // ④
  deduction: number; // ⑤
}

/** 금융재산 종류(종류 칸) 라벨 — name 우선, 없으면 엔진 집계 라벨과 동일 종류명 (보험금·상장주식·예금 등) */
const FINANCIAL_ASSET_KIND_LABEL: Record<AssetCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "건물",
  real_estate_apartment: "아파트",
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
  cash: "현금",
  financial: "예금",
  deposit: "전세보증금",
  superficies: "지상권",
  intangible_ip: "무체재산권",
  receivable: "채권",
  convertible_bond: "전환사채등",
  crypto_asset: "가상자산",
  other: "기타금융",
};

function financialAssetKindLabel(item: EstateItem): string {
  if (item.name?.trim()) return item.name.trim();
  if (item.deemedCategory === "insurance") return "보험금";
  return FINANCIAL_ASSET_KIND_LABEL[item.category] ?? "금융재산";
}

/**
 * financialDeductionDetail 단일출처. 미적용 시 null (렌더 가드).
 *
 * estateItems·debtItems 제공 시: §22 적격 자산·금융채무를 **입력한 대로 항목별** 기재
 * (합계 1행 금지). 적격 판정은 financial-deduction-resolver 단일 진실, 평가액은 엔진 §60.
 * 미제공 시(legacy·테스트): fdd.rows(종류별 집계) fallback.
 */
export function buildBesshi5Data(
  result: InheritanceTaxResult,
  estateItems?: EstateItem[],
  debtItems?: DebtItem[],
  heirs?: Heir[],
  decedentName?: string,
  decedentResidentNumber?: string,
): Besshi5Data | null {
  const fdd = result.deductionDetail.financialDeductionDetail;
  const finalDeduction = result.deductionDetail.financialDeduction;
  if (!fdd || (fdd.netFinancial <= 0 && finalDeduction <= 0)) return null;

  // 신고인(대표 상속인) — 별지 제9호서식과 동일 도출(sortHeirs 1순위)
  const representative = heirs && heirs.length > 0 ? sortHeirs(heirs)[0] : undefined;
  const heirName = representative?.name?.trim() || undefined;
  const heirResidentNumber = representative?.residentNumber?.trim() || undefined;

  let assetRows: Besshi5AssetRow[];
  let debtRows: Besshi5DebtRow[];

  if (estateItems !== undefined || debtItems !== undefined) {
    // 항목별 기재 (입력한 대로)
    assetRows = (estateItems ?? [])
      .filter(resolveFinancialEligibility)
      .map((item) => ({
        kindLabel: financialAssetKindLabel(item),
        amount: resolveEstateItemValue(item),
      }))
      .filter((r) => r.amount > 0);
    debtRows = (debtItems ?? [])
      .filter(resolveFinancialDebt)
      .map((d) => ({
        kindLabel: d.name.trim() || "금융채무",
        amount: d.amount,
      }));
    // §14 담보 금융저당분(§22 순금융 차감) — 엔진 fdd.rows에서 읽어 ② 채무에 반영(③ netFinancial과 정합).
    // estateItems 재계산 대신 fdd 사용 = §22② 최대주주 제외 적용 후 값 단일출처.
    const collateralRow = fdd.rows.find((r) => r.label === COLLATERAL_FINANCIAL_DEBT_ROW_LABEL);
    if (collateralRow && collateralRow.amount > 0)
      debtRows.push({ kindLabel: COLLATERAL_FINANCIAL_DEBT_ROW_LABEL, amount: collateralRow.amount });
  } else {
    // legacy fallback — fdd.rows(종류별 집계)
    assetRows = fdd.rows
      .filter((r) => !isDebtLabel(r.label))
      .map((r) => ({ kindLabel: r.label, amount: r.amount }));
    debtRows = fdd.rows
      .filter((r) => isDebtLabel(r.label))
      .map((r) => ({ kindLabel: r.label, amount: r.amount }));
  }

  return {
    decedentName: decedentName?.trim() || undefined,
    decedentResidentNumber: decedentResidentNumber?.trim() || undefined,
    heirName,
    heirResidentNumber,
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
  // 라. 가업상속인
  heirName?: string;
  heirResidentNumber?: string;
  heirEngagement?: string;
  officerAppointDate?: string;
  heirAddress?: string;
  // 마. 가업상속 재산가액
  assetRows: Besshi1AssetRow[];
  // 바. 신고액
  declaredAmount: number;
  appliedCap?: number;
}

/** 마. 수량(면적) 도출 — 주식: 주식수("N주"), 부동산: 면적("N㎡"). 단가 역산용 숫자도 반환. */
function deriveFamilyBusinessQuantity(e: EstateItem): { quantity?: string; quantityNum?: number } {
  const shares = e.listedStockShares ?? e.unlistedStockValuationV2?.ownedShares;
  if (shares != null && shares > 0) {
    return { quantity: `${shares.toLocaleString("ko-KR")}주`, quantityNum: shares };
  }
  if (e.areaSqm != null && e.areaSqm > 0) {
    return { quantity: `${e.areaSqm.toLocaleString("ko-KR")}㎡`, quantityNum: e.areaSqm };
  }
  if (e.quantityCount != null && e.quantityCount > 0) {
    return { quantity: e.quantityCount.toLocaleString("ko-KR"), quantityNum: e.quantityCount };
  }
  return {};
}

/**
 * 나. 상장여부 자동 판정 — 가업자산 종류(category)로 도출.
 * 주식 평가조서가 상장(listed_stock)·비상장(unlisted_stock)으로 이미 구분되므로 자동 체크.
 * 명시 입력(isListedOnExchange)이 있으면 사용자 override 우선. 주식 외(부동산 등)는 판정 불가(undefined).
 */
function deriveFamilyBusinessIsListed(
  familyAssets: EstateItem[],
  explicit: boolean | undefined,
): boolean | undefined {
  if (explicit != null) return explicit;
  if (familyAssets.some((e) => e.category === "listed_stock")) return true;
  if (familyAssets.some((e) => e.category === "unlisted_stock")) return false;
  return undefined;
}

/**
 * 가업상속인 식별 — 가업자산 heirAllocations 최대 금액 수령자(C-1/C-2), 미입력 시 대표 상속인(C-3).
 * 계획: docs/00-pm/inheritance-besshi1-family-business-autofill.plan.md §4
 */
function resolveFamilyBusinessHeir(familyAssets: EstateItem[], heirs?: Heir[]): Heir | undefined {
  if (!heirs || heirs.length === 0) return undefined;
  const allocSum = new Map<string, number>();
  for (const asset of familyAssets) {
    for (const alloc of asset.heirAllocations ?? []) {
      allocSum.set(alloc.heirId, (allocSum.get(alloc.heirId) ?? 0) + alloc.amount);
    }
  }
  if (allocSum.size > 0) {
    let bestId = "";
    let bestAmt = -1;
    for (const [id, amt] of allocSum) {
      if (amt > bestAmt) {
        bestAmt = amt;
        bestId = id;
      }
    }
    const matched = heirs.find((h) => h.id === bestId);
    if (matched) return matched;
  }
  return sortHeirs(heirs)[0]; // C-3 fallback (별지 제9호 신고인과 동일)
}

/**
 * familyBusinessDetail.deduction>0 시만 반환 (렌더 가드).
 * heirs·decedentName·decedentResidentNumber 전달 시 다(피상속인)·라(가업상속인) 인적사항 자동채움.
 * 식별정보·자산 수량/단가는 표시 전용(계산 미사용).
 */
export function buildBesshi1Data(
  result: InheritanceTaxResult,
  estateItems: EstateItem[] | undefined,
  familyBusinessInput?: FamilyBusinessInheritanceInput,
  heirs?: Heir[],
  decedentName?: string,
  decedentResidentNumber?: string,
): Besshi1Data | null {
  const fbd = result.deductionDetail.familyBusinessDetail;
  if (!fbd || fbd.deduction <= 0) return null;

  const fbi = familyBusinessInput;
  const valuatedAmountOf = (id: string): number =>
    result.valuationResults.find((v) => v.estateItemId === id)?.valuatedAmount ?? 0;

  const familyAssets = (estateItems ?? []).filter((e) => e.familyBusinessCategory != null);

  const assetRows: Besshi1AssetRow[] = familyAssets.map((e) => {
    const amount = valuatedAmountOf(e.id);
    const { quantity, quantityNum } = deriveFamilyBusinessQuantity(e);
    const unitPrice =
      quantityNum && quantityNum > 0 ? Math.floor(amount / quantityNum) : undefined;
    return {
      kindLabel: FAMILY_BUSINESS_CATEGORY_LABEL[e.familyBusinessCategory!],
      quantity,
      unitPrice,
      amount,
      note: e.name?.trim() || undefined,
    };
  });

  // 가. 상호(법인명) — 비상장 corpName ?? 상장 평가조서 ① 법인명(companyName) ?? 자산명
  const businessName =
    familyAssets[0]?.unlistedStockValuationV2?.corpName?.trim() ||
    familyAssets[0]?.companyName?.trim() ||
    familyAssets[0]?.name?.trim() ||
    undefined;

  // 라. 가업상속인 (§4 식별)
  const fbHeir = resolveFamilyBusinessHeir(familyAssets, heirs);

  return {
    // 가. 가업현황 — 상호는 자산명(Phase 2), 나머지 식별정보는 familyBusinessInput 표시 필드(Phase 3)
    businessName,
    bizNo: fbi?.businessRegistrationNumber?.trim() || undefined,
    representativeName: fbi?.representativeName?.trim() || undefined,
    residentId: fbi?.representativeResidentNumber?.trim() || undefined,
    openDate: fbi?.openingDate || undefined,
    industry: fbi?.industryName?.trim() || undefined,
    isSme: fbi ? fbi.enterpriseSize === "sme" : undefined,
    isMedium: fbi ? fbi.enterpriseSize === "medium" : undefined,
    isListed: deriveFamilyBusinessIsListed(familyAssets, fbi?.isListedOnExchange),
    avgRevenue3Y: fbi?.averageRevenue3Y,
    operatingYears: fbd.operatingYears,
    isMajorShareholder: fbi?.decedentMajorShareholdingMet,
    decedentName: decedentName?.trim() || undefined,
    decedentResidentId: decedentResidentNumber?.trim() || undefined,
    ceoTenure: fbi?.decedentCeoTenure?.trim() || undefined,
    shareRatio: fbi?.decedentShareRatio?.trim() || undefined,
    heirName: fbHeir?.name?.trim() || undefined,
    heirResidentNumber: fbHeir?.residentNumber?.trim() || undefined,
    // 신규 구조화 필드(heirEngagementStartDate) 우선 — 미입력 시 legacy 텍스트(heirEngagementPeriod). (eligibility-autoderive)
    heirEngagement:
      (fbi?.heirEngagementStartDate ? `${fbi.heirEngagementStartDate}부터 종사` : undefined) ||
      fbi?.heirEngagementPeriod?.trim() ||
      undefined,
    officerAppointDate: fbi?.heirOfficerAppointDate || undefined,
    assetRows,
    declaredAmount: fbd.deduction,
    appliedCap: fbd.appliedCap,
  };
}
