/**
 * 부담부증여 — **진입 게이트·경고 판정** (Phase 2 · 2026-05-12).
 *
 * `burdened-gift-apportionment.ts` 800줄 정책 분리(2026-08-07 W-6). **로직 무변경 이전**이다.
 *
 * ⚠️ 기존 import 경로 호환을 위해 `burdened-gift-apportionment.ts`가 전부 **재수출**한다.
 */

import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23 } from "./legal-codes/burdened-gift";
import { scaleBurdenedGiftInfo, computeMortgageValuation } from "./burdened-gift-valuation";
import type { BurdenedGiftInfo } from "./types/transfer-burdened-gift.types";


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
  /**
   * 공유지분율 — 초과부담부 검사도 **지분분 평가액** 기준이어야 한다.
   * 물건 전체 평가액으로 검사하면 진짜 초과부담부(채무 > 지분 가액)가 조용히 통과한다.
   */
  ownershipRatio?: number;
}): void {
  const { propertyType, isOneHousehold, ownershipRatio } = args;
  const info = scaleBurdenedGiftInfo(args.info, ownershipRatio);

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
  const mortgageVal = computeMortgageValuation(info);
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
