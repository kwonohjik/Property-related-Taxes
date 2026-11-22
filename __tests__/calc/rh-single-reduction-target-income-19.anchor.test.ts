/**
 * 단건 §155⑳ 특례(장기임대주택 보유자 거주주택) 경로의 ⑲ 세액감면대상금액 — 과세대상 양도소득금액 기준 (표시 전용 · 세액 불변).
 *
 * 근거: 소득세법 §90①의 B(「감면대상 양도소득금액」)는 §95 양도소득금액 **안의** 금액이다. §95③·소령 §160①로
 *   고가주택 양도소득금액 자체가 12억 초과분이고, 별지84호 부표1 작성방법 14는 ⑲를 「양도자산의 감면소득금액」으로 적게 한다.
 * 종전: 신고서 표·상세명세서·PDF가 isRH일 때 양도소득금액 행 값(양도차익 − 장특 · 비과세분 차감 전)을 ⑲ 인자로 넘겨
 *   ⑲가 엔진 B보다 비과세분만큼 컸다. 같은 주택의 일반 고가주택 경로 단건 ⑲·다건 RH ⑲는 이미 과세대상 기준이었다.
 *
 * 시료: 15억 주택(2009-08-12 취득 · 비조정) · 임대 1호 · §77 공익수용 현금 15억 · fallback 세율.
 *
 * | 시나리오 | 양도소득금액 행 | 비과세 양도소득금액 행 | ⑲ 종전 | ⑲ 정정(= 엔진 B) | 총세액(불변) |
 * |---|---|---|---|---|---|
 * | A(RH-A2) | 525,720,000 | 420,576,000 | 525,720,000 | 105,144,000 | 19,768,411 |
 * | B(RH-B2 · 소령 §161②) | 707,700,000 | 150,639,000 | 707,700,000 | 557,061,000 | 190,081,472 |
 * | 짝: 특례 끔(일반 경로) | 707,700,000 | 0 | 707,700,000 | 707,700,000 | 251,135,460 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc } from "./_helpers/redev-one-house-route";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
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
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

function form(scenario: "A" | "B", applyException = true) {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2026-08-01", householdHousingCount: "2", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "30" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException,
    scenario,
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "80", requirementsConfirmed: true }],
    priorResidenceTransferDate: "2016-08-25",
    standardPriceAtAcquisitionForPhrp: "300,000,000",
    standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000",
    postRegistrationResidenceMonths: "30",
    wasRegisteredRentalOrChildcare: true,
  };
  (f.assets[0] as unknown as { reductions: unknown[] }).reductions = [
    { type: "public_expropriation", expropriationCash: "1500000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" },
  ];
  return f;
}

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect(((el.props ?? {}) as { children?: unknown }).children, out);
  return out;
}

type Rows = { label: string; values: Record<string, number | null> }[];

async function layers(scenario: "A" | "B", applyException = true) {
  const f = form(scenario, applyException);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  expect(r.json.data.mode).toBe("single");
  const res = r.json.data.result;
  const rows = buildRows(res, "single", f, f.assets[0]) as Rows;
  const row = (label: string | RegExp) => rows.find((x) => (typeof label === "string" ? x.label === label : label.test(x.label)))?.values.total;
  const stmt = buildStatementItems(res, f, f.assets[0], undefined, undefined).get("reductionTargetIncome")!;
  const pdf = collect(TransferSection({ r: res }));
  return {
    res,
    filing19: row("세액감면대상금액"),
    income: row("양도소득금액"),
    nontax: row(/^비과세 양도소득금액/),
    after: row("감면후 소득금액"),
    stmt,
    pdf19: pdf[pdf.indexOf("세액감면대상금액") + 1],
  };
}

describe("단건 §155⑳ 특례 ⑲ = 과세대상 양도소득금액(엔진 B) — 신고서 표 · 상세명세서 · PDF", () => {
  it("🔑 시나리오 A(RH-A2) — ⑲ 105,144,000 (종전 525,720,000) = 양도소득금액 − 비과세 양도소득금액 = 엔진 §77 B", async () => {
    const l = await layers("A");
    expect(l.res.rentalHousingExceptionDetail.scenarioId).toBe("RH-A2");
    expect(l.res.reductionTypeApplied).toBe("public_expropriation");
    // 양도소득금액·비과세 행은 그대로(비과세 차감 전 규약)
    expect(l.income).toBe(525_720_000);
    expect(l.nontax).toBe(420_576_000);
    // ⑲ — 독립 도출(행 차) · 엔진 B 두 축으로 고정
    expect(l.income! - l.nontax!).toBe(105_144_000);
    expect(l.res.publicExpropriationDetail.breakdown.cashIncome).toBe(105_144_000);
    expect(l.filing19).toBe(105_144_000);
    expect(l.stmt.value).toBe(105_144_000);
    expect(l.pdf19).toBe("105,144,000");
    expect(l.after).toBe(105_144_000);
  });

  it("🔑 시나리오 B(RH-B2 · 소령 §161②) — ⑲ 557,061,000 (종전 707,700,000) = 엔진 §77 B", async () => {
    const l = await layers("B");
    expect(l.res.rentalHousingExceptionDetail.scenarioId).toBe("RH-B2");
    expect(l.income).toBe(707_700_000);
    expect(l.nontax).toBe(150_639_000);
    expect(l.income! - l.nontax!).toBe(557_061_000);
    expect(l.res.publicExpropriationDetail.breakdown.cashIncome).toBe(557_061_000);
    expect(l.filing19).toBe(557_061_000);
    expect(l.stmt.value).toBe(557_061_000);
    expect(l.pdf19).toBe("557,061,000");
  });

  it("상세명세서 ⑲ 산식 — 특례 경로는 비과세분을 뺀 과세대상 기준임을 밝힌다(값과 같은 수 인라인)", async () => {
    const l = await layers("A");
    expect(l.stmt.formula).toContain("105,144,000");
    expect(l.stmt.formula).toContain("위 비과세 양도소득금액을 뺀 과세대상 양도소득금액 기준");
    expect(l.stmt.formula).not.toContain("525,720,000");
  });

  it("세액 불변 — 감면세액·총세액은 엔진값 그대로", async () => {
    const a = await layers("A");
    expect(a.res.reductionAmount).toBe(3_072_810);
    expect(a.res.totalTax).toBe(19_768_411);
    const b = await layers("B");
    expect(b.res.reductionAmount).toBe(29_546_343);
    expect(b.res.totalTax).toBe(190_081_472);
  });

  it("짝 — 특례를 끄면(일반 경로) ⑲ = 양도소득금액 707,700,000 · 산식에 특례 문구 없음(종전 그대로)", async () => {
    const l = await layers("B", false);
    expect(l.res.rentalHousingExceptionDetail?.applied).not.toBe(true);
    expect(l.income).toBe(707_700_000);
    expect(l.filing19).toBe(707_700_000);
    expect(l.stmt.value).toBe(707_700_000);
    expect(l.pdf19).toBe("707,700,000");
    expect(l.res.publicExpropriationDetail.breakdown.cashIncome).toBe(707_700_000);
    expect(l.stmt.formula).not.toContain("과세대상 양도소득금액 기준");
    expect(l.res.totalTax).toBe(251_135_460);
  });
});
