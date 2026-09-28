/**
 * E-1 잔여 — 증여세 부담부증여 양도 경로의 남은 입력 ③ 복원 · ⑧ 검증 · 게이트 leaf.
 *
 * ⑧은 판정 메뉴·양도세 계산기와 **같은 규칙·문구**를 ⑤·④와 **같은 slice**로 건다.
 */
import { describe, it, expect } from "vitest";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import {
  buildGiftBurdenedInheritancePayload,
  giftBurdenedEffectiveIsRegulatedArea,
  giftBurdenedInheritanceSlice,
} from "@/lib/calc/gift-burdened-one-house";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { giftBurdenedRentalAsset } from "@/lib/calc/gift-burdened-rental-exception";
import {
  giftBurdenedNewHouseAddressPatch,
  giftBurdenedTempTwoHouseRegulatedGate,
} from "@/lib/calc/gift-burdened-temp-two-house";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

function item(over: Partial<BurdenedGiftTransferTaxInput> = {}, base: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2020-06-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...over,
    },
    ...base,
  } as EstateItem;
}
const form = (giftDate: string, it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: [it] }) as FormState;
/** 부담부증여 양도세 검증이 있는 단계 — 증여재산 단계(1) */
const v = (giftDate: string, it: EstateItem) => validateStep(1, form(giftDate, it));

const INHERITED: Partial<BurdenedGiftTransferTaxInput> = {
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2010-01-01",
};
const SAME: Partial<BurdenedGiftTransferTaxInput> = {
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2012-01-01",
  decedentCohabitationResidenceMonths: "60",
};

describe("D ③ 복원 — JSON 왕복 후 normalize가 상속 필드를 보존한다", () => {
  it("D-N1 원인·피상속인 취득일·동일세대 3필드 그대로", () => {
    const fields = { ...INHERITED, ...SAME };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [item(fields)] }));
    const bgt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!;
    expect(bgt.acquisitionDate).toBeInstanceOf(Date);
    expect(bgt).toMatchObject(fields);
  });
});

describe("D slice·④ leaf — 옛 record(필드 없음)는 매매로 읽는다", () => {
  it("D-S1 옛 record → purchase · 빈 값 · 본문 키 없음", () => {
    const bgt = item().burdenedGiftTransferTax!;
    expect(giftBurdenedInheritanceSlice(bgt)).toEqual({
      acquisitionCause: "purchase",
      acquisitionDate: "2020-06-01",
      decedentAcquisitionDate: "",
      decedentSameHouseholdBeforeInheritance: false,
      decedentCohabitationHoldingStartDate: "",
      decedentCohabitationResidenceMonths: "",
    });
    expect(buildGiftBurdenedInheritancePayload(bgt)).toEqual({});
  });
  it("D-S2 상속만(동일세대 아님) → 통산 3필드는 싣지 않는다(계산기 leaf와 같은 게이트)", () => {
    const p = buildGiftBurdenedInheritancePayload(item(INHERITED).burdenedGiftTransferTax!);
    expect(p.acquisitionCause).toBe("inheritance");
    expect(p.decedentAcquisitionDate).toBe("2010-01-01");
    expect(p.decedentSameHouseholdBeforeInheritance).toBe(false);
    expect(p.decedentCohabitationHoldingStartDate).toBeUndefined();
    expect(p.decedentCohabitationResidenceMonths).toBeUndefined();
  });
  it("D-S3 ④ 게이트 — 비주택 건물(isHousing OFF)에는 남은 상속 값을 싣지 않는다(⑤는 주택 필드 세트 안에만 있다)", () => {
    const building = item({ ...INHERITED, ...SAME, isHousing: false }, { category: "real_estate_building" } as Partial<EstateItem>);
    const body = buildGiftBurdenedTransferBody(building, form("2021-06-01", building));
    expect(body).not.toHaveProperty("acquisitionCause");
    expect(body).not.toHaveProperty("decedentAcquisitionDate");
  });
});

