/**
 * 주식 양도세 분할 매수·분할 양도 lot 매칭 엔진
 *
 * 법령 근거:
 *  - 소득세법 §104② — 보유기간 기산점 (lot별 cause 분기)
 *    1호: 상속 → 피상속인 취득일
 *    2호: §97의2 (주식은 미적용 — gift는 수증일 = lot.acquisitionDate)
 *    3호: 합병·분할 → 종전 주식 취득일
 *  - 소득세법 §104①11호 가목 1)·2) — 단기 30% / 누진 (대주주 + 비SME)
 *  - 소령 §163⑨ — 상속/증여 lot의 평가가액 (사용자 직접 입력)
 *
 * 산정방법 (KoreanLaw 검색 NOT_FOUND — 양도세 명문 부재):
 *  - 시행령 §162의2는 지하수개발권 조문 (FIFO와 무관)
 *  - 동일종목 분할매수의 취득가 산정 방법은 양도세 명문 규정 없음 — 납세자 입증책임
 *  - "이동평균법" 표준 정의: 법인세법 시행령 §74①1마(참조 — 법인 재고자산 평가,
 *    개인 양도세 직접 근거 아님). "취득할 때마다 장부시재금액÷장부시재수량 평균단가".
 *  - 본 모듈은 사용자 선택 3종 지원:
 *    1. specific (개별법) — 매도 lot당 매수 lot 명시 매칭 (입증 가능 시)
 *    2. fifo (선입선출법) — lot.acquisitionDate ASC 순차 차감
 *    3. moving_avg (이동평균법) — 각 매도 시점까지 취득분으로 평균단가 재계산 [B-3].
 *       단가는 매도 시점별 이동평균, 보유기간(§104②)은 FIFO lot startDate (하이브리드).
 *
 * 본 모듈은 helpers.ts의 calcHoldingPeriod()를 사용하지 않고 lot별 §104② 기산점을 자체 계산.
 * (single 모드는 stock-transfer-tax.ts에서 기존 calcHoldingPeriod() 사용 유지)
 */

import { differenceInDays } from "date-fns";
import type {
  AcquisitionLot,
  TransferLot,
  SpecificMatching,
  MatchedSubLot,
  LotMatchingDetail,
} from "./types/stock-transfer.types";
import {
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
} from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_MAJOR_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";

// ============================================================
// §104② lot별 기산점 결정
// ============================================================

/**
 * lot별 §104② 보유기간 기산일.
 * - purchase: lot.acquisitionDate
 * - inheritance: lot.decedentAcquisitionDate ?? lot.acquisitionDate (fallback은 validate에서 차단되어야 함)
 * - gift: lot.acquisitionDate (수증일 — 주식은 §97의2 미적용, helpers.ts:54-58)
 * - merger_split: lot.preMergerAcquisitionDate ?? lot.acquisitionDate
 */
export function resolveLotStartDate(lot: AcquisitionLot): Date {
  switch (lot.acquisitionCause) {
    case "inheritance":
      return lot.decedentAcquisitionDate ?? lot.acquisitionDate;
    case "merger_split":
      return lot.preMergerAcquisitionDate ?? lot.acquisitionDate;
    case "gift":
    case "purchase":
    default:
      return lot.acquisitionDate;
  }
}

// ============================================================
// allocateLots — 산정방법별 매칭 엔진
// ============================================================

type AllocationMethod = "specific" | "fifo" | "moving_avg";

interface RemainingAcqLot extends AcquisitionLot {
  /** 차감 가능 잔여 수량 (FIFO/avg 매칭 시 변동) */
  remaining: number;
  /** §104② 기산일 (resolveLotStartDate 결과 캐시) */
  startDate: Date;
}

/**
 * sub-lot 차익에 세율 적용 (taxBase 안분 시점 적용).
 * 본 함수는 lot-allocation.ts 내부에서 perLotGain 기반 미리 계산.
 * 실제 메인 엔진에서 sub-lot taxBase 안분 후 다시 계산해야 정확 — 본 echo는 참조용.
 *
 * @param perLotGain 양수 또는 음수 (양도손실 시 음수)
 * @param isShortTerm < 365일
 * @param taxCategory 비대주주는 단일 세율
 * @param isMajorAndNonSME 대주주+비SME 게이트
 * @param isSME 중소기업 (비대주주 분기에서 단일 세율 결정용)
 */
