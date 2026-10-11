/**
 * §155⑦3호 귀농주택 — **정의 요건(⑩4호)과 ⑪ 「귀농 후 최초 1개」·귀농 전 취득 일반주택** 사실 판정 (결정 #44 · G5-2).
 *
 * 종전에는 명부에서 「3호 귀농」 유형을 고르기만 하면 ⑩4호(영농 또는 영어의 목적으로 취득)를 묻지 않고 비과세했고,
 * ⑪은 계산기 경고에만 있었다. 모르는 요건에 혜택을 주는 구조라 원칙 1(모르면 혜택 불성립 + 확인 필요)에 어긋났다.
 *
 * 🔑 **키가 없거나 「모름」이면 불성립**이다(⑩5호 `wholeHouseholdMoved !== true`·⑩3호 `?? Infinity`와 같은 관례).
 *    이를 「종전 세액 유지」로 바꾸지 않는다 — 화면 경로는 ⑧이 답을 받아 항상 싣고, 레거시·직접 호출만 이 기본값을 만난다.
 * 🔑 판정 메뉴·계산기·합가·중과 15호가 같은 술어(`qualifiesRuralHouseApartFromDeadline`)로 이 함수를 부른다.
 *
 * ## 연혁 게이트 — 새 입력 없이 행의 취득일·양도일로 판정한다
 *
 * | 게이트 | 기준 | 근거 |
 * |---|---|---|
 * | 나목 | 귀농주택 **취득일** ≥ 2016-03-31 | 대통령령 제27074호 부칙 제1조 본문(공포일 시행) · 제2조(시행 전 취득분은 종전 규정) |
 * | 가·나목 배우자 | **양도일** ≥ 2019-02-12 | 대통령령 제29523호 부칙 제1조 본문(공포일 시행) · 제2조 제2항(시행 이후 양도분부터) |
 * | 다목 배우자 | **양도일** ≥ 2026-02-27 | 대통령령 제36129호 부칙 제1조 본문(공포일 시행) · 제8조(시행 이후 양도분부터) |
 *
 * 2016-03-31 전에 취득한 귀농주택은 나목이 없던 때라 **종전 가목**(귀농일 현재 농지 소유 — 취득 선후 무관)으로 읽는다.
 * 나목을 고른 그 세대를 불성립으로 두면 종전 가목에 해당하던 세대를 과세하게 된다(원칙 2).
 * 농지 면적 기준이 990㎡로 적혀 있던 시기(2007-02-28 개정 전)는 적용례를 확인하지 못했다 — 게이트 없이 확인 필요만 낸다.
 */
import { TRANSFER } from "../legal-codes";
import type { TransferTaxInput } from "../types/transfer.types";

type RuralHouse = NonNullable<TransferTaxInput["ruralHouse"]>;

/** 나목(농지 소유 전 1년 이내 주택 취득) — 귀농주택 취득일 기준. */
export const RURAL_FARMLAND_NA_ACQ_START = new Date("2016-03-31");
/** 가·나목의 「또는 그 배우자」 — 양도일 기준. */
export const RURAL_FARMLAND_SPOUSE_GA_NA_TRANSFER_START = new Date("2019-02-12");
/** 다목(어업인)의 「또는 그 배우자」 — 양도일 기준. */
export const RURAL_FARMLAND_SPOUSE_DA_TRANSFER_START = new Date("2026-02-27");
/** 농지 면적이 990㎡로 적혀 있던 시기의 끝(⑩ 연혁 표기 2007.2.28.) — 적용례 미확인. */
export const RURAL_FARMLAND_990_ERA_END = new Date("2007-02-28");

export const RURAL_FARM_FACTS_UNCONFIRMED_ID = "155-7-3ho-farm-facts-unconfirmed";
export const RURAL_FARMLAND_990_ERA_ID = "155-10-4-farmland-area-990-era-unverified";

