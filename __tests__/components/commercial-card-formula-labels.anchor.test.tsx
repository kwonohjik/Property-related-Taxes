/**
 * anchor — 상가·오피스텔 환산 카드(`CommercialBuildingValuationDetailCard`) 산식 라벨이 엔진 값과 맞는다
 * (양도세 결과뷰 리뷰 2026-11-21 MAJOR R-c01-03 · R-c01-04 · R-c09-01).
 *
 *  · R-c09-01 — 지분 자산 산식의 「양도가액」이 폼 계약 총액(100%)이었다. 엔진은 지분 적용 후 값으로 환산한다
 *               (지분 40%: 엔진 400,000,000 · 화면 1,000,000,000 → 산식대로면 양도차익 838,080,000 vs 결과 238,080,000).
 *  · R-c01-03 — 과세표준 라벨이 「기본공제 2,500,000」 고정 · 산출세액 라벨이 「§55 누진세율」 고정이었다
 *               (연간 기사용 1,000,000이면 엔진 기본공제 1,500,000 · 미등기는 §104①10호 70% · 단기는 2·3호).
 *  · R-c01-04 — §97②2호 단서(swap) 발동 때도 「양도가액 − 환산취득가 − 개산공제」였다
 *               (10억 − 400,000,000 − 4,800,000 표시 · 결과 540,000,000 = 10억 − 나목 460,000,000).
 *
 * 입력은 화면 폼(AssetForm) → ④ body → 실제 route(⑫⑭) → 엔진 결과 → 카드 렌더다(손으로 만든 echo 아님).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { SingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
afterEach(cleanup);

/** 상가 환산(2005 이후 취득) — 연면적 80㎡ · 양도 ㎡당 5,000,000 · 취득 ㎡당 2,000,000 → 환산취득가 = 양도가액 × 0.4 */
function form(num = "100", acquisitionDate = "2010-01-01", over: Partial<AssetForm> = {}): TransferFormData {
  const a = {
    ...makeDefaultAsset(1),
    acquisitionCause: "purchase", acquisitionDate,
    ownershipNumerator: num, ownershipDenominator: "100", ownershipRemainderThirdParty: num === "100" ? "" : "yes",
    assetKind: "commercial_building", useEstimatedAcquisition: true,
    cbExclusiveArea: "60", cbSharedArea: "20", cbLandArea: "30",
    cbUnitPriceAtTransfer: "5000000", cbUnitPriceAtFirstOrAcq: "2000000",
    cbLandPricePerSqmAtTransfer: "3000000", cbLandPricePerSqmAtAcq: "1000000",
    ...over,
  } as AssetForm;
  return { transferDate: "2024-06-01", filingDate: "2024-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: "1000000000", totalTransferExpense: "0" } as unknown as TransferFormData;
}

async function run(f: TransferFormData, extra: Record<string, unknown> = {}): Promise<TransferTaxResult> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
      ...cap.body, isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0, ...extra,
    }),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result as TransferTaxResult;
}

/** 카드의 산식 행 라벨(첫 칸) — 접두로 찾는다 */
function rowLabel(container: HTMLElement, prefix: string): string {
  const td = [...container.querySelectorAll("tr > td:first-child")].find((el) => (el.textContent ?? "").startsWith(prefix));
  expect(td, `「${prefix}」 행이 없다`).toBeDefined();
  return td!.textContent ?? "";
}

function mountSingle(f: TransferFormData, r: TransferTaxResult) {
  return render(<SingleDetailCards result={r} formData={f} asset={f.assets[0]} />).container;
}

describe("R-c09-01 — 지분 상가: 산식의 양도가액 = 엔진이 환산에 넣은 지분 적용 후 값", () => {
  it("지분 40% — 환산취득가·양도차익 산식이 400,000,000으로 결과값을 다시 만든다", async () => {
    const f = form("40");
    const r = await run(f);
    const d = r.commercialBuildingValuationDetail!;
    expect(r.transferGain).toBe(238_080_000);
    const c = mountSingle(f, r);
    const acq = rowLabel(c, "환산취득가 합계");
    expect(acq).toContain("양도가액 400,000,000");
    expect(acq).not.toContain("1,000,000,000");
    const gain = rowLabel(c, "양도차익 =");
    expect(gain).toContain("양도가액 400,000,000");
    expect(400_000_000 - d.estimatedAcquisitionTotal - d.estimatedDeductionTotal).toBe(r.transferGain);
  });

  it("단독(100%) — 종전과 같은 1,000,000,000", async () => {
    const f = form();
    const r = await run(f);
    expect(rowLabel(mountSingle(f, r), "양도차익 =")).toContain("양도가액 1,000,000,000");
  });
});

