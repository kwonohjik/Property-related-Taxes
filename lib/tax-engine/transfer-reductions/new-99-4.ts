/**
 * 조특법 §99의4 — 농어촌주택·고향주택 취득자 양도소득세 과세특례 (주택수 제외)
 *
 * 효과: 농어촌주택등을 1세대 소유주택이 아닌 것으로 보아 소법 §89①3호 적용.
 *       세액감면 아님 — 비과세·12억 고가주택 안분·LTHD 표2(소령 §159의4 포괄 문구)
 *       세 지점에 유효 주택수(count−1)로 반영. 다주택 중과(소령 §167의3)는 별개 체계
 *       — 미반영 (R-D, 결과 경고).
 *
 * 요건 (law.go.kr 2026-06-11 원문 전문 검증 — plan §1):
 * - ①: 취득기간(rural 2003.8.1~ / hometown 2009.1.1~, ~2028.12.31) 중 농어촌주택등
 *   1채 취득(자기건설 포함) + 3년 이상 보유 + 취득 전부터 보유하던 일반주택 양도
 * - ①1호나목·2호다목: 취득 당시 주택+부속토지 기준시가 합계 3억(등록 한옥 4억) 이하
 * - ③: 일반주택과 같은/연접 읍·면·동(고향은 시) → 미적용
 * - ④: 3년 보유 충족 전 양도해도 적용 (선적용) → ⑥ 3년 미보유 확정 시 추징 (경고 echo)
 * - 소재지(①1호가목/2호나목)·고향(①2호가목·령⑥)은 사용자 확인 토글 (별표12 자동판정 범위 외)
 *
 * D-1: 시한 판정은 period-check(자산 취득일 기반 — 농어촌 취득일 미보유)가 아닌
 *      본 evaluator에서 ruralHouseAcquisitionDate 기준으로 수행.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { calculateHoldingPeriod } from "../tax-utils";
import type {
  New994ArticleId,
  New994EvaluationInput,
  New994IneligibleReason,
  New994Result,
} from "./types";

/** 취득기간 시기 — rural ①1호 / hometown ①2호 */
export const NEW_99_4_RURAL_FROM = new Date("2003-08-01");
export const NEW_99_4_HOMETOWN_FROM = new Date("2009-01-01");
/** 취득기간 종기 (농어촌주택등취득기간 — 양도일과 무관) */
export const NEW_99_4_PERIOD_TO = new Date("2028-12-31");
/** ①1호나목·2호다목 — 취득 당시 기준시가 합계 한도 */
export const NEW_99_4_STD_PRICE_LIMIT = 300_000_000;
/** 령⑭ 등록 한옥 한도 */
export const NEW_99_4_STD_PRICE_LIMIT_HANOK = 400_000_000;
/** ① 의무 보유기간 (3년 — ④ 선적용 허용, ⑥ 추징) */
export const NEW_99_4_MANDATORY_YEARS = 3;

/** TransferReduction의 §99의4 멤버 구조 (구조적 타이핑 — 순환 import 회피, rental-97-router 패턴) */
interface New994ReductionLike {
  type: New994ArticleId;
  ruralHouseAcquisitionDate?: Date;
  ruralHouseStdPrice?: number;
  isRegisteredHanok?: boolean;
  isAdjacentArea?: boolean;
  meetsLocationRequirement?: boolean;
  meetsHometownRequirement?: boolean;
}

/**
 * reductions[]에서 §99의4 항목을 찾아 평가 — transfer-tax.ts STEP 0.9 진입점.
 * 미포함 시 undefined (특례 미신청).
 */
export function evaluateNew994FromReductions(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date },
): New994Result | undefined {
  const r = reductions.find(
    (x): x is New994ReductionLike => x.type === "new_99_4_rural" || x.type === "new_99_4_hometown",
  );
  if (!r) return undefined;
  return evaluateNew994({
    id: r.type,
    generalHouseAcquisitionDate: ctx.generalHouseAcquisitionDate,
    transferDate: ctx.transferDate,
    ruralHouseAcquisitionDate: r.ruralHouseAcquisitionDate,
    ruralHouseStdPrice: r.ruralHouseStdPrice,
    isRegisteredHanok: r.isRegisteredHanok,
    isAdjacentArea: r.isAdjacentArea,
    meetsLocationRequirement: r.meetsLocationRequirement,
    meetsHometownRequirement: r.type === "new_99_4_hometown" ? r.meetsHometownRequirement : undefined,
  });
}

