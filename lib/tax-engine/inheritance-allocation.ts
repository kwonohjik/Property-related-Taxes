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
 *   13-12: 신고세액공제 (§69 3%)
 *   13-13: 자진납부세액
 *
 * Pure Engine.
 */

import { INH } from "./legal-codes";
import type {
  Heir,
  PriorGift,
  HeirAllocation,
  HeirAllocationResult,
  HeirTaxBreakdown,
  CalculationStep,
  EstateItem,
  PresumedInheritanceItem,
  DebtItem,
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
  /** 상속세 과세표준 */
  taxBase: number;
  /** 산출세액 (할증 전) */
  computedTax: number;
  /** 세대생략 할증세액 (해당 수유자에게 직접 가산) */
  generationSkipSurcharge: number;
  /** 영리법인 면제세액 */
  corporateExemption: number;
  /** 영리법인 사전증여 과세표준 (분모 보정용) */
  corporateGiftTaxBase: number;
  /** grossEstateWithGifts — 간접배부 분모 산정에 사용 */
  grossEstateWithGifts: number;
  /** §69 신고세액공제 적용 여부 (기한 내 신고) */
  isFiledOnTime: boolean;
}

// ────────────────────────────────────────────────────
// 헬퍼 — 자산-수준 분배 집계
// ────────────────────────────────────────────────────

/**
 * heirAllocations에서 heir별 금액 합산. 미정의 시 빈 Map.
 */
function sumAllocationsByHeir(
  items: Array<{ heirAllocations?: HeirAllocation[] }>,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const item of items) {
    if (!item.heirAllocations || item.heirAllocations.length === 0) continue;
    for (const alloc of item.heirAllocations) {
      sums.set(alloc.heirId, (sums.get(alloc.heirId) ?? 0) + alloc.amount);
    }
  }
  return sums;
}

/**
 * 사전증여 가액·과세표준을 상속인별로 합산 (doneeId 기준).
 */
function sumPriorGiftsByDonee(priorGifts: PriorGift[]): {
  amountByDonee: Map<string, number>;
  taxBaseByDonee: Map<string, number>;
  computedTaxByDonee: Map<string, number>;
} {
  const amountByDonee = new Map<string, number>();
  const taxBaseByDonee = new Map<string, number>();
  const computedTaxByDonee = new Map<string, number>();

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
  }

  return { amountByDonee, taxBaseByDonee, computedTaxByDonee };
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
    taxBase,
    computedTax,
    generationSkipSurcharge,
    corporateExemption,
    corporateGiftTaxBase,
    grossEstateWithGifts,
    isFiledOnTime,
  } = params;

  // 13-1: 자산-수준 분배 집계
  const estateByHeir = sumAllocationsByHeir(estateItems);
  const debtByHeir = sumAllocationsByHeir(debtItems);

  // 추정상속재산 분배 (presumedItems[].heirAllocations × presumedAddedById의 비율 적용)
  // 단, 본 PDF 사례는 추정상속재산 배분이 PDF 결과 표에 명시되어 있어
  // heirAllocations 합이 곧 addedAmount와 일치하는 입력 가정.
  const presumedByHeir = new Map<string, number>();
  for (const pi of presumedItems) {
    const added = presumedAddedById.get(pi.id) ?? 0;
    if (added === 0 || !pi.heirAllocations) continue;
    const totalAlloc = pi.heirAllocations.reduce((s, a) => s + a.amount, 0);
    if (totalAlloc === 0) continue;
    for (const alloc of pi.heirAllocations) {
      // 비율 안분 (총 분배 = added이면 비례 그대로)
      const share = Math.floor((added * alloc.amount) / totalAlloc);
      presumedByHeir.set(
        alloc.heirId,
        (presumedByHeir.get(alloc.heirId) ?? 0) + share,
      );
    }
  }

  const { amountByDonee, taxBaseByDonee, computedTaxByDonee } =
    sumPriorGiftsByDonee(priorGifts);

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

  // 직접배부 합계 = Σ상속인 사전증여 과세표준 (영리법인 제외)
  // PDF 책 1864 ② 간접배부대상 = taxBase − 상속인 직접 − 영리법인 사전증여 과세표준
  let totalHeirDirectTaxBase = 0;
  for (const heir of heirs) {
    if (heir.relation === "corporate") continue;
    const heirGiftTaxBase = taxBaseByDonee.get(heir.id) ?? 0;
    totalHeirDirectTaxBase += heirGiftTaxBase;
  }
  const indirectNumerator =
    taxBase - totalHeirDirectTaxBase - corporateGiftTaxBase;

  // 13-12: 배부대상 산출세액 = computedTax − corporateExemption (할증 미포함)
  const distributableTax = computedTax - corporateExemption;

  // 13-8: 산출세액상당액 분모 = taxBase − corporateGiftTaxBase
  const computedTaxShareDenominator = taxBase - corporateGiftTaxBase;

  // 상속인별 배부 계산
  const perHeir = new Map<string, HeirTaxBreakdown>();

  for (const heir of heirs) {
    const isCorporate = heir.relation === "corporate";
    const giftAmount = amountByDonee.get(heir.id) ?? 0;
    const giftTaxBase = taxBaseByDonee.get(heir.id) ?? 0;

    if (isCorporate) {
      // 영리법인: §3의2② 면제. finalTax=0, 사전증여 가액만 표시.
      perHeir.set(heir.id, {
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
      });
      continue;
    }

    // 13-2: 과세가액상당액 = 본래 + 추정 + 사전증여 − 채무 분담
    const directEstateAmount = estateByHeir.get(heir.id) ?? 0;
    const presumedAmount = presumedByHeir.get(heir.id) ?? 0;
    const debtShare = debtByHeir.get(heir.id) ?? 0;
    const taxableValueShare =
      directEstateAmount + presumedAmount + giftAmount - debtShare;

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
    const surchargeForHeir = heir.isGenerationSkipBeneficiary
      ? generationSkipSurcharge
      : 0;

    // 13-10: 사전증여세액공제 (§28 안분 한도)
    //   한도 = floor(상속인별 산출세액상당액 × 사전증여 과세표준 / 과세표준상당액)
    //   공제 = Min(증여세 산출세액(giftTaxPaid), 한도)
    const giftTaxPaid = computedTaxByDonee.get(heir.id) ?? 0;
    let priorGiftCredit = 0;
    if (giftTaxPaid > 0 && taxBaseShare > 0 && directTaxBaseShare > 0) {
      const limit = Number(
        (BigInt(computedTaxShare) * BigInt(directTaxBaseShare)) /
          BigInt(taxBaseShare),
      );
      priorGiftCredit = Math.min(giftTaxPaid, limit);
    }

    // 13-11: 차가감세액 = (산출세액상당액 + 할증) − 사전증여세액공제
    const preFilingCreditTax = computedTaxShare + surchargeForHeir - priorGiftCredit;

    // 13-12: 신고세액공제 = round(차가감 × 3%) — PDF 책 1867 안분 round 적용
    const filingCredit = isFiledOnTime
      ? Math.round(preFilingCreditTax * 0.03)
      : 0;

    // 13-13: 자진납부세액
    const finalTax = preFilingCreditTax - filingCredit;

    perHeir.set(heir.id, {
      heirId: heir.id,
      directEstateAmount,
      priorGiftAmount: giftAmount,
      presumedAmount,
      debtShare,
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
    });
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

  return {
    perHeir,
    distributableTax,
    indirectDistributionBase: indirectDenominator,
    indirectNumerator,
    computedTaxShareDenominator,
    breakdown,
  };
}
