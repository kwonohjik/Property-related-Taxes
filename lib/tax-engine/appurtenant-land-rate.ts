/**
 * 부수토지 일체과세 세율 결정 (H-9)
 *
 * 나대지 취득 후 주택 신축·일괄양도 케이스에서
 * companion 토지에 적용할 세율을 결정한다.
 *
 * [부수토지 일체과세 원리 — 주택과 함께 양도되는 부수토지의 세율]
 * 1차 근거: 소득세법 §89①3호 / 시행령 §154⑦의 입법 취지에 따라
 *          주택의 부수토지는 주택과 일체로 보아 주택의 보유기간·세율을 적용한다.
 *          (기재부 재산-53(2015.1.15), 재산-1354(2022.10.27))
 * 2차 근거: §104① 후단 "하나의 자산이 둘 이상 세율에 해당 시 큰 산출세액 적용"
 *          도 같은 결론을 지지.
 *
 * 면적 한도 (영 §154⑦):
 *   부수토지 인정 면적 = 건물 정착면적 × 5(도시지역) 또는 10(도시지역 외)
 *   한도 초과분은 일반 나대지로 분리 → 토지 본래 보유기간 기준 §104① 적용.
 *
 * 신축주택 취득일 (영 §162①4호):
 *   자가건축 주택은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 빠른 날.
 *
 * 사용자가 manualHoldingPeriodOverride 로 수동 지정한 경우 위 자동 분기를 무시한다.
 *
 * 법령코드 상수 (legal-codes.ts):
 *   TRANSFER.ONE_HOUSE_EXEMPT            — §89①3호 (1세대1주택 + 부수토지 일체과세)
 *   TRANSFER.APPURTENANT_LAND_LIMIT      — 영 §154⑦ (부수토지 한도)
 *   TRANSFER.HIGHER_TAX_RULE             — §104①후단 (복수 세율 → 큰 산출세액)
 *   TRANSFER.SELF_BUILT_ACQUISITION_DATE — 영 §162①4호 (자가건축 취득일)
 */

import type { TransferTaxInput } from "./types/transfer.types";

// ─── 타입 ──────────────────────────────────────────────────────

/** companion 자산 입력 중 세율 결정에 필요한 필드 */
export interface CompanionLandRateInput {
  /** companion 자산 종류 ("land" 여야 부수토지 분기 대상) */
  assetKind: string;
  /** companion 토지 면적 (㎡) — 영 §154⑦ 한도 초과 판정용 */
  area?: number;
  /** 사용자 수동 세율 오버라이드 */
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
}

/**
 * 부수토지 인정 한도 zone (소득세법 시행령 §154⑦, 2022년 개정 후)
 * - "metropolitan_residential": 수도권 + 도시지역 + 주거·상업·공업 → 3배
 * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
 * - "non_urban": 도시지역 외 → 10배
 */
export type AppurtenantLandZone =
  | "metropolitan_residential"
  | "non_metropolitan_or_green"
  | "non_urban";

/**
 * zone → 정착면적 배율 (영 §154⑦)
 */
export function appurtenantLandMultiplier(zone: AppurtenantLandZone | undefined): number {
  switch (zone) {
    case "metropolitan_residential":
      return 3;
    case "non_metropolitan_or_green":
      return 5;
    case "non_urban":
      return 10;
    default:
      // 미지정 시 보수적으로 가장 작은 한도(3배) 적용 — 한도 초과 케이스를 더 안전하게 분리
      return 3;
  }
}

/** primary 자산에서 부수토지 분기에 필요한 최소 컨텍스트 */
export interface PrimaryContextForCompanionRate {
  /** primary 자산 종류 ("housing" 계열이어야 부수토지 분기 대상) */
  propertyType: TransferTaxInput["propertyType"];
  /** 일괄양도 모드 */
  bundledSaleMode?: "actual" | "apportioned";
  /**
   * primary 보유기간 (월) — 취득일~양도일로 사전 계산한 값.
   * 영 §162①4호 기준 취득일(사용승인일 등) 기준으로 산정해야 정확함.
   */
  holdingMonths: number;
  /** 건물 정착면적 (㎡) — 영 §154⑦ 한도 산정 */
  buildingFootprintArea?: number;
  /**
   * @deprecated isUrbanArea 단일 boolean은 영 §154⑦ 3단계(3/5/10)를 표현 못함.
   * 신규 코드는 appurtenantLandZone 사용. 이 필드는 하위호환만 유지:
   *   true  → "non_metropolitan_or_green" (5배 보수적 매핑)
   *   false → "non_urban" (10배)
   */
  isUrbanArea?: boolean;
  /**
   * 부수토지 한도 zone (영 §154⑦) — 3/5/10배 결정.
   * 신규 코드는 이 필드를 사용. isUrbanArea보다 우선.
   */
  appurtenantLandZone?: AppurtenantLandZone;
}

/** 세율 결정 결과 */
export interface CompanionLandRateResolution {
  /** 자동 분기 적용 여부 */
  applied: boolean;
  /** 부수토지(한도 내)에 적용할 단일세율 (0.70) */
  unifiedRate?: number;
  /** 한도 초과분에 적용할 세율 (0.40 등) — 초과 없으면 undefined */
  excessRate?: number;
  /** 부수토지 인정 한도 면적 (㎡) */
  limitArea?: number;
  /** 한도 초과 면적 (㎡, 0이면 전량 부수토지 인정) */
  excessArea?: number;
  /**
   * 자동 분기 적용 근거 문자열 (메타데이터 / 결과 표 주석용).
   * T-15 anchor: "주택·부수토지 일체과세" 포함 여부 검증.
   */
  appliedReason?: string;
  /** 수동 오버라이드 시 적용 단일세율 */
  manualRate?: number;
  /** 수동 오버라이드 시 누진세율 사용 여부 */
  manualProgressive?: boolean;
}

