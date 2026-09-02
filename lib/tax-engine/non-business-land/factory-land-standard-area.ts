/**
 * 공장용 건축물 부속토지 기준면적 판정 (§104의3①4호나목 경로).
 *
 * ## 근거 체인 — 지역에 따라 **배타 분기**한다
 *
 * ```
 * 「소득세법」 §104의3①4호나목  (별도합산·분리과세 대상 = 비사업용에서 제외)
 *   ├─ 읍·면지역 / 산업단지 / 공업지역
 *   │    → 「지방세법」 §106①3호가목 → 시행령 §102①1호 → 시행규칙 §50 → **별표6**
 *   │      기준면적 = 공장건축물 연면적 × 100 ÷ 업종별 기준공장면적률
 *   │
 *   └─ 그 밖의 특별시·광역시(군 제외)·특별자치시·특별자치도·시지역
 *        → 「지방세법」 §106①2호가목 → 시행령 §101①1호
 *          기준면적 = 공장용 건축물 **바닥면적** × §101② 용도지역별 적용배율
 * ```
 *
 * 두 한도 중 어느 쪽이든 **초과분은 §106①1호 종합합산**으로 떨어져 나목의 제외 대상에서
 * 벗어나므로 **비사업용 토지**가 된다.
 *
 * ⚠️ **연면적(별표6)과 바닥면적(§101①1호)은 다른 값이다.** 조심 2025서2489 실례에서
 * 같은 공장의 두 값이 89,865.838㎡(연면적) vs 81,473.36㎡(바닥면적)로 갈렸다. 한 칸으로 받지 말 것.
 *
 * ## 판정 단위 — 필지가 아니라 「1구의 공장」 전체
 *
 * 부속토지 해당 여부는 "필지 수나 공부상의 기재와 관계없이 토지의 이용현황에 따라 객관적으로
 * 결정"된다(대법원 1994.12.27. 선고 94누8372). 조심 2023지0373은 1필지 33,816.2㎡ 중 나대지
 * 20,163.83㎡도 **"하나의 울타리 내"** 라는 이유로 전량 분리과세로 경정했다(참조 조심 2021지2777).
 *
 * ⇒ 여기 들어오는 면적은 **공장 전체값**이며, 산출된 초과 비율을 양도 대상 토지에 적용한다.
 *
 * ## 지역 자동판정 없음
 *
 * 산업단지 지정 여부는 용도지역(`zoneType`)만으로 알 수 없다. 추정하면 한도 산식 자체가
 * 뒤바뀌므로 `locationCategory`를 **필수 입력**으로 받는다(자동 안분 fallback 금지).
 */

import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import type { FactoryLandUsage } from "./types";

// 「공장입지 기준고시」 §4 지식산업센터 40% — 정본은 `data/factory-area-rates.ts`(별표1 데이터와 동거).
// 여기서 재선언하지 않고 재수출만 한다(이중 진실 방지 — 기존 import 경로 하위 호환).
export { KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT } from "../data/factory-area-rates";

// 별표6 산식 자체는 **세목 중립**이다 — 재산세(§102①1호)와 양도세(§104의3①4호나목)가 같은
// 분모를 쓴다. 정본은 `../factory-standard-area.ts`이고 여기서는 재수출만 한다.
// 사본을 두면 「공장입지 기준고시」 재고시 때 한 벌만 갱신되어 두 세목이 갈린다.
export {
  computeFactoryStandardArea,
  type FactoryIndustrySegmentDetail,
  type FactoryStandardAreaResult,
} from "../factory-standard-area";

import { computeFactoryStandardArea } from "../factory-standard-area";
import type { FactoryStandardAreaResult } from "../factory-standard-area";

