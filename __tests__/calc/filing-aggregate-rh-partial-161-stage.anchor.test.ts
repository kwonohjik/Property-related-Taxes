/**
 * 합산 신고서 표 — 일괄(함께 양도) × §155⑳ 특례 × 12억 초과(부분과세) 자산 열의 비과세 단계 (R-c06-04 · 사용자 결정 2026-11-22 a).
 *
 * 종전: 합산 표(`FilingFormTableAggregateHelpers`)는 자산마다 «과세대상 = 양도소득금액 + 장특» 역산(`assetTaxableGain`)을 써서
 *   §155⑳ 자산의 비과세분을 **양도차익 단계**(비과세 양도차익 422,400,000 · 과세대상 777,600,000)에 싣고, 「비과세 양도소득금액」 행을 0으로 고정했다.
 *   같은 주택의 단건 표는 비과세 양도차익 0 · 과세대상 1,200,000,000 · 양도소득금액 528,000,000 · 비과세 양도소득금액 422,400,000(양도소득금액 단계)이다.
 * 결정: `rentalHousingApplied && !isExempt && !splitDetail` 자산 열은 단건 규약 — 표시 전용(세액 79,681,800 불변).
 * 시료: `statement-rh-partial-exempt-bundled.anchor.test.ts`와 같다(강남 주택 15억 + 토지 3억 일괄 actual).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateNontaxableIncomeLabel } from "@/components/calc/results/transfer/DetailedStatementRhPartialFormulas";
import { aggregateNontaxableIncomeBasis } from "@/components/calc/results/transfer/DetailedStatementRhPartialFormulas";
import { TRANSFER_RENTAL_HOUSING } from "@/lib/tax-engine/legal-codes/transfer-rental-housing";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const a = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...a, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const ROW: HouseEntry = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
const RENTAL: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };

function form(rh: boolean, withLand = true) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, actualSalePrice: "1,500,000,000", addressJibun: "서울 강남구 역삼동 1" } as never;
  if (withLand) {
    f.assets.push({ ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never);
  }
  const total = 1_500_000_000 + (withLand ? 300_000_000 : 0);
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: String(total), bundledSaleMode: "actual", residencePeriodMonths: "0", householdHousingCount: rh ? "2" : "1", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: rh ? [RENTAL] : [] });
  const a = f.assets[0] as unknown as { residenceInputMode: string; residencePeriodMonthsAsset: string; rentalHousingException: object };
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  if (rh) {
    a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  }
  return f;
}

const GAIN_ROWS = ["전체 양도차익", "비과세 양도차익", "과세대상 양도차익", "장기보유특별공제", "양도소득금액", "감면후 소득금액"] as const;

async function aggregateTable(rh: boolean) {
  const f = form(rh);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  const filing = aggregateToFilingResult(agg) as never;
  const rows = buildAggregateRows(filing, { properties: agg.properties, aggregated: agg }, f);
  const byLabel = (label: string | RegExp) => rows.find((row) => (typeof label === "string" ? row.label === label : label.test(row.label)));
  const [house, land] = agg.properties.map((p: PerPropertyBreakdown) => p.propertyId) as [string, string];
  const items = buildStatementItems(filing, f, f.assets[0], { properties: agg.properties, aggregated: agg }, undefined);
  return { agg, rows, byLabel, house, land, items };
}

describe("합산 신고서 — §155⑳ 부분과세 자산 열은 단건 규약(비과세는 양도소득금액 단계)", () => {
  it("🔑 주택 열 — 비과세 양도차익 0 · 과세대상 1,200,000,000 · 양도소득금액 528,000,000 · 비과세 양도소득금액 422,400,000 (종전 422,400,000 · 777,600,000 · 105,600,000 · 0)", async () => {
    const { byLabel, house } = await aggregateTable(true);
    expect(byLabel("전체 양도차익")!.values[house]).toBe(1_200_000_000);
    expect(byLabel("비과세 양도차익")!.values[house]).toBe(0);
    expect(byLabel("과세대상 양도차익")!.values[house]).toBe(1_200_000_000);
    expect(byLabel("장기보유특별공제")!.values[house]).toBe(672_000_000);
    expect(byLabel("양도소득금액")!.values[house]).toBe(528_000_000);
    expect(byLabel(/^비과세 양도소득금액/)!.values[house]).toBe(422_400_000);
    expect(byLabel("감면후 소득금액")!.values[house]).toBe(105_600_000);
  });

  it("🔑 단건 표와 같은 값 — 같은 주택 단독 양도의 단건 신고서 행·엔진 `nontaxableGainAmount`", async () => {
    const { byLabel, house } = await aggregateTable(true);
    const s = form(true, false);
    const rs = await runCalc(s);
    expect(rs.json.data.mode).toBe("single");
    const single = rs.json.data.result;
    expect(single.nontaxableGainAmount).toBe(422_400_000);
    const srows = buildRows(single, "single", s, s.assets[0]);
    const sv = (label: string | RegExp) => srows.find((row) => (typeof label === "string" ? row.label === label : label.test(row.label)))!.values.total;
    for (const label of ["비과세 양도차익", "과세대상 양도차익", "장기보유특별공제", "양도소득금액"]) {
      expect(byLabel(label)!.values[house], label).toBe(sv(label));
    }
    expect(byLabel(/^비과세 양도소득금액/)!.values[house]).toBe(sv(/^비과세 양도소득금액/));
  });

  it("🔑 행 라벨 — 시나리오 A는 단건과 같이 조문 없는 「비과세 양도소득금액」(「(소령 §161①)」은 B에만)", async () => {
    const { agg, rows } = await aggregateTable(true);
    expect(agg.properties[0].rentalHousingScenarioId).toMatch(/^RH-A/);
    expect(rows.some((row) => row.label === "비과세 양도소득금액")).toBe(true);
    expect(rows.some((row) => row.label.includes("§161"))).toBe(false);
  });

  it("토지 열 불변 · 합계 열 = 자산 칸 합 · 열 안 항등식", async () => {
    const { byLabel, house, land } = await aggregateTable(true);
    expect(byLabel("비과세 양도차익")!.values[land]).toBe(0);
    expect(byLabel("과세대상 양도차익")!.values[land]).toBe(200_000_000);
    expect(byLabel("양도소득금액")!.values[land]).toBe(140_000_000);
    expect(byLabel(/^비과세 양도소득금액/)!.values[land]).toBe(0);
    const n = (label: string | RegExp, col: string) => byLabel(label)!.values[col] as number;
    for (const label of [...GAIN_ROWS, /^비과세 양도소득금액/]) {
      expect(n(label, house) + n(label, land), String(label)).toBe(n(label, "total"));
    }
    expect(n("과세대상 양도차익", "total")).toBe(1_400_000_000);
    expect(n("양도소득금액", "total")).toBe(668_000_000);
    expect(n(/^비과세 양도소득금액/, "total")).toBe(422_400_000);
    for (const col of [house, land, "total"]) {
      expect(n("전체 양도차익", col) - n("비과세 양도차익", col)).toBe(n("과세대상 양도차익", col));
      expect(n("과세대상 양도차익", col) - n("장기보유특별공제", col)).toBe(n("양도소득금액", col));
      expect(n("양도소득금액", col) - n(/^비과세 양도소득금액/, col)).toBe(n("감면후 소득금액", col));
    }
  });

  it("세액 불변 — 총세액 79,681,800 · 과세표준 243,100,000 · 일반 경로 15억과 같다", async () => {
    const a = await aggregateTable(true);
    const b = await aggregateTable(false);
    expect(a.agg.totalTax).toBe(79_681_800);
    expect(a.byLabel("과세표준")!.values.total).toBe(243_100_000);
    expect(a.agg.totalTax).toBe(b.agg.totalTax);
  });

  it("짝 — 일반 경로(§155⑳ 없음) 15억은 종전 규약: 비과세분이 양도차익 단계(고가주택 §95③) · 비과세 양도소득금액 0 · 종전 라벨", async () => {
    const { byLabel, house } = await aggregateTable(false);
    expect(byLabel("비과세 양도차익")!.values[house]).toBe(960_000_000);
    expect(byLabel("과세대상 양도차익")!.values[house]).toBe(240_000_000);
    expect(byLabel("양도소득금액")!.values[house]).toBe(105_600_000);
    expect(byLabel("비과세 양도소득금액 (소령 §161①)")!.values[house]).toBe(0);
  });

  it("🔑 상세명세서 다건 쪽도 같은 규약 — 비과세 양도차익 합 0 · 과세대상 합 1,400,000,000 · 양도소득금액 합 668,000,000 · 비과세 양도소득금액 422,400,000", async () => {
    const { items, byLabel } = await aggregateTable(true);
    expect(items.get("exemptGain")!.value).toBe(byLabel("비과세 양도차익")!.values.total);
    expect(items.get("taxableGain")!.value).toBe(byLabel("과세대상 양도차익")!.values.total);
    expect(items.get("incomeAmount")!.value).toBe(668_000_000);
    expect(items.get("nontaxableIncome")!.value).toBe(422_400_000);
    expect(items.get("nontaxableIncome")!.label).toBe("비과세 양도소득금액");
    expect(String(items.get("nontaxableIncome")!.formula)).toContain("= 422,400,000");
  });

  it("🔑 감면후 소득금액 산식 — 위 행 양도소득금액(668,000,000)이 비과세 차감 전이므로 비과세 양도소득금액을 산식에 적는다(값 245,600,000 불변)", async () => {
    const { items } = await aggregateTable(true);
    expect(items.get("incomeAmountAfter")!.value).toBe(245_600_000);
    expect(items.get("incomeAmountAfter")!.formula).toBe("자산별 (양도소득금액 − 비과세 양도소득금액 − 소득금액 감면대상) 합계 = 245,600,000");
  });

  it("짝 — §155⑳ 부분과세 자산이 없으면 종전 산식", async () => {
    const { items } = await aggregateTable(false);
    expect(items.get("incomeAmountAfter")!.formula).toBe(`자산별 (양도소득금액 − 소득금액 감면대상) 합계 = ${(items.get("incomeAmountAfter")!.value ?? 0).toLocaleString()}`);
  });

  it("🔑 비과세 양도소득금액 행 법령 근거 — 단건과 같은 소스(엔진 step의 판정 조문 §155⑳) · 시나리오 A에 §161을 적지 않는다(종전 고정 «소득세법 시행령 §161·§155⑳»)", async () => {
    const { items, agg } = await aggregateTable(true);
    expect(items.get("nontaxableIncome")!.legalBasis).toBe(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20);
    const s = form(true, false);
    const rs = await runCalc(s);
    const single = buildStatementItems(rs.json.data.result, s, s.assets[0], undefined, undefined);
    expect(items.get("nontaxableIncome")!.legalBasis).toBe(single.get("nontaxableIncome")!.legalBasis);
    expect(agg.properties[0].rentalHousingScenarioId).toMatch(/^RH-A/);
  });

  it("짝 — §155⑳ 부분과세 자산이 없으면 종전 폴백 근거", async () => {
    const { items } = await aggregateTable(false);
    expect(items.get("nontaxableIncome")!.legalBasis).toBe("소득세법 시행령 §161·§155⑳");
  });
});

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
/** 라벨 바로 뒤 값 — 차감 행은 부호 문자열(`- `)이 따로 붙으므로 이어 읽는다. */
function after(t: string[], label: string | RegExp): string | undefined {
  const i = t.findIndex((x) => (typeof label === "string" ? x === label : label.test(x)));
  if (i < 0) return undefined;
  return t[i + 1] === "- " ? `- ${t[i + 2]}` : t[i + 1];
}
/** 장특 행 — 합산 PDF는 율 없이 라벨 「장기보유특별공제」 한 조각이고 값이 그 뒤다(사용자 결정 2026-11-22). rate는 율 조각이 있으면 그 값. */
function lthd(t: string[]) {
  const withRate = t.indexOf("장기보유특별공제 (");
  if (withRate >= 0) return { rate: t[withRate + 1], value: t[withRate + 3] };
  const i = t.indexOf("장기보유특별공제");
  return { rate: undefined, value: after(t, "장기보유특별공제") ?? t[i + 1] };
}
async function bundledPdf(rh: boolean) {
  const f = form(rh);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  const filing = aggregateToFilingResult(agg);
  const t = collect(TransferSection({ r: filing as unknown as Record<string, unknown> }));
  return { agg, filing, t };
}

