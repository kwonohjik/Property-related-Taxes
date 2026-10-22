/**
 * 다주택 중과 판정 메뉴 — 양도 예정 주택 상세 설명문 (계획서 §4.5 · P3c).
 *
 * 교재 순서(① 조정대상지역 → ② 판정기준 → ③ 주택 수 → ④ 배제 → ⑤ 유예·부칙 → ⑥ 결론)로 정밀 판정 결과(headline)를
 * 풀어 쓴다. 엔진을 다시 돌리지 않고 결과 신호만 읽는다 — 결론은 언제나 headline이다.
 *
 * - ①②③은 엔진이 늘 계산하는 사실이라 언제나 싣는다. ④⑤는 엔진이 그 단계까지 갔을 때만 싣는다(판정이 끝난 뒤는 서술하지 않는다).
 * - 판정이 끝난 단계에 `decisive`를 단다(`decisionStageOf`).
 * - 판정하지 못한 사실(F-7)은 `headline.warnings` 전건을 `checks`에 싣는다 — 배제가 없을 때도 「해당 없음」과 함께 적는다.
 * - 주택은 내부 id로만 가리킨다(`houseNotes`) — 문장에 id를 넣지 않는다. 화면이 행 이름으로 바꿔 보여 준다.
 * - 「유리/불리·절감」 표현과 금액의 「원」 접미는 쓰지 않는다.
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { resolveSurchargeAddonRate } from "./data/multi-house-surcharge-rate-history";
import { classifyRegionCriteriaDetail, resolveLowPriceLocalHouse, type RegionCriteriaReason } from "./multi-house-surcharge-count";
import { REGION_CODE_MISSING_WARNING } from "./multi-house-surcharge";
import {
  CRISIS_ACQ_EXCLUSION_WINDOW,
  MULTI_HOUSE,
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
  SURCHARGE_TRANSITION,
} from "./legal-codes";
import type { DecisionStage } from "./multi-house-surcharge-narrative";
import type { HouseCountExclusionRules, HouseInfo, MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";

export type NarrativeStepId = "regulated" | "criteria" | "count" | "exclusion" | "suspension" | "conclusion";

export interface NarrativeStep {
  id: NarrativeStepId;
  title: string;
  /** 이 단계의 한 줄 판정 */
  verdict: string;
  /** 판정이 이 단계에서 끝났다 */
  decisive: boolean;
  sentences: string[];
  /** 주택별 서술 — 화면이 `houseId`를 행 이름으로 바꾼다 */
  houseNotes: Array<{ houseId: string; text: string }>;
  /** 근거 조문·고시 */
  basis: string[];
}

export interface SurchargeNarrative {
  stage: DecisionStage;
  steps: NarrativeStep[];
  /** 확인 필요 — 판정에 쓰지 못했거나 모름으로 처리한 사실(엔진 warnings 전건 + 소재지 판정) */
  checks: string[];
}

const DECISIVE_STEP: Record<DecisionStage, NarrativeStepId> = {
  not_regulated: "regulated",
  self_low_price: "criteria",
  one_house_or_less: "count",
  only_one_remaining: "exclusion",
  excluded: "exclusion",
  suspended: "suspension",
  surcharged: "conclusion",
};

/** 엔진이 ④ 배제 판정까지 간 단계 */
const REACHED_EXCLUSION: ReadonlySet<DecisionStage> = new Set(["only_one_remaining", "excluded", "suspended", "surcharged"]);

const REGION_REASON_TEXT: Record<Exclude<RegionCriteriaReason, "no_code">, string> = {
  eup_myeon: "읍·면 지역이라",
  seoul: "서울특별시라",
  capital_city: "수도권(경기도) 시의 동 지역이라",
  capital_county: "수도권의 군 지역이라",
  metro_district: "광역시 자치구라",
  metro_county: "광역시에 소속된 군이라",
  sejong: "세종특별자치시의 동 지역이라",
  integrated_si_gun: "광역시 자치구가 아닌 시·군 지역이라",
  province: "수도권·광역시·특별자치시 밖 지역이라",
};

