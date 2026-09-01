/**
 * 조특법 §98의9 — 수도권 밖 준공후미분양주택 취득자 양도소득세 과세특례 (주택수 제외)
 *
 * 효과: 준공후미분양주택을 1세대 소유주택이 아닌 것으로 보아 소법 §89①3호 적용.
 *       §99의4와 동일 계열 — 비과세·12억 안분·LTHD 표2(소령 §159의4) 유효 주택수 반영.
 *       다주택 중과(소령 §167의3)는 미반영 (R-D). 종부세 ②(1세대1주택자 의제)는 범위 외 — 안내.
 *
 * 요건 (law.go.kr 2026-06-11 원문 — 법 §98의9 ①~④ + 령 §98의8 ①~④.
 *       ⚠️ 법 §98의9의 위임 시행령은 조번호가 어긋난 령 §98의8):
 * - ①: 1주택 보유 1세대가 2024.1.10~2026.12.31 중 준공후미분양주택 취득 후
 *   취득 전 보유한 주택 양도 (보유 요건·연접 배제·추징 없음)
 * - 령 §98의8①: 전용 85㎡ 이하 / 취득가 7억 이하 / 양도자 = 사업주체·분양사업자·시공자 /
 *   최초 매매계약 체결자 / 사용검사·사용승인까지 미분양 → 선착순 공급분
 * - 령 ②: 시장·군수·구청장 확인 날인 매매계약서 — 사용자 확인 토글에 포함
 *
 * D-1': 시한 판정은 period-check(자산=종전주택 취득일 기반)가 아닌 본 evaluator에서
 *       unsoldHouseAcquisitionDate 기준으로 수행.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { evaluateNew994FromReductions } from "./new-99-4";
import type {
  New994Result,
  Unsold989EvaluationInput,
  Unsold989IneligibleReason,
  Unsold989Result,
} from "./types";

/** 취득기간 (법 §98의9① — 2024.1.10~2026.12.31) */
export const UNSOLD_98_9_FROM = new Date("2024-01-10");
export const UNSOLD_98_9_TO = new Date("2026-12-31");
/** 령 §98의8①2호 — 취득가액 한도 (7억. 통설 "6억"과 다름 — 원문 확정) */
export const UNSOLD_98_9_PRICE_LIMIT = 700_000_000;
/** 령 §98의8①1호 — 전용면적 한도 (㎡) */
export const UNSOLD_98_9_AREA_LIMIT_SQM = 85;

