/**
 * E-1 후속 — 증여세 부담부증여 양도 경로의 1세대1주택 후속 입력 ③ 복원 · ⑧ 검증 · 게이트 leaf.
 *
 * ⑧은 양도세 계산기와 **같은 규칙 leaf**(`collectExemptionProvisoErrors` · `collectFinalHouseRestartErrors`)를
 * ⑤·④와 **같은 게이트**(`giftBurdenedProvisoMode` · `giftBurdenedFinalHouseRestartInScope`)로 건다 —
 * 칸이 없는 화면(1세대 OFF·3주택·범위 밖 증여일)에서 stale 값으로 막지 않는다.
 */
import { describe, it, expect } from "vitest";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import {
  giftBurdenedFinalHouseRestartInScope,
  giftBurdenedProvisoMode,
  giftBurdenedRegionCode,
  giftBurdenedRegulatedByAddress,
} from "@/lib/calc/gift-burdened-one-house";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

function item(over: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
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
      acquisitionDate: new Date("2018-03-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...over,
    },
  } as EstateItem;
}
const form = (giftDate: string, it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: [it] }) as FormState;
/** 부담부증여 양도세 검증이 있는 단계 — 증여재산 단계(1) */
const v = (giftDate: string, it: EstateItem) => validateStep(1, form(giftDate, it));

const FOUR_HO: Partial<BurdenedGiftTransferTaxInput> = {
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: "2018-06-01",
  proviso4hoRentalRegDate: "2018-06-01",
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "maintained",
  proviso4hoDuringMandatory: "no",
  proviso4hoRentOver5: "no",
};

describe("③ 복원 — JSON 왕복 후 normalize가 새 필드를 보존한다", () => {
  it("N-1 §154① 단서·4호·재기산 이력 그대로", () => {
    const fields: Partial<BurdenedGiftTransferTaxInput> = {
      ...FOUR_HO,
      provisoDepartureDate: "2020-01-01",
      finalHouseRestartHistory: "yes",
      finalHouseRestartDisposals: [{ id: "d1", kind: "gift", date: "2021-02-17", temporaryTwoHouse: "no" }],
    };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [item(fields)] }));
    const bgt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!;
    expect(bgt.acquisitionDate).toBeInstanceOf(Date);
    expect(bgt).toMatchObject(fields);
  });
});

describe("게이트 leaf — ⑤④⑧ 공용", () => {
  it("G-1 §154① 단서 맥락: 1주택 → one_house · 2주택+두 날짜 → temporary_two_house · 1세대 OFF·3주택·2주택 날짜 없음 → null", () => {
    const bgt = (o: Partial<BurdenedGiftTransferTaxInput>) => item(o).burdenedGiftTransferTax!;
    const tt = { previousAcquisitionDate: new Date("2018-03-01"), newAcquisitionDate: new Date("2020-06-01") };
    expect(giftBurdenedProvisoMode(bgt({}))).toBe("one_house");
    expect(giftBurdenedProvisoMode(bgt({ householdHousingCount: 2, temporaryTwoHouse: tt }))).toBe("temporary_two_house");
    expect(giftBurdenedProvisoMode(bgt({ isOneHousehold: false }))).toBeNull();
    expect(giftBurdenedProvisoMode(bgt({ householdHousingCount: 3 }))).toBeNull();
    expect(giftBurdenedProvisoMode(bgt({ householdHousingCount: 2 }))).toBeNull();
  });
  it("G-2 재기산 범위: 증여 2021-01-01~2022-05-09 · 1세대 · 1주택 · 등기", () => {
    const b = item().burdenedGiftTransferTax!;
    expect(giftBurdenedFinalHouseRestartInScope(b, "2021-01-01")).toBe(true);
    expect(giftBurdenedFinalHouseRestartInScope(b, "2022-05-09")).toBe(true);
    expect(giftBurdenedFinalHouseRestartInScope(b, "2020-12-31")).toBe(false);
    expect(giftBurdenedFinalHouseRestartInScope(b, "2022-05-10")).toBe(false);
    expect(giftBurdenedFinalHouseRestartInScope({ ...b, isUnregistered: true }, "2022-03-01")).toBe(false);
    expect(giftBurdenedFinalHouseRestartInScope({ ...b, householdHousingCount: 2 }, "2022-03-01")).toBe(false);
  });
  it("G-3 주소 → 법정동코드는 PNU 앞 10자리(계산기 `AssetSectionBasic`과 같은 규칙) · 표시값은 엔진 판정과 같은 함수", () => {
    expect(giftBurdenedRegionCode({ estateAddress: { pnu: "1168010100100120034" } })).toBe("1168010100");
    expect(giftBurdenedRegionCode({ estateAddress: { pnu: "116801010" } })).toBeUndefined();
    expect(giftBurdenedRegionCode({})).toBeUndefined();
    expect(giftBurdenedRegulatedByAddress("1168010100", new Date("2018-03-01"), "2021-06-01")).toEqual({
      atAcquisition: true,
      atGift: true,
    });
    expect(giftBurdenedRegulatedByAddress("1168010100", new Date("2017-08-02"), "")).toEqual({ atAcquisition: false });
    expect(giftBurdenedRegulatedByAddress(undefined, new Date("2018-03-01"), "2021-06-01")).toEqual({});
  });
});

describe("⑧ §154① 단서 — 보이는 칸만 필수", () => {
  it("V-P1 4호 선택 · 신청일 없음 → 차단 / 사실 입력 → 통과", () => {
    expect(v("2021-06-01", item({ provisoReason: "rental_registration_4ho" }))).toContain("사업자등록 신청일을 입력");
    expect(v("2021-06-01", item(FOUR_HO))).toBeNull();
  });
  it("V-P2 수용 사유 · 수용일 없음 → 차단 (2호가목 — 계산기와 같은 문구)", () => {
    expect(v("2021-06-01", item({ provisoReason: "expropriation" }))).toContain("수용일을 입력");
  });
  it("V-P3 부정 짝 — 카드가 숨는 맥락(1세대 OFF · 3주택)의 stale 사유는 막지 않는다", () => {
    expect(v("2021-06-01", item({ provisoReason: "rental_registration_4ho", isOneHousehold: false }))).toBeNull();
    expect(v("2021-06-01", item({ provisoReason: "rental_registration_4ho", householdHousingCount: 3 }))).toBeNull();
  });
});

describe("⑧ §154⑤ 단서 재기산 — 「있음」만 막는다", () => {
  it("V-F1 있음 · 처분 행 없음 → 차단 / 처분일이 증여일 뒤 → 차단 / 미답 → 통과(판정 보류)", () => {
    expect(v("2022-03-01", item({ finalHouseRestartHistory: "yes" }))).toContain("처분한 다른 주택을 1건 이상");
    expect(
      v(
        "2022-03-01",
        item({
          finalHouseRestartHistory: "yes",
          finalHouseRestartDisposals: [{ id: "d1", kind: "transfer", date: "2022-03-02", temporaryTwoHouse: "no" }],
        }),
      ),
    ).toContain("양도일 이전이어야");
    expect(v("2022-03-01", item())).toBeNull();
  });
  it("V-F2 부정 짝 — 범위 밖 증여일(2022-05-10)의 stale 이력은 막지 않는다", () => {
    expect(v("2022-05-10", item({ finalHouseRestartHistory: "yes" }))).toBeNull();
  });
});
