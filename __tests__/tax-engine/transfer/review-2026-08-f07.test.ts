/**
 * anchor F07 — §155⑳ 특례의 **12억 고가주택 분모**는 「물건 전체 양도가액」이다 (지분 모드)
 *
 * [결함] `runRentalHousingExceptionStep`가 `calculateRentalHousingException`에 넘기는 `S`를
 *   `effectiveInput.transferPrice`(= 지분 모드에서 **본인 지분 안분액**)로 고정했다.
 *   그 `S`는 특례 모듈에서 ⓐ 12억 초과 판정(`index.ts` A/B 분기·`prhp-allocation.ts` B1/B2 분기)
 *   ⓑ (S−12억)/S 안분 분모로 쓰인다. ⇒ 총 20억 물건의 1/2 지분(본인 10억)이 「12억 이하」로
 *   판정돼 RH-A1(전액 비과세)로 빠졌다.
 *
 * [정본] 이 저장소의 12억 분모는 **총 물건가**다 — `calcOneHouseProration`
 *   (`transfer-tax-helpers.ts`) · `resolveTaxableGain`(`transfer-tax-taxable-gain.ts`) ·
 *   `checkExemption`(`transfer-tax-exemption.ts`)이 모두 `totalPropertyTransferPrice`를 본다.
 *   지분 모드는 `transferPrice`에 지분 안분액을, 총 물건가는 `totalPropertyTransferPrice`에
 *   따로 싣는다(`lib/calc/transfer-tax-api.ts` 지분 분기).
 *
 * [법령]
 *  · 「소득세법 시행령」 제155조 제20항 — 거주주택을 "국내에 1개의 주택을 소유하고 있는 것으로
 *    보아 **제154조제1항을 적용**한다". ⇒ 특례의 효과는 주택 수 의제뿐이고, 고가주택 판정은
 *    §154①의 위임인 §156①(고가주택 = 양도가액 12억 초과)이 정한다.
 *  · 「소득세법」 제89조 제1항 제3호 단서 · 「소득세법 시행령」 제160조① — 고가주택 과세
 *    양도차익 = 양도차익 × (양도가액 − 12억) / 양도가액. **공유지분 양도라도 「양도가액」은
 *    그 주택(물건) 전체의 가액**이라는 것이 이 저장소의 확립된 축이다.
 *  · 「소득세법 시행령」 제161조②2호 — B2 2호도 같은 (S − 12억)/S 항을 쓴다.
 *
 * [기대값 독립 도출 — 엔진 출력을 베끼지 않는다]
 *   공통: 취득 2018-01-01 · 양도 2026-03-01(보유 8년 2개월) · 거주 36개월
 *   §95② 표2 = min(8년×4%, 40%) + min(3년×4%, 40%) = 32% + 12% = **44%**
 *   §95② 표1 = min(8년×2%, 30%) = **16%**
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalUnit = {
  businessRegistrationDate: D("2015-06-01"),
  rentalRegistrationDate: D("2015-06-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "non-metro" as const,
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000,
  hasMinimum2Units: false,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const rheA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [rentalUnit],
};

/** B 시나리오(직전거주주택보유주택) — §161 기준시가 3시점 */
const rheB: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "B",
  rentalUnits: [rentalUnit],
  priorResidenceTransferDate: D("2021-08-25"),
  standardPriceAtAcquisition: 300_000_000,
  standardPriceAtPriorTransfer: 450_000_000,
  standardPriceAtTransfer: 500_000_000,
};

function fixture(o: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2026-03-01"),
    residencePeriodMonths: 36,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    ...o,
  });
}

