// §97의4 통합 anchor (R-3 활성) — 장특공제 추가율 가산
//
// 효과: §95② 보유기간별 공제율에 임대기간별 추가율(6년 2%~10년 10%)을 "가산" (대체 아님).
// 가산 방식이므로 mock 표1 율에 무관하게 "일반율 + 추가율" 상대 비교로 anchor.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

describe("§97의4 통합 anchor (R-3 활성)", () => {
  const rates = makeMockRates();

  function input974() {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2024-06-01"), // 보유 8.4년
      isOneHousehold: true,
      householdHousingCount: 2, // 12억 비과세 미적용
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_4",
          registrationDate: new Date("2016-03-01"),
          rentalStartDate: new Date("2016-03-01"), // 임대 8.25년 → 추가율 6%
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          region: "capital",
          // D2-04 — 조특령 §97의4① → 소령 §167의3①2호 가목·다목 대상 요건.
          // 종전 픽스처엔 이 두 필드가 없어 기준시가 12억 주택도 §97의4를 적용받았다.
          rental974Category: "purchase_a",
          officialPriceAtStart: 500_000_000,
        },
      ],
    });
  }

  it("8년 임대 → 일반 장특율 + 추가율 6% 가산 (양도차익 5억 × 6% = 3천만 증가)", () => {
    const withR = calculateTransferTax(input974(), rates);
    const without = calculateTransferTax({ ...input974(), reductions: [] }, rates);

    expect(withR.rental97LthdDetail?.isEligible).toBe(true);
    expect((withR.rental97LthdDetail as { additionalRate?: number }).additionalRate).toBe(0.06);
    // 가산: 일반 공제율 + 0.06
    expect(withR.longTermHoldingRate).toBeCloseTo(without.longTermHoldingRate + 0.06, 10);
    // 양도차익 5억 × 6% = 30,000,000 추가 공제 (표1 율은 2% 배수 → floor 영향 없음)
    expect(withR.longTermHoldingDeduction).toBe(without.longTermHoldingDeduction + 30_000_000);
    expect(without.rental97LthdDetail).toBeUndefined();
  });

  it("10년 임대 → 추가율 10% 가산", () => {
    const base = input974();
    const tenYear = {
      ...base,
      acquisitionDate: new Date("2013-01-01"),
      reductions: [{ ...base.reductions[0], rentalStartDate: new Date("2013-06-01") } as (typeof base.reductions)[0]],
    };
    const withR = calculateTransferTax(tenYear, rates);
    expect((withR.rental97LthdDetail as { additionalRate?: number }).additionalRate).toBe(0.10);
  });

  /**
   * ⭐ 소재지 축 — 가목의 기준시가 한도는 수도권 밖에서 3억으로 좁아진다
   *    (소령 §167의3①2호 가목 괄호, `rental-97-4.ts:125`).
   *
   * 종전에는 폼에 소재지 ⑤ 라디오가 없어 `region`이 기본값 `"capital"`에 굳어 있었고,
   * 그래서 **이 분기가 영원히 도달하지 않았다** — 수도권 밖 3~6억 주택이 한도를 넘고도
   * 추가공제를 받았다(세액 과소). 아래 두 케이스는 같은 입력에서 소재지만 다르다.
   */
  it("🔑 가목 + 비수도권 → 기준시가 5억이 3억 한도 초과로 불적용 (종전 도달 불가)", () => {
    const base = input974();
    const nonCapital = {
      ...base,
      reductions: [
        { ...base.reductions[0], region: "non_capital" } as (typeof base.reductions)[0],
      ],
    };
    const capital = calculateTransferTax(base, rates);
    const outside = calculateTransferTax(nonCapital, rates);

    expect(capital.rental97LthdDetail?.isEligible).toBe(true);
    expect(outside.rental97LthdDetail?.isEligible).toBe(false);
    // 추가율 6%가 사라져 공제가 3천만 줄고, 그만큼 세액이 늘어난다.
    expect(capital.longTermHoldingDeduction - outside.longTermHoldingDeduction).toBe(30_000_000);
    expect(outside.totalTax).toBeGreaterThan(capital.totalTax);
  });

  it("다목(건설임대)은 소재지와 무관하게 6억 한도 — 비수도권에서도 적용된다", () => {
    const base = input974();
    const c = calculateTransferTax(
      {
        ...base,
        reductions: [
          {
            ...base.reductions[0],
            rental974Category: "construction_c",
            region: "non_capital",
          } as (typeof base.reductions)[0],
        ],
      },
      rates,
    );
    expect(c.rental97LthdDetail?.isEligible).toBe(true);
  });

  it("5년 임대 → 6년 미달 불적용 (추가율 0)", () => {
    const base = input974();
    const fiveYear = {
      ...base,
      transferDate: new Date("2021-06-01"), // 임대 5년
      reductions: [{ ...base.reductions[0] } as (typeof base.reductions)[0]],
    };
    const r = calculateTransferTax(fiveYear, rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
  });
});
