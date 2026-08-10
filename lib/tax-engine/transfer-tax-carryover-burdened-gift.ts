/**
 * 부담부증여 × 이월과세 — **시나리오 A 입력 재구성** (2026-08-10 D-7a).
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §8.1
 *
 * ## 이 모듈이 존재하는 이유 — §159가 §97의2의 축을 삼킨다
 *
 * 일반 양도에서 §97의2는 `TransferTaxInput.acquisitionPrice`를 원증여자 기준으로 바꾸면 끝난다.
 * 그런데 부담부증여는 **§159①1호가 취득가액을 따로 정한다** — 그 값의 출처는
 * `burdenedGiftInfo`의 4개 모드(K-1~K-3·K-4·K-5·legacy)이고, `acquisitionPrice`를 아무리
 * 바꿔도 §159가 읽지 않는다. 그래서 시나리오 A는 **`burdenedGiftInfo` 자체**를 당초 증여자
 * 기준으로 바꿔 끼워야 한다.
 *
 * ## ⚠️ 세 축을 **동시에** 배선해야 한다
 *
 * | 축 | 조문 | 처리 |
 * |---|---|---|
 * | 취득가액 | §97의2①1호 | `applyCarryoverDonorBasis()` — 모드별 칸을 당초 증여자 값으로 치환 |
 * | 증여세 상당액 | §97의2①3호 | `carryoverGiftTaxAmount`로 §159 안분 단계에 전달(채무비율 안분 → 한도) |
 * | 보유기간 | **§95④ 단서** | `acquisitionDate`만 바꾸면 되므로 여기서는 손대지 않는다 |
 *
 * 하나만 고치면 **방향이 틀린다** — 두 축의 부호가 반대이기 때문이다(계획서 §5.1 PD-3).
 */

import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { BurdenedGiftInfo } from "./types/transfer-burdened-gift.types";

/**
 * 모드별로 어떤 「당초 증여자 기준」 칸이 필수인지 판정한다.
 *
 * 계획서 §5.6.3 표를 그대로 옮긴 것이다. K-5(환산)에 전용 칸이 없는 것은 **분자를
 * K-1~K-3의 취득기준시가에서 가져오기** 때문이다 — 그 칸이 두 벌이 되면 환산도 자동으로
 * 두 벌이 된다(❌ K-5용 칸 신설 금지 — 이중 진실).
 */
function describeRequiredDonorFields(info: BurdenedGiftInfo): {
  mode: string;
  satisfied: (d: NonNullable<BurdenedGiftInfo["carryoverDonorBasis"]>) => boolean;
  hint: string;
} {
  if (info.valuationMode === "sangjeungbeop_standard") {
    return {
      mode: "기준시가(K-1~K-3)",
      satisfied: (d) =>
        d.landStdPriceAtAcquisition !== undefined && d.buildingStdPriceAtAcquisition !== undefined,
      hint: "당초 증여자 취득 당시의 토지·건물 기준시가",
    };
  }
  if (info.acquisitionMethod === "actual") {
    return {
      mode: "실지취득가액(K-4)",
      satisfied: (d) =>
        (d.actualLandAcquisitionPrice !== undefined && d.actualBuildingAcquisitionPrice !== undefined) ||
        d.actualAcquisitionTotal !== undefined,
      hint: "당초 증여자의 실지취득가액(토지·건물 분리 또는 단일 총액)",
    };
  }
  if (info.acquisitionMethod === "converted") {
    return {
      mode: "환산취득가액(K-5)",
      satisfied: (d) =>
        d.landStdPriceAtAcquisition !== undefined && d.buildingStdPriceAtAcquisition !== undefined,
      hint: "당초 증여자 취득 당시의 토지·건물 기준시가 (환산 분자로 자동 사용)",
    };
  }
  return {
    mode: "시가(legacy)",
    satisfied: (d) => d.marketValueAtAcquisition !== undefined,
    hint: "당초 증여자 취득 당시의 시가 평가액",
  };
}

/**
 * 부담부증여 × 이월과세 진입 게이트 — **fail-fast**.
 *
 * ## ❌ 왜 fallback이 아니라 차단인가
 *
 * 「당초 증여자 값이 없으면 양도인 값으로 대신한다」는 곧 **시나리오 A = 시나리오 B**다.
 * 그러면 §97의2②3호 비교에서 두 값이 같아져 이월과세가 **조용히 무력화**되고, 사용자는
 * 「검토했고 불리해서 미적용」이라는 **근거 없는 판정**을 받는다 — 침묵 오답보다 나쁘다
 * (계획서 §5.4 · 메모리 `feedback_no_silent_apportion_fallback`).
 *
 * @throws TaxCalculationError 당초 증여자 기준 값 미입력 · 지원하지 않는 조합
 */
