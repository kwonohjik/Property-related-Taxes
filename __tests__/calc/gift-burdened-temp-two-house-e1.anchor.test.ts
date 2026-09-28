/**
 * E-1 — 증여세 부담부증여 §155①2호 새 입력의 ③ 복원·⑧ 검증 (계획서 §9.3 E-1).
 *
 * ③ `normalizeRestoredFormDates`는 `temporaryTwoHouse`를 두 날짜로 **다시 만들어** 복원했다 — 새 필드를
 *    펼치지 않으면 새로고침·이력 복원 뒤 조용히 사라진다(④가 싣지 못한다).
 * ⑧ 모순 차단은 양도세 판정 메뉴와 같은 규칙 leaf(`temporaryTwoHouseEraIssues`)·⑤와 같은 게이트
 *    (`giftBurdenedTempTwoHouseRegulatedGate`)로 건다 — 칸이 없는 시기(2023-01-12 이후 등)에서는 막지 않는다.
 */
import { describe, it, expect } from "vitest";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { giftBurdenedTempTwoHouseRegulatedGate } from "@/lib/calc/gift-burdened-temp-two-house";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

type TT = NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>;
type Era = Omit<TT, "previousAcquisitionDate" | "newAcquisitionDate">;

function item(newAcq: string, era: Era = {}, over: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
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
      acquisitionDate: new Date("2015-01-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: true,
      residencePeriodMonths: 0,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2015-01-01"),
        newAcquisitionDate: new Date(newAcq),
        ...era,
      },
      ...over,
    },
  } as EstateItem;
}
const form = (giftDate: string, it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: [it] }) as FormState;
/** 부담부증여 양도세 검증이 있는 단계 — 증여재산 단계(1) */
const v = (giftDate: string, it: EstateItem) => validateStep(1, form(giftDate, it));

describe("E-1 ③ 복원 — 새 필드가 살아남는다", () => {
  it("N-1 JSON 왕복 후 normalize — 날짜는 Date로, 새 필드는 그대로", () => {
    const era: Era = {
      newHouseRegulatedAtAcquisition: "yes",
      prevHouseRegulatedAtNewAcquisition: "no",
      newHouseContractDate: "2020-05-01",
      newHouseMoveInDate: "2021-01-01",
      newHouseExistingTenant: true,
      newHouseTenantLeaseEndDate: "2021-12-31",
    };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [item("2020-06-01", era)] }));
    const tt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!.temporaryTwoHouse!;
    expect(tt.newAcquisitionDate).toBeInstanceOf(Date);
    expect(tt.previousAcquisitionDate).toBeInstanceOf(Date);
    expect(tt).toMatchObject(era);
  });
});

describe("E-1 ⑤⑧ 게이트 — 양도세 판정 카드와 같은 leaf", () => {
  it("G-1 2019-12-17 체제(신규 2020-06-01 · 증여 2021-03-01) — 열림 · 전입/임차인 칸 열림", () => {
    const g = giftBurdenedTempTwoHouseRegulatedGate(item("2020-06-01").burdenedGiftTransferTax!, "2021-03-01");
    expect(g).not.toBeNull();
    expect(g!.regulated.moveInRelevant).toBe(true);
    expect(g!.regulated.determined).toBe(false);
  });
  it("G-2 닫힘 — 2023-01-12 이후 증여 · 세대 주택 수 3 · 신규 취득일 없음", () => {
    expect(giftBurdenedTempTwoHouseRegulatedGate(item("2021-06-01").burdenedGiftTransferTax!, "2023-06-01")).toBeNull();
    expect(
      giftBurdenedTempTwoHouseRegulatedGate(item("2020-06-01", {}, { householdHousingCount: 3 }).burdenedGiftTransferTax!, "2021-03-01"),
    ).toBeNull();
    expect(
      giftBurdenedTempTwoHouseRegulatedGate({ ...item("2020-06-01").burdenedGiftTransferTax!, temporaryTwoHouse: undefined }, "2021-03-01"),
    ).toBeNull();
  });
  it("G-3 선언 두 개가 들어오면 determined", () => {
    const g = giftBurdenedTempTwoHouseRegulatedGate(
      item("2020-06-01", { newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" })
        .burdenedGiftTransferTax!,
      "2021-03-01",
    );
    expect(g!.regulated.determined).toBe(true);
  });
});

describe("E-1 ⑧ 모순 차단 — 칸이 열린 시기에서만", () => {
  it("V-1 임차인 토글 ON + 종료일 없음 → 차단 / 종료일 입력 → 통과", () => {
    expect(v("2021-03-01", item("2020-06-01", { newHouseExistingTenant: true }))).toContain("임대차계약 종료일을 입력");
    expect(
      v("2021-03-01", item("2020-06-01", { newHouseExistingTenant: true, newHouseTenantLeaseEndDate: "2021-12-31" })),
    ).toBeNull();
  });
  it("V-2 종료일 ≤ 신규 취득일 → 차단 (2020-06-01 = 취득일)", () => {
    expect(
      v("2021-03-01", item("2020-06-01", { newHouseExistingTenant: true, newHouseTenantLeaseEndDate: "2020-06-01" })),
    ).toContain("신규 주택 취득일 뒤여야");
  });
  it("V-3 계약일 > 신규 취득일 → 차단 / 같은 날 통과", () => {
    expect(v("2021-03-01", item("2020-06-01", { newHouseContractDate: "2020-06-02" }))).toContain("늦을 수 없습니다");
    expect(v("2021-03-01", item("2020-06-01", { newHouseContractDate: "2020-06-01" }))).toBeNull();
  });
  it("V-4 부정 짝 — 칸이 닫힌 시기(2023-01-12 이후 증여)면 같은 모순도 막지 않는다", () => {
    expect(v("2023-06-01", item("2021-06-01", { newHouseExistingTenant: true }))).toBeNull();
    expect(v("2023-06-01", item("2021-06-01", { newHouseContractDate: "2021-06-02" }))).toBeNull();
  });
  it("V-5 미입력은 차단하지 않는다(엔진 고지로 넘긴다)", () => {
    expect(v("2021-03-01", item("2020-06-01"))).toBeNull();
  });
});
