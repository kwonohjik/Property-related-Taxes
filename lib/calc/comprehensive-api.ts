/**
 * 종합부동산세 클라이언트 ↔ API 변환 (동기화 지점 ④⑬)
 *
 * page.tsx 인라인 callComprehensiveApi를 순수 이동 (800줄 정책 — Phase B 선행 분리).
 * 폼 문자열 → 엔진 입력 숫자 변환 + fetch body 구성.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";

// 임대주택 합산배제 유형 (rentalInfo 필드 구성에 사용)
const RENTAL_TYPES = new Set([
  "private_construction_rental",
  "private_purchase_rental_long",
  "private_purchase_rental_short",
  "public_support_rental",
  "public_construction_rental",
  "public_purchase_rental",
]);

// 기타 합산배제 유형 (otherInfo 필드 구성에 사용)
const OTHER_INFO_TYPES = new Set([
  "unsold_housing",
  "daycare_housing",
  "employee_housing",
]);

// store의 exclusionType → validator의 registrationType 매핑
// (임대주택 합산배제 신청 시 UI 선택값을 API 검증 스키마 값으로 변환)
function toRegistrationType(exclusionType: string): string {
  const map: Record<string, string> = {
    private_construction_rental: "private_construction",
    private_purchase_rental_long: "private_purchase_long",
    private_purchase_rental_short: "private_purchase_short",
    public_support_rental: "public_support",
    public_construction_rental: "public_construction",
    public_purchase_rental: "public_purchase",
  };
  return map[exclusionType] ?? "private_purchase_long";
}

export async function callComprehensiveApi(
  formData: ComprehensiveFormData,
): Promise<ComprehensiveTaxResult> {

  const properties = formData.properties.map((p) => {
    const base = {
      propertyId: p.id,
      assessedValue: parseAmount(p.assessedValue),
      area: p.area ? parseFloat(p.area) : undefined,
      location: p.location,
      exclusionType: p.exclusionType !== "none" ? p.exclusionType : undefined,
    };

    // 임대주택 합산배제 상세
    if (RENTAL_TYPES.has(p.exclusionType)) {
      const registrationType = p.rentalRegistrationType || toRegistrationType(p.exclusionType);
      return {
        ...base,
        rentalInfo: {
          registrationType,
          rentalRegistrationDate: p.rentalRegistrationDate || `${formData.assessmentYear}-01-01`,
          rentalStartDate: p.rentalStartDate || `${formData.assessmentYear}-01-01`,
          assessedValue: base.assessedValue,
          area: p.area ? parseFloat(p.area) : 60,
          location: p.location,
          previousRent: p.previousRent ? parseAmount(p.previousRent) : undefined,
          currentRent: parseAmount(p.currentRent),
          isInitialContract: p.isInitialContract,
          actualRentalYears: p.actualRentalYears ? parseDecimal(p.actualRentalYears) : undefined,
          registrationRevokedDate: p.registrationRevokedDate || undefined,
        },
      };
    }

    // 기타 합산배제 상세
    if (OTHER_INFO_TYPES.has(p.exclusionType)) {
      return {
        ...base,
        otherInfo: {
          recruitmentNoticeDate: p.recruitmentNoticeDate || undefined,
          acquisitionDate: p.acquisitionDate || undefined,
          isFirstSale: p.isFirstSale,
          hasDaycarePermit: p.hasDaycarePermit,
          isActuallyUsedAsDaycare: p.isActuallyUsedAsDaycare,
          isProvidedToEmployee: p.isProvidedToEmployee,
          rentalFeeRate: p.rentalFeeRate ? parseFloat(p.rentalFeeRate) / 100 : undefined,
        },
      };
    }

    return base;
  });

  // 종합합산 토지
  const landAggregate =
    formData.hasAggregateLand && parseAmount(formData.landAggregate.totalOfficialValue) > 0
      ? {
          totalOfficialValue: parseAmount(formData.landAggregate.totalOfficialValue),
          propertyTaxBase: parseAmount(formData.landAggregate.propertyTaxBase),
          propertyTaxAmount: parseAmount(formData.landAggregate.propertyTaxAmount),
          previousYearTotalTax: formData.landAggregate.previousYearTotalTax
            ? parseAmount(formData.landAggregate.previousYearTotalTax) || undefined
            : undefined,
        }
      : undefined;

  // 별도합산 토지
  const landSeparate =
    formData.hasSeparateLand && formData.landSeparate.length > 0
      ? formData.landSeparate
          .filter((l) => parseAmount(l.publicPrice) > 0)
          .map((l) => ({
            landId: l.id,
            publicPrice: parseAmount(l.publicPrice),
            propertyTaxBase: parseAmount(l.propertyTaxBase),
            propertyTaxAmount: parseAmount(l.propertyTaxAmount),
          }))
      : undefined;

  const body = {
    assessmentYear: parseInt(formData.assessmentYear) || new Date().getFullYear(),
    isOneHouseOwner: formData.isOneHouseOwner,
    birthDate: formData.birthDate || undefined,
    acquisitionDate: formData.acquisitionDate || undefined,
    previousYearTotalTax: formData.previousYearTotalTax
      ? parseAmount(formData.previousYearTotalTax) || undefined
      : undefined,
    properties,
    landAggregate,
    landSeparate,
    isMultiHouseInAdjustedArea: formData.isMultiHouseInAdjustedArea,
  };

  const res = await fetch("/api/calc/comprehensive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? "계산 요청 실패");
  }
  return json.data as ComprehensiveTaxResult;
}
