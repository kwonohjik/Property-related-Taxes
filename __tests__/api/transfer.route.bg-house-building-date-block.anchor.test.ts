/**
 * anchor — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → (PR-1) ⑧·⑫ 차단 → (V-4 PR-B) 파트 칸을 요구하고 채우면 나눠 계산
 *
 * 계획서 `docs/00-pm/bg-carryover-non-gb-building-date.plan.md` §4.1 · §7 → 설계서 `docs/00-pm/bg-house-building-split.design.md` §5.2.
 * PR-1의 「아직 계산하지 못합니다」 차단은 PR-B에서 풀었다 — 같은 입력이 이제 무엇을 요구하는지(칸) · 회귀 셀이 그대로인지를 고정한다.
 * 계산 값은 `transfer.route.bg-house-building-split-ui.anchor.test.ts`가 고정한다.
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
  // ⑫ 위반 문구는 필드 오류 안에 있다 — 머리 문구(「입력값이 올바르지 않습니다」)와 함께 읽는다.
  const message = [json.error?.message, ...Object.values(json.error?.fieldErrors ?? {}).flat()].filter(Boolean).join(" | ");
  return { status: res.status, det: json.data?.result?.determinedTax ?? json.data?.aggregated?.determinedTax, message, fields: Object.keys(json.error?.fieldErrors ?? {}) };
}
/** 가구 확인 칸 2개는 이 시드에 없는 별개 질문이라 거른다. */
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
const run = async (f: TransferFormData) => post(await bodyOf(f));
async function postRaw(body: Body): Promise<Body> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }) }));
  return (await res.json()) as Body;
}

const BY_PART = "토지분·건물분 평가액";
const MARKET_PARTS = { bgMarketValueLand: "500,000,000", bgMarketValueBuilding: "300,000,000" } as Partial<AssetForm>;

/** 본인 취득(매매) — 토지 2000-06-01 · 건물 2022-01-10. 계획서 §1.2 O-계열(시가 8억 · K-5). */
const own = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, { acquisitionCause: "purchase", acquisitionDate: "2022-01-10", ...over } as Partial<AssetForm>);
const split = (land: string, over: Partial<AssetForm> = {}) => own({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: land, ...over } as Partial<AssetForm>);
/** 이월과세 — 당초 증여자 취득일 하나(2000-06-01). 계획서 §1.1 H-계열. */
const carry = (over: Partial<AssetForm> = {}) => bgAsset("converted", { donorBuilt: false }, over);

describe("본인 취득 · 「토지·건물 취득일 다름」(날짜 다름) → 파트 칸 요구(PR-1 차단 해제)", () => {
  it("주택 O2 → ⑧ 첫 칸 = 토지분 평가액(시가를 파트로 나눈다 · 종전 「아직 계산하지 못합니다」)", () => {
    const [first] = issues(bgForm(split("2000-06-01")));
    expect(first?.field).toBe("bgMarketValueLand");
    expect(first?.message).not.toContain("아직 계산하지 못합니다");
  });
  it("주택 O2 → ⑫ 400 — 파트 평가액 없이 보낸 본문(같은 규칙)", async () => {
    const r = await run(bgForm(split("2000-06-01")));
    expect(r.status).toBe(400);
    expect(r.message).toContain(BY_PART);
  });
  it("건물(토지 제외)도 같은 칸을 요구한다", () => {
    expect(issues(bgForm(split("2000-06-01", { assetKind: "building" })))[0]?.field).toBe("bgMarketValueLand");
  });
  it("회귀 — 부담부증여가 아니면(일반 양도) 이 칸을 묻지 않는다 · 소유자 분리(한 파트만 양도)도 아니다", () => {
    const hit = (f: TransferFormData) => issues(f).some((i) => i.field === "bgMarketValueLand");
    expect(hit(bgForm(split("2000-06-01", { transferType: "regular" } as Partial<AssetForm>)))).toBe(false);
    expect(hit(bgForm(split("2000-06-01", { selfOwns: "building_only" } as Partial<AssetForm>)))).toBe(false);
  });
  it("회귀 — 같은 날이면 통과 · 토글 OFF O1 63,888,000", async () => {
    expect(issues(bgForm(split("2022-01-10")))).toEqual([]);
    const r = await run(bgForm(own()));
    expect([r.status, r.det]).toEqual([200, 63_888_000]);
  });
});

