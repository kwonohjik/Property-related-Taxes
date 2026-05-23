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
import { calcRelationDeduction } from "@/lib/tax-engine/deductions/gift-deductions";
import { calcCorporateStockAdjustedValue } from "@/lib/tax-engine/property-valuation-corporate";
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
 * 우선순위: marketValue → appraisedValue → standardPrice → 상장주식 (평균×수량) → 0.
 * 비상장주식 등 복잡 평가는 marketValue로 캐시되어 있다고 가정.
 * 향후 PropertyValuationResult 연동 시 본 함수 시그니처 갱신 가능.
 */
function getValuatedAmount(item: EstateItem): number {
  if (typeof item.marketValue === "number" && item.marketValue > 0) {
    return item.marketValue;
  }
  if (typeof item.appraisedValue === "number" && item.appraisedValue > 0) {
    return item.appraisedValue;
  }
  if (typeof item.standardPrice === "number" && item.standardPrice > 0) {
    return item.standardPrice;
  }
  if (
    typeof item.listedStockAvgPrice === "number" &&
    typeof item.listedStockShares === "number"
  ) {
    return item.listedStockAvgPrice * item.listedStockShares;
  }
  return 0;
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
  const debts = eligibleDebts.reduce((sum, d) => sum + d.amount, 0);
  const value = Math.max(0, assets - debts);

  const breakdown: string[] = [
    `금융자산 합계: ${formatKrw(assets)}원 (${eligibleAssets.length}건)`,
    `금융채무 합계: ${formatKrw(debts)}원 (${eligibleDebts.length}건)`,
    `순 금융재산: ${formatKrw(value)}원`,
  ];

  const notes: string[] = [];
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
  // legatee·corporate 또는 isHeir===false 인 자
  const nonHeirIds = new Set(
    heirs
      .filter(
        (h) =>
          h.relation === "legatee" ||
          h.relation === "corporate" ||
          h.isHeir === false,
      )
      .map((h) => h.id),
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
 * 영농상속재산가액 자동 도출 (§18의3 + 시행령 §16⑤).
 * - estateItems 중 farmingCategory 지정된 자산 합
 * - §16⑤ 단서 — 담보채무(mortgageAmount) 차감
 * - 30억 cap은 엔진에서 적용 (본 헬퍼는 한도 적용 전 값 반환)
 * - farming.qualifiedHeirIds 지정 시 자격자 분배분만 합산 (F-11, §16⑤ 본문)
 */
export function suggestFarmingAssetValue(
  estateItems: EstateItem[],
  farming?: { qualifiedHeirIds?: string[] },
): DeductionSuggestion {
  const eligible = estateItems.filter((i) => {
    if (i.farmingCategory === undefined) return false;
    // PR-RE-1: §16⑤마목 단서 — 마을어업·협동양식업 면허 제외
    if (i.farmingCategory === "fishing_right" && i.fishingLicenseExcluded === true) {
      return false;
    }
    return true;
  });
  const excludedFishing = estateItems.filter(
    (i) => i.farmingCategory === "fishing_right" && i.fishingLicenseExcluded === true,
  );
  if (eligible.length === 0) {
    return {
      value: 0,
      reason: "영농 자산 미지정",
      breakdown: [],
      isApplicable: false,
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
    let itemMortgage = item.mortgageAmount ?? 0;

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
// A-8: 배우자 실제 상속액 §19 (필드 #1) — 협의분할 한정
// ============================================================

export function suggestSpouseActualAmount(
  estateItems: EstateItem[],
  heirs: Heir[],
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
  let total = 0;
  let hasAllocations = false;
  const breakdown: string[] = [];
  for (const item of estateItems) {
    if (!item.heirAllocations) continue;
    hasAllocations = true;
    for (const alloc of item.heirAllocations) {
      if (spouseIds.has(alloc.heirId)) {
        total += alloc.amount;
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
  breakdown.push(`배우자 분배 합계: ${formatKrw(total)}원`);
  return {
    value: total,
    reason: "협의분할 중 배우자 분배 합",
    breakdown,
    isApplicable: true,
  };
}
