/**
 * 사례 35 후속-1 — 양도소득세 집행기준 99-164-10 환산주택가격.
 *
 * 주택으로 개별주택가격이 최초공시된 후 상가로 용도를 변경하여 양도하는 경우
 * 취득당시 환산주택가격을 산정하고, 자산별 취득당시 기준시가 비율로 안분하여
 * acquisition*StdPrice를 override한다.
 *
 * `general-building-valuation.ts` 800줄 정책 회피를 위해 sibling 분리.
 */

import type { GeneralBuildingInput } from "./general-building-valuation";
import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * §99-164-10 산정 상세 — **결과 화면 표시용**(2026-08-13).
 *
 * 종전에는 환산주택가격이 `acquisition*StdPrice`를 조용히 덮고 사라져, 결과 화면에서
 * 「취득당시 기준시가가 왜 이 값인지」를 볼 수 없었다. 산식의 네 항을 그대로 노출한다.
 */
export interface ConvertedHousingDetail {
  /** 환산주택가격 (원) — 집행기준 99-164-10 산식의 결과 */
  converted: number;
  /** 최초공시주택가격 (원) — 피승수 */
  firstDisclosurePrice: number;
  /** 취득당시 토지 기준시가 (㎡당 공시지가 × 토지면적) */
  acqLandStd: number;
  /** 취득당시 건물 기준시가 */
  acqBuildingStd: number;
  /** 분자 = 취득당시 토지 + 건물 */
  acqTotal: number;
  /** 최초공시 당시 토지 기준시가 */
  firstDiscLand: number;
  /** 최초공시 당시 건물 기준시가 */
  firstDiscBuilding: number;
  /** 분모 = 최초공시 당시 토지 + 건물 */
  firstDiscTotal: number;
  /** 안분 결과 — 환산주택가격 중 토지분 */
  convertedLand: number;
  /** 안분 결과 — 환산주택가격 중 건물분 */
  convertedBuilding: number;
}

/**
 * 산식 계산 **단일 소스**. `calcConvertedHousingPrice`·`applyConvertedHousingPriceOverride`·
 * `buildConvertedHousingDetail` 셋이 모두 이것을 쓴다 — 각자 재구현하면 화면 표시값과
 * 실제 세액이 조용히 갈린다(`feedback_ui_engine_dual_truth_avoidance`).
 *
 * 분모가 0이면 `null`(계산 불가). **분자 0은 null이 아니다** — 종전 `calcConvertedHousingPrice`가
 * 그 경우 0을 반환했고, 그 동작을 바꾸지 않는다.
 */
function computeConverted(input: GeneralBuildingInput): ConvertedHousingDetail | null {
  const acqLandStd = (input.acquisitionLandPricePerSqm ?? 0) * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice ?? 0;
  const firstDiscLand = input.firstDisclosureLandStdPrice ?? 0;
  const firstDiscBuilding = input.firstDisclosureBuildingStdPrice ?? 0;
  const firstDiscTotal = firstDiscLand + firstDiscBuilding;
  if (firstDiscTotal <= 0) return null;
  const acqTotal = acqLandStd + acqBuildingStd;
  // 2026-07-29 정정(#591 감사 R7): `Math.floor(a * b / c)`는 `a * b`가 2^53을 넘으면
  //   부동소수 반올림으로 ±1원이 틀어진다(기준시가 억 단위 곱에서 실제 발생).
  //   곱셈을 BigInt로 안전하게 처리하는 `safeMultiplyThenDivide`로 교체
  //   (memory `feedback_safemul_decimal_apportion_precision`).
  const converted = safeMultiplyThenDivide(
    input.firstDisclosurePrice ?? 0,
    acqTotal,
    firstDiscTotal,
  );
  // 안분도 같은 정밀도 규칙 — 잔액은 건물분이 흡수한다(토지 floor의 반대편).
  const convertedLand =
    acqTotal > 0 ? safeMultiplyThenDivide(converted, acqLandStd, acqTotal) : 0;
  return {
    converted,
    firstDisclosurePrice: input.firstDisclosurePrice ?? 0,
    acqLandStd,
    acqBuildingStd,
    acqTotal,
    firstDiscLand,
    firstDiscBuilding,
    firstDiscTotal,
    convertedLand,
    convertedBuilding: converted - convertedLand,
  };
}

/**
 * §99-164-10 환산주택가격 산식.
 *
 *   환산주택가격 = 최초공시주택가격
 *                × (취득당시 토지기준시가 + 취득당시 건물기준시가)
 *                ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
 */
export function calcConvertedHousingPrice(input: GeneralBuildingInput): number {
  return computeConverted(input)?.converted ?? 0;
}

/**
 * 결과 화면용 산정 상세 — `hasFirstDisclosure`가 켜지고 실제로 환산이 성립할 때만 반환.
 *
 * 게이트를 `applyConvertedHousingPriceOverride`와 **똑같이** 맞춘다: override가 input을
 * 되돌려보낸(=환산이 적용되지 않은) 경우에 detail만 뜨면 화면이 「환산했다」고 거짓말한다.
 */
export function buildConvertedHousingDetail(
  input: GeneralBuildingInput,
): ConvertedHousingDetail | undefined {
  if (!input.hasFirstDisclosure) return undefined;
  const d = computeConverted(input);
  if (!d || d.acqTotal <= 0 || d.converted <= 0) return undefined;
  return d;
}

/**
 * 환산주택가격을 자산별 취득당시 기준시가 비율로 안분하여
 * `acquisitionLandPricePerSqm` + `acquisitionBuildingStdPrice` 를 override.
 *
 * hasFirstDisclosure=false 시 input 그대로 반환 — 회귀 0.
 * 환산 모드는 GeneralBuildingInput 진입 시점에 이미 결정되어 있음
 * (route helper `actualPriceMode===false` 분기에서만 본 함수 도달).
 */
export function applyConvertedHousingPriceOverride(
  input: GeneralBuildingInput,
): GeneralBuildingInput {
  const d = buildConvertedHousingDetail(input);
  if (!d) return input;
  // 토지분을 원/㎡ 로 되돌리면 하류가 `floor(perSqm × landArea)` 로 복원하므로 그 나눗셈의
  // 잔액(최대 landArea−1 원)이 사라진다. `buildConvertedHousingDetail` 이 이미 "잔액은 건물분이
  // 흡수한다"는 정책을 쓰므로, override 도 같은 정책을 이어받아 **합계를 보존**한다
  // (실측: landArea 100 → 94원, 317 → 300원 소실. 저장소 정책 `feedback_floor_residual_absorption`).
  const landPerSqm = input.landArea > 0 ? Math.floor(d.convertedLand / input.landArea) : 0;
  const restoredLand = Math.floor(landPerSqm * input.landArea);
  const residual = d.convertedLand - restoredLand;
  return {
    ...input,
    acquisitionLandPricePerSqm: landPerSqm,
    acquisitionBuildingStdPrice: d.convertedBuilding + residual,
  };
}
