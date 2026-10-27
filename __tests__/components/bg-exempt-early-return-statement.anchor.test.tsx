/**
 * anchor — 부담부증여 × 1세대1주택 전액 비과세: §159 명세·증여세가 결과에 실린다 (계획서 `bg-exempt-early-return-statement.plan.md` §5 · Q-1 a).
 *
 * 종전: STEP 1a 비과세 조기 반환(`buildExemptEarlyResult`)이 STEP 0.48 §159 명세를 싣지 않았다.
 *   · 단건 — 결과 화면에 「부담부증여 평가 명세」·증여세 결정세액(77,600,000)·증여세 신고서 양식(별지 제10호)이 없었다.
 *   · 묶음 — 카드별 명세가 안 생겨 결과 명세가 첫 지분 값(272,727,272)이었고 비과세 카드의 자산별 취득가액은 0이었다.
 * 세액은 바뀌지 않는다(표시 전용).
 *
 * 시료: G1-14 픽스처(`axis-b-burdened-gift-high-value-g1-14.anchor.test.ts`) — 주택 · 양도시 기준시가 11억 · 취득시 5억 · 1세대1주택 ·
 * 거주 120개월 · 2009-03-01 → 2024-03-01 · 채무 6억(보증금 3억 + 차입 3억 — 보충적평가가 이겨 12억 이하 → 전액 비과세). mock 세율표 실측.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const DEBT_6 = { bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000" };
const DEBT_13 = { bgLendingDepositTotal: "650000000", bgMortgageDebtAmount: "650000000" };
const asset = (id: number, numerator: string, over: Record<string, string>): AssetForm =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-03-01",
    residenceInputMode: "direct", residencePeriodMonthsAsset: "120", ownershipNumerator: numerator, ownershipDenominator: "100",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    standardPriceAtTransfer: "1100000000", standardPriceAtAcq: "500000000", ...over,
  }) as AssetForm;
const LAND = {
  ...DEBT_6, addressJibun: "서울 B 2", assetKind: "land", landNature: "standalone", acquisitionArea: "100", transferArea: "100",
  standardPriceAtTransfer: "600000000", standardPriceAtAcq: "200000000", residenceInputMode: "", residencePeriodMonthsAsset: "",
};
const form = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-03-01", filingDate: "2024-05-31", assets, houses: [], presaleRights: [], contractTotalPrice: "1300000000",
    totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "120", ...extra,
  }) as unknown as TransferFormData;

interface Prop { isExempt?: boolean; acquisitionPrice: number }
interface Data {
  mode: string;
  result?: TransferTaxResult;
  transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
  aggregated?: { totalTax: number; properties: Prop[] };
  apportionment?: never;
}
async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body }),
  }));
  const d = ((await res.json()) as { data: Data }).data;
  expect(res.status).toBe(200);
  return d;
}
const shownAcq = (w?: TransferBurdenedGiftBreakdown) => (w ? w.perAsset.land.acquisitionPrice + w.perAsset.building.acquisitionPrice : undefined);
const text = (c: Element) => (c.textContent ?? "").replace(/\s+/g, " ");

describe("단건 100% 비과세 — 결과에 §159 명세·증여세가 실린다", () => {
  it("엔진: isExempt · 세액 0 그대로 + 명세(채무비율 6/11 · 취득가 272,727,272 · 증여세 77,600,000)", async () => {
    const d = await run(form([asset(1, "100", DEBT_6)]));
    expect(d.mode).toBe("single");
    expect(d.result?.isExempt).toBe(true);
    expect(d.result?.totalTax).toBe(0);
    const w = d.result?.transferBurdenedGiftBreakdown;
    expect(w).toBeDefined();
    expect(shownAcq(w)).toBe(272_727_272);
    expect(w?.giftTax?.finalTax).toBe(77_600_000);
  });

  it("화면: 「부담부증여 평가 명세」 카드 · 증여세 결정세액 77,600,000 · 증여세 신고서 양식(별지 제10호) — 비과세 표시도 그대로", async () => {
    const f = form([asset(1, "100", DEBT_6)]);
    const d = await run(f);
    const t = text(render(<TransferTaxResultView result={d.result!} formData={f} asset={f.assets[0]} onReset={() => {}} onBack={() => {}} />).container);
    expect(t).toContain("1세대1주택 비과세");
    expect(t).toContain("부담부증여 평가 명세");
    expect(t).toContain("증여세 결정세액 (수증자 부담)77,600,000");
    expect(t).toContain("별지 제10호");
  });

  it("대조 — 과세 시료(채무 13억 · 고가주택)는 종전과 같다: 세액 632,076 · 명세 있음", async () => {
    const d = await run(form([asset(1, "100", DEBT_13)]));
    expect(d.result?.isExempt).toBe(false);
    expect(d.result?.totalTax).toBe(632_076);
    expect(d.result?.transferBurdenedGiftBreakdown).toBeDefined();
  });
});

describe("묶음 비과세 — 카드별 명세가 생기고 결과 명세 = 카드 합", () => {
  it("축 B 60/40 · 지분 값 같음: 카드 2장 · 명세 272,727,272 = 163,636,363 + 109,090,909(종전 자산별 0 / 0) · 세액 0", async () => {
    const d = await run(form([asset(1, "60", DEBT_6), asset(2, "40", DEBT_6)]));
    expect(d.aggregated?.totalTax).toBe(0);
    expect(d.transferBurdenedGiftBreakdown?.cards).toHaveLength(2);
    expect(d.aggregated?.properties.map((p) => p.acquisitionPrice)).toEqual([163_636_363, 109_090_909]);
    expect(shownAcq(d.transferBurdenedGiftBreakdown)).toBe(272_727_272);
  });

  it("축 B 60/40 · 지분2 취득시 기준시가 3억: 명세 229,090,908 = 카드 합(종전 첫 지분 값 272,727,272)", async () => {
    const d = await run(form([asset(1, "60", DEBT_6), asset(2, "40", { ...DEBT_6, standardPriceAtAcq: "300000000" })]));
    expect(d.aggregated?.totalTax).toBe(0);
    expect(d.aggregated?.properties.map((p) => p.acquisitionPrice)).toEqual([163_636_363, 65_454_545]);
    expect(shownAcq(d.transferBurdenedGiftBreakdown)).toBe(229_090_908);
  });

  it("함께 양도 [비과세 주택 + 과세 토지]: 카드 2장 · 명세 494,117,646 = 352,941,176 + 141,176,470(종전 주택 0)", async () => {
    const f = form([asset(1, "100", DEBT_6), asset(2, "100", LAND)], { contractTotalPrice: "", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true });
    const d = await run(f);
    expect(d.aggregated?.properties.map((p) => [p.isExempt, p.acquisitionPrice])).toEqual([[true, 352_941_176], [false, 141_176_470]]);
    expect(d.transferBurdenedGiftBreakdown?.cards).toHaveLength(2);
    expect(shownAcq(d.transferBurdenedGiftBreakdown)).toBe(494_117_646);
  });

  it("화면: 축 B 비과세 묶음 — 카드별 행이 지분마다 자기 취득시 기준시가(지분분)로 그려진다", async () => {
    const f = form([asset(1, "60", DEBT_6), asset(2, "40", { ...DEBT_6, standardPriceAtAcq: "300000000" })]);
    const d = await run(f);
    const c = render(<BundledAllocationCard apportionment={d.apportionment!} aggregated={d.aggregated as never} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    const rows = [...c.querySelectorAll('[data-testid="bg-bundle-card-acquisition"]')].map(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("300,000,000 × 채무비율 54.5455%");
    expect(rows[1]).toContain("120,000,000 × 채무비율 54.5455%");
    expect(text(c.querySelector('[data-testid="bg-bundle-acquisition-total"]')!)).toContain("229,090,908");
  });
});
