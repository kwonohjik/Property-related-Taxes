/**
 * 상속인별 산출세액 배부 (상증법 §3·§28, 집행기준 19-17-1, 재재산 46014-247, 2000.8.26.)
 *
 * 상속재산을 협의분할로 여러 상속인·수유자·영리법인이 나눠 받는 경우 산출세액을
 * 상속인별로 안분하여 납부 세액을 계산.
 *
 * 산출 순서 (Design §5 STEP 13):
 *   13-2: 상속인별 과세가액상당액 = 직접분배 (본래·간주·추정·사전증여) − 채무·공과·장례비 분담
 *   13-3: 직접배부 과세표준 = max(0, 상속인별 사전증여 과세표준 − 증여공제)
 *   13-4: 간접배부 분모 = grossEstateWithGifts − Σ(상속인·수유자 외 자가 받은 사전증여 가산가액)
 *   13-5: 간접배부 분자 = taxBase − Σ직접배부 − corporateGiftTaxBase
 *   13-6: 상속인별 간접배부 = floor(분자 × (상속인별 과세가액상당액 − 사전증여 가액) / 분모)
 *   13-7: 상속인별 과세표준상당액 = 직접 + 간접
 *   13-8: 상속인별 산출세액상당액 = floor(배부대상 산출세액 × 과세표준상당액 / (taxBase − corporateGiftTaxBase))
 *   13-9: 세대생략 수유자 할증 가산 (분리 가산 — distributableTax는 할증 미포함)
 *   13-10: 사전증여세액공제 (§28 안분 한도)
 *   13-11: 차가감세액
 *   13-12: 신고세액공제 (§69 상속개시일 연도율 — 2016이전 10·2017 7·2018 5·2019~ 3%)
 *   13-13: 자진납부세액
 *
 * Pure Engine.
 */

import { INH } from "./legal-codes";
import {
  computeLegalShares,
  distributeByLegalShares,
  type LegalShareResult,
} from "./inheritance-legal-share";
import {
  buildSummaryCategory,
  emptyCategoryBreakdown,
  type CategoryBreakdown,
} from "./inheritance-asset-category";
import { isForProfitCorporate, isInheritanceTaxPayer } from "./inheritance-gift-common";
import {
  resolveAllocationsByHeir,
  computeExemptByHeir,
  computeDebtByHeirWithFuneralCap,
} from "./inheritance-allocation-deductions";
import type {
  Heir,
  PriorGift,
  HeirAllocation,
  HeirAllocationResult,
  AllocationMismatch,
  HeirTaxBreakdown,
  CalculationStep,
  EstateItem,
  PresumedInheritanceItem,
  DebtItem,
  ExemptionCheckedItem,
} from "./types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// 헬퍼 — BigInt 안분 round (PDF 책 1864 안분식은 소수점 round 적용)
// ────────────────────────────────────────────────────

function bigIntRoundDiv(numer: bigint, denom: bigint): number {
  if (denom === 0n) return 0;
  const q = numer / denom;
  const r = numer - q * denom;
  return r * 2n >= denom ? Number(q) + 1 : Number(q);
}

// ────────────────────────────────────────────────────
// PRE-4 anchor용 단독 share 계산 입력
// ────────────────────────────────────────────────────

export interface HeirTaxBaseShareInput {
  heirId: string;
  /** 상속인별 과세가액상당액 (본래·간주·추정·사전증여 − 채무) */
  taxableValueShare: number;
  /** 상속인별 사전증여 가산가액 (gross) */
  priorGiftAmount: number;
  /** 상속인별 사전증여 과세표준 */
  priorGiftTaxBase: number;
  /** 상속인별 증여공제 합계 */
  priorGiftDeduction: number;
  /** 간접배부 분자 (taxBase − Σ직접 − corporateGiftTaxBase) */
  indirectNumerator: number;
  /** 간접배부 분모 (grossEstateWithGifts − Σ(상속인·수유자 외 자 사전증여 가액)) */
  indirectDenominator: number;
}

/**
 * 상속인 단독 과세표준상당액 산출 (PRE-4 anchor용).
 *
 * 직접배부 = max(0, 사전증여 과세표준 − 증여공제)
 *   ※ giftTaxBase는 통상 이미 증여공제 후 값. 입력측 어느 단계인지에 따라 fallback 처리.
 *
 * 간접배부 = floor(indirectNumerator × (taxableValueShare − priorGiftAmount) / indirectDenominator)
 */
