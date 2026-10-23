/**
 * 다주택 중과 판정 메뉴 — 판정 단계 · 행별 「이 주택을 양도한다면」 · 민감도 (계획서 §4.3·§4.5 · P3b).
 *
 * 양도 예정 주택(headline)은 계산기와 같은 정밀 판정(`runMultiHouseSurchargeStep`)이다. 그 밖의 주택 행은 **같은 양도일에
 * 그 주택을 대신 양도한다면**을 간이 판정한다(F-6). 간이 판정은 명부 행만으로 알 수 있는 사실만 쓴다 — 양도 행위에 묶인 사실
 * (11호 공고 전 계약·12의2 나·다목·감면 배제 주입)과 그 주택을 팔 때의 §154①·§155 사실은 비운다(모름 = 불성립). 그래서 간이
 * 결과가 중과일 때만 결론을 바꿀 수 있는 사실을 민감도(S1~S3)로 알린다(D6 「필요할 때만 확인 필요」).
 */
import { format } from "date-fns";
import { determineMultiHouseSurcharge } from "./multi-house-surcharge";
import { transitionExemptionMonths } from "./multi-house-surcharge-exclusion";
import { withTaxIncentiveRental3hoNotice } from "./surcharge-tax-incentive-house-link";
import { assembleSurchargeHouseSet, linkSurchargeHousesForSelling } from "./transfer-tax-judgment-steps";
import { SURCHARGE_TRANSITION } from "./legal-codes";
import { buildNarrativeSteps, SELLING_RIGHT_ROW_ID, type SurchargeNarrative } from "./multi-house-surcharge-narrative-steps";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { TransferTaxInput } from "./types/transfer.types";
import type { HouseInfo, MultiHouseSurchargeInput, MultiHouseSurchargeResult, PresaleRight } from "./types/multi-house-surcharge.types";

/**
 * 판정이 끝난 단계 — `determineMultiHouseSurcharge`의 반환 경로(Step 3·4·4.5·5·6·7)를 결과 신호로 가린다.
 * 설명문은 이 단계까지 서술하고 멈춘다(교재의 판정 순서).
 */
export type DecisionStage =
  | "one_house_or_less" // Step 3 — 중과 주택 수 1 이하
  | "not_regulated" // Step 4 — 양도일 현재 조정대상지역 아님
  | "self_low_price" // Step 4.5 — 양도 주택 자체가 지방 저가주택(1호)
  | "only_one_remaining" // Step 5 — 3주택 이상 10호 「유일한 일반주택」
  | "excluded" // Step 6 — 그 밖의 배제 사유
  | "suspended" // Step 7 — 중과 대상이나 한시 유예
  | "surcharged"; // Step 7 — 중과

export function decisionStageOf(r: MultiHouseSurchargeResult): DecisionStage {
  if (r.surchargeType !== "none") return r.isSurchargeSuspended ? "suspended" : "surcharged";
  const types = new Set(r.exclusionReasons.map((e) => e.type));
  if (types.has("low_price_local_house")) return "self_low_price";
  if (types.has("only_one_remaining")) return "only_one_remaining";
  if (r.exclusionReasons.length > 0) return "excluded";
  if (r.effectiveHouseCount <= 1) return "one_house_or_less";
  return "not_regulated";
}

/** 민감도 — 간이 판정이 중과일 때 결론을 바꿀 수 있는, 명부 행에 없는 사실 */
export interface SurchargeSensitivity {
  id: "S1" | "S2" | "S3";
  message: string;
}

export interface SurchargeRowJudgment {
  houseId: string;
  /** 양도 예정 주택은 정밀(headline), 그 밖의 주택 행은 간이 */
  basis: "headline" | "simplified";
  result: MultiHouseSurchargeResult;
  stage: DecisionStage;
  sensitivity: SurchargeSensitivity[];
  /** 소재지 법정동코드가 없어 조정대상지역을 지정으로 보았다(모름 = 불리) — 「주소 미입력 · 확인 필요」 */
  regionCodeMissing: boolean;
}

/**
 * 양도 행위에 묶인 사실 — 그 주택을 「이번에 판다」는 사실이라 그 주택이 다른 주택이 되면 지운다(V-2 · F-10).
 * `HouseInfo`에는 11호 공고 전 매매계약 둘뿐이다(④ `buildHousesPayload`의 양도 주택 전용 칸 전수 대조 2026-10-22).
 * 12의2 나·다목(`gracePeriod`)·§155 의제·감면 배제 주입은 `HouseInfo` 밖의 입력이라 간이 판정이 아예 넘기지 않는다.
 */
function withoutSaleActFacts(h: HouseInfo): HouseInfo {
  if (h.contractDate === undefined && h.saleDepositReceived === undefined) return h;
  return { ...h, contractDate: undefined, saleDepositReceived: undefined };
}

