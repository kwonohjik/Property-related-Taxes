/**
 * anchor — 비과세 × 양도차손: 신고서·명세서가 입력한 취득가액을 지우지 않는다 · 계획서 docs/00-pm/exempt-loss-gross-gain-display.plan.md (Q-1 a)
 *
 * 종전: 엔진이 비과세 결과의 gross 양도차익을 `Math.max(0, …)`로 눌러(`exemptGrossGain` 0) 표시부 역산이
 *   취득가액 = 양도가액이 됐다(입력 700,000,000 → 신고서 500,000,000). 집계는 취득가액은 맞고 전체 양도차익 0이라 열 항등식이 어긋났다.
 *   세액은 불변(비과세 0) — `exemptGrossGain`은 표시 전용이다.
 * 기대값은 route 응답에서 읽고, 절대값(700,000,000 · −200,000,000)을 함께 단언한다(자기일관 단언은 역산이라 구별력이 없다).
 *
 *  · EL-1 단건 상속 주택 비과세 × 손실 — gross −200,000,000 · 신고서 취득가액 700,000,000
 *  · EL-2 단건 매매 실가 비과세 × 손실 — 같은 값
 *  · EL-3 함께 양도(토지 + 비과세 손실 주택) — 열마다·합계 열 항등식 0
 *  · EL-4 겸용 컴패니언 · 배율초과 · 1세대1주택 비과세(K8) — 주택 카드 gross −77,700,831·−10,360,111 · 열·합계 항등식 0 · Σ gross = 단건 60,000,000
 *  · EL-5 짝 — 비과세 × 양(+) 차익은 불변 (취득가액 300,000,000 · gross 200,000,000)
 *  · EL-6 세액 불변 — 비과세 손실의 결정세액 0 · 비과세 판정 그대로 · 「§102② 통산」 고지는 비과세 손실에 붙지 않는다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { sumAssetGains } from "@/components/calc/results/transfer/exempt-gross-gain";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Prop = { propertyId: string; transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number; isExempt?: boolean; exemptGrossGain?: number };

async function pipeline(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }));
  return { status: res.status, json: (await res.json()) as Loose };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));

// ── 시료 ─────────────────────────────────────────────────────────────────────────────────────
const HOUSE: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "500,000,000", publishedValueAtInheritance: "700,000,000", inheritanceValuationMethod: "supplementary", standardPriceAtTransfer: "400,000,000", fixedAcquisitionPrice: "",
  residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "96",
};
const PURCHASE: Loose = { ...HOUSE, acquisitionCause: "purchase", useEstimatedAcquisition: false, fixedAcquisitionPrice: "700000000", decedentAcquisitionDate: "", publishedValueAtInheritance: "", inheritanceValuationMethod: "" };
const GAIN: Loose = { ...HOUSE, publishedValueAtInheritance: "300,000,000" };
const LAND: Loose = {
  addressJibun: "경남 테스트군 2-1", regionCode: "4682025021", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
const form = (assets: Loose[], total: string): TransferFormData =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-09-18", filingDate: "2023-12-31", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "96",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: total,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a })),
  })) as TransferFormData;

const COL_LABELS = ["양도가액", "취득가액", "필요경비", "전체 양도차익"] as const;
const num = (v: unknown) => (typeof v === "number" ? v : null);
type Table = { rows: ReturnType<typeof buildRows>; cell: (label: string, col: string) => number | null; diffs: { col: string; diff: number | null }[]; cols: string[] };
function tableOf(fr: never, mode: string, f: TransferFormData, aggregate?: unknown, price?: number): Table {
  const rows = buildRows(fr, mode as never, f as never, f.assets[0] as never, price, undefined, undefined, aggregate as never);
  const cell = (label: string, col: string): number | null => num((rows.find((x) => x.label === label)?.values as Record<string, unknown> | undefined)?.[col]);
  const cols: string[] = Array.from(new Set(rows.flatMap((x) => Object.keys(x.values as object)))).filter((c) => num(cell("양도가액", c)) != null || c === "total");
  const diffs = cols.map((c) => {
    const [tp, ac, ex, gn] = COL_LABELS.map((l) => cell(l, c));
    return { col: c.split("#")[0], diff: tp != null && ac != null && gn != null ? tp - ac - (ex ?? 0) - gn : null };
  });
  return { rows, cell, diffs, cols };
}
/** 열마다 「전체 양도차익 − 비과세 양도차익 − 과세대상 양도차익」 — 전부 0이어야 한다. */
const relation = (t: Table): number[] =>
  t.cols.map((c) => (t.cell("전체 양도차익", c) ?? 0) - (t.cell("비과세 양도차익", c) ?? 0) - (t.cell("과세대상 양도차익", c) ?? 0));
