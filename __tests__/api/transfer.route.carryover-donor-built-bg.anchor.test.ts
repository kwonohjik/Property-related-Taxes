/**
 * anchor — 부담부증여 × 이월과세 × 당초 증여자 신축·증축 §114조의2 · API 경로 (PR-4: ⑫ Zod · ⑭ Date 변환 · 엔진 도달)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-4)
 *
 * 침묵 strip 방지가 이 파일의 존재 이유다 — ⑫에 없는 키는 400이 아니라 200 + 가산세 0으로 조용히 사라진다(TS 미감지).
 *  · DBG-R1 폼 → ④ → ⑫ → ⑭ → 엔진에 닿는다 — K-7 가산세 6,250,000 · K-5 4,687,500 (donorBuilt 없으면 0)
 *  · DBG-R2 ⑫ 거부 — carryoverTaxation 경로 · K-4/K-1~K-3 · 본인 신축 동시 입력 · housing 키 · 신축일 범위 · 증축 필수
 *  · DBG-R3 ⑭ constructionDate 가 Date 로 엔진에 닿는다(안 닿으면 5년 기산이 침묵 오작동)
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
import { companionAssetSchema } from "@/lib/api/transfer-tax-schema-companion";
import { validateDonorBuiltBg } from "@/lib/calc/transfer-tax-validate-donor-built-bg";
import { bgAsset, bgForm, bodyOf } from "../calc/_helpers/carryover-donor-built-bg-form";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

interface Result {
  penaltyTax: number;
  penaltyBase: number;
  totalTax: number;
  carryoverTaxationDetail?: { donorBuiltPenalty?: { applied: boolean; notAppliedReason?: string; base?: number; burdenedGift?: { method: string } } };
}
async function post(body: object): Promise<{ status: number; result?: Result; errors: string; fields: string[] }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: { result: Result }; error?: { fieldErrors?: Record<string, string[]>; message?: string } };
  return { status: res.status, result: json.data?.result, errors: JSON.stringify(json.error ?? {}), fields: Object.keys(json.error?.fieldErrors ?? {}) };
}
const call = async (method: "appraisal" | "converted", co: Partial<CarryoverTaxationForm> = {}, over: Record<string, unknown> = {}) =>
  post(await bodyOf(bgForm(bgAsset(method, co, over as never))));
const mutate = async (method: "appraisal" | "converted", fn: (b: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const body = (await bodyOf(bgForm(bgAsset(method)))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  fn(body);
  return post(body);
};

describe("DBG-R1 — donorBuilt 가 엔진에 닿는다 (strip 이면 가산세 0)", () => {
  it("K-7 감정가액: 가산세 6,250,000 (base 125,000,000 = 채무비율 안분 후 건물 감정가액)", async () => {
    const on = await call("appraisal");
    expect(on.status, on.errors).toBe(200);
    expect(on.result!.penaltyBase).toBe(125_000_000);
    expect(on.result!.penaltyTax).toBe(6_250_000);
    expect(on.result!.carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: true, base: 125_000_000, burdenedGift: { method: "appraisal" } });
    const off = await call("appraisal", { donorBuilt: false });
    expect(off.result!.penaltyTax).toBe(0);
    expect(off.result!.totalTax).toBe(on.result!.totalTax - 6_250_000 - 625_000);
  });
  it("K-5 환산: 가산세 4,687,500 (base 93,750,000)", async () => {
    const on = await call("converted");
    expect(on.status, on.errors).toBe(200);
    expect(on.result!.penaltyBase).toBe(93_750_000);
    expect(on.result!.penaltyTax).toBe(4_687_500);
  });
  it("증축 K-7: 증축 부분 감정가액 80M × 0.625 = 50M 의 5% = 2,500,000", async () => {
    const on = await call("appraisal", { donorBuiltType: "extension", donorBuiltExtensionArea: "90" }, { bgPresumedExtensionAppraisal: "80,000,000" });
    expect(on.status, on.errors).toBe(200);
    expect(on.result!.penaltyBase).toBe(50_000_000);
    expect(on.result!.penaltyTax).toBe(2_500_000);
  });
});

describe("DBG-R2 ⑫ 거부 — 400 (조용히 무시하지 않는다)", () => {
  it("carryoverTaxation 경로로 보내면 거부 — 부담부증여는 burdenedGiftInfo.carryoverDonorBasis.donorBuilt", async () => {
    const o = await mutate("converted", (b) => { b.carryoverTaxation.donorBuilt = { buildingType: "new", constructionDate: "2022-01-10" }; });
    expect(o.status).toBe(400);
  });
  it("실지(K-4) 방식이면 거부", async () => {
    const o = await mutate("converted", (b) => { b.burdenedGiftInfo.acquisitionMethod = "actual"; });
    expect(o.status).toBe(400);
    expect(o.errors).toContain("환산취득가액(K-5) 또는 감정가액(K-7)");
  });
  it("양도인 본인 신축(isSelfBuilt)과 동시 입력 거부 — 두 축 혼동 차단", async () => {
    const o = await mutate("converted", (b) => { b.isSelfBuilt = true; b.buildingType = "new"; b.constructionDate = "2024-01-01"; });
    expect(o.status).toBe(400);
    expect(o.errors).toContain("다른 축");
    expect(o.fields).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt"); // ⑫(Zod)가 막는다 — 엔진 도달 전
  });
  it("housing 키는 받지 않는다(strict)", async () => {
    const o = await mutate("converted", (b) => { b.burdenedGiftInfo.carryoverDonorBasis.donorBuilt.housing = { landPricePerSqmAtAcquisition: 1, landArea: 1, buildingStdPriceAtAcquisition: 1, landStdPriceAtTransfer: 1, buildingStdPriceAtTransfer: 1 }; });
    expect(o.status).toBe(400);
  });
  it("신축일이 당초 증여자 취득일 전 / 증여 등기접수일 후", async () => {
    expect((await mutate("converted", (b) => { b.burdenedGiftInfo.carryoverDonorBasis.donorBuilt.constructionDate = "2000-05-31"; })).status).toBe(400);
    expect((await mutate("converted", (b) => { b.burdenedGiftInfo.carryoverDonorBasis.donorBuilt.constructionDate = "2023-06-02"; })).status).toBe(400);
  });
  it("증축 K-5 — 바닥면적·증축 부분 기준시가 누락", async () => {
    const a = await mutate("converted", (b) => { b.burdenedGiftInfo.carryoverDonorBasis.donorBuilt = { buildingType: "extension", constructionDate: "2022-01-10", extensionStdPriceAtAcquisition: 40_000_000 }; });
    expect(a.status).toBe(400);
    expect(a.errors).toContain("바닥면적");
    expect(a.fields).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt.extensionFloorArea"); // ⑫(Zod) 경로
    const b2 = await mutate("converted", (b) => { b.burdenedGiftInfo.carryoverDonorBasis.donorBuilt = { buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 90 }; });
    expect(b2.status).toBe(400);
  });
  it("이월과세가 아닌 부담부증여에 donorBuilt 를 보내면 거부", async () => {
    const o = await mutate("converted", (b) => { b.acquisitionCause = "purchase"; delete b.carryoverTaxation; });
    expect(o.status).toBe(400);
  });
});

describe("DBG-R3 ⑭ Date 변환", () => {
  it("constructionDate 가 Date 로 엔진에 닿는다 — 신축일+5년 당일은 발동 / +1일은 미발동 (문자열이면 둘 다 NaN 비교로 어긋난다)", async () => {
    // 양도일 2026-02-16 — 신축일 2021-02-16 → 5년 되는 날 2026-02-16(당일 포함)
    expect((await call("converted", { donorBuiltDate: "2021-02-16" })).result!.penaltyTax).toBe(4_687_500);
    const late = await call("converted", { donorBuiltDate: "2021-02-15" });
    expect(late.result!.penaltyTax).toBe(0);
    expect(late.result!.carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });
});

describe("DBG-R4 컴패니언(지분 분할 취득 묶음)은 범위 밖 — ⑫ 가 거부하고 ⑧ 이 먼저 막는다", () => {
  it("⑫ companionAssetSchema.burdenedGiftInfo — donorBuilt 가 있으면 거부, 없으면 통과", async () => {
    const body = (await bodyOf(bgForm(bgAsset("converted")))) as { burdenedGiftInfo: Record<string, unknown> };
    const field = (companionAssetSchema as unknown as { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).shape.burdenedGiftInfo;
    expect(field.safeParse(body.burdenedGiftInfo).success).toBe(false);
    const basis = { ...(body.burdenedGiftInfo.carryoverDonorBasis as Record<string, unknown>) };
    delete basis.donorBuilt;
    expect(field.safeParse({ ...body.burdenedGiftInfo, carryoverDonorBasis: basis }).success).toBe(true);
  });
  it("⑧ 지분 분할 취득 묶음이면 토글을 끄라고 알린다(⑧이 ⑫보다 엄격 — UI 통과 ⇒ ⑫ 통과 방향 유지)", () => {
    const msg = validateDonorBuiltBg(bgAsset("converted"), "자산", "2026-02-16", true);
    expect(msg).toContain("지분 분할 취득");
    expect(validateDonorBuiltBg(bgAsset("converted"), "자산", "2026-02-16", false)).toBeNull();
  });
});
