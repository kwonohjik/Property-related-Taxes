/**
 * 다주택 중과 판정 응답 조립 — 순수 함수(계획서 §4.1 단계 6~11 · §4.4 · §4.6 · §4.8).
 *
 * 양도 예정 주택은 계산기와 **같은 함수·같은 인자**로 판정한다(T2 — `transfer-tax-precalc.ts` `runSurchargeAndLandSteps`):
 * `resolveSurchargeExclusionByReduction` → `runMultiHouseSurchargeStep(…, resolveHceGeneralHouseAcquisitionDate)` →
 * `resolveSurchargeApplication`. 다른 행·설명문은 P3b·P3c의 순수 함수를 그대로 부른다. 화면은 다시 계산하지 않는다(T5).
 *
 * 시뮬레이션(D3c)은 route가 요청을 받았을 때 따로 붙인다(`surcharge-simulation.ts`).
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode, type RegulatedAreaJudgment } from "@/lib/tax-engine/data/regulated-areas";
import { resolveSurchargeAddonRate, MULTI_HOUSE_SURCHARGE_START_DATE } from "@/lib/tax-engine/data/multi-house-surcharge-rate-history";
import { isMultiHouseLthdExclusionEra } from "@/lib/tax-engine/data/lthd-multi-house-exclusion-era";
import {
  classifyRegionCriteriaDetail,
  presaleRightCountReason,
  type RegionCriteriaDetail,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import {
  buildSurchargeNarrative,
  decisionStageOf,
  judgeSurchargeRows,
  type DecisionStage,
  type SurchargeRowJudgment,
} from "@/lib/tax-engine/multi-house-surcharge-narrative";
import type { SurchargeNarrative } from "@/lib/tax-engine/multi-house-surcharge-narrative-steps";
import { runMultiHouseSurchargeStep } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { resolveSurchargeExclusionByReduction } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import {
  resolveSurchargeApplication,
  SURCHARGE_SUBJECT_PROPERTY_TYPES,
  type SurchargeApplication,
} from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import type { ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
import type { ExcludedHouse, MultiHouseSurchargeResult, PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { OneHouseExemptionResponse } from "../one-house-exemption/judgment-request";
import type { SurchargeSimulation } from "./surcharge-simulation";

/**
 * 판정하지 않는 범위.
 * - `before_2018_04_01` — 「소득세법」 §104⑦ 다주택 중과 시행 전 양도(T12)
 * - `rules_not_loaded` — 주택 수 산정 규칙이 없다(근사 판정 금지)
 * - `non_housing_sale` — 양도 대상이 조합원입주권·분양권이다. §104⑦은 「주택」을 양도하는 경우라 중과가 없다
 *   (자산 게이트 `SURCHARGE_SUBJECT_PROPERTY_TYPES`). 보유 주택별 표는 V-5(권리 행 변환의 가액 출처)가 남아 싣지 않는다.
 * - `no_house_roster` — 본문에 명부(`houses`)가 없다. 판정 메뉴 본문은 양도 주택 행을 늘 싣는다(`buildMultiHouseSurchargeApiBody`).
 */
export type SurchargeJudgmentScopeReason = "before_2018_04_01" | "rules_not_loaded" | "non_housing_sale" | "no_house_roster";

/** 표 ①~⑤의 주택 행 — 행 판정(⑤)에 셀 사실을 붙인다(§4.4). */
export interface SurchargeHouseRow extends SurchargeRowJudgment {
  /** ① 판정기준과 이유 — 소재지 코드가 없으면 null(화면이 「주소 미입력」) */
  regionCriteria: RegionCriteriaDetail | null;
  /** ④ 양도일 현재 조정대상지역 — 코드가 없으면 null */
  regulated: RegulatedAreaJudgment | null;
  /** ③ 주택 수에서 빠졌으면 그 사유(정밀 판정 headline 기준) */
  countExclusion: Pick<ExcludedHouse, "reason" | "detail"> | null;
}

