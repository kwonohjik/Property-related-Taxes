/**
 * 1원 오차 2건 (2026-10-11 재실측 #6·#7) — 둘 다 납세자 불리 방향.
 *
 * #6 겸용·재개발 장기보유특별공제 = 차익 × 공제율. 공제율이 double 합(보유분 + 거주분 · 표1 + §97의4 가산)이라
 *    0.36 + 0.32 = 0.6799999999999999처럼 내려가면 `applyRate`(floor(a × r))가 1원 적었다. 일반 경로는 PR #2044(F-1)에서
 *    `applyLthdRate`(= `applyFairMarketRatio`, 소수 4자리 정수 분수)로 고쳤고 겸용·재개발만 남아 있었다.
 * #7 임대기간 분 비율(조특령 §97의3⑤·§97의5②) = 기준시가 차의 분수인데 double로 곱해 1원 적었다(§97의5 감면 64,999,999 / 정확 65,000,000).
 *    → `calcRentalGainFraction`(정수 분자·분모) + `applyRentalGainShare`.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUse } from "@/__tests__/tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "@/__tests__/tax-engine/_helpers/mixed-use-fixture";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import {
  applyRentalGainShare,
  calcRentalGainFraction,
  calcRentalGainRatio,
} from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import { applyLthdToGain } from "@/lib/tax-engine/redevelopment-lthd";
import { applyRental97LthdSpecial } from "@/lib/tax-engine/transfer-tax-redevelopment-lthd";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const D0 = (s: string) => new Date(`${s}T00:00:00`);

describe("#6 겸용 장기보유특별공제 — 공제율 0.36 + 0.32(double 0.6799…)", () => {
  const run = (price: number) =>
    calcMixedUse(
      price,
      D("2026-06-01"),
      // 건물 2017-06-01 → 보유 9년 · 거주 8년 → 표2 건물분 0.36 + 0.32. 토지분(1992 취득)도 기본통칙 95-0…1로
      // max(표1 30%, 표2 건물 9년 36% + 거주 32%) = 같은 0.68이다(종전 토지 자신의 연수로 표2 72%).
      { ...mixedUseCase14(), buildingAcquisitionDate: D("2017-06-01"), residencePeriodYears: 8, table2ResidencePeriodYears: 8 },
      makeMockRates(),
    );
  it("전제: 공제율이 double로 내려가 있다", () => {
    expect(run(3_000_000_000).housingPart.longTermDeductionRate).toBe(0.6799999999999999);
  });
  // 통칙 95-0…1 반영(2026-10-18) 후에도 이 양도가액에서 double 곱셈이면 68,672,413 — 정수 분수연산이 1원을 지킨다(뮤테이션 실측).
  it("양도가액 2,598,888,829 → 주택분 장특 68,672,413(double) → 68,672,414 · 결정세액 201,041,779", () => {
    const r = run(2_598_888_829);
    expect(r.housingPart.longTermDeductionAmount).toBe(68_672_414);
    expect(r.total.transferTax).toBe(201_041_779);
  });
  it("토지분만 내려가는 경우 — 토지 2017 · 건물 2012 취득, 양도가액 2,606,666,242 → 주택분 장특 74,541,602 (종전 74,541,601)", () => {
    const r = calcMixedUse(
      2_606_666_242,
      D("2026-06-01"),
      { ...mixedUseCase14(), landAcquisitionDate: D("2017-06-01"), buildingAcquisitionDate: D("2012-06-01"), residencePeriodYears: 8, table2ResidencePeriodYears: 8 },
      makeMockRates(),
    );
    expect(r.housingPart.longTermDeductionAmount).toBe(74_541_602);
  });
  it("부정형 짝 — 곱이 정수가 아닌 양도가액(30억)은 double 곱셈과 같다 (192,521,486 · 260,638,355)", () => {
    const r = run(3_000_000_000);
    expect(r.housingPart.longTermDeductionAmount).toBe(192_521_486);
    expect(r.total.transferTax).toBe(260_638_355);
  });
});

describe("#6 재개발 장기보유특별공제 leaf `applyLthdToGain`", () => {
  it("10,000 × (0.36 + 0.32) = 6,800 (종전 6,799)", () => {
    expect(applyLthdToGain(10_000, 0.36 + 0.32)).toBe(6_800);
  });
});

describe("#7 임대기간 분 비율 — 정수 분수", () => {
  // E 취득 3억 · B 임대종료 5.6억 · D 양도 6.4억 → (5.6 − 3) / (6.4 − 3) = 13/17
  const base = {
    id: "rental_97_5", acquisitionDate: D0("2014-06-01"), registrationDate: D0("2014-08-01"), rentalStartDate: D0("2014-09-01"),
    isPurchaseRental: true, // §97의5①1호 매입임대 (리뷰 6번 — 미입력은 불충족)
    transferDate: D0("2026-07-01"), isTaxRegistered: true, rentIncreaseViolated: false, isNationalHousingScale: true, region: "capital",
    stdPriceAtAcquisition: 300_000_000, officialPriceAtStart: 320_000_000, stdPriceAtTransfer: 640_000_000,
    rentalContinuesToTransfer: false, stdPriceAtRentalEnd: 560_000_000,
    // §97의5①2호 — 조기 종료면 10년 판정의 종점(임대 종료일)이 필수다 (2026-11-01 정정)
    rentalEndDate: D0("2025-06-01"),
  };
  it("§97의5 감면세액 = 산출세액 × 13/17 정확값 (85,000,000 → 65,000,000 · 종전 64,999,999)", () => {
    for (const [tax, want] of [[85_000_000, 65_000_000], [170_000_000, 130_000_000]] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = evaluateRental975({ ...base, calculatedTax: tax } as any) as any;
      expect(r.isEligible).toBe(true);
      expect(r.reductionAmount).toBe(want);
      expect(r.rentalGainFraction).toEqual({ num: 260_000_000, den: 340_000_000 });
    }
  });
  it("§97의3 평가 결과도 분수를 싣는다 — 분자 감수는 임대개시일 기준시가 C(5.6억 − 3.2억 = 2.4억)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = evaluateRental973({ ...base, id: "rental_97_3", stdPriceAtRentalStart: 320_000_000, rentalType: "long_term_general", registrationDate: D0("2014-08-01") } as any) as any;
    expect(r.isEligible).toBe(true);
    expect(r.rentalGainFraction).toEqual({ num: 240_000_000, den: 340_000_000 });
  });
  it("`applyRentalGainShare`: 분수가 있으면 정확, 없으면 비율", () => {
    expect(applyRentalGainShare(85_000_000, { rentalGainRatio: 13 / 17, rentalGainFraction: { num: 13, den: 17 } })).toBe(65_000_000);
    expect(applyRentalGainShare(85_000_000, { rentalGainRatio: 1 })).toBe(85_000_000);
  });
  it("`calcRentalGainRatio`는 분수에서 파생 — 클램프 포함 같은 값", () => {
    const args = {
      rentalStartDate: D0("2014-09-01"), acquisitionDate: D0("2014-06-01"), numeratorBase: "acquisition" as const,
      stdPriceAtAcquisition: 300_000_000, stdPriceAtTransfer: 640_000_000, stdPriceAtRentalEnd: 560_000_000, rentalContinuesToTransfer: false,
    };
    expect(calcRentalGainRatio(args)).toBe(260_000_000 / 340_000_000);
    expect(calcRentalGainFraction({ ...args, stdPriceAtRentalEnd: 900_000_000 })).toEqual({ num: 340_000_000, den: 340_000_000 });
    expect(calcRentalGainFraction({ ...args, stdPriceAtRentalEnd: 200_000_000 })).toEqual({ num: 0, den: 340_000_000 });
    expect(calcRentalGainFraction({ ...args, rentalStartDate: D0("2014-01-01"), rentalContinuesToTransfer: true })).toEqual({ num: 1, den: 1 });
  });
});

describe("#6·#7 재개발 장특 특례 `applyRental97LthdSpecial` — 분기 공제율 0.36 + 0.32", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branch = (gain: number, lthdRate: number) => ({ gain, lthdRate, lthd: 0 }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (a: number, b: number, rate: number): any => ({
    preApproval: branch(a, rate), postApprovalExistingHouse: branch(b, rate), settlement: branch(0, 0),
    total: { gain: a + b, lthd: 0, taxableIncome: a + b },
  });
  it("§97의3 — 임대분(13/17) × 0.7 + 비임대분 × 0.68: 5,100 → 2,730 + 816 · 1,700 → 910 + 272 = 4,728 (종전 4,726)", () => {
    const r = applyRental97LthdSpecial(result(5_100, 1_700, 0.36 + 0.32), {
      overrideRate: 0.7, rentalGainRatio: 13 / 17, rentalGainFraction: { num: 13, den: 17 },
    });
    expect(r.preApproval.lthd).toBe(3_546);
    expect(r.postApprovalExistingHouse.lthd).toBe(1_182);
    expect(r.total.lthd).toBe(4_728);
  });
  it("§97의4 — 0.36 + 가산 0.32: 10,000 → 6,800 (종전 6,799)", () => {
    const r = applyRental97LthdSpecial(result(10_000, 0, 0.36), { rentalGainRatio: 1, additionalRate: 0.32 });
    expect(r.preApproval.lthd).toBe(6_800);
  });
});

describe("#7 §97의3 장특 임대분 안분 — 전체 계산 경로", () => {
  it("양도차익 6억 · (4.55억 − 4억)/(6억 − 3억) = 55/300 → 임대분 차익 110,000,000 (종전 109,999,999)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000, transferDate: D0("2029-07-01"), acquisitionPrice: 300_000_000, acquisitionDate: D0("2014-01-01"),
        isOneHousehold: false, householdHousingCount: 2, standardPriceAtAcquisition: 300_000_000, standardPriceAtTransfer: 600_000_000,
        reductions: [{
          type: "rental_97_3", registrationDate: D0("2014-02-01"), rentalStartDate: D0("2018-01-01"), isTaxRegistered: true,
          officialPriceAtStart: 400_000_000, stdPriceAtRentalStart: 400_000_000, isNationalHousingScale: true, region: "capital",
          propertyType: "apartment", rentalHousingType: "long_term_private", rentalContinuesToTransfer: false, stdPriceAtRentalEnd: 455_000_000,
        }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      makeMockRates(),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = r.rental97LthdDetail as any;
    expect(d.gainApplied).toBe(600_000_000);
    expect(d.rentalGainApplied).toBe(110_000_000);
  });
});