async function single(assets: Loose[], total: string, price: number) {
  const f = form(assets, total);
  expect(issues(f)).toEqual([]);
  const r = await pipeline(f);
  expect(r.status).toBe(200);
  const res = (r.json.data?.result ?? r.json.data) as Loose;
  const fr = res as never;
  const t = tableOf(fr, deriveColumns(fr).mode, f, undefined, price);
  const st = buildStatementItems(fr, f as never, f.assets[0] as never, undefined, price);
  return { res, t, st, f };
}

describe("EL 비과세 × 양도차손 표시 (Q-1 a)", () => {
  it("EL-1 단건 상속 주택 — 신고서 취득가액 700,000,000 · 전체 양도차익 −200,000,000 (종전 500,000,000 · 0)", async () => {
    const { res, t, st } = await single([HOUSE], "500000000", 500_000_000);
    expect(res.isExempt).toBe(true);
    expect(res.exemptGrossGain).toBe(-200_000_000);
    expect(t.cell("양도가액", "total")).toBe(500_000_000);
    expect(t.cell("취득가액", "total")).toBe(700_000_000);
    expect(t.cell("전체 양도차익", "total")).toBe(-200_000_000);
    expect(t.diffs.every((d) => d.diff === 0)).toBe(true);
    expect(JSON.stringify(st.get("acquisitionPrice"))).toContain("700,000,000");
    expect(st.get("transferGain")?.value).toBe(-200_000_000);
    // 「전체 = 비과세 + 과세대상」 — 비과세 자산의 손실은 비과세 양도차익도 음수(종전 0 · 명세서가 «전체 −200,000,000 − 과세대상 0»이라 적고 값 0)
    expect(t.cell("비과세 양도차익", "total")).toBe(-200_000_000);
    expect(t.cell("과세대상 양도차익", "total")).toBe(0);
    expect(st.get("exemptGain")?.value).toBe(-200_000_000);
    expect(st.get("taxableGain")?.value).toBe(0);
    expect(String(st.get("exemptGain")?.formula)).toContain("-200,000,000 − 과세대상 양도차익 0");
    expect(String(st.get("taxableGain")?.formula)).toBe("전체 양도차익 -200,000,000 − 비과세 양도차익 -200,000,000");
  });

  it("EL-2 단건 매매 실가 — 같은 값", async () => {
    const { res, t } = await single([PURCHASE], "500000000", 500_000_000);
    expect(res.isExempt).toBe(true);
    expect(res.exemptGrossGain).toBe(-200_000_000);
    expect(t.cell("취득가액", "total")).toBe(700_000_000);
    expect(t.cell("전체 양도차익", "total")).toBe(-200_000_000);
  });

  it("EL-3 함께 양도(토지 + 비과세 손실 주택) — 열마다·합계 열 항등식 0 (종전 주택 열 −233,333,333)", async () => {
    const f = form([LAND, HOUSE], "700000000");
    expect(issues(f)).toEqual([]);
    const r = await pipeline(f);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated as Loose;
    const props = agg.properties as Prop[];
    const house = props.find((p) => p.propertyId !== "primary")!;
    expect(house.isExempt).toBe(true);
    expect(house.exemptGrossGain).toBe(house.transferPrice - 700_000_000);
    const fr = aggregateToFilingResult(agg as never) as never;
    const t = tableOf(fr, "aggregate", f, { properties: props, aggregated: agg, propertyFormMap: new Map() }, 700_000_000);
    expect(t.diffs.every((d) => d.diff === 0)).toBe(true);
    expect(t.cell("취득가액", "total")).toBe(800_000_000);
    expect(relation(t).every((r) => r === 0), JSON.stringify(relation(t))).toBe(true);
    const sg = sumAssetGains(props as never);
    expect(sg.gross - sg.exempt - sg.taxable).toBe(0);
    expect(t.cell("전체 양도차익", "total")).toBe(props.reduce((s, p) => s + (p.isExempt ? (p.exemptGrossGain ?? 0) : p.transferGain), 0));
  });

  it("EL-5 짝 — 비과세 × 양(+) 차익은 불변 (취득가액 300,000,000 · gross 200,000,000)", async () => {
    const { res, t } = await single([GAIN], "500000000", 500_000_000);
    expect(res.isExempt).toBe(true);
    expect(res.exemptGrossGain).toBe(200_000_000);
    expect(t.cell("취득가액", "total")).toBe(300_000_000);
    expect(t.cell("전체 양도차익", "total")).toBe(200_000_000);
  });

  it("EL-6 세액 불변 — 비과세 손실의 결정세액 0 · 판정 그대로 · 「§102② 통산」 고지가 비과세 손실에 붙지 않는다", async () => {
    const { res, t } = await single([HOUSE], "500000000", 500_000_000);
    expect(res.isExempt).toBe(true);
    expect(res.transferGain).toBe(0);
    expect(res.determinedTax ?? 0).toBe(0);
    const gainRow = t.rows.find((x) => x.label === "전체 양도차익");
    expect(JSON.stringify(gainRow)).not.toContain("§102②");
  });
});

