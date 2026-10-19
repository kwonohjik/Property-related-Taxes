/**
 * 별건 ⑥ ⑧ — 계산기 검증이 §155⑳ 거주 24개월을 엔진과 같은 통산값으로 본다.
 *
 * 종전에는 본인 거주(`deriveResidencePeriodMonths`)만 24개월과 비교해, 증여·상속 전 같은 세대 거주를 통산하면 엔진이 비과세인
 * 입력도 계산 자체를 막았다(엔진 anchor `rh-residence-same-household-consolidation`). 통산분은 ④와 같은 사실을 엔진 leaf에 넣어 구한다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER = "2025-03-03";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2021-01-04",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "12",
    ...over,
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2018-06-01",
          rentalRegistrationDate: "2018-06-01",
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          rentalMonths: "96",
        },
      ],
    },
  };
}

const gifted = (over: Partial<AssetForm> = {}): Partial<AssetForm> => ({
  acquisitionCause: "gift",
  donorAcquisitionDate: "2015-03-02",
  giftDonorRelation: "lineal",
  giftSameHousehold: "yes",
  giftHouseholdHoldingStartDate: "2015-03-02",
  giftPriorHouseholdResidenceMonths: "18",
  ...over,
});

const inherited: Partial<AssetForm> = {
  acquisitionCause: "inheritance",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationResidenceMonths: "18",
};

const call = (a: AssetForm, index = 0) =>
  validateRentalHousingException(a.rentalHousingException, a, index, "자산1", TRANSFER, "full");

describe("별건 ⑥ ⑧ — §155⑳ 거주 24개월은 동일세대 거주 통산값", () => {
  it("V6-1 ★ 증여 전 같은 세대 거주 18개월 + 본인 12개월 → 막지 않는다", () => {
    expect(call(asset(gifted()))).toBeNull();
  });

  it("V6-2 ★ 동일세대 상속 — 피상속인과 함께 거주 18개월 + 본인 12개월 → 막지 않는다", () => {
    expect(call(asset(inherited))).toBeNull();
  });

  it("V6-3 부정 짝 — 통산분이 없으면 종전대로 막는다(미답 · 별도세대 · 동일세대 아닌 상속 · 매매)", () => {
    for (const over of [
      gifted({ giftPriorHouseholdResidenceMonths: "" }),
      gifted({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "", giftPriorHouseholdResidenceMonths: "" }),
      { ...inherited, decedentSameHouseholdBeforeInheritance: false },
      {},
    ]) {
      expect(call(asset(over))).toContain("(현재: 12개월)");
    }
  });

  it("V6-4 통산해도 24개월 미만이면 막고, 문구에 통산분을 적는다", () => {
    expect(call(asset(gifted({ giftPriorHouseholdResidenceMonths: "6" })))).toContain("(현재: 18개월 — 같은 세대 거주 통산 6개월 포함)");
  });

  it("V6-5 용도변경 주택(§154⑤ 단서)은 엔진이 상속 통산을 하지 않는다 — ⑧도 통산하지 않고 막는다", () => {
    expect(call(asset({ ...inherited, hasNonHousingConversion: true, residentialUseStartDate: "2021-01-04" }))).toContain("(현재: 12개월)");
  });

  it("V6-6 §154⑩ 종전규정(2019.2.12 전 취득 · 취득 당시 조정대상지역)의 거주 2년도 통산값으로 본다", () => {
    const b = (over: Partial<AssetForm>) => {
      const a = asset({ acquisitionDate: "2016-01-04", ...over });
      return {
        ...a,
        rentalHousingException: {
          ...a.rentalHousingException,
          scenario: "B" as const,
          rentalUnits: [],
          priorResidenceTransferDate: "2020-08-25",
          wasRegisteredRentalOrChildcare: true,
          standardPriceAtAcquisitionForPhrp: "300,000,000",
          standardPriceAtPriorTransfer: "450,000,000",
          standardPriceAtTransferForPhrp: "500,000,000",
        },
      };
    };
    const v = (a: AssetForm) => validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full", false, true);
    expect(v(b({}))).toContain("장기임대주택 특례(§154⑩) — 2019.2.12 전 취득으로 소령 §154① 원칙이 적용됩니다");
    expect(v(b({}))).toContain("(현재: 12개월)");
    expect(v(b(inherited))).toBeNull();
  });
});
