/**
 * anchor — 부담부증여 × 이월과세: 이월과세 블록의 「증여자 취득가액」(`carryover.donorAcquisitionPrice`)은 계산에 쓰이지 않는다 → 묻지도 싣지도 않는다
 *
 * 엔진 부담부증여 분기는 시나리오 A 취득가액을 「당초 증여자」 블록(`carryoverDonorBasis`)으로 §159①1호 산정한다(`transfer-tax-carryover.ts` 4d′ 주석).
 * 일반건물은 V-3(#2624 · `gb-bg-on-building-block-fields.plan.md` Q-2 a)에서 이미 정리했다 — 같은 규칙을 부담부증여 전체로 넓힌다.
 * 수정 前(2026-10-27 실측): 1원·1.5억·9.99억 모두 69,550,000(K-4) · 비우면 ⑧ 「증여자 취득가액을 입력하세요」 · ⑫ 400.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { bgAsset, bgForm, bodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(body: Body): Promise<{ status: number; det?: number; message?: string }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { result?: Body; aggregated?: Body }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  const message = [json.error?.message, ...Object.values(json.error?.fieldErrors ?? {}).flat()].filter(Boolean).join(" | ");
  return { status: res.status, det: (json.data?.result ?? json.data?.aggregated)?.determinedTax, message };
}
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
const run = async (f: TransferFormData) => post((await bodyOf(f)) as Body);

/** 시가 10억 · 채무 4억 · K-4 양도인 실지 10억 · 당초 증여자 실지 1.5억 · 증여 2023-06-01 · 당초 증여자 취득 2000-06-01. */
const carry = (price: string, over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "1,000,000,000", bgCoDonorActualAcquisitionTotal: "150,000,000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: price, giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    ...over,
  } as Partial<AssetForm>);

describe("단건 — 비워도 계산하고, 남은 값은 싣지 않는다", () => {
  const KINDS: [string, Partial<AssetForm>][] = [
    ["housing", {}],
    ["building", {}],
    ["land", { assetKind: "land", bgActualAcquisitionTotal: "", bgCoDonorActualAcquisitionTotal: "", bgActualAcquisitionLand: "1,000,000,000", bgCoDonorActualAcquisitionLand: "150,000,000", acquisitionArea: "100", transferArea: "100" }],
    ["commercial_building", {}],
  ];
  it.each(KINDS)("%s — 빈칸 = 1.5억 = 69,550,000 · 본문에 증여자 취득가액 없음", async (kind, over) => {
    const of = (price: string) => bgForm(carry(price, { assetKind: kind, ...over } as Partial<AssetForm>));
    expect(issues(of(""))).toEqual([]);
    const body = (await bodyOf(of("150,000,000"))) as Body;
    expect(body.carryoverTaxation.donorAcquisitionPrice).toBeUndefined();
    expect([(await run(of(""))).det, (await run(of("150,000,000"))).det]).toEqual([69_550_000, 69_550_000]);
  });

  it("⑫ — 화면을 거치지 않은 본문도 증여자 취득가액 없이 받는다", async () => {
    const body = (await bodyOf(bgForm(carry("150,000,000")))) as Body;
    const r = await post({ ...body, carryoverTaxation: { ...body.carryoverTaxation, donorAcquisitionPrice: undefined } });
    expect([r.status, r.det], r.message).toEqual([200, 69_550_000]);
  });
});

describe("함께 양도 둘째 자산 — ⑧·⑩도 같은 규칙", () => {
  const landBg = () => ({
    ...makeDefaultAsset(1), assetId: "a1", assetKind: "land", landNature: "standalone", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
    bgMortgageDebtAmount: "150,000,000", bgMortgageSetAmount: "150,000,000", bgLendingDepositTotal: "0", bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000", standardPriceAtTransfer: "150000000", standardPriceAtAcq: "80000000",
  }) as unknown as AssetForm;
  const bundle = (price: string) => {
    const f = bgForm(landBg());
    f.assets = [landBg(), { ...carry(price), assetId: "a2", assetLabel: "자산 2", addressJibun: "서울 종로구 테스트동 2" } as AssetForm];
    return Object.assign(f, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,300,000,000" }) as TransferFormData;
  };
  it("주택 이월과세 둘째 자산 — 빈칸 = 1.5억 · 본문 컴패니언에 증여자 취득가액 없음", async () => {
    expect(issues(bundle(""))).toEqual([]);
    const body = (await bodyOf(bundle("150,000,000"))) as Body;
    expect(body.companionAssets[0].carryoverTaxation.donorAcquisitionPrice).toBeUndefined();
    const [empty, filled] = [await run(bundle("")), await run(bundle("150,000,000"))];
    expect(empty.status, empty.message).toBe(200);
    expect(empty.det).toBe(filled.det);
  });
});

describe("회귀 — 일반 양도 이월과세는 종전대로 증여자 취득가액이 필수다", () => {
  const plain = (price: string) => carry(price, { transferType: "normal", actualSalePrice: "1,000,000,000" } as Partial<AssetForm>);
  it("⑧ 그 칸 · ⑫ 400", async () => {
    expect(issues(bgForm(plain("")))[0]?.field).toBe("carryover.donorAcquisitionPrice");
    const body = (await bodyOf(bgForm(plain("150,000,000")))) as Body;
    expect(body.carryoverTaxation.donorAcquisitionPrice).toBe(150_000_000);
    const r = await post({ ...body, carryoverTaxation: { ...body.carryoverTaxation, donorAcquisitionPrice: undefined } });
    expect(r.status).toBe(400);
  });
});
