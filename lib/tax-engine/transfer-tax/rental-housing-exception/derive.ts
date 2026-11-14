/**
 * §155⑳ 임대주택 호 파생 함수 — 등록기준일·목·의무기간·기준시가 상한·임대 구분 활성 (`eligibility.ts`에서 분리, 2026-11-14 PR-0 · 동작 불변).
 * UI(⑤)·validate(⑧)가 `eligibility.ts` 재수출로 그대로 import한다 — 판정 규칙 단일 소스.
 */

import { rentalStdPriceCap, rentalRequiredYears, RA_CUT } from "../../rental-article/rules";
import { isApartmentRestrictedForArticle } from "../../rental-article/check";
import { registeredDateOf } from "../../rental-article/registered-date";
import type { RentalUnitInput, RentalCategory, RentalArticle, RegionType } from "./types";

// ============================================================
// 날짜 경계 상수 (§167조의3①2호·§155⑳)
// ============================================================

const CUT_2020_07_11 = new Date("2020-07-11").getTime();

// ============================================================
// 파생 함수 (단일 소스 — UI·validate 재사용)
// ============================================================

/**
 * 목·의무기간·기준시가 상한·등록 기한·㉓ 대상 목·최초 말소일 판정에 쓰는 **등록 3필드의 단일 소스** (G-3 · 계획서 PR-2).
 * 같은 세대원 증여(포괄승계)면 증여자 등록(`donorRegistration`), 아니면 본인 등록. 「양도일 현재」 등록(D10 · §155⑳2호)은
 * 수증자 본인이 양도일에 등록·임대 중이어야 하므로 이 함수를 거치지 않고 본인 값을 그대로 본다.
 * 포괄양수(타 세대)는 증여자 값이 없어 본인 등록을 쓴다 — 목 판정 근거는 해석례 미확보(결과 고지 「확인 필요」).
 */
export function registrationBasis(
  unit: Pick<RentalUnitInput, "businessRegistrationDate" | "rentalRegistrationDate" | "rentalRegisteredDate" | "donorRegistration">,
): Pick<RentalUnitInput, "businessRegistrationDate" | "rentalRegistrationDate" | "rentalRegisteredDate"> {
  const b = unit.donorRegistration ?? unit;
  return {
    businessRegistrationDate: b.businessRegistrationDate,
    rentalRegistrationDate: b.rentalRegistrationDate,
    rentalRegisteredDate: b.rentalRegisteredDate,
  };
}

/**
 * 등록기준일 = max(세무서 §168, 지자체 민특법§5 **등록일**) — 둘 중 늦은 날(지자체 등록일 미입력이면 신청일 — V-3).
 * 두 등록이 모두 완료된 날 = "사업자등록등" 완비일 = 임대개시 가능 시점.
 * 하나라도 미입력(Invalid Date)이면 null 반환 → 상위에서 BOTH_REG_REQUIRED로 배제.
 */
export function deriveEffectiveRegDate(
  unit: Pick<RentalUnitInput, "businessRegistrationDate" | "rentalRegistrationDate" | "rentalRegisteredDate">,
): Date | null {
  const bTs = unit.businessRegistrationDate?.getTime?.();
  const rTs = registeredDateOf(unit.rentalRegisteredDate, unit.rentalRegistrationDate)?.getTime?.();
  if (bTs == null || rTs == null || Number.isNaN(bTs) || Number.isNaN(rTs)) return null;
  return new Date(Math.max(bTs, rTs));
}

/**
 * 지자체 임대사업자등록 **신청일** — 목 도출(가/마·다/바 2020.7.11.)·마목 2) 아파트 제한·마·바목 의무기간(2020.8.18.)의 기준.
 * ⑳ 본문 「2020년 7월 10일 이전에 … 임대사업자등록 신청 … 을 한 주택으로 한정」·§167의3①2호 마목 2)·부칙<제31083호> 제5조가
 * 모두 「신청」이라 세무서 사업자등록일은 넣지 않는다(사용자 결정 2026-11-04 D-1, `docs/00-pm/rental-155-20-review-fixes.plan.md`).
 * 등록 완비(두 등록 모두 유효)가 아니면 null — `deriveEffectiveRegDate`와 같은 규칙이라 미입력 동작은 종전과 같다.
 */
export function deriveRegApplicationDate(
  unit: Pick<RentalUnitInput, "businessRegistrationDate" | "rentalRegistrationDate">,
): Date | null {
  return deriveEffectiveRegDate(unit) ? unit.rentalRegistrationDate : null;
}

/** 임대 구분(rentalCategory)별 등록시기 활성 판정 결과 (UI disabled·사유 표시용). */
export type CategoryAvailability = { available: boolean; reason?: string };

/**
 * 등록일 2필드로 **결정적으로 배제**되는 임대 구분 유형을 disabled 처리하기 위한 판정.
 * 배제 기준은 `rental-article/check.ts` checkArticleGates의 REG_DATE_GATE와 1:1(단일 소스, RA_CUT 재사용).
 *   - existing_business(나): 지자체 등록일 > 2003.10.29 또는 세무서 등록일 > 2004.6.30(의제 기한) 이면 배제
 *     (`passesExistingBusinessRegGate` — check.ts와 같은 술어. 날짜 하나만 있어도 그 날짜만으로 확정되면 배제)
 *   - short_6y(아·자): 지자체 등록일 < 2025.6.4 이면 배제 (regDateMin — 부칙<제35349호> 제15조② · 세무서 등록일은 보지 않는다)
 * 지자체 날짜는 등록일(V-3) — 미입력이면 신청일.
 * long_general·unsold_08_09(라)·pre_2018(구법)은 등록일 단독 배제 게이트가 없어 항상 활성.
 * 판정 불가(날짜 미입력)면 available=true — 조기 차단 금지(엔진 `?? 0` fail보다 관대·불리 미적용).
 */
