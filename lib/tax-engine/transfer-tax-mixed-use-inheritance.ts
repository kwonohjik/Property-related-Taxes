/**
 * 겸용주택 상속 취득가액 (소득세법 시행령 §163⑨ 엔진 정합) — 800줄 정책 분리.
 *
 * `transfer-tax-mixed-use-helpers.ts`(802줄 실측)에 인라인 추가 시 900줄대 진입 확정이라
 * 별도 leaf 파일로 분리. helpers.ts 는 이 파일의 함수를 호출만 한다.
 *
 * 법령 근거 (계획서 §3 KoreanLaw 검증 재사용):
 *   소령 §163⑨ 본문 — 상속·증여 자산은 상속개시일 현재 상증법 §60~66 평가액을
 *     취득당시 실지거래가액으로 본다("환산"이 아닌 "실지거래가액 의제" — 단일 값 fallback, max 아님).
 *   소령 §163⑨2호 — 개별주택가격 미공시 상속주택 취득가액 =
 *     max(① 상증법 §60~66 평가액, ② §164⑤~⑦ 가액). 미공시 시에만 명시적으로 "max" 비교.
 *
 * 설계 문서: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.engine.design.md
 */

import { applyRate } from "./tax-utils";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import type { PreHousingDisclosureResult } from "./types/transfer.types";

/**
 * 장기보유공제율 (§95② 별표, mixed-use 공용 — helpers.ts에서 re-export).
 *   표2: 1세대1주택 거주 2년+ → min(holdYears×4%,40%) + min(resYears×4%,40%) (합계 최대 80%).
 *   표1: 그 외 → min(holdYears×2%, 30%). 보유 3년 미만은 0.
 * 보유분·거주분 각각 40% 상한 후 합산(합산 후 80% 상한만 적용하면 과대 공제 — H-7 회귀).
 */
export function calcLongTermRate(
  holdingYears: number,
  residenceYears: number,
  useTable2: boolean,
  /** 「소득세법」 제95조 제2항 — 미등기양도자산은 장기보유특별공제 **배제**. */
  isUnregistered = false,
): number {
  if (isUnregistered) return 0;
  if (holdingYears < 3) return 0;
  if (useTable2) {
    const holdingPart = Math.min(holdingYears * 0.04, 0.40);
    const residencePart = Math.min(residenceYears * 0.04, 0.40);
    return holdingPart + residencePart;
  }
  return Math.min(holdingYears * 0.02, 0.30);
}

/**
 * 주택분 장특공제 보유/거주 기간분 분리 echo (표시 전용·세액 불변).
 * 거주분 = 각 부분 거주율(총 부분율 − 보유 부분율)로 직접 산정(applyRate),
 * 보유분 = 총 장특공제 − 거주분(잔액 흡수 → 합 = longTermDeductionAmount 불변식).
 * 표1/보유<3이면 거주율 0 → 거주분 0·보유분 전액. 대표 연수·율은 건물 기준.
 */
export function buildHousingLthdEcho(a: {
  proratedLandGain: number;
  proratedBuildingGain: number;
  landDedRate: number;
  buildingDedRate: number;
  landHoldingRate: number;
  buildingHoldingRate: number;
  longTermDeductionAmount: number;
  buildingHoldingYears: number;
  residenceYears: number;
}): {
  holdingDeductionAmount: number;
  residenceDeductionAmount: number;
  holdingYears: number;
  residenceYears: number;
  holdingDeductionRate: number;
  residenceDeductionRate: number;
} {
  const residenceDeductionAmount =
    applyRate(Math.max(a.proratedLandGain, 0), a.landDedRate - a.landHoldingRate) +
    applyRate(Math.max(a.proratedBuildingGain, 0), a.buildingDedRate - a.buildingHoldingRate);
  return {
    holdingDeductionAmount: a.longTermDeductionAmount - residenceDeductionAmount,
    residenceDeductionAmount,
    holdingYears: a.buildingHoldingYears,
    residenceYears: a.residenceYears,
    holdingDeductionRate: a.buildingHoldingRate,
    residenceDeductionRate: a.buildingDedRate - a.buildingHoldingRate,
  };
}

/** 상속 취득가액 산정 상세 — 산식 표시용 echo (housing·commercial 공용). */
export interface InheritedAcquisitionDetail {
  /** 사용자 입력 신고가액(housingInheritedValue/commercialInheritedValue). 미입력 null. */
  reportedValue: number | null;
  /** 자동 후보 — 비-PHD: acquisitionStandardPrice 기반 보충적평가 합계. PHD: §164⑦ 환산(P_A_est, 미스케일). */
  standardPriceCandidate: number;
  /** 채택된 후보. 공시(비-PHD)는 fallback이므로 reportedValue 있으면 항상 "reported".
   *  미공시(PHD)는 max 비교 결과. */
  selected: "reported" | "standard_price";
}