/**
 * 행 k 간이 판정의 주택 집합 — headline과 **같은 집합**(§155⑳ 불성립 임대 호·명부 없는 구성 행 — F-5 · MH-P10)에서
 * 양도 행위 사실을 지우고, 양도 주택을 k로 바꿔 5호 연결을 다시 한다.
 */
export function rowJudgmentHouses(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  houseId: string,
  generalHouseAcquisitionDate?: Date,
): HouseInfo[] | undefined {
  const set = assembleSurchargeHouseSet(workingInput, parsedRates, generalHouseAcquisitionDate);
  if (!set) return undefined;
  return linkSurchargeHousesForSelling(set.rawHouses.map(withoutSaleActFacts), workingInput, houseId);
}

/** 행 k를 양도 주택으로 본 간이 판정(민감도 없이). 집합이나 주택 수 규칙이 없으면 undefined. */
export function judgeSurchargeRowSimplified(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  houseId: string,
  generalHouseAcquisitionDate?: Date,
): { result: MultiHouseSurchargeResult; input: MultiHouseSurchargeInput; regionCodeMissing: boolean } | undefined {
  const houses = rowJudgmentHouses(workingInput, parsedRates, houseId, generalHouseAcquisitionDate);
  const rules = parsedRates.houseCountExclusionRules;
  if (!houses || !rules) return undefined;
  const row = houses.find((h) => h.id === houseId);
  if (!row) return undefined;
  const input: MultiHouseSurchargeInput = {
    houses,
    sellingHouseId: houseId,
    transferDate: workingInput.transferDate,
    isOneHousehold: workingInput.isOneHousehold,
    marriageMerge: workingInput.marriageMerge,
    parentalCareMerge: workingInput.parentalCareMerge,
    presaleRights: workingInput.presaleRights ?? [],
  };
  // 원시 플래그(`isRegulatedArea`)는 원래 양도 주택의 소재지다 — 이 행에 쓰지 않는다. 코드가 없으면 지정으로 본다(모름 = 불리).
  const regionCodeMissing = !row.regionCode;
  const judge = (hs: HouseInfo[], over: Partial<MultiHouseSurchargeInput> = {}) =>
    determineMultiHouseSurcharge(
      { ...input, ...over, houses: hs },
      rules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      true,
    );
  const result = withTaxIncentiveRental3hoNotice(
    judge(houses),
    houses,
    workingInput.specialHouseExclusions,
    workingInput.transferDate,
    houseId,
    (hs) => judge(hs),
  );
  return { result, input, regionCodeMissing };
}

const S1_MESSAGE =
  "이 주택을 팔 때의 보유·거주 사실(일시적 2주택 등 소득세법 시행령 §155 특례)에 따라 중과가 배제될 수 있습니다 — 양도 예정 주택으로 바꿔 판정하세요";
const S2_MESSAGE =
  "수도권 밖 부득이한 사유 주택(소득세법 시행령 §155⑧ · §167의10①4호)에 해당하면 중과가 배제될 수 있습니다 — 양도 예정 주택으로 바꿔 판정하세요";
const s3Message = (months: number) =>
  `${SURCHARGE_TRANSITION.DEADLINE}까지 매매계약(토지거래허가 대상이면 허가 신청)을 하고 계약일부터 ${months}개월 안에 양도하면 ` +
  `한시 유예(소득세법 시행령 §167의3①12의2 나·다목)로 중과가 배제될 수 있습니다 — 양도 예정 주택으로 바꿔 판정하세요`;

/**
 * 간이 판정이 중과일 때만 반사실 재판정으로 결론이 바뀌는 사실을 고른다(저장소 관례 — `spouseHoldingNotices`).
 * S3은 재판정이 아니라 조건이다 — 계약·허가 사실은 그 주택을 팔 때의 사실이라 명부에 없다.
 */
export function surchargeRowSensitivity(
  simplified: NonNullable<ReturnType<typeof judgeSurchargeRowSimplified>>,
  parsedRates: ParsedRates,
): SurchargeSensitivity[] {
  const { result, input } = simplified;
  if (!result.surchargeApplicable) return [];
  const rules = parsedRates.houseCountExclusionRules!;
  const rerun = (over: Partial<MultiHouseSurchargeInput>) =>
    determineMultiHouseSurcharge(
      { ...input, ...over },
      rules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      true,
    ).surchargeApplicable;
  const out: SurchargeSensitivity[] = [];
  if (!rerun({ deemedOneHouseBy155: "temporary_two_house", sellingHouseMeetsOneHouseRequirements: true }))
    out.push({ id: "S1", message: S1_MESSAGE });
  if (!rerun({ unavoidableOutsideCapitalHouse: true })) out.push({ id: "S2", message: S2_MESSAGE });
  const row = input.houses.find((h) => h.id === input.sellingHouseId);
  const months = transitionExemptionMonths(row?.regionCode);
  if (format(input.transferDate, "yyyy-MM-dd") > SURCHARGE_TRANSITION.DEADLINE && months !== null)
    out.push({ id: "S3", message: s3Message(months) });
  return out;
}

