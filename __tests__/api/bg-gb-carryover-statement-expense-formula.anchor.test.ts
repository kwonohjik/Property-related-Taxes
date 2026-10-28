/**
 * anchor — 일반건물 부담부증여 × 이월과세(토지·건물 둘 다 증여받음) — 상세 계산 명세서의 파트별 필요경비 산식은 산입분을 뗀 순액을 만들고 증여세 상당액 산입분을 뒤에 더한다.
 * 계획서 `docs/02-design/features/bg-gb-carryover-statement-expense-formula.plan.md`(사용자 결정 Q-1 a · Q-2 a).
 *
 * 종전: 파트 줄이 슬롯(개산공제 + 파트 산입분)을 마지막 값으로 적어 「10,000,000 × 500,000,000 / 1,000,000,000 × 0.03 = 650,000」(산식 값 150,000)이었고,
 * 실지는 산입분 500,000이 「자본적지출·양도비」로 적혔다. 표시 전용 — 세액은 바뀌지 않는다(결정세액은 변경 전 측정값 · mock 세율).
 * 시료는 `transfer.route.gb-bg-carryover-presumed-scenario-b.anchor.test.ts`: 시가 10억 · 채무 5억 · 당초 증여자 취득시 기준시가 토지 10,000,000 · 건물 40,000,000.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { buildBgExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택). `co`/`over` 로 한 칸씩 바꾼다. */