function applySubLotRate(
  perLotGain: number,
  isShortTerm: boolean,
  isMajorAndNonSME: boolean,
  isSME: boolean,
): { appliedRate: number; subLotTax: number } {
  if (perLotGain <= 0) {
    // 양도손실 sub-lot — 세율 적용 안 함 (taxBase 안분 시 0)
    return { appliedRate: 0, subLotTax: 0 };
  }
  if (isMajorAndNonSME) {
    // 대주주 + 비SME
    if (isShortTerm) {
      // §104①11호 가목 1) 단기 30%
      return {
        appliedRate: STOCK_SHORT_TERM_RATE,
        subLotTax: Math.floor(perLotGain * STOCK_SHORT_TERM_RATE),
      };
    }
    // §104①11호 가목 2) 누진 — perLotGain 기반 미리 계산 (taxBase 안분 후 메인 엔진에서 정확 계산)
    const { rate, tax } = applyProgressive(perLotGain);
    return { appliedRate: rate, subLotTax: tax };
  }
  // 비대주주 — 단일 세율 (sub-lot별 분기 의미 없음, 결과 검산용)
  const rate = isSME ? STOCK_NON_MAJOR_SME_RATE : STOCK_NON_MAJOR_NON_SME_RATE;
  return { appliedRate: rate, subLotTax: Math.floor(perLotGain * rate) };
}

function applyProgressive(amount: number): { rate: number; tax: number; deduction: number } {
  for (const bracket of STOCK_MAJOR_PROGRESSIVE_BRACKETS) {
    if (bracket.max === undefined || amount <= bracket.max) {
      const tax = Math.floor(amount * bracket.rate - bracket.deduction);
      return { rate: bracket.rate, tax: Math.max(0, tax), deduction: bracket.deduction };
    }
  }
  // unreachable
  return { rate: 0, tax: 0, deduction: 0 };
}

/**
 * 메인 진입점.
 * @param acquisitionLots 매수 lot 배열
 * @param transferLots 매도 lot 배열
 * @param method 산정방법
 * @param isMajorAndNonSME 단기 30% 게이트 (대주주 + 비SME)
 * @param isSME 중소기업 여부 (비대주주 분기 세율 결정)
 * @param specificMatchings 개별법 매칭 (specific 모드만)
 */
export function allocateLots(
  acquisitionLots: AcquisitionLot[],
  transferLots: TransferLot[],
  method: AllocationMethod,
  isMajorAndNonSME: boolean,
  isSME: boolean,
  specificMatchings?: SpecificMatching[],
): LotMatchingDetail {
  const warnings: string[] = [];

  // 분모 0 가드 (validate에서 차단되어야 하지만 방어 코드)
  const totalBuyShares = acquisitionLots.reduce((s, l) => s + l.shareCount, 0);
  if (totalBuyShares === 0 || transferLots.length === 0) {
    return {
      method,
      matched: [],
      totalTransferPrice: 0,
      totalAcquisitionPrice: 0,
      totalGain: 0,
      shortTermGain: 0,
      longTermGain: 0,
      warnings: ["매수 lot 또는 매도 lot이 비어 있습니다"],
    };
  }

  // 매수 lot에 §104② 기산일 + 잔여 수량 부착
  const remainingAcqLots: RemainingAcqLot[] = acquisitionLots.map((lot) => ({
    ...lot,
    remaining: lot.shareCount,
    startDate: resolveLotStartDate(lot),
  }));

  let matched: MatchedSubLot[] = [];
  // [B-3] moving_avg는 매도 시점별 이동평균 → matchMovingAvg가 echo용 최종 잔고 평균을 반환
  let weightedAvgPerShare: number | undefined;

  if (method === "specific") {
    if (!specificMatchings || specificMatchings.length === 0) {
      warnings.push("specific 모드에서 매칭이 비어 있습니다");
      return {
        method, matched: [], totalTransferPrice: 0, totalAcquisitionPrice: 0,
        totalGain: 0, shortTermGain: 0, longTermGain: 0, warnings,
      };
    }
    matched = matchSpecific(remainingAcqLots, transferLots, specificMatchings, isMajorAndNonSME, isSME, warnings);
  } else if (method === "moving_avg") {
    // [B-3] 진정 이동평균법 — 단가는 매도 시점 이동평균, 보유기간은 FIFO lot startDate
    const r = matchMovingAvg(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, warnings);
    matched = r.matched;
    weightedAvgPerShare = r.finalMovingAvgPrice;
  } else {
    // fifo — lot.acquisitionDate ASC + 매도일 ASC FIFO 매칭 (lot 단가)
    matched = matchFifo(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, warnings);
  }

  // 합계 산출
  const totalTransferPrice = matched.reduce((s, m) => s + m.saleShares * m.perShareSalePrice, 0);
  const totalAcquisitionPrice = matched.reduce((s, m) => s + m.buyShares * m.perShareBuyPrice, 0);
  const totalGain = totalTransferPrice - totalAcquisitionPrice;
  const shortTermGain = matched.filter((m) => m.isShortTerm).reduce((s, m) => s + m.perLotGain, 0);
  const longTermGain = matched.filter((m) => !m.isShortTerm).reduce((s, m) => s + m.perLotGain, 0);

  return {
    method,
    matched,
    totalTransferPrice,
    totalAcquisitionPrice,
    totalGain,
    shortTermGain,
    longTermGain,
    weightedAvgPerShare,
    warnings,
  };
}

