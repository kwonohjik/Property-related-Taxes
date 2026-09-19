/**
 * F-14 — 사이드바 필요경비(개산공제 §163⑥)가 엔진과 같은 값을 보인다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-14 · §22.
 *
 * 사이드바가 렌더하는 것은 자산별 행(`computeTransferPerAssetSummary`)이다. 계획서가 가리킨
 * `computeTransferSummary`는 #487 이후 화면 소비처가 없는 고아 함수였다 — 수정 전 실측:
 *
 * | 입력 | 자산별 행(표시) | 합계(미렌더) | 엔진 |
 * |---|---|---|---|
 * | D1 자산 1건 환산 · 미등기 — 계산 전 | 3,000,000 | 300,000 | 300,000 |
 * | D1 분양권 환산(§163⑥4호 1%) — 계산 전 | 3,000,000 | 1,000,000 | 1,000,000 |
 * | D2 일괄양도 환산(주 등기 + 컴패니언 미등기) — 계산 후 | 0 + 0 | 6,000,000 | 3,000,000 + 300,000 |
 * | 일반건물 환산 · 토지 미등기 | 3,600,000 ✅ | 0 | 3,600,000 |
 *
 * ⇒ 자산별 행을 엔진 leaf·엔진 결과로 고치고, 합계는 **자산별 행의 합**으로 바꿔 단일 소스로 둔다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI, type TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { computeTransferSummary, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 환산 — 취득당시 기준시가 1억 · 양도당시 2억 · 양도가 3억 */
const est = (over: Partial<AssetForm> = {}): Partial<AssetForm> => ({
  assetKind: "land",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  useEstimatedAcquisition: true,
  fixedAcquisitionPrice: "",
  standardPriceAtAcq: "100000000",
  standardPriceAtTransfer: "200000000",
  actualSalePrice: "300,000,000",
  ...over,
});
const GB: Partial<AssetForm> = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  actualSalePrice: "900,000,000",
  useEstimatedAcquisition: true,
  fixedAcquisitionPrice: "",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  gbTransferLandPricePerSqm: "3,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "1,000,000",
  gbAcqBuildingValue: "100,000,000",
  gbBuildingAcquisitionCause: "purchase",
};

function form(assets: Partial<AssetForm>[], formUnregistered = false): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01";
  f.isUnregistered = formUnregistered;
  f.householdHousingCount = "2";
  f.assets = assets.map((a, i) => ({ ...(i === 0 ? f.assets[0] : makeDefaultAsset(i + 1)), ...a })) as AssetForm[];
  f.contractTotalPrice = String(300_000_000 * assets.length);
  f.bundledSaleMode = "actual";
  return f;
}

async function calculate(f: TransferFormData): Promise<TransferAPIResult> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: TransferAPIResult }).data;
}

const rows = (f: TransferFormData, r: TransferAPIResult | null = null) =>
  computeTransferPerAssetSummary(f, r).rows.map((x) => x.expense);
const total = (f: TransferFormData, r: TransferAPIResult | null = null) =>
  computeTransferSummary(f, r).totalNecessaryExpense;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("F-14 D1 — 계산 전 개산공제율은 엔진 leaf · 자산별 미등기 축", () => {
  it("F14-1 자산 1건 환산 · 미등기 → 0.3% (300,000)", () => {
    expect(rows(form([est()], true))).toEqual([300_000]);
  });

  it("F14-2 분양권 환산 → §163⑥4호 1% (1,000,000)", () => {
    expect(rows(form([est({ assetKind: "presale_right" })]))).toEqual([1_000_000]);
  });

  it("F14-3 환산이면 자본적지출·양도비를 입력해 둬도 개산공제 — 실경비 합이 아니다", () => {
    expect(rows(form([est({ capitalExpenditure: "5,000,000", transferExpense: "2,000,000" })]))).toEqual([3_000_000]);
  });

  it("F14-4 일괄양도 — 주 자산은 폼 값, 컴패니언은 자산 값으로 율을 고른다", () => {
    expect(rows(form([est(), est({ isUnregistered: true })]))).toEqual([3_000_000, 300_000]);
    expect(rows(form([est(), est()], true))).toEqual([300_000, 3_000_000]);
  });

  it("F14-5 (대조) 주 자산에 남은 자산-수준 값은 쓰지 않는다 — 엔진은 폼 값을 본다", () => {
    expect(rows(form([est({ isUnregistered: true })]))).toEqual([3_000_000]);
  });
});

