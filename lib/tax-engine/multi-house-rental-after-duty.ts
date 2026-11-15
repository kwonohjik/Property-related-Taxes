/**
 * 다주택 중과 — 임대의무기간이 지난 후 등록 말소를 신청한 장기임대주택(민간임대주택에 관한 특별법 §6①3호 후단).
 * 계획서 `docs/00-pm/surcharge-rental-cancel-after-duty.plan.md`. 의존: -count → 이 파일 → -exclusion(단방향).
 */
import { isLongTermRentalHousingExempt } from "./multi-house-surcharge-count";
import { getRentalTypeLabel } from "./multi-house-surcharge-count";
import { rentalCancellationStatus } from "./rental-cancellation-deeming";
import { isSeparateHouseholdGiftOfCancelledRental } from "./rental-cancellation-deeming";
import { differs } from "./rental-cancellation-deeming";
import { houseLabel } from "./rental-cancellation-deeming";
import { MULTI_HOUSE } from "./legal-codes";
import { RENTAL_REGISTRATION_4HO } from "./legal-codes";
import type {
  HouseInfo,
  MultiHouseSurchargeInput,
  MultiHouseSurchargeResult,
  RentalHousingType,
} from "./types/multi-house-surcharge.types";

/** 해석례 3건이 다룬 목 — 가목(3076) · 다목(536) · 마목(1329) */
const RULED_TYPES: ReadonlySet<RentalHousingType> = new Set(["A", "C", "E"]);
const RULINGS = "기획재정부 재산세제과-536 · 서면-2022-법규재산-3076 · 서면-2023-부동산-1329";

/**
 * 임대의무기간이 지난 후 등록 말소를 신청한(민특법 §6①3호 후단) 장기임대주택을 **그 주택으로 양도**할 때 중과배제하는가.
 *
 * 기획재정부 재산세제과-536(다목) · 서면-2022-법규재산-3076(가목) · 서면-2023-부동산-1329(마목): 해당 목의 임대기간요건 등을 갖춘 뒤
 * 말소를 신청해 양도일 현재 말소 상태여도, 말소 뒤 임대하지 않아도 배제한다. 요건은 등록 중이던 주택과 같이 판정하되 임대기간의
 * 종점은 말소일이다(§167의3③ 「사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터」 — 말소 뒤는 등록 임대가 아니다).
 * 사목은 11호(의무기간 내 말소) 전용이라 빼고, S-4(별도세대 증여 전 말소)는 말소 사실 그대로 먼저 본다.
 */
export function isAfterDutyCancelledRentalExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isLongTermRental || house.rentalType === "G") return false;
  if (rentalCancellationStatus(house, transferDate) !== "after_duty") return false;
  if (isSeparateHouseholdGiftOfCancelledRental(house)) return false;
  return isLongTermRentalHousingExempt(asRegisteredUntilCancellation(house), transferDate);
}

/** 말소 전 등록 상태로 읽은 같은 주택 — 임대기간 종점만 말소일(먼저 끝난 임대 종료일이 있으면 그날). */
function asRegisteredUntilCancellation(house: HouseInfo): HouseInfo {
  const cancelled = house.rentalCancelledDate;
  if (!cancelled) return house;
  const end = house.rentalEndDate && house.rentalEndDate.getTime() < cancelled.getTime() ? house.rentalEndDate : cancelled;
  return { ...house, rentalCancelledDate: undefined, rentalCancellationReason: undefined, rentalEndDate: end };
}

/** 양도 주택 배제 사유 줄 — 해석례가 다루지 않은 목(나·라·바·아·자목·유형 미선택)이면 확인 필요를 붙인다. */
export function afterDutyExclusionDetail(house: HouseInfo, basis: string): string {
  const head =
    `임대의무기간이 지난 후 등록 말소를 신청(${RENTAL_REGISTRATION_4HO.AFTER_DUTY_CANCELLATION})한 장기임대주택 양도 — ` +
    `해당 목의 요건을 말소일까지 갖춰 말소 뒤 임대하지 않아도 배제합니다(${RULINGS}) (${basis})`;
  if (house.rentalType && RULED_TYPES.has(house.rentalType)) return head;
  const what = house.rentalType ? getRentalTypeLabel(house.rentalType) : "유형을 고르지 않은 임대주택";
  return `${head}. ${what}을(를) 직접 다룬 해석은 확인하지 못했습니다(확인 필요).`;
}

/**
 * 확인 필요 고지 — 결론을 가를 때만(반사실 재계산 · `rentalCancellationNotices`와 같은 방식).
 * - 다른 주택 양도: 의무기간 후 말소 주택을 장기임대주택으로 보지 않았다(해석 0건 · 사용자 결정 2026-11-16).
 * - 양도 주택 자진말소·미선택: 의무기간 후 말소 신청이었다면 그 사유를 고르면 배제될 수 있다.
 */
export function afterDutyCancellationNotices(
  input: MultiHouseSurchargeInput,
  result: MultiHouseSurchargeResult,
  recompute: (alt: MultiHouseSurchargeInput) => MultiHouseSurchargeResult,
): string[] {
  const T = input.transferDate;
  const notices: string[] = [];
  const others = input.houses.filter((h) => h.id !== input.sellingHouseId && isAfterDutyCancelledRentalExempt(h, T));
  if (others.length > 0) {
    const alt = recompute({
      ...input,
      houses: input.houses.map((h) => (others.includes(h) ? asRegisteredUntilCancellation(h) : h)),
    });
    if (differs(result, alt)) {
      for (const h of others) {
        notices.push(
          `${houseLabel(h.id)}: 임대의무기간이 지난 후 등록 말소를 신청(${RENTAL_REGISTRATION_4HO.AFTER_DUTY_CANCELLATION})한 임대주택은 그 주택을 양도할 때 ` +
            `장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})으로 보는 해석(${RULINGS})만 있어, 다른 주택을 양도하는 이번 판정에서는 ` +
            "장기임대주택으로 보지 않았습니다 — 이 경우를 다룬 해석은 확인하지 못했습니다(확인 필요).",
        );
      }
    }
  }
  const selling = input.houses.find((h) => h.id === input.sellingHouseId);
  if (
    selling &&
    selling.rentalCancellationReason !== "after_duty" &&
    selling.rentalCancellationReason !== "auto" &&
    rentalCancellationStatus(selling, T) === "not_deemed" &&
    isAfterDutyCancelledRentalExempt({ ...selling, rentalCancellationReason: "after_duty" }, T)
  ) {
    const altSelling = { ...selling, rentalCancellationReason: "after_duty" as const };
    const alt = recompute({ ...input, houses: input.houses.map((h) => (h === selling ? altSelling : h)) });
    if (differs(result, alt)) {
      notices.push(
        `${houseLabel(selling.id)}: 임대의무기간이 지난 뒤 등록 말소를 신청했다면(${RENTAL_REGISTRATION_4HO.AFTER_DUTY_CANCELLATION}) 말소 사유에서 ` +
          `「의무기간 후 말소 신청」을 고르세요 — 해당 목의 요건을 말소일까지 갖춘 장기임대주택을 양도하면 중과세율을 적용하지 않습니다(${RULINGS}).`,
      );
    }
  }
  return notices;
}
