/**
 * 주식 양도세 분할 매수·분할 양도 lot 매칭 엔진
 *
 * 법령 근거:
 *  - 소득세법 §104② — 보유기간 기산점 (lot별 cause 분기)
 *    1호: 상속 → 피상속인 취득일
 *    2호: §97의2① 이월과세 → 증여자 취득일 (`carryover_gift`).
 *         **2025.1.1. 이후 증여분부터** — 법률 제20615호로 §94①3호 주식등이 ①에 포섭됐다.
 *         단순 증여(`gift`)는 §97의2① 미해당이므로 수증일 = lot.acquisitionDate
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
import { isStockCarryoverEra } from "../data/carryover-scope-era";
import { isCarryoverRelationExcluded } from "../carryover-donor-death";
import { accrueLotCarryoverExpense, resolveLotAcquisitionPrice } from "./stock-carryover";

/**
 * §97의2①2호·3호 누적기 — 매칭 3종이 공유한다.
 * sub-lot이 만들어지는 **모든 지점**에서 한 번씩 호출되어야 한다(한 곳이라도 빠지면
 * 그 산정방법에서만 조용히 산입이 사라진다).
 */
interface CarryoverExpenseAcc {
  capex: number;
  giftTax: number;
}

// ============================================================
// §104② lot별 기산점 결정
// ============================================================

/**
 * lot별 §104② 보유기간 기산일.
 * - purchase: lot.acquisitionDate
 * - inheritance: lot.decedentAcquisitionDate ?? lot.acquisitionDate (fallback은 validate에서 차단되어야 함)
 * - gift: lot.acquisitionDate (수증일 — §97의2① **미해당 선언**)
 * - carryover_gift: lot.donorAcquisitionDate (§104②2) — **2025.1.1. 이후 증여 + 1년 이내 양도**만
 * - merger_split: lot.preMergerAcquisitionDate ?? lot.acquisitionDate
 *
 * ⚠️ **1년 요건(§97의2① 괄호)은 여기서 판정하지 않는다.** lot 기산일은 매도 매칭 **전에**
 * 확정되므로 양도일이 정해지지 않았고, 하나의 매수 lot이 여러 매도 lot에 걸릴 수도 있다.
 * 생략해도 **세율 결과는 같다** — 「증여 후 1년 초과」면 수증일 기산으로도 이미 1년 이상이라
 * §104①11호가목**2)**이고, 증여자 취득일로 소급해도 역시 가목2)다. 요건을 넘든 못 넘든
 * 귀결이 같으므로 세율 축에서는 무해하다(단건 경로 `calcHoldingPeriod`는 양도일을 알므로 판정한다).
 * 필요경비 축은 실제로 갈리므로 `resolveLotAcquisitionPrice`가 `saleDate`를 받아 판정한다.
 *
 * 🔑 **관계 요건(ⓔ)은 여기서 판정한다** — 양도일이 필요 없기 때문이다(기준일은 **증여일**).
 * 종전에는 연혁 게이트만 보고 배우자 사별·직계존비속 사망·관계 부적격을 흘려보내
 * **소급 기산이 그대로 적용**됐다(P-9 — 단건 경로에서 고친 P-6과 같은 결함).
 */
