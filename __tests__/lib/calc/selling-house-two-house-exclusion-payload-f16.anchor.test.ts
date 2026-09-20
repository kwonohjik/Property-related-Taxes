/**
 * F-16 ④ — 양도(selling) 주택의 §167의10①3호·7호 입력 배선.
 *
 * 엔진이 두 호를 양도 주택 자신에 적용해도, ④가 그 플래그를 `selling` 객체에 싣지 않으면
 * **아무 일도 일어나지 않는다**. 종전 `buildHousesPayload`의 `selling`은 3주택+ 전용 특례
 * (저당권·사원용·조특법·국가유산·어린이집)만 실었다 — 3호·7호는 「다른 보유 주택」 행에만 있었다.
 *
 * 3호의 기준시가는 「**취득 당시**」다. 다른 주택 행의 `acquisitionOfficialPrice`도 종전에는
 * 장기임대 9유형(`isLongTermRental && rentalType`) 게이트 안에서만 전달돼, 3호만 켠 주택에서는
 * 그 값이 API에 도달하지 않았다.
 */

import { describe, it, expect } from "vitest";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function makeHouseEntry(over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "500000000",
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

type Payload = Record<string, unknown>;

function build(
  sellingExclusion: TransferFormData["sellingHouseExclusion"],
  house: HouseEntry = makeHouseEntry(),
): { selling: Payload; other: Payload } {
  const form = createDefaultTransferFormData();
  form.assets[0] = { ...form.assets[0], assetKind: "housing" };
  const payload = buildHousesPayload(form.assets[0], [house], 0, sellingExclusion) as Payload[];
  const selling = payload.find((h) => h.id === "selling")!;
  const other = payload.find((h) => h.id === "h1")!;
  return { selling, other };
}

describe("F-16 ④ 양도 주택 — §167의10①7호(소송)", () => {
  it("F16-P1 소송 취득 플래그와 취득일이 selling에 실린다", () => {
    const { selling } = build({ isLitigationHousing: true, litigationAcquisitionDate: "2024-06-01" });
    expect(selling.isLitigationHousing).toBe(true);
    expect(selling.litigationAcquisitionDate).toBe("2024-06-01");
  });

  it("F16-P2 토글 OFF면 부속 날짜를 보내지 않는다", () => {
    const { selling } = build({ isLitigationHousing: false, litigationAcquisitionDate: "2024-06-01" });
    expect(selling.litigationAcquisitionDate).toBeUndefined();
  });
});

describe("F-16 ④ 양도 주택 — §167의10①3호(부득이한 사유)", () => {
  const 부득이: TransferFormData["sellingHouseExclusion"] = {
    isUnavoidableReason: true,
    unavoidableResidenceYears: "2",
    unavoidableReasonResolvedDate: "2025-01-01",
    acquisitionOfficialPrice: "250,000,000",
  };

  it("F16-P3 플래그·거주기간·해소일·취득 당시 기준시가가 selling에 실린다", () => {
    const { selling } = build(부득이);
    expect(selling.isUnavoidableReason).toBe(true);
    expect(selling.unavoidableResidenceYears).toBe(2);
    expect(selling.unavoidableReasonResolvedDate).toBe("2025-01-01");
    expect(selling.acquisitionOfficialPrice).toBe(250_000_000);
  });

  it("F16-P4 토글 OFF면 부속값을 보내지 않는다", () => {
    const { selling } = build({ ...부득이, isUnavoidableReason: false });
    expect(selling.unavoidableResidenceYears).toBeUndefined();
    expect(selling.unavoidableReasonResolvedDate).toBeUndefined();
    expect(selling.acquisitionOfficialPrice).toBeUndefined();
  });

  it("F16-P5 양도 주택의 `officialPrice`는 양도 당시 값이다 — 취득 당시와 다른 칸", () => {
    const { selling } = build(부득이);
    expect(selling.acquisitionOfficialPrice).not.toBe(selling.officialPrice);
  });
});

describe("F-16 ④ 다른 보유 주택 — 취득 당시 기준시가는 장기임대 게이트 밖에서도 전달된다", () => {
  it("F16-P6 장기임대가 아니어도 3호용 취득 당시 기준시가가 실린다", () => {
    const { other } = build(
      undefined,
      makeHouseEntry({
        isUnavoidableReason: true,
        unavoidableResidenceYears: "2",
        acquisitionOfficialPrice: "250000000",
      }),
    );
    expect(other.isUnavoidableReason).toBe(true);
    expect(other.acquisitionOfficialPrice).toBe(250_000_000);
  });

  it("F16-P7 (대조) 미입력이면 보내지 않는다 — 0으로 채우지 않는다", () => {
    const { other } = build(undefined, makeHouseEntry({ isUnavoidableReason: true }));
    expect(other.acquisitionOfficialPrice).toBeUndefined();
  });
});
