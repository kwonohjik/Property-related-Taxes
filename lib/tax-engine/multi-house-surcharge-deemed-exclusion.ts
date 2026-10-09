/**
 * 다주택 중과 배제 — **1세대1주택 의제** 호 판정 (Layer 2 내부 모듈 · E-14b·c)
 *
 * `multi-house-surcharge-exclusion.ts`의 「배제 1」을 옮겨 왔다(800줄 정책 — 그 파일이 686줄이었고 이 판정이
 * 호·시기 축으로 넓어졌다). 호출부는 `determineSurchargeExclusion` 하나다.
 *
 * ## 네 개의 호가 같은 문언을 쓴다 — 갈리는 것은 **주택·권리 수**와 **인용하는 특례 조문**이다
 *
 * | 세대 | 호 | 인용 특례 | 시행(양도일) |
 * |---|---|---|---|
 * | 주택 2 | 영 §167의10①15호 | 제155조 · 조특법 | 2023.2.28.(대통령령 제33267호 부칙 제10조) |
 * | 주택 3 이상 | 영 §167의3①13호 | 제155조 · 조특법 | 2021.2.17.(대통령령 제31442호 부칙 제2조②) |
 * | 주택 1 + 권리 1 | 영 §167의11①13호 | 제156조의2 · 제156조의3 · 조특법 | 2023.2.28.(제33267호 부칙 제10조) |
 * | 주택 + 권리 합 3 이상 | 영 §167의4③7호 | 제155조 · 제156조의2 · 제156조의3 · 조특법 | 2021.1.1.(제31442호 부칙 제10조②) |
 *
 * 문언(네 호 공통 꼬리): 「…에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나 1세대 1주택으로
 * 보아 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」(MST 286211 실독).
 *
 * ## 2주택 · 2023.2.28. 전 양도분 — 호가 따로였다 (연혁 MST 202148~247489 실독)
 *
 * 구 5호(동거봉양)·6호(혼인) — §154① 요건 없음 · 구 8호(일시적 2주택) · 구 13호(§155② 상속, 2021.2.17.~) ·
 * 구 14호(§155⑳ 거주주택, 2021.2.17.~). §155⑦ 농어촌주택·조특법 감면주택을 인용하는 호는 **없었다**.
 *
 * ## 구 8호 · 구 §167의11①1·6·7호 — §155 의제가 아니라 **호 자체의 요건** (E-14e·f)
 *
 * 네 호 모두 §154① 요건이 없고, 8호는 §155①을 인용하지도 않는다(1년 요건·조정 1·2년 기한 없음 · 실제 소유 2주택).
 * 요건·구간은 leaf `data/surcharge-old-clauses-era.ts`가 갖고, 여기서는 그 결과로 사유를 만든다
 * (`resolveOldClauseExclusion`). 그래서 그 기간의 `temporary_two_house` 의제는 호를 받지 않는다.
 *
 * ① 요소(의제 성립)는 caller가 비과세 정본으로 선판정해 `deemedOneHouseBy155`로 준다
 * (`resolveSurchargeDeemedOneHouse`). 여기서는 재판정하지 않고 **어느 호가 받는지**만 정한다.
 */
import { doubleMergeOrderOf } from "./one-house/merge-deeming";
import {
  MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE,
  CLAUSE_13_SURCHARGE_EXCLUSION_EFFECTIVE_DATE,
  RENTAL_RESIDENCE_SURCHARGE_EXCLUSION_EFFECTIVE_DATE,
  HOUSE_RIGHT_3PLUS_DEEMED_EXCLUSION_EFFECTIVE_DATE,
  MULTI_HOUSE,
} from "./legal-codes";
// 합가 기한 연수(양도일 연혁) — 비과세 판정(`matchMergeWindow`)과 같은 leaf. 배제 detail 문구용.
import { resolveMergeExemptionYears } from "./data/merge-exemption-era";
import {
  isOldSurchargeClauseEra,
  resolveOldMergeRightClause,
} from "./data/surcharge-old-clauses-era";
import type {
  DeemedOneHouseBasis,
  ExclusionReason,
  MultiHouseSurchargeInput,
  PresaleRight,
} from "./types/multi-house-surcharge.types";