export interface ReturnToFarmFactsCheck {
  /** ⑩4호 · ⑪ · 귀농 전 취득 일반주택 요건을 모두 충족했는가 */
  qualified: boolean;
  /** 확정 불충족(해당 없음·이미 비과세·귀농 후 취득·연혁상 배우자 불인정) */
  failed: string[];
  /** 「모름」이거나 답이 없어 **불성립으로 본** 사실 — 확인 필요 */
  unconfirmed: string[];
}

const ART = {
  purpose: TRANSFER.RURAL_RETURN_TO_FARM_PURPOSE,
  first: TRANSFER.RURAL_RETURN_TO_FARM_FIRST_ONLY,
};

const dot = (d: Date) => `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}.`;

/** 나목을 고른 세대가 2016-03-31 전 취득이면 종전 가목으로 읽는다. */
export function effectiveFarmlandBasis(r: Pick<RuralHouse, "farmlandBasis" | "acquisitionDate">) {
  if (r.farmlandBasis === "na" && r.acquisitionDate && r.acquisitionDate.getTime() < RURAL_FARMLAND_NA_ACQ_START.getTime()) {
    return "ga" as const;
  }
  return r.farmlandBasis;
}

export function checkReturnToFarmFacts(
  r: Pick<
    RuralHouse,
    "farmlandBasis" | "farmlandHolder" | "priorReturnFarmExemption" | "generalHouseAcquiredBeforeReturn" | "acquisitionDate"
  >,
  transferDate: Date,
): ReturnToFarmFactsCheck {
  const failed: string[] = [];
  const unconfirmed: string[] = [];

  // ⑩4호 — 영농·영어의 목적(가·나·다목)
  const basis = effectiveFarmlandBasis(r);
  if (basis === undefined || basis === "unknown") {
    unconfirmed.push(
      `귀농주택의 「영농 또는 영어의 목적으로 취득」 요건(${ART.purpose} 가·나·다목)을 ${basis === "unknown" ? "모른다고 답해" : "답하지 않아"} 귀농주택으로 인정하지 않았습니다.`,
    );
  } else if (basis === "none") {
    failed.push(
      `귀농주택이 ${ART.purpose}의 가·나·다목(1,000㎡ 이상 농지 소유자 또는 어업인 등)에 해당하지 않아 귀농주택으로 인정되지 않습니다.`,
    );
  } else if (r.farmlandHolder === "spouse") {
    const [start, label] =
      basis === "da"
        ? [RURAL_FARMLAND_SPOUSE_DA_TRANSFER_START, "다목 어업인의 배우자"]
        : [RURAL_FARMLAND_SPOUSE_GA_NA_TRANSFER_START, "가·나목 농지 소유자의 배우자"];
    if (transferDate.getTime() < start.getTime()) {
      failed.push(
        `${label}는 ${dot(start)} 이후 양도하는 분부터 인정됩니다(${ART.purpose}) — 이 양도일에는 본인이 농지 소유자·어업인이어야 합니다.`,
      );
    }
  } else if (r.farmlandHolder === undefined) {
    unconfirmed.push(
      `${ART.purpose}의 농지 소유자·어업인이 본인인지 배우자인지 답하지 않아 귀농주택으로 인정하지 않았습니다.`,
    );
  }

  // ⑪ — 귀농 후 최초로 양도하는 1개의 일반주택
  const prior = r.priorReturnFarmExemption;
  if (prior === "has") {
    failed.push(
      `이미 귀농주택 특례(§155⑦)로 일반주택을 비과세 양도한 적이 있어 ${ART.first}의 「귀농 후 최초로 양도하는 1개의 일반주택」이 아닙니다(대법원 2005.12.23. 선고 2004두10869).`,
    );
  } else if (prior !== "none") {
    unconfirmed.push(
      `${ART.first}의 「귀농 후 최초로 양도하는 1개의 일반주택」 여부(이미 이 특례로 일반주택을 비과세 양도한 적)를 ${prior === "unknown" ? "모른다고 답해" : "답하지 않아"} 특례를 적용하지 않았습니다.`,
    );
  }

  // 양도 일반주택이 귀농 전 취득분인가
  const before = r.generalHouseAcquiredBeforeReturn;
  if (before === "no") {
    failed.push(
      "양도하는 일반주택을 귀농 이후에 취득했습니다 — 귀농 이전에 취득한 일반주택이어야 합니다(귀농 이후 일반주택을 취득하여 양도하는 경우를 다룬 국세청 해석 — 본문 확인 필요).",
    );
  } else if (before !== "yes") {
    unconfirmed.push(
      `양도하는 일반주택을 귀농 이전에 취득했는지 ${before === "unknown" ? "모른다고 답해" : "답하지 않아"} 특례를 적용하지 않았습니다.`,
    );
  }

  return { qualified: failed.length === 0 && unconfirmed.length === 0, failed, unconfirmed };
}