// ============================================================
// specific 매칭
// ============================================================

function matchSpecific(
  acqLots: RemainingAcqLot[],
  trnLots: TransferLot[],
  matchings: SpecificMatching[],
  isMajorAndNonSME: boolean,
  isSME: boolean,
  warnings: string[],
): MatchedSubLot[] {
  const matched: MatchedSubLot[] = [];
  const acqById = new Map(acqLots.map((l) => [l.id ?? "", l]));
  const trnById = new Map(trnLots.map((l) => [l.id ?? "", l]));

  for (const m of matchings) {
    const acq = acqById.get(m.acquisitionLotId);
    const trn = trnById.get(m.transferLotId);
    if (!acq || !trn) {
      warnings.push(`매칭 참조 누락: trn=${m.transferLotId}, acq=${m.acquisitionLotId}`);
      continue;
    }
    if (m.shareCount <= 0) continue;
    if (m.shareCount > acq.remaining) {
      warnings.push(`매칭 수량(${m.shareCount}) > 매수 lot 잔여(${acq.remaining})`);
      continue;
    }
    acq.remaining -= m.shareCount;
    const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
    const isShortTerm = holdingDays < 365;
    const perLotGain = (trn.perShareTransferPrice - acq.perShareAcquisitionPrice) * m.shareCount;
    const { appliedRate, subLotTax } = applySubLotRate(perLotGain, isShortTerm, isMajorAndNonSME, isSME);
    matched.push({
      saleDate: trn.transferDate,
      saleShares: m.shareCount,
      perShareSalePrice: trn.perShareTransferPrice,
      acquisitionDate: acq.startDate,
      buyShares: m.shareCount,
      perShareBuyPrice: acq.perShareAcquisitionPrice,
      holdingDays,
      isShortTerm,
      perLotGain,
      appliedRate,
      subLotTax,
    });
  }
  return matched;
}

// ============================================================
// fifo / moving_avg 매칭
// ============================================================

function matchFifo(
  acqLots: RemainingAcqLot[],
  trnLots: TransferLot[],
  isMajorAndNonSME: boolean,
  isSME: boolean,
  warnings: string[],
): MatchedSubLot[] {
  // lot.acquisitionDate ASC (실제 매수일 — §104② 기산일 아님)
  const sortedAcq = [...acqLots].sort(
    (a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime(),
  );
  const sortedTrn = [...trnLots].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());

  const matched: MatchedSubLot[] = [];
  let acqIdx = 0;

  for (const trn of sortedTrn) {
    let remainingSaleShares = trn.shareCount;
    while (remainingSaleShares > 0 && acqIdx < sortedAcq.length) {
      const acq = sortedAcq[acqIdx];
      if (acq.remaining <= 0) {
        acqIdx += 1;
        continue;
      }
      const matchedShares = Math.min(remainingSaleShares, acq.remaining);
      acq.remaining -= matchedShares;
      remainingSaleShares -= matchedShares;

      const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
      const isShortTerm = holdingDays < 365;
      const perShareBuyPrice = acq.perShareAcquisitionPrice;
      const perLotGain = (trn.perShareTransferPrice - perShareBuyPrice) * matchedShares;
      const { appliedRate, subLotTax } = applySubLotRate(
        perLotGain,
        isShortTerm,
        isMajorAndNonSME,
        isSME,
      );
      matched.push({
        saleDate: trn.transferDate,
        saleShares: matchedShares,
        perShareSalePrice: trn.perShareTransferPrice,
        acquisitionDate: acq.startDate,
        buyShares: matchedShares,
        perShareBuyPrice,
        holdingDays,
        isShortTerm,
        perLotGain,
        appliedRate,
        subLotTax,
      });
      if (acq.remaining === 0) acqIdx += 1;
    }
    if (remainingSaleShares > 0) {
      warnings.push(`매도 lot 수량 매칭 부족: 잔여 ${remainingSaleShares}주`);
    }
  }
  return matched;
}

// ============================================================
// [B-3] 진정 이동평균법 매칭 — 단가 트랙(이동평균) + 보유기간 트랙(FIFO)
// ============================================================

