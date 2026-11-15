/**
 * §155⑳ 임대사업 승계(G-3·G-5) — 임대주택 카드 호의 **실효 등록 기준**·증여자 입력 범위의 단일 술어 (계획서 PR-2).
 *
 * ⑤ 노출 · ④ 전송 · ⑧ 검증이 같은 술어를 쓴다(3중 패턴). 목 판정 4곳(`RentalUnitCard` 파생 · `apt-deadline-extension-scope` ·
 * `rental-unit-termination-scope` · `transfer-tax-validate-rental-exception`)이 모두 `rentalUnitRegApplicationDate`를 거친다 —
 * 엔진 `registrationBasis`(증여면 증여자 등록 3필드)와 같은 규칙이다.
 *
 * 증여 승계인데 증여자 날짜가 비어 있으면 **본인 날짜로 대신하지 않는다**(자동 대체 금지) — 목은 날짜 없음으로 도출되고(기존 빈 날짜와 같다)
 * ⑧이 증여자 날짜를 요구해 막는다. 상속은 피상속인 날짜가 선택이다 — 비우면 상속인 본인 날짜(종전 동작)이고 엔진이 확인 필요를 고지한다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { deriveRegApplicationDate } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { rentalSuccessionOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

type SuccessionFacts = Pick<
  RentalUnitForm,
  | "rentalSuccession"
  | "isInheritedRental"
  | "businessRegistrationDate"
  | "rentalRegistrationDate"
  | "rentalRegisteredDate"
  | "donorBusinessRegistrationDate"
  | "donorRentalRegistrationDate"
  | "donorRentalRegisteredDate"
>;

/**
 * 전 임대사업자(증여자·피상속인) 등록일 칸을 여는가 — ⑤ 노출·④ 전송의 단일 술어.
 * 같은 세대원 증여(포괄승계 — 재산세제과-1591)와 상속(서면-2020-법규재산-1959 유추 · ⑳ 직접 해석 없음)만. 포괄양수는 본인 등록(Q-5).
 */
export function rentalUnitDonorRegistrationInScope(u: Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental"> | undefined): boolean {
  const kind = u ? rentalSuccessionOf(u) : "";
  return kind === "household_gift" || kind === "inheritance";
}

/** 전 임대사업자 등록일이 **필수**인가 — 증여만(G-3). 상속은 선택 칸이라 비우면 상속인 본인 등록일로 판정한다(⑧). */
export function rentalUnitDonorRegistrationRequired(u: Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental"> | undefined): boolean {
  return !!u && rentalSuccessionOf(u) === "household_gift";
}

/**
 * 목 판정에 전 임대사업자 등록일을 쓰는가 — 증여는 언제나(비면 ⑧이 막는다), 상속은 피상속인 사업자등록일·신청일을 **둘 다** 넣었을 때만
 * (④가 `donorRegistration`을 보내는 조건과 같다 — 엔진 `registrationBasis`가 그 값을 쓴다).
 */
export function rentalUnitUsesDonorRegistration(u: Partial<SuccessionFacts>): boolean {
  if (rentalUnitDonorRegistrationRequired(u)) return true;
  return rentalUnitDonorRegistrationInScope(u) && !!u.donorBusinessRegistrationDate && !!u.donorRentalRegistrationDate;
}

/** 목·의무기간·기한 판정의 등록 3필드(YYYY-MM-DD 문자열, 없으면 "") — 증여면 증여자, 상속은 피상속인 날짜를 넣었으면 피상속인, 아니면 본인(엔진 `registrationBasis`와 같은 규칙) */
export function rentalUnitRegistrationBasis(u: Partial<SuccessionFacts>): {
  businessRegistrationDate: string;
  rentalRegistrationDate: string;
  rentalRegisteredDate: string;
} {
  if (rentalUnitUsesDonorRegistration(u)) {
    return {
      businessRegistrationDate: u.donorBusinessRegistrationDate ?? "",
      rentalRegistrationDate: u.donorRentalRegistrationDate ?? "",
      rentalRegisteredDate: u.donorRentalRegisteredDate ?? "",
    };
  }
  return {
    businessRegistrationDate: u.businessRegistrationDate ?? "",
    rentalRegistrationDate: u.rentalRegistrationDate ?? "",
    rentalRegisteredDate: u.rentalRegisteredDate ?? "",
  };
}

/**
 * 호의 목 도출용 「지자체 등록 신청일」(실효 등록 기준) — 엔진 `deriveRegApplicationDate(registrationBasis(unit))`와 같다.
 * 세무서·지자체 신청일 중 하나라도 비면 null(등록 완비 아님).
 */
export function rentalUnitRegApplicationDate(u: Partial<SuccessionFacts>): Date | null {
  const b = rentalUnitRegistrationBasis(u);
  const business = toOptionalDate(b.businessRegistrationDate);
  const application = toOptionalDate(b.rentalRegistrationDate);
  if (!business || !application) return null;
  return deriveRegApplicationDate({ businessRegistrationDate: business, rentalRegistrationDate: application });
}