export function evaluateNew994(input: New994EvaluationInput): New994Result {
  const isHometown = input.id === "new_99_4_hometown";
  const legalBasis = isHometown
    ? TRANSFER_REDUCTION_ARTICLE.NEW_99_4_HOMETOWN
    : TRANSFER_REDUCTION_ARTICLE.NEW_99_4_RURAL;
  const houseLabel = isHometown ? "고향주택" : "농어촌주택";
  const reasons: New994IneligibleReason[] = [];

  // 1) 필수 입력 — 자동 fallback 금지
  if (!input.ruralHouseAcquisitionDate) {
    reasons.push({
      code: "MISSING_RURAL_ACQ_DATE",
      message: `${houseLabel} 취득일이 입력되지 않았습니다 (취득기간·보유기간·취득순서 판정에 필요).`,
      legalBasis,
    });
  }
  if (input.ruralHouseStdPrice === undefined || input.ruralHouseStdPrice <= 0) {
    reasons.push({
      code: "MISSING_STD_PRICE",
      message: `${houseLabel} 취득 당시 기준시가 합계가 입력되지 않았습니다 (3억 한도 검증 — §99의4①).`,
      legalBasis,
    });
  }

  if (input.ruralHouseAcquisitionDate) {
    // 2) 시한 — 농어촌주택등 취득일 기준 (D-1: period-check 아닌 여기서 정확 판정)
    const from = isHometown ? NEW_99_4_HOMETOWN_FROM : NEW_99_4_RURAL_FROM;
    const acq = input.ruralHouseAcquisitionDate.getTime();
    if (acq < from.getTime() || acq > NEW_99_4_PERIOD_TO.getTime()) {
      reasons.push({
        code: "OUT_OF_PERIOD",
        message: `${houseLabel} 취득일이 취득기간(${isHometown ? "2009.1.1" : "2003.8.1"}~2028.12.31) 외입니다 (§99의4①).`,
        legalBasis,
      });
    }

    // 3) 취득순서 — ① "취득 전에 보유하던 다른 주택" (일반주택이 먼저)
    if (acq <= input.generalHouseAcquisitionDate.getTime()) {
      reasons.push({
        code: "ACQUISITION_ORDER",
        message: `일반주택(양도 주택)을 ${houseLabel}보다 먼저 취득한 경우에만 적용됩니다 (§99의4① — 취득 전 보유 요건).`,
        legalBasis,
      });
    }
  }

  // 4) 가액 — 3억(등록 한옥 4억) "초과하지 아니할 것" → 경계 포함 적용
  if (input.ruralHouseStdPrice !== undefined && input.ruralHouseStdPrice > 0) {
    const limit = input.isRegisteredHanok ? NEW_99_4_STD_PRICE_LIMIT_HANOK : NEW_99_4_STD_PRICE_LIMIT;
    if (input.ruralHouseStdPrice > limit) {
      reasons.push({
        code: "STD_PRICE_EXCEEDED",
        message: `취득 당시 기준시가 합계가 한도(${input.isRegisteredHanok ? "4억 — 등록 한옥" : "3억"})를 초과합니다 (§99의4①1호나목${isHometown ? "·2호다목" : ""}).`,
        legalBasis,
      });
    }
  }

  // 5) 소재지·연접·고향 토글 (사용자 확인 — 미확인 시 불적용 사유, 차단 아님)
  if (input.meetsLocationRequirement !== true) {
    reasons.push({
      code: "LOCATION_UNCONFIRMED",
      message: isHometown
        ? "소재지 요건(별표12 시 지역 + 수도권·조정대상지역·관광단지 아님)이 확인되지 않았습니다 (§99의4①2호나목)."
        : "소재지 요건(읍·면 또는 별표12 동 + 배제지역 아님, 기회발전특구 포함)이 확인되지 않았습니다 (§99의4①1호가목).",
      legalBasis,
    });
  }
  if (input.isAdjacentArea === true) {
    reasons.push({
      code: "ADJACENT_AREA",
      message: isHometown
        ? "고향주택과 일반주택이 같은 시 또는 연접한 시에 있으면 적용되지 않습니다 (§99의4③)."
        : "농어촌주택과 일반주택이 같은 읍·면·동 또는 연접한 읍·면·동에 있으면 적용되지 않습니다 (§99의4③).",
      legalBasis: "조특법 §99의4③",
    });
  }
  if (isHometown && input.meetsHometownRequirement !== true) {
    reasons.push({
      code: "HOMETOWN_UNCONFIRMED",
      message: "고향 요건(가족관계등록부 등록기준지 10년 이상 또는 10년 이상 거주한 시)이 확인되지 않았습니다 (§99의4①2호가목·령⑥).",
      legalBasis: "조특령 §99의4⑥",
    });
  }

  if (reasons.length > 0) {
    return {
      id: input.id as New994ArticleId,
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "house_count_exclusion",
    };
  }

  // 6) 보유 3년 — 미만이어도 적용(④ 선적용), ⑥ 추징 경고 echo
  const holding = calculateHoldingPeriod(input.ruralHouseAcquisitionDate!, input.transferDate);
  const ruralHoldingYears = holding.years;
  const clawbackWarning = ruralHoldingYears < NEW_99_4_MANDATORY_YEARS;

  return {
    id: input.id as New994ArticleId,
    isEligible: true,
    legalBasis,
    effectCategory: "house_count_exclusion",
    houseCountExclusion: 1,
    ruralHoldingYears,
    clawbackWarning,
    surchargeNotAffected: true,
  };
}
