/**
 * 다른 보유 주택 regionCode API 배선 (④ 단건 · ④' 다건) — houseSchema.regionCode length(10) 가드.
 *
 * houseSchema(transfer-tax-schema-sub.ts:311)는 regionCode를 정확히 10자리만 수용 →
 * ≠10자리 제공 시 Zod 400 하드리젝트. payload 빌더가 length(10) 아닌 값을 undefined로 가드하는지 검증.
 */

import { describe, it, expect } from "vitest";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { deriveHouseRegionFromCode, buildHouseAddressPatch } from "@/lib/calc/house-region";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { AddressValue } from "@/components/ui/address-search";

function addr(over: Partial<AddressValue>): AddressValue {
  return { road: "", jibun: "", building: "", detail: "", lng: "", lat: "", ...over };
}

const GIJANG10 = "2671010100"; // 부산 기장군 법정동 10자리 (VALUE)
const GANGNAM10 = "1168010100"; // 서울 강남구 (REGION)

function makeHouseEntry(over: Partial<HouseEntry>): HouseEntry {
  return {
    id: "h1",
    region: "non_capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "250000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  };
}

function housingForm(house: HouseEntry) {
  const form = createDefaultTransferFormData();
  form.assets[0] = { ...form.assets[0], assetKind: "housing" };
  form.householdHousingCount = "2";
  form.houses = [house];
  return form;
}

describe("otherHouses regionCode 배선 (length(10) 가드)", () => {
  it("deriveHouseRegionFromCode: 기장(VALUE)→non_capital, 강남(REGION)→capital, undefined→capital", () => {
    expect(deriveHouseRegionFromCode(GIJANG10)).toBe("non_capital");
    expect(deriveHouseRegionFromCode(GANGNAM10)).toBe("capital");
    expect(deriveHouseRegionFromCode(undefined)).toBe("capital");
  });

  describe("④ 단건 buildHousesPayload", () => {
    function otherHouse(regionCode?: string) {
      const form = housingForm(makeHouseEntry(regionCode ? { regionCode } : {}));
      const payload = buildHousesPayload(form.assets[0], form.houses, 0) as Record<string, unknown>[];
      return payload.find((h) => (h as { id: string }).id === "h1")!;
    }
    it("10자리 → 전송", () => expect(otherHouse(GIJANG10).regionCode).toBe(GIJANG10));
    it("5자리 → undefined 가드", () => expect(otherHouse("26710").regionCode).toBeUndefined());
    it("11자리 → undefined 가드", () => expect(otherHouse("26710101001").regionCode).toBeUndefined());
    it("미입력 → undefined", () => expect(otherHouse(undefined).regionCode).toBeUndefined());
  });

  describe("④' 다건 buildPropertyPayload", () => {
    function otherHouse(regionCode?: string) {
      const form = housingForm(makeHouseEntry(regionCode ? { regionCode } : {}));
      const payload = buildPropertyPayload(form) as { houses?: Record<string, unknown>[] };
      return payload.houses?.find((h) => (h as { id: string }).id === "h1");
    }
    it("10자리 → 전송", () => expect(otherHouse(GIJANG10)?.regionCode).toBe(GIJANG10));
    it("5자리 → undefined 가드", () => expect(otherHouse("26710")?.regionCode).toBeUndefined());
    it("미입력 → undefined", () => expect(otherHouse(undefined)?.regionCode).toBeUndefined());
  });

  describe("buildHouseAddressPatch — onChange 3회 발화 partial-guard (A2)", () => {
    it("주소만 선택(가격·면적 없음) → officialPrice/exclusiveArea patch에 미포함(기존값 보존)", () => {
      const patch = buildHouseAddressPatch(addr({ jibun: "부산 기장군 …", pnu: GIJANG10 }));
      expect("officialPrice" in patch).toBe(false);
      expect("exclusiveArea" in patch).toBe(false);
      expect(patch.regionCode).toBe(GIJANG10);
      expect(patch.region).toBe("non_capital"); // 지역 자동 파생
    });

    it("호 선택(가격·면적 반환) → 자동채움 + addressLookupFilled=true", () => {
      const patch = buildHouseAddressPatch(
        addr({ pnu: "2671010100123456789".slice(0, 19), standardPrice: 250_000_000, exclusiveArea: 84.5 }),
      );
      expect(patch.officialPrice).toBe("250000000");
      expect(patch.exclusiveArea).toBe("84.5");
      expect(patch.addressLookupFilled).toBe(true);
    });

    it("REGION 강남 pnu → region capital 파생", () => {
      const patch = buildHouseAddressPatch(addr({ pnu: GANGNAM10 }));
      expect(patch.region).toBe("capital");
      expect(patch.regionCode).toBe(GANGNAM10);
    });
  });
});
