/**
 * buildAcquisitionTaxBody → houseCountInput 동기화 anchor (R2 H9·H10 회귀 방어)
 *
 * H9: houseCountInput에 pendingAcquisition(취득 대상 주택) 미전달 → 자동 주택수에서
 *     취득 주택이 누락되어 다주택 중과 임계(3주택)를 놓치던 버그.
 * H10: houseCountInput에 referenceDate 미전달 → 주택 수 산정 기준일이 취득일이 아닌
 *     계산 실행일(오늘)로 defaulting되던 버그.
 *
 * 이 anchor는 FormState → buildAcquisitionTaxBody → Zod safeParse → 엔진 경로를 재현한다.
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, type FormState, type OwnedHouseInfo } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";

function ownedHouse(id: string): OwnedHouseInfo {
  return {
    id,
    standardValue: "500000000",
    propertyType: "apartment",
    acquisitionDate: "2015-01-01",
    isRegulated: true,
    isInherited: false,
    inheritanceDate: "",
    ownershipShare: "1",
    coOwnersAllInHousehold: false,
    isHansiBenefit: false,
    hansiBenefitType: "",
    shareInInheritance: "",
    maxShareInInheritors: "",
    tieInMaxShare: false,
    isResident: false,
    isOldest: false,
    isMetropolitanRegion: true,
    isUrbanRegenArea: false,
  };
}

function calcViaRoute(body: unknown) {
  const parsed = acquisitionTaxInputSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

describe("[AT-HCNT] houseCountInput pendingAcquisition·referenceDate — R2 H9·H10", () => {
  const form: FormState = {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: "500000000",
    standardValue: "500000000",
    acquiredBy: "individual",
    isRegulatedArea: true,
    isMetropolitanRegion: true,
    balancePaymentDate: "2024-06-01",
    houseCountAfter: "1", // 수동값 — 자동 산정이 취득주택 포함해 덮어써야 함
    ownedHouses: [ownedHouse("h1"), ownedHouse("h2")],
  };

  it("[AT-HCNT-01] H9 — 2보유 + 취득주택 = 3주택 자동 산정 (pendingAcquisition +1)", () => {
    const body = buildAcquisitionTaxBody(form);
    // 빌더가 pendingAcquisition·referenceDate를 body.houseCountInput에 실었는지
    const hci = (body.houseCountInput ?? {}) as Record<string, unknown>;
    expect(hci.pendingAcquisition).toBeDefined();
    expect(hci.referenceDate).toBe("2024-06-01");

    const result = calcViaRoute(body);
    // 2보유 + 취득 1 = 3주택 → 자동 산정 3 (수동 houseCountAfter=1을 대체)
    expect(result.houseCountDetail?.totalCount).toBe(3);
    // 조정지역 3주택 → §13의2①3호 12% (미포함 시 2주택 8%로 과소)
    expect(result.appliedRate).toBe(0.12);
    expect(result.acquisitionTax).toBe(60_000_000);
  });

  it("[AT-HCNT-02] H10 — 주택 수 산정 기준일 = 취득일(잔금일)", () => {
    const body = buildAcquisitionTaxBody(form);
    const result = calcViaRoute(body);
    expect(result.houseCountDetail?.referenceDate).toBe("2024-06-01");
  });
});