export function evaluateUnsold989(input: Unsold989EvaluationInput): Unsold989Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_9;
  const reasons: Unsold989IneligibleReason[] = [];

  // 1) 필수 입력 — 자동 fallback 금지
  if (!input.unsoldHouseAcquisitionDate) {
    reasons.push({
      code: "MISSING_UNSOLD_ACQ_DATE",
      message: "준공후미분양주택 취득일이 입력되지 않았습니다 (취득기간·취득순서 판정에 필요).",
      legalBasis,
    });
  }
  if (input.unsoldHouseAcquisitionPrice === undefined || input.unsoldHouseAcquisitionPrice <= 0) {
    reasons.push({
      code: "MISSING_PRICE",
      message: "준공후미분양주택 취득가액이 입력되지 않았습니다 (7억 한도 검증 — 조특령 §98의8①2호).",
      legalBasis: "조특령 §98의8①2호",
    });
  }
  if (input.unsoldHouseExclusiveArea === undefined || input.unsoldHouseExclusiveArea <= 0) {
    reasons.push({
      code: "MISSING_AREA",
      message: "준공후미분양주택 전용면적이 입력되지 않았습니다 (85㎡ 한도 검증 — 조특령 §98의8①1호).",
      legalBasis: "조특령 §98의8①1호",
    });
  }

  if (input.unsoldHouseAcquisitionDate) {
    const acq = input.unsoldHouseAcquisitionDate.getTime();
    // 2) 시한 — 준공후미분양주택 취득일 기준 (D-1')
    if (acq < UNSOLD_98_9_FROM.getTime() || acq > UNSOLD_98_9_TO.getTime()) {
      reasons.push({
        code: "OUT_OF_PERIOD",
        message: "준공후미분양주택 취득일이 취득기간(2024.1.10~2026.12.31) 외입니다 (§98의9①).",
        legalBasis,
      });
    }
    // 3) 취득순서 — ① "취득하기 전에 보유한 주택" (종전주택이 먼저)
    if (acq <= input.generalHouseAcquisitionDate.getTime()) {
      reasons.push({
        code: "ACQUISITION_ORDER",
        message: "종전주택(양도 주택)을 준공후미분양주택보다 먼저 취득한 경우에만 적용됩니다 (§98의9① — 취득 전 보유 요건).",
        legalBasis,
      });
    }
    // 3') 양도 시점 — ① "취득한 후 … 양도" (검토 발견)
    if (input.transferDate.getTime() <= acq) {
      reasons.push({
        code: "TRANSFER_BEFORE_ACQUISITION",
        message: "준공후미분양주택을 취득한 후에 종전주택을 양도하는 경우에만 적용됩니다 (§98의9①).",
        legalBasis,
      });
    }
  }

  // 4) 가액·면적 — "이하" → 경계 포함 적용
  if (input.unsoldHouseAcquisitionPrice !== undefined && input.unsoldHouseAcquisitionPrice > 0) {
    if (input.unsoldHouseAcquisitionPrice > UNSOLD_98_9_PRICE_LIMIT) {
      reasons.push({
        code: "PRICE_EXCEEDED",
        message: "취득가액이 7억원을 초과합니다 (조특령 §98의8①2호).",
        legalBasis: "조특령 §98의8①2호",
      });
    }
  }
  if (input.unsoldHouseExclusiveArea !== undefined && input.unsoldHouseExclusiveArea > 0) {
    if (input.unsoldHouseExclusiveArea > UNSOLD_98_9_AREA_LIMIT_SQM) {
      reasons.push({
        code: "AREA_EXCEEDED",
        message: "전용면적이 85㎡를 초과합니다 (조특령 §98의8①1호).",
        legalBasis: "조특령 §98의8①1호",
      });
    }
  }

  // 5) 사용자 확인 토글 3종 (미확인 시 불적용 사유 — 차단 아님)
  if (input.isNonCapitalRegion !== true) {
    reasons.push({
      code: "REGION_UNCONFIRMED",
      message: "수도권 밖 소재 요건이 확인되지 않았습니다 (§98의9①1호).",
      legalBasis,
    });
  }
  if (input.wasOneHouseholdAtAcquisition !== true) {
    reasons.push({
      code: "ONE_HOUSE_UNCONFIRMED",
      message: "준공후미분양주택 취득 당시 1세대 1주택 보유 요건이 확인되지 않았습니다 (§98의9① 본문).",
      legalBasis,
    });
  }
  if (input.meetsSellerAndContractRequirement !== true) {
    reasons.push({
      code: "SELLER_UNCONFIRMED",
      message:
        "양도자 자격(사업주체·분양사업자·시공자)·최초 매매계약·선착순 공급·확인 날인 요건이 확인되지 않았습니다 (조특령 §98의8①3~5호·②).",
      legalBasis: "조특령 §98의8①3~5호",
    });
  }

  if (reasons.length > 0) {
    return {
      id: "unsold_98_9",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "house_count_exclusion",
    };
  }

  return {
    id: "unsold_98_9",
    isEligible: true,
    legalBasis,
    effectCategory: "house_count_exclusion",
    houseCountExclusion: 1,
    comprehensiveTaxNote: true,
    surchargeNotAffected: true,
  };
}

/** TransferReduction의 §98의9 멤버 구조 (구조적 타이핑 — 순환 import 회피) */
interface Unsold989ReductionLike {
  type: "unsold_98_9";
  unsoldHouseAcquisitionDate?: Date;
  unsoldHouseAcquisitionPrice?: number;
  unsoldHouseExclusiveArea?: number;
  isNonCapitalRegion?: boolean;
  wasOneHouseholdAtAcquisition?: boolean;
  meetsSellerAndContractRequirement?: boolean;
}

