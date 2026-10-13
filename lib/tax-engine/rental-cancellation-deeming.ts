/**
 * 등록이 말소된 장기임대주택의 다주택 중과 판정 — 「소득세법 시행령」 §167의3①2호 단서.
 *
 * 「이 조, 제167조의4, 제167조의10 및 제167조의11을 적용할 때 가목 및 다목부터 마목까지의 규정에 해당하는
 *  장기임대주택(법률 제17482호 … 부칙 제5조제1항이 적용되는 주택으로 한정한다)으로서 「민간임대주택에 관한 특별법」
 *  제6조제5항에 따라 임대의무기간이 종료한 날 등록이 말소되는 경우에는 임대의무기간이 종료한 날 해당 목에서 정한
 *  임대기간요건을 갖춘 것으로 본다.」
 *
 * - **자동말소**(민특법 §6⑤): 면제되는 것은 임대기간요건뿐이다(해당 목의 다른 요건은 그대로). 말소 뒤 몇 년이 지나
 *   일반주택을 양도해도 10호가 적용된다(서면-2022-법규재산-1999, 2023.2.1.). 말소 뒤에는 임대를 계속하지 않아도
 *   된다(서면-2022-법규재산-0208, 2022.3.30.).
 * - **자진말소**(§6①11호): 사목은 말소 후 1년 이내에 **그 주택을** 양도하는 경우만 정한다. 다른 주택을 양도할 때
 *   2호로 보는지는 해석을 확인하지 못해 보지 않는다(사용자 결정 2026-10-13 · 확인 필요 고지).
 * - 말소 사유 미선택 = 모름 → 간주하지 않는다(확인 필요 고지).
 *
 * 자동말소는 법률 제17482호(2020.8.18. 시행)로 생겼다 — 그 전 말소일이면 간주하지 않는다.
 */
import { MULTI_HOUSE, RENTAL_REGISTRATION_4HO } from "./legal-codes";
import { RA_CUT } from "./rental-article/rules";
import type {
  HouseInfo,
  MultiHouseSurchargeInput,
  MultiHouseSurchargeResult,
  RentalHousingType,
} from "./types/multi-house-surcharge.types";

/** 단서 대상 목 — 가·다·라·마목 */
const PROVISO_TYPES: ReadonlySet<RentalHousingType> = new Set(["A", "C", "D", "E"]);

/**
 * - `none`: 양도일 현재 말소되지 않았다
 * - `auto_deemed`: 자동말소 + 단서 대상 목 — 임대기간요건만 갖춘 것으로 본다
 * - `not_deemed`: 그 밖의 말소 — 장기임대주택으로 보지 않는다
 */
export type RentalCancellationStatus = "none" | "auto_deemed" | "not_deemed";

export function rentalCancellationStatus(house: HouseInfo, transferDate: Date): RentalCancellationStatus {
  const cancelled = house.rentalCancelledDate;
  if (!cancelled || cancelled > transferDate) return "none";
  return house.rentalCancellationReason === "auto" &&
    house.rentalType != null &&
    PROVISO_TYPES.has(house.rentalType) &&
    cancelled.getTime() >= RA_CUT.Y2020_08_18
    ? "auto_deemed"
    : "not_deemed";
}

const differs = (a: MultiHouseSurchargeResult, b: MultiHouseSurchargeResult): boolean =>
  a.surchargeApplicable !== b.surchargeApplicable || a.surchargeType !== b.surchargeType;

const houseLabel = (id: string): string => (id.startsWith("임대주택") ? id : `주택 ${id}`);

/**
 * 말소 사유를 「자동말소」로 바꾸면 중과 여부·유형이 달라질 때만 확인 필요 고지를 낸다
 * (`spouseHoldingNotices`와 같은 반사실 재계산).
 */
export function rentalCancellationNotices(
  input: MultiHouseSurchargeInput,
  result: MultiHouseSurchargeResult,
  recompute: (alt: MultiHouseSurchargeInput) => MultiHouseSurchargeResult,
): string[] {
  const asked = (h: HouseInfo) =>
    h.isLongTermRental &&
    rentalCancellationStatus(h, input.transferDate) === "not_deemed" &&
    rentalCancellationStatus({ ...h, rentalCancellationReason: "auto" }, input.transferDate) === "auto_deemed";
  const targets = input.houses.filter(asked);
  if (targets.length === 0) return [];
  const alt = recompute({
    ...input,
    houses: input.houses.map((h) => (asked(h) ? { ...h, rentalCancellationReason: "auto" as const } : h)),
  });
  if (!differs(result, alt)) return [];
  return targets.map((h) =>
    h.rentalCancellationReason === "voluntary"
      ? `${houseLabel(h.id)}: 자진말소(${RENTAL_REGISTRATION_4HO.VOLUNTARY_CANCELLATION})된 임대주택이라 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})으로 보지 않았습니다 — ` +
        `${MULTI_HOUSE.LONG_TERM_RENTAL_VOLUNTARY_CANCEL_BASIS}는 말소 후 1년 이내에 그 주택을 양도하는 경우만 정하고, 다른 주택을 양도할 때 장기임대주택으로 보는지는 해석을 확인하지 못했습니다(확인 필요).`
      : `${houseLabel(h.id)}: 임대사업자 등록이 말소됐는데 말소 사유를 고르지 않아 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})으로 보지 않았습니다 — ` +
        `임대의무기간이 끝난 날 자동말소(${RENTAL_REGISTRATION_4HO.AUTO_CANCELLATION})됐다면 「자동말소」를 고르세요. ${MULTI_HOUSE.LONG_TERM_RENTAL_AUTO_CANCEL_PROVISO}에 따라 임대기간요건을 갖춘 것으로 봅니다(확인 필요).`,
  );
}