describe("일괄 PDF 신고서 양식(TransferSection) — 화면 합산 신고서 합계 열과 같은 규약", () => {
  it("🔑 §155⑳ 부분과세 — 과세대상 행 없음(= 전체 1,400,000,000) · 장특 732,000,000 · 양도소득금액 668,000,000 · 비과세 양도소득금액 − 422,400,000 · 감면후 245,600,000 (종전 과세대상 977,600,000 · 양도소득금액 245,600,000 · 비과세 행 없음)", async () => {
    const { agg, t } = await bundledPdf(true);
    const { byLabel } = await aggregateTable(true);
    expect(after(t, "전체 양도차익")).toBe("1,400,000,000");
    expect(t.indexOf("과세대상 양도차익")).toBe(-1);
    expect(lthd(t)).toEqual({ rate: undefined, value: "- 732,000,000" });
    expect(after(t, "양도소득금액")).toBe("668,000,000");
    expect(after(t, "비과세 양도소득금액")).toBe("- 422,400,000");
    expect(after(t, "감면후 소득금액")).toBe("245,600,000");
    expect(after(t, "과세표준")).toBe("243,100,000");
    // 화면 합산 신고서 합계 열과 같은 값 · 행 검산
    expect(after(t, "양도소득금액")).toBe((byLabel("양도소득금액")!.values.total as number).toLocaleString());
    expect(after(t, "비과세 양도소득금액")).toBe(`- ${(byLabel(/^비과세 양도소득금액/)!.values.total as number).toLocaleString()}`);
    expect(1_400_000_000 - 732_000_000 - 422_400_000).toBe(245_600_000);
    expect(agg.taxBase).toBe(243_100_000);
    // 순서 — 양도소득금액 → 비과세 양도소득금액 → 세액감면대상금액
    expect(t.indexOf("양도소득금액")).toBeLessThan(t.indexOf("비과세 양도소득금액"));
    expect(t.indexOf("비과세 양도소득금액")).toBeLessThan(t.indexOf("세액감면대상금액"));
  });

  it("🔑 장특 율 표시 없음 — 합산 PDF는 섞인 실효율(732,000,000 ÷ 1,400,000,000 = 52.3%)을 적지 않는다(사용자 결정 2026-11-22)", async () => {
    const { t } = await bundledPdf(true);
    expect(lthd(t).rate).toBeUndefined();
    expect(t.some((x) => x.startsWith("장기보유특별공제 ("))).toBe(false);
  });

  it("🔑 차손 자산이 낀 일괄 — 통산 후 양도소득금액도 비과세 양도소득금액 차감 전(양도소득금액 − 통산액)이고, 비과세 행을 뺀 값이 감면후 소득금액이다", async () => {
    const f = form(true);
    f.assets.push({ ...makeDefaultAsset(3), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "200,000,000", actualSalePrice: "150,000,000" } as never);
    f.contractTotalPrice = String(1_500_000_000 + 300_000_000 + 150_000_000);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated;
    const t = collect(TransferSection({ r: aggregateToFilingResult(agg) as unknown as Record<string, unknown> }));
    const n = (x: string | undefined) => Number((x ?? "").replace(/[-,\s]/g, ""));
    const income = n(after(t, "양도소득금액"));
    const afterOffset = n(after(t, "통산 후 양도소득금액"));
    const nontaxable = n(after(t, "비과세 양도소득금액"));
    expect(nontaxable).toBe(422_400_000);
    expect(afterOffset).toBe(agg.totalIncomeAfterOffset + 422_400_000);
    expect(income - afterOffset).toBe(agg.totalIncomeBeforeOffset - agg.totalIncomeAfterOffset - agg.unusedLoss);
    expect(afterOffset - nontaxable).toBe(n(after(t, "감면후 소득금액")));
  });

  it("짝 — 일반 경로 15억(§155⑳ 없음)은 종전 그대로: 과세대상 440,000,000 · 양도소득금액 245,600,000 · 비과세 양도소득금액 행 없음", async () => {
    const { t, filing } = await bundledPdf(false);
    expect(filing.aggregateNontaxableIncome).toBe(0);
    expect(after(t, "전체 양도차익")).toBe("1,400,000,000");
    expect(after(t, "과세대상 양도차익")).toBe("440,000,000");
    expect(lthd(t)).toEqual({ rate: undefined, value: "- 194,400,000" });
    expect(after(t, "양도소득금액")).toBe("245,600,000");
    expect(t.some((x) => x.startsWith("비과세 양도소득금액"))).toBe(false);
    expect(after(t, "감면후 소득금액")).toBe("245,600,000");
  });
});