/** reductions[]에서 §98의9 항목을 찾아 평가 — 미포함 시 undefined */
export function evaluateUnsold989FromReductions(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date },
): Unsold989Result | undefined {
  const r = reductions.find((x): x is Unsold989ReductionLike => x.type === "unsold_98_9");
  if (!r) return undefined;
  return evaluateUnsold989({
    id: "unsold_98_9",
    generalHouseAcquisitionDate: ctx.generalHouseAcquisitionDate,
    transferDate: ctx.transferDate,
    unsoldHouseAcquisitionDate: r.unsoldHouseAcquisitionDate,
    unsoldHouseAcquisitionPrice: r.unsoldHouseAcquisitionPrice,
    unsoldHouseExclusiveArea: r.unsoldHouseExclusiveArea,
    isNonCapitalRegion: r.isNonCapitalRegion,
    wasOneHouseholdAtAcquisition: r.wasOneHouseholdAtAcquisition,
    meetsSellerAndContractRequirement: r.meetsSellerAndContractRequirement,
  });
}

/** STEP 0.9 계산 단계 표시 — transfer-tax.ts 본문 압축용 (800줄 정책) */
export function buildHouseCountExclusionStep(
  applied: New994Result | Unsold989Result,
  countBefore: number,
  countAfter: number,
): { label: string; formula: string; amount: number; legalBasis: string } {
  const isUnsold = applied.id === "unsold_98_9";
  return {
    label: isUnsold ? "준공후미분양주택 소유주택 제외 (§98의9)" : "농어촌·고향주택 소유주택 제외 (§99의4)",
    formula: `주택 수 ${countBefore}채 − ${isUnsold ? "준공후미분양주택" : "농어촌주택등"} 1채 = ${countAfter}채로 보아 1세대1주택 판정`,
    amount: 0,
    legalBasis: applied.legalBasis,
  };
}

export interface HouseCountExclusionResolution {
  /** 적용되는 조문 — 각 1채씩 제외. 둘 다 적격이면 2건(§99의4 → §98의9 순) */
  appliedList: (New994Result | Unsold989Result)[];
  new994Detail?: New994Result;
  unsold989Detail?: Unsold989Result;
}

/**
 * house_count_exclusion 계열(§99의4·§98의9) 통합 평가 — transfer-tax.ts STEP 0.9 진입점.
 *
 * 둘 다 적격이면 **각각 1채씩** 제외한다 (D4-01 — 종전에는 §99의4 하나로 잘렸다).
 * 두 조문 모두 효과가 「소유주택이 아닌 것으로 보아 소득세법 §89①3호를 적용한다」는
 * 주택수 의제뿐이라 감면세액이 없고, §127⑦은 「토지등을 양도하여 둘 이상의 양도소득세의
 * **감면규정**을 동시에 적용받는 경우」로 한정되며 §127⑨도 §98의2·§98의3만 열거한다.
 * 각 조문의 요건이 서로를 인용하지 않으므로 취득 순서가 「일반주택 → 준공후미분양 →
 * 농어촌주택」이면 §98의9①의 「1주택을 보유한 1세대」와 §99의4①이 함께 성립한다.
 * (의존 방향: unsold-98-9 → new-99-4 단방향 — 순환 없음)
 */
export function resolveHouseCountExclusion(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date },
): HouseCountExclusionResolution {
  const new994Detail = evaluateNew994FromReductions(reductions, ctx);
  let unsold989Detail = evaluateUnsold989FromReductions(reductions, ctx);

  const bothEligible = new994Detail?.isEligible === true && unsold989Detail?.isEligible === true;
  if (bothEligible && unsold989Detail?.isEligible) {
    unsold989Detail = { ...unsold989Detail, dualExclusionApplied: true };
  }
  const appliedList: (New994Result | Unsold989Result)[] = [];
  if (new994Detail?.isEligible) appliedList.push(new994Detail);
  if (unsold989Detail?.isEligible) appliedList.push(unsold989Detail);
  return { appliedList, new994Detail, unsold989Detail };
}