/** 의제가 어느 특례 조문에서 왔는가 — 호마다 인용 범위가 다르다. */
type DeemedFamily = "155" | "special_act" | "right";

function familyOf(deemed: DeemedOneHouseBasis): DeemedFamily {
  if (deemed === "special_act_house_exclusion") return "special_act";
  if (deemed === "house_with_redevelopment_right" || deemed === "house_with_presale_right") return "right";
  return "155";
}

const isOverlap = (d: DeemedOneHouseBasis) =>
  d === "marriage_merge_overlap" || d === "parental_care_merge_overlap";
const isMerge = (d: DeemedOneHouseBasis) =>
  d === "marriage_merge" || d === "parental_care_merge" || isOverlap(d);

/** 배제를 받는 호 — `null`이면 그 세대·시기에 이 의제를 받는 호가 없다. */
type DeemedClause =
  /** 주택 2 — 15호 또는 개정 전 호(구 5·6·8·13·14호). `oldRule`이면 §154① 요건이 없는 구 5·6호 */
  | { kind: "two_house"; oldRule: boolean }
  /** 주택 3 이상 — §167의3①13호 */
  | { kind: "three_plus" }
  /** 주택 1 + 권리 1 — §167의11①13호 */
  | { kind: "house_right_one_each" }
  /** 주택 + 권리 합 3 이상 — §167의4③7호 */
  | { kind: "house_right_three_plus" };

function resolveClause(
  deemed: DeemedOneHouseBasis,
  transferDate: Date,
  effectiveHouseCount: number,
  countedRights: number,
): DeemedClause | null {
  const family = familyOf(deemed);
  const after15 = transferDate >= MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE;

  if (countedRights > 0) {
    if (effectiveHouseCount === 2) {
      // 「제156조의2, 제156조의3 또는 「조세특례제한법」」 — 제155조는 없다.
      // 2023.2.28. 전은 구 1·6·7호(§154① 요건 없음)다 — `resolveOldClauseExclusion`(E-14f).
      return after15 && family !== "155" ? { kind: "house_right_one_each" } : null;
    }
    if (effectiveHouseCount >= 3) {
      return transferDate >= HOUSE_RIGHT_3PLUS_DEEMED_EXCLUSION_EFFECTIVE_DATE
        ? { kind: "house_right_three_plus" }
        : null;
    }
    return null;
  }

  if (effectiveHouseCount >= 3) {
    return transferDate >= CLAUSE_13_SURCHARGE_EXCLUSION_EFFECTIVE_DATE && family !== "right"
      ? { kind: "three_plus" }
      : null;
  }
  if (effectiveHouseCount !== 2 || family === "right") return null;
  if (after15) return { kind: "two_house", oldRule: false };

  // ── 2023.2.28. 전 양도분 — 개정 전 호 ──
  if (isMerge(deemed)) return { kind: "two_house", oldRule: true }; // 구 5·6호 (§154① 요건 없음)
  switch (deemed) {
    case "inherited_general_house": // 구 13호 — 경로 자체가 2021.2.17. 게이트(`resolveSurchargeDeemedOneHouse`)
      return { kind: "two_house", oldRule: false };
    // `temporary_two_house`는 구 8호가 받는다 — §155① 의제가 아니라 8호 요건(`oldClause8TemporaryTwoHouse`)으로
    //   판정한다(`resolveOldClauseExclusion` · E-14e). 여기서는 호가 없다.
    case "long_term_rental_residence": // 구 14호
      return transferDate >= RENTAL_RESIDENCE_SURCHARGE_EXCLUSION_EFFECTIVE_DATE
        ? { kind: "two_house", oldRule: false }
        : null;
    default:
      // §155⑦ 농어촌주택·조특법 감면주택 — 15호 전에는 받는 호가 없었다.
      return null;
  }
}

