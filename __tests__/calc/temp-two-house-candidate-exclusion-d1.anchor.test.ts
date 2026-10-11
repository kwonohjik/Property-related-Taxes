/**
 * D1 — §155②③으로 주택 수에서 빠지는 상속주택 행은 §155① 신규 주택 후보에서도 빠진다(계산기 ④ 본문).
 * D3 — §155⑦ 요건을 갖춘 농어촌주택 행도 같다(아래 `D3` 블록).
 *
 * 판정 메뉴 경로는 해석례 평가셋(`E004-era`·`E050-*`·`E095-era` match · `E004-era-samehh` 음성 짝)이 고정한다.
 * 계산기·다건은 같은 helper(`temporaryTwoHouseCandidateExcludedIds`)를 `buildHouseholdSpecialPayload`에서 쓴다 —
 * 그 배선을 본문 단위로 고정한다([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 */
import { describe, it, expect } from "vitest";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const row = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    region: "capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

// E004: 일반주택(양도) 2002-08-12 · 상속주택 2009-02-02(별도세대) · 신규 2015-12-21 · 양도 2016-06-15
function form(sameHousehold: boolean) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2016-06-15";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2002-08-12" });
  f.houses = [
    row({
      id: "inh",
      acquisitionDate: "2009-02-02",
      isInherited: true,
      inheritedDate: "2009-02-02",
      isCoInherited: false,
      decedentSameHouseholdAtInheritance: sameHousehold,
      parentalCareMergeInheritedHouse: false,
    }),
    row({ id: "c", acquisitionDate: "2015-12-21" }),
  ];
  return f;
}

describe("D1 계산기 ④ — 상속주택 행은 신규 주택 후보가 아니다", () => {
  it("별도세대 상속(§155② 제외) → 신규 주택 C가 명부에서 도출된다", () => {
    const f = form(false);
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).toMatchObject({
      temporaryTwoHouse: { previousAcquisitionDate: "2002-08-12", newAcquisitionDate: "2015-12-21" },
    });
  });
  it("동일세대 상속(§155② 단서 — 제외 안 됨) → 후보 2채라 도출하지 않는다(음성 짝)", () => {
    const f = form(true);
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).not.toHaveProperty("temporaryTwoHouse");
  });
});

// D3 — ⑦ 요건을 갖춘 농어촌주택 행도 후보가 아니다. 귀농주택을 일반주택보다 나중에 취득한 E022-current-rural-later.
function ruralForm(wholeHouseholdMoved: boolean) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-15";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2019-06-01" });
  f.houses = [
    row({
      id: "rural",
      region: "non_capital",
      acquisitionDate: "2022-01-10",
      oneHouseRuralHouse: true,
      ruralHouseKind: "return_to_farm",
      ruralOutsideCapitalEupMyeon: true,
      ruralLandAreaSqm: "300",
      ruralWholeHouseholdMoved: wholeHouseholdMoved,
      ruralHighPriceAtAcquisition: false,
    }),
    row({ id: "new", region: "non_capital", acquisitionDate: "2023-09-01" }),
  ];
  return f;
}

describe("D3 계산기 ④ — ⑦ 농어촌주택 행은 신규 주택 후보가 아니다", () => {
  it("⑦ 충족 → 신규 주택이 명부에서 도출된다", () => {
    const f = ruralForm(true);
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).toMatchObject({
      temporaryTwoHouse: { previousAcquisitionDate: "2019-06-01", newAcquisitionDate: "2023-09-01" },
    });
  });
  it("⑦ 미달(⑩5호) → 보통 주택이라 후보 2채 — 도출하지 않는다(음성 짝)", () => {
    const f = ruralForm(false);
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).not.toHaveProperty("temporaryTwoHouse");
  });
});

// S06-1 — §155⑳ 시나리오 A를 선언했으면 「장기임대」 행은 후보가 아니다. 임대주택이 거주주택(2015)보다 나중(2016) 취득이어도
// §155⑳에는 취득 순서 요건이 없다(MST 286211 · 서면-2019-부동산-1303 · 사전-2025-법규재산-0993).
function rentalForm(over: { applyException: boolean; scenario: "A" | "B"; rentalAcquisitionDate?: string }) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-09-18";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: over.applyException,
    scenario: over.scenario,
  };
  f.houses = [
    row({ id: "rental", acquisitionDate: over.rentalAcquisitionDate ?? "2016-01-01", isLongTermRental: true }),
    row({ id: "new", acquisitionDate: "2025-01-01" }),
  ];
  return f;
}

describe("S06-1 계산기 ④ — ⑳ 시나리오 A의 「장기임대」 행은 신규 주택 후보가 아니다", () => {
  it("시나리오 A 선언 + 임대(2016)가 거주주택(2015) 뒤 → 신규 주택 2025가 명부에서 도출된다", () => {
    const f = rentalForm({ applyException: true, scenario: "A" });
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).toMatchObject({
      temporaryTwoHouse: { previousAcquisitionDate: "2015-01-01", newAcquisitionDate: "2025-01-01" },
    });
  });
  it("긍정 짝 — 임대(2014)가 거주주택 앞이면 종전에도 같은 짝이 도출된다", () => {
    const f = rentalForm({ applyException: true, scenario: "A", rentalAcquisitionDate: "2014-01-01" });
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).toMatchObject({
      temporaryTwoHouse: { previousAcquisitionDate: "2015-01-01", newAcquisitionDate: "2025-01-01" },
    });
  });
  it("긍정 짝 — 임대가 유일한 나중 취득 행이면 종전대로 그 행이 도출된다(구 §167의10①8호 OE-2가 쓴다)", () => {
    const f = rentalForm({ applyException: true, scenario: "A" });
    f.houses = [f.houses[0]];
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).toMatchObject({
      temporaryTwoHouse: { previousAcquisitionDate: "2015-01-01", newAcquisitionDate: "2016-01-01" },
    });
  });
  it("음성 짝 — ⑳ 미선언이면 「장기임대」 행도 후보라 2채 → 도출하지 않는다", () => {
    const f = rentalForm({ applyException: false, scenario: "A" });
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).not.toHaveProperty("temporaryTwoHouse");
  });
  it("음성 짝 — 시나리오 B(PHRP 양도)는 거주주택 양도가 아니라 후보를 바꾸지 않는다", () => {
    const f = rentalForm({ applyException: true, scenario: "B" });
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).not.toHaveProperty("temporaryTwoHouse");
  });
});