describe("F-14 D1 경계", () => {
  it("F14-12 지분 50% 환산 — 계산 전 값이 엔진(지분 기준시가 × 율)과 같다", async () => {
    const f = form([est({ ownershipNumerator: "50", ownershipDenominator: "100" })]);
    const before = rows(f);
    expect(before).toEqual([1_500_000]);
    expect(rows(f, await calculate(f))).toEqual(before);
  });

  it("F14-13 취득당시 기준시가 미입력 → 0이 아니라 「계산 후 표시」", () => {
    const r = computeTransferPerAssetSummary(form([est({ standardPriceAtAcq: "" })]), null).rows[0];
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });

  it("F14-14 일괄양도의 일반건물 컴패니언 — 종류 전환 뒤 남은 `standardPriceAtAcq`로 공통 식을 쓰지 않는다", () => {
    const r = computeTransferPerAssetSummary(form([est(), { ...GB, standardPriceAtAcq: "100000000" }]), null).rows[1];
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });
});

describe("F-14 D2 — 계산 후에는 엔진이 차감한 필요경비", () => {
  it("F14-6 일괄양도 환산: 자산별 3,000,000 · 300,000 (종전 0 · 0)", async () => {
    const f = form([est(), est({ isUnregistered: true })]);
    expect(rows(f, await calculate(f))).toEqual([3_000_000, 300_000]);
  });

  it("F14-7 자산 1건 환산 + 자본적지출 입력: 엔진 값(개산공제)을 그대로", async () => {
    const f = form([est({ capitalExpenditure: "5,000,000", transferExpense: "2,000,000" })]);
    const r = await calculate(f);
    expect(r.mode).toBe("single");
    expect(rows(f, r)).toEqual([r.mode === "single" ? r.result.expenses : NaN]);
    expect(rows(f, r)).toEqual([3_000_000]);
  });

  it("F14-8 (대조) 일반건물은 종전부터 엔진 값 — 계산 전후 3,600,000", async () => {
    const f = form([{ ...GB, gbLandUnregistered: true }]);
    expect(rows(f)).toEqual([3_600_000]);
    expect(rows(f, await calculate(f))).toEqual([3_600_000]);
  });
});

describe("F-14 합계(computeTransferSummary) = 자산별 행의 합", () => {
  it("F14-9 계산 전: 일괄양도 3,300,000 · 일반건물 3,600,000 (종전 6,000,000 · 0)", () => {
    expect(total(form([est(), est({ isUnregistered: true })]))).toBe(3_300_000);
    expect(total(form([est(), est()], true))).toBe(3_300_000);
    expect(total(form([{ ...GB, gbLandUnregistered: true }]))).toBe(3_600_000);
  });

  it("F14-10 계산 후: 일괄양도 3,300,000", async () => {
    const f = form([est(), est({ isUnregistered: true })]);
    expect(total(f, await calculate(f))).toBe(3_300_000);
  });

  it("F14-11 (대조) 실거래가 모드는 종전대로 실경비 합계", () => {
    const f = form([{ ...est(), useEstimatedAcquisition: false, fixedAcquisitionPrice: "100,000,000", capitalExpenditure: "5,000,000", transferExpense: "2,000,000" }]);
    expect(rows(f)).toEqual([7_000_000]);
    expect(total(f)).toBe(7_000_000);
  });
});
