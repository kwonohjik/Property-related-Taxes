/**
 * V-8(`docs/00-pm/rental-4ho-temp-merge-gaps.plan.md` §8) — 증여세 부담부증여 화면 · 세대 3주택 이상 + 합가일.
 *
 * 이 화면에는 다른 보유 주택 목록이 없어 엔진이 3주택 합가 특례를 판정하지 않고 계산한다(`NO_ROSTER_THREE_HOUSE_MERGE_NOTICE`).
 * 종전에는 §154① 단서 카드가 열려 4호 등 사유를 받고 ⑧이 그 칸을 요구했지만, 세액은 사유와 무관했다
 * (mock 실측 3·4주택 × 없음·1·3·4·5호 모두 10,289,400). ⑤④⑧이 함께 쓰는 `giftBurdenedProvisoMode`에서 합가 맥락을 2주택으로 좁힌다.
 *
 * 시료: 2017-10-01 취득(취득 당시 조정) · 거주 0 · 혼인 2020-01-01 · 먼저 양도 · 증여일 2023-06-01.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { giftBurdenedProvisoMode } from "@/lib/calc/gift-burdened-one-house";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const GIFT_DATE = "2023-06-01";

function item(over: Partial<BurdenedGiftTransferTaxInput>): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 150_000_000,
    mortgageAmount: 0,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2017-10-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      rentalHousingException: RH_ANSWERED_NO,
      householdHousingCount: 3,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      isUnregistered: false,
      marriageDate: "2020-01-01",
      isFirstTransferredInMerge: true,
      ...over,
    },
  } as EstateItem;
}
const bgt = (it: EstateItem) => it.burdenedGiftTransferTax as BurdenedGiftTransferTaxInput;
const form = (it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate: GIFT_DATE, donor: "father", donorRelation: "lineal_ascendant_adult", giftItems: [it] }) as FormState;
const body = (it: EstateItem) =>
  buildGiftBurdenedTransferBody(it, form(it)) as { oneHouseExemptionProviso?: { reason?: string } };

/** 4호를 골랐지만 날짜 칸을 비운 상태 — 카드가 열려 있으면 ⑧이 막는다. */
const BLANK_4HO = { provisoReason: "rental_registration_4ho" } as Partial<BurdenedGiftTransferTaxInput>;

describe("V-8 ⑤④⑧ 공용 게이트 — 합가 맥락은 2주택에서만", () => {
  it("★ 3주택 · 4주택 + 합가일 → 카드 숨김(mode null)", () => {
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 3 })))).toBeNull();
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 4 })))).toBeNull();
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 3, marriageDate: undefined, parentalCareMergeDate: "2020-01-01" })))).toBeNull();
  });
  it("부정 짝 — 2주택 + 합가일은 그대로 deemed_one_house · 1주택은 one_house", () => {
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 2 })))).toBe("deemed_one_house");
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 1 })))).toBe("one_house");
  });
  it("부정 짝 — §155⑳ 거주주택 특례를 선언한 3주택 합가는 종전대로 deemed_one_house(#2821 임대 행 제외 경로)", () => {
    const rh = { applyException: true, scenario: "A", rentalUnits: [] } as unknown as BurdenedGiftTransferTaxInput["rentalHousingException"];
    expect(giftBurdenedProvisoMode(bgt(item({ householdHousingCount: 3, rentalHousingException: rh })))).toBe("deemed_one_house");
  });
});

describe("V-8 ④·⑧ — 숨은 카드의 stale 사유", () => {
  it("★ 3주택: 4호를 골라 둔 값이 본문에 실리지 않는다", () => {
    expect(body(item({ ...BLANK_4HO, proviso4hoBusinessRegDate: "2018-06-01" })).oneHouseExemptionProviso).toBeUndefined();
  });
  it("★ 3주택: 4호 칸이 비어도 ⑧이 막지 않는다(영구 차단 없음)", () => {
    expect(validateStep(1, form(item(BLANK_4HO))) ?? "").not.toMatch(/사업자등록 신청일/);
  });
  it("부정 짝 — 2주택: 같은 입력이면 ⑧이 4호 칸을 요구하고, 채우면 본문에 실린다", () => {
    expect(validateStep(1, form(item({ ...BLANK_4HO, householdHousingCount: 2 })))).toMatch(/사업자등록 신청일/);
    const filled = item({
      ...BLANK_4HO,
      householdHousingCount: 2,
      proviso4hoBusinessRegDate: "2018-06-01",
      proviso4hoRentalRegDate: "2018-06-01",
      proviso4hoRegulatedOneHouse: "yes",
      proviso4hoStatus: "auto_cancelled",
    });
    expect(body(filled).oneHouseExemptionProviso?.reason).toBe("rental_registration_4ho");
  });
});
