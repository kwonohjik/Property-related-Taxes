/**
 * 청산금 수령 단독 신고 × 축 B — 전 지분 단독이면 세액은 단건과 같고, 표시도 단건의 지분 몫이다.
 * 지분마다 단독 여부·고시일이 다르면 카드 순서에 따라 세액이 달라져 ⑧·⑫에서 막는다
 * (계획서 `docs/02-design/features/axis-b-receive-only.plan.md`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { BundledAllocationCard, aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { RECEIVE_ONLY_MIXED_MESSAGE, RECEIVE_ONLY_DATE_MESSAGE } from "@/lib/calc/axis-b-receive-only";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const APT = { assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000", redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2024-03-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", redevReceiveOnlyMode: "yes" };
const HIGH = { ...APT, redevRightsValue: "2000000000", redevActualAcquisitionPrice: "500000000" };
const DECLARED = { redevExemptionEligibleAtApproval: "yes" };
const MULTI = { isOneHousehold: false, householdHousingCount: "2", residencePeriodMonths: "0" };
const ONE = { isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "60" };
const S = (n: string) => ({ redevSettlementAmount: n });
const LATE = { transferDate: "2026-06-01", filingDate: "2026-08-31" };
const OLD = { redevSettlementSaleDate: "2020-03-01" };
const NO = { redevReceiveOnlyMode: "no" };

function form(hh: L, pcts: string[], total: string, per: L[] = [], base: L = APT) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: total, bundledSaleMode: "actual" }, hh);
  if (pcts.length > 1) f.assetSplitMode = "fractional";
  f.assets = pcts.map((p, k) => ({ ...makeDefaultAsset(k + 1), ...base, ...(k === 0 ? { residenceInputMode: "direct", residencePeriodMonthsAsset: hh.residencePeriodMonths, addressJibun: "서울 A 1", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true } : {}), assetId: `A${k + 1}`, ownershipNumerator: p, ownershipDenominator: "100", ownershipRemainderThirdParty: "", ...(pcts.length === 1 ? { actualSalePrice: total } : {}), ...(per[k] ?? {}) }));
  return f as never;
}

async function calc(f: never) {
  const r = await postTransfer((await captureBody(f)) as L);
  const data = r.json?.data as L | undefined;
  return { status: r.status, data, error: r.json?.error as L | undefined, tax: data?.aggregated?.totalTax ?? data?.result?.totalTax, props: (data?.aggregated?.properties ?? []) as L[] };
}

const conflictIssues = (f: never) => allIssues(f).map((i) => i.message).filter((m) => m === RECEIVE_ONLY_MIXED_MESSAGE || m === RECEIVE_ONLY_DATE_MESSAGE);

afterEach(cleanup);

describe("전 지분 단독 — 세액은 단건과 같다", () => {
  const SPLITS: [string, string[], string[]][] = [
    ["50/50", ["50", "50"], ["50000000", "50000000"]],
    ["60/40", ["60", "40"], ["60000000", "40000000"]],
    ["3지분", ["33.33", "33.33", "33.34"], ["33330000", "33330000", "33340000"]],
  ];
  it.each(SPLITS)("다주택 권리 6억 %s — 2,161,500", async (_n, pcts, amounts) => {
    expect((await calc(form(MULTI, ["100"], "2000000000"))).tax).toBe(2_161_500);
    expect((await calc(form(MULTI, pcts, "2000000000", amounts.map(S)))).tax).toBe(2_161_500);
  });

  it.each([
    ["미선언 권리 20억 수령 5억", {}, 89_881_000],
    ["선언 권리 20억 수령 5억(고가 안분)", DECLARED, 23_633_500],
  ])("1세대1주택 %s", async (_n, extra, tax) => {
    const base = { ...HIGH, ...extra };
    expect((await calc(form(ONE, ["100"], "3000000000", [S("500000000")], base))).tax).toBe(tax);
    expect((await calc(form(ONE, ["50", "50"], "3000000000", [S("250000000"), S("250000000")], base))).tax).toBe(tax);
    // 계약 총액은 이 신고의 세액과 무관하다.
    expect((await calc(form(ONE, ["50", "50"], "500000000", [S("250000000"), S("250000000")], base))).tax).toBe(tax);
  });

  it("1세대1주택 선언 권리 6억 — 양쪽 비과세, 세액 0", async () => {
    const t = await calc(form(ONE, ["50", "50"], "2000000000", [S("50000000"), S("50000000")], { ...APT, ...DECLARED }));
    expect(t.tax).toBe(0);
    expect(t.props.map((p) => p.isExempt)).toEqual([true, true]);
  });

  it("고시일과 폼 양도일이 달라도 단건과 같다", async () => {
    expect((await calc(form({ ...MULTI, ...LATE }, ["100"], "2000000000", [OLD]))).tax).toBe(2_799_500);
    expect((await calc(form({ ...MULTI, ...LATE }, ["50", "50"], "2000000000", [{ ...S("50000000"), ...OLD }, { ...S("50000000"), ...OLD }]))).tax).toBe(2_799_500);
  });
});

describe("전 지분 단독 — 표시 값은 단건의 지분 몫이다", () => {
  it("60/40 — 양도가액 = 수령액, 취득가액 = 지분 몫, 계약 총액과 무관", async () => {
    for (const total of ["2000000000", "1000000000"]) {
      const t = await calc(form(MULTI, ["60", "40"], total, [S("60000000"), S("40000000")]));
      expect(t.props.map((p) => p.transferPrice)).toEqual([60_000_000, 40_000_000]);
      expect(t.props.map((p) => p.acquisitionPrice)).toEqual([40_000_000, 26_666_666]);
      expect(t.data!.apportionment.apportioned.map((a: L) => a.allocatedSalePrice)).toEqual([60_000_000, 40_000_000]);
    }
  });

  it("신고서 합계·양도일자 — 단건과 같고, 보유기간도 그 날짜까지다", async () => {
    const f = form(MULTI, ["50", "50"], "2000000000", [S("50000000"), S("50000000")]) as L;
    const t = await calc(f as never);
    const agg = t.data!.aggregated;
    const meta = { properties: agg.properties, aggregated: agg } as never;
    const rows = buildAggregateRows({} as never, meta, f as never);
    const row = (label: string) => rows.find((r) => r.label.trim() === label)!.values as L;
    expect(row("양도일자").total).toBe("2024-03-01");
    expect(row("양도일자").primary).toBe("2024-03-01");
    expect(row("양도가액").total).toBe(100_000_000);
    expect(row("취득가액").total).toBe(66_666_666);
    const items = buildStatementItems(aggregateToFilingResult(agg), f as never, undefined, meta, undefined);
    expect(items.get("transferDate")?.value).toBe("2024-03-01");
    expect(items.get("transferDate")?.perAsset?.map((x) => x.value)).toEqual(["2024-03-01", "2024-03-01"]);
    expect(items.get("transferPrice")?.value).toBe(100_000_000);
    expect(String(items.get("transferPrice")?.formula)).not.toContain("§166⑥");
  });

  it("결과 카드 — 안분 표가 없다", async () => {
    const f = form(MULTI, ["60", "40"], "2000000000", [S("50000000"), S("50000000")]);
    const t = await calc(f);
    const c = render(<BundledAllocationCard apportionment={t.data!.apportionment} aggregated={t.data!.aggregated} formData={f} onBack={() => {}} onReset={() => {}} />);
    expect(c.container.textContent).not.toContain("안분 양도가액");
  });
});

describe("대조 — 다른 경로는 그대로다", () => {
  it("동시 신고 50/50 — 지분가액 + 수령액, 세액 불변", async () => {
    const t = await calc(form({ ...MULTI, ...LATE }, ["50", "50"], "2000000000", [{ ...S("50000000"), ...NO, ...OLD }, { ...S("50000000"), ...NO, ...OLD }]));
    expect(t.tax).toBe(516_928_501);
    expect(t.props.map((p) => p.transferPrice)).toEqual([1_050_000_000, 1_050_000_000]);
  });

  it("동시 신고 결과 카드 — 안분 표가 남는다", async () => {
    const f = form({ ...MULTI, ...LATE }, ["50", "50"], "2000000000", [{ ...S("50000000"), ...NO, ...OLD }, { ...S("50000000"), ...NO, ...OLD }]);
    const t = await calc(f);
    const c = render(<BundledAllocationCard apportionment={t.data!.apportionment} aggregated={t.data!.aggregated} formData={f} onBack={() => {}} onReset={() => {}} />);
    expect(c.container.textContent).toContain("안분 양도가액");
  });

  it("함께 양도 — 단독 APT 5천 + 주택 10억", async () => {
    const H = { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000", addressJibun: "서울 B 2", redevReceiveOnlyMode: "", redevSettlementAmount: "", redevSettlementDirection: "" };
    const f = form(MULTI, ["100", "100"], "1050000000", [{ ...S("50000000"), actualSalePrice: "50000000" }, { ...H, actualSalePrice: "1000000000" }]) as L;
    f.assetSplitMode = "";
    const t = await calc(f as never);
    expect(t.status, JSON.stringify(t.error)).toBe(200);
    expect(t.tax).toBe(230_043_000);
    expect(t.props.map((p) => p.transferPrice)).toEqual([50_000_000, 1_000_000_000]);
    expect(t.props[0].acquisitionPrice).toBe(33_333_333);
    expect(conflictIssues(f as never)).toEqual([]);
    // 자산별 양도일 — 단독 APT 칸은 고시일 다음날이고, 신고서 표와 명세서가 같다.
    const agg = t.data!.aggregated;
    const meta = { properties: agg.properties, aggregated: agg } as never;
    const rows = buildAggregateRows({} as never, meta, f as never);
    const dates = rows.find((r) => r.label.trim() === "양도일자")!.values as L;
    expect(agg.properties.map((p: L) => dates[p.propertyId])).toEqual(["2024-03-01", "2024-06-01"]);
    expect(buildStatementItems(aggregateToFilingResult(agg), f as never, undefined, meta, undefined).get("transferDate")?.perAsset?.map((x) => x.value)).toEqual(["2024-03-01", "2024-06-01"]);
  });
});

describe("경계", () => {
  it("함께 양도 단독 APT 2건 — 안분 표가 남는다(축 B만 숨긴다)", async () => {
    const f = form(MULTI, ["100", "100"], "150000000", [{ ...S("70000000"), actualSalePrice: "70000000" }, { ...S("80000000"), actualSalePrice: "80000000", addressJibun: "서울 B 2" }]) as L;
    f.assetSplitMode = "";
    const t = await calc(f as never);
    expect(t.status, JSON.stringify(t.error)).toBe(200);
    expect(t.data!.apportionment.apportioned.map((a: L) => a.allocatedSalePrice)).toEqual([70_000_000, 80_000_000]);
    const c = render(<BundledAllocationCard apportionment={t.data!.apportionment} aggregated={t.data!.aggregated} formData={f as never} onBack={() => {}} onReset={() => {}} />);
    expect(c.container.textContent).toContain("안분 양도가액");
  });

  it("수령액 0인 지분이 있으면 안분값을 교체하지 않는다", async () => {
    const t = await calc(form(MULTI, ["50", "50"], "2000000000", [S("100000000"), S("0")]));
    expect(t.status, JSON.stringify(t.error)).toBe(200);
    expect(t.data!.apportionment.apportioned.map((a: L) => a.allocatedSalePrice)).toEqual([1_000_000_000, 1_000_000_000]);
  });
});

describe("지분별 불일치 — ⑧·⑫가 같이 막는다", () => {
  const BLOCKED: [string, L[], string][] = [
    ["첫째만 단독", [{ ...S("50000000"), ...OLD }, { ...S("50000000"), ...NO, ...OLD }], RECEIVE_ONLY_MIXED_MESSAGE],
    ["둘째만 단독", [{ ...S("50000000"), ...NO, ...OLD }, { ...S("50000000"), ...OLD }], RECEIVE_ONLY_MIXED_MESSAGE],
    ["고시일 다름", [{ ...S("50000000"), ...OLD }, { ...S("50000000"), redevSettlementSaleDate: "2024-03-01" }], RECEIVE_ONLY_DATE_MESSAGE],
  ];
  it.each(BLOCKED)("%s", async (_n, per, message) => {
    const f = form({ ...MULTI, ...LATE }, ["50", "50"], "2000000000", per);
    expect(conflictIssues(f)).toEqual([message]);
    const t = await calc(f);
    expect(t.status).toBe(400);
    expect(JSON.stringify(t.error)).toContain(message);
  });

  const ALLOWED: [string, L[], string][] = [
    ["전 지분 단독 · 같은 날", [{ ...S("50000000"), ...OLD }, { ...S("50000000"), ...OLD }], "2,799,500"],
    ["전 지분 동시 신고 · 고시일 같음", [{ ...S("50000000"), ...NO, ...OLD }, { ...S("50000000"), ...NO, ...OLD }], "516,928,501"],
  ];
  it.each(ALLOWED)("통과 — %s", async (_n, per, tax) => {
    const f = form({ ...MULTI, ...LATE }, ["50", "50"], "2000000000", per);
    expect(conflictIssues(f)).toEqual([]);
    const t = await calc(f);
    expect(t.status).toBe(200);
    expect(t.tax.toLocaleString("en-US")).toBe(tax);
  });
});