/**
 * 진정 이동평균법 (법인세령 §74①1마 표준 정의 참조 — 양도세 명문 부재).
 *
 * - 단가: 각 매도 시점까지 취득된(취득일 <= 매도일) lot의 잔고 가중평균(이동평균).
 *   매수 발생마다 갱신, 매도 시 그 시점 평균단가로 원가 차감(평균 보존).
 * - 보유기간(§104②): 단가와 독립 — FIFO lot.startDate로 단기/장기 판정(하이브리드).
 *   매도분이 여러 lot에 걸치면 sub-lot 분할(단가는 공통 이동평균, startDate는 lot별).
 *
 * @returns matched + finalMovingAvgPrice (echo용 — 최종 잔고 평균, 전량 매도 시 마지막 매도 단가)
 */
function matchMovingAvg(
  acqLots: RemainingAcqLot[],
  trnLots: TransferLot[],
  isMajorAndNonSME: boolean,
  isSME: boolean,
  warnings: string[],
): { matched: MatchedSubLot[]; finalMovingAvgPrice: number | undefined } {
  const sortedAcq = [...acqLots].sort(
    (a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime(),
  );
  const sortedTrn = [...trnLots].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());

  const matched: MatchedSubLot[] = [];
  // 이동평균 단가 트랙
  let balanceQty = 0;
  let balanceCost = 0;
  let nextAcqToAbsorb = 0; // 잔고에 아직 반영 안 된 매수 lot 포인터
  // 보유기간 FIFO 트랙 (lot 잔여 차감)
  let fifoIdx = 0;
  let lastMovingAvgPrice: number | undefined;

  for (const trn of sortedTrn) {
    // 그 매도일 이전(<=)에 취득된 lot을 잔고에 누적 반영 (법인세령 "취득할 때마다")
    while (
      nextAcqToAbsorb < sortedAcq.length &&
      sortedAcq[nextAcqToAbsorb].acquisitionDate.getTime() <= trn.transferDate.getTime()
    ) {
      const lot = sortedAcq[nextAcqToAbsorb];
      balanceQty += lot.shareCount;
      balanceCost += lot.shareCount * lot.perShareAcquisitionPrice;
      nextAcqToAbsorb += 1;
    }
    const movingAvgPrice = balanceQty > 0 ? Math.floor(balanceCost / balanceQty) : 0;
    lastMovingAvgPrice = movingAvgPrice;

    let remainingSaleShares = trn.shareCount;
    // 보유기간: FIFO lot에서 차감하며 sub-lot 분할. 단가는 movingAvgPrice 공통.
    while (remainingSaleShares > 0 && fifoIdx < sortedAcq.length) {
      const acq = sortedAcq[fifoIdx];
      if (acq.remaining <= 0) {
        fifoIdx += 1;
        continue;
      }
      const matchedShares = Math.min(remainingSaleShares, acq.remaining);
      acq.remaining -= matchedShares;
      remainingSaleShares -= matchedShares;

      const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
      const isShortTerm = holdingDays < 365;
      const perLotGain = (trn.perShareTransferPrice - movingAvgPrice) * matchedShares;
      const { appliedRate, subLotTax } = applySubLotRate(perLotGain, isShortTerm, isMajorAndNonSME, isSME);
      matched.push({
        saleDate: trn.transferDate,
        saleShares: matchedShares,
        perShareSalePrice: trn.perShareTransferPrice,
        acquisitionDate: acq.startDate,
        buyShares: matchedShares,
        perShareBuyPrice: movingAvgPrice, // 이동평균 공통
        holdingDays,
        isShortTerm,
        perLotGain,
        appliedRate,
        subLotTax,
      });
      if (acq.remaining === 0) fifoIdx += 1;
    }
    if (remainingSaleShares > 0) {
      warnings.push(`매도 lot 수량 매칭 부족: 잔여 ${remainingSaleShares}주`);
    }
    // 잔고 차감 (매도수량 × 이동평균단가 — 평균 보존, max(0) 가드)
    const soldQty = trn.shareCount - remainingSaleShares;
    balanceQty = Math.max(0, balanceQty - soldQty);
    balanceCost = Math.max(0, balanceCost - soldQty * movingAvgPrice);
  }

  // echo: 마지막 매도에 적용된 이동평균단가 (매도에 실제 적용된 단가 대표 —
  //   단일/일괄 매도면 그 시점 잔고평균 = 총평균. 잔고 평균이 아니라 매도 적용 단가라 floor 잔차 무관)
  return { matched, finalMovingAvgPrice: lastMovingAvgPrice };
}
