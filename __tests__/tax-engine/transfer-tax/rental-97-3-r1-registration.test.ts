// §97의3 R-1 — 등록일별 공제율 경과규정 (8년 50% / 10년 70%)
//
// 법령: 등록 ~2022.12.31 → 8년↑ 50% / 10년↑ 70% · 등록 2023.1.1~ → 10년↑ 70%만 (8년 유형 폐지)
// 출처(2026-09-14 법제처 원문 확보 — 종전의 「도구 미지원으로 추후 보강」은 오진이었다):
//   · 경과조치 = 법률 제19199호 부칙 §38 (이 법 시행 전 등록분은 종전의 규정)
//   · 종전 문언 = 2022-12-08 시행본(mst 237393) §97의3① (본문 100분의 50 · 단서 10년↑ 100분의 70 · ①1호 8년↑)
//   · 조회 = 저장소 `fetchLawVersions`/`fetchEflawArticle` (법제처 target=eflaw)
// ⚠️ 같은 종전 문언에 **등록 시한**(매입 2020.12.31 / 건설 2022.12.31)이 있다 —
//    그 축은 `__tests__/tax-engine/transfer/rental-97-3-purchase-reg-deadline.anchor.test.ts`가 지킨다.
//    아래 픽스처는 `isPrivateConstructionRental: true`라 시한 축과 무관하다.
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
          // D2-07 — 2023.1.1 이후 등록분은 §97의3①이 민간건설임대주택에 한정한다.
          // (법률 제19199호 부칙 §38에 따라 그 전 등록분은 종전 규정 — 아래 C-1·C-4는 무영향)
          isPrivateConstructionRental: true,
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