const won = (n: number) => n.toLocaleString("ko-KR");
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function regulatedStep(
  headline: MultiHouseSurchargeResult,
  selling: HouseInfo | undefined,
  transferDate: Date,
  checks: string[],
): Omit<NarrativeStep, "decisive"> {
  const regulated = headline.isRegulatedAtTransfer;
  const status = regulated ? "조정대상지역입니다" : "조정대상지역이 아닙니다";
  const basis: string[] = [];
  const sentences: string[] = [];
  if (selling?.regionCode) {
    const j = isRegulatedByBjdCode(selling.regionCode, ymd(transferDate), selling.inDesignatedDistrict);
    sentences.push(`양도일(${ymd(transferDate)}) 현재 양도 예정 주택의 소재지는 ${status}.`);
    basis.push(j.basis);
    if (j.districtOnly && selling.inDesignatedDistrict === undefined) {
      checks.push(
        `소재지 동 안의 일부 지구(${j.districtOnly.district})만 조정대상지역입니다 — 지구 안인지 답하지 않아 지정으로 보았습니다. 주택이 지구 밖이면 판정이 달라질 수 있습니다`,
      );
    } else if (j.confidence !== "high") {
      checks.push(`조정대상지역 여부 확인 필요 — ${j.basis}`);
    }
  } else {
    sentences.push(`소재지 법정동코드가 없어 입력하신 조정대상지역 여부로 판정했습니다 — 양도일(${ymd(transferDate)}) 현재 ${status}.`);
    checks.push("양도 예정 주택의 주소(법정동코드)가 입력되지 않아 조정대상지역 여부를 입력값으로 판정했습니다 — 주소를 입력하면 지정·해제 이력으로 판정합니다");
  }
  if (!regulated) sentences.push("양도일 현재 조정대상지역에 있지 않은 주택은 다주택 중과 대상이 아닙니다.");
  return { id: "regulated", title: "조정대상지역", verdict: regulated ? "조정대상지역" : "조정대상지역 아님", sentences, houseNotes: [], basis };
}

function criteriaStep(selling: HouseInfo, rules: HouseCountExclusionRules, checks: string[]): Omit<NarrativeStep, "decisive"> {
  const sentences: string[] = [];
  let criteria: "REGION" | "VALUE";
  if (selling.regionCriteria) {
    criteria = selling.regionCriteria;
    sentences.push(`이 주택에는 ${criteria === "REGION" ? "지역기준" : "가액기준"}이 적용됩니다.`);
  } else if (selling.regionCode) {
    const d = classifyRegionCriteriaDetail(selling.regionCode);
    criteria = d.criteria;
    const why = d.reason === "no_code" ? "" : `${REGION_REASON_TEXT[d.reason]} `;
    sentences.push(`소재지가 ${why}${criteria === "REGION" ? "지역기준" : "가액기준"}이 적용됩니다.`);
  } else {
    criteria = selling.region === "capital" ? "REGION" : "VALUE";
    sentences.push(
      `소재지 법정동코드가 없어 입력하신 지역 구분(${selling.region === "capital" ? "수도권·광역시 등" : "그 밖의 지역"})으로 ${criteria === "REGION" ? "지역기준" : "가액기준"}을 적용했습니다.`,
    );
    checks.push("양도 예정 주택의 주소(법정동코드)가 없어 지역기준·가액기준을 입력하신 지역 구분으로 정했습니다 — 읍·면·군 지역은 가액기준입니다");
  }
  const low = resolveLowPriceLocalHouse(selling, rules);
  if (criteria === "REGION") {
    sentences.push("지역기준 지역의 주택은 기준시가와 관계없이 주택 수에 산입하고 중과 판정 대상이 됩니다.");
  } else if (low) {
    sentences.push(
      `양도 당시 기준시가(${won(low.price)})가 한도(${won(low.threshold)}) 이하이므로 주택 수에 산입하지 않고, 이 주택을 양도할 때 다주택 중과를 적용하지 않습니다.`,
    );
  } else {
    const price = selling.transferOfficialPrice ?? selling.officialPrice;
    const threshold = rules.lowPriceThreshold.local ?? rules.lowPriceThreshold.non_capital;
    sentences.push(`양도 당시 기준시가(${won(price)})가 한도(${won(threshold)})를 넘으므로 주택 수에 산입하고 중과 판정 대상이 됩니다.`);
  }
  return {
    id: "criteria",
    title: "판정기준(지역기준·가액기준)",
    verdict: criteria === "REGION" ? "지역기준" : low ? "가액기준 — 기준시가 이하" : "가액기준 — 기준시가 초과",
    sentences,
    houseNotes: [],
    basis: [MULTI_HOUSE.LOW_PRICE_LOCAL_BASIS],
  };
}

