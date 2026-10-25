/**
 * 함께 양도(서로 다른 물건) 묶음의 **전 자산이 지분**일 때 — 사용자의 선택(`assetSplitMode`)을 따른다 (2026-10-18)
 * 계획서: docs/02-design/features/transfer-companion-all-fractional-distinct-assets.plan.md
 *
 * 종전(master `6f5121daa` 실측): 지분율이 모두 채워지면 ④⑧·⑫⑭가 「같은 물건 지분 분할(축 B)」로 읽었다 — 화면은 함께 양도로 받는데
 *   · 지분율 합 100% → 자산별 양도가액 = 총양도가 × 지분율(오류 없이 틀린 값 — T1 229,812,000 / 함께 양도 218,724,000)
 *   · 합 ≠ 100% → ⑧ 「지분 분할 취득: 전체 지분율 합계가 100%」로 막힘(함께 양도로 입력했는데)
 * 지분 자산은 #2080 규약대로 물건 전체(100%) 입력 × 지분율. 선택이 저장되지 않은 기존 폼은 종전 추론(Q-2).
 *
 * 입력은 화면 폼 → ⑧ → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 안분 → 다건 엔진.
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
const aggCalls: Array<{ properties: Array<{ propertyId?: string; transferPrice: number; totalPropertyTransferPrice?: number }> }> = [];
vi.mock("@/lib/tax-engine/transfer-tax-aggregate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-aggregate")>();
  return {
    ...actual,
    calculateTransferTaxAggregate: (input: Parameters<typeof actual.calculateTransferTaxAggregate>[0], ...rest: unknown[]) => {
      aggCalls.push(input as never);
      return (actual.calculateTransferTaxAggregate as (...a: unknown[]) => unknown)(input, ...rest);
    },
    // 함께 양도 route는 외부 비교 단위 진입점을 부른다(PR-1 — 단위가 없으면 종전 진입점과 같은 계산).
    calculateTransferTaxAggregateWithUnits: (input: Parameters<typeof actual.calculateTransferTaxAggregate>[0], ...rest: unknown[]) => {
      aggCalls.push(input as never);
      return (actual.calculateTransferTaxAggregateWithUnits as (...a: unknown[]) => unknown)(input, ...rest);
    },
  };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, migratePersistedTransferForm } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Mode = "actual" | "apportioned";
const land = (n: number, over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(n), addressJibun: `서울 강남구 테스트동 ${n}`, assetKind: "land", acquisitionArea: "300", transferArea: "300",
    acquisitionCause: "purchase", acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000",
    ownershipNumerator: "100", ownershipDenominator: "100", ...over,
  }) as AssetForm;
const share = (pct: string): Partial<AssetForm> => ({ ownershipNumerator: pct, ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });

/** 총 양도가액 1,000,000,000 · 자산 2건 */
function form(mode: Mode, a0: Partial<AssetForm>, a1: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-04-30";
  f.contractTotalPrice = "1000000000";
  f.bundledSaleMode = mode;
  f.assets = [land(1, a0), land(2, a1)];
  return f;
}

const v8 = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f));

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  aggCalls.length = 0;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  const json = (await res.json()) as { data?: { mode?: string; aggregated?: { totalTax?: number }; apportionment?: { apportioned: Array<{ assetId: string; allocatedSalePrice: number }> } } };
  const alloc = json.data?.apportionment?.apportioned.map((x) => x.allocatedSalePrice);
  const items = aggCalls.at(-1)?.properties ?? [];
  return { status: res.status, body: cap.body!, alloc, items, total: json.data?.aggregated?.totalTax };
}


/** 2008년 2억 취득 · 2022년 3.5억 취득 — 보유기간·취득가가 달라 자산별 양도가액이 세액을 바꾼다. */
const OLD = { acquisitionDate: "2008-03-03", fixedAcquisitionPrice: "200000000" } as const;
const NEW = { acquisitionDate: "2022-03-03", fixedAcquisitionPrice: "350000000" } as const;
const declared = (f: TransferFormData, m: "companion" | "fractional" | undefined) => ({ ...f, assetSplitMode: m }) as TransferFormData;
const totalOf = async (f: TransferFormData) => {
  const r = await run(f);
  return r;
};

