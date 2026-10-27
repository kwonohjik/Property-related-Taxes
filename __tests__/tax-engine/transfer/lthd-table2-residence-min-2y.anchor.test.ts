/**
 * S08-2 anchor — 「소득세법」 §95② 표2 거주기간 열은 「2년 이상 3년 미만(보유기간 3년 이상에 한정함) 100분의 8」에서
 * 시작하고 2년 미만 칸이 없다(2021.1.1. 시행본 MST 224837 · 현행 MST 280405 원문 확인). 실거주 12~23개월의 거주분 공제율은 0이다.
 * 종전 정본 `calcLongTermRate`는 거주 1년에 4%를 줬다(동일세대 상속 통산 0.36·상생임대 0.44 — 과다공제).
 *
 * (A) 동일세대 상속 통산(§154⑧3호) 엔진 — 2026-10-27부터 표2 대상 판정에 통산하지 않는다(대법원 2025두34935)라 본인 거주 2년 미만이면 표1이다
 *     · (B) 상생임대(§155의3) ④→⑫→⑭ route — 표2가 거주 없이 열리는 경로라 「2년 미만 거주분 0」의 정본 시료다 · (C) 정본 leaf · (D) §95⑤ 용도변경.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calcLongTermRate } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { table2ResidencePct } from "@/lib/tax-engine/data/lthd-table2-era";

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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
const mockRates = makeMockRates();
beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}

function imageCase(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    acquisitionCause: "inheritance",
    acquisitionDate: new Date("2017-09-15"),
    decedentAcquisitionDate: new Date("2010-02-02"),
    transferDate: new Date("2026-02-16"),
    transferPrice: 1_300_000_000,
    acquisitionPrice: 400_000_000,
    expenses: 0,
    wasRegulatedAtAcquisition: true,
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: new Date("2010-02-02"),
    decedentCohabitationResidenceMonths: 24,
    residencePeriodMonths: 0,
    ...over,
  });
}

const WIN_WIN_FACTS = {
  ...oneHouseJudgmentExtraDefaults,
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "4",
  winWinRentalPriorLeaseMonths: "18",
  winWinRentalLeaseMonths: "24",
};

function winWinForm(months: string, withFacts = true): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-03-01",
    fixedAcquisitionPrice: "500,000,000",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: months,
  };
  return Object.assign(f, {
    transferDate: "2026-06-01",
    contractTotalPrice: "1,500,000,000",
    householdHousingCount: "1",
    residencePeriodMonths: months,
    wasRegulatedAtAcquisition: true,
    ...(withFacts ? { importedOneHouseFacts: WIN_WIN_FACTS } : {}),
  });
}


describe("S08-2 anchor — 표2 거주분은 2년 미만이면 0", () => {
  it("(A) 동일세대 상속 통산 · 실거주 12개월 → 상속 전 동거는 표2 대상 판정에 통산하지 않아 표1 16%(보유 8×2)", () => {
    const r = calculateTransferTax(imageCase({ residencePeriodMonths: 12 }), mockRates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.16, 5);
    expect(r.longTermHoldingDeduction).toBe(11_076_923);
  });
  it("(A) 실거주 23개월 → 표1 16%(경계 −1)", () => {
    const r = calculateTransferTax(imageCase({ residencePeriodMonths: 23 }), mockRates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.16, 5);
  });
  it("(A 긍정 짝) 실거주 24개월 → 40%(거주 2년 8%) — 표2 첫 칸은 유지", () => {
    const r = calculateTransferTax(imageCase({ residencePeriodMonths: 24 }), mockRates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.40, 5);
    const s = r.steps.find((x) => x.label === "장기보유특별공제");
    expect(s?.formula).toContain("보유 8년×4%=32% + 거주 2년×4%=8% = 40%");
  });
  it("(B) 상생임대 · 거주 12개월 (④→⑫→⑭) → 표2 40%(보유 11년 40%, 거주 0)", async () => {
    const b = await bodyOf(() => callTransferTaxAPI(winWinForm("12")));
    const res = await POST(req(b));
    const r = (await res.json()).data.result;
    expect(r.longTermHoldingRate).toBeCloseTo(0.40, 5);
    expect(r.longTermHoldingDeduction).toBe(80_000_000);
  });
  it("(B 긍정 짝) 거주 24개월 → 표2 48%(거주 2년 8%)는 유지", async () => {
    const b = await bodyOf(() => callTransferTaxAPI(winWinForm("24")));
    const res = await POST(req(b));
    const r = (await res.json()).data.result;
    expect(r.longTermHoldingRate).toBeCloseTo(0.48, 5);
  });
});

describe("S08-2 anchor — 정본 leaf calcLongTermRate · table2ResidencePct", () => {
  it("표2 거주분: 0·1년 = 0, 2년 8%, 3년 12%, 10년·15년 40%", () => {
    expect(table2ResidencePct(0)).toBe(0);
    expect(table2ResidencePct(1)).toBe(0);
    expect(table2ResidencePct(2)).toBe(8);
    expect(table2ResidencePct(3)).toBe(12);
    expect(table2ResidencePct(10)).toBe(40);
    expect(table2ResidencePct(15)).toBe(40);
  });
  it("calcLongTermRate 표2: 보유 3년 + 거주 1년 = 12%, 거주 2년 = 20%(보유 12 + 거주 8)", () => {
    expect(calcLongTermRate(3, 1, true)).toBeCloseTo(0.12, 10);
    expect(calcLongTermRate(3, 2, true)).toBeCloseTo(0.20, 10);
  });
  it("calcLongTermRate 표2: 보유 10년 + 거주 1년 = 40%, 거주 10년 = 80%", () => {
    expect(calcLongTermRate(10, 1, true)).toBeCloseTo(0.40, 10);
    expect(calcLongTermRate(10, 10, true)).toBeCloseTo(0.80, 10);
  });
  it("표1은 거주와 무관, 보유 3년 미만은 0", () => {
    expect(calcLongTermRate(5, 5, false)).toBeCloseTo(0.10, 10);
    expect(calcLongTermRate(2, 5, true)).toBe(0);
  });
});

describe("S08-2 anchor — §95⑤ 용도변경 혼합(L-2) 거주분도 2년 미만이면 0", () => {
  // 사례 30(비주택 4년 표1 8% + 주택 3년 표2 12% = 보유분 20%)에 상생임대 거주요건 면제로 거주 12개월만 둔다.
  const winWin = {
    winWinContractDate: new Date("2022-03-01"),
    increaseRatePct: 4,
    priorLeaseMonths: 18,
    winWinLeaseMonths: 24,
  };
  const conv = (months: number) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-01-27"),
      acquisitionPrice: 600_000_000,
      acquisitionDate: new Date("2018-02-10"),
      expenses: 7_300_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: months,
      wasRegulatedAtAcquisition: true,
      isRegulatedArea: false,
      isUnregistered: false,
      winWinRentalHouse: winWin,
      nonHousingToHousingConversion: {
        residentialUseStartDate: new Date("2022-11-25"),
        residenceMonthsTrimmed: 0,
      },
    });
  it("거주 12개월 → 보유분 20% + 거주 0 = 20%", () => {
    const r = calculateTransferTax(conv(12), mockRates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.20, 10);
  });
  it("(긍정 짝) 거주 24개월 → 20% + 8% = 28%", () => {
    const r = calculateTransferTax(conv(24), mockRates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.28, 10);
  });
});