describe("이월과세 · 토글 C(당초 증여자가 토지·건물을 다른 날 취득) → 「건물분 증여자 취득일」 요구(PR-1 차단 해제)", () => {
  it("주택 H3(저장값 ON) → ⑧ 첫 칸 = 건물분 증여자 취득일(종전 「아직 계산하지 못합니다」 · 그 전엔 조용히 무시 → 86,424,375)", () => {
    const [first] = issues(bgForm(carry({ carryoverDonorSplit: true } as Partial<AssetForm>)));
    expect(first?.field).toBe("buildingCarryover.donorAcquisitionDate");
  });
  it("건물(토지 제외) B3 → 같은 칸", () => {
    expect(issues(bgForm(carry({ assetKind: "building", carryoverDonorSplit: true } as Partial<AssetForm>)))[0]?.field).toBe("buildingCarryover.donorAcquisitionDate");
  });
  it("⑫ — 일반 양도의 C 와이어(토지 파트 이월과세)를 부담부증여로 보내면 400(기존 규칙 유지 — 부담부증여 C는 `carryoverDonorBasis.buildingDonorAcquisitionDate`로 받는다)", async () => {
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
  it("회귀 — 일반 양도의 토글 C는 이 칸을 요구하지 않는다(파트 이월과세로 계산)", () => {
    expect(issues(bgForm(carry({ transferType: "regular", carryoverDonorSplit: true } as Partial<AssetForm>))).some((i) => i.field === "buildingCarryover.donorAcquisitionDate")).toBe(false);
  });
  it("회귀 — 토글 OFF H1 86,424,375", async () => {
    expect(issues(bgForm(carry()))).toEqual([]);
    const r = await run(bgForm(carry()));
    expect([r.status, r.det]).toEqual([200, 86_424_375]);
  });
});

describe("지분·묶음 — 같은 술어라 ⑧·⑫가 함께 파트 칸을 요구하고, 채우면 계산한다(설계서 §8 V-2 · S6·S7)", () => {
  const nth = (a: AssetForm, n: number) => ({ ...a, assetId: `a${n}`, assetLabel: `자산 ${n}`, addressJibun: `서울 강남구 테스트동 ${n}-1` }) as AssetForm;
  const land = own({ assetKind: "land", acquisitionDate: "2015-01-01", landNature: "standalone" } as Partial<AssetForm>);
  const formOf = (assets: AssetForm[], over: Record<string, unknown>) => Object.assign(bgForm(assets[0]), { assets, ...over }) as TransferFormData;
  const BUNDLE = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,100,000,000" };
  const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
  /** K-5 환산 — 양도시 토지·건물 기준시가(가목 5억 : 나목 3억 → 개별주택가격 8억을 같은 비율로) · 취득시 토지 1억 · 건물 1.5억. */
  const PARTS = {
    ...MARKET_PARTS,
    standardPricePerSqmAtTransfer: "5,000,000", transferArea: "100", buildingStandardPriceAtTransfer: "300,000,000",
    standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100", buildingStandardPriceAtAcq: "150,000,000",
  } as Partial<AssetForm>;

  it("묶음 둘째 자산(본인 취득 · 날짜 다름) → ⑧ 그 자산 토지분 평가액 · ⑫ 400 · 파트 칸을 채우면 200(S7 — 컴패니언도 같은 엔진 경로)", async () => {
    const f = formOf([nth(land, 1), nth(split("2000-06-01"), 2)], BUNDLE);
    expect(issues(f).map((i) => [i.field, i.message?.startsWith("자산 2:")])).toEqual([["bgMarketValueLand", true]]);
    expect((await run(f)).message).toContain(BY_PART);
    const filled = formOf([nth(land, 1), nth(split("2000-06-01", PARTS), 2)], BUNDLE);
    expect(issues(filled)).toEqual([]);
    const r = await run(filled);
    expect(r.status, r.message).toBe(200);
    /**
     * 주택 카드(K-5 환산 · B/C = 5억 / 8억 = 0.625): 양도가액 토지 5억 × 0.625 = 312,500,000 · 건물 187,500,000.
     *   취득가액 = 파트 양도가액 × 취득시 ÷ 양도시 기준시가 — 토지 312,500,000 × 1억 ÷ 5억(개별주택가격 8억 × 가목 5억/8억) = 62,500,000 · 건물 187,500,000 × 1.5억 ÷ 3억 = 93,750,000.
     *   개산공제 3% — 토지 1억 × 0.625 = 1,875,000 · 건물 2,812,500 → 양도차익 토지 248,125,000 · 건물 90,937,500 = 339,062,500.
     *   장특 토지 30%(25년) 74,437,500 + 건물 8%(4년) 7,275,000 = 81,712,500. 단건이면 257,350,000 − 2,500,000 = 254,850,000 × 38% − 19,940,000 = 76,903,000.
     */
    const single = await run(bgForm(split("2000-06-01", PARTS)));
    expect(single.det).toBe(76_903_000);
    const json = (await postRaw(await bodyOf(filled))) as { data: { aggregated: { properties: Body[] } } };
    const house = json.data.aggregated.properties[1];
    expect([house.transferGain, house.longTermHoldingDeduction]).toEqual([339_062_500, 81_712_500]);
  });
  it("지분 50/50(본인 취득 · 날짜 다름) → ⑧ 두 지분 모두 · ⑫ 400", async () => {
    const f = formOf([nth(split("2000-06-01", half), 1), nth(split("2000-06-01", half), 2)], { assetSplitMode: "fractional" });
    expect(issues(f).map((i) => i.field)).toEqual(["bgMarketValueLand", "bgMarketValueLand"]);
    expect((await run(f)).status).toBe(400);
  });
});
