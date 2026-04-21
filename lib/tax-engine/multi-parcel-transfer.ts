/**
 * 다필지 분리 계산 Pure Engine
 *
 * 환지된 토지 등 여러 필지를 총 양도가액 기준으로 면적 안분하여
 * 필지별 양도차익·장기보유특별공제·양도소득금액을 독립 계산한 뒤 합산.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 세율 데이터는 외부 주입.
 * 모든 금액 정수 연산. 면적은 소수점 허용(㎡ 단위).
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비 (환산취득가액 포함)
 *   - 소득세법 §95 ② — 장기보유특별공제
 *   - 소득세법 시행령 §162 ① 6호 — 환지처분확정일 익일 취득일 의제 (TRANSFER.REPLOTTING_ACQ_DATE)
 */

import { addDays } from "date-fns";
import { TRANSFER } from "./legal-codes";
import {
  applyRate,
  calculateHoldingPeriod,
  safeMultiplyThenDivide,
} from "./tax-utils";

// ============================================================
// 타입 정의
// ============================================================

export type ParcelAcquisitionMethod = "actual" | "estimated";

export interface ParcelInput {
  /** 필지 식별자 (표시용) */
  id: string;
  /** 양도 면적 (㎡) */
  transferArea: number;
  /** 취득 면적 (㎡) — estimated 방식일 때 기준시가 계산에 사용 */
  acquisitionArea: number;
  /** 취득일 */
  acquisitionDate: Date;
  /**
   * 환지처분확정일 익일을 취득일로 의제할지 여부.
   * true + replottingConfirmDate 지정 시 effectiveAcquisitionDate = replottingConfirmDate + 1일.
   * 소득세법 시행령 §162 ① 6호.
   */
  useDayAfterReplotting?: boolean;
  /** 환지처분확정일 */
  replottingConfirmDate?: Date;
  /** 취득가액 산정 방식 */
  acquisitionMethod: ParcelAcquisitionMethod;
  /** 실지취득가액 (actual 방식 시 사용, 원) */
  acquisitionPrice?: number;
  /**
   * 취득 당시 단가 (원/㎡, estimated 방식 시 사용).
   * standardAtAcq = acquisitionArea × standardPricePerSqmAtAcq
   */
  standardPricePerSqmAtAcq?: number;
  /**
   * 양도 당시 단가 (원/㎡, estimated 방식 시 사용).
   * standardAtTransfer = transferArea × standardPricePerSqmAtTransfer
   */
  standardPricePerSqmAtTransfer?: number;
  /** 실거래가 방식 기타 필요경비 (원, actual 방식 시 사용) */
  expenses?: number;
  /** 미등기 여부 (true이면 장기보유특별공제 0%) */
  isUnregistered?: boolean;
}

export interface ParcelResult {
  /** 필지 식별자 */
  id: string;
  /** 면적 안분 후 양도가액 (원) */
  allocatedTransferPrice: number;
  /** 취득가액 (원) — actual: 실가, estimated: 환산취득가액 */
  acquisitionPrice: number;
  /**
   * 개산공제액 (원) — estimated 방식일 때 취득기준시가 × 3%.
   * actual 방식이면 0, 대신 expenses가 별도 표시.
   */
  estimatedDeduction: number;
  /** 기타 필요경비 (actual 방식 시) */
  expenses: number;
  /** 양도차익 (원) = allocatedTransferPrice - acquisitionPrice - estimatedDeduction - expenses */
  transferGain: number;
  /** 보유기간 연수 (장기보유특별공제 계산용) */
  holdingYears: number;
  /** 장기보유특별공제율 (0 ~ 0.30) */
  longTermHoldingRate: number;
  /** 장기보유특별공제액 (원) */
  longTermHoldingDeduction: number;
  /** 양도소득금액 (원) = transferGain - longTermHoldingDeduction */
  transferIncome: number;
  /** 환산 방식에서의 취득기준시가 합계 (standardAtAcq, 표시용) */
  standardAtAcq?: number;
  /** 환산 방식에서의 양도기준시가 합계 (standardAtTransfer, 표시용) */
  standardAtTransfer?: number;
  /** 취득일 의제 적용 여부 */
  didUseReplotting: boolean;
  /** 실제 사용된 취득일 (의제 적용 후) */
  effectiveAcquisitionDate: Date;
  /** 법적 근거 (환지 의제 적용 시 포함) */
  legalBasis?: string;
}

