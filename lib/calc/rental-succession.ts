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

/**
 * 전 임대사업자(증여자·피상속인) 등록 3칸을 받는가 — 노출(⑤)·전송(④)의 단일 술어.
 * 같은 세대원 증여(G-3 · 필수)와 상속(선택 — 사용자 결정 2026-11-15 · 서면-2020-법규재산-1959·재산세제과-1591 유추)만.
 */
export function rentalUnitDonorRegistrationInScope(u: Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental"> | undefined): boolean {
  if (!u) return false;
  const k = rentalSuccessionOf(u);
  return k === "household_gift" || k === "inheritance";
}

/** 전 임대사업자 등록 3칸이 필수인가 — 증여만(⑧). 상속은 비우면 상속인 본인 등록으로 판정한다. */
export function rentalUnitDonorRegistrationRequired(u: Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental"> | undefined): boolean {
  return !!u && rentalSuccessionOf(u) === "household_gift";
}

/**
 * 목·기한 판정을 전 임대사업자 등록으로 하는가 — 증여는 항상(비면 날짜 없음 → ⑧ 차단), 상속은 사업자등록일·신청일을 다 넣었을 때만.
 * ④가 `donorRegistration`을 싣는 조건 · 엔진 `registrationBasis`(값이 오면 그것)와 같다.
 */
export function rentalUnitPredecessorBasisApplied(
  u: Partial<Pick<RentalUnitForm, "rentalSuccession" | "isInheritedRental" | "donorBusinessRegistrationDate" | "donorRentalRegistrationDate">>,
): boolean {
  if (rentalUnitDonorRegistrationRequired(u)) return true;
  return rentalUnitDonorRegistrationInScope(u) && !!u.donorBusinessRegistrationDate && !!u.donorRentalRegistrationDate;
}

/** 목·의무기간·기한 판정의 등록 3필드(YYYY-MM-DD 문자열, 없으면 "") — 증여면 증여자, 상속은 피상속인 날짜를 다 넣었으면 피상속인, 아니면 본인(엔진 `registrationBasis`와 같은 규칙) */
export function rentalUnitRegistrationBasis(u: Partial<SuccessionFacts>): {
  businessRegistrationDate: string;
  rentalRegistrationDate: string;
  rentalRegisteredDate: string;
} {
  if (rentalUnitPredecessorBasisApplied(u)) {
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
