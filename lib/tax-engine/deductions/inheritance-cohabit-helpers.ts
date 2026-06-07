/**
 * §23의2 동거주택상속공제 헬퍼 — Phase 2~4 (2026-06-07)
 *
 * 800줄 정책에 따라 inheritance-deductions.ts에서 분리.
 * inheritance-deductions.ts가 re-export → 외부 import 경로 무변경.
 *
 * 법령: 상증법 §23의2 + 소득세 시행령 §154⑦
 *   G5: 대상 상속인 범위 (2022.1.1. 개정 — 대습배우자 포함)
 *   G3: 동거연수 계산 (미성년 제외 2016.1.1.~ 시행)
 *   G3-R: 부득이사유 자동산입 (Phase 4 — §23의2② + 상증령 §20의2 + 시행규칙 §9의2)
 *   G4: 주택부수토지 면적한도 차감 (소득세 시행령 §154⑦ 배율)
 */

import { differenceInCalendarDays, differenceInYears } from "date-fns";
import type {
  AncillaryLandRegion,
  CohabitReason,
  CohabitReasonType,
  Heir,
  InheritanceDeductionInput,
} from "../types/inheritance-gift.types";
import type {
  CohabitReasonBreakdown,
  CohabitYearsResult,
} from "../types/inheritance-deduction-detail.types";

// ============================================================
// G5: §23의2①1호 대상 상속인 적격성 판정
// ============================================================

// ============================================================
// G6-RIGHT: §23의2 자산 유형(조합원입주권·분양권) 적용 가능 여부 판정
// ============================================================

/**
 * §23의2 동거주택공제 — 자산 유형(cohabitHouseRightType)별 적용 가능 여부.
 *
 * 법령 근거:
 *   - house / single_redev_right / undefined → 적용
 *       · single_redev_right: 기재부 재산세제과-230(2012.3.22)·재산세제과-237(2012.6.25, NTS113036)
 *         — 1세대1주택 멸실로 취득한 (단일) 입주권 + 다른 주택 無 시 1세대1주택 요건 충족·적용
 *         (조심 2017서2253·2021중6665 결정문 전문 축자 인용으로 원문 확보)
 *       · undefined: 레거시(house 간주) — 회귀 0 (validation CV-1 경고로 명시 선택 유도)
 *   - one_plus_one_right → 미적용 (조심 2021중6665·서면-2020-상속증여-5940: 2입주권=1세대1주택 미충족)
 *   - sale_right → 미적용 (§23의2① "주택" 문언상 분양권은 대상 자산 아님)
 *
 * @param rightType InheritanceDeductionInput.cohabitHouseRightType
 * @returns { applicable; reason }
 */
export function isCohabitDeductionApplicableHouse(
  rightType: InheritanceDeductionInput["cohabitHouseRightType"],
): { applicable: boolean; reason: string } {
  switch (rightType) {
    case "one_plus_one_right":
      return {
        applicable: false,
        reason:
          "1주택이 2개 조합원입주권으로 전환 — §23의2① 1세대1주택 요건 미충족 (조심 2021중6665)",
      };
    case "sale_right":
      return {
        applicable: false,
        reason: "분양권은 §23의2① '주택'에 해당하지 않음 — 동거주택 상속공제 대상 아님",
      };
    case "single_redev_right":
    case "house":
    case undefined:
    default:
      return { applicable: true, reason: "" };
  }
}

/**
 * §23의2①1호 동거주택공제 대상 상속인 적격성 판정.
 *
 * 법령 근거 (KoreanLaw time_travel 20210101↔20220101 검증, 자수 755→787):
 *   ~2021.12.31.:  직계비속(child + 손자녀 legatee+isGenerationSkipBeneficiary=true)만 적격
 *   2022.1.1.~:   직계비속 + 민법§1003② 대습상속된 직계비속의 배우자도 적격
 *
 * 계약 C1: HeirRelation에 lineal_descendant 추가 금지.
 *   손자녀 = legatee + isGenerationSkipBeneficiary=true + isSubstituteInheritance≠true
 * 계약 C2: 대습상속 배우자 = relation="other" + isSubstituteInheritance=true (2022.1.1.~)
 *
 * @param heir 상속인 정보
 * @param deathDate 상속개시일 (YYYY-MM-DD). undefined 시 "9999-12-31" 가정 (2022 이후로 처리)
 * @returns 적격 여부
 */
