/**
 * ④ 장기임대주택 거주주택 비과세 특례 API 변환 헬퍼 (소령 §155⑳).
 *
 * `transfer-tax-api-helpers.ts` 800줄 정책에 따라 분리 (2026-08-23).
 * 옮긴 것은 위치뿐이고 술어·게이트·반환 shape은 그대로다.
 * 종전 import 경로 호환을 위해 helpers가 재export한다 — `transfer-tax-api-gb.ts`와 같은 형태.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { isPhrpStdPriceLinked } from "./transfer-phrp-stdprice-link";
import { deriveRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isRentalHousingExceptionApplicable } from "./rental-housing-exception-scope";

// ─── ④ 장기임대주택 거주주택 비과세 특례 API 변환 헬퍼 (소령 §155⑳) ───

/**
 * AssetForm.rentalHousingException → API payload 변환.
 * applyException=false 또는 rentalUnits 미입력 시 undefined 반환 (⑬ body 미포함).
 * 자동 안분 fallback 금지 — 미입력은 validate에서 차단.
 */
export function toRentalHousingExceptionApi(asset: AssetForm): object | undefined {
  const rh = asset.rentalHousingException;
  if (!rh?.applyException) return undefined;
  /**
   * 🔴 자산 종류 게이트 — ⑤·⑧과 **같은 술어**(3중 패턴, 2026-09-07 UI 리뷰).
   *
   * 종전에는 여기에도 술어가 없어, 임대주택 행이 채워진 채 자산 종류만 바꾸면
   * **주택이 아닌 자산에 §155⑳ 거주주택 비과세가 적용된 payload**가 엔진까지 갔다.
   */
  if (!isRentalHousingExceptionApplicable(asset.assetKind)) return undefined;
  if (!rh.rentalUnits || rh.rentalUnits.length === 0) return undefined;

  return {
    applyException: true,
    scenario: rh.scenario,
    rentalUnits: rh.rentalUnits.map((u) => ({
      businessRegistrationDate: u.businessRegistrationDate
        ? (u.businessRegistrationDate.includes('T') ? u.businessRegistrationDate : `${u.businessRegistrationDate}T00:00:00.000Z`)
        : undefined,
      rentalRegistrationDate: u.rentalRegistrationDate
        ? (u.rentalRegistrationDate.includes('T') ? u.rentalRegistrationDate : `${u.rentalRegistrationDate}T00:00:00.000Z`)
        : undefined,
      rentalCategory: u.rentalCategory,
      rentalAcquisitionType: u.rentalAcquisitionType,
      // boolean 요건 필드는 stale sessionStorage·이력 로드(migrateAsset 우회) 유닛에서 undefined일 수 있어
      // ?? false로 방어 — Zod required boolean 400 차단(false = 요건 미해당, validate의 !u.X와 동일 관용).
      isApartment: u.isApartment ?? false,
      region: u.region,
      isExcluded918Rule: u.isExcluded918Rule ?? false,
      hasContractDepositProof: u.hasContractDepositProof ?? false,
      isExcludedShortToLongChange: u.isExcludedShortToLongChange ?? false,
      standardPriceAtRentalStart: parseAmount(u.standardPriceAtRentalStart) || 0,
      acquisitionOfficialPrice: parseAmount(u.acquisitionOfficialPrice) || 0,
      isNationalSizeHousing: u.isNationalSizeHousing ?? false,
      // 건설임대 규모요건 — 미입력(빈값)이면 undefined 전송(엔진이 SIZE_REQUIRED 판정)
      landAreaM2: parseDecimal(u.rentalLandArea) || undefined,
      totalFloorAreaM2: parseDecimal(u.rentalTotalFloorArea) || undefined,
      hasMinimum2Units: u.hasMinimum2Units ?? false,
      hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity ?? false,
      firstSaleContractDate: u.firstSaleContractDate
        ? (u.firstSaleContractDate.includes('T') ? u.firstSaleContractDate : `${u.firstSaleContractDate}T00:00:00.000Z`)
        : undefined,
      rentalMonths: deriveRentalMonths(u),
      rentalAutoTermination: u.rentalAutoTermination ?? false,
      requirementsConfirmed: u.requirementsConfirmed ?? false,
    })),
    priorResidenceTransferDate: rh.priorResidenceTransferDate
      ? (rh.priorResidenceTransferDate.includes('T')
        ? rh.priorResidenceTransferDate
        : `${rh.priorResidenceTransferDate}T00:00:00.000Z`)
      : undefined,
    // 환산취득가 모드 연동 시 자산-수준 기준시가가 단일 소스 (§161① = 환산 분자·분모와 동일 값).
    // fallback이 아닌 소스 ternary — stale rhe override가 침묵으로 이기는 경로 차단.
    standardPriceAtAcquisitionForPhrp: isPhrpStdPriceLinked(asset)
      ? parseAmount(asset.standardPriceAtAcq) || undefined
      : parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "") || undefined,
    standardPriceAtPriorTransfer: parseAmount(rh.standardPriceAtPriorTransfer ?? "") || undefined,
    standardPriceAtTransferForPhrp: isPhrpStdPriceLinked(asset)
      ? parseAmount(asset.standardPriceAtTransfer) || undefined
      : parseAmount(rh.standardPriceAtTransferForPhrp ?? "") || undefined,
  };
}
