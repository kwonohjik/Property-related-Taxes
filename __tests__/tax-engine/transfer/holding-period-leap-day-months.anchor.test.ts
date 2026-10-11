/**
 * X4-2 anchor — 2/29 취득의 보유 **개월 성분**도 「민법」 §160③으로 센다
 *
 * 「소득세법」 §95④·§104② 보유기간은 취득일부터 양도일까지(초일 산입)이고, 「국세기본법」 §4를 거쳐
 * 「민법」 §160③ 「최종의 월에 해당일이 없는 때에는 그 월의 말일로 기간이 만료한다」가 적용된다.
 * 2024-02-29 취득의 1년은 2025-02-28에, 2년은 2026-02-28에 만료한다 — 평년 2/27 양도는 N년 미만이다.
 *
 * 종전 `calculateHoldingPeriod`는 연 성분만 §160③으로 맞추고 개월 성분은 date-fns `differenceInMonths`
 * (월말 보정)에 맡겨, 2/29 취득·평년 2/27 양도에서 `0y12m` · `1y12m`을 냈다.
 * 소비처가 `years * 12 + months`를 쓰는 단기세율(`holdingMonthsTotal`)·나중 취득 부수토지 2년·신고서 표가
 * 하루 일찍 한 단계 위(아래) 구간으로 넘어갔다 — 1년째 19,750,000 · 2년째 63,390,000 과소(2주택 5억 양도).
 */
import { describe, it, expect } from "vitest";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { completedMonthsInclusive } from "@/lib/tax-engine/civil-period";
import { isLaterAcquiredLandHeldTooShort } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { holdingMonthsFromDates } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const months = (a: string, t: string) => {
  const h = calculateHoldingPeriod(d(a), d(t));
  return h.years * 12 + h.months;
};
const rates = makeMockRates();

/** 2주택 · 비조정 · 취득가 3억/양도가 5억 — 단기세율만 갈린다 */
function tax(acq: string, tr: string) {
  const r = calculateTransferTax(
    baseTransferInput({
      acquisitionDate: d(acq),
      transferDate: d(tr),
      householdHousingCount: 2,
      residencePeriodMonths: 0,
    }) as TransferTaxInput,
    rates,
  );
  return { rate: r.appliedRate, tax: r.calculatedTax };
}

describe("X4-2 — 2/29 취득 보유 개월 (§160③)", () => {
  it("leaf: 2020-02-29 → 2021-02-27은 11개월, → 2021-02-28은 12개월 (긍정 짝)", () => {
    expect(months("2020-02-29", "2021-02-27")).toBe(11);
    expect(months("2020-02-29", "2021-02-28")).toBe(12);
    expect(months("2020-02-29", "2022-02-27")).toBe(23);
    expect(months("2020-02-29", "2023-02-27")).toBe(35);
    expect(calculateHoldingPeriod(d("2020-02-29"), d("2021-02-27"))).toMatchObject({ years: 0, months: 11 });
  });

  it("leaf: 개월 성분이 민법 기간 정본 `completedMonthsInclusive`와 전 구간 같다 (2/29 · 월말 · 일반)", () => {
    let n = 0;
    for (const y of [2015, 2019, 2020, 2023, 2024])
      for (let m = 0; m < 12; m++)
        for (const day of [1, 28, 29, 30, 31]) {
          const a = new Date(Date.UTC(y, m, day));
          if (a.getUTCMonth() !== m) continue;
          for (let k = 0; k <= 37; k++)
            for (const off of [-4, -3, -2, -1, 0, 1, 2]) {
              const t = new Date(Date.UTC(y, m + k, day + off));
              if (t < a) continue;
              const h = calculateHoldingPeriod(a, t);
              expect(h.years * 12 + h.months).toBe(completedMonthsInclusive(a, t));
              expect(h.months).toBeLessThanOrEqual(11);
              n++;
            }
        }
    expect(n).toBeGreaterThan(20000);
  }, 120_000);

  it("단기세율: 2024-02-29 취득 — 1년째 2/27은 70%, 2/28은 60% (§104①3호 → 2호)", () => {
    expect(tax("2024-02-29", "2025-02-27")).toEqual({ rate: 0.7, tax: 138_250_000 });
    expect(tax("2024-02-29", "2025-02-28")).toEqual({ rate: 0.6, tax: 118_500_000 });
  });

  it("단기세율: 2년째 2/27은 60%, 2/28은 기본세율 (§104①2호 → 1호)", () => {
    expect(tax("2024-02-29", "2026-02-27")).toEqual({ rate: 0.6, tax: 118_500_000 });
    expect(tax("2024-02-29", "2026-02-28").rate).toBe(0.38);
  });

  it("짝: 2/29가 아닌 취득(2024-03-01)은 변함없이 2025-02-27이 70%, 2/28이 60%", () => {
    expect(tax("2024-03-01", "2025-02-27")).toEqual({ rate: 0.7, tax: 138_250_000 });
    expect(tax("2024-03-01", "2025-02-28")).toEqual({ rate: 0.6, tax: 118_500_000 });
  });

  it("나중 취득 부수토지 2년: 2020-02-29 취득 → 2022-02-27 양도는 2년 미만, 2/28은 2년", () => {
    expect(isLaterAcquiredLandHeldTooShort(d("2020-02-29"), d("2015-01-01"), d("2022-02-27"))).toBe(true);
    expect(isLaterAcquiredLandHeldTooShort(d("2020-02-29"), d("2015-01-01"), d("2022-02-28"))).toBe(false);
  });

  it("신고서 표 보유 개월: 2/27 양도 11개월 · 2/28 양도 12개월", () => {
    expect(holdingMonthsFromDates("2020-02-29", "2021-02-27")).toBe(11);
    expect(holdingMonthsFromDates("2020-02-29", "2021-02-28")).toBe(12);
  });
});

describe("X4-2 파급 — 종전 date-fns 허용 범위(문자열·undefined)를 그대로 받는다", () => {
  it("ISO 문자열 입력은 Date 입력과 같은 값", () => {
    const viaDate = calculateHoldingPeriod(d("2020-02-29"), d("2021-02-27"));
    expect(calculateHoldingPeriod("2020-02-29" as unknown as Date, "2021-02-27" as unknown as Date)).toEqual(viaDate);
  });
  it("undefined·Invalid Date는 throw하지 않고 NaN (종전 동작 — 호출부 가드가 있는 표시 경로가 깨지지 않는다)", () => {
    expect(() => calculateHoldingPeriod(undefined as unknown as Date, d("2021-02-27"))).not.toThrow();
    expect(calculateHoldingPeriod(undefined as unknown as Date, d("2021-02-27")).years).toBeNaN();
    expect(calculateHoldingPeriod(new Date("invalid"), d("2021-02-27")).months).toBeNaN();
  });
});
