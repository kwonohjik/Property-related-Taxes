/**
 * §155⑳ 임대주택 유닛 boolean undefined → API ?? false 방어 anchor.
 * 계획서: docs/02-design/features/rental-unit-boolean-undefined-validation-fix.plan.md
 *
 * 증상: stale sessionStorage·이력 로드(migrateAsset 우회) 유닛의 9개 boolean이 undefined →
 *       API 변환이 raw 전달 → Zod required boolean 400.
 * 수정: toRentalHousingExceptionApi에서 9개 boolean ?? false.
 */
import { describe, it, expect } from "vitest";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-helpers";
import { rentalUnitSchema } from "@/lib/api/transfer-tax-schema";
import {
  makeDefaultAsset,
  makeDefaultRentalUnit,
  RENTAL_HOUSING_EXCEPTION_DEFAULTS,
} from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 9개 boolean이 전부 undefined인 stale 유닛 (factory 이전 스키마 흉내) */
const STALE_BOOLEAN_KEYS = [
  "isApartment",
  "isExcluded918Rule",
  "hasContractDepositProof",
  "isExcludedShortToLongChange",
  "isNationalSizeHousing",
  "hasMinimum2Units",
  "hasMinimum5UnitsInCity",
  "rentalAutoTermination",
  "requirementsConfirmed",
] as const;

function makeStaleAsset(): AssetForm {
  const unit = makeDefaultRentalUnit();
  unit.businessRegistrationDate = "2009-10-01";
  unit.rentalRegistrationDate = "2009-10-01";
  unit.standardPriceAtRentalStart = "300,000,000";
  unit.rentalMonths = "96";
  // stale 재현: 9개 boolean을 undefined로 제거
  for (const k of STALE_BOOLEAN_KEYS) {
    (unit as Record<string, unknown>)[k] = undefined;
  }
  const a = makeDefaultAsset(1);
  a.assetKind = "housing";
  a.rentalHousingException = {
    ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
    applyException: true,
    scenario: "A",
    rentalUnits: [unit],
  };
  return a;
}

describe("임대주택 유닛 boolean undefined → API ?? false 방어", () => {
  it("stale 유닛(9개 boolean undefined) → API 변환 결과 전부 false", () => {
    const payload = toRentalHousingExceptionApi(makeStaleAsset()) as {
      rentalUnits: Array<Record<string, unknown>>;
    };
    const u = payload.rentalUnits[0];
    for (const k of STALE_BOOLEAN_KEYS) {
      expect(u[k], `${k} 는 false 여야 함`).toBe(false);
    }
  });

  it("변환 payload가 rentalUnitSchema(required boolean) 통과 — 400 미발생", () => {
    const payload = toRentalHousingExceptionApi(makeStaleAsset()) as {
      rentalUnits: unknown[];
    };
    expect(() => rentalUnitSchema.parse(payload.rentalUnits[0])).not.toThrow();
  });
});
