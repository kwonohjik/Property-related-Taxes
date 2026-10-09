/**
 * 함께양도(다른 물건) 묶음에 지분 자산이 섞인 경우 — 양도가액·안분 키는 물건 전체(100%) 입력 × 지분율 (2026-10-10)
 *
 * 종전(master `28695a03e` 실측): 그 자산 하나의 ratio만 보고 「총양도가 × 지분율」 자동가를 썼고, route는 전 자산 지분(축 B)일 때만
 * 그 값을 써서 — actual 500(「구분 기재 합 초과」·「잔여 양도가액 … 안분 대상 없음」) · apportioned 200인데 지분 자산 양도가액 0.
 * ⑧은 둘 다 통과시켰다. 사용자 결정: 물건 전체(100%) 입력 → 지분율을 곱한다(화면 규약과 같다).
 *
 * 입력은 화면 폼 → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 안분이다. 합산 엔진 입력(items)은 spy로 본다.
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
  };
});

import { POST } from "@/app/api/calc/transfer/route";
import { shareWholePropertyPrice } from "@/app/api/calc/transfer/bundled-apportionment";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
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
  const json = (await res.json()) as { data?: { mode?: string; apportionment?: { apportioned: Array<{ assetId: string; allocatedSalePrice: number }> } } };
  const alloc = json.data?.apportionment?.apportioned.map((x) => x.allocatedSalePrice);
  const items = aggCalls.at(-1)?.properties ?? [];
  return { status: res.status, body: cap.body!, alloc, items };
}

describe("값 — 함께양도 묶음의 지분 자산", () => {
  it("actual · 자산1 100% 600,000,000 + 자산2 지분 50% 물건 전체 800,000,000 → 400,000,000 · 물건 전체 양도가액 800,000,000", async () => {
    const f = form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "800000000" });
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([600_000_000, 400_000_000]);
    const c = (r.body.companionAssets as Array<Record<string, unknown>>)[0];
    expect(c.fixedSalePrice).toBe(400_000_000);
    expect(c.totalPropertyTransferPrice).toBe(800_000_000);
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([undefined, 800_000_000]);
  });
  it("actual · 자산1 지분 50% 물건 전체 1,200,000,000 → 600,000,000 + 자산2 100% 400,000,000", async () => {
    const f = form("actual", { ...share("50"), actualSalePrice: "1200000000" }, { actualSalePrice: "400000000" });
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([600_000_000, 400_000_000]);
    expect(r.body.primaryActualSalePrice).toBe(600_000_000);
    expect(r.body.totalPropertyTransferPrice).toBe(1_200_000_000);
  });
  it("apportioned · 안분 키 = 물건 전체 기준시가 × 지분율(500M · 250M) → 666,666,667 / 333,333,333 · 물건 전체 양도가액 = 안분액 ÷ 지분율", async () => {
    const f = form("apportioned", {}, share("50"));
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.body.standardPriceAtTransferForApportion).toBe(500_000_000);
    expect((r.body.companionAssets as Array<Record<string, unknown>>)[0].standardPriceAtTransferForApportion).toBe(250_000_000);
    expect(r.alloc).toEqual([666_666_667, 333_333_333]);
    // ④는 안분 전이라 모른다 → route가 floor(333,333,333 ÷ 0.5)
    expect((r.body.companionAssets as Array<Record<string, unknown>>)[0].totalPropertyTransferPrice).toBeUndefined();
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([undefined, 666_666_666]);
  });
  it("apportioned · 지분 primary도 같다(키 250M · 물건 전체 양도가액 666,666,666)", async () => {
    const r = await run(form("apportioned", share("50"), {}));
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([333_333_333, 666_666_667]);
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([666_666_666, undefined]);
  });
  it("부정형 짝 — 축 B(같은 물건 50/50)는 종전 그대로: 자동가 500M/500M · 물건 전체 = 총액 · 안분 키 미스케일", async () => {
    const f = form("apportioned", share("50"), share("50"));
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([500_000_000, 500_000_000]);
    expect(r.body.totalPropertyTransferPrice).toBe(1_000_000_000);
    expect((r.body.companionAssets as Array<Record<string, unknown>>)[0].totalPropertyTransferPrice).toBe(1_000_000_000);
    expect(r.items.map((i) => i.totalPropertyTransferPrice)).toEqual([1_000_000_000, 1_000_000_000]);
  });
});

describe("⑧ — 지분 자산도 계약서 가액·기준시가를 요구 · 합계는 지분 반영", () => {
  it("지분 자산 계약서 가액 비움(actual) → 그 칸 · 기준시가 비움(apportioned) → 그 칸", () => {
    const a = v8(form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "" }));
    expect(a.map((i) => i.field)).toContain("actualSalePrice");
    const b = v8(form("apportioned", {}, { ...share("50"), standardPriceAtTransfer: "" }));
    expect(b.map((i) => i.field)).toContain("standardPriceAtTransfer");
  });
  it("지분 금액을 그대로(400M) 넣으면 100% 규약상 200M이 되어 합계 불일치로 막는다", () => {
    const i = v8(form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "400000000" }));
    expect(i.find((x) => x.field === "contractTotalPrice")?.message).toContain("구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다");
  });
});

describe("⑧≡⑫ 격자 — 방식 × 지분 조합 × 입력 상태: ⑧ 통과 ⇒ 200 · 500 없음", () => {
  it("전수", async () => {
    const shares: Array<[string, Partial<AssetForm>, Partial<AssetForm>]> = [
      ["100/100", {}, {}], ["100/50", {}, share("50")], ["50/100", share("50"), {}], ["50/50", share("50"), share("50")], ["30/100", share("30"), {}],
    ];
    const states: Array<[string, (a: Partial<AssetForm>) => Partial<AssetForm>]> = [
      ["채움", (a) => a],
      ["가액 비움", (a) => ({ ...a, actualSalePrice: "" })],
      ["기준시가 비움", (a) => ({ ...a, standardPriceAtTransfer: "" })],
    ];
    let cells = 0;
    for (const mode of ["actual", "apportioned"] as Mode[]) {
      for (const [sn, s0, s1] of shares) {
        for (const [stn, st] of states) {
          // 100% 규약 금액: 각 자산 지분 반영 후 합이 1,000,000,000이 되게 — 지분이면 물건 전체 = 지분액 ÷ 지분율
          const whole = (s: Partial<AssetForm>, part: number) => String(Math.round(part / (Number(s.ownershipNumerator ?? 100) / 100)));
          const f = form(mode, st({ ...s0, actualSalePrice: whole(s0, 600_000_000) }), st({ ...s1, actualSalePrice: whole(s1, 400_000_000) }));
          const eight = v8(f).length === 0 ? "pass" : "block";
          const r = await run(f);
          const id = `${mode}/${sn}/${stn}`;
          cells++;
          expect(r.status, `500 없음 ${id}`).not.toBe(500);
          if (eight === "pass") expect(r.status, `막다른 길 ${id}`).toBe(200);
          if (eight === "pass" && r.alloc) expect(r.alloc.every((v) => v > 0), `양도가액 0 ${id}`).toBe(true);
        }
      }
    }
    expect(cells).toBe(2 * 5 * 3);
  }, 60_000);
});

describe("⑫ API 직접 호출 — 혼합 묶음에서 지분 자산의 가액·키 면제 없음 (500·침묵 0 대신 400)", () => {
  async function post(body: Record<string, unknown>) {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const j = (await res.json()) as { error?: { fieldErrors?: Record<string, string[]> } };
    return { status: res.status, paths: Object.keys(j.error?.fieldErrors ?? {}) };
  }
  const bodyOf = async (f: TransferFormData) => (await run(f)).body;

  it("actual · 지분 컴패니언(totalPropertyTransferPrice 있음)의 fixedSalePrice 없음 → 400 companionAssets.0.fixedSalePrice", async () => {
    const b = await bodyOf(form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "800000000" }));
    const c = { ...(b.companionAssets as Array<Record<string, unknown>>)[0] };
    delete c.fixedSalePrice;
    const r = await post({ ...b, companionAssets: [c] });
    expect(r.status).toBe(400);
    expect(r.paths).toContain("companionAssets.0.fixedSalePrice");
  });
  it("actual · 지분 반영 합이 총액과 다름(600M + 500M) → 400(종전 500 「구분 기재 합 초과」)", async () => {
    const b = await bodyOf(form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "800000000" }));
    const c = { ...(b.companionAssets as Array<Record<string, unknown>>)[0], fixedSalePrice: 500_000_000 };
    const r = await post({ ...b, companionAssets: [c] });
    expect(r.status).toBe(400);
    expect(r.paths).toContain("primaryActualSalePrice");
  });
  it("apportioned · 지분 컴패니언(totalPropertyTransferPrice 있음)의 안분 키 없음 → 400(종전 200 · 양도가액 0)", async () => {
    const b = await bodyOf(form("apportioned", {}, share("50")));
    const c: Record<string, unknown> = { ...(b.companionAssets as Array<Record<string, unknown>>)[0], totalPropertyTransferPrice: 1_000_000_000 };
    delete c.standardPriceAtTransferForApportion;
    delete c.standardPriceAtTransfer;
    const r = await post({ ...b, companionAssets: [c] });
    expect(r.status).toBe(400);
    expect(r.paths).toContain("companionAssets.0.standardPriceAtTransferForApportion");
  });
  it("apportioned · 지분 primary(totalPropertyTransferPrice 있음)의 안분 키 없음 → 400", async () => {
    const b = await bodyOf(form("apportioned", share("50"), {}));
    const body = { ...b, totalPropertyTransferPrice: 1_000_000_000 };
    delete (body as Record<string, unknown>).standardPriceAtTransferForApportion;
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.paths).toContain("standardPriceAtTransferForApportion");
  });
});

describe("shareWholePropertyPrice", () => {
  it("값이 있으면·축 B·단독이면 그대로 / 함께양도 지분이면 floor(안분액 ÷ 지분율)", () => {
    expect(shareWholePropertyPrice(800, 0.5, 400, false)).toBe(800);
    expect(shareWholePropertyPrice(undefined, 0.5, 400, true)).toBeUndefined();
    expect(shareWholePropertyPrice(undefined, undefined, 400, false)).toBeUndefined();
    expect(shareWholePropertyPrice(undefined, 1, 400, false)).toBeUndefined();
    expect(shareWholePropertyPrice(undefined, 0.5, 333_333_333, false)).toBe(666_666_666);
  });
});