// ── 겸용 컴패니언 · 배율초과 · 1세대1주택 비과세 (EL-4) ────────────────────────────────────────
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "600", mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "60", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
  acquisitionCause: "inheritance", acquisitionDate: "2018-06-01", inheritanceStartDate: "2018-06-01", inheritanceAssetKind: "house_individual",
  decedentAcquisitionDate: "2015-01-01", publishedValueAtInheritance: "600000000",
  mixedHousingInheritedValueOverride: "500000000", mixedCommercialInheritedValueOverride: "400000000",
};
const LAND2: Loose = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
const mixedForm = (companion: boolean) =>
  withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: companion ? [{ ...makeDefaultAsset(1), ...LAND2 }, { ...makeDefaultAsset(2), ...MIXED, actualSalePrice: "1000000000" }] : [{ ...makeDefaultAsset(1), ...MIXED, actualSalePrice: "960000000" }],
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: companion ? "1200000000" : "960000000",
    householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "60", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);

describe("EL-4 겸용 컴패니언 · 배율초과 · 1세대1주택 비과세", () => {
  it("주택 카드 gross는 손실 그대로(−77,700,831·−10,360,111) · 열·합계 항등식 0 · Σ gross = 단건 60,000,000", async () => {
    const f = mixedForm(true);
    expect(issues(f)).toEqual([]);
    const r = await pipeline(f);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated as Loose;
    const props = agg.properties as Prop[];
    const card = (id: string) => props.find((p) => p.propertyId.startsWith(`${id}#`))!;
    for (const id of ["mu-house-land", "mu-house-bld", "mu-comm-land", "mu-comm-bld"]) expect(card(id).isExempt, id).toBe(true);
    expect(card("mu-house-land").exemptGrossGain).toBe(-77_700_831);
    expect(card("mu-house-bld").exemptGrossGain).toBe(-10_360_111);
    expect(card("mu-comm-land").exemptGrossGain).toBe(98_785_426);
    const fr = aggregateToFilingResult(agg as never) as never;
    const t = tableOf(fr, "aggregate", f, { properties: props, aggregated: agg, propertyFormMap: new Map() }, 1_200_000_000);
    expect(t.diffs.every((d) => d.diff === 0), JSON.stringify(t.diffs)).toBe(true);
    expect(relation(t).every((r) => r === 0), JSON.stringify(relation(t))).toBe(true);
    const sg = sumAssetGains(props as never);
    expect(sg.gross - sg.exempt - sg.taxable).toBe(0); // 요약 카드·PDF 합산 표가 읽는 합 — 종전엔 비과세만 눌려 88,060,942 어긋났다
    expect([sg.gross, sg.exempt, sg.taxable]).toEqual([200_000_000, 30_481_569, 169_518_431]); // 비과세 118,542,511 − 손실 파트 88,060,942
    // 집계 명세서의 비과세 합도 같은 leaf(`assetExemptGain`) — 손실 파트가 눌리지 않는다
    const stAgg = buildStatementItems(fr, f as never, f.assets[0] as never, { properties: props, aggregated: agg } as never, undefined);
    expect(stAgg.get("exemptGain")?.value).toBe(30_481_569);
    expect(stAgg.get("transferGain")?.value).toBe(200_000_000);
    const mu = props.filter((p) => p.propertyId.startsWith("mu-"));
    const gross = mu.reduce((s, p) => s + (p.isExempt ? (p.exemptGrossGain ?? 0) : p.transferGain), 0);
    expect(gross).toBe(60_000_000);
    // 단건 겸용 엔진의 4부분 gross 합과 같다(양도가액 = 파트 카드 양도가액 합)
    const sf = mixedForm(false);
    const sr = await pipeline(sf);
    const sres = sr.json.data.result as Loose;
    expect(sres.housingPart.transferGain + sres.commercialPart.transferGain).toBe(60_000_000);
  });
});