describe("aggregateNontaxableIncomeLabel — 단건 `nontaxableIncomeLabel` 규칙", () => {
  const rh = (id?: string) => ({ rentalHousingApplied: true, rentalHousingScenarioId: id, isExempt: false, transferGain: 1_200_000_000, longTermHoldingDeduction: 672_000_000, income: 105_600_000 }) as unknown as PerPropertyBreakdown;
  const plain = { isExempt: false, transferGain: 200_000_000, longTermHoldingDeduction: 60_000_000, income: 140_000_000 } as unknown as PerPropertyBreakdown;
  it("부분과세 자산 없음 → 종전 라벨", () => expect(aggregateNontaxableIncomeLabel([plain])).toBe("비과세 양도소득금액 (소령 §161①)"));
  it("B1 → §161① · B2 → §161②", () => {
    expect(aggregateNontaxableIncomeLabel([rh("RH-B1"), plain])).toBe("비과세 양도소득금액 (소령 §161①)");
    expect(aggregateNontaxableIncomeLabel([rh("RH-B2")])).toBe("비과세 양도소득금액 (소령 §161②)");
  });
  it("A · 구 이력(시나리오 없음) · 시나리오 혼재 → 조문 없는 라벨", () => {
    expect(aggregateNontaxableIncomeLabel([rh("RH-A2")])).toBe("비과세 양도소득금액");
    expect(aggregateNontaxableIncomeLabel([rh(undefined)])).toBe("비과세 양도소득금액");
    expect(aggregateNontaxableIncomeLabel([rh("RH-B1"), rh("RH-B2")])).toBe("비과세 양도소득금액");
  });
});