describe("F07 · §155⑳ A 시나리오 — 12억 판정 분모 = 총 물건가", () => {
  /**
   * 공유 지분 1/2 · 총 물건가 20억 · 본인 지분 양도가 10억 · 본인 지분 취득가 4억.
   * 본인 지분 양도차익 = 1,000,000,000 − 400,000,000 = 600,000,000
   */
  const fractional = calculateTransferTax(
    fixture({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      totalPropertyTransferPrice: 2_000_000_000,
      rentalHousingException: rheA,
    }),
    rates,
  );

  it("F07-A1: 총 물건가 20억이면 RH-A1(전액 비과세)이 아니라 RH-A2(고가주택 안분)다", () => {
    expect(fractional.rentalHousingExceptionDetail?.applied).toBe(true);
    // 종전에는 본인 지분가 10억 ≤ 12억이라 RH-A1 · isExempt=true · 세액 0이었다.
    expect(fractional.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(fractional.isExempt).toBe(false);
  });

  it("F07-A2: 과세 양도소득금액 = gain95(표2) × (총 물건가 − 12억) / 총 물건가", () => {
    // gain95(표2) = 600,000,000 − floor(600,000,000 × 0.44) = 600,000,000 − 264,000,000
    expect(fractional.rentalHousingExceptionDetail!.formulaTrace.gain95Table2).toBe(336_000_000);
    // floor(336,000,000 × (2,000,000,000 − 1,200,000,000) / 2,000,000,000) = floor(336,000,000 × 0.4)
    expect(fractional.rentalHousingExceptionDetail!.taxableGain).toBe(134_400_000);
    expect(fractional.taxableGain).toBe(134_400_000);
    // 종전(결함) 값 0 — 전액 비과세로 빠졌다.
  });

  it("F07-A3: 세액 — 과세표준 131,900,000 × 35% − 누진공제 15,440,000", () => {
    expect(fractional.taxBase).toBe(131_900_000); // 134,400,000 − 기본공제 2,500,000
    expect(fractional.calculatedTax).toBe(Math.floor(131_900_000 * 0.35) - 15_440_000);
    expect(fractional.calculatedTax).toBe(30_725_000);
    expect(fractional.localIncomeTax).toBe(3_072_500);
    expect(fractional.totalTax).toBe(33_797_500); // 종전 0 → 33,797,500 과소였다
  });

  it("F07-A4: 12억 축이 일반 경로(§89①3호 단서)와 같다 — 특례 ON/OFF 세액 일치 (핵심 등식)", () => {
    // 특례를 끄면 일반 1세대1주택 부분과세 경로를 탄다. 두 경로는 「12억 안분 → 표2 장특」의
    // **순서만** 다르고 축은 같아야 한다(특례는 §154①을 적용하라고 할 뿐 분모를 바꾸지 않는다).
    // ⚠️ 이 픽스처에서는 두 순서의 floor 결과가 정확히 일치한다(나누어떨어짐).
    const off = calculateTransferTax(
      fixture({
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        totalPropertyTransferPrice: 2_000_000_000,
      }),
      rates,
    );
    expect(off.isPartialExempt).toBe(true);
    expect(off.totalTax).toBe(33_797_500);
    expect(fractional.totalTax).toBe(off.totalTax);
  });

  it("F07-A5: 본인 지분가만으로도 12억 초과인 경우 — 분모가 총 물건가로 바뀐다", () => {
    // 총 40억 · 1/2 지분(본인 20억) · 본인 취득가 4억 → 본인 양도차익 1,600,000,000
    // gain95(표2) = 1,600,000,000 − floor(1,600,000,000 × 0.44) = 896,000,000
    const r = calculateTransferTax(
      fixture({
        transferPrice: 2_000_000_000,
        acquisitionPrice: 400_000_000,
        totalPropertyTransferPrice: 4_000_000_000,
        householdHousingCount: 2, // 임대주택을 주택 수에 산입한 현실 케이스
        rentalHousingException: rheA,
      }),
      rates,
    );
    expect(r.rentalHousingExceptionDetail!.formulaTrace.gain95Table2).toBe(896_000_000);
    // floor(896,000,000 × (4,000,000,000 − 1,200,000,000) / 4,000,000,000) = floor(896,000,000 × 0.7)
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(627_200_000);
    // 종전(결함): 분모가 본인 지분가 20억 → floor(896,000,000 × 0.4) = 358,400,000 (268,800,000 과소)
    expect(r.taxBase).toBe(624_700_000);
    expect(r.calculatedTax).toBe(Math.floor(624_700_000 * 0.42) - 35_940_000);
    expect(r.calculatedTax).toBe(226_434_000);
    expect(r.totalTax).toBe(249_077_400); // 종전 128,062,000
  });

  it("F07-A6: 단독소유(지분 모드 아님)는 무변화 — totalPropertyTransferPrice 미설정", () => {
    // 양도가 20억 단독 · 취득 4억 — 분모가 곧 transferPrice라 종전과 같은 값이어야 한다.
    const solo = calculateTransferTax(
      fixture({
        transferPrice: 2_000_000_000,
        acquisitionPrice: 400_000_000,
        householdHousingCount: 2,
        rentalHousingException: rheA,
      }),
      rates,
    );
    expect(solo.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
    expect(solo.rentalHousingExceptionDetail!.taxableGain).toBe(358_400_000);
    expect(solo.totalTax).toBe(128_062_000);
  });
});

describe("F07 · §155⑳ B 시나리오(§161 안분) — 12억 판정 분모 = 총 물건가", () => {
  /**
   * 같은 지분 픽스처(총 20억 · 본인 10억 · 취득 4억)에 B 시나리오.
   * 기준시가 3시점: 취득 3억 · 직전거주주택 양도시 4.5억 · 양도시 5억
   *   r161_1   = (4.5억 − 3억) / (5억 − 3억) = 0.75
   *   r161_2_2 = (5억 − 4.5억) / (5억 − 3억) = 0.25
   */
  const b = calculateTransferTax(
    fixture({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      totalPropertyTransferPrice: 2_000_000_000,
      rentalHousingException: rheB,
    }),
    rates,
  );

  it("F07-B1: 총 물건가 20억이면 B1(§161①)이 아니라 B2(§161② 1호+2호)다", () => {
    // 종전에는 본인 지분가 10억 ≤ 12억이라 B1으로 판정돼 2호(고가 안분) 항이 통째로 빠졌다.
    expect(b.rentalHousingExceptionDetail!.scenarioId).toBe("RH-B2");
  });

  it("F07-B2: 1호 + 2호 — 2호에만 (S−12억)/S가 곱해진다", () => {
    const t = b.rentalHousingExceptionDetail!.formulaTrace;
    // gain95(표1) = 600,000,000 − floor(600,000,000 × 0.16) = 504,000,000
    expect(t.gain95Table1).toBe(504_000_000);
    expect(t.gain95Table2).toBe(336_000_000);
    expect(t.ratioHighValue).toBe(0.4); // (20억 − 12억) / 20억 — 총 물건가 기준
    // 1호 = floor(504,000,000 × 150,000,000 / 200,000,000)
    expect(t.part1).toBe(378_000_000);
    // 2호 = floor(floor(336,000,000 × 50,000,000 / 200,000,000) × 800,000,000 / 2,000,000,000)
    //     = floor(84,000,000 × 0.4)
    expect(t.part2).toBe(33_600_000);
    expect(b.rentalHousingExceptionDetail!.taxableGain).toBe(411_600_000);
    // 종전(결함): B1으로 빠져 1호만 = 378,000,000 (33,600,000 과소)
    expect(b.taxableGain).toBe(411_600_000);
  });

  it("F07-B3: 세액 — 과세표준 409,100,000 × 40% − 누진공제 25,940,000", () => {
    expect(b.taxBase).toBe(409_100_000);
    expect(b.calculatedTax).toBe(Math.floor(409_100_000 * 0.4) - 25_940_000);
    expect(b.calculatedTax).toBe(137_700_000);
    expect(b.totalTax).toBe(151_470_000); // 종전 136,686,000(B1 경로)
  });

  it("F07-B4: 단독소유 B는 무변화 — 양도가 10억 ≤ 12억이라 B1", () => {
    const bSolo = calculateTransferTax(
      fixture({
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        rentalHousingException: rheB,
      }),
      rates,
    );
    expect(bSolo.rentalHousingExceptionDetail!.scenarioId).toBe("RH-B1");
    expect(bSolo.rentalHousingExceptionDetail!.taxableGain).toBe(378_000_000);
    expect(bSolo.totalTax).toBe(136_686_000);
  });
});

describe("F07 · 부담부증여 분모는 이 정정 범위 밖 — 현행 유지 가드", () => {
  /**
   * `burdenedGiftDenominator`(소령 §159 · 12억 안분 해석 B — 분모 = 증여가액 C)는 정본 체인의
   * 최우선 항이지만, 「부담부증여 × §155⑳」 조합의 **도달성이 확인되지 않았다**. 검증되지 않은
   * 축을 함께 움직이지 않기 위해 이 경로는 부담부증여 입력에서 종전(`transferPrice`)을 그대로
   * 유지한다.
   *
   * ⇒ 이 anchor는 "정본 체인을 그대로 복사(burdenedGiftDenominator 우선)"하는 확장을 **차단**한다.
   *   그렇게 바꾸면 분모 30억 → S > 12억 → RH-A2가 되어 아래 단언이 깨진다.
   *   (부담부증여 축을 실제로 열려면 그 조합의 도달성·해석 B 적용 여부를 먼저 확정할 것.)
   */
  it("F07-BG1: burdenedGiftDenominator가 있으면 분모를 바꾸지 않는다", () => {
    const g = calculateTransferTax(
      fixture({
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        totalPropertyTransferPrice: 2_000_000_000,
        burdenedGiftDenominator: 3_000_000_000,
        rentalHousingException: rheA,
      }),
      rates,
    );
    expect(g.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A1");
    expect(g.rentalHousingExceptionDetail!.taxableGain).toBe(0);
    expect(g.taxableGain).toBe(0);
    expect(g.totalTax).toBe(0);
  });
});