export function assertCarryoverDonorBasis(
  info: BurdenedGiftInfo,
  ct: NonNullable<import("./types/transfer.types").TransferTaxInput["carryoverTaxation"]>,
): void {
  /**
   * 이월과세의 환산 플래그는 부담부증여에서 **의미가 없다**.
   *
   * §159가 취득가액을 정하므로 「이월과세 취득가액을 환산으로 구한다」는 선택지가 성립하지
   * 않는다. 부담부증여의 환산은 K-5(`acquisitionMethod: "converted"`)로 표현한다.
   *
   * 🔴 그대로 두면 `transfer-tax-carryover.ts`의 환산 역산 산식
   * (`transferPrice − donorAcqPrice − gainBeforeGiftTax`)을 타는데, 부담부증여에서는
   * 양도가액·취득가액이 모두 §159로 안분된 값이라 `rawInput.transferPrice`가 그 축에 없다
   * ⇒ 필요경비가 엉뚱한 값이 된다(계획서 §5.7.5).
   */
  if (ct.useEstimatedAcquisition) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "부담부증여에서는 이월과세 취득가액을 환산으로 구할 수 없습니다. " +
        "취득가액은 「소득세법 시행령」 제159조 제1항 제1호가 정하므로, 환산이 필요하면 " +
        "증여재산 평가 모드를 시가 + 취득가액 산정방식 「환산」(K-5)으로 선택하세요.",
    );
  }

  const { mode, satisfied, hint } = describeRequiredDonorFields(info);
  const donor = info.carryoverDonorBasis;
  if (!donor || !satisfied(donor)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `부담부증여에 이월과세를 적용하려면 「당초 증여자」 취득 당시 값이 필요합니다 ` +
        `(현재 모드: ${mode}). 입력해야 할 것: ${hint}. ` +
        "「소득세법」 제97조의2 제1항 제1호는 취득가액을 당초 증여자의 취득 당시 금액으로 " +
        "정하는데, 부담부증여의 취득가액은 「소득세법 시행령」 제159조 제1항 제1호가 " +
        "양도인 기준 값으로 따로 산정하므로 두 값이 모두 필요합니다 " +
        "(같은 조 제2항 제3호의 세액 비교가 두 시나리오를 동시에 요구합니다).",
    );
  }
}

/**
 * 시나리오 A용 `burdenedGiftInfo` 사본 — 취득 관련 칸을 **당초 증여자 기준**으로 치환한다.
 *
 * 치환 대상은 §159가 실제로 읽는 칸뿐이다(양도시 기준시가·채무액·평가 모드는 그대로).
 * `carryoverGiftTaxAmount`를 함께 실어 §159 안분 단계가 §97의2①3호를 처리하게 한다.
 *
 * ⚠️ 호출 전에 `assertCarryoverDonorBasis()`로 필수 칸을 확인해야 한다 — 여기서는
 *    `?? 기존값` fallback을 쓰지만, 그것은 **모드에서 쓰지 않는 칸**을 보존하기 위한 것이지
 *    미입력을 눈감아 주려는 것이 아니다.
 */
export function applyCarryoverDonorBasis(
  info: BurdenedGiftInfo,
  giftTaxAmount: number,
): BurdenedGiftInfo {
  const d = info.carryoverDonorBasis ?? {};
  return {
    ...info,
    landStdPriceAtAcquisition: d.landStdPriceAtAcquisition ?? info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition:
      d.buildingStdPriceAtAcquisition ?? info.buildingStdPriceAtAcquisition,
    marketValueAtAcquisition: d.marketValueAtAcquisition ?? info.marketValueAtAcquisition,
    actualLandAcquisitionPrice: d.actualLandAcquisitionPrice ?? info.actualLandAcquisitionPrice,
    actualBuildingAcquisitionPrice:
      d.actualBuildingAcquisitionPrice ?? info.actualBuildingAcquisitionPrice,
    actualAcquisitionTotal: d.actualAcquisitionTotal ?? info.actualAcquisitionTotal,
    carryoverGiftTaxAmount: giftTaxAmount > 0 ? giftTaxAmount : undefined,
  };
}

/**
 * 부담부증여 × 이월과세 조합인가 — `calcCarryoverScenarios`의 분기 게이트.
 *
 * `acquisitionCause === "carryover_gift"`는 호출부가 이미 확인한다. 여기서는 **양도 형태**만 본다.
 */
export function isBurdenedGiftCarryover(
  input: import("./types/transfer.types").TransferTaxInput,
): boolean {
  return input.transferType === "burdened_gift" && input.burdenedGiftInfo !== undefined;
}