/** 표의 조합원입주권·분양권 행 — 주택이 아니라 ⑤는 언제나 「중과 없음」(자산 게이트) */
export interface SurchargeRightRow {
  rightId: string;
  type: PresaleRight["type"];
  /** ③ 주택 수 산입 사유 */
  countReason: ReturnType<typeof presaleRightCountReason>;
  /** §167의4⑤ 혼인 배우자 보유 권리 차감(3 이상) */
  spouseSubtracted: boolean;
}

/** 세율 영향(D3b · §4.6) — 장특 축과 세율 축을 따로 싣는다(위기 취득은 세율만 빠진다) */
export interface SurchargeRateImpact {
  surchargeType: SurchargeApplication["effectiveSurchargeType"];
  /** §95② 장기보유특별공제 배제 축 */
  isSurchargeCase: boolean;
  /** 세율 가산 축 */
  isRateSurchargeApplied: boolean;
  /** 기본세율에 더하는 율(0.1~0.3). 세율 가산이 없으면 null */
  addonRate: number | null;
  /** 장기보유특별공제를 배제하는가 — 중과 대상 · 유예 아님 · §95② 괄호가 §104⑦ 자산을 담는 시기 */
  lthdExcluded: boolean;
  /** 한시 유예 근거 목 · 나·다목 양도 기한 */
  suspension: { basis: "a" | "na" | "da"; deadline?: string } | null;
  rateSurchargeStatutoryExcluded: boolean;
}

export interface MultiHouseSurchargeJudgmentResponse {
  scope: { supported: true } | { supported: false; reason: SurchargeJudgmentScopeReason };
  /** 중과 판정 기준일(양도일, YYYY-MM-DD) */
  transferDate: string;
  /** D3a 비과세 판정의 기한 기준일(오늘, YYYY-MM-DD) */
  judgmentBaseDate: string;
  /** D3a 1세대1주택 비과세 요약 — 1주택 route와 같은 조립(`buildOneHouseExemptionPayload`) */
  exemption: OneHouseExemptionResponse;
  /** 양도 예정 주택 정밀 판정 — `scope.supported`일 때만 */
  headline?: {
    result: MultiHouseSurchargeResult;
    application: SurchargeApplication;
    decisionStage: DecisionStage;
    narrative: SurchargeNarrative;
  };
  rows?: { houses: SurchargeHouseRow[]; rights: SurchargeRightRow[] };
  rateImpact?: SurchargeRateImpact;
  /** D3c 세부담 시뮬레이션 — 요청에 `simulation`이 있고 `scope.supported`일 때만 */
  simulation?: SurchargeSimulation;
  notices: string[];
}

const FUTURE_TRANSFER_NOTICE =
  "양도일이 오늘보다 뒤입니다 — 조정대상지역 지정·해제와 한시 유예는 오늘까지 고시된 내용으로 판정했습니다";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function rateImpactOf(
  headline: MultiHouseSurchargeResult,
  app: SurchargeApplication,
  transferDate: Date,
): SurchargeRateImpact {
  const type = app.effectiveSurchargeType;
  return {
    surchargeType: type,
    isSurchargeCase: app.isSurchargeCase,
    isRateSurchargeApplied: app.isRateSurchargeApplied,
    addonRate: app.isRateSurchargeApplied && type !== "none" ? resolveSurchargeAddonRate(transferDate, type) : null,
    // `transfer-tax-lthd.ts` L-1과 같은 조건
    lthdExcluded: app.isSurchargeCase && !app.isSuspended && isMultiHouseLthdExclusionEra(transferDate),
    suspension: headline.isSurchargeSuspended
      ? {
          // 엔진은 나·다목 입력(`gracePeriod`)이 있을 때만 목을 싣는다 — 없으면 양도일 창(가목) 판정이다
          //   (`determineSurchargeExclusion` → `isSurchargeSuspended`, 창 상한 = 가목 2026.5.9.).
          basis: headline.surchargeSuspensionBasis ?? "a",
          ...(headline.surchargeSuspensionDeadline ? { deadline: ymd(headline.surchargeSuspensionDeadline) } : {}),
        }
      : null,
    rateSurchargeStatutoryExcluded: headline.rateSurchargeStatutoryExcluded === true,
  };
}

