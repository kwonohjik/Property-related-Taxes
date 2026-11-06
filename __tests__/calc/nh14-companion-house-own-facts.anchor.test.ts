/**
 * NH-14 후속 2 (F-1 · §154① 단서) — 첫 자산이 토지이고 함께 양도 주택이 세대 기준 자산이면, 그 주택 **자신의** 1세대1주택 사실
 * (취득 당시 조정대상지역 · 거주기간 · §154① 단서)을 ② 섹션에서 받아 그 주택 카드로 판정한다.
 *
 * 계획서: `docs/00-pm/nh14-companion-house-own-facts.plan.md`. 실측(수정 전, mock 세율 · 강남 2018 취득 · 1세대 1주택):
 * 거주 0개월 — 주택 먼저 169,246,000(거주요건 미충족 과세) ↔ 토지 먼저 18,628,500(비과세 — 취득 당시 조정대상지역을 토지(제주) 주소로
 * 판정, 거주기간 미전송). 기대값은 같은 입력의 「주택 먼저」 계산에서 얻는다(출력 베끼기 아님).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form, aggOf } from "./_helpers/g1-reverse-appurtenant-fixtures";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const SL = (id: string) => ({ ...LAND(id, 300), landNature: "standalone" });
/** 강남(2017.8.3. 조정대상지역 지정) 2018 취득 주택 */
const GANGNAM = { addressJibun: "서울특별시 강남구 대치동 1", regionCode: "1168010600", acquisitionDate: "2018-01-02" };
const ONE: Partial<TransferFormData> = { householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, transferDate: "2026-02-16" };
const house = (residenceMonths: string) => ({ ...HOUSE(0), ...GANGNAM, residenceInputMode: "direct", residencePeriodMonthsAsset: residenceMonths });
const run = async (order: "house" | "land", months: string, over: Partial<TransferFormData> = {}) => {
  const f = order === "house" ? form(house(months), SL("l1")) : form(SL("l1"), house(months));
  const r = await runCalc({ ...(f as object), ...ONE, ...over } as never);
  const agg = aggOf(r);
  const hid = order === "house" ? "primary" : "h1";
  return { r, total: agg?.totalTax, exempt: agg?.properties?.find((p: { propertyId: string }) => p.propertyId === hid)?.isExempt };
};

describe("F-1 취득 당시 조정대상지역 · 거주기간", () => {
  it("A-1: 🔴 거주 0개월 — 토지 먼저도 거주요건 미충족 과세 = 주택 먼저 (종전: 비과세)", async () => {
    const hf = await run("house", "0");
    const lf = await run("land", "0");
    expect(hf.r.issues).toEqual([]);
    expect(lf.r.issues).toEqual([]);
    expect(hf.exempt).toBe(false);
    expect(lf.exempt).toBe(false);
    expect(lf.total).toBe(hf.total);
    expect(lf.r.body.wasRegulatedAtAcquisition).toBe(true);
    expect((lf.r.body.companionAssets as { assetId: string; residencePeriodMonths?: number }[]).find((c) => c.assetId === "h1")?.residencePeriodMonths).toBe(0);
  });

  it("A-2: 거주 36개월 — 두 순서 모두 비과세 · 같은 세액 · 그 주택 카드에 거주 36", async () => {
    const hf = await run("house", "36");
    const lf = await run("land", "36");
    expect(hf.exempt).toBe(true);
    expect(lf.exempt).toBe(true);
    expect(lf.total).toBe(hf.total);
    expect((lf.r.body.companionAssets as { assetId: string; residencePeriodMonths?: number }[]).find((c) => c.assetId === "h1")?.residencePeriodMonths).toBe(36);
  });
});

describe("§154① 단서 — 함께 양도 주택 기준", () => {
  const PROVISO: Partial<TransferFormData> = {
    provisoReason: "expropriation",
    provisoExpropriationDate: "2026-01-10",
    provisoBusinessApprovalDate: "2025-06-01",
  };
  it("B-1: 🔴 거주 0개월 + 수용 단서 — 토지 먼저 = 주택 먼저 (단서가 그 주택 카드에 실린다)", async () => {
    const hf = await run("house", "0", PROVISO);
    const lf = await run("land", "0", PROVISO);
    expect(hf.r.issues).toEqual([]);
    expect(lf.r.issues).toEqual([]);
    expect(lf.total).toBe(hf.total);
    expect(lf.exempt).toBe(hf.exempt);
    // 구별력 — 단서가 결과를 바꾼다(단서 없는 A-1과 다르다)
    expect(hf.total).not.toBe((await run("house", "0")).total);
  });
});