/** 의제 근거 항 — 3주택 이상·권리 축 detail에 호와 함께 적는다. */
function deemedSourceLabel(input: MultiHouseSurchargeInput): string {
  switch (input.deemedOneHouseBy155) {
    case "temporary_two_house":
      return "일시적 2주택 1세대1주택 의제(§155①)";
    case "rural_house":
      return "농어촌주택 보유 1세대1주택 의제(§155⑦)";
    case "inherited_general_house":
      return "상속주택 보유 일반주택 1세대1주택 의제(§155②)";
    case "long_term_rental_residence":
      return "장기임대주택 보유 거주주택 1세대1주택 의제(§155⑳)";
    case "special_act_house_exclusion":
      return `조특법 감면주택 소유주택 제외 — 1세대1주택 의제(${input.deemedOneHouseSource ?? "조세특례제한법"})`;
    case "house_with_redevelopment_right":
    case "house_with_presale_right":
      return `주택과 ${input.deemedOneHouseBy155 === "house_with_presale_right" ? "분양권" : "조합원입주권"} 보유 1세대1주택 의제(${input.deemedOneHouseSource ?? ""})`;
    default:
      return "1세대1주택 의제";
  }
}

function typeOf(deemed: DeemedOneHouseBasis, input: MultiHouseSurchargeInput): ExclusionReason["type"] {
  switch (deemed) {
    case "marriage_merge":
    case "marriage_merge_overlap":
      return "marriage_merge";
    case "parental_care_merge":
    case "parental_care_merge_overlap":
      return "parental_care_merge";
    // D4 — 기한 기준인 먼저 합친 쪽으로 분류한다(라벨은 `mergeAwareLabel`이 두 합가를 함께 적는다).
    case "double_merge":
      return doubleMergeOrderOf(input)?.first === "parental_care" ? "parental_care_merge" : "marriage_merge";
    case "house_with_redevelopment_right":
    case "house_with_presale_right":
      return "right_holding_one_house";
    default:
      return deemed;
  }
}

/** 2주택(15호·개정 전 호) 배제 사유 — 의제 근거 항마다 라벨과 근거 조문이 다르다. */
function twoHouseReason(input: MultiHouseSurchargeInput, mergeUnderOldRule: boolean): ExclusionReason {
  const before15 = input.transferDate < MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE;
  switch (input.deemedOneHouseBy155) {
    case "rural_house":
      return {
        type: "rural_house",
        detail: `농어촌주택 보유 1세대1주택 의제 (${MULTI_HOUSE.RURAL_HOUSE_2HOUSE_BASIS})`,
      };
    case "inherited_general_house":
      return {
        type: "inherited_general_house",
        detail: `상속주택 보유 일반주택 1세대1주택 의제 (${
          before15
            ? MULTI_HOUSE.INHERITED_GENERAL_HOUSE_2HOUSE_BASIS_OLD
            : MULTI_HOUSE.INHERITED_GENERAL_HOUSE_2HOUSE_BASIS
        })`,
      };
    case "long_term_rental_residence":
      return {
        type: "long_term_rental_residence",
        detail: `장기임대주택 보유 거주주택 1세대1주택 의제 (${
          before15 ? MULTI_HOUSE.RENTAL_RESIDENCE_2HOUSE_BASIS_OLD : MULTI_HOUSE.RENTAL_RESIDENCE_2HOUSE_BASIS
        })`,
      };
    case "special_act_house_exclusion":
      return {
        type: "special_act_house_exclusion",
        detail: `${deemedSourceLabel(input)} (${MULTI_HOUSE.SPECIAL_ACT_2HOUSE_BASIS})`,
      };
    case "marriage_merge_overlap":
    case "parental_care_merge_overlap": {
      const marriage = input.deemedOneHouseBy155 === "marriage_merge_overlap";
      const d = (marriage ? input.marriageMerge!.marriageDate : input.parentalCareMerge!.mergeDate)
        .toISOString()
        .slice(0, 10);
      const years = resolveMergeExemptionYears(marriage ? "marriage" : "parental_care", input.transferDate);
      return {
        type: marriage ? "marriage_merge" : "parental_care_merge",
        detail:
          `${marriage ? "혼인일" : "동거봉양 합가일"}(${d}) ${years}년 내 먼저 양도 + 일시적 2주택(§155①) 중첩 — ` +
          `1세대1주택 의제 중과 배제 (${MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS})`,
      };
    }
    case "marriage_merge": {
      const d = input.marriageMerge!.marriageDate.toISOString().slice(0, 10);
      const basis = mergeUnderOldRule
        ? MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS_OLD
        : MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS;
      return {
        type: "marriage_merge",
        detail: `혼인일(${d}) ${resolveMergeExemptionYears("marriage", input.transferDate)}년 내 먼저 양도 — 1세대1주택 의제 중과 배제 (${basis})`,
      };
    }
    case "parental_care_merge": {
      const d = input.parentalCareMerge!.mergeDate.toISOString().slice(0, 10);
      const basis = mergeUnderOldRule
        ? MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS_OLD
        : MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS;
      return {
        type: "parental_care_merge",
        detail: `동거봉양 합가일(${d}) ${resolveMergeExemptionYears("parental_care", input.transferDate)}년 내 먼저 양도 — 1세대1주택 의제 중과 배제 (${basis})`,
      };
    }
    // D4 — 중과 주택 수만 2(산입 제외 주택이 있는 경우)여도 같은 15호 꼬리다.
    case "double_merge": {
      const marriageFirst = doubleMergeOrderOf(input)?.first !== "parental_care";
      return {
        type: marriageFirst ? "marriage_merge" : "parental_care_merge",
        detail: `${mergeAwareLabel(input)} — 중과 배제 (${
          marriageFirst ? MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS : MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS
        })`,
      };
    }
    default:
      return {
        type: "temporary_two_house",
        detail: `일시적 2주택 1세대1주택 의제 — 종전주택 처분기한 이내 (${MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS})`,
      };
  }
}

