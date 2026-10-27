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
import { calculateBuildingPenalty } from "./transfer-tax-building-penalty";
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
  // 한 파트만 증여받았으면 그 파트의 칸만 요구한다(§97의2① 「해당 자산」) — 총액 칸은 위 게이트가 이미 막았다.
  const parts = carryoverPartsOf(info);
  const partLabel = parts.land && parts.building ? "토지·건물" : parts.land ? "토지" : "건물";
  const both = (land: number | undefined, building: number | undefined) =>
    (!parts.land || land !== undefined) && (!parts.building || building !== undefined);
  if (info.valuationMode === "sangjeungbeop_standard") {
    return {
      mode: "기준시가(K-1~K-3)",
      satisfied: (d) => both(d.landStdPriceAtAcquisition, d.buildingStdPriceAtAcquisition),
      hint: `당초 증여자 취득 당시의 ${partLabel} 기준시가`,
    };
  }
  if (info.acquisitionMethod === "actual") {
    return {
      mode: "실지취득가액(K-4)",
      satisfied: (d) =>
        both(d.actualLandAcquisitionPrice, d.actualBuildingAcquisitionPrice) || d.actualAcquisitionTotal !== undefined,
      hint: isPartialCarryover(info)
        ? `당초 증여자의 ${partLabel} 실지취득가액`
        : "당초 증여자의 실지취득가액(토지·건물 분리 또는 단일 총액)",
    };
  }
  if (info.acquisitionMethod === "converted") {
    return {
      mode: "환산취득가액(K-5)",
      satisfied: (d) => both(d.landStdPriceAtAcquisition, d.buildingStdPriceAtAcquisition),
      hint: `당초 증여자 취득 당시의 ${partLabel} 기준시가 (환산 분자로 자동 사용)`,
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
  /** 신축·증축 필드를 읽는 §114조의2 가드용 — 생략하면 그 가드를 건너뛴다(단위 테스트 호환). */
  rawInput?: import("./types/transfer.types").TransferTaxInput,
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

  if (isPartialCarryover(info)) assertPartialCarryoverSupported(info);

  /**
   * 매매사례가액·감정가액(K-6/K-7) × 이월과세 — 소법 §97의2①1호가 당초 증여자 **취득 당시**의 §97①1호 금액(나목 포함)을 쓰게 한다.
   * 그래서 `info.acquisitionMethod`는 당초 증여자 쪽 방식이고, 양도인(증여받은 사람) 본인 쪽(시나리오 B)은 증여받은 자산이라
   * 소령 §163⑨가 증여일 상증법 평가액을 실지거래가액으로 본다 — `actual*`가 B의 취득가액이다(`toTransferorBasisInfo`).
   * ❌ 어느 쪽이든 미입력을 다른 쪽 값으로 대신하면 A=B가 되어 §97의2가 조용히 무력화된다 — 세 가지를 모두 요구한다.
   */
  if (isPresumedCarryover(info)) {
    const methodLabel = info.acquisitionMethod === "appraisal" ? "감정가액" : "매매사례가액";
    const d = info.carryoverDonorBasis;
    const hasPresumed =
      d !== undefined &&
      (d.presumedAcquisitionTotal !== undefined ||
        d.presumedLandAcquisitionPrice !== undefined ||
        d.presumedBuildingAcquisitionPrice !== undefined);
    if (!hasPresumed) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `부담부증여에 이월과세를 적용하려면 당초 증여자의 ${methodLabel}(취득 당시, 토지·건물 분리 또는 총액)이 필요합니다 ` +
          "(소득세법 제97조의2 제1항 제1호 → 제97조 제1항 제1호나목 · 같은 법 시행령 제176조의2 제3항).",
      );
    }
    if (d!.landStdPriceAtAcquisition === undefined || d!.buildingStdPriceAtAcquisition === undefined) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `부담부증여에 이월과세를 적용하고 ${methodLabel}으로 산정하려면 당초 증여자 취득 당시 토지·건물 기준시가가 필요합니다 ` +
          "(필요경비는 개산공제 — 취득 당시 기준시가 × 3%, 소득세법 시행령 제163조 제6항). 건물이 없으면 0을 입력하세요.",
      );
    }
    const positive = (n: number | undefined) => (n ?? 0) > 0;
    if (
      !positive(info.actualAcquisitionTotal) &&
      !positive(info.actualLandAcquisitionPrice) &&
      !positive(info.actualBuildingAcquisitionPrice)
    ) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "부담부증여에 이월과세를 적용하려면 양도인(증여받은 사람)이 증여받은 때의 「상속세 및 증여세법」 평가액이 필요합니다 — " +
          "증여받은 자산은 그 평가액이 취득 당시 실지거래가액이기 때문입니다(소득세법 시행령 제163조 제9항). " +
          "같은 법 제97조의2 제2항 제3호의 세액 비교가 양도인 기준과 당초 증여자 기준을 동시에 요구합니다.",
      );
    }
    // §114조의2 × 이월과세 — 5년 기산(당초 증여자 취득일 vs 신축일)과 base(A·B 어느 쪽 건물 감정가액)가 정해져 있지 않다.
    // 통과시키면 가산세가 조용히 빠지거나 틀린 base로 붙는다 — 감정가액만 대상(매매사례가액은 조문에 없다).
    if (
      info.acquisitionMethod === "appraisal" &&
      rawInput !== undefined &&
      rawInput.isSelfBuilt === true &&
      calculateBuildingPenalty({ ...rawInput, acquisitionMethod: "appraisal" }, 1) !== null
    ) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "[burdened_gift] 신축·증축 건물을 5년 이내 양도하면서 이월과세를 적용하고 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따른 " +
          "가산세가 붙지만, 이월과세와 함께 쓸 때의 기산점과 감정가액 기준이 정해지지 않아 계산할 수 없습니다. " +
          "취득가액 산정방식을 「실지취득가액」으로 선택하거나 이월과세를 제외하세요.",
      );
    }
    return;
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
  if (isPartialCarryover(info)) {
    /**
     * 한 파트만 증여받았다 — 그 파트 칸만 당초 증여자 값으로 바꾸고 다른 파트는 양도인 값 그대로 둔다(§97의2①1호 「해당 자산」).
     * 총액 칸·K-6/K-7은 `assertPartialCarryoverSupported`가 먼저 막는다 — 여기 닿는 것은 기준시가·실지 분리 칸뿐이다.
     */
    const land = carryoverPartsOf(info).land;
    return {
      ...info,
      ...(land
        ? {
            landStdPriceAtAcquisition: d.landStdPriceAtAcquisition ?? info.landStdPriceAtAcquisition,
            actualLandAcquisitionPrice: d.actualLandAcquisitionPrice ?? info.actualLandAcquisitionPrice,
          }
        : {
            buildingStdPriceAtAcquisition: d.buildingStdPriceAtAcquisition ?? info.buildingStdPriceAtAcquisition,
            actualBuildingAcquisitionPrice: d.actualBuildingAcquisitionPrice ?? info.actualBuildingAcquisitionPrice,
          }),
      carryoverGiftTaxAmount: giftTaxAmount > 0 ? giftTaxAmount : undefined,
      carryoverGiftTaxPart: land ? "land" : "building",
    };
  }
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
    // K-6/K-7 — 당초 증여자 값을 **직접** 싣는다(`??` fallback 금지: 양도인 쪽은 `actual*`이고 presumed 칸은 당초 증여자 전용).
    ...(isPresumedCarryover(info)
      ? {
          presumedLandAcquisitionPrice: d.presumedLandAcquisitionPrice,
          presumedBuildingAcquisitionPrice: d.presumedBuildingAcquisitionPrice,
          presumedAcquisitionTotal: d.presumedAcquisitionTotal,
        }
      : {}),
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