export interface MultiParcelInput {
  /** 총 양도가액 (원) — 면적 안분의 분모 합 */
  totalTransferPrice: number;
  /** 양도일 */
  transferDate: Date;
  /** 필지 목록 (2개 이상 권장, 1개도 허용) */
  parcels: ParcelInput[];
}

export interface MultiParcelResult {
  /** 필지별 계산 결과 */
  parcelResults: ParcelResult[];
  /** 총 양도가액 (원) */
  totalTransferPrice: number;
  /** 총 양도차익 (원) */
  totalTransferGain: number;
  /** 총 장기보유특별공제액 (원) */
  totalLongTermHoldingDeduction: number;
  /** 총 양도소득금액 (원) */
  totalTransferIncome: number;
  /** 경고 메시지 (양도손실 필지 발생 등) */
  warnings: string[];
}

// ============================================================
// 내부 유틸
// ============================================================

/**
 * 환지처분확정일 익일 취득일 의제 적용.
 * useDayAfterReplotting=true + replottingConfirmDate 있으면 replottingConfirmDate + 1일.
 * 그 외에는 parcel.acquisitionDate 그대로 반환.
 */
function resolveEffectiveAcquisitionDate(parcel: ParcelInput): {
  effectiveAcquisitionDate: Date;
  didUseReplotting: boolean;
} {
  if (parcel.useDayAfterReplotting && parcel.replottingConfirmDate) {
    return {
      effectiveAcquisitionDate: addDays(parcel.replottingConfirmDate, 1),
      didUseReplotting: true,
    };
  }
  return {
    effectiveAcquisitionDate: parcel.acquisitionDate,
    didUseReplotting: false,
  };
}

/**
 * 일반 토지 장기보유특별공제율 계산.
 * 보유 연수 × 2%, 30% 한도. 3년 미만이면 0%.
 * 미등기이면 항상 0%.
 */
function calcLandLongTermRate(holdingYears: number, isUnregistered: boolean): number {
  if (isUnregistered) return 0;
  if (holdingYears < 3) return 0;
  return Math.min(holdingYears * 0.02, 0.30);
}

// ============================================================
// 메인 함수: calculateMultiParcelTransfer
// ============================================================

/**
 * 다필지 분리 계산 메인 함수.
 *
 * 알고리즘:
 *   P-6 취득일 보정 (환지의제) →
 *   P-1 면적 안분 →
 *   P-2 취득가액·필요경비 →
 *   P-3 양도차익 →
 *   P-4 장기보유특별공제 →
 *   P-5 합산
 *
 * 잔여값 처리: 마지막 필지 allocatedTransferPrice =
 *   totalTransferPrice - Σ(앞 필지 allocatedTransferPrice)
 * → 원 단위 오차 없는 합산 보장.
 */
