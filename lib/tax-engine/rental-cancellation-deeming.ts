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
 * - **의무기간 후 말소 신청**(§6①3호 후단 「제43조의 임대의무기간이 지난 후 등록 말소를 신청하는 경우」): 단서·사목 어느 것도
 *   아니다. 해당 목의 요건(임대기간은 말소일까지)을 갖춘 주택을 **그 주택으로 양도**하면 중과배제한다(기획재정부 재산세제과-536 다목 ·
 *   서면-2022-법규재산-3076 가목 · 서면-2023-부동산-1329 마목). 다른 주택을 양도할 때는 해석이 없어 보지 않는다
 *   (사용자 결정 2026-11-16 · 확인 필요 고지 `afterDutyCancellationNotices`). 판정은 `isAfterDutyCancelledRentalExempt`.
 *
 * 자동말소는 법률 제17482호(2020.8.18. 시행)로 생겼다. 그 전에 임대의무기간이 끝난 주택은 같은 법 부칙 제7조로
 * **2020.8.18.에 말소된 것으로 본다** — 말소 사유 「자동말소」(설명 「임대의무기간 종료일 말소」)에 그 전 날짜를 넣으면
 * 말소일을 2020.8.18.로 읽는다(Q-3). 단서는 이 간주 말소에도 적용된다: 서면-2021-법규재산-6391(→기획재정부 재산세제과-861,
 * 2022.8.1.) 사실관계 「2003.03. 단기 등록 → 2020.08.18. 자동말소」에 「각목 외 부분 단서에 따라 중과배제 적용 가능」.
 * 양도일이 2020.8.18. 전이면 양도 당시 등록은 살아 있었다(`none`). §155⑳ 쪽 같은 간주는 `effectiveCancellationDate`.
 *
 * **2020.8.18. 전 멸실**(V-10 후속 · 사용자 결정 2026-11-16 「카드 답만 중과에 전달」): 서면-2022-법규재산-3118(→ 기획재정부
 * 조세정책과-2231, 2024.12.9.)은 2020.8.18. 전에 재건축으로 멸실된 임대주택을 부칙 제7조에 따라 자동말소된 것으로 볼 수 없다고 했다
 * (§155㉓ 질의). 단서도 같은 간주 말소에 기대므로(6391 → 861) ⑳ 카드에서 멸실 「예」로 답한 호는 `not_deemed`로 본다 — 중과 단서를
 * 직접 다룬 해석은 확인하지 못해 확인 필요 고지(`addenda7DeemedCancellationNotices`). 명부 행은 묻지 않고 고지만 덧붙인다.
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
 * - `after_duty`: 의무기간 후 말소 신청(§6①3호) — 그 주택 양도에서만 장기임대주택(`isAfterDutyCancelledRentalExempt`)
 */
export type RentalCancellationStatus = "none" | "auto_deemed" | "not_deemed" | "after_duty";

/** 법률 제17482호 부칙 제7조 — 자동말소인데 입력 말소일(= 임대의무기간 종료일)이 2020.8.18. 전이면 2020.8.18. 말소로 본다. */
export function isAddenda7DeemedCancellation(house: HouseInfo): boolean {
  const cancelled = house.rentalCancelledDate;
  return house.rentalCancellationReason === "auto" && !!cancelled && cancelled.getTime() < RA_CUT.Y2020_08_18;
}

/** 판정에 쓰는 말소일(ms) — 부칙 제7조 간주가 걸리면 2020.8.18., 아니면 입력 그대로. 말소일이 없으면 undefined. */
export function effectiveRentalCancelledTs(house: HouseInfo): number | undefined {
  if (!house.rentalCancelledDate) return undefined;
  return isAddenda7DeemedCancellation(house) ? RA_CUT.Y2020_08_18 : house.rentalCancelledDate.getTime();
}

/** V-10 후속 — 부칙 제7조 간주 대상인데 2020.8.18. 전에 멸실됐다고 답한 호(⑳ 카드 답 · 3118 · 2231). */
export function isPreAddendaDemolishedCancellation(house: HouseInfo): boolean {
  return isAddenda7DeemedCancellation(house) && house.preAddendaDemolished === true;
}

export function rentalCancellationStatus(house: HouseInfo, transferDate: Date): RentalCancellationStatus {
  const cancelledTs = effectiveRentalCancelledTs(house);
  if (cancelledTs === undefined || cancelledTs > transferDate.getTime()) return "none";
  if (house.rentalCancellationReason === "after_duty") return "after_duty";
  if (isPreAddendaDemolishedCancellation(house)) return "not_deemed";
  // 자동말소면 말소일은 늘 2020.8.18. 이후다(그 전 날짜는 위 간주로 2020.8.18.).
  return house.rentalCancellationReason === "auto" && house.rentalType != null && PROVISO_TYPES.has(house.rentalType)
    ? "auto_deemed"
    : "not_deemed";
}

/**
 * 별도세대에서 증여받은 주택의 임대사업자 등록이 **증여 전에** 말소됐는가(S-4 · 교재 329쪽).
 *
 * §167의3①2호는 「사업자등록등을 한 거주자가 민간임대주택으로 등록하여 임대하는」 주택이고, 단서의 간주도 그 등록이
 * 말소되는 경우다. 증여자가 별도세대면 수증자 세대에는 등록한 사람이 없다 ⇒ 장기임대주택으로 보지 않는다.
 * 동일세대원 증여는 배제를 인정한 해석이 있다(기획재정부 재산세제과-1591 → 서면-2021-법규재산-4283). 별도세대 증여를
 * 정면으로 다룬 해석은 확인하지 못했다(taxlaw 검색 2026-11-15) — 결론이 갈리면 확인 필요 고지(`separateHouseholdGiftNotices`).
 * 말소일이 증여 뒤면 수증자 자신의 등록이 말소된 것이라 이 술어 밖이다.
 */
