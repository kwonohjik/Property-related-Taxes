/**
 * 첫 자산 삭제 — 위치에 묶인 값(주 자산 플래그·미등기·기본 라벨) anchor.
 * 계획서 `docs/00-pm/first-asset-removal-primary-reindex.plan.md` §1 P7 · §4-2.
 *
 * 주 자산의 미등기는 폼 전역 `form.isUnregistered`, 컴패니언은 자산 `asset.isUnregistered`에 산다.
 * 배열에서 빼기만 하면 지운 첫 자산의 폼 전역 값이 새 첫 자산에 붙는다.
 * 기대값은 «삭제 후 폼»이 아니라 «처음부터 남은 자산만 입력한 폼»의 route 결과다(정본).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI, type TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { assetRemovalPatch } from "@/lib/calc/asset-removal";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const land = (id: number, sale: string, acq: string, over: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(id),
  addressJibun: `서울 강남구 테스트동 ${id}`,
  assetKind: "land",
  landNature: "general",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  actualSalePrice: sale,
  fixedAcquisitionPrice: acq,
  acquisitionArea: "100",
  standardPriceAtTransfer: String(Number(sale) / 2),
  ...over,
} as AssetForm);

const form = (assets: AssetForm[], isUnregistered: boolean): TransferFormData => ({
  ...createDefaultTransferFormData(),
  transferDate: "2024-03-01",
  filingDate: "2024-05-31",
  assets,
  bundledSaleMode: "actual",
  contractTotalPrice: String(assets.reduce((s, a) => s + Number(a.actualSalePrice), 0)),
  totalTransferExpense: "0",
  householdHousingCount: "0",
  isOneHousehold: false,
  isUnregistered,
});

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: String(init?.body),
    }));
    const json = await res.json();
    return { ok: res.ok, status: res.status, json: async () => json } as unknown as Response;
  }));
  const result = await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const totalTax = (result as Extract<TransferAPIResult, { mode: "bundled" }>).aggregated?.totalTax;
  return { body: cap.body!, totalTax };
}

/** 폼 → 삭제 패치 적용 폼. 총 양도가액은 사용자가 남은 자산 합으로 고친 것으로 둔다(그대로면 route가 구분 기재 합 불일치로 막는다 — 기존 동작). */
const removed = (f: TransferFormData, idx: number): TransferFormData => {
  const patch = assetRemovalPatch(f, idx);
  return { ...f, ...patch, contractTotalPrice: String(patch.assets.reduce((s, a) => s + Number(a.actualSalePrice), 0)) };
};

const A = () => land(1, "500000000", "100000000");
const B = (over: Partial<AssetForm> = {}) => land(2, "300000000", "200000000", over);
const C = () => land(3, "200000000", "150000000");

describe("첫 자산 삭제 — 미등기 T2 (세액)", () => {
  it("R-1: 미등기였던 첫 자산을 지우면 그 미등기가 새 첫 자산에 붙지 않는다", async () => {
    const after = removed(form([A(), B(), C()], true), 0);
    expect(after.isUnregistered).toBe(false);
    const canon = await run(form([B(), C()], false));
    expect(canon.totalTax).toBe(29_408_500);
    const got = await run(after);
    expect(got.body.isUnregistered).toBe(false);
    expect(got.totalTax).toBe(canon.totalTax);
  });

  it("R-2: 컴패니언일 때 미등기였던 자산이 첫 자산이 되면 미등기가 폼 전역으로 올라간다", async () => {
    const after = removed(form([A(), B({ isUnregistered: true }), C()], false), 0);
    expect(after.isUnregistered).toBe(true);
    expect(after.assets[0].isUnregistered).toBe(false);
    const canon = await run(form([B(), C()], true));
    expect(canon.totalTax).toBe(81_966_500);
    const got = await run(after);
    expect(got.body.isUnregistered).toBe(true);
    expect(got.totalTax).toBe(canon.totalTax);
  });

  it("R-3: 첫 자산이 아닌 자산을 지우면 폼 전역 미등기와 남은 컴패니언 값은 그대로다", () => {
    const after = removed(form([A(), B(), C()].map((a, i) => (i === 2 ? { ...a, isUnregistered: true } : a)), true), 1);
    expect(after.isUnregistered).toBe(true);
    expect(after.assets.map((a) => a.isUnregistered)).toEqual([false, true]);
  });
});

describe("첫 자산 삭제 — 주 자산 플래그 · 기본 라벨", () => {
  it("R-4: 삭제 후 첫 자산만 주 자산 플래그", () => {
    expect(assetRemovalPatch(form([A(), B(), C()], false), 0).assets.map((a) => a.isPrimaryForHouseholdFlags)).toEqual([true, false]);
    expect(assetRemovalPatch(form([A(), B(), C()], false), 2).assets.map((a) => a.isPrimaryForHouseholdFlags)).toEqual([true, false]);
  });

  it("R-5: 기본 라벨은 새 위치로 다시 매기고, 사용자가 고친 라벨은 그대로 둔다", () => {
    const f = form([A(), B(), { ...C(), assetLabel: "상가 부지" }], false);
    expect(assetRemovalPatch(f, 0).assets.map((a) => a.assetLabel)).toEqual(["자산 1", "상가 부지"]);
    const g = form([A(), B(), C()], false);
    expect(assetRemovalPatch(g, 1).assets.map((a) => a.assetLabel)).toEqual(["자산 1", "자산 2"]);
  });

  it("R-6: 입력 객체를 바꾸지 않는다", () => {
    const f = form([A(), B({ isUnregistered: true }), C()], true);
    const snapshot = JSON.stringify(f);
    assetRemovalPatch(f, 0);
    expect(JSON.stringify(f)).toBe(snapshot);
  });
});
