/**
 * §155④⑤ × ⑳ 상대 쪽 임대(`lib/tax-engine/one-house/merge-rental-carveout.ts`) — ⑤·⑧이 보는 화면 술어. 구성 판정은 엔진과 같은 leaf다.
 *
 * - `waived` — ⑧이 거주주택 2년을 막지 않고 ⑤도 미충족으로 표시하지 않는다.
 * - `unanswered` — 상대 쪽 거주 문항을 물어야 한다. `declined` — 「아니오」(⑳ 그대로 판정).
 * - `undefined` — 이 경로가 아니다.
 *
 * 성립의 나머지(합가 10년 · 합가 전 취득 · 임대 호별 요건)는 엔진이 본다. 엔진이 불성립으로 보면 ⑳ 불성립 사유로 과세돼 막다른 길이 아니다.
 */
import { mergeRentalRosterHolds } from "@/lib/tax-engine/one-house/merge-rental-carveout";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export type MergeRentalState = "waived" | "unanswered" | "declined" | undefined;

export function mergeRentalState(form: {
  assets?: AssetForm[];
  houses?: HouseEntry[];
  marriageDate?: string;
  parentalCareMergeDate?: string;
  isFirstTransferredInMerge?: boolean;
}): MergeRentalState {
  const asset = form.assets?.[0];
  const rh = asset?.rentalHousingException;
  if (asset?.assetKind !== "housing" || !rh?.applyException || rh.scenario !== "A" || rh.rentalUnits?.length !== 1) return undefined;
  if (!form.isFirstTransferredInMerge) return undefined;
  if (!!form.marriageDate === !!form.parentalCareMergeDate) return undefined;
  const mergeDate = toOptionalDate(form.marriageDate || form.parentalCareMergeDate);
  if (!mergeDate) return undefined;
  const others = (form.houses ?? []).map((h) => ({
    id: h.id,
    acquisitionDate: toOptionalDate(h.acquisitionDate) ?? new Date(NaN),
    isLongTermRental: h.isLongTermRental === true,
    mergeOrigin: h.mergeOrigin === "seller_side" || h.mergeOrigin === "counterpart_side" ? h.mergeOrigin : undefined,
  }));
  if (!mergeRentalRosterHolds(others, mergeDate, rh.rentalUnits[0].mergeOrigin).holds) return undefined;
  const answer = rh.counterpartHouseResidedTwoYears;
  return answer === "yes" ? "waived" : answer === "no" ? "declined" : "unanswered";
}