export function isCohabitDeductionEligibleRelation(
  heir: Heir,
  deathDate: string | undefined,
): boolean {
  const d = deathDate ?? "9999-12-31";

  // 직계비속: child(자녀) + legatee 세대생략 손자녀 (대습 플래그 없는 순수 세대생략)
  // 전 기간 허용 (2009.1.1.~ §23의2 제도 도입 이후)
  const isLinealDescendant =
    heir.relation === "child" ||
    (heir.relation === "legatee" &&
      heir.isGenerationSkipBeneficiary === true &&
      heir.isSubstituteInheritance !== true);

  // 대습상속된 직계비속의 배우자: 2022.1.1.~ §23의2①1호 개정 (KoreanLaw time_travel 검증)
  // relation="other" + isSubstituteInheritance=true (계약 C2)
  // ※ "legatee" 수유자에 isSubstituteInheritance=true인 경우는 isLinealDescendant 조건에서 제외됨
  const isSubstituteDescendantSpouse =
    d >= "2022-01-01" &&
    heir.relation === "other" &&
    heir.isSubstituteInheritance === true;

  return isLinealDescendant || isSubstituteDescendantSpouse;
}

// ============================================================
// G3+G3-R: §23의2①1호 동거연수 계산 (Phase 2~4 통합)
// ============================================================

// ─── G3-R 상수: 사유 유형 → 법적 효과 매핑 ─────────────────
/**
 * §23의2② + 상증령 §20의2② + 시행규칙 §9의2 법적 효과 매핑.
 *
 * excluded:       §23의2② 본문 — 계속 동거 인정, 동거기간 차감
 * included:       해석례상 차감 배제(재건축 전세) — rawYears에 그대로 포함
 * not_recognized: 법정 사유 미해당(국외 대학원) — 차감 없음 + 계속성 경고
 */
const REASON_EFFECT_MAP: Record<
  CohabitReasonType,
  "excluded" | "included" | "not_recognized"
> = {
  conscription: "excluded",         // §20의2②1호
  schooling: "excluded",            // 시행규칙 §9의2①1호
  work: "excluded",                 // 시행규칙 §9의2①2호
  medical: "excluded",              // 시행규칙 §9의2①3호 (1년 이상 요건 별도 검증)
  reconstruction_lease: "included", // 해석례 미확인(교재 재산-248)
  overseas_grad: "not_recognized",  // 시행규칙 §9의2①1호 적용 불가(국내 학교 한정)
};

// ─── 내부 헬퍼: effectiveStart 계산 ─────────────────────────
/**
 * 동거기간 산정 유효 시작일 계산.
 * 2016.1.1.~ 미성년 제외 규정 적용.
 *
 * @returns { effectiveStart: Date, minorYearsDeducted: number, effectiveStartStr: string }
 */
function calcEffectiveStart(
  cohabitStartDate: string,
  deathDate: string,
  birthDate: string | undefined,
): { effectiveStart: Date; minorYearsDeducted: number; effectiveStartStr: string } {
  const startD = new Date(cohabitStartDate);
  let effectiveStart = startD;
  let minorYearsDeducted = 0;

  if (deathDate >= "2016-01-01" && birthDate) {
    // 만 19세 도달일 = birthDate + 19년 (date-fns 생일 기념일 기반)
    const birthD = new Date(birthDate);
    const adultD = new Date(birthD);
    adultD.setFullYear(adultD.getFullYear() + 19);

    if (adultD > startD) {
      effectiveStart = adultD;
    }

    if (effectiveStart > startD) {
      minorYearsDeducted = differenceInYears(effectiveStart, startD);
    }
  }

  // effectiveStartStr: YYYY-MM-DD 형식으로 변환
  const effectiveStartStr = effectiveStart.toISOString().slice(0, 10);

  return { effectiveStart, minorYearsDeducted, effectiveStartStr };
}

