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
 * - ①1호나목·2호다목: 취득 당시 주택+부속토지 기준시가 합계가 한도 이하 — 한도는 양도일·농어촌주택 취득일에 따라
 *   2억(2023.1.1. 전 양도) / 3억(2023.1.1. 이후 양도) / 등록 한옥 4억(2014.1.1. 이후 구입분부터) 등 (`resolveNew994StdPriceLimit`)
 * - ③: 일반주택과 같은/연접 읍·면·동(고향은 시) → 미적용
 * - ④: 3년 보유 충족 전 양도해도 적용 (선적용) → ⑥ 3년 미보유 확정 시 추징 (경고 echo)
 * - 소재지(①1호가목/2호나목)·고향(①2호가목·령⑥)은 사용자 확인 토글 (별표12 자동판정 범위 외)
 *
 * D-1: 시한 판정은 period-check(자산 취득일 기반 — 농어촌 취득일 미보유)가 아닌
 *      본 evaluator에서 ruralHouseAcquisitionDate 기준으로 수행.
 */

import {
  NEW_99_4_HANOK_DECREE,
  NEW_99_4_STD_PRICE_ADDENDA,
  TRANSFER_REDUCTION_ARTICLE,
} from "../legal-codes/transfer";
import { calculateHoldingPeriod } from "../tax-utils";
import type {
  New994ArticleId,
  New994EvaluationInput,
  New994IneligibleReason,
  New994Result,
} from "./types";

import type { MergeOrigin } from "../types/multi-house-surcharge.types";

/** 취득기간 시기 — rural ①1호 / hometown ①2호 */
export const NEW_99_4_RURAL_FROM = new Date("2003-08-01");
export const NEW_99_4_HOMETOWN_FROM = new Date("2009-01-01");
/** 취득기간 종기 (농어촌주택등취득기간 — 양도일과 무관) */
export const NEW_99_4_PERIOD_TO = new Date("2028-12-31");
/** ①1호나목·2호다목 — 취득 당시 기준시가 합계 한도 (2023.1.1. 이후 양도분 — 법률 제19199호) */
export const NEW_99_4_STD_PRICE_LIMIT = 300_000_000;
/** 령⑭ 등록 한옥 한도 (2014.1.1. 이후 구입분부터 — 법률 제12173호 부칙 제32조) */
export const NEW_99_4_STD_PRICE_LIMIT_HANOK = 400_000_000;
/** 2023.1.1. 전 양도분 한도 — 2009.1.1. 이후 취득분(법률 제9272호 부칙 제22조) */
export const NEW_99_4_STD_PRICE_LIMIT_PRE_2023 = 200_000_000;
/** 2008년 취득분 한도 (법률 제8827호 부칙 제31조) */
export const NEW_99_4_STD_PRICE_LIMIT_ACQ_2008 = 150_000_000;
/** 2003.8.1.~2007.12.31. 취득분 한도 (구 조특법 §99의4①3호) */
export const NEW_99_4_STD_PRICE_LIMIT_ACQ_2003_2007 = 70_000_000;

// 한도 분기 경계 — 행(농어촌주택 취득일) R1 ~2007 · R2 2008 · R3 2009~2013 · R4 2014~ / 열(양도일) C1 ~2016 · C2 2017~2020 · C3 2021~2022 · C4 2023~
const ACQ_R2_FROM = new Date("2008-01-01").getTime();
const ACQ_R3_FROM = new Date("2009-01-01").getTime();
const ACQ_R4_FROM = new Date("2014-01-01").getTime();
const TRANSFER_C2_FROM = new Date("2017-01-01").getTime();
const TRANSFER_C3_FROM = new Date("2021-01-01").getTime();
const TRANSFER_C4_FROM = new Date("2023-01-01").getTime();

const CURRENT_LIMIT_BASIS = "조특법 §99의4①1호나목(고향주택 2호다목)";
const PRE_2008_BASIS = `${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2009_ACQUISITION} · ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2008_ACQUISITION}`;

export interface New994StdPriceLimit {
  /** 가액 한도 (원) — 「초과하지 아니할 것」이라 이 금액까지 적격 */
  limit: number;
  /** 메시지용 한도 표기 (예: 「2억」「1억5천만원」「4억 — 등록 한옥」) */
  label: string;
  /** 메시지용 근거 */
  legalBasis: string;
}

