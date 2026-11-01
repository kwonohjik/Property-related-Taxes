/**
 * anchor — 결과 PDF 신고서 머리 행(양도가액·취득일자·취득가액·필요경비)·원문자 글꼴.
 * 종전 PDF에는 이 행이 없고(단건 취득가액은 산식 안에만, 함께 양도는 값 자체가 없음) ①②④가 「`」「a」「c」로 찍혔다.
 * 값은 ⑧→④→route→화면 신고서 표 경로에서 온다(mock 세율).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm), ...extra,
  }) as TransferFormData;

async function run(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  expect(issue, JSON.stringify(issue)).toBeNull();
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "bundled", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data as Body;
}
const LAND = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", ...o,
});

import { buildFilingHeadPdfRows, buildSingleFilingHeadPdfRows } from "@/components/calc/results/transfer/filing-head-pdf-rows";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { s as pdfStyles } from "@/lib/pdf/ResultPdfPrimitives";
import { BESSHI_FONT_STACK } from "@/lib/pdf/fonts";
const GB = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "500,000,000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  ...o,
});
const RIGHT = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1985-01-01",
  preDeemedOriginalAcquisitionDate: "1984-06-01", ...o,
});
const textOf = (n: unknown): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  return textOf((n as { props?: { children?: unknown } }).props?.children);
};
const N = (o: A = {}) => LAND({ acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "500,000,000", standardPriceAtTransfer: "500000000", ...o });
const byLabel = (rows: { label: string; value: string; note?: string }[], label: string) => rows.find((r) => r.label === label);

describe("결과 PDF 신고서 머리 행 — 화면 신고서 표와 같은 값·주석", () => {
  it("단건 실가 ② — 양도가액·취득일 주석·취득가액 주석", async () => {
    const f = mk([LAND()], { contractTotalPrice: "500000000" });
    const d = await run(f);
    const rows = buildSingleFilingHeadPdfRows({ result: d.result ?? d, formData: f, asset: f.assets[0] });
    expect(rows.map((r) => r.label)).toEqual(["양도가액", "취득일자", "취득가액", "필요경비"]);
    expect(byLabel(rows, "양도가액")?.value).toBe("500,000,000");
    expect(byLabel(rows, "취득일자")?.value).toBe("1985-01-01");
    expect(byLabel(rows, "취득일자")?.note).toContain("실제 취득일 1984-06-01");
    expect(byLabel(rows, "취득가액")?.value).toBe("101,411,574");
    expect(byLabel(rows, "취득가액")?.note).toContain("② 채택");
  });
  it("단건 환산 ① — 칸은 ① · ② 값을 밝힌다", async () => {
    const f = mk([LAND({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000", standardPriceAtTransfer: "500000000", pre1990Enabled: false, preDeemedActualPrice: "100,000,000" })], { contractTotalPrice: "500000000" });
    const d = await run(f);
    const price = byLabel(buildSingleFilingHeadPdfRows({ result: d.result ?? d, formData: f, asset: f.assets[0] }), "취득가액");
    expect(price?.value).toBe("200,000,000");
    expect(price?.note).toContain("① 채택");
  });
  it("비교 없는 단건 — 주석 없음", async () => {
    const f = mk([N()], { contractTotalPrice: "500000000" });
    const d = await run(f);
    const rows = buildSingleFilingHeadPdfRows({ result: d.result ?? d, formData: f, asset: f.assets[0] });
    expect(byLabel(rows, "취득일자")?.value).toBe("2015-06-01");
    expect(rows.every((r) => r.note === undefined)).toBe(true);
  });
  it("함께 양도 — 열마다 한 줄 · 값 없는 칸은 줄이 없다 · ② 주석은 그 자산에만", async () => {
    const f = mk([N(), LAND({ actualSalePrice: "500,000,000", standardPriceAtTransfer: "500000000" })], { contractTotalPrice: "1000000000" });
    const agg = (await run(f)).aggregated;
    const rows = buildFilingHeadPdfRows({ result: aggregateToFilingResult(agg), formData: f, aggregate: { properties: agg.properties, aggregated: agg } as never });
    expect(byLabel(rows, "취득가액 — 합계")?.value).toBe("401,411,574");
    expect(byLabel(rows, "취득일자 — 합계")).toBeUndefined();
    const dates = rows.filter((r) => r.label.startsWith("취득일자"));
    expect(dates.map((r) => r.value)).toEqual(["2015-06-01", "1985-01-01"]);
    expect(dates[0].note).toBeUndefined();
    expect(dates[1].note).toContain("실제 취득일");
    const prices = rows.filter((r) => r.label.startsWith("취득가액"));
    expect(prices.map((r) => r.note === undefined)).toEqual([true, true, false]);
  });
  it("일반건물 일괄 — 토지·건물 열", async () => {
    const f = mk([GB()], { contractTotalPrice: "1000000000" });
    const agg = (await run(f)).aggregated;
    const rows = buildFilingHeadPdfRows({ result: aggregateToFilingResult(agg), formData: f, aggregate: { properties: agg.properties, aggregated: agg } as never });
    expect(rows.filter((r) => r.label.startsWith("취득일자")).map((r) => r.value)).toEqual(["1985-01-01", "1985-01-01"]);
    expect(byLabel(rows, "취득가액 — 합계")?.value).toBe("507,057,874");
  });
  it.each([["A", "2001-02-03", "2020-05-06", "2001-02-03"], ["B", "2001-02-03", "2020-05-06", "2020-05-06"]])("이월과세 %s 채택 — 채택된 쪽 날짜", (scenario, donor, gift, want) => {
    const base = mk([LAND({ preDeemedOriginalAcquisitionDate: "", acquisitionDate: gift, carryover: { donorAcquisitionDate: donor, giftRegistryDate: gift } })]);
    const result = { transferGain: 0, isExempt: false, carryoverTaxationDetail: { isEligible: true, adoptedScenario: scenario } } as never;
    const date = buildSingleFilingHeadPdfRows({ result, formData: base, asset: base.assets[0] }).find((r) => r.label.startsWith("취득일자"));
    expect(date?.value).toBe(want);
    expect(date?.label).toContain(scenario === "A" ? "증여자 취득일" : "증여 등기접수일");
  });
  it("이월과세 부적격 — 폼 날짜(대조군)", () => {
    const base = mk([LAND({ preDeemedOriginalAcquisitionDate: "", acquisitionDate: "2020-05-06", carryover: { donorAcquisitionDate: "2001-02-03", giftRegistryDate: "2020-05-06" } })]);
    const result = { transferGain: 0, isExempt: false, carryoverTaxationDetail: { isEligible: false, adoptedScenario: "A" } } as never;
    expect(buildSingleFilingHeadPdfRows({ result, formData: base, asset: base.assets[0] }).find((r) => r.label === "취득일자")?.value).toBe("2020-05-06");
  });
  it("재개발 입주권 — 화면 표와 같은 재개발 열(빈 칸 기본값 포함)", async () => {
    const f = mk([RIGHT()], { contractTotalPrice: "1300000000" });
    const d = await run(f);
    const r = d.result ?? d;
    const rows = buildSingleFilingHeadPdfRows({ result: r, formData: f, asset: f.assets[0] });
    expect(rows).toEqual(buildFilingHeadPdfRows({ result: r, formData: f, asset: f.assets[0], redevSubject: "right", redevSettlementDirection: "pay" }));
    expect(rows).not.toEqual(buildFilingHeadPdfRows({ result: r, formData: f, asset: f.assets[0] }));
    expect(rows.find((x) => x.label.startsWith("취득일자"))?.note).toContain("실제 취득일 1984-06-01");
    // 구분 칸이 비면 자산 종류로 정한다 — 입주권은 "right"
    const blank = { ...f.assets[0], redevSubject: "", redevSettlementDirection: "" } as AssetForm;
    expect(buildSingleFilingHeadPdfRows({ result: r, formData: f, asset: blank })).toEqual(buildFilingHeadPdfRows({ result: r, formData: f, asset: blank, redevSubject: "right", redevSettlementDirection: "pay" }));
    expect(buildSingleFilingHeadPdfRows({ result: r, formData: f, asset: blank })).not.toEqual(buildFilingHeadPdfRows({ result: r, formData: f, asset: blank, redevSubject: "apt", redevSettlementDirection: "pay" }));
  });

  it("TransferSection — 머리 행과 주석을 그린다 · 없으면 종전 그대로", () => {
    const r = { transferGain: 100, determinedTax: 1 };
    const on = textOf(TransferSection({ r, headRows: [{ label: "취득일자", value: "1985-01-01", note: "실제 취득일 1984-06-01" }, { label: "취득가액", value: "101,411,574" }] }));
    expect(on).toContain("취득일자");
    expect(on).toContain("1985-01-01");
    expect(on).toContain("실제 취득일 1984-06-01");
    expect(on).toContain("101,411,574");
    const off = textOf(TransferSection({ r }));
    expect(off).not.toContain("취득일자");
    expect(off).toContain("전체 양도차익");
  });
  it("ResultPdfDocument — inputData.filingHeadRows가 양도세 섹션까지 닿는다", () => {
    const props = { taxType: "transfer", taxTypeLabel: "양도소득세", createdAt: "x", resultData: { transferGain: 100, determinedTax: 1 }, inputData: { filingHeadRows: [{ label: "취득일자", value: "1985-01-01" }] } };
    const walk = (n: unknown): string => {
      if (n == null || typeof n === "boolean") return "";
      if (typeof n === "string" || typeof n === "number") return String(n);
      if (Array.isArray(n)) return n.map(walk).join(" ");
      const el = n as { type?: unknown; props?: { children?: unknown } };
      if (typeof el.type === "function") { try { return walk((el.type as (p: unknown) => unknown)(el.props)); } catch { return ""; } }
      return walk(el.props?.children);
    };
    expect(walk(ResultPdfDocument(props as never))).toContain("1985-01-01");
  });
  it("글꼴 — NanumGothic에 없는 원문자·㎡ 대체 글꼴을 페이지 기본으로 쓴다", () => {
    expect(pdfStyles.page.fontFamily).toEqual([...BESSHI_FONT_STACK]);
    expect(BESSHI_FONT_STACK[0]).toBe("NanumGothic");
  });
});