export interface FactoryLandExcessResult {
  /** 적용 근거 경로 */
  route: "separate_taxation" | "aggregate_taxation";
  /** 최종 기준면적 (㎡). §101①단서·§102①1호단서 해당 시 0. */
  standardArea: number;
  /** 부속토지가 기준면적 이내인지 */
  isWithinLimit: boolean;
  /** 초과분 = 비사업용 면적 (㎡) */
  nonBusinessArea: number;
  /** 초과분 비율 (0~1) — 반올림하지 않은 정밀값 */
  nonBusinessRatio: number;
  /** 단서(허가·사용승인 미이행) 해당 — 안분 없이 전량 비사업용. `standardArea === 0`으로 추론하지 말 것. */
  isUnregisteredException: boolean;
  /** 판정 근거 표시 문구 */
  detail: string;
  /** 별표6 경로일 때만 — 산출 내역 */
  standardAreaDetail?: FactoryStandardAreaResult;
}

/** 「지방세법 시행령」 §101①·§102①1호 각 단서 — 허가·사용승인 미이행 시 전량 비사업용. */
const UNREGISTERED_DETAIL =
  "허가·사용승인 미이행 공장용 건축물 — 부속토지 전량 비사업용 " +
  "(「지방세법 시행령」 제102조 제1항 제1호 단서·제101조 제1항 단서)";

/**
 * 공장용 건축물 부속토지의 기준면적 초과분을 판정한다.
 *
 * 비교 대상은 `usage.totalAppurtenantLandArea`(**1구의 공장 전체**)다 — 양도 대상 토지가
 * 아니다. 여기서 나온 `nonBusinessRatio`를 호출부가 양도분에 적용한다(§1.4 약분 구조).
 *
 * @param usage  공장 입력 — 면적은 전부 공장 전체값
 * @param context 오류 메시지 접두사
 * @throws `urban_other` 경로에서 용도지역 미입력·§101② 표 미등재인 경우
 *   (`judgeAppurtenantLandExcess`가 던진다 — 추정 배율로 대체하면 초과분이 조용히 틀어진다).
 */