function countStep(headline: MultiHouseSurchargeResult): Omit<NarrativeStep, "decisive"> {
  const n = headline.effectiveHouseCount;
  const sentences = [
    `세대가 보유한 주택·조합원입주권·분양권 ${headline.rawHouseCount}개 중 주택 수에서 빠지는 것을 제외하면, 중과 판정에 쓰는 주택 수(조합원입주권·분양권 포함)는 ${n}입니다.`,
  ];
  const excludedRights = headline.excludedPresaleRights?.length ?? 0;
  if (excludedRights > 0) {
    sentences.push(`혼인한 날부터 5년 안의 양도라 배우자가 보유한 조합원입주권·분양권 ${excludedRights}개를 뺐습니다.`);
  }
  if (n <= 1) sentences.push("중과 판정 주택 수가 1 이하라 다주택 중과 대상이 아닙니다.");
  return {
    id: "count",
    title: "중과 판정 주택 수",
    verdict: n <= 1 ? `${n} — 1 이하` : `${n}`,
    sentences,
    houseNotes: headline.excludedHouses.map((e) => ({ houseId: e.houseId, text: e.detail })),
    basis: [MULTI_HOUSE.HOUSE_COUNT_RULE],
  };
}

function exclusionStep(headline: MultiHouseSurchargeResult, stage: DecisionStage): Omit<NarrativeStep, "decisive"> {
  const sentences = headline.exclusionReasons.map((r) => `${r.detail}.`);
  const excluded = stage === "excluded" || stage === "only_one_remaining";
  if (excluded) sentences.push("이 사유로 다주택 중과가 배제됩니다.");
  else if (headline.exclusionReasons.length === 0) sentences.push("검토한 중과 배제 사유 중 해당하는 것이 없습니다.");
  if (headline.warnings.length > 0) sentences.push("판정에 쓰지 못한 사실은 「확인 필요」에 적었습니다.");
  return {
    id: "exclusion",
    title: "중과 배제",
    verdict: excluded ? "배제" : "해당 없음",
    sentences,
    houseNotes: (headline.onlyOneRemainingDetail?.otherHousesExcluded ?? []).map((o) => ({ houseId: o.houseId, text: o.reason })),
    basis: [],
  };
}

function suspensionStep(headline: MultiHouseSurchargeResult, transferDate: Date): Omit<NarrativeStep, "decisive"> | null {
  const sentences: string[] = [];
  const basis: string[] = [];
  let verdict: string;
  if (headline.isSurchargeSuspended) {
    const b = headline.surchargeSuspensionBasis;
    if (b === "na" || b === "da") {
      const deadline = headline.surchargeSuspensionDeadline ? ymd(headline.surchargeSuspensionDeadline) : "기한";
      sentences.push(
        b === "na"
          ? `토지거래허가 대상 주택으로 ${SURCHARGE_TRANSITION.DEADLINE}까지 허가를 신청하고 계약한 뒤 양도 기한(${deadline}) 안에 양도해 한시 유예됩니다.`
          : `${SURCHARGE_TRANSITION.DEADLINE}까지 매매계약을 하고 양도 기한(${deadline}) 안에 양도해 한시 유예됩니다.`,
      );
      basis.push(SURCHARGE_TRANSITION.BASIS);
    } else {
      sentences.push(`보유기간 2년 이상인 주택을 ${SURCHARGE_TRANSITION.DEADLINE}까지 양도해 한시 유예됩니다.`);
      basis.push(SURCHARGE_TRANSITION.BASIS_A);
    }
    sentences.push("중과 대상이지만 한시 유예 기간이라 다주택 중과를 적용하지 않습니다.");
    verdict = "한시 유예";
  } else if (ymd(transferDate) >= SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.start) {
    sentences.push("다주택 중과 한시 유예(보유기간 2년 이상 · 2026-05-09까지 양도 또는 그날까지의 계약·허가 신청)에 해당하지 않습니다.");
    basis.push(SURCHARGE_TRANSITION.BASIS_A, SURCHARGE_TRANSITION.BASIS);
    verdict = "해당 없음";
  } else {
    verdict = "해당 없음";
  }
  if (headline.rateSurchargeStatutoryExcluded) {
    sentences.push(
      `양도 주택을 ${CRISIS_ACQ_EXCLUSION_WINDOW.start}부터 ${CRISIS_ACQ_EXCLUSION_WINDOW.end}까지 취득해 다주택 중과세율 대신 기본세율을 적용합니다. ` +
        "중과 대상이라는 판정은 그대로라 장기보유특별공제 배제 여부는 따로 판단합니다.",
    );
    verdict = headline.isSurchargeSuspended ? verdict : "취득 시기 특례 — 세율 가산 없음";
  }
  if (sentences.length === 0) return null;
  return { id: "suspension", title: "한시 유예·취득 시기 특례", verdict, sentences, houseNotes: [], basis };
}