/**
 * 1세대1주택 의제에 따른 중과 배제 사유 — 받는 호가 없거나 요건이 모자라면 `undefined`.
 *
 * @param effectiveHouseCount 중과 주택 수(산입 주택 + 산입 권리)
 * @param countedRightCount 그중 산입된 조합원입주권·분양권 수 — 0이면 주택만의 세대(15호·13호),
 *   1 이상이면 법 §104⑦2호·4호 세대(§167의11①13호·§167의4③7호)
 * @param marriageSubtractionApplied §167의3⑨ 차감으로 3→2가 된 경우는 §155⑤ 비해당(#2a) — 혼인 의제를 받지 않는다
 * @param countedRightList 산입된 권리 목록 — 구 §167의11①6·7호 「합침으로써」 판정(E-14f). 미제공은 빈 목록.
 */
export function resolveDeemedSurchargeExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  countedRightCount: number,
  marriageSubtractionApplied: boolean,
  countedRightList: readonly PresaleRight[] = [],
): ExclusionReason | undefined {
  const old = resolveOldClauseExclusion(input, effectiveHouseCount, countedRightCount, countedRightList);
  if (old) return old;
  const deemed = input.deemedOneHouseBy155;
  if (!deemed) return undefined;
  if ((deemed === "marriage_merge" || deemed === "marriage_merge_overlap") && marriageSubtractionApplied) {
    return undefined;
  }
  const countedRights = Math.max(countedRightCount, 0);
  const clause = resolveClause(deemed, input.transferDate, effectiveHouseCount, countedRights);
  if (!clause) return undefined;

  // ② 요소 — 「같은 항의 요건을 모두 충족」. 구 5·6호(합가)만 이 요건이 없다. 미제공(?? true)은 충족 간주.
  const oldRule = clause.kind === "two_house" && clause.oldRule;
  if (!oldRule && !(input.sellingHouseMeetsOneHouseRequirements ?? true)) return undefined;

  if (clause.kind === "two_house") return twoHouseReason(input, oldRule);
  const basis =
    clause.kind === "three_plus"
      ? MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS
      : clause.kind === "house_right_one_each"
        ? MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS
        : MULTI_HOUSE.HOUSE_RIGHT_3PLUS_DEEMED_BASIS;
  // 합가 중첩(F-1)은 종전 문구를 그대로 둔다(3주택 13호 — 종전 anchor가 이 문장을 본다).
  if (clause.kind === "three_plus" && isOverlap(deemed)) return twoHouseReason(input, false);
  return { type: typeOf(deemed, input), detail: `${mergeAwareLabel(input)} — 중과 배제 (${basis})` };
}

