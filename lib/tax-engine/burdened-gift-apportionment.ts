/**
 * 부담부증여(Burdened Gift) — 양도세 자산별 안분 모듈.
 *
 * 법령 근거:
 *   - 소득세법 §88 ① 1호 후단 (양도 정의 — 채무인수분)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간 — 양도자=증여자 본인)
 *   - 소득세법 시행령 §159 (양도차익 계산)
 *   - 소득세법 시행령 §163 ⑥ (개산공제 3%)
 *   - 상증법 §60~§66 (증여재산 평가 — Max 보충적·담보·임대)
 *   - 상증법 시행령 §50 ⑦ (임대료 환산가액 12%)
 *
 * 양도자 = 증여자 본인이므로 소득세법 §97의2(이월과세) 미적용.
 *
 * Phase 1 가드: propertyType === "general_building" 전용. 1세대1주택(장특공률표 §95② 표2)은 Phase 3.
 *
 * 수학적 동치 주의:
 *   부담부증여 §159 ① 1호 (acq = stdPriceAtAcq × debtRatio)
 *   ≡ 환산취득가 §114 ⑦ (acq = transferPrice × stdPriceAtAcq / stdPriceAtTransfer)
 *   결과는 같으나 법적 근거 조문이 다르므로 코드 경로 분리 유지.
 */

import {
  ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23,
  REGISTERED_ESTIMATED_DEDUCTION_RATE,
} from "./legal-codes/burdened-gift";
import { safeMultiplyThenDivide, applyRate } from "./tax-utils";
import { calcGiftTax } from "./gift-tax";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";

// ============================================================
// 상증법 §60~§66 Max 평가 산정
// ============================================================

/**
 * 상증법 §60~§66 증여재산 평가 Max 산정.
 *
 * @param landStdPriceAtTransfer  양도시 토지 기준시가 (개별공시지가 × 면적). 시가 모드에서도 입력 가능 (보충적 비교용).
 * @param buildingStdPriceAtTransfer 양도시 건물 기준시가 합계.
 * @param info BurdenedGiftInfo (보증금·임대료·차입금·시가 입력).
 *
 * @returns supplementary/mortgage/rental + selectedMode + max.
 */
export function computeSangjeungbeopValuation(
  landStdPriceAtTransfer: number,
  buildingStdPriceAtTransfer: number,
  info: BurdenedGiftInfo,
): TransferBurdenedGiftBreakdown["sangjeungbeopValuation"] {
  // ① 보충적평가 (상증법 §61): 자산별 기준시가 합계.
  // 시가 모드에서는 marketValueAtTransfer로 대체 (상증법 §60②~④).
  const supplementary =
    info.valuationMode === "sangjeungbeop_market"
      ? (info.marketValueAtTransfer ?? 0)
      : landStdPriceAtTransfer + buildingStdPriceAtTransfer;

  // ② 담보평가 (상증법 §66):
  //   = 임대보증금 + (근)저당 설정액
  //   mortgageSetAmount 미입력 시 mortgageDebtAmount로 fallback.
  const mortgageSet = info.mortgageSetAmount ?? info.mortgageDebtAmount;
  const mortgage = info.lendingDepositTotal + mortgageSet;

  // ③ 임대평가 (상증법 §61⑤·시행령 §50⑦):
  //   = 임대보증금 + (연간 임대료 / 12%)  [2009.4.23. 이후 시행분]
  //   safeMultiplyThenDivide 사용: annualRent × 1 ÷ 0.12 == annualRent / 0.12. 부동소수 회피.
  const rentalCapitalized =
    info.annualRentTotal === 0
      ? 0
      : Math.floor(info.annualRentTotal / ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23);
  const rental = info.lendingDepositTotal + rentalCapitalized;

  // Max 채택
  let selectedMode: "supplementary" | "mortgage" | "rental" = "supplementary";
  let max = supplementary;
  if (mortgage > max) {
    max = mortgage;
    selectedMode = "mortgage";
  }
  if (rental > max) {
    max = rental;
    selectedMode = "rental";
  }

  return { supplementary, mortgage, rental, selectedMode, max };
}

// ============================================================
// 채무비율 산정 (소령 §159 — B / C)
// ============================================================

/**
 * 채무비율 = 인수채무 / 증여가액 = (임대보증금 + 담보차입금) / Max 평가액.
 *
 * @returns { assumedDebtAmount, debtRatio }
 */
