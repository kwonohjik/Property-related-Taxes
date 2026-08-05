/**
 * 건축물(비주택) 부속토지 기준면적 초과분 판정 — **전 경로 공용**.
 *
 * ## 근거 체인
 *
 * ```
 * 「소득세법」 §104의3①4호나목
 *   → 「지방세법」 §106①2호 (별도합산과세대상)
 *     → 「지방세법 시행령」 §101①2호 (건축물 바닥면적 × §101② 적용배율)
 *     → 「지방세법 시행령」 §101②   (용도지역별 적용배율 표)
 * ```
 *
 * 기준면적을 초과하는 부속토지는 재산세 별도합산에서 빠져 종합합산이 되고,
 * 그 결과 「소득세법」 §104의3①4호나목의 제외 대상에서 벗어나 **비사업용 토지**가 된다.
 * 초과분만 중과하므로(§104의3) 면적 비율을 함께 돌려준다.
 *
 * ## §101① 단서 — 전량 비사업용
 *
 * 「건축법」 등에 따라 **허가 등을 받아야 할 건축물로서 허가를 받지 않은 건축물**,
 * **사용승인을 받아야 할 건축물로서 사용승인(임시사용승인 포함)을 받지 않고 사용 중인
 * 건축물**의 부속토지는 별도합산에서 제외된다 → 배율과 무관하게 부속토지 전량이 비사업용.
 *
 * ⚠️ **범위는 "무허가 신축"보다 넓다** — 법제처 법령해석례 **25-0823**(2026.02.03)은
 * 단서의 "허가 등"·"사용승인"이 「건축법」 §11 건축허가·§22 사용승인으로 한정되지 않으며,
 * **§19②1호 용도변경 허가**를 받지 않거나 **§19⑤ 본문·§22 사용승인**을 받지 않고 용도를
 * 변경해 사용 중인 경우도 포함된다고 회답했다(용도변경 이후 도래하는 과세기준일 기점).
 * ⇒ 입력 플래그 이름은 `isUnregistered`이나 의미는 **"허가·사용승인 미이행"** 전반이다.
 *
 * ## 미구현 (입력 부재)
 *
 * §101①2호 **가목**(법 §106①3호다목 토지 안의 건축물 부속토지)·**나목**(건축물 시가표준액이
 * 부속토지 시가표준액의 100분의 2 미달 시 바닥면적을 제외한 부속토지)은 이 헬퍼가 다루지
 * 않는다 — 판정에 필요한 입력이 GB/CB 폼에 없다. 나목은 별도 경로
 * (`non-business-land/other-land.ts` `isBareLand`)가 `land` 자산에 한해 처리한다.
 *
 * ## 배율 정본
 *
 * `local-tax-zone-multiplier.ts`(§101② 표)가 단일 정본이다. 여기서 재선언·추정 금지 —
 * 표에 없는 용도지역은 배율 결정 불가로 보고 차단한다.
 */

import { getZoneAreaMultiplier } from "./local-tax-zone-multiplier";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

/** §101① 단서 해당 시 표시 문구 — 배율 없이 전량 비사업용. */
const UNREGISTERED_DETAIL = "허가·사용승인 미이행 건축물 — 전체 비사업용 (「지방세법 시행령」 제101조 제1항 단서)";

export interface AppurtenantLandExcessInput {
  /** 부속토지 전체 면적 (㎡) */
  landArea: number;
  /** 건축물 바닥면적 — 건축물 외 시설은 수평투영면적 (㎡) */
  buildingFootprintArea: number;
  /** 용도지역 (§101② 표 키). 미입력·표 미등재는 차단한다. */
  zoneType?: string;
  /**
   * §101① 단서 해당 여부 — 허가·사용승인 미이행(불법 용도변경 포함, 해석례 25-0823).
   * true면 배율과 무관하게 부속토지 전량이 비사업용이다.
   */
  isUnregistered?: boolean;
  /**
   * 오류 메시지 접두사 — 어느 입력 경로에서 났는지 사용자가 알 수 있게 한다.
   * 예: `"일반건물"`, `"일반건물(증축)"`, `"일반건물(실거래가)"`, `"상업용건물"`.
   */
  context: string;
}

export interface AppurtenantLandExcessResult {
  /** 적용배율 (§101② 표). §101① 단서 해당 시 0. */
  multiplier: number;
  /** 배율 산정 근거 표시 문구 */
  multiplierDetail: string;
  /** 기준면적 = 바닥면적 × 배율 (㎡). §101① 단서 해당 시 0. */
  allowedLandArea: number;
  /** 부속토지가 기준면적 이내인지 */
  isWithinLimit: boolean;
  /** 기준면적 초과분 = 비사업용 면적 (㎡) */
  nonBusinessArea: number;
  /** 초과분 비율 (0~1) — 표시·안분용 정밀값(반올림하지 않는다) */
  nonBusinessRatio: number;
}

/**
 * 부속토지 기준면적 초과분을 판정한다.
 *
 * @throws 용도지역 미입력 / §101② 표 미등재 용도지역(세분 전 `residential` 등).
 *   추정 배율로 대체하면 초과분 면적이 조용히 틀어져 중과 세액이 어긋난다.
 */
export function judgeAppurtenantLandExcess(
  input: AppurtenantLandExcessInput,
): AppurtenantLandExcessResult {
  const { landArea, buildingFootprintArea, zoneType, isUnregistered, context } = input;

  let multiplier: number;
  let multiplierDetail: string;
  let allowedLandArea: number;

  if (isUnregistered) {
    // §101① 단서 — 배율 계산 없이 전량 비사업용
    multiplier = 0;
    multiplierDetail = UNREGISTERED_DETAIL;
    allowedLandArea = 0;
  } else {
    if (!zoneType) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `${context} 비사업용토지 판정: zoneType(용도지역)이 입력되지 않았습니다. 계산 전 용도지역을 선택하세요.`,
      );
    }
    const resolved = getZoneAreaMultiplier(zoneType);
    if (!resolved) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `${context} 비사업용토지 판정: 용도지역 "${zoneType}"은 「지방세법 시행령」 제101조 제2항 ` +
          `적용배율표에 대응 항목이 없습니다. 세분된 용도지역(전용주거·일반주거·준주거 등)을 선택하세요.`,
      );
    }
    multiplier = resolved.multiplier;
    multiplierDetail = resolved.detail;
    allowedLandArea = buildingFootprintArea * multiplier;
  }

  const isWithinLimit = landArea <= allowedLandArea;
  const nonBusinessArea = Math.max(0, landArea - allowedLandArea);
  const nonBusinessRatio = landArea > 0 ? nonBusinessArea / landArea : 0;

  return {
    multiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinLimit,
    nonBusinessArea,
    nonBusinessRatio,
  };
}