export function resolveLotStartDate(lot: AcquisitionLot): Date {
  switch (lot.acquisitionCause) {
    case "inheritance":
      return lot.decedentAcquisitionDate ?? lot.acquisitionDate;
    case "merger_split":
      return lot.preMergerAcquisitionDate ?? lot.acquisitionDate;
    case "carryover_gift":
      // §104②2 — 증여자 취득일. 게이트: 증여일 ≥ 2025-01-01 (부칙 법률 제20615호 §8) + 관계 요건.
      return lot.donorAcquisitionDate &&
        isStockCarryoverEra(lot.acquisitionDate) &&
        !isCarryoverRelationExcluded(lot.donorRelation, lot.donorDeceased, lot.acquisitionDate)
        ? lot.donorAcquisitionDate
        : lot.acquisitionDate;
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
  const carryover: CarryoverExpenseAcc = { capex: 0, giftTax: 0 };

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
      carryoverDonorCapex: 0,
      carryoverGiftTaxApportioned: 0,
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
        totalGain: 0, shortTermGain: 0, longTermGain: 0,
        carryoverDonorCapex: 0, carryoverGiftTaxApportioned: 0, warnings,
      };
    }
    matched = matchSpecific(remainingAcqLots, transferLots, specificMatchings, isMajorAndNonSME, isSME, warnings, carryover);
  } else if (method === "moving_avg") {
    // [B-3] 진정 이동평균법 — 단가는 매도 시점 이동평균, 보유기간은 FIFO lot startDate
    const r = matchMovingAvg(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, warnings, carryover);
    matched = r.matched;
    weightedAvgPerShare = r.finalMovingAvgPrice;
  } else {
    // fifo — lot.acquisitionDate ASC + 매도일 ASC FIFO 매칭 (lot 단가)
    matched = matchFifo(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, warnings, carryover);
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
    carryoverDonorCapex: carryover.capex,
    carryoverGiftTaxApportioned: carryover.giftTax,
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
  carryover: CarryoverExpenseAcc,
): MatchedSubLot[] {
  const matched: MatchedSubLot[] = [];
  const acqById = new Map(acqLots.map((l) => [l.id ?? "", l]));
  const trnById = new Map(trnLots.map((l) => [l.id ?? "", l]));
  /** 매도 lot별 실제 배정 수량 — 루프 종료 후 매도 수량과 대조한다 */
  const allocatedByTrn = new Map<string, number>();

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
    if (acq.acquisitionDate.getTime() > trn.transferDate.getTime()) {
      warnings.push(futureLotWarning(acq.id, trn.transferDate));
      continue;
    }
    acq.remaining -= m.shareCount;
    allocatedByTrn.set(trn.id ?? "", (allocatedByTrn.get(trn.id ?? "") ?? 0) + m.shareCount);
    const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
    const isShortTerm = holdingDays < 365;
    // §97의2①1호 — 이월과세 lot이면 증여자 취득단가로 승계한다(1년 요건은 **매도 시점** 기준).
    const perShareBuyPrice = resolveLotAcquisitionPrice(acq, trn.transferDate);
    accrue(carryover, acq, m.shareCount, trn.transferDate); // ①2호·①3호
    const perLotGain = (trn.perShareTransferPrice - perShareBuyPrice) * m.shareCount;
    const { appliedRate, subLotTax } = applySubLotRate(perLotGain, isShortTerm, isMajorAndNonSME, isSME);
    matched.push({
      saleDate: trn.transferDate,
      saleShares: m.shareCount,
      perShareSalePrice: trn.perShareTransferPrice,
      acquisitionDate: acq.startDate,
      buyShares: m.shareCount,
      perShareBuyPrice,
      holdingDays,
      isShortTerm,
      perLotGain,
      appliedRate,
      subLotTax,
    });
  }

  /**
   * 매도 lot별 배정 합계 = 매도 수량 대조 — `matchFifo`·`matchMovingAvg`에는 있고
   * 여기만 없었다. 부족분은 그만큼 **양도가액이 조용히 깎이므로**(총계가 matched에서
   * 나온다) 반드시 드러나야 한다. 소득세법 §96①(양도가액 = 실지거래가액)·§100①.
   */
  for (const trn of trnLots) {
    const allocated = allocatedByTrn.get(trn.id ?? "") ?? 0;
    if (allocated < trn.shareCount) {
      warnings.push(shortfallWarning(trn.shareCount - allocated));
    }
  }
  return matched;
}

// ============================================================
// fifo / moving_avg 매칭
// ============================================================

/** 매도 수량을 다 배정하지 못했을 때의 경고 — 매칭 3종이 같은 문구를 쓴다. */
function shortfallWarning(remainingSaleShares: number): string {
  return `매도 lot 수량 매칭 부족: 잔여 ${remainingSaleShares}주`;
}

/**
 * 매도일 이후 취득한 lot을 그 매도의 원가로 쓰려 할 때의 경고 — 매칭 3종 공통.
 *
 * 「매도일 현재 보유하지 않은 주식」을 취득원가로 삼는 산정방법은 없다(명문은 부재하나
 * 형제 경로가 이미 같은 규칙을 갖고 있다 — 부동산 `transfer-tax-validate-asset.ts`,
 * 주식 단건 `stock-transfer-tax-validate.ts`). 방치하면 보유일수가 음수가 되고
 * `isShortTerm`이 참이 되어 세율까지 갈린다.
 *
 * ⚠️ 엔진은 **차단하지 않는다** — 자본조정(무상증자)의 정당한 수량 불일치와 충돌한다.
 *    차단은 ⑧ validate·⑫ Zod의 「매도 시점별 누적 보유수량」 검사가 맡는다.
 */
function futureLotWarning(lotId: string | undefined, saleDate: Date): string {
  return `매도일(${saleDate.toISOString().slice(0, 10)}) 이후 취득한 매수 lot(${lotId ?? "?"})은 그 매도의 취득원가가 될 수 없습니다 — 매칭에서 제외했습니다.`;
}

/** ①2호·①3호를 누적기에 더한다 — sub-lot 생성 지점마다 호출한다. */
function accrue(
  acc: CarryoverExpenseAcc,
  lot: AcquisitionLot,
  matchedShares: number,
  saleDate: Date,
): void {
  const { capex, giftTax } = accrueLotCarryoverExpense(lot, matchedShares, saleDate);
  acc.capex += capex;
  acc.giftTax += giftTax;
}