// ─── 함수 ──────────────────────────────────────────────────────

/**
 * companion 토지에 적용할 세율을 결정한다.
 *
 * 호출 순서:
 *   1. 수동 오버라이드(manualHoldingPeriodOverride) 우선.
 *   2. 자동 분기 조건 모두 충족 시 주택 단기보유 70% 적용.
 *   3. 한도 초과분이 있으면 excessRate(40%) 함께 반환.
 *   4. 조건 미충족 시 applied=false → 호출부가 기존 경로(본래 보유기간 기준) 진행.
 */
export function resolveCompanionLandRate(
  companion: CompanionLandRateInput,
  primary: PrimaryContextForCompanionRate,
): CompanionLandRateResolution {

  // ── 수동 오버라이드 우선 처리 ──
  if (companion.manualHoldingPeriodOverride !== undefined) {
    const override = companion.manualHoldingPeriodOverride;
    if (override === "shortTermHousing70") {
      return { applied: true, manualRate: 0.70 };
    }
    if (override === "shortTerm60") {
      // 계획서 enum명 "shortTerm60"은 1~2년 토지 세율(40%) 강제를 의미
      // (UI 라벨 "40%"와 enum명이 분리된 설계 — 엔진에서는 0.40 반환)
      return { applied: true, manualRate: 0.40 };
    }
    if (override === "progressive") {
      return { applied: true, manualProgressive: true };
    }
  }

  // ── 자동 분기 조건 확인 ──
  const isPrimaryHousing =
    primary.propertyType === "housing" ||
    primary.propertyType === "right_to_move_in" ||
    primary.propertyType === "presale_right";

  const isCompanionLand = companion.assetKind === "land";

  // bundledSaleMode가 없어도 companion이 있으면 일괄양도로 간주 (하위 호환)
  const isBundled = true;
  void primary.bundledSaleMode; // 현재는 isBundled=true 고정, 향후 strict 모드 전환 시 제거

  // 영 §162①4호 기준 취득일로부터 1년 미만 보유 여부 (엄밀: < 12개월)
  const isPrimaryShortTerm = primary.holdingMonths < 12;

  const hasFootprintArea =
    primary.buildingFootprintArea !== undefined && primary.buildingFootprintArea > 0;

  // 자동 분기 조건 (영 §154⑦):
  //   primary=주택 + companion=토지 + 일괄양도 + 주택 보유 1년 미만.
  //   buildingFootprintArea는 한도 검증을 위해 권장되지만, 미입력 시 전량 부수토지로 가정한다
  //   (사용자 의도 유추 — 토지+주택 일괄양도 시 부수토지가 통상적이므로).
  if (
    isPrimaryHousing &&
    isCompanionLand &&
    isBundled &&
    isPrimaryShortTerm
  ) {
    const appliedReason =
      "주택·부수토지 일체과세(§89①3호·영§154⑦, 기재부 재산-53/재산-1354)";

    if (hasFootprintArea) {
      // 영 §154⑦ 부수토지 한도 계산 (정착면적 입력된 경우)
      // 우선순위: appurtenantLandZone(3/5/10배) > isUrbanArea(deprecated, 5/10배 fallback)
      const zone: AppurtenantLandZone | undefined =
        primary.appurtenantLandZone ??
        (primary.isUrbanArea === undefined
          ? undefined
          : primary.isUrbanArea
            ? "non_metropolitan_or_green"
            : "non_urban");
      const multiplier = appurtenantLandMultiplier(zone);
      const limitArea = primary.buildingFootprintArea! * multiplier;
      const companionArea = companion.area ?? 0;
      const excessArea = companionArea > 0 ? Math.max(0, companionArea - limitArea) : 0;

      if (excessArea > 0) {
        // 한도 초과분 분리:
        //   한도 내 → 주택 단기 70% (§89①3호·영§154⑦)
        //   한도 초과 → 토지 본래 보유기간 기준 §104①3호 세율
        return {
          applied: true,
          unifiedRate: 0.70,
          excessRate: 0.40,
          limitArea,
          excessArea,
          appliedReason,
        };
      }

      // 전량 부수토지 인정 → 주택 단기 70% 전체 적용
      return {
        applied: true,
        unifiedRate: 0.70,
        limitArea,
        excessArea: 0,
        appliedReason,
      };
    }

    // 정착면적 미입력 시 fallback — 한도 검증 생략, 전량 부수토지로 가정
    // 사용자가 자산을 토지 + 주택 일괄로 등록한 자체가 "부수토지" 의도로 해석.
    // (한도 초과 케이스는 사용자가 정착면적·도시지역 입력 시 정확히 판정됨)
    return {
      applied: true,
      unifiedRate: 0.70,
      excessArea: 0,
      appliedReason: appliedReason + " (정착면적 미입력 — 전량 부수토지로 가정)",
    };
  }

  // 자동 분기 미해당 → companion 본래 보유기간 기준 세율 적용 (호출부 처리)
  return { applied: false };
}