describe("함께 양도 + 전 자산 지분 — 자산별 물건 전체 가액 × 지분율", () => {
  it("T1 실거래가: 12억·8억 물건의 각 50% → 6억·4억, 물건 전체 12억·8억, 총세액 218,724,000", async () => {
    const f = declared(form("actual", { ...share("50"), ...OLD, actualSalePrice: "1200000000" }, { ...share("50"), ...NEW, actualSalePrice: "800000000" }), "companion");
    expect(v8(f)).toEqual([]);
    const r = await totalOf(f);
    expect(r.status).toBe(200);
    expect(r.body.fractionalSplitBundle).toBe(false);
    expect(r.alloc).toEqual([600_000_000, 400_000_000]);
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([1_200_000_000, 800_000_000]);
    // ⑭ 축 B 표지(「한 사람이 나눠 취득」 — #11)는 함께 양도에 붙지 않는다
    expect(r.items.map((i) => (i as { soleSplitAcquisition?: boolean }).soleSplitAcquisition)).toEqual([undefined, undefined]);
    expect(r.total).toBe(218_724_000);
  });
  it("T2 기준시가 안분: 키 = 기준시가 × 지분율(250M·150M) → 6.25억·3.75억, 총세액 215,952,000", async () => {
    const f = declared(form("apportioned", { ...share("50"), ...OLD }, { ...share("50"), ...NEW, standardPriceAtTransfer: "300000000" }), "companion");
    expect(v8(f)).toEqual([]);
    const r = await totalOf(f);
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([625_000_000, 375_000_000]);
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([1_250_000_000, 750_000_000]);
    expect(r.total).toBe(215_952_000);
  });
  it("P2 지분율 합 ≠ 100%(50%·30%)도 막지 않는다 — 6억·3억", async () => {
    const f = declared(form("actual", { ...share("50"), actualSalePrice: "1200000000" }, { ...share("30"), actualSalePrice: "1000000000" }), "companion");
    f.contractTotalPrice = "900000000";
    expect(v8(f)).toEqual([]);
    const r = await totalOf(f);
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([600_000_000, 300_000_000]);
  });
});

describe("같은 물건 지분 분할(축 B)·선택 미저장은 종전 그대로", () => {
  const t1 = (m: "companion" | "fractional" | undefined) =>
    declared(form("actual", { ...share("50"), ...OLD, actualSalePrice: "1200000000" }, { ...share("50"), ...NEW, actualSalePrice: "800000000" }), m);
  it("지분별 취득(fractional) — 총양도가 × 지분율 5억·5억, 총세액 229,812,000", async () => {
    const r = await totalOf(t1("fractional"));
    expect(r.status).toBe(200);
    expect(r.body.fractionalSplitBundle).toBe(true);
    expect(r.alloc).toEqual([500_000_000, 500_000_000]);
    expect(r.items.map((i) => (i as { soleSplitAcquisition?: boolean }).soleSplitAcquisition)).toEqual([true, true]);
    expect(r.total).toBe(229_812_000);
  });
  it("선택이 저장되지 않은 폼(종전 세션·이력) — 지분율로 추론해 축 B (Q-2)", async () => {
    const r = await totalOf(t1(undefined));
    expect(r.alloc).toEqual([500_000_000, 500_000_000]);
    expect(r.total).toBe(229_812_000);
  });
  it("지분별 취득에서 지분율 합 ≠ 100%는 계속 막는다", () => {
    const f = declared(form("actual", share("50"), share("30")), "fractional");
    expect(v8(f).map((i) => (i as { message?: string }).message).join(" ")).toContain("전체 지분율 합계가 100%");
  });
});

describe("⑫⑭ — 명시 플래그가 본문 모양 추론보다 앞선다", () => {
  it("플래그 false면 전 자산이 물건 전체 양도가액을 가져도 축 B가 아니다(실거래가 구분 기재 그대로 안분)", async () => {
    const r = await run(declared(form("actual", { ...share("50"), ...OLD, actualSalePrice: "1200000000" }, { ...share("50"), ...NEW, actualSalePrice: "800000000" }), "companion"));
    expect(r.body.totalPropertyTransferPrice).toBe(1_200_000_000);
    expect((r.body.companionAssets as Array<Record<string, unknown>>)[0].totalPropertyTransferPrice).toBe(800_000_000);
    expect(r.alloc).toEqual([600_000_000, 400_000_000]);
  });
});

describe("⑫ — 플래그가 검증 면제를 정한다", () => {
  const post = (body: Record<string, unknown>) =>
    POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  it("플래그 false(함께 양도) + 실거래가 모드에서 주 자산 계약가액이 없으면 400 — 전 자산이 물건 전체 양도가액을 가져도 면제하지 않는다", async () => {
    const r = await run(declared(form("actual", { ...share("50"), ...OLD, actualSalePrice: "1200000000" }, { ...share("50"), ...NEW, actualSalePrice: "800000000" }), "companion"));
    const body = { ...r.body };
    delete body.primaryActualSalePrice;
    expect((await post({ ...body, fractionalSplitBundle: false })).status).toBe(400);
    // 대조군 — 축 B면 자동가라 면제된다
    expect((await post({ ...body, fractionalSplitBundle: true })).status).toBe(200);
  });
});

describe("③ 저장 복원 — 선택이 남는다", () => {
  it("sessionStorage·이력 경로(`migratePersistedTransferForm`)가 assetSplitMode를 그대로 둔다", () => {
    const f = declared(form("actual", share("50"), share("50")), "companion");
    const restored = migratePersistedTransferForm(JSON.parse(JSON.stringify(f)));
    expect(restored.assetSplitMode).toBe("companion");
  });
});