function matchFifo(
  acqLots: RemainingAcqLot[],
  trnLots: TransferLot[],
  isMajorAndNonSME: boolean,
  isSME: boolean,
  warnings: string[],
  carryover: CarryoverExpenseAcc,
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
      // sortedAcq는 취득일 ASC — 여기서 걸리면 이후 lot도 전부 이 매도보다 나중이다.
      if (acq.acquisitionDate.getTime() > trn.transferDate.getTime()) {
        warnings.push(futureLotWarning(acq.id, trn.transferDate));
        break;
      }
      const matchedShares = Math.min(remainingSaleShares, acq.remaining);
      acq.remaining -= matchedShares;
      remainingSaleShares -= matchedShares;

      const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
      const isShortTerm = holdingDays < 365;
      // §97의2①1호 — 이월과세 lot 승계(1년 요건은 **매도 시점** 기준)
      const perShareBuyPrice = resolveLotAcquisitionPrice(acq, trn.transferDate);
      accrue(carryover, acq, matchedShares, trn.transferDate); // ①2호·①3호
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
      warnings.push(shortfallWarning(remainingSaleShares));
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
  carryover: CarryoverExpenseAcc,
): { matched: MatchedSubLot[]; finalMovingAvgPrice: number | undefined } {
  const sortedAcq = [...acqLots].sort(
    (a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime(),
  );
  const sortedTrn = [...trnLots].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());

  const matched: MatchedSubLot[] = [];
  /**
   * 이동평균 단가 트랙 — 잔고를 **lot별 잔여 지분**으로 들고 간다.
   *
   * 단순 누적(`balanceCost += …`)으로는 lot을 잔고에 넣는 **그 한 번**의 단가가 확정돼
   * 이후 모든 매도에 끌려간다. `resolveLotAcquisitionPrice`는 §97의2①의 **1년 요건을
   * 매도 시점으로 판정**하므로(같은 함수의 `accrue`도 그렇다), 1년 경계를 사이에 둔 두
   * 매도에서 승계 여부가 갈려야 하는데 첫 매도의 답이 굳어버린다.
   *
   * 그래서 lot을 지우지 않고 잔여 지분(`qty`)만 들고, 매도마다 그 시점 단가로 재도출한다.
   * 매도 후 잔여는 **모든 lot을 같은 비율로** 줄인다 — 평균 보존(이동평균의 정의)이며,
   * FIFO로 지우면 오래된 lot부터 사라져 잔고 평균이 튄다.
   * 단가가 상수인 일반 lot에서는 종전 누적과 같은 값이 나온다.
   */
  const priceTrack: { lot: RemainingAcqLot; qty: number }[] = [];
  let balanceQty = 0;
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
      priceTrack.push({ lot, qty: lot.shareCount });
      balanceQty += lot.shareCount;
      nextAcqToAbsorb += 1;
    }
    // 이 매도 시점 기준으로 잔고 원가를 재도출 (①1호 승계 판정이 매도일에 달려 있다)
    const balanceCost = priceTrack.reduce(
      (s, e) => s + e.qty * resolveLotAcquisitionPrice(e.lot, trn.transferDate),
      0,
    );
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
      // 단가 트랙(`<= trn.transferDate`)과 같은 기준을 물량 트랙에도 건다.
      if (acq.acquisitionDate.getTime() > trn.transferDate.getTime()) {
        warnings.push(futureLotWarning(acq.id, trn.transferDate));
        break;
      }
      const matchedShares = Math.min(remainingSaleShares, acq.remaining);
      acq.remaining -= matchedShares;
      remainingSaleShares -= matchedShares;

      const holdingDays = differenceInDays(trn.transferDate, acq.startDate);
      const isShortTerm = holdingDays < 365;
      /**
       * ①2호·①3호는 **FIFO 물량 트랙**을 따른다 — 「어느 증여분 주식을 팔았나」의 문제이지
       * 단가 평균과는 무관하다. 보유기간(§104②)을 FIFO lot으로 잡는 것과 같은 기준이다.
       */
      accrue(carryover, acq, matchedShares, trn.transferDate);
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
      warnings.push(shortfallWarning(remainingSaleShares));
    }
    // 잔고 차감 — 모든 lot의 잔여 지분을 같은 비율로 줄인다(평균 보존)
    const soldQty = trn.shareCount - remainingSaleShares;
    const qtyBeforeSale = balanceQty;
    balanceQty = Math.max(0, balanceQty - soldQty);
    const remainRatio = qtyBeforeSale > 0 ? balanceQty / qtyBeforeSale : 0;
    for (const e of priceTrack) e.qty *= remainRatio;
  }

  // echo: 마지막 매도에 적용된 이동평균단가 (매도에 실제 적용된 단가 대표 —
  //   단일/일괄 매도면 그 시점 잔고평균 = 총평균. 잔고 평균이 아니라 매도 적용 단가라 floor 잔차 무관)
  return { matched, finalMovingAvgPrice: lastMovingAvgPrice };
}
