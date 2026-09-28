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
  giftBurdenedInheritanceSlice,
} from "@/lib/calc/gift-burdened-one-house";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
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