describe("D ⑧ 상속받은 주택 — 판정 메뉴·계산기와 같은 규칙", () => {
  it("V-D1 상속인데 피상속인 취득일 없음 → 차단(⑫ refine 필수값)", () => {
    expect(v("2021-06-01", item({ acquisitionCause: "inheritance" }))).toContain("피상속인 취득일을 입력");
  });
  it("V-D2 피상속인 취득일 ≥ 상속개시일(취득일) → 차단", () => {
    expect(v("2021-06-01", item({ ...INHERITED, decedentAcquisitionDate: "2020-06-01" }))).toContain(
      "피상속인 취득일은 상속개시일보다 이전",
    );
  });
  it("V-D3 동일세대인데 개시일 없음 → 차단 / 개시일이 상속개시일 뒤 → 차단 / 피상속인 취득 전 → 차단", () => {
    expect(v("2021-06-01", item({ ...INHERITED, decedentSameHouseholdBeforeInheritance: true }))).toContain(
      "동일세대 거주·보유 개시일을 입력",
    );
    expect(
      v("2021-06-01", item({ ...INHERITED, ...SAME, decedentCohabitationHoldingStartDate: "2020-07-01" })),
    ).toContain("상속개시일(취득일)보다 앞서야");
    expect(
      v("2021-06-01", item({ ...INHERITED, ...SAME, decedentCohabitationHoldingStartDate: "2009-01-01" })),
    ).toContain("피상속인 취득일보다 빠릅니다");
  });
  it("V-D4 부정 짝 — 사실을 다 넣으면 통과 · 원인 매매(토글 OFF)의 stale 값은 막지 않는다 · 비주택 건물도 막지 않는다", () => {
    expect(v("2021-06-01", item({ ...INHERITED, ...SAME }))).toBeNull();
    expect(v("2021-06-01", item({ acquisitionCause: "purchase", decedentSameHouseholdBeforeInheritance: true }))).toBeNull();
    const building = item({ acquisitionCause: "inheritance", isHousing: false }, { category: "real_estate_building" } as Partial<EstateItem>);
    expect(v("2021-06-01", building)).toBeNull();
  });
});

describe("A leaf — 「양도시 조정대상지역」 실효값 (⑤④ 공용)", () => {
  it("A-L1 저장값 없음 + 주소 → 증여일 주소 판정 · 저장값 있으면 그 값 · 주소 없으면 저장값(없음 = 아님)", () => {
    expect(giftBurdenedEffectiveIsRegulatedArea({}, "1168010100", "2021-06-01")).toBe(true);
    expect(giftBurdenedEffectiveIsRegulatedArea({}, "1168010100", "2017-08-02")).toBe(false);
    expect(giftBurdenedEffectiveIsRegulatedArea({ isRegulatedArea: false }, "1168010100", "2021-06-01")).toBe(false);
    expect(giftBurdenedEffectiveIsRegulatedArea({ isRegulatedArea: true }, "1168010100", "2017-08-02")).toBe(true);
    expect(giftBurdenedEffectiveIsRegulatedArea({}, undefined, "2021-06-01")).toBe(false);
    expect(giftBurdenedEffectiveIsRegulatedArea({ isRegulatedArea: true }, undefined, "2021-06-01")).toBe(true);
  });
  it("A-L2 ④ — 주택이면 실효값을, 비주택 건물이면 저장값을 싣는다", () => {
    const withAddr = { estateAddress: { jibun: "x", pnu: "1168010100100120034" } } as Partial<EstateItem>;
    const apt = item({}, withAddr);
    expect(buildGiftBurdenedTransferBody(apt, form("2021-06-01", apt)).isRegulatedArea).toBe(true);
    const building = item({ isHousing: false }, { ...withAddr, category: "real_estate_building" } as Partial<EstateItem>);
    expect(buildGiftBurdenedTransferBody(building, form("2021-06-01", building)).isRegulatedArea).toBe(false);
  });
});