export function calcHeirTaxBaseShare(input: HeirTaxBaseShareInput): {
  directTaxBaseShare: number;
  indirectTaxBaseShare: number;
  taxBaseShare: number;
} {
  // 직접배부: 사전증여 과세표준 (이미 공제 후) 그대로 사용.
  // priorGiftDeduction이 별도 제공된 경우만 추가 차감.
  const directTaxBaseShare = Math.max(
    0,
    input.priorGiftTaxBase - 0, // priorGiftTaxBase는 이미 증여공제 후 — 추가 차감 없음
  );

  // 간접배부 = floor(numerator × (taxableValueShare − priorGiftAmount) / denominator)
  // BigInt 사용 — JS Number 2^53 한계 초과 곱셈 정밀도 손실 방지
  const indirectBase = input.taxableValueShare - input.priorGiftAmount;
  const indirectTaxBaseShare =
    input.indirectDenominator > 0
      ? bigIntRoundDiv(
          BigInt(input.indirectNumerator) * BigInt(indirectBase),
          BigInt(input.indirectDenominator),
        )
      : 0;

  return {
    directTaxBaseShare,
    indirectTaxBaseShare,
    taxBaseShare: directTaxBaseShare + indirectTaxBaseShare,
  };
}

// ────────────────────────────────────────────────────
// 통합 배부 입력
// ────────────────────────────────────────────────────

export interface HeirAllocationParams {
  heirs: Heir[];
  estateItems: EstateItem[];
  presumedItems: PresumedInheritanceItem[];
  debtItems: DebtItem[];
  priorGifts: PriorGift[];
  /** 추정상속재산 항목별 가산액 — items가 PresumedInheritanceItemResult 매핑된 결과 (id→addedAmount) */
  presumedAddedById: Map<string, number>;
  /** estateItem id → 평가액(valuatedAmount). 협의분할 미입력 자산의 법정상속분 배분 기준 */
  valuatedAmountById: Map<string, number>;
  /** 상속세 과세표준 */
  taxBase: number;
  /** 산출세액 (할증 전) */
  computedTax: number;
  /** 세대생략 할증세액 (해당 수유자에게 직접 가산) */
  generationSkipSurcharge: number;
  /**
   * §27 per-heir 할증세액 Map (heirId → 개별 할증액).
   * STEP 9 per-heir 경로 시 존재 — undefined면 레거시 단일 fallback 사용.
   */
  perHeirSurcharge?: Record<string, number>;
  /** 영리법인 면제세액 */
  corporateExemption: number;
  /** 영리법인 사전증여 과세표준 (분모 보정용) */
  corporateGiftTaxBase: number;
  /** grossEstateWithGifts — 간접배부 분모 산정에 사용 */
  grossEstateWithGifts: number;
  /** §69 신고세액공제 적용 여부 (기한 내 신고) */
  isFiledOnTime: boolean;
  /**
   * §69 신고세액공제율 (상속개시일 연도별 — 2016이전 0.1·2017 0.07·2018 0.05·2019~ 0.03).
   * resolveFilingCreditRate(deathDate) 결과. 미전달 시 배부표가 3% 고정되어 요약(연도율)을
   * reconcile로 덮어써 2019년 이전 상속 과다과세.
   */
  filingCreditRate: number;
  /** 비과세 항목 (협의분할 분배 소스). 작업4 — 미입력 시 빈 배열로 무영향 */
  exemptionItems?: ExemptionCheckedItem[];
  /** ruleId → 인정 비과세액(itemResults[].exemptAmount). per-heir 차감 target. 작업4 */
  recognizedExemptByRuleId?: Map<string, number>;
}


/**
 * 사전증여 가액·과세표준을 상속인별로 합산 (doneeId 기준).
 */
function sumPriorGiftsByDonee(priorGifts: PriorGift[]): {
  amountByDonee: Map<string, number>;
  taxBaseByDonee: Map<string, number>;
  computedTaxByDonee: Map<string, number>;
  corporateComputedTaxByDonee: Map<string, number>;
} {
  const amountByDonee = new Map<string, number>();
  const taxBaseByDonee = new Map<string, number>();
  const computedTaxByDonee = new Map<string, number>();
  const corporateComputedTaxByDonee = new Map<string, number>();

  for (const gift of priorGifts) {
    if (!gift.doneeId) continue;
    amountByDonee.set(
      gift.doneeId,
      (amountByDonee.get(gift.doneeId) ?? 0) + gift.giftAmount,
    );
    taxBaseByDonee.set(
      gift.doneeId,
      (taxBaseByDonee.get(gift.doneeId) ?? 0) +
        (gift.giftTaxBase ?? gift.giftAmount),
    );
    computedTaxByDonee.set(
      gift.doneeId,
      (computedTaxByDonee.get(gift.doneeId) ?? 0) + gift.giftTaxPaid,
    );
    // ⑩a 영리법인 증여세 산출세액 — PriorGift 단일 진실 (Heir.corporateGiftComputedTax 죽은 필드 대체).
    // 자연인 gift는 corporateGiftComputedTax undefined(→0)이라 키 값 0 — corporate 분기에서만 사용(무해).
    corporateComputedTaxByDonee.set(
      gift.doneeId,
      (corporateComputedTaxByDonee.get(gift.doneeId) ?? 0) +
        (gift.corporateGiftComputedTax ?? 0),
    );
  }

  return {
    amountByDonee,
    taxBaseByDonee,
    computedTaxByDonee,
    corporateComputedTaxByDonee,
  };
}