/** 이월과세 × 매매사례가액·감정가액(K-6/K-7)인가 — 이때 `acquisitionMethod`는 당초 증여자 쪽 방식이다. */
export function isPresumedCarryover(info: BurdenedGiftInfo): boolean {
  return (
    info.valuationMode === "sangjeungbeop_market" &&
    (info.acquisitionMethod === "appraisal" || info.acquisitionMethod === "salesCase")
  );
}

/**
 * 시나리오 B(이월과세 미적용 = 양도인 기준)용 `burdenedGiftInfo` — K-6/K-7이면 **실지취득가액(K-4)으로 읽게** 바꾼다.
 *
 * 양도인은 이 자산을 증여받았으므로 소령 §163⑨가 증여일 현재 상증법 평가액을 실지거래가액(§97①1호가목)으로 본다 —
 * 매매사례가액·감정가액(나목)에 닿지 않는다. 그 평가액은 `actual*` 칸에 있고, 당초 증여자용 `presumed*`는 B에서 읽지 않는다.
 * K-6/K-7이 아니면 그대로 돌려준다(기존 K-1~K-5 거동 불변).
 */
export function toTransferorBasisInfo(info: BurdenedGiftInfo): BurdenedGiftInfo {
  if (!isPresumedCarryover(info)) return info;
  return {
    ...info,
    acquisitionMethod: "actual",
    presumedLandAcquisitionPrice: undefined,
    presumedBuildingAcquisitionPrice: undefined,
    presumedAcquisitionTotal: undefined,
  };
}