describe("B 신규 주택 소재지 — leaf · ③ · ④ · ⑤⑧ 게이트", () => {
  const tt = { previousAcquisitionDate: new Date("2015-01-01"), newAcquisitionDate: new Date("2020-06-18") };
  it("B-L1 주소 → PNU 앞 10자리(계산기 명부·증여 주택과 같은 규칙) · PNU 없음(직접 입력·지우기)이면 코드 비움", () => {
    expect(giftBurdenedNewHouseAddressPatch({ jibun: "인천 서구 x", pnu: "2826010100100010000" })).toEqual({
      newHouseJibun: "인천 서구 x",
      newHouseRegionCode: "2826010100",
    });
    expect(giftBurdenedNewHouseAddressPatch({ jibun: "직접 입력", pnu: "" })).toEqual({
      newHouseJibun: "직접 입력",
      newHouseRegionCode: "",
    });
  });
  it("B-N1 ③ 복원 — JSON 왕복 후 신규 주택 소재지 보존", () => {
    const fields = { householdHousingCount: 2, temporaryTwoHouse: { ...tt, newHouseJibun: "인천 서구 x", newHouseRegionCode: "2826010100" } };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [item(fields)] }));
    const bgt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!;
    expect(bgt.temporaryTwoHouse).toMatchObject({ newHouseJibun: "인천 서구 x", newHouseRegionCode: "2826010100" });
    expect(bgt.temporaryTwoHouse?.newAcquisitionDate).toBeInstanceOf(Date);
  });
  it("B-B1 ④ — 코드가 있으면 temporaryTwoHouse.newHouseRegionCode · 빈 코드면 키 없음", () => {
    const withCode = item({ householdHousingCount: 2, temporaryTwoHouse: { ...tt, newHouseRegionCode: "2826010100" } });
    const b = buildGiftBurdenedTransferBody(withCode, form("2021-08-01", withCode)) as { temporaryTwoHouse: Record<string, unknown> };
    expect(b.temporaryTwoHouse.newHouseRegionCode).toBe("2826010100");
    const empty = item({ householdHousingCount: 2, temporaryTwoHouse: { ...tt, newHouseRegionCode: "" } });
    const e = buildGiftBurdenedTransferBody(empty, form("2021-08-01", empty)) as { temporaryTwoHouse: Record<string, unknown> };
    expect(e.temporaryTwoHouse).not.toHaveProperty("newHouseRegionCode");
  });
  it("B-G1 ⑤⑧ 게이트 — 신규 주택 코드가 있으면 신규 주택은 자동 판정(nextAuto)되고 종전 주택 코드와 함께 판정 확정", () => {
    const bgt = (code?: string) =>
      item({ householdHousingCount: 2, temporaryTwoHouse: { ...tt, ...(code ? { newHouseRegionCode: code } : {}) } })
        .burdenedGiftTransferTax!;
    const g = giftBurdenedTempTwoHouseRegulatedGate(bgt("2826010100"), "2021-08-01", "1168010100")!;
    expect(g.regulated).toMatchObject({ nextAuto: true, next: false, determined: true });
    const none = giftBurdenedTempTwoHouseRegulatedGate(bgt(), "2021-08-01", "1168010100")!;
    expect(none.regulated).toMatchObject({ nextAuto: false, determined: false });
  });
});

describe("C §155⑳ 거주주택 특례 — ③ · 합성 자산 · ⑧", () => {
  const unit = (over: Record<string, unknown> = {}) => ({
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2018-06-01",
    rentalRegistrationDate: "2018-06-01",
    standardPriceAtRentalStart: "300,000,000",
    rentalInputMode: "direct" as const,
    rentalMonths: "30",
    requirementsConfirmed: true,
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term" as const,
    registrationCancellationDate: "2021-03-03",
    ...over,
  });
  const rhe = (u = unit()) => ({
    applyException: true,
    scenario: "A" as const,
    rentalUnits: [u],
    postRegistrationResidenceMonths: "",
    priorRentalExemptionHistory: "" as const,
    residenceTransitionUnderAddendum: false,
  });
  const base = { acquisitionDate: new Date("2016-01-10"), residencePeriodMonths: 60, householdHousingCount: 2 };

  it("C-N1 ③ 복원 — JSON 왕복 후 특례 입력(말소일 포함) 보존", () => {
    const parsed = JSON.parse(JSON.stringify({ giftItems: [item({ ...base, rentalHousingException: rhe() })] }));
    const bgt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!;
    expect(bgt.rentalHousingException?.rentalUnits[0]).toMatchObject({ registrationCancellationDate: "2021-03-03" });
  });
  it("C-S1 합성 자산 — 주택 · 취득일 · 거주 개월(직접) · 특례 입력만 얹는다", () => {
    const a = giftBurdenedRentalAsset({ id: "apt-1" }, item({ ...base, rentalHousingException: rhe() }).burdenedGiftTransferTax!);
    expect(a).toMatchObject({
      assetId: "apt-1",
      assetKind: "housing",
      acquisitionDate: "2016-01-10",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "60",
    });
    expect(a.rentalHousingException.applyException).toBe(true);
  });
  it("V-C1 ⑧ 말소 표시인데 말소일 없음 → 차단(계산기와 같은 규칙·문구) / 채우면 통과", () => {
    expect(v("2025-06-01", item({ ...base, rentalHousingException: rhe(unit({ registrationCancellationDate: "" })) }))).toContain(
      "등록 말소일을 입력하세요",
    );
    expect(v("2025-06-01", item({ ...base, rentalHousingException: rhe() }))).toBeNull();
  });
  it("V-C2 ⑧ 거주 24개월 미만 → 차단(이 경로의 「거주기간 (개월)」을 읽는다)", () => {
    expect(v("2025-06-01", item({ ...base, residencePeriodMonths: 12, rentalHousingException: rhe() }))).toContain(
      "거주주택 거주기간 2년(24개월) 이상이 필요합니다",
    );
  });
  it("V-C3 부정 짝 — 1세대 1주택 OFF(카드가 숨는 맥락)의 stale 선언은 막지 않는다", () => {
    expect(
      v("2025-06-01", item({ ...base, isOneHousehold: false, rentalHousingException: rhe(unit({ registrationCancellationDate: "" })) })),
    ).toBeNull();
  });
});