/**
 * 상속·증여·매매실가(실지거래가액 의제) 모드의 실제 필요경비(자본적지출·양도비)를
 * 취득시 토지/건물 기준시가 비율로 안분한다. 개산공제 슬롯(취득시 기준시가 × 3%)이
 * 토지/건물로 나뉘던 것과 동일 기준. floor 잔액은 건물분이 흡수(Σ = expense 불변).
 * 취득시 기준시가 합이 0(미상)이면 안분 불가 → 전액 건물분(현행 유지).
 *
 * expense × landStd 가 2^53(Number.MAX_SAFE_INTEGER)을 초과할 수 있어 BigInt로 계산.
 */
export function splitDeemedExpense(
  expense: number,
  acqLandStd: number,
  acqBuildingStd: number,
): { landAppraisalDed: number; buildingAppraisalDed: number } {
  const landStdInt = Math.max(0, Math.floor(acqLandStd));
  const buildingStdInt = Math.max(0, Math.floor(acqBuildingStd));
  const denom = landStdInt + buildingStdInt;
  if (expense <= 0 || denom <= 0) {
    return { landAppraisalDed: 0, buildingAppraisalDed: Math.max(0, expense) };
  }
  const landAppraisalDed = Number((BigInt(expense) * BigInt(landStdInt)) / BigInt(denom));
  return { landAppraisalDed, buildingAppraisalDed: expense - landAppraisalDed };
}

/** §163⑨ 본문 — 공시(비-PHD) 주택분. fallback(??), max 아님. */
export function resolveHousingInheritedAcqDirect(
  asset: MixedUseAssetInput,
): { estimatedAcq: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = asset.acquisitionStandardPrice.housingPrice ?? 0;
  if (reported === null && stdCandidate <= 0) {
    const kind = asset.acquisitionByGift ? "증여" : "상속";
    const at = asset.acquisitionByGift ? "증여일" : "상속개시일";
    throw new Error(
      `${kind} 취득: 주택분 ${at} 평가액 정보가 없습니다. ` +
        `${kind}세 신고가액 또는 취득시(${at}) 개별주택가격을 입력하세요.`,
    );
  }
  return {
    estimatedAcq: reported ?? stdCandidate,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: stdCandidate,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

/** §163⑨2호 — 미공시(PHD) 주택분 = max(신고가액, §164⑦ 환산). 토지/건물 분리까지 반환. */
export function resolveHousingInheritedAcqPhd(
  asset: MixedUseAssetInput,
  phd: PreHousingDisclosureResult,
): {
  estimatedAcq: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  detail: InheritedAcquisitionDetail;
} {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = phd.estimatedHousingPriceAtAcquisition; // P_A_est, 미스케일(양도가 무관)
  const estimatedAcq = Math.max(reported ?? 0, stdCandidate);
  const selected: "reported" | "standard_price" =
    reported !== null && reported >= stdCandidate ? "reported" : "standard_price";

  // 토지/건물 분리 — PHD 내부 취득시 미스케일 비율(landHousingAtAcquisition/P_A_est) 재사용.
  // phd.landHousingAtAcquisition + phd.buildingHousingAtAcquisition === P_A_est 항상 성립(Step5).
  const landRatio = stdCandidate > 0 ? phd.landHousingAtAcquisition / stdCandidate : 0.5;
  const landAcqPrice = Math.floor(estimatedAcq * landRatio);
  const buildingAcqPrice = estimatedAcq - landAcqPrice;

  return {
    estimatedAcq,
    landAcqPrice,
    buildingAcqPrice,
    detail: { reportedValue: reported, standardPriceCandidate: stdCandidate, selected },
  };
}

/** §163⑨ 본문 — 상가분(토지+건물 합계). fallback. */
export function resolveCommercialInheritedAcq(
  asset: MixedUseAssetInput,
  acqTotalStd: number,
): { estimatedAcqPrice: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.commercialInheritedValue ?? null;
  if (reported === null && acqTotalStd <= 0) {
    const kind = asset.acquisitionByGift ? "증여" : "상속";
    const at = asset.acquisitionByGift ? "증여일" : "상속개시일";
    throw new Error(
      `${kind} 취득: 상가분 ${at} 평가액 정보가 없습니다. ` +
        `${kind}세 신고가액 또는 취득시(${at}) 상가건물 기준시가+개별공시지가를 입력하세요.`,
    );
  }
  return {
    estimatedAcqPrice: reported ?? acqTotalStd,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: acqTotalStd,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}
