/**
 * anchor — 조특법 §98 「5년 이상 보유ㆍ임대」는 **보유 또는 임대**다 (리뷰 US-01 · Q-11 (b) · Q-10 (b), 사용자 결정 2026-11-08).
 *
 * 폼 → ④ `callTransferTaxAPI` → ⑫ Zod → ⑭ route → 엔진을 그대로 거친다(fallback 세율표).
 *
 * | 시나리오 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | R1 2022-08-01 · 비조정 2주택 · 임대 OFF | 65,395,000 (§98 전체 탈락 — RENTAL_NOT_CONFIRMED) | 45,650,000 (20%) |
 * | R2 같은 입력 · 임대 ON | 45,650,000 | 45,650,000 |
 * | R3 2026-06-01 · 조정 2주택(명부) · 임대 OFF | §98 탈락 → 중과 | §98 적격이어도 중과 우선(Q-11 (b)) + 확인 필요 고지 |
 * | R4 같은 입력 · 임대 ON | 3호 배제 → 20% | 3호 배제 → 20% |
 *
 * 법령: 조특법 §98①·③ · 조특령 §98③④(보유기간 계산만 위임, 임대 증빙 없음) · 해석례 재일46014-2551·서면4팀-1122·서면5팀-1134
 * (「보유 또는 임대」). 중과 우선: 법 §98①1호는 「같은 법 제104조제1항에도 불구하고」만 지목하고, 소령 §167의3①3호는 5년 이상
 * 임대한 §98 국민주택만 중과에서 뺀다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE } from "@/lib/tax-engine/transfer-tax-unsold98-rate-notice";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const reduction98 = (rented: boolean) => ({
  ...getReductionDefault("unsold_98"),
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true,
  isFirstBuyerNoOccupancy98: true,
  rentedFor5Years98: rented,
});

const other: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: "1168010100",
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(o: { transferDate: string; regulated: boolean; rented: boolean; houses?: HouseEntry[] }): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "1996-06-15",
    fixedAcquisitionPrice: "500,000,000",
    reductions: [reduction98(o.rented)] as never,
  };
  return Object.assign(f, {
    transferDate: o.transferDate,
    contractTotalPrice: "800,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: o.regulated,
    wasRegulatedAtAcquisition: false,
    houses: o.houses ?? [],
  });
}

async function run(f: Form) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { body: body as Obj, r: json.data.result as Obj & { warnings?: string[] } };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("US-01 — 임대 OFF여도 보유 5년이면 §98 20% (route)", () => {
  it("R1 2022-08-01 비조정 2주택 · 임대 OFF → 45,650,000 (수정 전 65,395,000) · 기본세율 비교 고지", async () => {
    const { body, r } = await run(form({ transferDate: "2022-08-01", regulated: false, rented: false }));
    // ④ 본문에는 임대 사실이 그대로 실린다(3호 판정용)
    expect(((body.reductions as Obj[]) ?? [])[0]).toMatchObject({ type: "unsold_98", rentedFor5Years98: false });
    expect(r.appliedRate).toBe(0.2);
    expect(r.taxBase).toBe(207_500_000);
    expect(r.calculatedTax).toBe(41_500_000);
    expect(r.totalTax).toBe(45_650_000);
    // Q-10 (b) — 같은 과세표준의 기본세율 산출세액 59,450,000(38% − 누진공제 19,400,000)을 함께 적는다
    expect(r.warnings?.some((w) => w.includes("41,500,000원") && w.includes("59,450,000원"))).toBe(true);
  });

  it("R2 같은 입력 · 임대 ON → 같은 값", async () => {
    const { r } = await run(form({ transferDate: "2022-08-01", regulated: false, rented: true }));
    expect(r.totalTax).toBe(45_650_000);
  });
});

describe("Q-11 (b) — 미임대 §98 주택이 중과 대상이면 중과가 우선한다 (route)", () => {
  it("R3 2026-06-01 조정 2주택(명부) · 임대 OFF → 중과세율 · 장특 0 · 확인 필요 고지", async () => {
    const { r } = await run(form({ transferDate: "2026-06-01", regulated: true, rented: false, houses: [other] }));
    expect(r.appliedRate).not.toBe(0.2);
    expect((r.surchargeRate as number) ?? 0).toBeGreaterThan(0);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.warnings).toContain(UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE);
    expect((r.unsold98Detail as Obj | undefined)?.isEligible).toBe(true);
  });

  it("R4 같은 입력 · 임대 ON → 3호 배제 · 20%", async () => {
    const { r } = await run(form({ transferDate: "2026-06-01", regulated: true, rented: true, houses: [other] }));
    expect(r.appliedRate).toBe(0.2);
    expect((r.surchargeRate as number) ?? 0).toBe(0);
    expect(r.warnings).not.toContain(UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE);
  });
});
