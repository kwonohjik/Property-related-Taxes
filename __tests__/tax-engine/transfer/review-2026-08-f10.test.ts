/**
 * F10 — §155 의제 1세대1주택(일시적 2주택·합가·농어촌·수도권 밖 부득이)에 LTHD 표2가 적용되어야 한다.
 *
 * 위임 체인:
 *   「소득세법」 §95② **표 외의 부분 단서** — 「대통령령으로 정하는 1세대 1주택」에 해당하는 자산은 표2
 *   → 「소득세법 시행령」 §159의4 — 「1주택(**제155조**ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의
 *      규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하**고** 보유기간 중 거주기간이 2년 이상인 것」
 *
 * 즉 표2 「1주택」은 실제 보유 주택 수가 아니라 **의제를 포함한 개념**이다. 표2 게이트가
 * `householdHousingCount === 1`만 보고 있어, `checkExemption`이 §155①④⑤⑦⑧으로 1세대1주택 의제를
 * 인정해 12억 초과분만 과세한 뒤에도 장특이 표1(최대 30%)로 떨어졌다.
 *
 * 술어는 `checkExemption`의 판정 결과 하나다(B안) — 주택 수를 깎는 방식(A안)은 `checkExemption`이
 * `householdHousingCount === 2`로 의제 분기를 게이팅하므로 의제 판정 자체를 도달 불가로 만든다.
 *
 * ⚠️ 이번 범위는 **§155①④⑤⑦⑧**뿐이다. §155의2·§156의2·§156의3은 같은 괄호에 열거돼 있으나
 *    손대지 않았다(별건 백로그).
 * ⚠️ 거주 2년 요건(연언)은 그대로 유지된다 — 의제만으로 표2가 열리지 않는다.
 *
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 2017-05-02 취득 5억 → 2026-02-16 양도 14억(고가) · 거주 96개월 · 비조정 · 2주택 */
const highValue = (over: Partial<TransferTaxInput>): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_400_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2017-05-02"),
    transferDate: new Date("2026-02-16"),
    residencePeriodMonths: 96,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    householdHousingCount: 2,
    isOneHousehold: true,
    ...over,
  });

const DEEMED_CASES: Array<[string, Partial<TransferTaxInput>, string]> = [
  [
    "§155① 일시적 2주택",
    {
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2017-05-02"),
        newAcquisitionDate: new Date("2025-06-01"),
      },
    },
    "일시적 2주택 고가주택",
  ],
  [
    "§155⑤ 혼인 합가",
    { marriageMerge: { marriageDate: new Date("2024-01-01") }, isFirstTransferredInMerge: true },
    "혼인 합가 (§155⑤) 고가주택",
  ],
  [
    "§155④ 동거봉양 합가",
    { parentalCareMerge: { mergeDate: new Date("2024-01-01") }, isFirstTransferredInMerge: true },
    "동거봉양 합가 (§155④) 고가주택",
  ],
  [
    "§155⑦1호 상속 농어촌",
    {
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 6 },
    },
    "농어촌주택 고가주택 (§155⑦1호 상속)",
  ],
  [
    "§155⑧ 수도권 밖 부득이",
    { unavoidableOutsideCapitalHouse: { reason: "work" } },
    "수도권 밖 부득이한 사유 주택 고가주택 (§155⑧ 근무상 형편)",
  ],
];

describe("F10 — §155 의제 1세대1주택에 §95② 표2가 적용된다 (영 §159의4)", () => {
  it("대조군: 순수 1주택 고가주택 → 표2 64%", () => {
    const r = calculateTransferTax(highValue({ householdHousingCount: 1 }), rates);
    expect(r.exemptReason).toBe("1세대1주택 고가주택");
    expect(r.taxableGain).toBe(128_571_428);
    expect(r.longTermHoldingRate).toBe(0.64);
    expect(r.longTermHoldingDeduction).toBe(82_285_713);
    expect(r.totalTax).toBe(5_838_642);
  });

  for (const [label, over, reason] of DEEMED_CASES) {
    it(`${label} 고가주택 → 표2 64% (대조군과 동일)`, () => {
      const r = calculateTransferTax(highValue(over), rates);
      expect(r.exemptReason).toBe(reason);
      expect(r.taxableGain).toBe(128_571_428);
      // 수정 전: rate 0.16 · 공제 20,571,428 · 총세액 23,633,500 (17,794,858 과다과세)
      expect(r.longTermHoldingRate).toBe(0.64);
      expect(r.longTermHoldingDeduction).toBe(82_285_713);
      expect(r.totalTax).toBe(5_838_642);
    });
  }

  it("산식 표시도 표2 문구로 바뀐다 (rate↔display drift 방지)", () => {
    const r = calculateTransferTax(highValue(DEEMED_CASES[0][1]), rates);
    const formula = r.steps.find((s) => s.label === "장기보유특별공제")?.formula;
    // 수정 전: "128,571,428 × 16% | 보유 8년×2% = 16% (30% 한도) | 보유기간 8년 9개월"
    expect(formula).toBe(
      "128,571,428 × 64% | 보유 8년×4%=32% + 거주 8년×4%=32% = 64% | 보유기간 8년 9개월",
    );
  });

  it("거주 2년 미만이면 의제여도 표2가 열리지 않는다 (§159의4 연언 요건 유지)", () => {
    const r = calculateTransferTax(
      highValue({ ...DEEMED_CASES[0][1], residencePeriodMonths: 12 }),
      rates,
    );
    // 표1 8년×2% = 16% — 의제만으로 표2가 열리지 않음을 고정한다.
    expect(r.longTermHoldingRate).toBe(0.16);
    expect(r.longTermHoldingDeduction).toBe(20_571_428);
  });

  it("의제가 성립하지 않으면(요건 미충족) 종전대로 표1", () => {
    // §155① 기한 초과(신규 취득 2020-06-01 → 양도 2026-02-16) → 의제 불성립 · 비과세도 없음.
    const r = calculateTransferTax(
      highValue({
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2017-05-02"),
          newAcquisitionDate: new Date("2020-06-01"),
        },
      }),
      rates,
    );
    expect(r.exemptReason).toBeUndefined();
    expect(r.longTermHoldingRate).toBe(0.16);
  });
});