describe("R-c01-03 — 과세표준·산출세액 라벨이 엔진 기본공제·적용 호를 따른다", () => {
  it.each([
    [0, "2,500,000"],
    [1_000_000, "1,500,000"],
    [2_500_000, "0"],
  ])("연간 기사용 %d → 기본공제 %s", async (used, shown) => {
    const f = form();
    const r = await run(f, { annualBasicDeductionUsed: used });
    const label = rowLabel(mountSingle(f, r), "과세표준 =");
    expect(label).toContain(`기본공제 ${shown} `);
    expect(r.taxBase).toBe(Math.max(0, r.taxableGain - r.longTermHoldingDeduction) - r.basicDeduction);
  });

  it("미등기 — §104①10호 70% (§55·기본공제 2,500,000 아님)", async () => {
    const f = form();
    const r = await run(f, { isUnregistered: true });
    const c = mountSingle(f, r);
    expect(rowLabel(c, "과세표준 =")).toContain("기본공제 0 ");
    const tax = rowLabel(c, "산출세액");
    expect(tax).toContain("과세표준 × 70%");
    expect(tax).toContain("소득세법 §104 ①10호");
    expect(tax).not.toContain("§55");
    expect(Math.floor(r.taxBase * 0.7)).toBe(r.calculatedTax);
  });

  it.each([
    ["2023-10-01", "과세표준 × 50%", "소득세법 §104 ①3호", 0.5],
    ["2022-10-01", "과세표준 × 40%", "소득세법 §104 ①2호", 0.4],
  ])("단기 취득 %s → %s (%s)", async (acq, formula, cite, rate) => {
    const f = form("100", acq);
    const r = await run(f);
    const tax = rowLabel(mountSingle(f, r), "산출세액");
    expect(tax).toContain(formula);
    expect(tax).toContain(cite);
    expect(tax).not.toContain("§55");
    expect(Math.floor(r.taxBase * rate)).toBe(r.calculatedTax);
  });

  it("장기 보유 — §104①1호(§55① 기본세율)", async () => {
    const f = form();
    const r = await run(f);
    expect(r.rateClause).toBe("104-1-1");
    expect(rowLabel(mountSingle(f, r), "산출세액")).toContain("소득세법 §104 ①1호 — 소득세법 §55 ① 기본세율");
  });
});

describe("R-c01-04 — §97②2호 단서 swap이면 양도차익 산식 = 양도가액 − 나목", () => {
  it("단건 — 10억 − 460,000,000 = 540,000,000 (환산취득가·개산공제 미표기)", async () => {
    const f = form("100", "2010-01-01", { capitalExpenditure: "450000000", transferExpense: "10000000", directExpenses: "460000000" } as Partial<AssetForm>);
    const r = await run(f);
    expect(r.swapApplied).toBe(true);
    expect(r.transferGain).toBe(540_000_000);
    const gain = rowLabel(mountSingle(f, r), "양도차익 =");
    expect(gain).toContain("양도가액 1,000,000,000 − 필요경비(자본적지출 + 양도비) 460,000,000");
    expect(gain).toContain("소득세법 §97 ② 2호 단서");
    expect(gain).not.toContain("개산공제");
    expect(1_000_000_000 - 460_000_000).toBe(r.transferGain);
  });

  it("다건 자산 카드 — 자산별 swap echo로 같은 산식", () => {
    const item = baseTransferInput({
      propertyId: "p1", propertyLabel: "상가",
      propertyType: "commercial_building", transferPrice: 1_000_000_000,
      transferDate: new Date("2020-06-01"), acquisitionDate: new Date("2010-06-01"), acquisitionPrice: 0,
      isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0,
      useEstimatedAcquisition: true, transferCause: "general",
      commercialBuildingValuation: { isPreDisclosure: false, exclusiveArea: 150, commonArea: 50, unitPriceAtTransfer: 2_500_000, unitPriceAtAcquisition: 1_000_000 },
      capitalExpenditure: 450_000_000, transferExpense: 10_000_000,
    } as Partial<TransferTaxInput>);
    const agg = calculateTransferTaxAggregate({ properties: [item] as unknown as TransferTaxItemInput[], taxYear: 2020, annualBasicDeductionUsed: 0 }, rates);
    const b = agg.properties[0];
    expect(b.transferGain).toBe(540_000_000);
    const { container } = render(
      <ValuationDetailCards result={b} transferPrice={b.transferPrice} transferGain={b.transferGain} longTermDeduction={b.longTermHoldingDeduction} />,
    );
    expect(rowLabel(container, "양도차익 =")).toContain("양도가액 1,000,000,000 − 필요경비(자본적지출 + 양도비) 460,000,000");
  });
});
