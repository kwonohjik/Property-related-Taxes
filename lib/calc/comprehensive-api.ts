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

  // ④ 법인 여부 파생 — 법인은 §8④ 의제 미적용 (3중 패턴: 엔진 1차·API strip 2차)
  const taxpayerType = formData.taxpayerType ?? "individual";
  const isCorporate = taxpayerType !== "individual";

  const properties = formData.properties.map((p) => {
    // §8④ 유형: 법인 시 strip. "none"은 undefined로 (엔진 기본값과 일치)
    const s84Type =
      !isCorporate && p.section8para4Type && p.section8para4Type !== "none"
        ? p.section8para4Type
        : undefined;
    const base = {
      propertyId: p.id,
      assessedValue: parseAmount(p.assessedValue),
      area: p.area ? parseFloat(p.area) : undefined,
      location: p.location,
      exclusionType: p.exclusionType !== "none" ? p.exclusionType : undefined,
      section8para4Type: s84Type,
      // §8④ 요건 필드 — Zod 검증 통과용 (엔진 미사용). 4호는 요건 입력 없음
      newHouseAcquisitionDate:
        s84Type === "temporary_two_house" && p.newHouseAcquisitionDate
          ? p.newHouseAcquisitionDate
          : undefined,
      inheritanceOpenDate:
        s84Type === "inherited_house" && p.inheritanceOpenDate
          ? p.inheritanceOpenDate
          : undefined,
      inheritanceShareRatio:
        s84Type === "inherited_house" && p.inheritanceShareRatio
          ? parseFloat(p.inheritanceShareRatio)
          : undefined,
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

  // 세부담상한 capMode 파생 (3중 패턴)
  const capMode = formData.previousYearCapMode ?? "direct";

  // previousYearAuto: 자동 모드일 때만 구성 (직접 모드는 undefined — 상호배타)
  // 날짜는 문자열 그대로 전송 — route.ts Zod coerceDates가 Date 변환 담당
  const previousYearAuto =
    !isCorporate && capMode === "auto" && formData.previousYearAutoAssessedValue
      ? {
          assessedValue: parseAmount(formData.previousYearAutoAssessedValue),
          isOneHouseOwner: formData.previousYearAutoIsOneHouse,
          // 생년월일·취득일은 기본정보에서 재사용 (중복 입력 금지)
          birthDate: formData.birthDate || undefined,
          acquisitionDate: formData.acquisitionDate || undefined,
        }
      : undefined;

  // taxpayerType·isCorporate는 함수 상단에서 파생 (§8④ strip과 공유 — 3중 일치)
  const body = {
    assessmentYear: parseInt(formData.assessmentYear) || new Date().getFullYear(),
    taxpayerType,                                         // ⑬ body spread
    // 법인 시 명시 strip (엔진 무시가 1차 방어, API strip이 2차 — 3중 패턴)
    isOneHouseOwner: isCorporate ? false : formData.isOneHouseOwner,
    // isJointOwnershipSpecialCase: 법인 시 strip — Zod refine이 3차 차단 (상호배타: isOneHouseOwner && isJointOwnershipSpecialCase)
    isJointOwnershipSpecialCase: isCorporate
      ? false
      : (formData.isJointOwnershipSpecialCase ?? false),  // ③ normalize fallback (3중 일치)
    birthDate: isCorporate ? undefined : formData.birthDate || undefined,
    acquisitionDate: isCorporate ? undefined : formData.acquisitionDate || undefined,
    // 직접 모드 시만 previousYearTotalTax 전송, 자동 모드 시 strip (Zod 상호배타)
    previousYearTotalTax:
      capMode === "direct" && formData.previousYearTotalTax
        ? parseAmount(formData.previousYearTotalTax) || undefined
        : undefined,
    // 자동 모드 시만 previousYearAuto 전송 (⑬ body spread)
    previousYearAuto,
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