// ────────────────────────────────────────────────────
// A-4: §27 분자 집계 헬퍼 — STEP 8.5·STEP 9·STEP 13 공유 (단일 진실)
// ────────────────────────────────────────────────────

/**
 * heir별 재산가액 집계 (§27 분자 도출용 — STEP 8.5).
 * 내부 resolveAllocationsByHeir를 래핑하여 STEP 8.5와 STEP 13이 동일 로직 공유.
 *
 * @param estateItems 상속재산 항목 배열
 * @param valuatedAmountById estateItem id → 평가액 Map
 * @param legalShares 법정상속분 (computeLegalShares 결과)
 * @returns Map<heirId, 수령 재산가액>
 */
export function aggregateEstateByHeir(
  estateItems: EstateItem[],
  valuatedAmountById: Map<string, number>,
  legalShares: LegalShareResult,
): Map<string, number> {
  return resolveAllocationsByHeir(
    estateItems,
    (it) => valuatedAmountById.get(it.id) ?? 0,
    legalShares,
  );
}

/**
 * §13 cutoff 필터 후 수증자별 사전증여 가액 집계 (§27 분자 도출용 — STEP 8.5).
 * 내부 sumPriorGiftsByDonee.amountByDonee를 래핑.
 *
 * @param cutoffFilteredGifts isWithin13Cutoff 필터 완료된 사전증여 배열
 * @returns Map<doneeId, 증여가액 합계>
 */
export function aggregatePriorGiftByDonee(
  cutoffFilteredGifts: PriorGift[],
): Map<string, number> {
  return sumPriorGiftsByDonee(cutoffFilteredGifts).amountByDonee;
}

// ────────────────────────────────────────────────────
// 통합 배부 계산
// ────────────────────────────────────────────────────

/**
 * 상속인·수유자·영리법인별 산출세액 배부 (Design §5 STEP 13).
 */