export function isSeparateHouseholdGiftOfCancelledRental(house: HouseInfo): boolean {
  if (house.rentalGiftDonorHousehold !== "separate") return false;
  const cancelledTs = effectiveRentalCancelledTs(house) ?? house.rentalCancellationDate?.getTime();
  return cancelledTs !== undefined && cancelledTs <= house.acquisitionDate.getTime();
}

export const differs = (a: MultiHouseSurchargeResult, b: MultiHouseSurchargeResult): boolean =>
  a.surchargeApplicable !== b.surchargeApplicable || a.surchargeType !== b.surchargeType;

export const houseLabel = (id: string): string => (id.startsWith("임대주택") ? id : `주택 ${id}`);

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

/** 서면-2022-법규재산-3118 · 기획재정부 조세정책과-2231(2024.12.9.) */
const PRE_ADDENDA_DEMOLITION_RULING = "서면-2022-법규재산-3118(기획재정부 조세정책과-2231, 2024.12.9.)";

/**
 * Q-3 — 부칙 제7조로 말소일을 2020.8.18.로 읽은 장기임대주택을 알린다(결론과 무관하게 · ⑳ 쪽 `deemedAutoCancellationNotice`의 짝).
 */
export function addenda7DeemedCancellationNotices(input: MultiHouseSurchargeInput): string[] {
  return input.houses
    .filter((h) => h.isLongTermRental && isAddenda7DeemedCancellation(h))
    .map((h) => {
      const head =
        `${houseLabel(h.id)}: 임대의무기간이 2020.8.18. 전(${h.rentalCancelledDate!.toISOString().slice(0, 10)})에 끝나 ` +
        `법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조에 따라 2020.8.18.에 등록이 말소된 것으로 봅니다`;
      if (rentalCancellationStatus(h, input.transferDate) === "none") {
        return `${head} — 양도일(${input.transferDate.toISOString().slice(0, 10)})에는 아직 등록 중인 주택으로 판정했습니다.`;
      }
      if (isPreAddendaDemolishedCancellation(h)) {
        return (
          `${houseLabel(h.id)}: 2020.8.18. 전에 재건축·재개발 등으로 멸실된 임대주택이라 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조에 따라 ` +
          `자동말소된 것으로 보지 않아 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})으로 보지 않았습니다 — ` +
          `${PRE_ADDENDA_DEMOLITION_RULING}은 거주주택 비과세(§155㉓) 질의이고, ${MULTI_HOUSE.LONG_TERM_RENTAL_AUTO_CANCEL_PROVISO}에 같은 결론을 적용한 해석은 확인하지 못했습니다(확인 필요).`
        );
      }
      const applied = `${head}. 이 간주 말소에도 ${MULTI_HOUSE.LONG_TERM_RENTAL_AUTO_CANCEL_PROVISO}(임대기간요건을 갖춘 것으로 봄)를 적용했습니다(서면-2021-법규재산-6391 → 기획재정부 재산세제과-861).`;
      // 명부 행은 멸실 여부를 묻지 않는다(⑳ 카드 행은 「아니오」 = false가 온다).
      return h.preAddendaDemolished === undefined
        ? `${applied} 2020.8.18. 전에 재건축·재개발 등으로 멸실된 주택이면 부칙 제7조에 따라 자동말소된 것으로 볼 수 없다는 해석(${PRE_ADDENDA_DEMOLITION_RULING} — §155㉓)이 있어 결론이 달라질 수 있습니다(확인 필요).`
        : applied;
    });
}

/**
 * `isSeparateHouseholdGiftOfCancelledRental`로 장기임대주택에서 뺀 주택이 결론을 가를 때만 알린다(위와 같은 반사실 재계산).
 */
export function separateHouseholdGiftNotices(
  input: MultiHouseSurchargeInput,
  result: MultiHouseSurchargeResult,
  recompute: (alt: MultiHouseSurchargeInput) => MultiHouseSurchargeResult,
): string[] {
  const targets = input.houses.filter((h) => h.isLongTermRental && isSeparateHouseholdGiftOfCancelledRental(h));
  if (targets.length === 0) return [];
  const alt = recompute({
    ...input,
    houses: input.houses.map((h) => (targets.includes(h) ? { ...h, rentalGiftDonorHousehold: undefined } : h)),
  });
  if (!differs(result, alt)) return [];
  return targets.map(
    (h) =>
      `${houseLabel(h.id)}: 별도세대에서 증여받기 전에 증여자의 임대사업자 등록이 말소된 주택이라 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})으로 보지 않았습니다 — ` +
      `이 규정은 「사업자등록등을 한 거주자가 … 등록하여 임대하는」 주택이고, 수증자 세대에는 등록한 사람이 없습니다. ` +
      `동일세대원에게 증여받은 경우는 중과배제를 인정한 해석이 있으나(기획재정부 재산세제과-1591), 별도세대 증여를 직접 다룬 해석은 확인하지 못했습니다(확인 필요).`,
  );
}