export function computeDebtRatio(
  info: BurdenedGiftInfo,
  sangjeungbeopMax: number,
): { assumedDebtAmount: number; debtRatio: number } {
  const assumedDebtAmount = info.lendingDepositTotal + info.mortgageDebtAmount;
  if (sangjeungbeopMax === 0) {
    return { assumedDebtAmount, debtRatio: 0 };
  }
  // 부동소수 비율 — anchor에서는 toBeCloseTo로 비교. 자산별 안분은 safeMultiplyThenDivide로 정수 보존.
  const debtRatio = assumedDebtAmount / sangjeungbeopMax;
  return { assumedDebtAmount, debtRatio };
}

// ============================================================
// 자산별 양도가액 안분 (소령 §159 ① 2호)
// ============================================================

/**
 * 자산별 양도가액 = 자산별 평가가액 × 채무비율.
 *
 * 정수 보존을 위해 안분식은 safeMultiplyThenDivide(평가가액, 채무액, max) 사용 —
 * 부동소수 곱셈 회피.
 */
export function apportionTransferPrice(
  assetSangjeungbeopValue: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetSangjeungbeopValue, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 취득가액 안분 (소령 §159 ① 1호)
// ============================================================

/**
 * 기준시가 모드에서 자산별 취득가액 = 취득시 자산 기준시가 × 채무비율.
 *
 * 소령 §159 ① 1호 A 괄호: 양도가액을 상증법 §61①·②·⑤·§66에 따라 기준시가로 산정한 경우
 * → 취득가액도 기준시가로 산정.
 *
 * 시가 모드(sangjeungbeop_market)에서는 별도 산식 — 사용자가 marketValueAtAcquisition을 총액으로 입력하므로
 * 자산별 분리 필요 시 v2에서 별도 anchor (Phase 1은 토지·건물 합계만으로 처리하고
 * 자산별 비율은 양도시 시가 비율을 그대로 사용).
 */
export function apportionAcquisitionPrice(
  assetStdPriceAtAcquisition: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetStdPriceAtAcquisition, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 개산공제 (소령 §163 ⑥)
// ============================================================

/**
 * 안분된 자산별 취득가액 × 3% (등기 토지·건물).
 *
 * 미등기·비등기 자산률(0.3% 등)은 Phase 1 범위 밖.
 */
export function computeEstimatedDeduction(assetAcquisitionPrice: number): number {
  return applyRate(assetAcquisitionPrice, REGISTERED_ESTIMATED_DEDUCTION_RATE);
}

// ============================================================
// 전체 자산-수준 분기 (orchestrator용)
// ============================================================

/**
 * 부담부증여 모드에서 토지·건물 자산-수준 양도가액·취득가액·개산공제를 한번에 산출.
 *
 * @param params.landStdPriceAtTransfer   양도시 토지 기준시가 (개별공시지가 × 면적).
 * @param params.buildingStdPriceAtTransfer 양도시 건물 기준시가 합계.
 * @param params.landStdPriceAtAcquisition  취득시 토지 기준시가.
 * @param params.buildingStdPriceAtAcquisition 취득시 건물 기준시가 합계.
 * @param params.info BurdenedGiftInfo.
 *
 * @returns TransferBurdenedGiftBreakdown — 자산-수준 분기·Phase 2 연결 export 포함.
 */
export function buildBurdenedGiftBreakdown(params: {
  landStdPriceAtTransfer: number;
  buildingStdPriceAtTransfer: number;
  landStdPriceAtAcquisition: number;
  buildingStdPriceAtAcquisition: number;
  info: BurdenedGiftInfo;
  /** 증여일(= 양도일). Phase 2 증여세 호출용. 미제공 시 증여세 계산 생략. */
  giftDate?: Date;
}): TransferBurdenedGiftBreakdown {
  const {
    landStdPriceAtTransfer,
    buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition,
    info,
  } = params;

  // STEP 1a: 양도세 보충적평가 (양도시 §99 기준시가) — 자산별 양도가액 안분 분모용
  const sangjeungbeopValuation = computeSangjeungbeopValuation(
    landStdPriceAtTransfer,
    buildingStdPriceAtTransfer,
    info,
  );

  // STEP 1b: 증여세 보충적평가 (양도시 §61 기준시가 — 층별 가감율 적용) — 취득가액 안분 분모용
  // 토지는 동일, 건물만 giftBuildingStdPriceAtTransfer (미입력 시 양도세값 fallback).
  const giftBuildingStd =
    info.giftBuildingStdPriceAtTransfer ?? buildingStdPriceAtTransfer;
  const giftValuation = computeSangjeungbeopValuation(
    landStdPriceAtTransfer,
    giftBuildingStd,
    info,
  );

  // STEP 2: 채무비율 — 분모는 증여재산 평가액(giftValuation.max). Excel 정합.
  const { assumedDebtAmount, debtRatio } = computeDebtRatio(info, giftValuation.max);

  // STEP 3: 자산별 양도가액 안분 (시가 모드일 때 자산별 시가 분리값이 없으면 기준시가 비율로 안분)
  //   - 기준시가 모드: 자산별 기준시가 × 채무비율
  //   - 시가 모드: 양도시 marketValue 전체 × (자산별 기준시가 / 전체 기준시가) × 채무비율 ≡
  //                자산별 기준시가 × marketValueAtTransfer / 전체 기준시가 × 채무비율
  //                실용적으로 기준시가 비율을 자산별 시가 분리값 추정에 사용 (Phase 1).
  let landSangjeungbeopValue: number;
  let buildingSangjeungbeopValue: number;
  if (info.valuationMode === "sangjeungbeop_standard") {
    landSangjeungbeopValue = landStdPriceAtTransfer;
    buildingSangjeungbeopValue = buildingStdPriceAtTransfer;
  } else {
    // 시가 모드: 자산별 시가 분리 입력은 v2. Phase 1은 기준시가 비율로 시가 안분.
    const totalStd = landStdPriceAtTransfer + buildingStdPriceAtTransfer;
    const marketTotal = info.marketValueAtTransfer ?? 0;
    landSangjeungbeopValue =
      totalStd === 0 ? 0 : safeMultiplyThenDivide(marketTotal, landStdPriceAtTransfer, totalStd);
    buildingSangjeungbeopValue = marketTotal - landSangjeungbeopValue;
  }

  const landTransferPrice = apportionTransferPrice(
    landSangjeungbeopValue,
    assumedDebtAmount,
    sangjeungbeopValuation.max,
  );
  const buildingTransferPrice = apportionTransferPrice(
    buildingSangjeungbeopValue,
    assumedDebtAmount,
    sangjeungbeopValuation.max,
  );

  // STEP 4: 자산별 취득가액 안분 (소령 §159 ① 1호 A 괄호 — 기준시가 모드에서는 취득가도 기준시가)
  //   분모는 증여재산 평가액(giftValuation.max) — 양도세 분모와 분리 (Excel 정합).
  //   시가 모드에서는 marketValueAtAcquisition 전체를 자산 비율로 분배 후 채무비율 적용.
  let landAcquisitionPrice: number;
  let buildingAcquisitionPrice: number;
  if (info.valuationMode === "sangjeungbeop_standard") {
    landAcquisitionPrice = apportionAcquisitionPrice(
      landStdPriceAtAcquisition,
      assumedDebtAmount,
      giftValuation.max,
    );
    buildingAcquisitionPrice = apportionAcquisitionPrice(
      buildingStdPriceAtAcquisition,
      assumedDebtAmount,
      giftValuation.max,
    );
  } else {
    const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
    const marketAcqTotal = info.marketValueAtAcquisition ?? 0;
    const landAcqMarket =
      totalAcqStd === 0
        ? 0
        : safeMultiplyThenDivide(marketAcqTotal, landStdPriceAtAcquisition, totalAcqStd);
    const buildingAcqMarket = marketAcqTotal - landAcqMarket;
    landAcquisitionPrice = apportionTransferPrice(landAcqMarket, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionTransferPrice(buildingAcqMarket, assumedDebtAmount, giftValuation.max);
  }

  // STEP 5: 자산별 개산공제 (안분된 취득가액 × 3%)
  const landEstimatedDeduction = computeEstimatedDeduction(landAcquisitionPrice);
  const buildingEstimatedDeduction = computeEstimatedDeduction(buildingAcquisitionPrice);

  // STEP 6: 무상이전분 — 증여재산 평가액(giftValuation.max) − 채무액 (상증법 §47③)
  const gratuitousPortion = giftValuation.max - assumedDebtAmount;

  // STEP 7: Phase 2 — 증여세 계산 (calcGiftTax 호출)
  // 증여세 = 무상이전분에 대해 수증자가 납부. 양도자(증여자)와 별도 납세의무자.
  let giftTaxSummary: TransferBurdenedGiftBreakdown["giftTax"];
  if (params.giftDate && gratuitousPortion > 0) {
    const donorRelation = info.donorRelation ?? "lineal_descendant";
    const giftDateStr = params.giftDate.toISOString().split("T")[0];
    const giftResult = calcGiftTax({
      giftDate: giftDateStr,
      donorRelation,
      // 부담부증여 무상이전분을 단일 자산으로 평가 — marketValue 직접 입력(이미 §60~§66 Max 평가 완료된 가액).
      giftItems: [
        {
          id: "burdened-gift-gratuitous",
          category: "real_estate_building",
          name: "부담부증여 무상이전분",
          marketValue: gratuitousPortion,
        },
      ],
      // Phase 3 후속: 10년 이내 사전증여 합산 (상증법 §47②·§58)
      priorGiftsWithin10Years: (info.priorGiftsWithin10Years ?? []).map((p) => ({
        giftDate: p.giftDate,
        isHeir: false, // 증여세 §47 합산에서는 isHeir 무관 (상속세 §13 전용 필드)
        giftAmount: p.giftAmount,
        giftTaxPaid: p.giftTaxPaid,
      })),
      isGenerationSkip: info.isGenerationSkip ?? false,
      isMinorDonee: info.isMinorDonee ?? false,
      deductionInput: {
        donorRelation,
      },
      creditInput: {
        isFiledOnTime: info.isFiledOnTime ?? true,
      },
    });
    giftTaxSummary = {
      grossGiftValue: giftResult.grossGiftValue,
      deduction: giftResult.totalDeduction,
      taxBase: giftResult.taxBase,
      computedTax: giftResult.computedTax,
      filingCredit: giftResult.creditDetail.filingCredit,
      finalTax: giftResult.finalTax,
      donorRelation,
    };
  }

  return {
    assumedDebtAmount,
    sangjeungbeopValuation,
    giftValuation,
    debtRatio,
    gratuitousPortion,
    taxpayer: "donor",
    giftTax: giftTaxSummary,
    perAsset: {
      land: {
        sangjeungbeopValue: landSangjeungbeopValue,
        stdPriceAtAcquisition: landStdPriceAtAcquisition,
        transferPrice: landTransferPrice,
        acquisitionPrice: landAcquisitionPrice,
        estimatedDeduction: landEstimatedDeduction,
      },
      building: {
        sangjeungbeopValue: buildingSangjeungbeopValue,
        stdPriceAtAcquisition: buildingStdPriceAtAcquisition,
        transferPrice: buildingTransferPrice,
        acquisitionPrice: buildingAcquisitionPrice,
        estimatedDeduction: buildingEstimatedDeduction,
      },
    },
  };
}

// ============================================================
// Phase 2 (2026-05-12) — propertyType 지원 범위·overshoot·고가주택 게이트
// ============================================================

const HIGH_PRICE_THRESHOLD_KRW = 1_200_000_000;

/**
 * 부담부증여 진입 게이트 — Phase 2.
 *
 * 책임:
 *   (1) propertyType 지원 범위 검증 (housing·land·building·general_building만)
 *   (2) 초과부담부(B/C > 1) fail-fast — 상증법 §47③ 정의 위반 (silent 분모 보정 금지)
 *   (3) 1세대1주택 + 12억 초과 부담부증여(케이스 5-a) 차단 — 후속 PR 예정
 *      (D-0-2 채택안 해석 B: 12억 비교·안분 분모 = giftValuation C. 현재 엔진은
 *       transferPrice = C × B/C 기반이라 다운스트림 12억 안분 결과 오류 발생)
 *
 * @throws Error 검증 실패 시 명시 메시지로 throw — 다음 액션 힌트 포함.
 */
export function assertBurdenedGiftEligible(args: {
  propertyType: string;
  isOneHousehold?: boolean;
  info: BurdenedGiftInfo;
}): void {
  const { propertyType, isOneHousehold, info } = args;

  // F-3 (2026-05-12): commercial_building 확장. general_building_unit은 엔진 내부 타입.
  const SUPPORTED: string[] = ["housing", "land", "building", "general_building", "commercial_building"];
  if (!SUPPORTED.includes(propertyType)) {
    throw new Error(
      `[burdened_gift] propertyType "${propertyType}"는 부담부증여 미지원입니다. ` +
      "주택·토지·건물·일반건물·상업용건물·오피스텔에서만 지원합니다 (입주권·분양권 등은 별도 PR).",
    );
  }

  // 초과부담부 검사 — giftValuation = Max(supplementary, mortgage, rental) 직접 산정
  const lending = info.lendingDepositTotal;
  const mortgageDebt = info.mortgageDebtAmount;
  const assumedDebt = lending + mortgageDebt;
  const mortgageSet = info.mortgageSetAmount ?? mortgageDebt;
  const rentalCap =
    info.annualRentTotal > 0
      ? Math.floor(info.annualRentTotal / ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23)
      : 0;
  // 증여재산 평가용 건물 기준시가 (층별 가감율 적용 — 미입력 시 양도세 기준시가 fallback)
  const giftBuildingStd =
    info.giftBuildingStdPriceAtTransfer ?? info.buildingStdPriceAtTransfer;
  const supplementary =
    info.valuationMode === "sangjeungbeop_market"
      ? info.marketValueAtTransfer ?? 0
      : info.landStdPriceAtTransfer + giftBuildingStd;
  const mortgageVal = lending + mortgageSet;
  const rentalVal = lending + rentalCap;
  const giftValuation = Math.max(supplementary, mortgageVal, rentalVal);

  if (giftValuation > 0 && assumedDebt > giftValuation) {
    throw new Error(
      "[EXCESS_BURDENED_GIFT] 채무액(B=" +
        assumedDebt.toLocaleString() +
        "원)이 증여가액(C=" +
        giftValuation.toLocaleString() +
        "원)을 초과합니다. " +
        "부담부증여로 성립하지 않습니다 (상속세및증여세법 §47③). " +
        "다음 중 하나로 재입력하세요: ① 양도 형태 = '일반 양도' + 취득원인 = '매매' (사실상 매매 의제). " +
        "② 평가액(C) 입력값 재확인 (시가 모드/임대평가 누락 등). " +
        "③ 채무액(B) 입력값 재확인 (보증금·차입금 중복 합산 여부).",
    );
  }

  // F-1 (2026-05-12): 케이스 5-a (1세대1주택 + 12억 초과) 차단 해제.
  //   해결: burdenedGiftDenominator = giftValuation C 매개변수 추가로
  //   checkOneHouseExemption()·calcOneHouseProration()이 해석 B 산식으로 분기.
  //   - 12억 비교 분모 = C (giftValuation)
  //   - 안분 산식: gain_burdened × (C − 12억) / C
  //   근거: D-0-2 국세청 해석례 5건 (ntstDcmId=010000000000028078·010000000000027439·
  //                                  010000000000038712·010000000000136005·010000000000042478)
  // suppress: HIGH_PRICE_THRESHOLD_KRW·isOneHousehold·propertyType 변수는 정보성 변수로 보존
  //   (후속 PR에서 다른 가드 케이스 추가 시 재사용).
  void HIGH_PRICE_THRESHOLD_KRW;
  void isOneHousehold;
}

/**
 * F-2 (2026-05-12): 케이스 12 다주택 중과 비스코프 감지.
 *
 * 부담부증여 + 주택 + 조정대상지역 + 자산 수 ≥ 2 시 정보성 경고 메시지 반환.
 * 정식 지원은 §167의3 한시 유예 종료 시점 확정 후 별도 PR.
 *
 * @returns 경고 메시지 (감지 시) | null (해당 없음)
 */
export function detectBurdenedGiftMultiHouseWarning(args: {
  propertyType: string;
  isRegulatedArea?: boolean;
  householdHousingCount?: number;
}): string | null {
  if (
    args.propertyType === "housing" &&
    args.isRegulatedArea === true &&
    (args.householdHousingCount ?? 1) >= 2
  ) {
    return (
      "다주택 중과(소득세법 시행령 §167의3) 분기는 Phase 2 비스코프입니다. " +
      "결과는 한시 유예 기준으로 산정되었습니다 — 중과 유예 해제 시점 확정 후 별도 PR로 정식 지원 예정."
    );
  }
  return null;
}
