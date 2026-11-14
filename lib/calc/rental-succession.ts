/**
 * §155⑳ 임대사업 승계(G-3·G-5) — 임대주택 카드 호의 **실효 등록 기준**·증여자 입력 범위의 단일 술어 (계획서 PR-2).
 *
 * ⑤ 노출 · ④ 전송 · ⑧ 검증이 같은 술어를 쓴다(3중 패턴). 목 판정 4곳(`RentalUnitCard` 파생 · `apt-deadline-extension-scope` ·
 * `rental-unit-termination-scope` · `transfer-tax-validate-rental-exception`)이 모두 `rentalUnitRegApplicationDate`를 거친다 —
 * 엔진 `registrationBasis`(증여면 증여자 등록 3필드)와 같은 규칙이다.
 *
 * 증여 승계인데 증여자 날짜가 비어 있으면 **본인 날짜로 대신하지 않는다**(자동 대체 금지) — 목은 날짜 없음으로 도출되고(기존 빈 날짜와 같다)
 * ⑧이 증여자 날짜를 요구해 막는다.
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

/** 같은 세대원 증여(포괄승계)인가 — 증여자 입력 노출(⑤)·전송(④)·검증(⑧)의 단일 술어 */
export function rentalUnitDonorRegistrationInScope(u: Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental"> | undefined): boolean {
  return !!u && rentalSuccessionOf(u) === "household_gift";
}

/** 목·의무기간·기한 판정의 등록 3필드(YYYY-MM-DD 문자열, 없으면 "") — 증여면 증여자, 아니면 본인(엔진 `registrationBasis`와 같은 규칙) */
export function rentalUnitRegistrationBasis(u: Partial<SuccessionFacts>): {
  businessRegistrationDate: string;
  rentalRegistrationDate: string;
  rentalRegisteredDate: string;
} {
  if (rentalUnitDonorRegistrationInScope(u)) {
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