export function deriveCategoryAvailability(
  businessRegistrationDate: Date | null,
  rentalApplicationDate: Date | null,
  rentalRegisteredDate?: Date | null,
): Record<RentalCategory, CategoryAvailability> {
  const rentalRegistrationDate = registeredDateOf(rentalRegisteredDate, rentalApplicationDate);
  const bizTs = businessRegistrationDate?.getTime();
  const bizValid = bizTs != null && !Number.isNaN(bizTs);
  // 가드-내로잉: deriveEffectiveRegDate는 non-null Date 2개(types.ts:43,45)를 받으므로
  // Date|null을 직접 넘기면 TS2322. ternary 내부에서 두 값이 Date로 좁혀진다.
  const effRegDate =
    businessRegistrationDate && rentalRegistrationDate
      ? deriveEffectiveRegDate({ businessRegistrationDate, rentalRegistrationDate })
      : null;
  // 아·자 하한은 지자체 등록일 — 엔진 `checkArticleGates` regDateMin과 같은 날(두 등록이 모두 있을 때만 판정)
  const regAppTs = effRegDate && rentalRegistrationDate ? rentalRegistrationDate.getTime() : null;

  // 나목 — 판정 불가(날짜 하나 미입력)는 활성. 엔진 술어(`passesExistingBusinessRegGate`)와 같은 두 경계를 각각 본다(한 날짜만으로 확정되면 배제).
  const rentTs = rentalRegistrationDate?.getTime();
  const rentValid = rentTs != null && !Number.isNaN(rentTs);
  const existingBusinessUnavailable =
    (bizValid && bizTs > RA_CUT.Y2004_06_30) || (rentValid && rentTs > RA_CUT.Y2003_10_29);
  const existingBusiness: CategoryAvailability = existingBusinessUnavailable
    ? { available: false, reason: "기존사업자(나목)는 지자체 임대사업자 등록이 2003.10.29 이전이고 세무서 사업자등록이 2004.6.30까지(2003.10.29 현재 지자체 등록자는 그때까지 한 사업자등록을 지자체 등록일에 한 것으로 봄)인 경우만 해당합니다." }
    : { available: true };

  const short6y: CategoryAvailability =
    regAppTs != null && regAppTs < RA_CUT.Y2025_06_04
      ? { available: false, reason: "단기 6년(아·자목)은 2025.6.4 이후 등록분만 해당합니다." }
      : { available: true };

  return {
    long_general: { available: true },
    short_6y: short6y,
    existing_business: existingBusiness,
    unsold_08_09: { available: true },
    pre_2018: { available: true },
  };
}

/**
 * 도출 엔진 목 (§167조의3①2호 가~자).
 * long_general은 취득방법 × **지자체 등록 신청일** 2020.7.11. 경계로 가/마(매입)·다/바(건설) — `deriveRegApplicationDate`.
 */
export function deriveRentalArticle(
  rentalCategory: RentalCategory,
  acqType: "purchase" | "construction",
  regApplicationDate: Date | null,
): RentalArticle {
  if (rentalCategory === "pre_2018") return "구법";
  if (rentalCategory === "existing_business") return "나"; // 기존사업자 매입임대(취득방법 매입 고정)
  if (rentalCategory === "unsold_08_09") return "라"; // 미분양 매입임대(취득방법 매입 고정)
  if (rentalCategory === "short_6y") return acqType === "construction" ? "자" : "아";
  // long_general
  const regTs = regApplicationDate?.getTime() ?? 0;
  if (acqType === "construction") {
    return regTs < CUT_2020_07_11 ? "다" : "바";
  }
  return regTs < CUT_2020_07_11 ? "가" : "마";
}

/**
 * 도출 목·지자체 등록 신청일에 따른 의무임대기간(년). 공용 `rental-article/rules.ts` 위임(단일 소스).
 */
export function deriveRequiredYears(
  article: RentalArticle,
  regApplicationDate: Date | null,
): number {
  return rentalRequiredYears(article, regApplicationDate?.getTime() ?? 0);
}

/**
 * 도출 목·지역·등록일별 기준시가 상한(원). 공용 `rental-article/rules.ts` 위임(단일 소스).
 * 바목은 지자체 등록일 2025.2.28. 경계로 6억/9억 분기(부칙<제35349호> 제15조① 「등록한」 — V-3, 등록일을 넘긴다).
 */
export function deriveStdPriceCap(
  article: RentalArticle,
  region: RegionType,
  regApplicationDate: Date | null,
): number {
  return rentalStdPriceCap(article, region === "seoul-metro", regApplicationDate?.getTime() ?? 0);
}

/**
 * 아파트 등록 제한 — 공용 `rental-article/check.ts` 위임 재수출(UI·validate 하위호환).
 * 로직 단일 소스는 `isApartmentRestrictedForArticle`(check.ts).
 */
export const isApartmentRestricted = isApartmentRestrictedForArticle;
