/**
 * anchor: 화면에 보이는 양도비만 계산에 쓴다 — 폼-수준 「총 양도비」 × 자산 카드 ④ 「양도비」 (O-9).
 * 계획서 `docs/00-pm/burdened-gift-residuals-o9-o11.plan.md` §5 (Q-1 기본안 「화면을 따른다」).
 *
 * [결함 a] 총 양도비가 있으면 자산 양도비 칸이 꺼지는데, 꺼지기 전 값이 그 자산 몫의 공통 양도비를 **대체**했다
 *   (총 1천만 · 숨은 300만 → 그 자산 300만 · Σ 800만, 지분이면 150만).
 * [결함 b] 「함께 양도」를 끄거나 세션 복원으로 단건이 되면 총 양도비 칸이 사라지는데 단건 ④가 그 값을 필요경비로 썼다(숨은 1천만 → 1천만).
 * [수정] ④(단건·다건 계산기)·⑥ 입구가 `withInScopeTransferExpenses`를 거치고, 화면(⑤)·결과 신고서 표는 같은 술어로 칸을 보이거나 끈다.
 * ⑧은 바꾸지 않았다 — 두 값을 읽는 규칙(파트 이월과세의 이전 형식)이 실측으로 함께 양도에서 나오지 않았다(첫 자산이면 먼저 막히고 두 번째 자산이면 규칙이 돌지 않음).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import {
  appliedFormTotalTransferExpense,
  formTotalTransferExpenseInScope,
  withInScopeTransferExpenses,
} from "@/lib/calc/transfer-expense-in-scope";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

/** 토지 · 실지 2억 → 양도 5억. */
const land = (id: number, o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), assetId: "a" + id, addressJibun: `서울 강남구 테스트동 ${id}-1`, assetKind: "land", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "200000000", actualSalePrice: "500000000",
    standardPriceAtAcq: "100000000", standardPriceAtTransfer: "300000000", acquisitionArea: "100", transferArea: "100", ...o,
  }) as AssetForm;
/** 같은 물건 지분 1/2 두 건(축 B). */
const half = (id: number, o: Record<string, unknown> = {}) =>
  land(id, { addressJibun: "서울 강남구 테스트동 1-1", ownershipNumerator: "1", ownershipDenominator: "2", actualSalePrice: "", ...o });
const form = (assets: AssetForm[], f: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", isOneHousehold: false, householdHousingCount: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, bundledSaleMode: "actual", contractTotalPrice: "1000000000",
  }, f, { assets }) as TransferFormData;