// ─── 내부 헬퍼: EXCLUDED 구간 union merge 후 총일수 합산 ──────
/**
 * EXCLUDED 효과를 가진 breakdown 항목들의 clampedStartDate~clampedEndDate 구간을
 * union merge 하여 이중 차감 없이 총일수를 반환한다.
 *
 * 정렬 후 인접/겹침 구간을 확장하는 표준 interval merge 알고리즘 사용.
 * 합산 후 1회 floor(totalDays/365.25) — 각각 변환 후 합산 금지 (floor 오차 누적).
 */
function mergeAndSumExcludedDays(breakdown: CohabitReasonBreakdown[]): number {
  const excluded = breakdown
    .filter((b) => b.effect === "excluded" && b.clampedDays > 0)
    .map((b) => ({ start: b.clampedStartDate, end: b.clampedEndDate }))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (excluded.length === 0) return 0;

  // 인접/겹침 구간 union merge
  const merged: { start: string; end: string }[] = [excluded[0]];
  for (let i = 1; i < excluded.length; i++) {
    const cur = excluded[i];
    const prev = merged[merged.length - 1];
    if (cur.start <= prev.end) {
      // 겹침 또는 인접 → end를 더 큰 값으로 확장
      if (cur.end > prev.end) prev.end = cur.end;
    } else {
      merged.push(cur);
    }
  }

  return merged.reduce(
    (sum, iv) =>
      sum + differenceInCalendarDays(new Date(iv.end), new Date(iv.start)),
    0,
  );
}

/**
 * §23의2①1호 동거연수 계산 v2 — 부득이사유 자동산입.
 *
 * 법령 근거:
 *   - §23의2①1호: "상속개시일부터 소급하여 10년 이상(상속인이 미성년자인 기간은 제외한다)"
 *   - 미성년 제외 규정: 2016.1.1.~ 시행 (교재 §1-2 명시)
 *   - 민법 §4: 만 19세 이상이 성인
 *   - §23의2②: 부득이한 사유(상증령 §20의2) 기간은 계속 동거로 인정하되 동거기간 산입 안 함
 *   - 상증령 §20의2②: 호별 사유 (KoreanLaw MST 283637 실측)
 *   - 시행규칙 §9의2: 취학·근무·질병 구체화 (KoreanLaw MST 284609 실측)
 *
 * 정밀 연산:
 *   - effectiveStart = max(cohabitStartDate, adultDate) — 미성년 이중차감 자동 방지
 *   - rawYears = differenceInYears(deathDate, effectiveStart)
 *   - EXCLUDED 구간: union merge 후 합산 → floor(totalDays/365.25)
 *   - effectiveYears = max(0, rawYears − reasonExcludedYears)
 *
 * @param cohabitStartDate 동거 시작일 (YYYY-MM-DD)
 * @param deathDate        상속개시일 (YYYY-MM-DD)
 * @param birthDate        상속인 생년월일 (optional — 미성년 제외, 2016.1.1.~)
 * @param reasons          부득이한 사유 배열. undefined=사유 없음→legacy fallback. []=사유 없음.
 * @param excludedYearsLegacy Phase 2 수동값. reasons===undefined 일 때만 사용.
 */
