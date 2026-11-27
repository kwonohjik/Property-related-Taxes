/**
 * U-01 (비상장주식 리뷰 2026-11-28 · blocker) — 정식평가(V2) 카드의 숨은 간편평가(V1) 기본값(0주)이
 * 상속·증여 계산 전체를 ⑫ 400으로 막던 경로를 실제 route로 잰다.
 *
 * 화면: 주식 추가 → 비상장 새 카드는 V1 {totalShares:0, ownedShares:0} → 「정식평가」로 바꾸면 V2만 추가되고
 * V1은 남는다(정식평가 화면엔 그 칸이 없다). ④ resolveActiveUnlistedValuation이 formal 명시 항목의 V1을 뺀다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as INH } from "@/app/api/calc/inheritance/route";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

async function post(body: unknown) {
  const res = await INH(
    new NextRequest("http://localhost/api/calc/inheritance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

const H = { id: "h1", relation: "child", name: "자녀", birthDate: "1980-01-01" };

/** 정식평가 카드 — V2 완전 입력 + 숨은 V1 기본값 0주 (StockValuationForm.handleAdd 기본값) */
const formalCard = {
  id: "s1",
  category: "unlisted_stock",
  name: "㈜비상장",
  unlistedValuationMode: "formal",
  unlistedStockData: { totalShares: 0, ownedShares: 0, weightedNetIncome: 0, netAssetValue: 0, capitalizationRate: 0.1 },
  unlistedStockValuationV2: {
    corpName: "㈜비상장",
    businessStartDate: "2000-01-01",
    evaluationDate: "2026-06-01",
    faceValuePerShare: 5_000,
    totalShares: 10_000,
    ownedShares: 5_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2025", fiscalYearEndDate: "2025-12-31", taxableIncome: 100_000_000 },
      { fiscalYearLabel: "2024", fiscalYearEndDate: "2024-12-31", taxableIncome: 100_000_000 },
      { fiscalYearLabel: "2023", fiscalYearEndDate: "2023-12-31", taxableIncome: 100_000_000 },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 500_000_000, assetValuationDelta: 0,
      corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
      prepaidExpenses: 0, preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 0, corporateTaxPayable: 0,
      farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
      retirementProvision: 0, otherProvision: 0,
      reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "large",
  },
} as unknown as EstateItem;

const body = (item: EstateItem) => ({
  decedentType: "resident",
  deathDate: "2026-06-01",
  estateItems: [{ id: "e1", category: "cash", name: "현금", marketValue: 1e9 }, item],
  preGiftsWithin10Years: [],
  heirs: [H],
  deductionInput: { heirs: [H] },
  creditInput: { isFiledOnTime: true },
});

describe("U-01 — 정식평가 + 숨은 V1 0주 → 상속세 route", () => {
  it("종전 body(V1 잔존): 400 · unlistedStockData.totalShares", async () => {
    const r = await post(body(formalCard));
    expect(r.status).toBe(400);
    const paths = (r.json.issues ?? []).map((i: { path: string[] }) => i.path.join("."));
    expect(paths.some((p: string) => p.endsWith("unlistedStockData.totalShares"))).toBe(true);
  });

  it("④ strip 후: 200 · V2 평가액이 과세가액에 들어간다", async () => {
    const r = await post(body(resolveActiveUnlistedValuation(formalCard)));
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.json.result.finalTax).toBeGreaterThan(0);
  });
});