export function calcHeirAllocation(
  params: HeirAllocationParams,
): HeirAllocationResult {
  const {
    heirs,
    estateItems,
    presumedItems,
    debtItems,
    priorGifts,
    presumedAddedById,
    valuatedAmountById,
    taxBase,
    computedTax,
    generationSkipSurcharge,
    perHeirSurcharge,
    corporateExemption,
    corporateGiftTaxBase,
    grossEstateWithGifts,
    isFiledOnTime,
    filingCreditRate,
    exemptionItems = [],
    recognizedExemptByRuleId = new Map(),
  } = params;

  // §69 율 → 정수 퍼센트 (이산값 0.1·0.07·0.05·0.03 — 부동소수 반올림·절사 회피 위해 임계 비교).
  //   per-heir 안분 신고세액공제는 bigIntRoundDiv(정수 round-half-up)로 산정.
  const filingRatePct =
    filingCreditRate >= 0.1
      ? 10
      : filingCreditRate >= 0.07
        ? 7
        : filingCreditRate >= 0.05
          ? 5
          : 3;

  // 법정상속분 (협의분할 미입력 자산 자동 배분 기준 — 민법 §1009·§1003·§1000)
  const legalShares = computeLegalShares(heirs);

  // 비과세·과세가액 불산입 상속인별 차감액 (작업4 — 후보② 별도 항 차감)
  // ㉠ 분리: 비과세(§11·§12) / 과세가액 불산입(§16·§17) 2맵. exemptShare(합)는 heir 분기에서 재구성.
  const { nonTaxableByHeir, notIncludedByHeir } = computeExemptByHeir(
    exemptionItems,
    recognizedExemptByRuleId,
    legalShares,
  );

  // echo — 미입력 자산이 법정상속분으로 자동 배분되었는지 (결과 카드 안내용)
  const isUnallocated = (x: { heirAllocations?: HeirAllocation[] }) =>
    !x.heirAllocations || x.heirAllocations.length === 0;
  const usedLegalShareFallback =
    legalShares.shares.length > 0 &&
    (estateItems.some(isUnallocated) ||
      debtItems.some(isUnallocated) ||
      presumedItems.some(
        (pi) => (presumedAddedById.get(pi.id) ?? 0) > 0 && isUnallocated(pi),
      ));

  // 13-1: 자산-수준 분배 집계 (미입력 자산은 법정상속분 fallback)
  const estateByHeir = resolveAllocationsByHeir(
    estateItems,
    (it) => valuatedAmountById.get(it.id) ?? 0,
    legalShares,
  );

  // Phase B4: 자산 4분류 categoryBreakdown 집계 (PDF 표8 상단 4행 echo)
  const categoryBreakdownByHeir = new Map<string, CategoryBreakdown>();
  for (const heir of heirs) {
    categoryBreakdownByHeir.set(heir.id, emptyCategoryBreakdown());
  }
  for (const item of estateItems) {
    const cat = buildSummaryCategory(item);
    const amount = valuatedAmountById.get(item.id) ?? 0;
    if (item.heirAllocations && item.heirAllocations.length > 0) {
      for (const alloc of item.heirAllocations) {
        const bucket = categoryBreakdownByHeir.get(alloc.heirId);
        if (bucket) bucket[cat] += alloc.amount;
      }
    } else {
      // 법정상속분 fallback (corp·legatee 자동 제외 — inheritance-legal-share.ts:36-37)
      const dist = distributeByLegalShares(amount, legalShares);
      for (const [heirId, amt] of dist) {
        const bucket = categoryBreakdownByHeir.get(heirId);
        if (bucket) bucket[cat] += amt;
      }
    }
  }
  // T7 (R3): 장례비 §14 한도(식대 1천만·봉안 5백만)를 인별 배부에도 적용.
  //   엔진 과세가액 차감(deductedBeforeAggregation)은 capped인데 per-heir debtShare가
  //   uncapped(it.amount)면 ㉡ 합계≠실제공제(18M 갭)·per-heir ④ 과다차감.
  //   funeral을 식대/봉안 category별로 raw 분배 → capped로 scaleAllocations(잔액 흡수)하여 병합.
  // ㉡ 분리: 채무(financial+personal) / 공과금(tax) / 장례비(funeral, capped) 3맵.
  //   debtShare(합)는 heir 분기에서 재구성 → 기존 산식 불변.
  const { debtPrincipalByHeir, publicChargeByHeir, funeralByHeir } =
    computeDebtByHeirWithFuneralCap(debtItems, legalShares);

  // 추정상속재산 분배 — heirAllocations 입력 항목은 개별 비율 안분, 미입력 항목은 법정상속분.
  // ★ 미입력 항목이 여럿이면 added를 합산한 뒤 **1회만** distributeByLegalShares 적용.
  //   (항목별로 floor 안분하면 매 항목 잔액 흡수자(최다분자 상속인)가 +오차를 누적해
  //    350M → 배우자 150,000,004 / 자녀 99,999,998 같은 오차 발생. 합산 1회 안분으로 차단.)
  const presumedByHeir = new Map<string, number>();
  let unallocatedPresumedTotal = 0; // 미입력(법정상속분 fallback) 항목 added 합산
  for (const pi of presumedItems) {
    const added = presumedAddedById.get(pi.id) ?? 0;
    if (added === 0) continue;
    const totalAlloc =
      pi.heirAllocations?.reduce((s, a) => s + a.amount, 0) ?? 0;
    if (pi.heirAllocations && pi.heirAllocations.length > 0 && totalAlloc > 0) {
      // 협의분할 입력 — 개별 비율 안분 (사용자 명시 분배. 통상 added == totalAlloc)
      // L-2 수정: 마지막 항목에 잔액 흡수 (feedback_floor_residual_absorption)
      //   added != totalAlloc 시 각 항목 독립 floor → Σshare < added 최대 (n-1)원.
      //   마지막 alloc에서 앞 항목 floor 합을 뺀 잔액을 배분하여 Σ == added 보장.
      //   통상 케이스(added == totalAlloc)에선 마지막 항목도 동일 floor 값 → 결과 불변.
      let allocatedSum = 0;
      const allocs = pi.heirAllocations;
      for (let ai = 0; ai < allocs.length; ai++) {
        const alloc = allocs[ai];
        const isLast = ai === allocs.length - 1;
        const share = isLast
          ? added - allocatedSum  // 잔액 흡수 — Σ == added 보장
          : Math.floor((added * alloc.amount) / totalAlloc);
        allocatedSum += share;
        presumedByHeir.set(
          alloc.heirId,
          (presumedByHeir.get(alloc.heirId) ?? 0) + share,
        );
      }
    } else {
      // 미입력(또는 빈 협의분할) — 합산 후 일괄 안분 대상에 누적
      unallocatedPresumedTotal += added;
    }
  }
  if (unallocatedPresumedTotal > 0) {
    const dist = distributeByLegalShares(unallocatedPresumedTotal, legalShares);
    for (const [heirId, amt] of dist) {
      presumedByHeir.set(heirId, (presumedByHeir.get(heirId) ?? 0) + amt);
    }
  }

  const {
    amountByDonee,
    taxBaseByDonee,
    computedTaxByDonee,
    corporateComputedTaxByDonee,
  } = sumPriorGiftsByDonee(priorGifts);

  // 13-3: 직접배부 과세표준 = priorGiftTaxBase (이미 증여공제 후 값)
  // 13-4 & 13-5: 간접배부 분모·분자
  // 분모 = grossEstateWithGifts − Σ(상속인·수유자 외 자 사전증여 가산가액)
  // PDF 책 1864 산식: "(증여재산가액을 제외한 상속세 과세가액)"
  //   = 과세가액 − 가산 증여재산 가액 (모든 수증자)
  //   PDF: 8,775M − 760M − 1,500M − 700M = 5,815M
  const totalPriorGiftAmount = priorGifts.reduce(
    (s, g) => s + g.giftAmount,
    0,
  );
  const indirectDenominator = grossEstateWithGifts - totalPriorGiftAmount;

  // 비상속인(상속인·수유자 외) 자연인 집계 (§3의2①·§28② 본문) — 영리법인과 평행 처리.
  //   후순위 other·인척(며느리 등 사전증여만)은 isInheritanceTaxPayer=false.
  //   영리법인과 동일하게 분모·분자·distributableTax에서 제외 + §28②본문 공제(⑩).
  const nonPayerNaturals = heirs.filter(
    (h) => !isForProfitCorporate(h) && !isInheritanceTaxPayer(h, legalShares),
  );
  const nonPayerNaturalGiftTaxBase = nonPayerNaturals.reduce(
    (s, h) => s + (taxBaseByDonee.get(h.id) ?? 0),
    0,
  );
  // §28② 본문 공제 합 = Σ Min(증여세 산출세액, floor(computedTax × giftTaxBase / taxBase))
  //   (§3의2② 영리법인 면제와 동일 산식 — inheritance-corporate-exemption.ts:102)
  const nonPayerNaturalGiftCredit = nonPayerNaturals.reduce((s, h) => {
    const gtb = taxBaseByDonee.get(h.id) ?? 0;
    const giftTax = computedTaxByDonee.get(h.id) ?? 0;
    const limit = taxBase > 0 && gtb > 0 ? Math.floor((computedTax * gtb) / taxBase) : 0;
    return s + Math.min(giftTax, limit);
  }, 0);

  // 직접배부 합계 = Σ상속인 사전증여 과세표준 (영리법인 + 비상속인 자연인 제외)
  // PDF 책 1864 ② 간접배부대상 = taxBase − 상속인 직접 − 비납세의무자 사전증여 과세표준
  let totalHeirDirectTaxBase = 0;
  for (const heir of heirs) {
    if (!isInheritanceTaxPayer(heir, legalShares)) continue; // 영리법인 + 비상속인 자연인 제외
    const heirGiftTaxBase = taxBaseByDonee.get(heir.id) ?? 0;
    totalHeirDirectTaxBase += heirGiftTaxBase;
  }
  const indirectNumerator =
    taxBase - totalHeirDirectTaxBase - corporateGiftTaxBase - nonPayerNaturalGiftTaxBase;

  // 13-12: 배부대상 산출세액 = computedTax − 영리법인 면제 − 비상속인 자연인 §28②본문 공제 (할증 미포함)
  const distributableTax = computedTax - corporateExemption - nonPayerNaturalGiftCredit;

  // 13-8: 산출세액상당액 분모 = taxBase − 영리법인 − 비상속인 자연인 사전증여 과세표준
  const computedTaxShareDenominator =
    taxBase - corporateGiftTaxBase - nonPayerNaturalGiftTaxBase;

  // 상속인별 배부 계산 — Record (JSON-native, Map 직렬화 소실 방지)
  const perHeir: Record<string, HeirTaxBreakdown> = {};

  for (const heir of heirs) {
    const isCorporate = isForProfitCorporate(heir); // 영리법인만 면제 분기 — 비영리법인은 자연인(수유자) 과세
    const giftAmount = amountByDonee.get(heir.id) ?? 0;
    const giftTaxBase = taxBaseByDonee.get(heir.id) ?? 0;

    if (isCorporate) {
      // 영리법인: §3의2② 면제. finalTax=0, 사전증여 가액만 표시.
      // Phase B4 D-6: §3의2② 한도 echo (inheritance-corporate-exemption.ts:101과 동일 산식)
      const corpLimit =
        taxBase > 0 && giftTaxBase > 0
          ? Math.floor((computedTax * giftTaxBase) / taxBase)
          : 0;
      perHeir[heir.id] = {
        heirId: heir.id,
        directEstateAmount: 0,
        priorGiftAmount: giftAmount,
        presumedAmount: 0,
        debtShare: 0,
        taxableValueShare: giftAmount, // 영리법인은 사전증여만
        directTaxBaseShare: giftTaxBase,
        indirectTaxBaseShare: 0,
        taxBaseShare: giftTaxBase,
        computedTaxShare: 0,
        generationSkipSurcharge: 0,
        priorGiftCredit: 0,
        preFilingCreditTax: 0,
        filingCredit: 0,
        finalTax: 0,
        // Phase B2 echo — corp 분기
        categoryBreakdown: emptyCategoryBreakdown(),
        grossInheritance: 0,
        priorGiftCreditLimit: corpLimit, // ⑩b 영리법인 적용값 (할증 미포함)
        priorGiftComputedTax:
          corporateComputedTaxByDonee.get(heir.id) ??
          (heir.corporateGiftComputedTax || 0), // ⑩a — PriorGift 단일 진실
        isTaxPayer: false, // §3의2① 영리법인 납부의무 제외
      };
      continue;
    }

    // 비상속인 자연인 (후순위 other·인척 — 며느리 등 사전증여만): §3의2① 납부의무 없음.
    //   ⑪ 산출세액 배부·⑫ 증여세액공제 제외. ⑩ §28② 본문 증여세액공제 echo (영리법인 §3의2②와 평행).
    if (!isInheritanceTaxPayer(heir, legalShares)) {
      const limit =
        taxBase > 0 && giftTaxBase > 0
          ? Math.floor((computedTax * giftTaxBase) / taxBase)
          : 0;
      const giftTax = computedTaxByDonee.get(heir.id) ?? 0;
      perHeir[heir.id] = {
        heirId: heir.id,
        directEstateAmount: 0,
        priorGiftAmount: giftAmount,
        presumedAmount: 0,
        debtShare: 0,
        taxableValueShare: giftAmount, // 비상속인은 사전증여 가산분만
        directTaxBaseShare: giftTaxBase, // ⑥ 직접배부 표시 echo (분모는 위에서 제외)
        indirectTaxBaseShare: 0,
        taxBaseShare: giftTaxBase,
        computedTaxShare: 0, // ⑪ 배부 제외
        generationSkipSurcharge: 0,
        priorGiftCredit: 0, // ⑫ 제외
        preFilingCreditTax: 0,
        filingCredit: 0,
        finalTax: 0,
        categoryBreakdown: emptyCategoryBreakdown(),
        grossInheritance: 0,
        isTaxPayer: false,
        nonHeirGiftCreditLimit: limit, // ⑩b §28②본문 한도
        nonHeirGiftCredit: Math.min(giftTax, limit), // ⑩c = Min(증여세, 한도)
        priorGiftComputedTax: giftTax, // ⑩a
      };
      continue;
    }

    // 13-2: 과세가액상당액 = 본래 + 추정 + 사전증여 − 채무 분담 − 비과세 차감(작업4)
    const directEstateAmount = estateByHeir.get(heir.id) ?? 0;
    const presumedAmount = presumedByHeir.get(heir.id) ?? 0;
    // ㉡ 3분할 재구성 → debtShare(합) 불변
    const debtPrincipalShare = debtPrincipalByHeir.get(heir.id) ?? 0;
    const publicChargeShare = publicChargeByHeir.get(heir.id) ?? 0;
    const funeralShare = funeralByHeir.get(heir.id) ?? 0;
    const debtShare = debtPrincipalShare + publicChargeShare + funeralShare;
    // ㉠ 2분할 재구성 → exemptShare(합) 불변
    const nonTaxableShare = nonTaxableByHeir.get(heir.id) ?? 0;
    const notIncludedShare = notIncludedByHeir.get(heir.id) ?? 0;
    const exemptShare = nonTaxableShare + notIncludedShare;
    // 후보②(anchor A1): 별도 항 차감 + 음수 가드. exemptShare는 인정 비과세액의 상속인별 안분.
    const taxableValueShare = Math.max(
      0,
      directEstateAmount + presumedAmount + giftAmount - debtShare - exemptShare,
    );

    // 13-3: 직접배부 = giftTaxBase (이미 공제 후)
    const directTaxBaseShare = giftTaxBase;

    // 13-6: 간접배부 = floor(indirectNumerator × (taxableValueShare − giftAmount) / indirectDenominator)
    // BigInt — 2^53 초과 곱셈 정밀도 손실 방지
    const indirectBase = taxableValueShare - giftAmount;
    const indirectTaxBaseShare =
      indirectDenominator > 0
        ? bigIntRoundDiv(
            BigInt(indirectNumerator) * BigInt(indirectBase),
            BigInt(indirectDenominator),
          )
        : 0;

    // 13-7: 과세표준상당액 = 직접 + 간접
    const taxBaseShare = directTaxBaseShare + indirectTaxBaseShare;

    // 13-8: 산출세액상당액 — PDF 책 1867 안분 round 적용
    const computedTaxShare =
      computedTaxShareDenominator > 0
        ? bigIntRoundDiv(
            BigInt(distributableTax) * BigInt(taxBaseShare),
            BigInt(computedTaxShareDenominator),
          )
        : 0;

    // 13-9: 세대생략 할증 가산 (수유자만)
    // per-heir 경로: perHeirSurcharge[id] 개별값, 레거시: generationSkipSurcharge 전액
    const surchargeForHeir = perHeirSurcharge != null
      ? (perHeirSurcharge[heir.id] ?? 0)
      : (heir.isGenerationSkipBeneficiary ? generationSkipSurcharge : 0);

    // 13-10: 사전증여세액공제 (§28 안분 한도)
    //   한도 = floor(상속인별 산출세액상당액 × 사전증여 과세표준 / 과세표준상당액)
    //   공제 = Min(증여세 산출세액(giftTaxPaid), 한도)
    const giftTaxPaid = computedTaxByDonee.get(heir.id) ?? 0;
    let priorGiftCredit = 0;
    let priorGiftCreditLimitForEcho = 0; // Phase B2 echo (⑫b)
    if (taxBaseShare > 0 && directTaxBaseShare > 0) {
      // PDF 책 안분 round-half-up — BigInt floor는 1원 차이 발생
      priorGiftCreditLimitForEcho = bigIntRoundDiv(
        BigInt(computedTaxShare) * BigInt(directTaxBaseShare),
        BigInt(taxBaseShare),
      );
      if (giftTaxPaid > 0) {
        priorGiftCredit = Math.min(giftTaxPaid, priorGiftCreditLimitForEcho);
      }
    }

    // 13-11: 차가감세액 = (산출세액상당액 + 할증) − 사전증여세액공제
    const preFilingCreditTax = computedTaxShare + surchargeForHeir - priorGiftCredit;

    // 13-12: 신고세액공제 = round(차가감 × §69 연도율) — PDF 책 1867 안분 round 적용.
    //   율은 상속개시일 연도별(filingRatePct). 3% 고정 시 2019년 이전 상속 과다과세.
    const filingCredit = isFiledOnTime
      ? bigIntRoundDiv(BigInt(preFilingCreditTax) * BigInt(filingRatePct), 100n)
      : 0;

    // 13-13: 자진납부세액
    const finalTax = preFilingCreditTax - filingCredit;

    // Phase B4 echo — heir 분기
    // *5 부담비율 = taxBaseShare / (taxBase − corporate 사전증여 과세표준) — 4자리 절사
    // PDF 책 표8 0.3169·0.4772·0.1596·0.0461 모두 절사(floor) — round-down
    const burdenRatio =
      computedTaxShareDenominator > 0
        ? Math.floor((taxBaseShare / computedTaxShareDenominator) * 10000) /
          10000
        : 0;

    perHeir[heir.id] = {
      heirId: heir.id,
      directEstateAmount,
      priorGiftAmount: giftAmount,
      presumedAmount,
      debtShare,
      excludedFromTaxation: exemptShare, // ㉠ 과세제외 per-heir (작업4 — 죽은 필드 활성화)
      // ㉠ 2행·㉡ 3행 분리 echo (합 필드 보존, 표시 전용)
      nonTaxableShare,
      notIncludedShare,
      debtPrincipalShare,
      publicChargeShare,
      funeralShare,
      taxableValueShare,
      directTaxBaseShare,
      indirectTaxBaseShare,
      taxBaseShare,
      computedTaxShare,
      generationSkipSurcharge: surchargeForHeir,
      priorGiftCredit,
      preFilingCreditTax,
      filingCredit,
      finalTax,
      // Phase B2 echo — heir 분기
      priorGiftCreditLimit: priorGiftCreditLimitForEcho, // ⑫b
      priorGiftComputedTax: giftTaxPaid, // ⑫a
      burdenRatio, // *5
      isTaxPayer: true, // §3의2① 상속인·수유자 납부의무자
    };
  }

  // T10 (N4): 배부 총액 보존 — 잔액 흡수.
  //   간접배부·산출세액 배부는 상속인별 독립 round로 floor 잔차가 남아 Σ가 분자와 ±N원 어긋난다.
  //   (T2·T7로 Σbase==분모 성립 후엔 잔차만 남음 — 1.435% 과다배부는 T2·T7이 이미 제거.)
  //   최다 과세표준상당액(taxBaseShare) 비-corp 상속인에 잔차 흡수 → Σ indirect==indirectNumerator,
  //   Σ computedTaxShare==distributableTax 정확 보존. 흡수 상속인의 하류 필드 재계산.
  {
    // §3의2① 납부의무자만 잔액 흡수 대상 (비상속인 사전증여자 등 isTaxPayer=false 제외 — 세액 오귀속 방지)
    const nonCorp = heirs.filter(
      (h) => !isForProfitCorporate(h) && perHeir[h.id] && perHeir[h.id].isTaxPayer,
    );
    if (nonCorp.length > 0 && indirectDenominator > 0 && computedTaxShareDenominator > 0) {
      const absorber = nonCorp.reduce((a, b) =>
        perHeir[b.id].taxBaseShare > perHeir[a.id].taxBaseShare ? b : a,
      );
      const ab = perHeir[absorber.id];

      // (1) 간접배부 잔차 → indirect·taxBaseShare
      const sumIndirect = nonCorp.reduce((s, h) => s + perHeir[h.id].indirectTaxBaseShare, 0);
      const indirectResidual = indirectNumerator - sumIndirect;
      ab.indirectTaxBaseShare += indirectResidual;
      ab.taxBaseShare += indirectResidual;

      // (2) 산출세액 배부 잔차 → computedTaxShare (Σ==distributableTax)
      const sumComputed = nonCorp.reduce((s, h) => s + perHeir[h.id].computedTaxShare, 0);
      const computedResidual = distributableTax - sumComputed;
      ab.computedTaxShare += computedResidual;

      // (3) 흡수 상속인 하류 재계산 (preFiling → filing → final → burden → §28 한도 echo)
      if (ab.taxBaseShare > 0 && ab.directTaxBaseShare > 0) {
        const newLimit = bigIntRoundDiv(
          BigInt(ab.computedTaxShare) * BigInt(ab.directTaxBaseShare),
          BigInt(ab.taxBaseShare),
        );
        ab.priorGiftCreditLimit = newLimit;
        const giftTaxPaidAb = computedTaxByDonee.get(absorber.id) ?? 0;
        ab.priorGiftCredit = giftTaxPaidAb > 0 ? Math.min(giftTaxPaidAb, newLimit) : 0;
      }
      ab.preFilingCreditTax = ab.computedTaxShare + ab.generationSkipSurcharge - ab.priorGiftCredit;
      ab.filingCredit = isFiledOnTime
        ? bigIntRoundDiv(BigInt(ab.preFilingCreditTax) * BigInt(filingRatePct), 100n)
        : 0;
      ab.finalTax = ab.preFilingCreditTax - ab.filingCredit;
      ab.burdenRatio =
        Math.floor((ab.taxBaseShare / computedTaxShareDenominator) * 10000) / 10000;
    }
  }

  // Phase B4: categoryBreakdown · grossInheritance를 heir 분기에 후입력
  for (const heir of heirs) {
    if (isForProfitCorporate(heir)) continue; // 영리법인만 제외 — 비영리법인 후입력 포함
    const bd = categoryBreakdownByHeir.get(heir.id);
    if (bd && perHeir[heir.id]) {
      perHeir[heir.id].categoryBreakdown = bd;
      perHeir[heir.id].grossInheritance =
        bd.financial + bd.realEstate + bd.stock + bd.other;
    }
  }

  const breakdown: CalculationStep[] = [
    {
      label: "배부대상 산출세액 (산출세액 − 영리법인 면제, 할증 미포함)",
      amount: distributableTax,
      lawRef: INH.TAXPAYER,
    },
    {
      label: "간접배부 분자 (taxBase − Σ상속인 직접 − 영리법인 사전증여 과세표준)",
      amount: indirectNumerator,
      lawRef: INH.TAXPAYER,
    },
    {
      label: "간접배부 분모 (grossEstateWithGifts − Σ사전증여 가액)",
      amount: indirectDenominator,
      lawRef: INH.TAXPAYER,
    },
    {
      label: "산출세액상당액 분모 (taxBase − 영리법인 사전증여 과세표준)",
      amount: computedTaxShareDenominator,
      lawRef: INH.TAXPAYER,
    },
  ];

  // T3(a): 자산 단위 정합 가드 — 협의분할 합 ≠ 엔진 평가액(valuatedAmountById) 자산 echo.
  //   정상 흐름은 validateEstateItemAllocations가 선차단 → 비어 있음. 검증 우회 방어용.
  const allocationMismatch: AllocationMismatch[] = [];
  for (const item of estateItems) {
    if (!item.heirAllocations || item.heirAllocations.length === 0) continue;
    const expected = valuatedAmountById.get(item.id) ?? 0;
    if (expected === 0) continue;
    const actual = item.heirAllocations.reduce((s, a) => s + a.amount, 0);
    if (actual !== expected) {
      allocationMismatch.push({ assetId: item.id, expected, actual, delta: actual - expected });
    }
  }

  return {
    perHeir,
    distributableTax,
    indirectDistributionBase: indirectDenominator,
    indirectNumerator,
    computedTaxShareDenominator,
    usedLegalShareFallback,
    breakdown,
    ...(allocationMismatch.length > 0 ? { allocationMismatch } : {}),
  };
}