/**
 * 「모름」·미응답 사실만 **유리한 답**으로 바꾼 복사본 — 그 사실이 비과세 결론을 가르는지(확인 필요 고지) 반사실 판정에 쓴다.
 * 확정 답(`none`·`has`·`no`·배우자 연혁 불인정)은 건드리지 않는다.
 */
export function withUnconfirmedFactsFavorable(r: RuralHouse): RuralHouse {
  const basisUnknown = r.farmlandBasis === undefined || r.farmlandBasis === "unknown";
  return {
    ...r,
    farmlandBasis: basisUnknown ? "ga" : r.farmlandBasis,
    farmlandHolder: r.farmlandHolder ?? "self",
    priorReturnFarmExemption: r.priorReturnFarmExemption === "has" ? "has" : "none",
    generalHouseAcquiredBeforeReturn: r.generalHouseAcquiredBeforeReturn === "no" ? "no" : "yes",
  };
}

/**
 * 농지 면적 990㎡ 표기 시기 확인 필요 — 가·나목이면서 귀농주택 취득일이 2007-02-28 전인 경우.
 * 1,000㎡로 바뀐 개정의 적용례를 확인하지 못했다 — 판정은 바꾸지 않고 알린다.
 */
export function farmland990EraNotice(
  r: Pick<RuralHouse, "farmlandBasis" | "acquisitionDate">,
): string | null {
  const basis = effectiveFarmlandBasis(r);
  if ((basis !== "ga" && basis !== "na") || !r.acquisitionDate) return null;
  if (r.acquisitionDate.getTime() >= RURAL_FARMLAND_990_ERA_END.getTime()) return null;
  return (
    `${ART.purpose}의 농지 면적 기준은 2007.2.28. 개정 전 시행령에 990㎡로 적혀 있었습니다. 개정의 적용례를 확인하지 못했으니 ` +
    "소유 농지가 1,000㎡ 미만이면 직접 확인하세요(확인 필요)."
  );
}

/**
 * ⑫ 사후관리(추징) 고지 — 판정 메뉴 결과(`postManagementNotices`)와 계산기 경고가 **같은 문장**을 쓴다(단일 소스).
 * ⑪은 이제 입력으로 받으므로 여기서 다시 묻지 않는다.
 */
export function returnToFarmPostManagementNotice(
  r: Pick<RuralHouse, "farmlandBasis" | "acquisitionDate"> | undefined,
): string {
  const na = r !== undefined && effectiveFarmlandBasis(r) === "na";
  return (
    `귀농주택 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}⑦3호)는 사후관리 대상입니다(${TRANSFER.RURAL_RETURN_TO_FARM_CLAWBACK}) — ` +
    "귀농일부터 계속하여 3년 이상 영농 또는 영어에 종사하지 않거나 그 기간 동안 해당 주택에 거주하지 않으면 양도한 일반주택은 " +
    "1세대1주택으로 보지 않으며, 그 사유가 발생한 날이 속하는 달의 말일부터 2개월 이내에 양도소득세를 신고·납부해야 합니다(추징). " +
    (na
      ? "귀농일은 귀농주택에 주민등록을 이전해 거주를 개시한 날이며, 주택을 취득한 뒤 농지를 취득하는 경우(나목)에는 전입 후 농지를 취득한 날입니다."
      : "귀농일은 귀농주택에 주민등록을 이전해 거주를 개시한 날입니다.")
  );
}