export function judgeFactoryLandExcess(
  usage: FactoryLandUsage,
  context: string,
): FactoryLandExcessResult {
  const landArea = usage.totalAppurtenantLandArea;
  if (!(landArea > 0)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `${context} 비사업용토지 판정: 공장 전체(하나의 울타리 기준) 부속토지 면적을 입력하세요. ` +
        `한도 비교는 양도 대상 토지가 아니라 공장 전체로 합니다.`,
    );
  }
  // ⚠️ 두 값 중 하나여야 한다. 삼항으로 "아니면 aggregate"로 흘리면 빈 문자열이 조용히
  // §101①1호 경로로 가서 **다른 산식**이 적용된다(한도 자체가 바뀐다).
  if (
    usage.locationCategory !== "eup_myeon_or_complex" &&
    usage.locationCategory !== "urban_other"
  ) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `${context} 비사업용토지 판정: 공장 소재 지역을 선택하세요 — ` +
        `읍·면지역(군 지역 포함)·산업단지·공업지역 / 그 밖의 지역. 한도 산식이 달라집니다.`,
    );
  }
  const route =
    usage.locationCategory === "eup_myeon_or_complex" ? "separate_taxation" : "aggregate_taxation";

  if (usage.isUnregistered) {
    return {
      route,
      standardArea: 0,
      isWithinLimit: false,
      nonBusinessArea: landArea,
      nonBusinessRatio: landArea > 0 ? 1 : 0,
      isUnregisteredException: true,
      detail: UNREGISTERED_DETAIL,
    };
  }

  // §101①1호 — 바닥면적 × §101② 용도지역별 적용배율 (공용 헬퍼 재사용)
  if (route === "aggregate_taxation") {
    // ⚠️ 별표6 경로와 같은 이유로 미입력은 던진다 — 0으로 통과시키면 기준면적이 0이 되어
    // 전량 비사업용이 되고(불리) 사유도 단서로 잘못 표시된다.
    if (!(usage.totalFootprintArea && usage.totalFootprintArea > 0)) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `${context} 비사업용토지 판정: 공장용 건축물 바닥면적을 입력하세요 ` +
          `(「지방세법 시행령」 제101조 제1항 제1호 — 바닥면적 × 같은 조 제2항 적용배율).`,
      );
    }
    const r = judgeAppurtenantLandExcess({
      landArea,
      buildingFootprintArea: usage.totalFootprintArea ?? 0,
      zoneType: usage.zoneType,
      context,
    });
    return {
      route,
      standardArea: r.allowedLandArea,
      isWithinLimit: r.isWithinLimit,
      nonBusinessArea: r.nonBusinessArea,
      nonBusinessRatio: r.nonBusinessRatio,
      isUnregisteredException: false,
      detail:
        `공장 바닥면적 ${usage.totalFootprintArea ?? 0}㎡ × ${r.multiplierDetail} ` +
        `= 기준면적 ${r.allowedLandArea.toFixed(2)}㎡ (「지방세법 시행령」 제101조 제1항 제1호)`,
    };
  }

  // §102①1호 — 별표6 공장입지기준면적
  //
  // ⚠️ 입력이 비면 **던진다**. 빈 배열을 그대로 통과시키면 기준면적이 0이 되어 부속토지
  // 전량이 비사업용으로 떨어지고(불리), 사유도 단서(허가 미이행)로 잘못 표시된다.
  // 자동 안분 fallback 금지 · 법 근거 없이 불리 적용 금지.
  const segments = usage.segments ?? [];
  const invalid = segments.length === 0 || segments.some((s) => !(s.floorArea > 0) || !(s.ratePercent > 0));
  if (invalid) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `${context} 비사업용토지 판정: 공장건축물 연면적과 업종별 기준공장면적률을 입력하세요 ` +
        `(「지방세법 시행규칙」 별표 6 — 연면적 × 100 ÷ 기준공장면적률).`,
    );
  }

  const std = computeFactoryStandardArea(segments, landArea, {
    isRestrictedZone: usage.isRestrictedZone,
    additionalRecognizedArea: usage.additionalRecognizedArea,
    employeeSportsFacilityArea: usage.employeeSportsFacilityArea,
  });
  const nonBusinessArea = Math.max(0, landArea - std.standardArea);
  const rateLabel = std.segments.map((s) => `${s.ratePercent}%`).join("·");

  return {
    route,
    standardArea: std.standardArea,
    isWithinLimit: landArea <= std.standardArea,
    nonBusinessArea,
    nonBusinessRatio: landArea > 0 ? nonBusinessArea / landArea : 0,
    isUnregisteredException: false,
    detail:
      `공장건축물 연면적 ${std.segments.reduce((a, s) => a + s.floorArea, 0)}㎡ ÷ ` +
      `기준공장면적률 ${rateLabel} × 100 = ${std.baseArea.toFixed(2)}㎡` +
      (std.additionalAllowanceApplied > 0
        ? ` + 추가인정 ${std.additionalAllowanceApplied.toFixed(2)}㎡`
        : "") +
      (std.additionalRecognizedArea > 0 ? ` + 별도인정 ${std.additionalRecognizedArea}㎡` : "") +
      (std.employeeSportsFacilityArea > 0
        ? ` + 종업원 체육시설 ${std.employeeSportsFacilityApplied.toFixed(2)}㎡` +
          (std.employeeSportsFacilityApplied < std.employeeSportsFacilityArea
            ? ` (입력 ${std.employeeSportsFacilityArea}㎡ → 별표6 3호바 10% 한도 ${std.employeeSportsFacilityCap.toFixed(2)}㎡로 제한)`
            : "")
        : "") +
      ` = 공장입지기준면적 ${std.standardArea.toFixed(2)}㎡ ` +
      `(「지방세법 시행규칙」 별표6·제50조)`,
    standardAreaDetail: std,
  };
}