/**
 * ①1호나목·2호다목 취득 당시 기준시가 합계 한도 — **양도일**(일반주택)과 **농어촌주택 취득일**로 가른다.
 *
 * - 법률 제19199호(2023.1.1.): 2억→3억, 시행 전 양도는 종전 규정(부칙 제39조). 종전 2억은 2009.1.1. 이후 취득분
 *   (법률 제9272호 부칙 제22조), 2008년 취득분은 1억5천만원(법률 제8827호 부칙 제31조), 그 전 취득분은 7천만원.
 * - 등록 한옥 4억: 2014.1.1. 이후 구입분부터(법률 제12173호 부칙 제32조). 한옥이어도 그 전 취득이고 2021.1.1. 전 양도면 일반과 같다.
 * - 해석 칸(2009.1.1. 전 취득 × 2021.1.1. 이후 양도, 한옥 2014.1.1. 전 취득 × 2021.1.1. 이후 양도)은 후보 읽기 중 최대 한도를 쓴다
 *   — 법률 제17759호 부칙 제21조②가 두 가지로 읽히며 정면 해석례는 확인 필요(계획서 NH-05 PR-2b).
 * - 2009.3.15. 이전 양도는 범위 밖이라 열 C1에 포함해 둔다. 취득기간(2003.8.1.) 전 취득은 OUT_OF_PERIOD가 따로 막는다.
 */
export function resolveNew994StdPriceLimit(input: {
  transferDate: Date;
  ruralHouseAcquisitionDate: Date;
  isRegisteredHanok?: boolean;
}): New994StdPriceLimit {
  const acq = input.ruralHouseAcquisitionDate.getTime();
  const tr = input.transferDate.getTime();
  const row = acq < ACQ_R2_FROM ? 1 : acq < ACQ_R3_FROM ? 2 : acq < ACQ_R4_FROM ? 3 : 4;
  const col = tr < TRANSFER_C2_FROM ? 1 : tr < TRANSFER_C3_FROM ? 2 : tr < TRANSFER_C4_FROM ? 3 : 4;
  const hanok = input.isRegisteredHanok === true;

  // 등록 한옥 4억 — 2014.1.1. 이후 구입분(R4) 또는 2021.1.1. 이후 양도분(해석 칸은 현행 유지)
  if (hanok && (row === 4 || col >= 3)) {
    return {
      limit: NEW_99_4_STD_PRICE_LIMIT_HANOK,
      label: "4억 — 등록 한옥",
      legalBasis: `${CURRENT_LIMIT_BASIS} · ${NEW_99_4_HANOK_DECREE}`,
    };
  }
  const hanokNote = hanok
    ? ` · 등록 한옥 4억원은 2014.1.1. 이후 구입분부터(${NEW_99_4_STD_PRICE_ADDENDA.HANOK_2014_PURCHASE})`
    : "";
  const suffix = hanok ? " — 등록 한옥" : "";

  if (col === 4) {
    return { limit: NEW_99_4_STD_PRICE_LIMIT, label: `3억${suffix}`, legalBasis: CURRENT_LIMIT_BASIS + hanokNote };
  }
  if (row >= 3) {
    return {
      limit: NEW_99_4_STD_PRICE_LIMIT_PRE_2023,
      label: `2억${suffix}`,
      legalBasis: `조특법 §99의4① · ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2023_TRANSFER}(2023.1.1. 전 양도 — 종전 규정 2억원)${hanokNote}`,
    };
  }
  if (col === 3) {
    return {
      limit: NEW_99_4_STD_PRICE_LIMIT_PRE_2023,
      label: `2억${suffix}`,
      legalBasis: `2009.1.1. 전 취득분의 한도는 종전 규정(7천만원·1억5천만원) 또는 2억원(${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2021_TRANSFER})으로 읽히며 어느 쪽이든 초과${hanokNote}`,
    };
  }
  return row === 1
    ? {
        limit: NEW_99_4_STD_PRICE_LIMIT_ACQ_2003_2007,
        label: `7천만원${suffix}`,
        legalBasis: `${PRE_2008_BASIS}(2008.1.1. 전 취득 — 종전 규정 7천만원)${hanokNote}`,
      }
    : {
        limit: NEW_99_4_STD_PRICE_LIMIT_ACQ_2008,
        label: `1억5천만원${suffix}`,
        legalBasis: `${PRE_2008_BASIS}(2008년 취득 — 종전 규정 1억5천만원)${hanokNote}`,
      };
}
/** ① 의무 보유기간 (3년 — ④ 선적용 허용, ⑥ 추징) */
export const NEW_99_4_MANDATORY_YEARS = 3;