export function buildSurchargeJudgmentPayload(
  engineInput: TransferTaxInput,
  parsedRates: ParsedRates,
  judgmentBaseDate: Date,
  exemption: OneHouseExemptionResponse,
): MultiHouseSurchargeJudgmentResponse {
  const transferDate = engineInput.transferDate;
  const base = {
    transferDate: ymd(transferDate),
    judgmentBaseDate: ymd(judgmentBaseDate),
    exemption,
    notices: ymd(transferDate) > ymd(judgmentBaseDate) ? [FUTURE_TRANSFER_NOTICE] : [],
  };
  const unsupported = (reason: SurchargeJudgmentScopeReason): MultiHouseSurchargeJudgmentResponse => ({
    scope: { supported: false, reason },
    ...base,
  });

  if (ymd(transferDate) < MULTI_HOUSE_SURCHARGE_START_DATE) return unsupported("before_2018_04_01");
  if (!SURCHARGE_SUBJECT_PROPERTY_TYPES.has(engineInput.propertyType)) return unsupported("non_housing_sale");
  if (!parsedRates.houseCountExclusionRules) return unsupported("rules_not_loaded");

  // 계산기와 같은 인자(`transfer-tax-precalc.ts` `runSurchargeAndLandSteps`)
  const exclusionByReduction = resolveSurchargeExclusionByReduction(engineInput.reductions, {
    transferDate: engineInput.transferDate,
    acquisitionDate: engineInput.acquisitionDate,
    assetContractDate: engineInput.assetContractDate,
    transferPrice: engineInput.transferPrice,
    standardPriceAtTransfer: engineInput.standardPriceAtTransfer,
  });
  const hce = resolveHceGeneralHouseAcquisitionDate(engineInput);
  const headline = runMultiHouseSurchargeStep(engineInput, parsedRates, [], exclusionByReduction, hce);
  if (!headline) return unsupported("no_house_roster");

  // `transfer-tax.ts` 장특 축 호출과 같은 입력
  const application = resolveSurchargeApplication(
    {
      propertyType: engineInput.propertyType,
      isRegulatedArea: engineInput.isRegulatedArea,
      householdHousingCount: engineInput.householdHousingCount,
      transferDate,
    },
    headline,
    parsedRates.surchargeSpecialRules,
  );

  const rawHouses = new Map((engineInput.houses ?? []).map((h) => [h.id, h]));
  const houses: SurchargeHouseRow[] = judgeSurchargeRows(engineInput, parsedRates, headline, hce).map((row) => {
    const h = rawHouses.get(row.houseId);
    const code = h?.regionCode;
    const excluded = headline.excludedHouses.find((e) => e.houseId === row.houseId);
    return {
      ...row,
      regionCriteria: code ? classifyRegionCriteriaDetail(code) : null,
      regulated: code ? isRegulatedByBjdCode(code, ymd(transferDate), h?.inDesignatedDistrict) : null,
      countExclusion: excluded ? { reason: excluded.reason, detail: excluded.detail } : null,
    };
  });
  const presaleStart = new Date(parsedRates.houseCountExclusionRules.presaleRightStartDate);
  const spouseSubtracted = new Set((headline.excludedPresaleRights ?? []).map((r) => r.id));
  const rights: SurchargeRightRow[] = (engineInput.presaleRights ?? []).map((r) => ({
    rightId: r.id,
    type: r.type,
    countReason: presaleRightCountReason(r, presaleStart),
    spouseSubtracted: spouseSubtracted.has(r.id),
  }));

  return {
    scope: { supported: true },
    ...base,
    headline: {
      result: headline,
      application,
      decisionStage: decisionStageOf(headline),
      narrative: buildSurchargeNarrative(engineInput, parsedRates, headline, hce)!,
    },
    rows: { houses, rights },
    rateImpact: rateImpactOf(headline, application, transferDate),
  };
}
