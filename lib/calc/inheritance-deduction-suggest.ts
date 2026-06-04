/**
 * 상속세 추가 공제 자동 채움 (Step4 AutoSuggestBadge 도출 함수)
 *
 * 계획서: docs/00-pm/inheritance-additional-deduction-autofill.plan.md (v2.2)
 * 정책: single-source-engine-helper · feedback_no_silent_apportion_fallback ·
 *       mirror-pattern (useEffect → store 미러링 금지, 사용자 명시 action만 store write)
 *
 * 본 모듈은 EstateItem·DebtItem·PriorGift·Heir 데이터로부터
 * Step4 입력 필드 6종의 자동 제안값을 derive (순수 함수).
 * AutoSuggestBadge 컴포넌트는 본 함수 결과를 useMemo로 받아 표시.
 */

import {
  resolveFinancialDebt,
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import { sumCollateralFinancialDebt } from "@/lib/tax-engine/inheritance-collateral-debt";
import { calcRelationDeduction } from "@/lib/tax-engine/deductions/gift-deductions";
import { calcCorporateStockAdjustedValue } from "@/lib/tax-engine/property-valuation-corporate";
import { resolveEstateItemValue } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { isStatutoryHeir } from "@/lib/calc/heir-allocation-summary";
import type {
  DebtItem,
  DonorRelation,
  EstateItem,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 공용 타입
// ============================================================

export interface DeductionSuggestion {
  /** 제안 금액 (원). 음수는 0으로 clamp. */
  value: number;
  /** 한 줄 요약 — 도출 근거 */
  reason: string;
  /** 산식 펼침 (여러 줄) — AutoSuggestBadge 토글에서 표시 */
  breakdown: string[];
  /** 도출 가능 여부 — false면 배지 미렌더 */
  isApplicable: boolean;
  /** 추가 안내 메시지 (legacy 모드 등) */
  notes?: string[];
}

// ============================================================
// 평가액 도출 (단일 진실 — 캐시된 평가 결과 우선)
// ============================================================

/**
 * EstateItem의 §22 합산 평가액 도출.
 *
 * 우선순위:
 *   1. marketValue (시가 직접 입력 — AN-2 보존: 명시값이 있으면 항상 우선)
 *   2. appraisedValue (감정평가액)
 *   3. standardPrice (기준시가)
 *   4. 주식 카테고리(listed_stock·unlisted_stock): computeStockValuation(item) fallback
 *      — 상장 avg×shares / 비상장 V2 evaluateUnlistedStockV2 / V1 calcUnlistedStockPerShareValue
 *   5. 0 (도출 불가)
 *
 * Phase 0 수정 (2026-05-27):
 *   기존: 주식은 listedStockAvgPrice × listedStockShares 만 참조 → 비상장 V2·V1 누락
 *   변경: 주식 카테고리에서 명시 평가액이 없을 때 computeStockValuation으로 derive
 *   정책: marketValue useEffect 미러링 금지 (mirror-pattern). derive만 수행, store write 없음.
 *
 * export: 결과뷰(InheritanceTaxResultView)가 동일 함수를 재사용하도록 export 제공.
 * (단일 진실 — single-source-engine-helper 정책)
 */
export function getValuatedAmount(item: EstateItem): number {
  // J-1: §60 평가 우선순위(시가→감정가→기준시가→주식 보충평가→0)는 엔진 단일 진실로 통일.
  // 기존 5단계 로직과 동치(resolveEstateItemValue로 이동). family-business와 동일 소스 사용.
  return resolveEstateItemValue(item);
}

/**
 * corporate_stock 자산은 사업무관자산 차감 후 가액 반환 (PR-C F-8).
 * 시행령 §15⑤2호 + §16⑤2호 공통. 미입력 시 raw value.
 */
function getCorporateAdjustedAmount(item: EstateItem): number {
  const raw = getValuatedAmount(item);
  const isCorporateStock =
    item.farmingCategory === "corporate_stock" ||
    item.familyBusinessCategory === "corporate_stock";
  if (!isCorporateStock) return raw;
  if (!item.corporateTotalAssets) return raw;
  return calcCorporateStockAdjustedValue(
    raw,
    item.corporateTotalAssets,
    item.corporateNonBusinessAssets,
  ).adjustedValue;
}

function formatKrw(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ============================================================
// A-4: 순 금융재산 §22 (필드 #2)
// ============================================================

/**
 * 순 금융재산 자동 도출 — 상증법 §22 + 시행령 §19①·④.
 *
 * 산식: Σ(resolveFinancialEligibility=true EstateItem 평가액)
 *       − Σ(resolveFinancialDebt=true DebtItem 금액)
 * 음수는 0으로 clamp (Math.max).
 *
 * legacy debts 모드(debtItems undefined)에서는 debts=0 + 안내 메시지.
 */
export function suggestNetFinancialAssets(
  estateItems: EstateItem[],
  debtItems: DebtItem[] | undefined,
): DeductionSuggestion {
  const eligibleAssets = estateItems.filter(resolveFinancialEligibility);
  const eligibleDebts = (debtItems ?? []).filter(resolveFinancialDebt);
  const assets = eligibleAssets.reduce((sum, i) => sum + getValuatedAmount(i), 0);
  const debtItemsSum = eligibleDebts.reduce((sum, d) => sum + d.amount, 0);
  // 담보채무 §14 자동공제 중 금융채무(저당분)를 §22 순금융 차감에도 반영 (collateral-debt-auto-deduction)
  const collateralFinancial = sumCollateralFinancialDebt(
    deriveCollateralDebts(estateItems),
  );
  const debts = debtItemsSum + collateralFinancial;
  const value = Math.max(0, assets - debts);

  const breakdown: string[] = [
    `금융자산 합계: ${formatKrw(assets)}원 (${eligibleAssets.length}건)`,
    `금융채무 합계: ${formatKrw(debtItemsSum)}원 (${eligibleDebts.length}건)`,
    ...(collateralFinancial > 0
      ? [`담보채무(금융 저당) 차감: ${formatKrw(collateralFinancial)}원`]
      : []),
    `순 금융재산: ${formatKrw(value)}원`,
  ];

  const notes: string[] = [];
  if (collateralFinancial > 0) {
    notes.push(
      "🔒 자산 평가의 담보채무(금융 저당)가 §22 순금융재산 제안에 반영되었습니다 — [적용] 버튼을 눌러야 순금융재산 입력값에 반영됩니다.",
    );
  }
  if (debtItems === undefined) {
    notes.push(
      "💡 부채 협의분할 모드를 켜면 §22 금융채무 차감을 자동 적용할 수 있습니다.",
    );
  }
  if (assets - debts < 0) {
    notes.push("⚠️ 차감 채무가 자산보다 큽니다 — 순 금융재산은 0원으로 처리됩니다.");
  }

  return {
    value,
    reason: "§22 대상 금융재산 − 금융채무",
    breakdown,
    isApplicable: assets > 0 || debts > 0,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ============================================================
// A-5: 사전증여 증여재산공제 합계 §24 (필드 #9)
// ============================================================

const DONOR_RELATION_LABEL: Record<DonorRelation, string> = {
  spouse: "배우자",
  lineal_ascendant_adult: "직계존속(성년)",
  lineal_ascendant_minor: "직계존속(미성년)",
  lineal_descendant: "직계비속",
  other_relative: "기타친족",
};

/**
 * 사전증여 증여재산공제 합계 자동 도출 — §53 관계별 한도 그룹화.
 *
 * 산식: priorGifts를 doneeRelation 그룹별로 합산 →
 *       각 그룹별 calcRelationDeduction (priorUsed=0, grossGiftValue=group sum) →
 *       relationDeduction 합산.
 *
 * single-source-engine-helper: calcRelationDeduction 엔진 헬퍼 직접 재사용.
 * 엔진 한도(배우자 6억·직계비속 5천만 등) 개정 시 자동 추종.
 */
export function suggestPriorGiftDeductionTotal(
  priorGifts: PriorGift[],
): DeductionSuggestion {
  if (priorGifts.length === 0) {
    return {
      value: 0,
      reason: "사전증여 없음",
      breakdown: [],
      isApplicable: false,
    };
  }

  // doneeRelation별 그룹화 (미입력은 "other_relative"로 fallback — 가장 보수적)
  const groups = new Map<DonorRelation, number>();
  let unknownTotal = 0;
  let unknownCount = 0;
  for (const g of priorGifts) {
    const rel: DonorRelation | undefined = g.doneeRelation;
    if (!rel) {
      unknownTotal += g.giftAmount;
      unknownCount += 1;
      continue;
    }
    groups.set(rel, (groups.get(rel) ?? 0) + g.giftAmount);
  }

  let total = 0;
  const breakdown: string[] = [];
  for (const [rel, sum] of groups.entries()) {
    const { relationDeduction } = calcRelationDeduction(
      { donorRelation: rel, priorUsedDeduction: 0 },
      sum,
    );
    total += relationDeduction;
    breakdown.push(
      `${DONOR_RELATION_LABEL[rel]}: 증여재산 ${formatKrw(sum)}원 → 공제 ${formatKrw(relationDeduction)}원`,
    );
  }

  const notes: string[] = [];
  if (unknownCount > 0) {
    notes.push(
      `⚠️ 수증자 관계 미입력 ${unknownCount}건(${formatKrw(unknownTotal)}원)은 자동 합계에서 제외 — Step3에서 관계 입력 후 재제안 받으세요.`,
    );
  }
  breakdown.push(`사전증여 공제 합계: ${formatKrw(total)}원`);

  return {
    value: total,
    reason: "§53 관계별 한도 그룹 합산",
    breakdown,
    isApplicable: true,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ============================================================
// A-6: 가업상속재산가액 §18의2 (필드 #6)
// ============================================================

export function suggestFamilyBusinessValue(
  estateItems: EstateItem[],
): DeductionSuggestion {
  const eligible = estateItems.filter((i) => i.isFamilyBusinessAsset === true);
  if (eligible.length === 0) {
    return {
      value: 0,
      reason: "가업상속 자산 미지정",
      breakdown: [],
      isApplicable: false,
    };
  }
  const value = eligible.reduce((sum, i) => sum + getCorporateAdjustedAmount(i), 0);
  return {
    value,
    reason: "isFamilyBusinessAsset=true 자산 합산 (corporate_stock는 사업무관자산 차감)",
    breakdown: eligible.map((i) => {
      const adj = getCorporateAdjustedAmount(i);
      const raw = getValuatedAmount(i);
      const note = adj !== raw ? ` (사업무관자산 차감 / 평가 ${formatKrw(raw)}원)` : "";
      return `${i.name}: ${formatKrw(adj)}원${note}`;
    }).concat([
      `가업재산 합계: ${formatKrw(value)}원`,
    ]),
    isApplicable: true,
  };
}

// ============================================================
// A-7: 상속외자 유증 금액 §19·§24 (필드 #8) — 협의분할 한정
// ============================================================

export function suggestLegateeAmountNonHeir(
  estateItems: EstateItem[],
  heirs: Heir[],
): DeductionSuggestion {
  // 비상속인(수유자·영리법인·isHeir===false) — isStatutoryHeir 단일 진실
  const nonHeirIds = new Set(
    heirs.filter((h) => !isStatutoryHeir(h)).map((h) => h.id),
  );
  if (nonHeirIds.size === 0) {
    return {
      value: 0,
      reason: "상속외자 미지정",
      breakdown: [],
      isApplicable: false,
    };
  }
  let total = 0;
  const breakdown: string[] = [];
  let hasAllocations = false;
  for (const item of estateItems) {
    if (!item.heirAllocations) continue;
    hasAllocations = true;
    for (const alloc of item.heirAllocations) {
      if (nonHeirIds.has(alloc.heirId)) {
        total += alloc.amount;
        breakdown.push(`${item.name} → 상속외자: ${formatKrw(alloc.amount)}원`);
      }
    }
  }
  if (!hasAllocations) {
    return {
      value: 0,
      reason: "협의분할 미입력 — 자동 도출 불가",
      breakdown: [],
      isApplicable: false,
    };
  }
  breakdown.push(`상속외자 유증 합계: ${formatKrw(total)}원`);
  return {
    value: total,
    reason: "협의분할 중 legatee/corporate 분배 합",
    breakdown,
    isApplicable: true,
  };
}

// ============================================================
// A-7+: 영농상속재산가액 §18의3 (필드 #5)
// ============================================================

const FARMING_CATEGORY_LABEL: Record<NonNullable<EstateItem["farmingCategory"]>, string> = {
  farmland: "농지",
  pasture: "초지",
  forest_land: "산림지",
  fishing_vessel: "어선",
  fishing_right: "어업권·양식업권",
  agricultural_building: "농업용 건축물",
  salt_field: "염전",
  corporate_stock: "법인 영농 주식",
};

/**
 * 상속개시일 기준 "2년 전" 날짜 문자열 반환 (§16⑤1호 자동판정 전용).
 *
 * string 조작만 사용 — Date·parseISO·new Date 금지 ([[feedback_api_date_serialize]]).
 * 윤년 2/29 edge(2024-02-29 → 2022-02-29): 드물어 무시 (실무상 2/28 또는 3/1로 보정 필요 시
 * 사용자가 수동 입력하면 됨 — 자동판정은 근사값으로 충분).
 *
 * @param deathDate YYYY-MM-DD 상속개시일
 * @returns YYYY-MM-DD (연도만 -2)
 */
export function twoYearsBefore(deathDate: string): string {
  const [y, m, d] = deathDate.split("-");
  return `${Number(y) - 2}-${m}-${d}`;
}

/**
 * 영농상속재산가액 자동 도출 (§18의3 + 시행령 §16⑤).
 * - estateItems 중 farmingCategory 지정된 자산 합
 * - §16⑤ 단서 — 담보채무(mortgageAmount) 차감
 * - 30억 cap은 엔진에서 적용 (본 헬퍼는 한도 적용 전 값 반환)
 * - farming.qualifiedHeirIds 지정 시 자격자 분배분만 합산 (F-11, §16⑤ 본문)
 */
export function suggestFarmingAssetValue(
  estateItems: EstateItem[],
  farming?: { qualifiedHeirIds?: string[] },
  deathDate?: string,
): DeductionSuggestion {
  // D4: §16⑤1호 2년 영농사용 판정 헬퍼 — 자동판정(farmingUseStartDate) 우선, 수동 boolean fallback
  // KoreanLaw 검증 2026-06-04: "상속개시일 2년 전부터 영농에 사용한 자산" (취득일 기준 아님 — 조심2014중4319)
  const twoYearsBeforeDate = deathDate ? twoYearsBefore(deathDate) : undefined;
  const isFarmingTwoYearMet = (i: EstateItem): boolean => {
    if (i.farmingUseStartDate !== undefined && twoYearsBeforeDate !== undefined) {
      // 자동판정: 영농 사용 개시일이 "2년 전" 이전이면 충족 (string 비교 YYYY-MM-DD)
      return i.farmingUseStartDate <= twoYearsBeforeDate;
    }
    // fallback: 수동 boolean (farmingUseStartDate 미입력 시)
    // undefined=충족 가정(legacy 호환), false=제외
    return i.farmingUsedTwoYears !== false;
  };

  const eligible = estateItems.filter((i) => {
    if (i.farmingCategory === undefined) return false;
    // PR-RE-1: §16⑤마목 단서 — 마을어업·협동양식업 면허 제외
    if (i.farmingCategory === "fishing_right" && i.fishingLicenseExcluded === true) {
      return false;
    }
    // D4: §16⑤1호 본문 — 자동판정(farmingUseStartDate) 우선, 수동 fallback
    if (!isFarmingTwoYearMet(i)) return false;
    return true;
  });
  const excludedFishing = estateItems.filter(
    (i) => i.farmingCategory === "fishing_right" && i.fishingLicenseExcluded === true,
  );
  const excludedTwoYear = estateItems.filter(
    (i) => i.farmingCategory !== undefined && !isFarmingTwoYearMet(i),
  );
  // G3: §16⑤1호 담보채무 차감 — 2026.2.27 이후 상속분부터 (시행령 부칙5). string 비교, deathDate undefined=차감(legacy)
  const applyMortgage = deathDate === undefined || deathDate >= "2026-02-27";
  if (eligible.length === 0) {
    // 자동판정 제외 or 수동 제외된 경우에도 notes 안내 생성
    const earlyNotes: string[] = [];
    if (excludedTwoYear.length > 0) {
      const autoExcluded = excludedTwoYear.filter(
        (i) => i.farmingUseStartDate !== undefined && twoYearsBeforeDate !== undefined,
      );
      const manualExcluded = excludedTwoYear.length - autoExcluded.length;
      if (autoExcluded.length > 0) {
        earlyNotes.push(
          `ℹ️ 영농 사용 개시일이 상속개시 2년 이내인 자산 ${autoExcluded.length}건 제외 (§16⑤1호 자동판정)`,
        );
      }
      if (manualExcluded > 0) {
        earlyNotes.push(
          `ℹ️ '상속개시일 2년 전부터 영농 사용' 미충족 ${manualExcluded}건 제외 (§16⑤1호, 수동 설정)`,
        );
      }
    }
    return {
      value: 0,
      reason: earlyNotes.length > 0 ? "영농 자산 미지정 (2년 미충족 제외)" : "영농 자산 미지정",
      breakdown: [],
      isApplicable: false,
      notes: earlyNotes.length > 0 ? earlyNotes : undefined,
    };
  }
  const qualifiedIds = farming?.qualifiedHeirIds;
  const useAllocation = qualifiedIds !== undefined;

  let totalValue = 0;
  let totalMortgage = 0;
  const breakdown: string[] = [];
  for (const item of eligible) {
    const fullValue = getCorporateAdjustedAmount(item);
    let itemValue = fullValue;
    let itemMortgage = applyMortgage ? (item.mortgageAmount ?? 0) : 0;

    if (useAllocation && item.heirAllocations && item.heirAllocations.length > 0) {
      // 자격자 분배분만 합산 (§16⑤ 본문)
      itemValue = item.heirAllocations
        .filter((a) => qualifiedIds!.includes(a.heirId))
        .reduce((sum, a) => sum + a.amount, 0);
      // 담보채무도 자격자 분배 비율로 차감
      const totalAllocated = item.heirAllocations.reduce((s, a) => s + a.amount, 0);
      itemMortgage =
        totalAllocated > 0
          ? Math.floor((item.mortgageAmount ?? 0) * (itemValue / totalAllocated))
          : 0;
    }

    totalValue += itemValue;
    totalMortgage += itemMortgage;
    const label = FARMING_CATEGORY_LABEL[item.farmingCategory!];
    const sourceNote =
      useAllocation && item.heirAllocations && item.heirAllocations.length > 0
        ? ` (자격자 분배 / 전체 ${formatKrw(fullValue)}원)`
        : "";
    breakdown.push(
      `${label} ${item.name || "(자산명 미입력)"}: ${formatKrw(itemValue)}원${sourceNote}` +
        (itemMortgage > 0 ? ` − 저당 ${formatKrw(itemMortgage)}원` : ""),
    );
  }
  const value = Math.max(0, totalValue - totalMortgage);
  breakdown.push(
    `영농자산 합계: ${formatKrw(value)}원 (자산 ${formatKrw(totalValue)} − 담보 ${formatKrw(totalMortgage)}, 30억 한도 적용 전)`,
  );
  const notes: string[] = [];
  if (value > 3_000_000_000) {
    notes.push("💡 30억 한도 적용 시 cappedDeduction = 30억 (§18의3①)");
  }
  if (useAllocation && qualifiedIds!.length === 0) {
    notes.push("⚠️ 자격 충족 상속인 0명 — 영농상속재산가액 0 (§16⑤ 본문)");
  }
  if (excludedFishing.length > 0) {
    notes.push(
      `ℹ️ 마을어업·협동양식업 면허 ${excludedFishing.length}건 제외 (§16⑤마목 단서)`,
    );
  }
  if (excludedTwoYear.length > 0) {
    const autoExcluded = excludedTwoYear.filter(
      (i) => i.farmingUseStartDate !== undefined && twoYearsBeforeDate !== undefined,
    );
    const manualExcluded = excludedTwoYear.length - autoExcluded.length;
    if (autoExcluded.length > 0) {
      notes.push(
        `ℹ️ 영농 사용 개시일이 상속개시 2년 이내인 자산 ${autoExcluded.length}건 제외 (§16⑤1호 자동판정)`,
      );
    }
    if (manualExcluded > 0) {
      notes.push(
        `ℹ️ '상속개시일 2년 전부터 영농 사용' 미충족 ${manualExcluded}건 제외 (§16⑤1호, 수동 설정)`,
      );
    }
  }
  if (!applyMortgage) {
    notes.push(
      "ℹ️ 2026.2.27 이전 상속 — 담보채무 차감 비적용 (시행령 부칙5). 직접 입력 시 차감 후 금액 입력",
    );
  }
  return {
    value,
    reason: useAllocation
      ? "영농상속 자산 합 (자격자 분배분) − 담보채무 (시행령 §16⑤)"
      : "영농상속 자산 합 − 담보채무 (시행령 §16⑤)",
    breakdown,
    isApplicable: true,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ============================================================
// A-9: 동거주택 공시가격 후보 §23의2 (필드 #3)
// ============================================================

export interface CohabitHouseCandidate {
  itemId: string;
  name: string;
  stdPrice: number;
}

export interface CohabitHouseCandidates {
  candidates: CohabitHouseCandidate[];
  /** 자녀 중 isCohabitant=true 인 상속인이 있는지 */
  hasCohabitantChild: boolean;
  /** 도출 가능 여부 — 후보 1건 이상 + 동거 자녀 존재 */
  isApplicable: boolean;
}

/**
 * 동거주택 §23의2 후보 자산 도출.
 * - 주택 카테고리(real_estate_apartment·real_estate_building)
 * - standardPrice 1원 이상
 * - 자녀 상속인 중 isCohabitant=true 존재
 */
export function suggestCohabitHouseCandidates(
  estateItems: EstateItem[],
  heirs: Heir[],
): CohabitHouseCandidates {
  const hasCohabitantChild = heirs.some(
    (h) => h.relation === "child" && h.isCohabitant === true,
  );
  const candidates: CohabitHouseCandidate[] = [];
  for (const item of estateItems) {
    if (
      item.category !== "real_estate_apartment" &&
      item.category !== "real_estate_building"
    ) {
      continue;
    }
    if (
      typeof item.standardPrice !== "number" ||
      item.standardPrice <= 0
    ) {
      continue;
    }
    candidates.push({
      itemId: item.id,
      name: item.name || "(자산명 미입력)",
      stdPrice: item.standardPrice,
    });
  }
  return {
    candidates,
    hasCohabitantChild,
    isApplicable: candidates.length > 0 && hasCohabitantChild,
  };
}

// ============================================================
// A-9+: 동거주택 공시가격 자동도출 §23의2 (필드 #3, v3)
// ============================================================

/**
 * §23의2 동거주택 공시가격 자동도출.
 * - `isCohabitantHouse === true` 단일 주택 자산. 복수면 자동도출 포기(isApplicable=false, §23의2 1세대1주택).
 * - `value = standardPrice` (**gross — 담보채무 차감 금지**). securedDebt = mortgageAmount.
 *   ★ E-1: §23의2① 담보채무 차감은 엔진 calcCohabitationDeduction(deductions.ts:294)이 단일 수행.
 *   derive가 또 빼면 이중차감(5억·저당1억 → 공제 3억, 정답 4억).
 * - 담보채무 = 저당 등 담보권 설정 채무만(KoreanLaw §23의2① mst 276123 검증). 일반 임대보증금(무담보) 제외.
 * - heirs: 동거 자녀(relation==="child" && isCohabitant) 보조 안내.
 */
export function deriveCohabitHouseStdPrice(
  estateItems: EstateItem[],
  heirs: Heir[],
): DeductionSuggestion & { securedDebt: number } {
  const houses = estateItems.filter((i) => i.isCohabitantHouse === true);
  const hasCohabitantChild = heirs.some(
    (h) => h.relation === "child" && h.isCohabitant === true,
  );

  if (houses.length === 0) {
    return {
      value: 0,
      securedDebt: 0,
      reason: "동거주택 미지정",
      breakdown: [],
      isApplicable: false,
    };
  }
  if (houses.length > 1) {
    return {
      value: 0,
      securedDebt: 0,
      reason: "동거주택 복수 지정 — 1건만 선택",
      breakdown: houses.map(
        (h) => `${h.name || "(자산명 미입력)"}: ${formatKrw(h.standardPrice ?? 0)}원`,
      ),
      isApplicable: false,
      notes: ["⚠️ §23의2는 1세대 1주택 — 동거주택을 1건만 지정하세요."],
    };
  }

  const h = houses[0];
  const stdPrice = h.standardPrice ?? 0;
  if (stdPrice <= 0) {
    return {
      value: 0,
      securedDebt: 0,
      reason: "동거주택 공시가격 미입력",
      breakdown: [],
      isApplicable: false,
      notes: ["주택 자산의 공시가격(기준시가)을 입력하세요."],
    };
  }

  // §23의2① "담보된 피상속인 채무" = 저당 등 담보권 설정 채무(임대보증금 제외).
  const securedDebt = h.mortgageAmount ?? 0;

  const breakdown: string[] = [
    `동거주택 공시가격: ${formatKrw(stdPrice)}원`,
    ...(securedDebt > 0
      ? [`§23의2① 담보채무(저당) 차감(엔진): ${formatKrw(securedDebt)}원`]
      : []),
  ];
  const notes: string[] = [];
  if (!hasCohabitantChild) {
    notes.push(
      "ⓘ 동거(isCohabitant) 표시된 자녀 상속인이 없습니다 — §23의2 10년 동거·무주택 요건을 확인하세요.",
    );
  }

  return {
    value: stdPrice, // ★ gross — securedDebt 차감은 엔진 단일 수행
    securedDebt,
    reason: "동거주택 공시가격 자동도출 (§23의2)",
    breakdown,
    isApplicable: true,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ============================================================
// A-8: 배우자 실제 상속액 §19 (필드 #1) — 협의분할 한정
// ============================================================

export function suggestSpouseActualAmount(
  estateItems: EstateItem[],
  heirs: Heir[],
  debtItems?: DebtItem[],
): DeductionSuggestion {
  const spouseIds = new Set(
    heirs.filter((h) => h.relation === "spouse").map((h) => h.id),
  );
  if (spouseIds.size === 0) {
    return {
      value: 0,
      reason: "배우자 상속인 없음",
      breakdown: [],
      isApplicable: false,
    };
  }
  // ★ R-1: 일부 자산만 협의분할 입력(0<allocated<total) → 미입력 자산의 배우자 귀속 불명 →
  //   자동값이 과소(법정상속분 fallback 대비)하여 잘못된 auto-fill 위험 → 자동도출 포기.
  const totalCount = estateItems.length;
  const allocatedCount = estateItems.filter(
    (i) => i.heirAllocations && i.heirAllocations.length > 0,
  ).length;
  if (allocatedCount > 0 && allocatedCount < totalCount) {
    return {
      value: 0,
      reason: "일부 자산만 협의분할 — 전체 협의분할 또는 §19 직접 입력 필요",
      breakdown: [
        `협의분할 입력 ${allocatedCount}/${totalCount}건 — 미입력 자산의 배우자 귀속을 알 수 없어 자동도출하지 않습니다.`,
      ],
      isApplicable: false,
      notes: [
        "⚠️ 일부 자산만 협의분할이 입력되어 배우자 실제 상속액을 정확히 도출할 수 없습니다. 모든 자산에 협의분할을 입력하거나 배우자 실제 상속액을 직접 입력하세요.",
      ],
    };
  }
  let assetTotal = 0;
  let hasAllocations = false;
  const breakdown: string[] = [];
  for (const item of estateItems) {
    if (!item.heirAllocations) continue;
    hasAllocations = true;
    for (const alloc of item.heirAllocations) {
      if (spouseIds.has(alloc.heirId)) {
        assetTotal += alloc.amount;
        breakdown.push(`${item.name} → 배우자: ${formatKrw(alloc.amount)}원`);
      }
    }
  }
  if (!hasAllocations) {
    return {
      value: 0,
      reason: "협의분할 미입력 — 엔진 fallback(법정상속분) 사용",
      breakdown: [],
      isApplicable: false,
    };
  }
  // §19-17-1: 배우자 실제 상속액 = 배우자 배분 자산 − 배우자 승계 공과금·채무 (장례비 제외)
  let debtTotal = 0;
  for (const debt of debtItems ?? []) {
    if (debt.category === "funeral") continue;
    if (!debt.heirAllocations) continue;
    for (const alloc of debt.heirAllocations) {
      if (spouseIds.has(alloc.heirId)) {
        debtTotal += alloc.amount;
        breakdown.push(`승계 채무 → 배우자: −${formatKrw(alloc.amount)}원`);
      }
    }
  }
  const total = Math.max(0, assetTotal - debtTotal);
  breakdown.push(`배우자 실제 상속액 (자산 − 승계채무): ${formatKrw(total)}원`);
  return {
    value: total,
    reason: "협의분할 배우자 자산 − 승계채무 (집행기준 19-17-1)",
    breakdown,
    isApplicable: true,
  };
}
