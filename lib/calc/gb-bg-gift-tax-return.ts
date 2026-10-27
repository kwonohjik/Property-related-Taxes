/**
 * 일반건물 부담부증여 × 이월과세 — 화면이 받는 **증여세 신고서 금액**(산출세액·과세가액) 짝. ④·⑧ 공용 술어 leaf.
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-gift-tax-input.plan.md` §2·§4.1.
 *
 * 화면(`CarryoverGiftBlock`)은 일반건물이면 부담부증여여도 산출세액·과세가액을 받는다. 그런데 부담부증여 일반건물은
 * `buildGbCarryoverPayload`가 `{}`라(§159 경로와의 중복 배선 회피) 일반 `buildCarryoverPayload`로 가고, 그 함수는
 * 상당액(`giftTaxAmount`)만 읽어 **0이 실렸다**(실측: 산출 3천만·과세가액 10억 → 109,326,000 = 증여세 0).
 * ⇒ 짝이 다 차면 ④가 이 값으로 「소득세법 시행령」 제163조의2 제2항 상당액을 만들고, ⑧은 같은 술어로 짝·분자를 검사한다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { bgCarryoverForm } from "./bg-carryover-parts";
import { bgCarryoverParts } from "./bg-carryover-parts";
import { carryoverAssumedDebt } from "./carryover-gift-assumed-debt";
import { carryoverGiftTaxedValue } from "./carryover-gift-assumed-debt";

export interface GbBgGiftTaxReturn {
  /** 영 §163의2②1호 — 증여세 산출세액(신고서 금액, 지분 스케일 금지). */
  giftTaxCalculated: number;
  /** 영 §163의2②3호 — 「상속세 및 증여세법」 제47조 과세가액(신고서 금액, 지분 스케일 금지). */
  giftTaxBase: number;
}

/** 산출세액·과세가액 칸을 보여 주는 부담부증여 일반건물인가 — 화면 분기(`isGeneralBuilding`)와 ④ 분기(부담부증여)의 교집합. */
export const isGbBurdenedGift = (asset: AssetForm): boolean =>
  asset.assetKind === "general_building" && asset.transferType === "burdened_gift";

/**
 * 짝이 **다** 찼을 때만 돌려준다. 하나라도 비면 `undefined` — 그러면 ④는 종전 상당액(`giftTaxAmount`)을 쓴다
 * (저장 이력·시드 호환, 일반 양도 일반건물의 `gbCarryoverUsesPartShape`와 같은 규칙).
 * 읽는 서브폼은 증여 사건 출처다 — 건물만 이월과세면 건물 블록(`bgCarryoverForm`, 계획서 `gb-bg-part-carryover-calc.plan.md` §4.4).
 */
export function gbBgGiftTaxReturn(asset: AssetForm): GbBgGiftTaxReturn | undefined {
  if (!isGbBurdenedGift(asset)) return undefined;
  const c = bgCarryoverForm(asset);
  const giftTaxCalculated = parseAmount(c?.giftTaxCalculated ?? "");
  const giftTaxBase = parseAmount(c?.giftTaxBase ?? "");
  return giftTaxCalculated > 0 && giftTaxBase > 0 ? { giftTaxCalculated, giftTaxBase } : undefined;
}

/**
 * 토지·건물 **둘 다** 이월과세인 부담부증여 일반건물인가 — 그러면 「증여 당시 평가액」을 **토지분·건물분**으로 따로 받는다
 * (토지분 = 사건 블록 `carryover`, 건물분 = `buildingCarryover` — 분리 ON은 건물 블록, 분리 OFF는 같은 블록의 건물분 칸).
 * ④(분자·`giftValuationByPart`)·⑤(칸·문구)·⑧(필수·합)이 이 술어 하나를 읽는다(계획서 `gb-bg-carryover-gift-tax-part-limit.plan.md` Q-2 a · Q-3 b).
 */
export function gbBgSplitsGiftValuation(asset: AssetForm): boolean {
  if (!isGbBurdenedGift(asset)) return false;
  const p = bgCarryoverParts(asset);
  return p.land && p.building;
}

/** 둘 다 이월과세면 토지분·건물분 「증여 당시 평가액」(100% 기준 입력 그대로) — 아니면 undefined. */
export function gbBgGiftValuationByPart(asset: AssetForm): { land: number; building: number } | undefined {
  if (!gbBgSplitsGiftValuation(asset)) return undefined;
  return { land: parseAmount(asset.carryover?.giftDateValuation ?? ""), building: parseAmount(asset.buildingCarryover?.giftDateValuation ?? "") };
}

/**
 * 둘 다 이월과세면 토지분·건물분 「해당 자산가액(증여세가 과세된 증여세 과세가액)」(100% 기준) — 평가액 − 당초 증여 때 인수한 그 파트 채무.
 * 영 §163의2②2호 분자이자 토지·건물 배분 비율이다(④ `giftValuationByPart` · 계획서 `carryover-gift-tax-numerator-net.plan.md` §4.2).
 */
export function gbBgGiftTaxedValueByPart(asset: AssetForm): { land: number; building: number } | undefined {
  const byPart = gbBgGiftValuationByPart(asset);
  if (!byPart) return undefined;
  const event = bgCarryoverForm(asset);
  return {
    land: carryoverGiftTaxedValue(byPart.land, carryoverAssumedDebt(event, asset.carryover)),
    building: carryoverGiftTaxedValue(byPart.building, carryoverAssumedDebt(event, asset.buildingCarryover)),
  };
}

/**
 * 영 §163의2②2호 분자 — 「해당 자산가액(증여세가 과세된 증여세 과세가액)」(100% 기준 입력 = 평가액 − 인수채무) × 지분율.
 * 둘 다 이월과세면 토지분 + 건물분이다(각각 지분율을 곱해 더한다).
 * ④ 호출부 3곳(단건·묶음·지분)이 모두 `getOwnershipRatio`를 넘기므로 ⑧은 여기서 같은 값을 다시 만든다(`buildCarryoverPayload`도 이 함수를 쓴다).
 */
export function gbBgGiftTaxNumerator(asset: AssetForm): number {
  const r = getOwnershipRatio(asset);
  const scale = (v: number) => (r < 1 ? applyRatio(v, r) : v);
  const byPart = gbBgGiftTaxedValueByPart(asset);
  if (byPart) return scale(byPart.land) + scale(byPart.building);
  const event = bgCarryoverForm(asset);
  return scale(carryoverGiftTaxedValue(parseAmount(event?.giftDateValuation ?? ""), carryoverAssumedDebt(event, event)));
}