/** 증여받은 파트 — `carryoverDonorBasis.parts` 미지정이면 토지·건물 **둘 다**(종전 본문·분리 OFF · 계획서 `gb-bg-part-carryover-calc.plan.md` Q-1 a). */
export function carryoverPartsOf(info: BurdenedGiftInfo | undefined): { land: boolean; building: boolean } {
  return info?.carryoverDonorBasis?.parts ?? { land: true, building: true };
}

/** 토지·건물 중 **한 파트만** 증여받았는가. */
export function isPartialCarryover(info: BurdenedGiftInfo | undefined): boolean {
  const p = carryoverPartsOf(info);
  return p.land !== p.building;
}

/**
 * 한 파트만 이월과세일 때 계산할 수 없는 입력 — fail-fast(계획서 Q-3 a · Q-4 a).
 * · 총액 칸(양도인·당초 증여자 실지 총액 · 매매사례·감정 총액 · 시가): 취득시 기준시가로 나누면 증여받지 않은 파트에 당초 증여자 금액이 섞인다.
 * · K-6/K-7: `acquisitionMethod`가 당초 증여자 쪽 방식이라, 증여받지 않은 파트는 양도인 자기 방식이어야 한다 — 한 신고 안에서 파트마다 방식이 갈린다.
 */
function assertPartialCarryoverSupported(info: BurdenedGiftInfo): void {
  const fail = (why: string) => {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `[burdened_gift] 토지·건물 중 한 파트만 이월과세(소득세법 제97조의2 제1항)인 일반건물은 ${why}`,
    );
  };
  if (isPresumedCarryover(info))
    fail("취득가액 산정방식이 매매사례가액·감정가액이면 아직 계산하지 못합니다 — 증여받은 파트는 당초 증여자의 방식, 다른 파트는 양도인의 방식이라 한 신고 안에서 산정방식이 갈립니다.");
  const d = info.carryoverDonorBasis ?? {};
  if (
    d.actualAcquisitionTotal !== undefined || d.presumedAcquisitionTotal !== undefined || d.marketValueAtAcquisition !== undefined ||
    (info.acquisitionMethod === "actual" && info.actualAcquisitionTotal !== undefined)
  )
    fail("실지취득가액을 토지·건물로 나누어 입력해야 합니다 — 총액은 증여받은 파트와 다른 파트를 가를 수 없습니다.");
}

/**
 * 시나리오 A의 파트별 보유기간 기산일 — 「소득세법」 제95조 제4항 단서(「증여한 배우자 또는 직계존비속이 **해당 자산을** 취득한 날부터」).
 * 증여받은 파트만 당초 증여자 취득일로 옮기고, 다른 파트는 시나리오 B와 같은 날이다. 단건·지분·묶음 세 경로가 이 함수 하나를 쓴다.
 * 둘 다 이월과세면 건물은 당초 증여자의 **건물** 취득일(`buildingDonorAcquisitionDate` — 신축이면 사용승인일)이다. 없으면 사건 날짜 하나다(종전 본문 호환).
 */
export function carryoverHoldingStartsA(
  info: BurdenedGiftInfo | undefined,
  donorAcquisitionDate: Date,
  own: { land: Date; building: Date },
): { land: Date; building: Date } {
  const p = carryoverPartsOf(info);
  const buildingDonorDate = info?.carryoverDonorBasis?.buildingDonorAcquisitionDate ?? donorAcquisitionDate;
  return { land: p.land ? donorAcquisitionDate : own.land, building: p.building ? buildingDonorDate : own.building };
}