async function bundled(f: TransferFormData) {
  const body = await captureBody(f);
  const r = await postTransfer(body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (r.json?.data?.aggregated?.properties ?? []) as any[];
  return { status: r.status, body, exp: props.map((p) => p.necessaryExpense as number) };
}
async function single(f: TransferFormData) {
  const body = await captureBody(f);
  const r = await postTransfer(body);
  return { status: r.status, body, exp: r.result?.expenses as number | undefined };
}

describe("O9-a 다건 — 총 양도비가 있으면 꺼진 자산 양도비를 쓰지 않는다", () => {
  it.each([
    ["함께 양도 · 숨은 값 없음(대조)", [land(1), land(2)], [5_000_000, 5_000_000]],
    ["함께 양도 · 주 자산에 숨은 300만", [land(1, { transferExpense: "3000000" }), land(2)], [5_000_000, 5_000_000]],
    ["함께 양도 · 컴패니언에 숨은 300만", [land(1), land(2, { transferExpense: "3000000" })], [5_000_000, 5_000_000]],
    ["지분 1/2 · 주 자산에 숨은 300만", [half(1, { transferExpense: "3000000" }), half(2, { acquisitionDate: "2016-01-01" })], [5_000_000, 5_000_000]],
  ] as const)("%s → 자산별 필요경비 %j (Σ = 총 양도비 1천만)", async (_l, assets, exp) => {
    const f = form([...assets], { totalTransferExpense: "10000000" });
    expect(allIssues(f)).toEqual([]);
    const r = await bundled(f);
    expect(r.status).toBe(200);
    expect(r.exp).toEqual(exp);
    expect(r.body.commonTransferExpense).toBe(10_000_000);
    expect(r.body.transferExpense).toBeUndefined();
  });

  it("총 양도비가 없으면 자산 양도비 직접 입력은 그대로 쓴다(대조)", async () => {
    const r = await bundled(form([land(1, { transferExpense: "3000000" }), land(2)], { totalTransferExpense: "" }));
    expect(r.exp).toEqual([3_000_000, 0]);
    expect(r.body.commonTransferExpense).toBeUndefined();
  });

  it("⑥ 사이드바 — 계산 전 자산 행 필요경비에 숨은 값을 넣지 않는다", () => {
    const s = computeTransferPerAssetSummary(form([land(1, { transferExpense: "3000000" }), land(2)], { totalTransferExpense: "10000000" }), null);
    expect(s.rows[0]?.expense).toBe(0);
    const t = computeTransferPerAssetSummary(form([land(1, { transferExpense: "3000000" }), land(2)], { totalTransferExpense: "" }), null);
    expect(t.rows[0]?.expense).toBe(3_000_000);
  });
});

describe("O9-b 단건 — 화면에 없는 총 양도비를 쓰지 않는다", () => {
  const one = (o: Record<string, unknown> = {}, total = "10000000") => form([land(1, o)], { totalTransferExpense: total, contractTotalPrice: "500000000" });

  it("숨은 총 양도비 1천만 · 자산 칸 빈칸 → 필요경비 0", async () => {
    const r = await single(one());
    expect(r.status).toBe(200);
    expect(r.exp).toBe(0);
    expect(r.body.transferExpense).toBeUndefined();
  });

  it("숨은 총 양도비 1천만 · 자산 양도비 300만 → 300만(칸이 열려 있어 보이는 값)", async () => {
    const r = await single(one({ transferExpense: "3000000" }));
    expect(r.exp).toBe(3_000_000);
  });

  it("⑥ 사이드바도 0", () => {
    expect(computeTransferPerAssetSummary(one(), null).rows[0]?.expense).toBe(0);
  });
});

describe("O9-c 화면 — 같은 술어", () => {
  it("단건: 총 양도비 칸이 없고 자산 양도비 칸은 열려 있다(숨은 총 양도비가 남아 있어도)", () => {
    render(<Step1 form={form([land(1)], { totalTransferExpense: "10000000", contractTotalPrice: "500000000" })} onChange={() => {}} />);
    expect(screen.queryByText(/총 양도비/)).toBeNull();
  });

  it("같은 세션에서 자산을 지워 1건이 남아도(함께 양도 화면 유지) 총 양도비 칸이 사라진다", () => {
    const { rerender } = render(<Step1 form={form([land(1), land(2)], { totalTransferExpense: "10000000", assetSplitMode: "companion" })} onChange={() => {}} />);
    expect(screen.getAllByText(/총 양도비/).length).toBeGreaterThan(0);
    rerender(<Step1 form={form([land(1)], { totalTransferExpense: "10000000", assetSplitMode: "companion" })} onChange={() => {}} />);
    expect(screen.getByText(/총 양도가액/)).toBeTruthy(); // 함께 양도 화면 그대로
    expect(screen.queryByText(/총 양도비/)).toBeNull();
  });

  it("다건: 총 양도비 칸이 있다", () => {
    render(<Step1 form={form([land(1), land(2)], { totalTransferExpense: "10000000", assetSplitMode: "companion" })} onChange={() => {}} />);
    expect(screen.getAllByText(/총 양도비/).length).toBeGreaterThan(0);
  });

  it("자산 카드 ④ — 총 양도비가 넘어오면 양도비 칸이 꺼지고, 빈 값이면 열린다", () => {
    const { rerender } = render(<AssetSectionExpense asset={land(1, { transferExpense: "3000000" })} onChange={() => {}} totalTransferExpense="10000000" />);
    const input = () => screen.getByLabelText(/§97① 나목/) as HTMLInputElement;
    expect(input().disabled).toBe(true);
    rerender(<AssetSectionExpense asset={land(1, { transferExpense: "3000000" })} onChange={() => {}} totalTransferExpense="" />);
    expect(input().disabled).toBe(false);
  });
});

describe("O9-e 이전 형식 필요경비 칸 — 꺼진 양도비는 0으로 보고 판정한다(숨은 값으로 쓰이지 않게)", () => {
  const legacy = land(1, { transferExpense: "3000000", directExpenses: "5000000", capitalExpenditure: "" });
  it("총 양도비가 쓰이면 칸이 보인다", () => {
    render(<AssetSectionExpense asset={legacy} onChange={() => {}} totalTransferExpense="10000000" />);
    expect(screen.getByLabelText(/이전 입력 형식/)).toBeTruthy();
  });
  it("총 양도비가 없으면 양도비가 있어 칸이 숨는다(종전 그대로)", () => {
    render(<AssetSectionExpense asset={legacy} onChange={() => {}} totalTransferExpense="" />);
    expect(screen.queryByLabelText(/이전 입력 형식/)).toBeNull();
  });
});

describe("O9-f 다건 계산기 ④ · 결과 신고서 표 — 같은 입력", () => {
  it("다건 계산기 ④ — 숨은 총 양도비를 싣지 않는다", () => {
    const one = form([land(1)], { totalTransferExpense: "10000000", contractTotalPrice: "500000000" });
    expect((buildPropertyPayload(one) as Record<string, unknown>).transferExpense).toBeUndefined();
    const visible = form([land(1, { transferExpense: "3000000" })], { totalTransferExpense: "", contractTotalPrice: "500000000" });
    expect((buildPropertyPayload(visible) as Record<string, unknown>).transferExpense).toBe(3_000_000);
  });

  it("결과 신고서 표 — 꺼진 양도비를 「차감되지 않음」으로 세지 않는다", () => {
    const r = {
      transferPrice: 500_000_000, acquisitionPrice: 200_000_000, expenses: 3_000_000, transferGain: 297_000_000, taxableGain: 297_000_000,
      longTermHoldingDeduction: 0, longTermHoldingRate: 0, basicDeduction: 2_500_000, taxBase: 0, appliedRate: 0.4, progressiveDeduction: 0,
      calculatedTax: 0, reductionAmount: 0, determinedTax: 0, localIncomeTax: 0, totalTax: 0, isExempt: false, usedEstimatedAcquisition: true,
      estimatedBase: 200_000_000, estimatedDeduction: 3_000_000, capitalExpenditureForDisplay: 0, steps: [],
    } as unknown as TransferTaxResult;
    const a = land(1, { useEstimatedAcquisition: true, transferExpense: "3000000", directExpenses: "", capitalExpenditure: "" });
    const note = (f: TransferFormData) => buildRows(r, "single", f, a).find((x) => x.label === "필요경비")?.roseNotes?.total;
    expect(note(form([a, land(2)], { totalTransferExpense: "10000000" }))).toBeUndefined();
    expect(note(form([a, land(2)], { totalTransferExpense: "" }))).toContain("3,000,000");
  });
});

describe("O9-d leaf", () => {
  it("총 양도비 칸 = 자산 2건 이상", () => {
    expect(formTotalTransferExpenseInScope({ assets: [land(1)] })).toBe(false);
    expect(formTotalTransferExpenseInScope({ assets: [land(1), land(2)] })).toBe(true);
    expect(appliedFormTotalTransferExpense({ assets: [land(1)], totalTransferExpense: "10000000" })).toBe(0);
    expect(appliedFormTotalTransferExpense({ assets: [land(1), land(2)], totalTransferExpense: "10000000" })).toBe(10_000_000);
  });

  it("바꿀 것이 없으면 같은 객체 · 있으면 해당 칸만 비운다", () => {
    const clean = form([land(1), land(2)], { totalTransferExpense: "10000000" });
    expect(withInScopeTransferExpenses(clean)).toBe(clean);
    const directOnly = form([land(1, { transferExpense: "3000000" }), land(2)], { totalTransferExpense: "" });
    expect(withInScopeTransferExpenses(directOnly)).toBe(directOnly);
    const stale = withInScopeTransferExpenses(form([land(1, { transferExpense: "3000000" }), land(2)], { totalTransferExpense: "10000000" }));
    expect(stale.assets.map((a) => a.transferExpense)).toEqual(["", land(2).transferExpense]);
    expect(stale.totalTransferExpense).toBe("10000000");
    const hiddenTotal = withInScopeTransferExpenses(form([land(1, { transferExpense: "3000000" })], { totalTransferExpense: "10000000" }));
    expect(hiddenTotal.totalTransferExpense).toBe("");
    expect(hiddenTotal.assets[0].transferExpense).toBe("3000000");
  });
});
