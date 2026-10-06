/**
 * D1 — §155②③으로 주택 수에서 빠지는 상속주택 행은 §155① 신규 주택 후보에서도 빠진다(계산기 ④ 본문).
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
