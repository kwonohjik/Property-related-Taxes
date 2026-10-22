/**
 * 의제취득일(1985.1.1.) 전 증여 ③ 입력 — 폼 → ⑧ → ④ → ⑫ → Route 전 구간 (PR-5 · 계획서 §16).
 *
 * 시료: 1980 증여 토지 · 2023-02-16 양도 9.2억 · ③ 분모(양도시 기준시가) 1,243,350,000 · mock 세율.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { preDeemedAutoStdPrices } from "@/lib/calc/pre-deemed-auto-std-price";

const T = 920_000_000;
const STD_T = 1_243_350_000;

const GIFT_LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "gift",
  acquisitionDate: "1980-03-01",
  donorAcquisitionDate: "1975-01-01",
  fixedAcquisitionPrice: "100000000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  standardPriceAtAcq: "202620000",
  standardPriceAtTransfer: String(STD_T),
  actualSalePrice: String(T),
};
const LAND_GRADES = {
  pre1990GradeMode: "number" as const,
  pre1990Grade_atAcq: "200",
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990PricePerSqm_1990: "1100000",
};

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(assets: AssetForm[], contract = T): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2023-02-16";
  f.filingDate = "2023-04-30";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return f;
}

async function run(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  return { status: res.status, json, body, issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)) };
}
type Breakdown = { reportedAmount: number | null; sec164Amount: number | null; convertedAmount: number; selectedMethod: string };

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("R1 단건 증여 토지", () => {
  it("① 1억 + ③ 칸 → ⑧ 통과 · ③ 149,925,925 채택 · 결정세액 187,624,669 (③ 칸 없던 종전: ① 1억 · 204,090,000)", async () => {
    const r = await run(form([asset(1, GIFT_LAND)]));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const d = r.json.data.result.inheritedAcquisitionDetail;
    expect(d.preDeemedBreakdown).toMatchObject({ reportedAmount: 100_000_000, convertedAmount: 149_925_925, selectedMethod: "converted" });
    expect(r.json.data.result.determinedTax).toBe(187_624_669);
  });

  it("③ 칸을 비우면 ③은 비교하지 않는다 — ① 1억", async () => {
    const r = await run(form([asset(1, GIFT_LAND, { standardPriceAtAcq: "", standardPriceAtTransfer: "" })]));
    expect(r.status).toBe(200);
    expect(r.json.data.result.inheritedAcquisitionDetail.preDeemedBreakdown).toMatchObject({ convertedAmount: 0, selectedMethod: "reported" });
  });

  it("🔴 등급 자동값이 보이면 남은 분자(9억)가 아니라 자동값(②)으로 ③을 계산한다", async () => {
    const r = await run(form([asset(1, GIFT_LAND, LAND_GRADES, { standardPriceAtAcq: "900000000" })]));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect((r.body.inheritedAcquisition as Record<string, unknown>).standardPriceAtDeemedDate).toBeUndefined();
    const b = r.json.data.result.inheritedAcquisitionDetail.preDeemedBreakdown as Breakdown;
    expect(b.sec164Amount).toBeGreaterThan(0);
    // ③ 분자 = ② 등급 환산값(의제취득일 기준) — 9억이 쓰였다면 ③ = 9.2억 × 9억 ÷ 1,243,350,000 = 665,942,011
    expect(b.convertedAmount).toBe(Math.floor((T * b.sec164Amount!) / STD_T));
  });

  it("🔴 일부양도(취득 368.4㎡ · 양도 184.2㎡) — 화면 잠긴 분자 = 엔진 ②·③ 분자(양도분 면적 · PR-5 리뷰 F1)", async () => {
    const a = asset(1, GIFT_LAND, LAND_GRADES, { areaScenario: "partial", acquisitionArea: "368.4" } as Partial<AssetForm>);
    const r = await run(form([a]));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const b = r.json.data.result.inheritedAcquisitionDetail.preDeemedBreakdown as Breakdown;
    expect(preDeemedAutoStdPrices(a, "1980-03-01", false, "2023-02-16").atDeemed).toBe(b.sec164Amount);
    expect(b.convertedAmount).toBe(Math.floor((T * b.sec164Amount!) / STD_T));
  });

  it("①·② 비움 → 증여 신고가액을 요구한다(⑧ · Q-14)", async () => {
    const r = await run(form([asset(1, GIFT_LAND, { fixedAcquisitionPrice: "" })]));
    expect(r.issues.map((i) => i.message).join()).toMatch(/증여 신고가액을 입력하세요/);
  });
});

describe("R2 함께 양도 — 증여 토지 카드", () => {
  it("매매 토지 + 1980 증여 토지 — 증여 카드의 ③ 칸 값이 body에 실리고 ③으로 계산된다", async () => {
    const PURCHASE: Partial<AssetForm> = {
      assetKind: "land",
      addressJibun: "강원 홍천군 테스트리 1",
      acquisitionArea: "300",
      transferArea: "300",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "100000000",
      standardPriceAtTransfer: "150000000",
      actualSalePrice: "300000000",
    };
    const f = form([asset(1, PURCHASE), asset(2, GIFT_LAND)], T + 300_000_000);
    f.assetSplitMode = "companion" as never;
    f.bundledSaleMode = "actual";
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const c = (r.body.companionAssets as Record<string, unknown>[])[0].inheritedAcquisition as Record<string, unknown>;
    expect(c).toMatchObject({ mode: "pre-deemed", standardPriceAtDeemedDate: 202_620_000, standardPriceAtTransfer: STD_T });
  });
});