function conclusionStep(headline: MultiHouseSurchargeResult, transferDate: Date): Omit<NarrativeStep, "decisive"> {
  const type = headline.surchargeType;
  // 위기 취득 특례는 `surchargeApplicable`을 끄지만 중과 유형은 남긴다 — 「중과 없음」보다 먼저 가린다.
  if (type === "none" || headline.isSurchargeSuspended || (!headline.surchargeApplicable && !headline.rateSurchargeStatutoryExcluded)) {
    return {
      id: "conclusion",
      title: "결론",
      verdict: "중과 없음",
      sentences: [headline.isSurchargeSuspended ? "한시 유예로 다주택 중과를 적용하지 않습니다." : "다주택 중과를 적용하지 않습니다."],
      houseNotes: [],
      basis: [],
    };
  }
  const label = type === "multi_house_3plus" ? "3주택 이상" : "2주택";
  if (headline.rateSurchargeStatutoryExcluded) {
    return {
      id: "conclusion",
      title: "결론",
      verdict: `${label} 중과 대상 — 세율 가산 없음`,
      sentences: [`${label} 중과 대상이지만 취득 시기 특례로 세율은 기본세율을 적용합니다.`],
      houseNotes: [],
      basis: [MULTI_HOUSE.SURCHARGE_RATE],
    };
  }
  const addon = resolveSurchargeAddonRate(transferDate, type);
  const addonText = addon === null ? "" : `(기본세율 +${Math.round(addon * 100)}%p)`;
  return {
    id: "conclusion",
    title: "결론",
    verdict: `${label} 중과${addonText}`,
    sentences: [`${label} 중과${addonText}를 적용합니다.`],
    houseNotes: [],
    basis: [MULTI_HOUSE.SURCHARGE_RATE],
  };
}

export function buildNarrativeSteps(
  headline: MultiHouseSurchargeResult,
  stage: DecisionStage,
  selling: HouseInfo | undefined,
  transferDate: Date,
  rules: HouseCountExclusionRules,
): SurchargeNarrative {
  const checks: string[] = [];
  const drafts: Array<Omit<NarrativeStep, "decisive">> = [regulatedStep(headline, selling, transferDate, checks)];
  if (selling) drafts.push(criteriaStep(selling, rules, checks));
  drafts.push(countStep(headline));
  if (REACHED_EXCLUSION.has(stage)) {
    drafts.push(exclusionStep(headline, stage));
    const s = stage === "only_one_remaining" || stage === "excluded" ? null : suspensionStep(headline, transferDate);
    if (s) drafts.push(s);
  }
  drafts.push(conclusionStep(headline, transferDate));
  // 코드 없음 경고는 ①이 풀어 쓴 확인 필요로 대신한다(같은 사실 — 내부 필드명이 화면에 나가지 않게).
  checks.push(...headline.warnings.filter((w) => !(w === REGION_CODE_MISSING_WARNING && !selling?.regionCode)));
  const decisive = DECISIVE_STEP[stage];
  return { stage, steps: drafts.map((d) => ({ ...d, decisive: d.id === decisive })), checks };
}
