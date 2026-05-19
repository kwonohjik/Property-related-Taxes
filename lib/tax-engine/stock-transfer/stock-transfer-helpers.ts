/**
 * 주식 양도소득세 — 공용 헬퍼 (보유기간·기본공제·절사·전자신고)
 *
 * 법령: §103② 기본공제 / §104② 보유기간 기산점 / 국고금 관리법 §47
 */

import { differenceInDays, differenceInMonths } from "date-fns";
import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import type { ClassificationResult } from "./stock-classification";
import {
  STOCK_BASIC_DEDUCTION,
  STOCK,
  STOCK_ELECTRONIC_FILING_CREDIT,
} from "@/lib/tax-engine/legal-codes/stock";
import { resolveThresholdFromDate } from "./stock-rate-tables";

// ============================================================
// 보유기간 계산 (§104②)
// ============================================================

export interface HoldingPeriodResult {
  /** 보유기간 기산점 (§104②에 의해 결정) */
  startDate: Date;
  /** 보유기간 개월수 */
  months: number;
  /** 보유기간 일수 */
  days: number;
  /** 단기보유 여부 (1년 미만) */
  isShortTerm: boolean;
  appliedRule: string;
}

/**
 * 보유기간 기산점 결정 (§104②)
 * - 매매(purchase): 취득일
 * - 상속(inheritance): 피상속인 취득일 (§104②1)
 * - 증여(gift): 수증일 (주식은 §97의2 미적용 → 일반 수증일 기산)
 * - 합병·분할(merger_split): 종전 주식 취득일 (§104②3)
 */
export function calcHoldingPeriod(input: StockTransferInput): HoldingPeriodResult {
  const { acquisitionCause, acquisitionDate, transferDate } = input;
  const { decedentAcquisitionDate, donorAcquisitionDate, preMergerAcquisitionDate } = input;

  let startDate: Date;
  let appliedRule: string;

  switch (acquisitionCause) {
    case "inheritance":
      // §104②1 — 피상속인 취득일 기산
      startDate = decedentAcquisitionDate ?? acquisitionDate;
      appliedRule = STOCK.SECTION_104_2_1_INHERITANCE_START;
      break;
    case "gift":
      // 주식은 §97의2 미적용 → 일반 증여 수증일(acquisitionDate) 기산
      // donorAcquisitionDate는 §97의2 이월과세(토지·건물·시설물이용권 한정)용이므로
      // 주식 양도세에서는 무시. acquisitionDate(수증일)를 기산점으로 사용.
      startDate = acquisitionDate;
      appliedRule = "소득세법 §104② 본문 (일반 증여 수증일)";
      break;
    case "merger_split":
      // §104②3 — 종전 주식 취득일
      startDate = preMergerAcquisitionDate ?? acquisitionDate;
      appliedRule = STOCK.SECTION_104_2_3_MERGER_START;
      break;
    case "purchase":
    default:
      startDate = acquisitionDate;
      appliedRule = "소득세법 §104② 본문";
      break;
  }

  const days = differenceInDays(transferDate, startDate);
  const months = differenceInMonths(transferDate, startDate);
  const isShortTerm = days < 365;

  return { startDate, months, days, isShortTerm, appliedRule };
}

// ============================================================
// 기본공제 (§103②)
// ============================================================

/**
 * 기본공제 계산 — §103② 그룹별
 *
 * 주식 그룹(2호): 같은 해 주식 양도에서 250만원 연간 1회
 * §94② 발동 시(기타자산 분류): 1호 그룹 → realEstateGroupBasicDeductionUsed로 잔여 계산
 */
export function calcBasicDeduction(
  transferIncome: number,
  basicDeductionGroup: "real_estate_and_other_asset" | "stock",
  realEstateGroupBasicDeductionUsed: number,
): number {
  if (transferIncome <= 0) return 0;

  if (basicDeductionGroup === "real_estate_and_other_asset") {
    // 1호 그룹 — 같은 해 부동산 양도에서 이미 사용한 공제 차감
    const remaining = Math.max(0, STOCK_BASIC_DEDUCTION - realEstateGroupBasicDeductionUsed);
    return Math.min(transferIncome, remaining);
  }

  // 2호 그룹 (주식) — 연간 250만원 한도
  return Math.min(transferIncome, STOCK_BASIC_DEDUCTION);
}

// ============================================================
// 절사 유틸 (국고금 관리법 §47)
// ============================================================

/**
 * 과세표준 1원 미만 절사 (§47②)
 */
export function floorTaxBase(amount: number): number {
  return Math.floor(amount);
}

/**
 * 본세·가산세 10원 미만 절사 (§47①)
 */
export function floorTen(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

/**
 * 지방소득세 10원 미만 절사 (§47③ 지방자치단체 준용)
 */
export function floorLocalTax(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

// ============================================================
// 전자신고 세액공제 (§52의2)
// ============================================================

export function calcElectronicFilingCredit(
  isElectronicFiling: boolean,
  calculatedTax: number,
): number {
  if (!isElectronicFiling) return 0;
  // 공제액은 산출세액 한도
  return Math.min(STOCK_ELECTRONIC_FILING_CREDIT, calculatedTax);
}

// ============================================================
// appliedThreshold 결과 필드 조립 (§157 임계 echo)
// ============================================================

/**
 * §157/§167의8 대주주 판정 임계 echo 필드 조립
 *
 * - 상장 3시장(kospi/kosdaq/konex): §157 임계 echo
 * - 비상장(unlisted): §167의8①2호 임계 echo (F-5 확장)
 * - 기타자산(other_asset)은 undefined 반환 (§94①4 별도 트랙)
 * - classification.appliedThreshold가 없으면 undefined 반환
 * - 정상 경로(과세)·비과세 조기 반환 경로 모두 동일하게 사용
 */
export function buildAppliedThreshold(
  input: StockTransferInput,
  classification: ClassificationResult,
): StockTransferResult["appliedThreshold"] {
  // 기타자산은 §94①4 별도 트랙 → echo 없음
  if (input.marketType === "other_asset") {
    return undefined;
  }
  const t = classification.appliedThreshold;
  if (!t) return undefined;

  // marketType이 kospi/kosdaq/konex/unlisted임이 위의 guard로 보장됨
  const marketType = input.marketType as "kospi" | "kosdaq" | "konex" | "unlisted";

  return {
    shareRatio: t.shareRatio,
    marketCap: t.marketCap,
    marketType,
    priorYearEndDate: input.priorYearEndDate.toISOString().slice(0, 10),
    fromDate: resolveThresholdFromDate(marketType, input.priorYearEndDate),
    // Phase B (2026-05-19) — 비상장 벤처기업 임계 분기 전파
    isVentureRule: t.isVentureRule,
    ruleSource: t.ruleSource,
  };
}

// ============================================================
// 의제취득일 (시행령 §162① — 1985.12.31. 이전 취득 주식)
// ============================================================

const DEEMED_ACQUISITION_DATE = new Date("1986-01-01");
const DEEMED_ACQUISITION_CUTOFF = new Date("1985-12-31");

/**
 * 의제취득일 처리 — 1985.12.31. 이전 취득 시 1986.1.1. 의제
 * 상속 등으로 피상속인 취득일이 1985.12.31. 이전인 경우 적용
 */
export function applyDeemedAcquisitionDate(date: Date): {
  effectiveDate: Date;
  isDeemedApplied: boolean;
} {
  if (date <= DEEMED_ACQUISITION_CUTOFF) {
    return { effectiveDate: DEEMED_ACQUISITION_DATE, isDeemedApplied: true };
  }
  return { effectiveDate: date, isDeemedApplied: false };
}
