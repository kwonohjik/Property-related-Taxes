/**
 * 부수토지 일체과세 세율 결정 (H-9)
 *
 * 나대지 취득 후 주택 신축·일괄양도 케이스에서
 * companion 토지에 적용할 세율을 결정한다.
 *
 * [부수토지 일체과세 원리 — 주택과 함께 양도되는 부수토지의 세율]
 * 1차 근거: 소득세법 §104①2호 괄호 — "주택(이에 딸린 토지로서 대통령령으로 정하는 토지를
 *          포함한다. **이하 이 항에서 같다**)" → 부수토지는 주택의 보유기간·세율을 따른다.
 *          위임 조문 = 시행령 §167의5(단기보유 주택부수토지의 범위).
 *          (기재부 재산세제과-1354(2022.10.27), 사전-2021-법규재산-1231(2022.10.31),
 *           조심 2024인3140(2024.9.3. 기각 — "토지·건물 별개 자산" 주장 배척))
 * 2차 근거: §104① 후단 "하나의 자산이 둘 이상 세율에 해당 시 큰 산출세액 적용"
 *          도 같은 결론을 지지.
 *
 * ⚠️ 세율 축의 근거는 영 §167의5다. 영 §154⑦은 §89①3호가 위임한 **비과세 축**으로 축이 다르다
 *    (배율 수치는 3/5/5/10로 동일 — 2026-07-30 KoreanLaw MCP 양쪽 본문 대조).
 *
 * 면적 한도 (영 §167의5):
 *   부수토지 인정 면적 = 주택 정착면적 × 3배(수도권 도시지역 주거·상업·공업) /
 *                        5배(수도권 녹지·수도권 밖 도시지역) / 10배(그 밖의 지역)
 *   한도 초과분은 일반 나대지로 분리 → 토지 본래 보유기간 기준 §104① 적용.
 *
 * 신축주택 취득일 (영 §162①4호):
 *   자가건축 주택은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 빠른 날.
 *
 * 사용자가 manualHoldingPeriodOverride 로 수동 지정한 경우 위 자동 분기를 무시한다.
 *
 * 법령코드 상수 (legal-codes.ts):
 *   TRANSFER.ONE_HOUSE_EXEMPT            — §89①3호 (1세대1주택 + 부수토지 일체과세)
 *   TRANSFER.SHORT_TERM_APPURTENANT_LAND — 영 §167의5 (세율 축 부수토지 한도)
 *   TRANSFER.HIGHER_TAX_RULE             — §104①후단 (복수 세율 → 큰 산출세액)
 *   TRANSFER.SELF_BUILT_ACQUISITION_DATE — 영 §162①4호 (자가건축 취득일)
 */

import type { TransferTaxInput } from "./types/transfer.types";
// 배율 세분 시행일(2022.1.1.)은 비사토 축(영 §168의12)과 **같은 부칙 호**로 움직인다 —
// 날짜를 두 곳에 적으면 개정 시 한쪽만 고쳐지는 dual-truth가 된다.
import { HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE } from "./non-business-land/urban-area";

// ─── 타입 ──────────────────────────────────────────────────────

/** companion 자산 입력 중 세율 결정에 필요한 필드 */
export interface CompanionLandRateInput {
  /** companion 자산 종류 ("land" 여야 부수토지 분기 대상) */
  assetKind: string;
  /** companion 토지 면적 (㎡) — 영 §167의5 한도 초과 판정용 */
  area?: number;
  /** 사용자 수동 세율 오버라이드 */
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /**
   * 토지 성질 명시 입력 (사용자가 자산 카드에서 선언).
   * - "appurtenant_to_housing": 주택 부수토지 (§104①2호·영§167의5 일체과세 대상)
   * - "non_appurtenant": 독립 나대지 (일체과세 대상 아님)
   * - undefined: 미선언 → 자동 분기 진입 안 함
   */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";
}

/**
 * 부수토지 인정 한도 zone (소득세법 시행령 §167의5 — 세율 축)
 * - "metropolitan_residential": 수도권 + 도시지역 + 주거·상업·공업 → 3배
 * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
 * - "non_urban": 도시지역 외 → 10배
 */
export type AppurtenantLandZone =
  | "metropolitan_residential"
  | "non_metropolitan_or_green"
  | "non_urban";