describe("aggregateNontaxableIncomeBasis — 자산 엔진 step의 근거(단건과 같은 소스)", () => {
  const rh = (basis?: string) =>
    ({
      rentalHousingApplied: true, isExempt: false, transferGain: 1_200_000_000, longTermHoldingDeduction: 672_000_000, income: 105_600_000,
      steps: basis ? [{ label: "비과세 양도소득금액", formula: "", amount: 422_400_000, legalBasis: basis }] : [],
    }) as unknown as PerPropertyBreakdown;
  const plain = { isExempt: false, transferGain: 200_000_000, longTermHoldingDeduction: 60_000_000, income: 140_000_000, steps: [] } as unknown as PerPropertyBreakdown;
  it("근거가 하나면 그 조문 — §155⑳ · §154⑩", () => {
    expect(aggregateNontaxableIncomeBasis([rh(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20), plain])).toBe(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20);
    expect(aggregateNontaxableIncomeBasis([rh(TRANSFER_RENTAL_HOUSING.PIT_RD_154_10)])).toBe(TRANSFER_RENTAL_HOUSING.PIT_RD_154_10);
  });
  it("부분과세 자산 없음 · step 없는 구 이력 · 근거 혼재 → undefined(호출부 종전 폴백)", () => {
    expect(aggregateNontaxableIncomeBasis([plain])).toBeUndefined();
    expect(aggregateNontaxableIncomeBasis([rh(undefined)])).toBeUndefined();
    expect(aggregateNontaxableIncomeBasis([rh(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20), rh(TRANSFER_RENTAL_HOUSING.PIT_RD_154_10)])).toBeUndefined();
    expect(aggregateNontaxableIncomeBasis([rh(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20), rh(undefined)])).toBeUndefined();
  });
});
