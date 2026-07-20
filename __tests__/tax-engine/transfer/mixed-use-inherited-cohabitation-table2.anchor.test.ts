/**
 * 겸용주택 동일세대 상속 §154⑧3호 거주 통산 표2 앵커 (계획서 §7)
 *
 * 검증: 표2 대상 판정은 통산 거주(table2ResidencePeriodYears), 거주분 공제율은 실거주(residencePeriodYears).
 * 사전법령해석재산 2021-202 — 대상 판정=통산, 공제율=상속개시일 기산.
 *
 * 기준 케이스: 40억 겸용(주택분 12억 초과), 1세대1주택, 보유 land 1992~2022(30y)·building 1997~2022(25y).
 * 현행(버그): 표2 게이트가 실거주만 봄 → 동일세대 상속 실거주0은 통산 표현 경로 없어 표1 강제.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { consolidateResidenceMonths } from "@/lib/tax-engine/transfer-tax-exemption";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";

afterEach(cleanup);

const RATES = makeMockRates();
const TRANSFER_PRICE = 4_000_000_000; // 40억 → 주택분 12억 초과
const TRANSFER_DATE = new Date("2022-02-16");

/** 주택분 income>0 기준 겸용 (probe 검증) */
function base40(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    transferStandardPrice: {
      housingPrice: 2_500_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 6_100_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 500_000_000,
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: 2_380_000,
    },
    isOneHouseExempt: true,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 동일세대 상속 §154⑧3호 거주 통산 표2", () => {
  it("앵커1: 실거주0 + 통산 2년 → 표2 개방, 보유40%+거주0%=40% (원단위 golden)", () => {
    const r = run(base40({ residencePeriodYears: 0, table2ResidencePeriodYears: 2 }));
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    expect(r.housingPart.longTermDeductionRate).toBeCloseTo(0.40, 5);
    // golden — 현행 버그(표1 0.30: transferTax 572,150,806·총부담 629,365,886) 대비 공제↑ → 세액↓
    expect(r.housingPart.incomeAmount).toBe(828_437_579);
    expect(r.total.transferTax).toBe(510_017_988);
    expect(r.total.transferTax + r.total.localTax).toBe(561_019_786);
  });

  it("앵커3 (가드): 통산 1년(<2) + 실거주0 → 표2 미개방(표1)", () => {
    const r = run(base40({ residencePeriodYears: 0, table2ResidencePeriodYears: 1 }));
    expect(r.housingPart.longTermDeductionTable).toBe(1);
    expect(r.housingPart.longTermDeductionRate).toBeLessThanOrEqual(0.30);
  });

  it("앵커5: 실거주1년 + 통산 2년 → 표2(대상 통산), 거주분=실거주1년×4%=4% → 44%", () => {
    const r = run(base40({ residencePeriodYears: 1, table2ResidencePeriodYears: 2 }));
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    // 보유40% + 거주(실거주1년)4% = 44% (통산분이 거주분 공제율에 침범하지 않음)
    expect(r.housingPart.longTermDeductionRate).toBeCloseTo(0.44, 5);
  });

  it("앵커6 (period-split): 용도변경 겸용 + 실거주0 통산2년 → applyUsagePeriodSplit 표2 개방", () => {
    const r = run(
      base40({
        residencePeriodYears: 0,
        table2ResidencePeriodYears: 2,
        partialUsageChange: {
          direction: "house_to_commercial",
          usageChangeDate: new Date("2010-01-01"),
        },
      }),
    );
    expect(r.usagePeriodSplit).toBeDefined();
    expect(r.housingPart.longTermDeductionTable).toBe(2);
  });

  it("회귀 가드: table2 미제공 → residencePeriodYears fallback (기존 동작 불변)", () => {
    // 실거주 25년, table2 미제공 → 표2 0.80 (case14 회귀와 동일)
    const r = run(base40({ residencePeriodYears: 25 }));
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    expect(r.housingPart.longTermDeductionRate).toBeCloseTo(0.80, 5);
  });
});

describe("consolidateResidenceMonths 규칙 (통산 대상 게이트) — 어댑터 단일 소스", () => {
  it("동일세대 상속: 실거주 + 통산 합산", () => {
    expect(
      consolidateResidenceMonths(0, {
        acquisitionCause: "inheritance",
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationResidenceMonths: 24,
      }),
    ).toBe(24);
  });

  it("앵커2 (가드): 별도세대 상속 → 실거주 identity(통산 미적용)", () => {
    expect(
      consolidateResidenceMonths(0, {
        acquisitionCause: "inheritance",
        decedentSameHouseholdBeforeInheritance: false,
        decedentCohabitationResidenceMonths: 36,
      }),
    ).toBe(0);
  });

  it("앵커4 (가드): 매매취득 → 실거주 identity(통산 무관)", () => {
    expect(
      consolidateResidenceMonths(18, {
        acquisitionCause: "purchase",
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationResidenceMonths: 36,
      }),
    ).toBe(18);
  });
});