/**
 * zone → 정착면적 배율 (영 §167의5)
 *
 * **2022.1.1. 전 양도분은 종전 규정** — 도시지역 內 일률 5배 / 그 밖의 토지 10배
 * (2020.2.11. 대통령령 제30395호 부칙 §1 3호·§39. 시행일 상수는 비사토 축과 공유 —
 *  `HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE`. 부칙 §39가 §154⑦1호·§167의5 1호·§168의12 1호를
 *  한 묶음으로 지목하므로 세 축이 함께 움직인다.)
 *
 * ⚠️ 종전 §167의5 1호 원문은 직접 확보하지 못했다. 같은 부칙 호로 개정된 §154⑦·§168의12의
 *    종전 1호가 모두 "도시지역 내의 토지: 5배"임이 확인되어(조심 2021광2410 별지) 동일하게 본다.
 *
 * @param transferDate 양도일. **미제공 시 현행 배율**(기존 호출부 호환).
 */
export function appurtenantLandMultiplier(
  zone: AppurtenantLandZone | undefined,
  transferDate?: Date,
): number {
  const isPreSplit =
    transferDate !== undefined && transferDate < HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE;

  switch (zone) {
    case "metropolitan_residential":
      // 종전: 도시지역 內 일률 5배 (수도권 축 없음)
      return isPreSplit ? 5 : 3;
    case "non_metropolitan_or_green":
      return 5;
    case "non_urban":
      return 10;
    default:
      // 미지정 시 보수적으로 가장 작은 한도 적용 — 한도 초과 케이스를 더 안전하게 분리.
      // '가장 작은 한도'가 시행일 전후로 5배/3배로 갈린다.
      return isPreSplit ? 5 : 3;
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
  /** 건물 정착면적 (㎡) — 영 §167의5 한도 산정 */
  buildingFootprintArea?: number;
  /**
   * @deprecated isUrbanArea 단일 boolean은 영 §167의5 3단계(3/5/10)를 표현 못함.
   * 신규 코드는 appurtenantLandZone 사용. 이 필드는 하위호환만 유지:
   *   true  → "non_metropolitan_or_green" (5배 보수적 매핑)
   *   false → "non_urban" (10배)
   */
  isUrbanArea?: boolean;
  /**
   * 부수토지 한도 zone (영 §167의5) — 3/5/10배 결정.
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
 * primary 주택 보유기간(월)에 따라 부수토지 일체과세 적용 세율을 반환한다.
 *
 * [포괄적 일체과세 원칙]
 *   부수토지=Yes 선언 시 주택과 동일한 보유기간 기준 세율 적용 (§104①).
 *   - 1년 미만: 70% (§104①3호 괄호 — 주택·입주권·분양권)
 *   - 1년~2년: 60% (§104①2호 괄호 — 주택·입주권·분양권)
 *   - 2년 이상: 누진세율 (일반 세율, "progressive" 신호)
 *
 * 반환값:
 *   number: 단일세율 (0.70 또는 0.60)
 *   "progressive": 누진세율 적용 신호 — 호출부에서 `manualProgressive=true`로 처리
 */
export function housingRateForHoldingPeriod(holdingMonths: number): number | "progressive" {
  if (holdingMonths < 12) return 0.70;  // 1년 미만 → 70% (§104①3호)
  if (holdingMonths < 24) return 0.60;  // 1년~2년 → 60% (§104①2호)
  return "progressive";                  // 2년 이상 → 누진세율
}

/**
 * companion 토지에 적용할 세율을 결정한다.
 *
 * 호출 순서:
 *   1. 수동 오버라이드(manualHoldingPeriodOverride) 우선.
 *   2. landNature === "appurtenant_to_housing" 선언 시 주택 보유기간 기준 세율 동적 적용.
 *   3. 면적 한도 검증 (영 §167의5).
 *   4. 조건 미충족 시 applied=false → 호출부가 기존 경로(본래 보유기간 기준) 진행.
 *
 * [설계 변경 — 자동 분기 단순화]
 *   Before: primary 보유 1년 미만 + 일괄양도 조건 휴리스틱 (법령상 무관)
 *   After:  landNature 명시 입력 단독 판정 (부수토지 판정 = 사실 판단, 법령 근거 영 §167의5)
 */
export function resolveCompanionLandRate(
  companion: CompanionLandRateInput,
  primary: PrimaryContextForCompanionRate,
  /** 양도일 — 영 §167의5 배율 경과조치(2022.1.1., 부칙 §39) 판정용. 미제공 시 현행 배율. */
  transferDate?: Date,
): CompanionLandRateResolution {

  // ── 수동 오버라이드 우선 처리 ──
  if (companion.manualHoldingPeriodOverride !== undefined) {
    const override = companion.manualHoldingPeriodOverride;
    if (override === "shortTermHousing70") {
      return { applied: true, manualRate: 0.70 };
    }
    if (override === "shortTerm60") {
      // 계획서 enum명 "shortTerm60"은 1~2년 주택 세율(60%) 강제를 의미
      return { applied: true, manualRate: 0.60 };
    }
    if (override === "progressive") {
      return { applied: true, manualProgressive: true };
    }
  }

  // ── landNature 명시 입력 확인 ──
  // "non_appurtenant" 또는 undefined이면 일체과세 대상 아님 → applied=false
  if (companion.landNature !== "appurtenant_to_housing") {
    return { applied: false };
  }

  // ── primary가 주택 계열인지 확인 ──
  const isPrimaryHousing =
    primary.propertyType === "housing" ||
    primary.propertyType === "right_to_move_in" ||
    primary.propertyType === "presale_right";

  if (!isPrimaryHousing) {
    return { applied: false };
  }

  const appliedReason =
    "주택·부수토지 일체과세(§104①2호·영§167의5, 기재부 재산세제과-1354·조심 2024인3140)";

  // ── 면적 한도 검증 (영 §167의5) ──
  const hasFootprintArea =
    primary.buildingFootprintArea !== undefined && primary.buildingFootprintArea > 0;

  // 주택 보유기간 기준 세율 결정 (포괄적 일체과세)
  const rateDecision = housingRateForHoldingPeriod(primary.holdingMonths);

  if (hasFootprintArea) {
    // 영 §167의5 부수토지 한도 계산 (정착면적 입력된 경우)
    // 우선순위: appurtenantLandZone(3/5/10배) > isUrbanArea(deprecated, 5/10배 fallback)
    const zone: AppurtenantLandZone | undefined =
      primary.appurtenantLandZone ??
      (primary.isUrbanArea === undefined
        ? undefined
        : primary.isUrbanArea
          ? "non_metropolitan_or_green"
          : "non_urban");
    const multiplier = appurtenantLandMultiplier(zone, transferDate);
    const limitArea = primary.buildingFootprintArea! * multiplier;
    const companionArea = companion.area ?? 0;
    const excessArea = companionArea > 0 ? Math.max(0, companionArea - limitArea) : 0;

    if (excessArea > 0) {
      // 한도 초과분 분리:
      //   한도 내 → 주택 보유기간 기준 세율 (포괄적 일체과세)
      //   한도 초과 → 토지 본래 보유기간 기준 §104① 세율 (route 레이어에서 별도 자산 분리)
      if (rateDecision === "progressive") {
        return {
          applied: true,
          manualProgressive: true,
          excessRate: 0.40,
          limitArea,
          excessArea,
          appliedReason,
        };
      }
      return {
        applied: true,
        unifiedRate: rateDecision,
        excessRate: 0.40,
        limitArea,
        excessArea,
        appliedReason,
      };
    }

    // 전량 부수토지 인정 → 주택 보유기간 기준 세율 전체 적용
    if (rateDecision === "progressive") {
      return {
        applied: true,
        manualProgressive: true,
        limitArea,
        excessArea: 0,
        appliedReason,
      };
    }
    return {
      applied: true,
      unifiedRate: rateDecision,
      limitArea,
      excessArea: 0,
      appliedReason,
    };
  }

  // 정착면적 미입력 시 fallback — 한도 검증 생략, 전량 부수토지로 가정
  // (한도 초과 케이스는 사용자가 정착면적·도시지역 입력 시 정확히 판정됨)
  if (rateDecision === "progressive") {
    return {
      applied: true,
      manualProgressive: true,
      excessArea: 0,
      appliedReason: appliedReason + " (정착면적 미입력 — 전량 부수토지로 가정)",
    };
  }
  return {
    applied: true,
    unifiedRate: rateDecision,
    excessArea: 0,
    appliedReason: appliedReason + " (정착면적 미입력 — 전량 부수토지로 가정)",
  };
}