function gbAsset(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return sameDayBuildingDonorDate({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      ...co,
    },
    ...over,
  } as AssetForm);
}
const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
const K7 = { bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" } as Partial<AssetForm>;
const K4 = { bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "100,000,000", bgCoDonorActualAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" } as Partial<AssetForm>;
const FLAGS = { isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false };

async function statement(over: Partial<AssetForm>, gift: string) {
  const f = formOf([gbAsset(over, { giftTaxAmount: gift })], FLAGS);
  expect(issues(f)).toEqual([]);
  const r = await runCalc(f);
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  const data = r.json.data;
  const agg = data.aggregated;
  const props = agg.properties as PerPropertyBreakdown[];
  const meta = { properties: props, aggregated: agg } as unknown as AggregateMeta;
  // 실제 화면(`BundledAllocationCard`)과 같이 route의 부담부증여 명세를 덧붙여 넘긴다.
  const res = { ...aggregateToFilingResult(agg), transferBurdenedGiftBreakdown: data.transferBurdenedGiftBreakdown } as ReturnType<typeof aggregateToFilingResult>;
  const bg = data.transferBurdenedGiftBreakdown;
  const exp = buildStatementItems(res, f, undefined, meta, undefined).get("expenses")!;
  const per = (exp.perAsset ?? []) as { label: string; value: number; formula?: string }[];
  const part = (name: "토지" | "건물") => per.find((x) => x.label.startsWith(name))!;
  return { agg, bg, exp, land: part("토지"), building: part("건물") };
}
const lastValue = (formula: string | undefined) => {
  const all = [...String(formula ?? "").matchAll(/= ([0-9,]+)/g)];
  return Number(all[all.length - 1][1].replace(/,/g, ""));
};

type Row = { name: string; over: Partial<AssetForm>; gift: string; tax?: number; applied: [number, number] };
const ROWS: Row[] = [
  { name: "감정가액(K-7) · 증여세 0", over: K7, gift: "0", tax: 82_627_700, applied: [0, 0] },
  { name: "감정가액(K-7) · 증여세 2,000,000", over: K7, gift: "2,000,000", tax: 82_331_300, applied: [500_000, 500_000] },
  { name: "감정가액(K-7) · 증여세 5,000,000", over: K7, gift: "5,000,000", tax: 81_886_700, applied: [1_250_000, 1_250_000] },
  { name: "환산(K-5) · 증여세 2,000,000", over: {}, gift: "2,000,000", tax: 109_014_000, applied: [500_000, 500_000] },
  { name: "실지(K-4) · 증여세 2,000,000", over: K4, gift: "2,000,000", tax: 82_553_600, applied: [500_000, 500_000] },
];

describe("일반건물 BG × 이월과세 — 상세 명세서 파트별 필요경비 산식", () => {
  it.each(ROWS)("$name", async ({ over, gift, tax, applied }) => {
    const s = await statement(over, gift);
    if (tax !== undefined) expect(s.agg.determinedTax).toBe(tax);
    expect(s.bg.carryoverGiftTax?.landApplied ?? 0).toBe(applied[0]);
    expect(s.bg.carryoverGiftTax?.buildingApplied ?? 0).toBe(applied[1]);
    const parts = [[s.land, applied[0]], [s.building, applied[1]]] as const;
    for (const [p, add] of parts) {
      const f = String(p.formula);
      // 맺음 값 = 파트 슬롯 = 명세서 파트 값
      expect(lastValue(f)).toBe(p.value);
      if (add === 0) expect(f).not.toContain("증여세 상당액");
      else {
        expect(f).toContain(`+ 증여세 상당액 ${add.toLocaleString("ko-KR")} — 이월과세 §97의2①3호·시행령 §163의2②`);
        // 산입 줄 앞의 값(순액) + 산입분 = 슬롯
        const net = Number(f.match(/= ([0-9,]+)\n\s+\+ 증여세 상당액/)![1].replace(/,/g, ""));
        expect(net + add).toBe(p.value);
      }
    }
    expect(s.land.value + s.building.value).toBe(s.exp.value);
  });

  it.each([ROWS[0], ROWS[1], ROWS[2], ROWS[3]])("$name — 개산공제 산식이 순액을 만든다(적힌 산식이 적힌 값)", async ({ over, gift }) => {
    const s = await statement(over, gift);
    for (const [p, base] of [[s.land, 10_000_000], [s.building, 40_000_000]] as const) {
      const f = String(p.formula);
      const m = f.match(/= ([0-9,]+) × ([0-9,]+) \/ ([0-9,]+) × ([0-9.]+)\s*\n?\s*= ([0-9,]+)/);
      expect(m, f).not.toBeNull();
      const n = (x: string) => Number(x.replace(/,/g, ""));
      expect(n(m![1])).toBe(base);
      expect(Math.floor((n(m![1]) * n(m![2])) / n(m![3]) * Number(m![4]))).toBe(n(m![5]));
    }
  });

  it("실지(K-4): 실비가 0이면 「실비 0 + 증여세 상당액」으로 맺는다 — 산입분을 자본적지출·양도비로 적지 않는다", async () => {
    const s = await statement(K4, "2,000,000");
    const f = String(s.land.formula);
    expect(f).toContain("필요경비 = 채무비율 안분 실비 (자본적지출·양도비)\n        = 0\n        + 증여세 상당액 500,000");
    expect(f).toContain("= 500,000");
    expect(f).toContain("※ 실지취득가액 경로라 §163⑥ 개산공제를 적용하지 않습니다.");
  });

  it("안내 ※ 문구는 산입 줄 뒤에 온다(감정가액)", async () => {
    const s = await statement(K7, "2,000,000");
    const f = String(s.land.formula);
    expect(f.indexOf("+ 증여세 상당액")).toBeGreaterThan(0);
    expect(f.indexOf("※ 감정가액 경로")).toBeGreaterThan(f.indexOf("+ 증여세 상당액"));
  });
});

describe("leaf 단위 — buildBgExpenseFormula의 파트 판별", () => {
  const mkAsset = (est: number) => ({ acquisitionMethod: "appraisal", presumedAcquisition: 1, actualAcquisition: 0, stdPriceAtAcquisition: 100, stdPriceAtTransfer: 1, transferPrice: 1, acquisitionPrice: 1, estimatedDeduction: est, estimatedDeductionRate: 0.03, sangjeungbeopValue: 1 });
  const bg = {
    assumedDebtAmount: 10, giftValuation: { max: 100 },
    perAsset: { land: mkAsset(30), building: mkAsset(13) },
    carryoverGiftTax: { raw: 0, apportioned: 0, cap: 0, applied: 10, limitApplied: false, landApplied: 7, buildingApplied: 3 },
  } as unknown as Parameters<typeof buildBgExpenseFormula>[0];
  it("토지는 landApplied · 건물은 buildingApplied를 뗀다", () => {
    expect(buildBgExpenseFormula(bg, bg.perAsset.land)).toContain("= 23\n        + 증여세 상당액 7");
    expect(buildBgExpenseFormula(bg, bg.perAsset.building)).toContain("= 10\n        + 증여세 상당액 3");
  });
  it("두 파트 어느 쪽도 아닌 객체이거나 이월과세가 아니면 종전 문구(슬롯 그대로 · 산입 줄 없음)", () => {
    expect(buildBgExpenseFormula(bg, { ...bg.perAsset.land })).not.toContain("증여세 상당액");
    const plain = { ...bg, carryoverGiftTax: undefined } as typeof bg;
    expect(buildBgExpenseFormula(plain, plain.perAsset.land)).toContain("= 30");
    expect(buildBgExpenseFormula(plain, plain.perAsset.land)).not.toContain("증여세 상당액");
  });
});