/** 합가 의제는 기한 문구까지 적는다(2주택 문구와 같은 정보). */
function mergeAwareLabel(input: MultiHouseSurchargeInput): string {
  const d = input.deemedOneHouseBy155;
  if (d === "marriage_merge" || d === "marriage_merge_overlap") {
    const at = input.marriageMerge!.marriageDate.toISOString().slice(0, 10);
    return `혼인일(${at}) ${resolveMergeExemptionYears("marriage", input.transferDate)}년 내 먼저 양도 — 1세대1주택 의제(§155⑤)`;
  }
  if (d === "parental_care_merge" || d === "parental_care_merge_overlap") {
    const at = input.parentalCareMerge!.mergeDate.toISOString().slice(0, 10);
    return `동거봉양 합가일(${at}) ${resolveMergeExemptionYears("parental_care", input.transferDate)}년 내 먼저 양도 — 1세대1주택 의제(§155④)`;
  }
  if (d === "double_merge") {
    const order = doubleMergeOrderOf(input)!;
    const ymd = (x: Date) => x.toISOString().slice(0, 10);
    const years = resolveMergeExemptionYears(order.first, input.transferDate);
    return order.first === "marriage"
      ? `혼인일(${ymd(order.firstDate)}) ${years}년 내 먼저 양도 · 동거봉양 합가(${ymd(order.secondDate)}) — ` +
          "1세대1주택 의제(§155⑤·④ — 서면인터넷방문상담4팀-598)"
      : `동거봉양 합가일(${ymd(order.firstDate)}) ${years}년 내 먼저 양도 · 혼인(${ymd(order.secondDate)}) — ` +
          "1세대1주택 의제(§155④·⑤ — 서면인터넷방문상담4팀-598의 순서를 바꿔 적용)";
  }
  return deemedSourceLabel(input);
}

/**
 * 2023.2.28. 전 양도분의 구 호 — 구 §167의10①8호(주택 2) · 구 §167의11①1·6·7호(주택 1 + 권리 1). §154① 요건이 없다
 * (E-14e·f · 요건·구간 leaf `data/surcharge-old-clauses-era.ts`). 해당이 없으면 `undefined` — 그 뒤 의제 호 판정이 이어진다.
 */
function resolveOldClauseExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  countedRightCount: number,
  countedRights: readonly PresaleRight[],
): ExclusionReason | undefined {
  if (!isOldSurchargeClauseEra(input.transferDate) || effectiveHouseCount !== 2) return undefined;
  const rights = Math.max(countedRightCount, 0);

  if (rights === 0) {
    if (input.oldClause8TemporaryTwoHouse !== true) return undefined;
    return {
      type: "temporary_two_house",
      detail: `일시적 2주택 종전 주택 — 다른 주택 취득일부터 3년 이내 (${MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD})`,
    };
  }
  if (rights !== 1) return undefined;

  // 구 1호 — 「제156조의2제3항부터 제5항까지 또는 제156조의3제2항ㆍ제3항에 따라 … 양도소득세가 과세되는 주택」
  const deemed = input.deemedOneHouseBy155;
  if (
    (deemed === "house_with_redevelopment_right" || deemed === "house_with_presale_right") &&
    input.rightDeemingCitedByOldClause1 === true
  ) {
    return {
      type: "right_holding_one_house",
      detail: `${deemedSourceLabel(input)} — 중과 배제 (${MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS_OLD})`,
    };
  }

  // 구 6호(동거봉양)·7호(혼인) — 합침으로써 주택 1 + 권리 1
  const merge = resolveOldMergeRightClause({
    transferDate: input.transferDate,
    sellingHouseAcquisitionDate: input.houses.find((x) => x.id === input.sellingHouseId)?.acquisitionDate,
    countedRightAcquisitionDates: countedRights.map((r) => r.acquisitionDate),
    marriageDate: input.marriageMerge?.marriageDate,
    parentalCareMergeDate: input.parentalCareMerge?.mergeDate,
  });
  if (!merge) return undefined;
  const marriage = merge.kind === "marriage";
  return {
    type: marriage ? "marriage_merge" : "parental_care_merge",
    detail:
      `${marriage ? "혼인일" : "동거봉양 합가일"}(${merge.mergeDate.toISOString().slice(0, 10)}) ${merge.years}년 이내 — ` +
      `합가로 주택 1 + 권리 1 · 중과 배제 (${
        marriage ? MULTI_HOUSE.HOUSE_RIGHT_MARRIAGE_MERGE_BASIS_OLD : MULTI_HOUSE.HOUSE_RIGHT_PARENTAL_CARE_MERGE_BASIS_OLD
      })`,
  };
}
