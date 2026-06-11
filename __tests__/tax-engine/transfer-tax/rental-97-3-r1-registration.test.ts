// §97의3 R-1 — 등록일별 공제율 경과규정 (8년 50% / 10년 70%)
//
// 법령: 등록 ~2022.12.31 → 8년↑ 50% / 10년↑ 70% · 등록 2023.1.1~ → 10년↑ 70%만 (8년 유형 폐지)
// 출처: 사용자(세무 전문가) 제공 + 2022 세법개정 부칙. KoreanLaw 연혁 본문·부칙 직접조회 도구
//       미지원(efYd·연혁 MST NOT_FOUND) — 부칙 조항 직접 인용은 추후 보강.
// cutoff = 2023-01-01 (registrationDate < cutoff 이면 구법 8년 50% 적용 가능).
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

describe("§97의3 R-1 등록일별 공제율", () => {
  const rates = makeMockRates();

  function build(opts: { reg: Date; rentalStart: Date; transfer: Date }) {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: opts.rentalStart, // 즉시 임대 → 안분 ratio 1
      transferDate: opts.transfer,
      isOneHousehold: true,
      householdHousingCount: 2, // 거주주택 + 임대주택 — 12억 비과세 미적용
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_3",
          registrationDate: opts.reg,
          rentalStartDate: opts.rentalStart,
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          officialPriceAtStart: 400_000_000,
          isNationalHousingScale: true,
          region: "capital",
          propertyType: "non_apartment",
          rentalHousingType: "long_term_private",
          isConvertedFromShortTerm: false,
        },
      ],
    });
  }

  function overrideRateOf(r: ReturnType<typeof calculateTransferTax>): number | undefined {
    return (r.rental97LthdDetail as { overrideRate?: number } | undefined)?.overrideRate;
  }

  it("C-1: 등록 2014(≤2022.12.31) + 8년 임대 → 50% 특례 (공제 2.5억)", () => {
    const r = calculateTransferTax(
      build({ reg: new Date("2014-01-01"), rentalStart: new Date("2014-01-01"), transfer: new Date("2022-06-01") }),
      rates,
    );
    expect(r.rental97LthdDetail?.isEligible).toBe(true);
    expect(overrideRateOf(r)).toBe(0.5);
    expect(r.longTermHoldingRate).toBeCloseTo(0.5, 10);
    expect(r.longTermHoldingDeduction).toBe(250_000_000); // 양도차익 5억 × 50%
  });

  it("C-2: 등록 2023-06(≥2023.1.1) + 8년 임대 → 불적용 (8년 유형 폐지)", () => {
    const r = calculateTransferTax(
      build({ reg: new Date("2023-06-01"), rentalStart: new Date("2023-06-01"), transfer: new Date("2031-12-01") }),
      rates,
    );
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
    expect(r.longTermHoldingRate).toBeLessThan(0.5); // 일반 장특율로 폴백
    expect(r.longTermHoldingDeduction).not.toBe(250_000_000);
  });

  it("C-3: 등록 2023-06 + 10년 임대 → 70% (10년은 등록일 무관, 공제 3.5억)", () => {
    const r = calculateTransferTax(
      build({ reg: new Date("2023-06-01"), rentalStart: new Date("2023-06-01"), transfer: new Date("2033-12-01") }),
      rates,
    );
    expect(r.rental97LthdDetail?.isEligible).toBe(true);
    expect(overrideRateOf(r)).toBe(0.7);
    expect(r.longTermHoldingDeduction).toBe(350_000_000); // 양도차익 5억 × 70%
  });

  it("C-4: 등록 2022-12-31 경계(cutoff 미만) + 8.5년 임대 → 50%", () => {
    const r = calculateTransferTax(
      build({ reg: new Date("2022-12-31"), rentalStart: new Date("2022-12-31"), transfer: new Date("2031-06-01") }),
      rates,
    );
    expect(r.rental97LthdDetail?.isEligible).toBe(true);
    expect(overrideRateOf(r)).toBe(0.5);
  });

  it("C-5: 등록 2023-01-01 경계(=cutoff, 불포함) + 8.5년 임대 → 불적용", () => {
    const r = calculateTransferTax(
      build({ reg: new Date("2023-01-01"), rentalStart: new Date("2023-01-01"), transfer: new Date("2031-06-01") }),
      rates,
    );
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
  });
});