export function calculateMultiParcelTransfer(input: MultiParcelInput): MultiParcelResult {
  const { totalTransferPrice, transferDate, parcels } = input;

  // P-1: 총 양도 면적 합산 (면적 안분 분모)
  const totalArea = parcels.reduce((sum, p) => sum + p.transferArea, 0);

  // 필지별 allocatedTransferPrice 계산 (잔여값 처리)
  const allocatedPrices: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < parcels.length; i++) {
    if (i === parcels.length - 1) {
      // 마지막 필지: 잔여값으로 처리 (원 단위 오차 방지)
      allocatedPrices.push(totalTransferPrice - accumulated);
    } else {
      // calculateProration을 사용하지 않고 직접 계산
      // (calculateProration 내부의 "numerator >= denominator → amount 전액" 가드 때문에
      //  마지막 필지 별도 처리가 더 명확)
      const allocated = Math.floor(
        safeMultiplyThenDivide(totalTransferPrice, parcels[i].transferArea, totalArea),
      );
      allocatedPrices.push(allocated);
      accumulated += allocated;
    }
  }

  const warnings: string[] = [];
  const parcelResults: ParcelResult[] = [];

  for (let i = 0; i < parcels.length; i++) {
    const parcel = parcels[i];
    const allocatedPrice = allocatedPrices[i];

    // P-6: 환지처분확정일 익일 취득일 의제
    const { effectiveAcquisitionDate, didUseReplotting } = resolveEffectiveAcquisitionDate(parcel);

    // P-2: 취득가액·필요경비 계산
    let acquisitionPrice: number;
    let estimatedDeduction = 0;
    let expenses = 0;
    let standardAtAcq: number | undefined;
    let standardAtTransfer: number | undefined;

    if (parcel.acquisitionMethod === "estimated") {
      // 환산취득가액 방식
      // standardAtAcq = 취득 면적 × 취득 당시 단가
      // standardAtTransfer = 양도 면적 × 양도 당시 단가
      const acqArea = parcel.acquisitionArea;
      const sqmAtAcq = parcel.standardPricePerSqmAtAcq ?? 0;
      const sqmAtTransfer = parcel.standardPricePerSqmAtTransfer ?? 0;

      // 면적 × 단가는 소수 곱셈 가능 → Math.floor로 정수화
      standardAtAcq = Math.floor(acqArea * sqmAtAcq);
      standardAtTransfer = Math.floor(parcel.transferArea * sqmAtTransfer);

      // 환산취득가액 = allocatedPrice × (standardAtAcq / standardAtTransfer)
      acquisitionPrice = safeMultiplyThenDivide(allocatedPrice, standardAtAcq, standardAtTransfer);
      // 개산공제 = 취득기준시가 × 3% (소득세법 §97 ①②)
      estimatedDeduction = Math.floor(standardAtAcq * 0.03);
      expenses = estimatedDeduction; // 환산 방식에서는 개산공제만 인정
    } else {
      // 실지취득가액 방식
      acquisitionPrice = parcel.acquisitionPrice ?? 0;
      expenses = parcel.expenses ?? 0;
    }

    // P-3: 양도차익
    const rawGain = allocatedPrice - acquisitionPrice - (parcel.acquisitionMethod === "estimated" ? estimatedDeduction : expenses);
    const transferGain = Math.max(0, rawGain);

    if (rawGain < 0) {
      warnings.push(
        `필지 ${parcel.id}: 양도손실 발생 (차익 ${rawGain.toLocaleString()}원 → 0으로 처리)`,
      );
    }

    // P-4: 장기보유특별공제 (보유기간 기산일: effectiveAcquisitionDate 익일)
    const holding = calculateHoldingPeriod(effectiveAcquisitionDate, transferDate);
    const holdingYears = holding.years;
    const longTermHoldingRate = calcLandLongTermRate(holdingYears, parcel.isUnregistered ?? false);
    const longTermHoldingDeduction = applyRate(transferGain, longTermHoldingRate);

    // 양도소득금액
    const transferIncome = Math.max(0, transferGain - longTermHoldingDeduction);

    parcelResults.push({
      id: parcel.id,
      allocatedTransferPrice: allocatedPrice,
      acquisitionPrice,
      estimatedDeduction,
      expenses: parcel.acquisitionMethod === "estimated" ? 0 : expenses,
      transferGain,
      holdingYears,
      longTermHoldingRate,
      longTermHoldingDeduction,
      transferIncome,
      standardAtAcq,
      standardAtTransfer,
      didUseReplotting,
      effectiveAcquisitionDate,
      legalBasis: didUseReplotting ? TRANSFER.REPLOTTING_ACQ_DATE : undefined,
    });
  }

  // P-5: 합산
  const totalTransferGain = parcelResults.reduce((sum, r) => sum + r.transferGain, 0);
  const totalLongTermHoldingDeduction = parcelResults.reduce(
    (sum, r) => sum + r.longTermHoldingDeduction,
    0,
  );
  const totalTransferIncome = parcelResults.reduce((sum, r) => sum + r.transferIncome, 0);

  return {
    parcelResults,
    totalTransferPrice,
    totalTransferGain,
    totalLongTermHoldingDeduction,
    totalTransferIncome,
    warnings,
  };
}
