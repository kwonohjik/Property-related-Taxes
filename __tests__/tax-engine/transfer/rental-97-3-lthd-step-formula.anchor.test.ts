/**
 * anchor — 조특법 §97의3 특례 채택 시 장기보유특별공제 step 산식(상세명세서 2단계)
 *
 * 종전: 특례 채택 시 공제율이 「특례율 × 임대분 비율 + 일반율 × (1 − 비율)」 혼합값(67%)인데 step 산식이
 *   `300,000,000 × 67% | 보유 10년×2% = 67% (30% 한도)`처럼 표1 분해를 옆에 붙여 자기모순이었다
 *   (브라우저 실측 2026-11-02 — 같은 화면 §97의3 카드는 `281,250,000 × 70% + 18,750,000 × 20% = 200,625,000`).
 * 정정: 특례 채택 시 「임대기간 분 양도차익 × 특례 공제율 + 비임대 분 양도차익 × 일반 공제율」로 풀어 쓴다.
 *   표시 전용 — 공제액·세액 불변.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { rental97LthdFormula } from "@/lib/tax-engine/transfer-tax-lthd-steps";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 2016-03-01 등록·임대 개시(10년 이상 → 70%). 임대 개시 시 기준시가 2.1억 → 임대분 비율 (3.6−2.1)/(3.6−2.0) = 93.75% */
const R973 = {
  type: "rental_97_3" as const,
  registrationDate: D("2016-03-01"),
  rentalStartDate: D("2016-03-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-03-01"),
  isNationalHousingScale: true,
  officialPriceAtStart: 210_000_000,
  region: "capital" as const,
  isPrivateConstructionRental: false,
  rentalContinuesToTransfer: true,
  rentIncreaseViolated: false,
};

/** 2주택, 취득 2016-02-01 실가 3억 → 양도 2026-04-01 6억 (보유 10년 2개월 · 표1 20%) */
function twoHouse(reductions: Any[]) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("2016-02-01"),
      transferDate: D("2026-04-01"),
      householdHousingCount: 2,
      isOneHousehold: false,
      residencePeriodMonths: 0,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 360_000_000,
      reductions,
    } as Any),
    rates,
  ) as Any;
}

const lthdStep = (r: Any) => r.steps.find((s: Any) => s.label === "장기보유특별공제");

describe("§97의3 특례 채택 — 장특 step 산식 풀어쓰기 (표시 전용)", () => {
  it("임대분 93.75% — 임대기간 분 × 70% + 비임대 분 × 20%, 표1 분해·혼합율 미표시", () => {
    const r = twoHouse([R973]);
    // 세액 불변
    expect(r.rental97LthdDetail.rentalGainRatio).toBe(0.9375);
    expect(r.rental97LthdDetail.specialApplied).toBe(true);
    expect(r.longTermHoldingDeduction).toBe(200_625_000);
    expect(r.determinedTax).toBe(18_466_250);

    const f: string = lthdStep(r).formula;
    expect(lthdStep(r).amount).toBe(200_625_000);
    expect(f).toContain(
      "임대기간 분 양도차익 281,250,000 × 특례 공제율 70% + 비임대 분 양도차익 18,750,000 × 일반 공제율 20% = 200,625,000",
    );
    expect(f).toContain("조특법 §97의3");
    expect(f).toContain("보유기간 10년 2개월");
    expect(f).not.toContain("보유 10년×2%");
    expect(f).not.toContain("30% 한도");
    expect(f).not.toContain("× 67%");
  });

  it("비율 1(취득 즉시 임대) — 양도차익 × 70%", () => {
    const r = twoHouse([
      { ...R973, registrationDate: D("2016-02-01"), rentalStartDate: D("2016-02-01"), taxRegistrationDate: D("2016-02-01") },
    ]);
    expect(r.longTermHoldingDeduction).toBe(210_000_000);
    const f: string = lthdStep(r).formula;
    expect(f).toContain("양도차익 300,000,000 × 특례 공제율 70% = 210,000,000");
    expect(f).not.toContain("비임대 분");
    expect(f).not.toContain("보유 10년×2%");
  });

  it("대조군 — 특례 미선택이면 종전 표1 문구 그대로", () => {
    const r = twoHouse([]);
    expect(r.longTermHoldingDeduction).toBe(60_000_000);
    expect(lthdStep(r).formula).toBe("300,000,000 × 20% | 보유 10년×2% = 20% (30% 한도) | 보유기간 10년 2개월");
  });

  it("특례 미채택(1세대1주택 표2 80% > 특례) — 종전 표2 문구 그대로", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 2_000_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: D("2006-01-01"),
        transferDate: D("2026-06-01"),
        residencePeriodMonths: 120,
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtTransfer: 1_000_000_000,
        reductions: [{ ...R973, registrationDate: D("2016-01-01"), rentalStartDate: D("2016-01-01"), taxRegistrationDate: D("2016-01-01"), officialPriceAtStart: 400_000_000 }],
      } as Any),
      rates,
    ) as Any;
    expect(r.rental97LthdDetail.specialApplied).toBe(false);
    expect(r.longTermHoldingDeduction).toBe(480_000_000);
    const f: string = lthdStep(r).formula;
    expect(f).not.toContain("특례 공제율");
    expect(f).toContain("보유 20년×4%=40% + 거주 10년×4%=40% = 80%");
  });
});

describe("rental97LthdFormula 가드", () => {
  const echo = {
    id: "rental_97_3",
    isEligible: true,
    legalBasis: "조특법 §97의3",
    effectCategory: "long_term_holding_special",
    overrideRate: 0.7,
    rentalGainRatio: 0.9375,
    eligibleRentalYears: 10,
    baseLthdRate: 0.2,
    gainApplied: 300_000_000,
    rentalGainApplied: 281_250_000,
    nonRentalGainApplied: 18_750_000,
    deductionApplied: 200_625_000,
  } as Any;

  it("echo 공제액 ≠ 확정 공제액(§98의2 특칙 재할당 등) → null(종전 문구)", () => {
    expect(rental97LthdFormula(echo, 200_625_000)).not.toBeNull();
    expect(rental97LthdFormula(echo, 120_000_000)).toBeNull();
  });

  it("specialApplied false → null · undefined(구 이력) → 적용으로 렌더", () => {
    expect(rental97LthdFormula({ ...echo, specialApplied: false }, 200_625_000)).toBeNull();
    expect(rental97LthdFormula({ ...echo, specialApplied: undefined }, 200_625_000)).not.toBeNull();
  });

  it("§97의4(가산형)·echo 누락 → null", () => {
    expect(rental97LthdFormula({ ...echo, effectCategory: "long_term_holding_additional" }, 200_625_000)).toBeNull();
    expect(rental97LthdFormula({ ...echo, rentalGainApplied: undefined }, 200_625_000)).toBeNull();
    expect(rental97LthdFormula(undefined, 200_625_000)).toBeNull();
  });
});
