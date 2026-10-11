/**
 * 1h-G1-14 anchor(결정 #28 A) — 지분 부담부증여의 12억 고가주택 판정 가액 = **지분 증여가액 ÷ 지분율** (소령 §156①).
 *
 * 종전: 지분이면 판정 가액을 «물건 전체 보충적평가액»(기준시가·시가)으로 고정해, 담보(§66)·임대(§61⑤) 평가가 이기는 지분은
 * §156① 문언(실지거래가액 합계액에 타인 소유부분을 포함한 비율로 환산)보다 낮게 판정됐다. 단독 소유는 담보가 이기면 C로
 * 판정하므로 같은 집이 단독이면 고가주택, 지분이면 전액 비과세로 갈렸다.
 *
 * 영향: **담보·임대 평가가 이긴 지분만** 바뀐다. 보충적평가가 이기면 두 독법이 같은 값이라 세액 불변(C2 · B6·B7).
 * 시료: 1세대1주택 · 거주 120개월 · 취득 2009-03-01 → 증여 2024-03-01 · 물건 전체 기준시가 11억 · 취득시 5억.
 * 금액은 mock 세율표 실측 — 방향만 유효하다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { fractionalHighValueDenominator } from "@/lib/tax-engine/burdened-gift-valuation";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

const run = (bg: Partial<BurdenedGiftInfo>, ownershipRatio?: number) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferType: "burdened_gift",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2009-03-01"),
      transferPrice: 1,
      acquisitionPrice: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 120,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 0,
        mortgageDebtAmount: 0,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 1_100_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 500_000_000,
        ...bg,
      },
      ownershipRatio,
    }) as never,
    rates,
  );

describe("S1·C4 — 담보·임대 평가가 이긴 지분은 «지분 C ÷ 지분율»로 판정한다", () => {
  it("S1 ★ 지분 1/2 · 지분 담보 6.5억(→ 13억): 전액 비과세 0 → 고가주택 부분 비과세 233,537", () => {
    const r = run({ mortgageDebtAmount: 650_000_000 }, 0.5);
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(true);
    expect(r.exemptReason).toBe("1세대1주택 고가주택");
    expect(r.transferGain).toBe(392_500_000);
    expect(r.taxableGain).toBe(30_192_307);
    expect(r.totalTax).toBe(233_537);
    const bg = r.transferBurdenedGiftBreakdown!;
    expect(bg.sangjeungbeopValuation.selectedMode).toBe("mortgage");
    expect(bg.fractionalHighValueDenominator).toBe(1_300_000_000);
    expect(bg.wholePropertySupplementary).toBe(1_100_000_000); // 표시용 echo는 그대로
  });

  it("C4 ★ 지분 1/2 · 지분 담보 5억 · 연임대료 8,400만(임대평가 7억 → 14억): 비과세 0 → 고가주택 431,019", () => {
    const r = run({ mortgageDebtAmount: 500_000_000, annualRentTotal: 84_000_000 }, 0.5);
    expect(r.transferBurdenedGiftBreakdown!.sangjeungbeopValuation.selectedMode).toBe("rental");
    expect(r.transferBurdenedGiftBreakdown!.fractionalHighValueDenominator).toBe(1_400_000_000);
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBe(431_019);
  });

  it("C1 대조 — 같은 집을 단독으로(담보 13억) 넣으면 고가주택 632,076: 지분 S1과 같은 판정 가액(13억)", () => {
    const r = run({ mortgageDebtAmount: 1_300_000_000 });
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBe(632_076);
    expect(r.transferBurdenedGiftBreakdown!.fractionalHighValueDenominator).toBeUndefined();
  });
});

describe("C2 — 보충적평가가 이기면 두 독법이 같아 바뀌지 않는다(부정 짝)", () => {
  it("C2 지분 1/2 · 지분 담보 5억(< 보충적 5.5억): 물건 전체 11억 ≤ 12억 → 전액 비과세 그대로", () => {
    const r = run({ mortgageDebtAmount: 500_000_000 }, 0.5);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("24억 물건의 1/2 지분(보충적 승)은 종전처럼 과세 — 물건 전체로 판정한다(A4/#849)", () => {
    const r = run(
      { buildingStdPriceAtTransfer: 2_400_000_000, buildingStdPriceAtAcquisition: 800_000_000, mortgageDebtAmount: 500_000_000 },
      0.5,
    );
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.transferBurdenedGiftBreakdown!.fractionalHighValueDenominator).toBe(2_400_000_000);
  });
});

describe("경계 — 12억 정확히 / +1원 (판정 가액 = C ÷ 지분율)", () => {
  it("지분 C 6억 ÷ 0.5 = 12억 정확히 → 고가주택 아님(전액 비과세)", () => {
    const r = run({ mortgageDebtAmount: 600_000_000 }, 0.5);
    expect(r.isExempt).toBe(true); // 전액 비과세 조기 반환은 breakdown이 없다 — 판정 결과로 고정
  });
  it("지분 C 600,000,001 ÷ 0.5 = 12억+2 → 고가주택(부분 비과세)", () => {
    const r = run({ mortgageDebtAmount: 600_000_001 }, 0.5);
    expect(r.transferBurdenedGiftBreakdown!.fractionalHighValueDenominator).toBe(1_200_000_002);
    expect(r.isPartialExempt).toBe(true);
  });
});

describe("fractionalHighValueDenominator — 올림 · 부동소수 잡음", () => {
  const f = (max: number, ownershipRatio: number) =>
    fractionalHighValueDenominator({ selectedMode: "mortgage", max, wholePropertySupplementary: 1, ownershipRatio });
  it("정수 몫: 650,000,000 ÷ 0.5 = 1,300,000,000", () => {
    expect(f(650_000_000, 0.5)).toBe(1_300_000_000);
  });
  it("잡음: 700,000,000 ÷ 0.7 = 1,000,000,000.0000001 이 1,000,000,001 로 올라가지 않는다", () => {
    expect(700_000_000 / 0.7).toBeGreaterThan(1_000_000_000); // 전제: 단순 나눗셈은 잡음이 낀다
    expect(f(700_000_000, 0.7)).toBe(1_000_000_000);
    expect(f(550_000_000, 0.55)).toBe(1_000_000_000);
  });
  it("소수 몫은 올림 — 12억 초과 판정이 12억 + 0.4 에서 내려가지 않는다 (420,000,000 ÷ 0.35 = 12억 정확히, +1 → 12억+2.857)", () => {
    expect(f(420_000_000, 0.35)).toBe(1_200_000_000);
    expect(f(420_000_001, 0.35)).toBe(1_200_000_003);
  });
  it("보충적평가 승이면 100% 입력값을 그대로(나눗셈을 거치지 않음)", () => {
    expect(
      fractionalHighValueDenominator({ selectedMode: "supplementary", max: 550_000_001, wholePropertySupplementary: 1_100_000_003, ownershipRatio: 0.5 }),
    ).toBe(1_100_000_003);
  });
});