/**
 * D5 — §99의4① 「그 농어촌주택등 취득 전에 보유하던 다른 주택(일반주택)」 순서를 볼 **합가 맥락**.
 *
 * 합가가 없으면 `undefined`(종전 그대로 — 양도 주택 취득일과 비교). `houses`는 엔진 명부 형태
 * (`mergeOrigin` — 합가 전 보유 쪽)이다. 판정 메뉴·계산기 일반 경로·겸용 경로가 같은 함수(`new994MergeOrderOf`)로 채운다.
 */
export type New994MergeOrderContext =
  | {
      houses: ReadonlyArray<{ id: string; acquisitionDate?: Date; mergeOrigin?: MergeOrigin }>;
      mergeDate: Date;
    }
  | undefined;

/**
 * D5 — 이 농어촌주택등의 「취득 전 보유 일반주택」 비교 기준일.
 *
 * 🔑 합가 **상대방 세대**(`counterpart_side`)가 합가 전부터 보유하던 농어촌주택이면 그 세대의 다른 주택(합가 전 보유)
 *    중 가장 먼저 취득한 것과 비교한다. 농어촌주택과 일반주택을 보유한 직계존속 세대와 1주택 직계비속 세대가 동거봉양
 *    합가해 직계비속의 주택을 양도한 사안에서 1세대1주택을 인정했다(기획재정부 재산세제과-795, 2012.9.28. —
 *    직계비속 주택은 농어촌주택보다 나중 취득, 직계존속의 일반주택이 먼저 취득). 양도 주택과 비교하면 순서 요건이
 *    거꾸로 걸려 그 세대가 과세된다(해석례 평가셋 `E129-*`).
 * 🔑 그 밖에는 `fallback`(양도 주택 취득일 — 종전 그대로). 상대방 쪽에 다른 주택이 없어도 그렇다.
 */
export function new994GeneralHouseAcquisitionDate(
  ruralHouseId: string | undefined,
  order: New994MergeOrderContext,
  fallback: Date,
): Date {
  if (!ruralHouseId || !order) return fallback;
  const rural = order.houses.find((h) => h.id === ruralHouseId);
  if (rural?.mergeOrigin !== "counterpart_side") return fallback;
  const earlier = order.houses
    .filter(
      (h) =>
        h.id !== ruralHouseId &&
        h.mergeOrigin === "counterpart_side" &&
        h.acquisitionDate !== undefined &&
        h.acquisitionDate.getTime() <= order.mergeDate.getTime(),
    )
    .map((h) => h.acquisitionDate!.getTime());
  return earlier.length > 0 ? new Date(Math.min(...earlier)) : fallback;
}

/** TransferReduction의 §99의4 멤버 구조 (구조적 타이핑 — 순환 import 회피, rental-97-router 패턴) */
interface New994ReductionLike {
  type: New994ArticleId;
  /** 판정 메뉴 명부 행 id — 「어느 주택인가」(평가에는 쓰지 않고 결과에 되돌려 준다) */
  houseId?: string;
  ruralHouseAcquisitionDate?: Date;
  ruralHouseStdPrice?: number;
  isRegisteredHanok?: boolean;
  isAdjacentArea?: boolean;
  meetsLocationRequirement?: boolean;
  meetsHometownRequirement?: boolean;
}

const isNew994Like = (x: { type: string }): x is New994ReductionLike =>
  x.type === "new_99_4_rural" || x.type === "new_99_4_hometown";

