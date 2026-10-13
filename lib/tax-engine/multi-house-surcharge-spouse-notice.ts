/**
 * §167의3⑨·§167의4⑤ 「양도일 현재 양도자의 배우자가 보유한」 응답의 확인 필요 고지 (결정 #47).
 *
 * 응답이 **결론을 가를 때만** 낸다 — 반사실 재계산(응답을 바꿔 같은 엔진을 다시 돌림)으로 중과 여부·유형이 달라지는지 본다.
 * 이미 중과가 배제되거나 중과 대상이 아니면 응답이 무엇이든 결과가 같아 고지하지 않는다.
 *
 *  A. 혼인한 배우자 쪽 주택·분양권·입주권의 응답이 미응답·「모름」 → 차감하지 않고 계산했다(모름 = 혜택 불성립). 「예」였다면 달라진다.
 *  B. 배우자 쪽이 아닌 행(양도자 쪽 등)을 「예」로 답해 차감했다 — 이 경우를 다룬 해석례를 확인하지 못했다. 「아니오」였다면 달라진다.
 */
import { MULTI_HOUSE } from "./legal-codes";
import { readSpouseHolding, spouseSideOriginOf } from "./spouse-holding-at-transfer";
import type { HouseInfo, MultiHouseSurchargeInput, MultiHouseSurchargeResult, PresaleRight } from "./types/multi-house-surcharge.types";

const differs = (a: MultiHouseSurchargeResult, b: MultiHouseSurchargeResult): boolean =>
  a.surchargeApplicable !== b.surchargeApplicable || a.surchargeType !== b.surchargeType;

const unanswered = (h: Pick<HouseInfo, "spouseHeldAtTransfer" | "isSpouseOwned">): boolean => {
  const a = readSpouseHolding(h);
  return a === undefined || a === "unknown";
};

export function spouseHoldingNotices(
  input: MultiHouseSurchargeInput,
  result: MultiHouseSurchargeResult,
  recompute: (alt: MultiHouseSurchargeInput) => MultiHouseSurchargeResult,
): string[] {
  const marriage = input.marriageMerge;
  if (!marriage) return [];
  const spouseOrigin = spouseSideOriginOf(marriage.marriageDate, input.parentalCareMerge?.mergeDate);
  const date = marriage.marriageDate.toISOString().slice(0, 10);
  const out: string[] = [];

  const isOther = (h: HouseInfo) => h.id !== input.sellingHouseId;
  const spouseRowsAsked = (h: HouseInfo) => isOther(h) && !!spouseOrigin && h.mergeOrigin === spouseOrigin && unanswered(h);
  const rightsAsked = (r: PresaleRight) => unanswered(r);
  if (input.houses.some(spouseRowsAsked) || input.presaleRights.some(rightsAsked)) {
    const alt = recompute({
      ...input,
      houses: input.houses.map((h) => (spouseRowsAsked(h) ? { ...h, spouseHeldAtTransfer: "yes" as const } : h)),
      presaleRights: input.presaleRights.map((r) => (rightsAsked(r) ? { ...r, spouseHeldAtTransfer: "yes" as const } : r)),
    });
    if (differs(result, alt)) {
      out.push(
        `혼인일(${date}) 5년 안의 양도라 ${MULTI_HOUSE.MARRIAGE_SUBTRACT_3HOUSE_BASIS}·${MULTI_HOUSE.MARRIAGE_SUBTRACT_RIGHT_BASIS}에 따라 양도일 현재 양도자의 배우자가 보유한 주택·분양권·입주권 수를 뺍니다. ` +
          "배우자 쪽 주택·권리 중 양도일 현재 배우자 쪽이 보유한다고 확인되지 않은 것(미응답 또는 모름)은 빼지 않고 계산했습니다 — " +
          `양도일 현재도 배우자(배우자 쪽 세대원 보유 포함 — 주택은 ${MULTI_HOUSE.MARRIAGE_SUBTRACT_SPOUSE_HOUSEHOLD_RULING})가 보유하면 중과 여부·세율이 달라질 수 있습니다(확인 필요).`,
      );
    }
  }

  const yesOther = (h: HouseInfo) =>
    isOther(h) && !!h.mergeOrigin && h.mergeOrigin !== spouseOrigin && readSpouseHolding(h) === "yes";
  if (input.houses.some(yesOther)) {
    const alt = recompute({
      ...input,
      houses: input.houses.map((h) =>
        yesOther(h) ? { ...h, spouseHeldAtTransfer: "no" as const, isSpouseOwned: false } : h,
      ),
    });
    if (differs(result, alt)) {
      out.push(
        `혼인 전 배우자 쪽이 아닌 주택을 양도일 현재 배우자가 보유한다는 응답을 반영해 ${MULTI_HOUSE.MARRIAGE_SUBTRACT_3HOUSE_BASIS}에 따라 주택 수에서 뺐습니다. ` +
          "혼인 뒤 부부 사이에 이전된 주택 등 이 경우를 다룬 해석례를 확인하지 못했습니다(확인 필요).",
      );
    }
  }
  return out;
}
