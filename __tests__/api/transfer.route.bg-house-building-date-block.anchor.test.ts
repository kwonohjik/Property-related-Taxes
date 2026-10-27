/**
 * anchor — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → ⑧·⑫ 차단 (V-4 PR-1 · Q-1 a)
 *
 * 계획서 `docs/00-pm/bg-carryover-non-gb-building-date.plan.md` §4.1 · §7.
 * 「소득세법」 제95조 제4항 — 토지와 건물의 보유기간은 각각 그 자산의 취득일(이월과세면 당초 증여자가 해당 자산을 취득한 날)부터 센다.
 * 부담부증여 주택·건물은 토지·건물을 나눠 계산하지 않아(§1.3) 어느 날짜를 넣어도 한 파트를 법문과 다른 날로 센다.
 * 수정 前: 본인 취득 + 「토지·건물 취득일 다름」 → ⑧ 「토지 취득가액을 입력하세요」(화면에 칸 없음 — §8 V-1 RTL 실측) · 토글 C는 켤 수 없고 저장값은 조용히 무시.
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
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, unknown>;
async function post(body: Body): Promise<{ status: number; det?: number; message?: string; fields: string[] }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { result?: { determinedTax?: number }; aggregated?: { determinedTax?: number } }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  return { status: res.status, det: json.data?.result?.determinedTax ?? json.data?.aggregated?.determinedTax, message: json.error?.message, fields: Object.keys(json.error?.fieldErrors ?? {}) };
}
/** 가구 확인 칸 2개는 이 시드에 없는 별개 질문이라 거른다. */
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
const run = async (f: TransferFormData) => post(await bodyOf(f));

const PART_DATES = "토지와 건물의 취득일이 다르면 아직 계산하지 못합니다";
const DONOR_PART_DATES = "당초 증여자가 토지와 건물을 다른 날 취득했으면 아직 계산하지 못합니다";
const GB_HINT = "일반건물(토지+건물 일괄)";

/** 본인 취득(매매) — 토지 2000-06-01 · 건물 2022-01-10. 계획서 §1.2 O-계열. */
const own = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, { acquisitionCause: "purchase", acquisitionDate: "2022-01-10", ...over } as Partial<AssetForm>);
const split = (land: string, over: Partial<AssetForm> = {}) => own({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: land, ...over } as Partial<AssetForm>);
/** 이월과세 — 당초 증여자 취득일 하나(2000-06-01). 계획서 §1.1 H-계열. */
const carry = (over: Partial<AssetForm> = {}) => bgAsset("converted", { donorBuilt: false }, over);

describe("본인 취득 · 「토지·건물 취득일 다름」(날짜 다름) → ⑧·⑫ 차단", () => {
  it("주택 O2 → ⑧ 토지 취득일 칸 · 새 메시지(종전 「토지 취득가액」 — 칸 없는 차단) · 일반건물 안내 없음", () => {
    const [first] = issues(bgForm(split("2000-06-01")));
    expect(first?.field).toBe("landAcquisitionDate");
    expect(first?.message).toContain(PART_DATES);
    expect(first?.message).toContain("「소득세법」 제95조 제4항");
    expect(first?.message).not.toContain(GB_HINT);
  });
  it("주택 O2 → ⑫ 400(같은 leaf)", async () => {
    const r = await run(bgForm(split("2000-06-01")));
    expect(r.status).toBe(400);
    expect(r.message).toContain(PART_DATES);
  });
  it("건물(토지 제외) → 「일반건물(토지+건물 일괄)」로 입력하라는 안내를 덧붙인다(⑧·⑫)", async () => {
    const f = bgForm(split("2000-06-01", { assetKind: "building" }));
    expect(issues(f)[0]?.message).toContain(GB_HINT);
    expect((await run(f)).message).toContain(GB_HINT);
  });
  it("회귀 — 같은 날이면 통과 · 토글 OFF O1 63,888,000", async () => {
    expect(issues(bgForm(split("2022-01-10")))).toEqual([]);
    const r = await run(bgForm(own()));
    expect([r.status, r.det]).toEqual([200, 63_888_000]);
  });
});

describe("이월과세 · 토글 C(당초 증여자가 토지·건물을 다른 날 취득) → ⑧ 차단", () => {
  it("주택 H3(저장값 ON) → ⑧ carryoverDonorSplit 칸 · 새 메시지(종전 조용히 무시 → 86,424,375)", () => {
    const [first] = issues(bgForm(carry({ carryoverDonorSplit: true } as Partial<AssetForm>)));
    expect(first?.field).toBe("carryoverDonorSplit");
    expect(first?.message).toContain(DONOR_PART_DATES);
    expect(first?.message).toContain("「소득세법」 제95조 제4항 단서");
  });
  it("건물(토지 제외) B3 → 일반건물 안내", () => {
    expect(issues(bgForm(carry({ assetKind: "building", carryoverDonorSplit: true } as Partial<AssetForm>)))[0]?.message).toContain(GB_HINT);
  });
  it("⑫ — C 와이어(토지 파트 이월과세)를 직접 보내면 400(기존 규칙 유지)", async () => {
    const body = await bodyOf(bgForm(carry()));
    const { carryoverTaxation: _drop, ...rest } = body as Body & { carryoverTaxation?: unknown };
    const r = await post({
      ...rest,
      landAcquisitionCause: "carryover_gift", landAcquisitionDate: "2023-06-01", buildingAcquisitionPrice: 400_000_000, landAcquisitionPrice: 200_000_000,
      carryoverGiftEvent: { giftRegistryDate: "2023-06-01", giftTaxCalculated: 0, giftTaxBase: 600_000_000, donorRelation: "lineal" },
      landCarryoverPart: { donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: 50_000_000 },
      buildingCarryoverPart: { donorAcquisitionDate: "2022-01-10", donorAcquisitionPrice: 50_000_000 },
    });
    expect(r.status).toBe(400);
  });
  it("회귀 — 토글 OFF H1 86,424,375", async () => {
    expect(issues(bgForm(carry()))).toEqual([]);
    const r = await run(bgForm(carry()));
    expect([r.status, r.det]).toEqual([200, 86_424_375]);
  });
});