function evaluateNew994Declaration(
  r: New994ReductionLike,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date },
): New994Result {
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

/**
 * reductions[]에서 §99의4 항목을 찾아 평가 — transfer-tax.ts STEP 0.9 진입점.
 * 미포함 시 undefined (특례 미신청).
 */
export function evaluateNew994FromReductions(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date },
): New994Result | undefined {
  const r = reductions.find(isNew994Like);
  return r ? evaluateNew994Declaration(r, ctx) : undefined;
}

/**
 * §99의4 선언 **전건** 평가 — 결과마다 선언의 `houseId`를 되돌려 준다.
 *
 * 🔑 농어촌주택등을 **2채 이상** 보유한 동안에는 어느 것도 제외하지 않는다. 법문이 「다음 각 호의
 *    어느 하나에 해당하는 **1채의 주택**」이고, 국세청은 2채를 취득한 경우 「1채를 양도한 후에」
 *    보유하고 있는 농어촌주택 취득 전 보유 주택을 양도할 때 특례를 적용한다고 회신했다
 *    (재산세과-1096, 2009.06.02 · 부동산납세과-91, 2014.02.19).
 *    농어촌주택 1채 + 고향주택 1채의 조합은 직접 해석이 없어 법문(1호·2호를 합쳐 「1채」)대로 합산한다.
 */
export function evaluateNew994Declarations(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: { generalHouseAcquisitionDate: Date; transferDate: Date; mergeOrder: New994MergeOrderContext },
): (New994Result & { houseId?: string })[] {
  const declared = reductions.filter(isNew994Like);
  const results = declared.map((r) => ({
    ...evaluateNew994Declaration(r, {
      ...ctx,
      generalHouseAcquisitionDate: new994GeneralHouseAcquisitionDate(r.houseId, ctx.mergeOrder, ctx.generalHouseAcquisitionDate),
    }),
    ...(r.houseId ? { houseId: r.houseId } : {}),
  }));
  if (results.length < 2) return results;
  return results.map((d) => ({
    id: d.id,
    isEligible: false as const,
    ineligibleReasons: [
      ...(d.isEligible ? [] : d.ineligibleReasons),
      {
        code: "MULTIPLE_HOUSES" as const,
        message: `농어촌주택등을 ${results.length}채 보유하고 있습니다 — 1채를 양도한 뒤에 남은 1채에 적용됩니다 (재산세과-1096·부동산납세과-91).`,
        legalBasis: d.legalBasis,
      },
    ],
    legalBasis: d.legalBasis,
    effectCategory: d.effectCategory,
    ...(d.houseId ? { houseId: d.houseId } : {}),
  }));
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
      message: `${houseLabel} 취득 당시 기준시가 합계가 입력되지 않았습니다 (가액 한도 검증 — 조특법 §99의4①).`,
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
    // 3') 양도 시점 — ① "취득하여 … 일반주택을 양도" (§98의9 검토에서 발견된 동일 갭 보강.
    //     기존에는 보유 0년 + 추징 경고로 eligible 통과하던 비정상 입력 차단)
    if (input.transferDate.getTime() <= acq) {
      reasons.push({
        code: "TRANSFER_BEFORE_ACQUISITION",
        message: `${houseLabel}을 취득한 후에 일반주택을 양도하는 경우에만 적용됩니다 (§99의4①).`,
        legalBasis,
      });
    }
  }

  // 4) 가액 — 양도일·취득일별 한도 "초과하지 아니할 것" → 경계 포함 적용 (취득일 미입력이면 한도를 정할 수 없어 건너뜀 — 위 1)이 이미 불성립)
  if (input.ruralHouseStdPrice !== undefined && input.ruralHouseStdPrice > 0 && input.ruralHouseAcquisitionDate) {
    const cap = resolveNew994StdPriceLimit({
      transferDate: input.transferDate,
      ruralHouseAcquisitionDate: input.ruralHouseAcquisitionDate,
      isRegisteredHanok: input.isRegisteredHanok,
    });
    if (input.ruralHouseStdPrice > cap.limit) {
      reasons.push({
        code: "STD_PRICE_EXCEEDED",
        message: `취득 당시 기준시가 합계가 한도(${cap.label})를 초과합니다 (${cap.legalBasis}).`,
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