/**
 * 표 ⑤ — 양도 예정 주택(headline)과 명부 주택 행마다 「같은 양도일에 이 주택을 양도한다면」.
 * 명부 밖 구성 행(§155⑳ 카드 임대 호 등)은 표의 행이 아니라 판정 집합에만 들어간다. 권리 행은 호출부가 자산 게이트로 따로 둔다.
 * 입주권을 양도하는 세대(`rightSaleRowInput`)는 양도 예정 주택이 없어 headline 없이 모든 행이 간이 판정이다.
 */
export function judgeSurchargeRows(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  headline: MultiHouseSurchargeResult | undefined,
  generalHouseAcquisitionDate?: Date,
): SurchargeRowJudgment[] {
  const sellingId = workingInput.sellingHouseId;
  const rows: SurchargeRowJudgment[] = [];
  for (const h of workingInput.houses ?? []) {
    if (h.id === sellingId && headline) {
      rows.push({ houseId: h.id, basis: "headline", result: headline, stage: decisionStageOf(headline), sensitivity: [], regionCodeMissing: !h.regionCode });
      continue;
    }
    const simplified = judgeSurchargeRowSimplified(workingInput, parsedRates, h.id, generalHouseAcquisitionDate);
    if (!simplified) continue;
    rows.push({
      houseId: h.id,
      basis: "simplified",
      result: simplified.result,
      stage: decisionStageOf(simplified.result),
      sensitivity: surchargeRowSensitivity(simplified, parsedRates),
      regionCodeMissing: simplified.regionCodeMissing,
    });
  }
  return rows;
}

/**
 * 조합원입주권을 양도하는 세대의 행 판정 입력(`multi-house-surcharge-menu-residuals.plan.md` §2 · V-5).
 *
 * 판정 본문은 양도 입주권 자리에도 「selling」 주택 행을 싣는다(④ `buildHousesPayload` — 1주택 판정이 세대 명부를 받는 자리).
 * 「다른 주택을 대신 양도한다면」에서는 그 입주권이 **보유 권리**이므로 그 행을 빼고 권리 행으로 더한다.
 * - 소재지·지정 지구는 그 행 값을 그대로 쓴다 — 가액기준 지역이면 영 §167의4②1호·§167의11②1호(종전 주택의 가격 3억 이하 불산입)를 가른다.
 * - 가액은 「도시 및 주거환경정비법」 §74①5호 종전 주택의 가격이다. 없으면 산입한다(모름 = 혜택 불성립 — 보유 권리 행과 같은 규칙).
 */
export function rightSaleRowInput(engineInput: TransferTaxInput, rightValue: number | undefined): TransferTaxInput {
  const sellingId = engineInput.sellingHouseId;
  const sellingRow = (engineInput.houses ?? []).find((h) => h.id === sellingId);
  const right: PresaleRight = {
    id: SELLING_RIGHT_ROW_ID,
    type: "redevelopment_right",
    acquisitionDate: engineInput.acquisitionDate,
    region: sellingRow?.region ?? "capital",
    ...(sellingRow?.regionCode ? { regionCode: sellingRow.regionCode, inDesignatedDistrict: sellingRow.inDesignatedDistrict } : {}),
    ...(rightValue !== undefined ? { rightValue } : {}),
  };
  return {
    ...engineInput,
    houses: (engineInput.houses ?? []).filter((h) => h.id !== sellingId),
    sellingHouseId: undefined,
    presaleRights: [...(engineInput.presaleRights ?? []), right],
  };
}

/**
 * 양도 예정 주택(headline) 상세 설명문 — §4.5. 양도 주택 행은 STEP 0.5 집합에서 찾는다(행 판정과 같은 집합 — F-5).
 * 집합이 없으면(명부·의제 사실 없음) 판정기준 단계 없이 결과 신호만으로 쓴다. 주택 수 규칙이 없으면 undefined.
 */
export function buildSurchargeNarrative(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  headline: MultiHouseSurchargeResult,
  generalHouseAcquisitionDate?: Date,
): SurchargeNarrative | undefined {
  const rules = parsedRates.houseCountExclusionRules;
  if (!rules) return undefined;
  const set = assembleSurchargeHouseSet(workingInput, parsedRates, generalHouseAcquisitionDate);
  // STEP 0.5와 같은 양도 주택 식별(`sellingHouseId ?? rawHouses[0].id`)
  const sellingId = workingInput.sellingHouseId ?? set?.rawHouses[0]?.id;
  const selling = set?.rawHouses.find((h) => h.id === sellingId);
  return buildNarrativeSteps(headline, decisionStageOf(headline), selling, workingInput.transferDate, rules);
}
