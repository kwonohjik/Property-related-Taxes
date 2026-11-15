/**
 * Q-8 — 다주택 중과 장기임대주택(소득세법 시행령 §167의3①2호)의 임대사업 승계(명부 행·양도 주택 2호 선언 공용).
 * 계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` Q-8.
 *
 * - 상속: 피상속인이 2018.3.31. 이전에 사업자등록등을 했으면 가목(서면-2020-법규재산-1959 질의1) → 목·등록기한은 피상속인 날짜.
 * - 동일세대원 증여(포괄승계): 요건은 1세대 기준(기준-2020-법령해석재산-0296 · 기획재정부 재산세제과-1591) → 증여자 날짜.
 *   등록기한을 증여자 기준으로 본 정면 해석은 확인하지 못했다 — 확인 필요 고지(사용자 결정 2026-11-15).
 * - 포괄양수(그 밖): 전 임대사업자 개월만 더한다(사목 1/2 — 기준-2021-법무재산-0225). 목·등록기한은 본인 날짜 + 확인 필요.
 *
 * 등록 완비(양도일 현재 등록 — `hasBasicRegistration`)·임대기간 기산(§167의3③)은 본인 날짜 그대로다(⑳ D10과 같은 축).
 */
import { MULTI_HOUSE } from "./legal-codes";
import type { HouseInfo, MultiHouseSurchargeInput } from "./types/multi-house-surcharge.types";

type RegistrationDates = Pick<HouseInfo, "businessRegistrationDate" | "rentalRegistrationDate" | "rentalRegisteredDate">;

/** 목·등록기한 판정의 등록 3필드 — 승계 등록(피상속인·증여자)이 있으면 그 날짜, 없으면 본인 날짜 */
export function houseRegistrationBasis(house: HouseInfo): RegistrationDates {
  const p = house.predecessorRegistration;
  if (p) return { businessRegistrationDate: p.businessRegistrationDate, rentalRegistrationDate: p.rentalRegistrationDate, rentalRegisteredDate: p.rentalRegisteredDate };
  return {
    businessRegistrationDate: house.businessRegistrationDate,
    rentalRegistrationDate: house.rentalRegistrationDate,
    rentalRegisteredDate: house.rentalRegisteredDate,
  };
}

const ymd = (d: Date | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const label = (id: string) => (id.startsWith("임대주택") ? id : `주택 ${id}`);

/** 승계 사실을 어떻게 읽었는지 알린다(결론과 무관하게 — 사용자가 선언한 행마다 한 줄). */
export function rentalSuccessionNotices(input: MultiHouseSurchargeInput): string[] {
  return input.houses
    .filter((h) => h.isLongTermRental && h.rentalSuccession)
    .map((h) => {
      const months = h.decedentRentalMonths ? ` 전 임대사업자 임대기간 ${h.decedentRentalMonths}개월을 더했습니다.` : "";
      const p = h.predecessorRegistration;
      const reg = p ? `(사업자등록 ${ymd(p.businessRegistrationDate)} · 임대사업자 등록 신청 ${ymd(p.rentalRegistrationDate)})` : "";
      switch (h.rentalSuccession) {
        case "inheritance":
          return p
            ? `${label(h.id)}: 상속받아 계속 임대하는 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})이라 목·등록기한을 피상속인 등록${reg}으로 판정했습니다(서면-2020-법규재산-1959).${months}`
            : `${label(h.id)}: 상속받아 계속 임대하는 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})인데 피상속인 등록일을 넣지 않아 목·등록기한을 상속인 본인 등록일로 판정했습니다.${months} ` +
                `피상속인이 2018.3.31. 이전에 사업자등록등을 했다면 가목을 적용하므로(서면-2020-법규재산-1959) 피상속인 등록일을 넣으세요(확인 필요).`;
        case "household_gift":
          return (
            `${label(h.id)}: 동일세대원에게 증여받아 임대사업자 지위를 승계한 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS})이라 목·등록기한을 증여자 등록${reg}으로 판정했습니다.${months} ` +
            `요건을 1세대 기준으로 본 해석(기준-2020-법령해석재산-0296 · 기획재정부 재산세제과-1591)에 따른 것이고, 등록기한을 증여자 기준으로 본 정면 해석은 확인하지 못했습니다(확인 필요).`
          );
        default:
          return (
            `${label(h.id)}: 포괄양수한 장기임대주택(${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS}) —${months || " 전 임대사업자 임대기간을 입력하지 않았습니다."} ` +
            `목·등록기한은 본인 등록일로 판정했습니다 — 전 임대사업자 기준으로 볼 근거는 확인하지 못했습니다(확인 필요 · 임대기간 합산은 기준-2021-법무재산-0225).`
          );
      }
    });
}