export function calcCohabitYears(
  cohabitStartDate: string,
  deathDate: string,
  birthDate: string | undefined,
  reasons: CohabitReason[] | undefined,
  excludedYearsLegacy: number,
): CohabitYearsResult {
  // 1. 미성년 제외 → effectiveStart 계산 (Phase 2 로직 동일)
  const { effectiveStart, minorYearsDeducted, effectiveStartStr } =
    calcEffectiveStart(cohabitStartDate, deathDate, birthDate);

  const deathD = new Date(deathDate);

  // 2. rawYears (effectiveStart 기준 — 미성년 이미 제외)
  const rawYears =
    effectiveStart <= deathD
      ? differenceInYears(deathD, effectiveStart)
      : 0;

  // 3. reasons===undefined → legacy fallback
  if (reasons === undefined) {
    const effectiveYears = Math.max(0, rawYears - excludedYearsLegacy);
    return {
      rawYears,
      minorYearsDeducted,
      effectiveYears,
      meetsRequirement: effectiveYears >= 10,
      reasonBreakdown: [],
      reasonExcludedYears: excludedYearsLegacy,
      hasOverseasGradWarning: false,
      hasReconstructionLeaseNote: false,
      hasMedicalUnder1YWarning: false,
      usedLegacyFallback: excludedYearsLegacy > 0,
    };
  }

  // 4. 사유 배열 처리 — 각 사유를 분류하고 clamp 적용
  const breakdown: CohabitReasonBreakdown[] = [];
  let hasOverseasGradWarning = false;
  let hasReconstructionLeaseNote = false;
  let hasMedicalUnder1YWarning = false;

  for (const reason of reasons) {
    const effect = REASON_EFFECT_MAP[reason.type];

    // clamp: effectiveStart~deathDate 구간 내 제한 (미성년 이중차감 자동 방지)
    const clampedStartStr =
      reason.startDate > effectiveStartStr ? reason.startDate : effectiveStartStr;
    const clampedEndStr =
      reason.endDate < deathDate ? reason.endDate : deathDate;

    // clamp 후 유효 일수
    const rawClampedDays =
      clampedStartStr < clampedEndStr
        ? differenceInCalendarDays(
            new Date(clampedEndStr),
            new Date(clampedStartStr),
          )
        : 0;

    if (effect === "excluded") {
      // §9의2①3호: medical 1년 미만 → 차감 없음 + MEDICAL_UNDER_1Y 경고
      if (reason.type === "medical") {
        const totalDays = differenceInCalendarDays(
          new Date(reason.endDate),
          new Date(reason.startDate),
        );
        if (totalDays < 365) {
          hasMedicalUnder1YWarning = true;
          breakdown.push({
            type: reason.type,
            inputStartDate: reason.startDate,
            inputEndDate: reason.endDate,
            clampedStartDate: clampedStartStr,
            clampedEndDate: clampedEndStr,
            clampedDays: 0, // 1년 미만 → 차감 없음
            effect: "excluded",
            warningCode: "MEDICAL_UNDER_1Y",
          });
          continue;
        }
      }

      breakdown.push({
        type: reason.type,
        inputStartDate: reason.startDate,
        inputEndDate: reason.endDate,
        clampedStartDate: clampedStartStr,
        clampedEndDate: clampedEndStr,
        clampedDays: rawClampedDays,
        effect: "excluded",
      });
    } else if (effect === "included") {
      // reconstruction_lease: 차감 없음 + RECONSTRUCTION_UNVERIFIED 경고
      hasReconstructionLeaseNote = true;
      breakdown.push({
        type: reason.type,
        inputStartDate: reason.startDate,
        inputEndDate: reason.endDate,
        clampedStartDate: clampedStartStr,
        clampedEndDate: clampedEndStr,
        clampedDays: 0, // INCLUDED → 차감 없음
        effect: "included",
        warningCode: "RECONSTRUCTION_UNVERIFIED",
      });
    } else {
      // not_recognized: overseas_grad — 차감 없음 + OVERSEAS_GRAD_CONTINUITY 경고
      hasOverseasGradWarning = true;
      breakdown.push({
        type: reason.type,
        inputStartDate: reason.startDate,
        inputEndDate: reason.endDate,
        clampedStartDate: clampedStartStr,
        clampedEndDate: clampedEndStr,
        clampedDays: 0, // NOT_RECOGNIZED → 차감 없음
        effect: "not_recognized",
        warningCode: "OVERSEAS_GRAD_CONTINUITY",
      });
    }
  }

  // 5. EXCLUDED 구간 union merge → 이중차감 방지
  const totalExcludedDays = mergeAndSumExcludedDays(breakdown);

  // 6. 연 단위 변환 (합산 후 1회 — 각각 변환 후 합산 금지: floor 오차 누적)
  const reasonExcludedYears = Math.floor(totalExcludedDays / 365.25);

  // 7. effectiveYears (rawYears에 미성년 이미 제외됨 — 이중차감 없음)
  const effectiveYears = Math.max(0, rawYears - reasonExcludedYears);

  return {
    rawYears,
    minorYearsDeducted,
    effectiveYears,
    meetsRequirement: effectiveYears >= 10,
    reasonBreakdown: breakdown,
    reasonExcludedYears,
    hasOverseasGradWarning,
    hasReconstructionLeaseNote,
    hasMedicalUnder1YWarning,
    usedLegacyFallback: false,
  };
}

