/**
 * F-19·F-20 — 일반건물 상세명세서 필요경비 산식이 **자기 값을 만들어내야** 한다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-19·F-20 · §29.
 *
 * 두 건 다 F-18(개산공제율 echo) 조사에서 나왔고, 성격이 같다 — **표시 축**(세액 무관)이다.
 *
 * ## F-19 — 실비 경로인데 「개산공제 × N%」라 적는다
 * 부담부증여 K-4(실지취득가)·§97②2호 swap 경로의 필요경비 슬롯에는 개산공제가 아니라
 * **채무비율로 안분한 실비**(자본적지출·양도비)가 들어간다(`burdened-gift-apportionment.ts`
 * STEP 5 — `acquisitionMethodUsed === "actual"`). 종전 문구는 그 경우에도 「안분 취득가액 × 3%
 * (개산공제, 소령 §163⑥)」라고 적어 **없는 근거를 댔다**. 율 echo가 `undefined`인 것이 신호다.
 *
 * ## F-20 — 증축 base가 100% 값이라 지분 자산에서 어긋난다
 * 엔진은 `computeEstimatedDeduction(acqExtStd, rate, ownershipRatio)`로 **지분을 반영**하는데
 * 표시 층은 `acqExtensionStdTotal`(100% 값)을 base로 적었다. 실측(지분 0.5):
 * 「취득시 증축건물기준시가 1,000,000 × 3% = 15,000」 — 1,000,000 × 3%는 30,000이다.
 * 토지·건물1은 `landBase`·`buildingBase` echo로 이미 해결된 축인데 증축분만 빠져 있었다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const BASE = {
  totalTransferPrice: 2_000_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 180.96,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 2_814_470,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
  extensionInfo: {
    extensionDate: new Date("2010-05-01"),
    extensionBuildingArea: 50,
    transferExtensionBuildingStdPrice: 5_000_000,
    acquisitionExtensionBuildingStdPrice: 1_000_000,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (over: Record<string, unknown> = {}) => buildGeneralBuildingAssetCards({ ...BASE, ...over } as any);
const prop = (propertyId: string, necessaryExpense: number): PerPropertyBreakdown =>
  ({ propertyId, necessaryExpense, capitalExpenditureForDisplay: 0 }) as PerPropertyBreakdown;

/** 「적힌 base × 적힌 율 = 적힌 값」을 산식 문자열에서 직접 검산한다. */
function reproducesFromFormula(formula: string | undefined): boolean {
  const m = formula?.match(/([\d,]+) × ([\d.]+)% = ([\d,]+)/);
  if (!m) return false;
  const [, base, pct, value] = m;
  const n = (x: string) => Number(x.replace(/,/g, ""));
  return Math.floor(n(base) * (Number(pct) / 100)) === n(value);
}

const b2Expense = (out: ReturnType<typeof run>) =>
  out.assetCards.find((c) => c.propertyId === "building2")?.estimatedDeduction ?? 0;

describe("F-20 증축 산식 — base는 지분 반영값이어야 한다", () => {
  it("F20-1 단독소유 — 산식이 자기 값을 만든다", () => {
    const out = run();
    const f = buildGbExpenseFormula(prop("building2", b2Expense(out)), out);
    expect(f).toContain("1,000,000");
    expect(reproducesFromFormula(f)).toBe(true);
  });

  it("F20-2 지분 1/2 — base가 절반으로 줄고 산식이 자기 값을 만든다 (종전 1,000,000 × 3% = 15,000)", () => {
    const out = run({ ownershipRatio: 0.5 });
    const f = buildGbExpenseFormula(prop("building2", b2Expense(out)), out);
    expect(f).toContain("500,000");
    expect(f).not.toContain("1,000,000");
    expect(reproducesFromFormula(f)).toBe(true);
  });

  it("F20-3 (대조) 토지·건물1은 종전부터 base echo가 있었다 — 지분에서도 재현된다", () => {
    const out = run({ ownershipRatio: 0.5 });
    const land = buildGbExpenseFormula(prop("land", out.estimatedDeduction.land), out);
    const bld = buildGbExpenseFormula(prop("building", out.estimatedDeduction.building), out);
    expect(reproducesFromFormula(land)).toBe(true);
    expect(reproducesFromFormula(bld)).toBe(true);
  });

  it("F20-4 base echo가 없으면 개산공제 산식을 쓰지 않는다 — 증축분 실가 직접 입력", () => {
    const out = run();
    const noBase = {
      ...out,
      estimatedDeduction: { ...out.estimatedDeduction, extensionBase: undefined },
    };
    const f = buildGbExpenseFormula(prop("building2", 9_999), noBase);
    expect(f).toContain("사용자 직접 입력");
    expect(f).not.toContain("§163⑥");
    expect(f).not.toContain("× 3%");
  });
});

describe("F-19 부담부증여 — 실비 경로에 개산공제 근거를 대지 않는다", () => {
  const bg = (rate: number | undefined): TransferBurdenedGiftBreakdown =>
    ({
      perAsset: {
        land: {
          acquisitionPrice: 300_000_000,
          estimatedDeduction: 4_500_000,
          estimatedDeductionRate: rate,
        },
        building: {
          acquisitionPrice: 100_000_000,
          estimatedDeduction: 1_500_000,
          estimatedDeductionRate: rate,
        },
      },
    }) as unknown as TransferBurdenedGiftBreakdown;

  it("F19-1 율 echo가 없으면(K-4 실비) 「채무비율 안분 실비」라 적는다", () => {
    const f = buildGbExpenseFormula(prop("land", 4_500_000), undefined, bg(undefined));
    expect(f).toContain("채무비율 안분 실비");
    expect(f).toContain("§163⑥ 개산공제를 적용하지 않습니다");
    expect(f).not.toContain("× 3%");
  });

  it("F19-2 (긍정 짝) 개산공제 경로는 종전대로 율을 적고 산식이 값을 만든다", () => {
    const f = buildGbExpenseFormula(prop("land", 9_000_000), undefined, bg(0.03));
    expect(f).toContain("× 3% (개산공제, 소령 §163⑥)");
    expect(f).toContain("300,000,000 × 0.03");
  });

  it("F19-3 미등기 개산공제 경로는 0.3%로 적는다", () => {
    const f = buildGbExpenseFormula(prop("land", 900_000), undefined, bg(0.003));
    expect(f).toContain("× 0.3% (개산공제, 소령 §163⑥)");
    expect(f).toContain("× 0.003");
  });
});