// ============================================================
// G4: §23의2① 주택부수토지 면적한도 차감
// ============================================================

/** 지역별 배율 (소득세 시행령 §154⑦) */
const ANCILLARY_LAND_RATIO: Record<AncillaryLandRegion, number> = {
  metro_residential_commercial_industrial: 3, // §154⑦1호가
  metro_green: 5,                             // §154⑦1호나
  non_metro: 5,                               // §154⑦1호다
  other: 10,                                  // §154⑦2호
};

/**
 * §23의2① 주택부수토지 면적한도 초과분 차감 계산.
 *
 * 법령 근거:
 *   §23의2①: "소득세법 §89①3호에 따른 주택부수토지의 가액을 포함"
 *   소득세 시행령 §154⑦: 건물 정착 면적 × 지역별 배율 이내의 토지만 주택부수토지로 인정
 *
 * 전제 (inheritance-cohabit-ancillary-land.plan.md):
 *   아파트·공동주택가격은 부수토지 포함 → ancillaryLandArea 미입력으로 차감 없음.
 *   단독주택 대형토지를 별도 EstateItem으로 분리 입력한 경우에만 해당.
 *
 * 정밀 연산:
 *   adjustedHousePrice = floor(cohabitHouseStdPrice × limitArea / ancillaryLandArea) — 곱셈 먼저
 *
 * 미입력 안전 처리:
 *   ancillaryLandArea·buildingFootprintArea·ancillaryLandRegion 중 하나라도 미입력 시
 *   차감 없음 반환 (자동 안분 fallback 금지 정책).
 *
 * @param buildingFootprintArea 건물 정착 면적 (㎡)
 * @param ancillaryLandArea 부수토지 실제 면적 (㎡)
 * @param region 지역 구분
 * @param cohabitHouseStdPrice 동거주택 공시가격 (원)
 */
export function applyAncillaryLandLimit(
  buildingFootprintArea: number | undefined,
  ancillaryLandArea: number | undefined,
  region: AncillaryLandRegion | undefined,
  cohabitHouseStdPrice: number,
): {
  adjustedHousePrice: number;
  limitArea: number;
  excessArea: number;
  excessRatio: number;
  limitReductionAmount: number;
} {
  // 3필드 중 하나라도 미입력 시 차감 없음 (전부 또는 전무)
  if (
    ancillaryLandArea === undefined ||
    buildingFootprintArea === undefined ||
    region === undefined
  ) {
    return {
      adjustedHousePrice: cohabitHouseStdPrice,
      limitArea: 0,
      excessArea: 0,
      excessRatio: 0,
      limitReductionAmount: 0,
    };
  }

  const ratio = ANCILLARY_LAND_RATIO[region];
  const limitArea = buildingFootprintArea * ratio;
  const excessArea = Math.max(0, ancillaryLandArea - limitArea);

  if (excessArea === 0 || ancillaryLandArea === 0) {
    return {
      adjustedHousePrice: cohabitHouseStdPrice,
      limitArea,
      excessArea: 0,
      excessRatio: 0,
      limitReductionAmount: 0,
    };
  }

  // 정밀 연산: 곱셈 먼저, floor (Math.round 금지)
  // adjustedHousePrice = floor(cohabitHouseStdPrice × limitArea / ancillaryLandArea)
  const adjustedHousePrice = Math.floor(
    (cohabitHouseStdPrice * limitArea) / ancillaryLandArea,
  );
  const limitReductionAmount = cohabitHouseStdPrice - adjustedHousePrice;
  const excessRatio = excessArea / ancillaryLandArea;

  return {
    adjustedHousePrice: Math.max(0, adjustedHousePrice),
    limitArea,
    excessArea,
    excessRatio,
    limitReductionAmount,
  };
}
