/**
 * S05-1 anchor — §156의2⑧⑨ 합가 예외가 합가(혼인)일 「이전」 양도에도 성립하는가.
 * 경로: 판정 메뉴(⑧ → ④ → route) + 계산기(⑧ collectStepIssues → ④ callTransferTaxAPI → route ⑫⑭).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2026-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const RIGHT = { id: "R", type: "redevelopment_right", memberOrigin: "successor", acquisitionDate: "2020-01-01", region: "non_capital" };

function jform(over: Record<string, unknown>) {
  return {
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "60" },
    houses: [],
    presaleRights: [RIGHT],
    rightThreeYearExceptionKind: "none",
    isFirstTransferredInMerge: true,
    mergedHouseholdFirstHouseKind: "house_only",
    ...over,
  };
}

function cform(over: Partial<TransferFormData>): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2026-06-01",
    isOneHousehold: true,
    contractTotalPrice: "800000000",
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    presaleRights: [RIGHT],
    rightThreeYearExceptionKind: "none",
    isFirstTransferredInMerge: true,
    mergedHouseholdFirstHouseKind: "house_only",
    ...over,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    actualSalePrice: "800000000",
    fixedAcquisitionPrice: "300000000",
    addressJibun: "부산광역시 테스트구 1",
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "60",
  });
  return f;
}

describe("S05-1 — 합가(혼인)일 전 양도에는 §156의2⑧⑨ 불성립", () => {
  it("판정 메뉴: 혼인 2026-09-01 > 양도 2026-06-01 → §89② 배제(3년 예외 없음) → 과세", async () => {
    const r = await observeRaw(mkCase("2026-10-10", jform({ marriageDate: "2026-09-01" })));
    expect(r.issues.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.j.article89Clause2?.status).not.toBe("exception_met");
    expect(r.j.isExempt).toBe(false);
  });
  it("판정 메뉴: 동거봉양 합가 2026-09-01 > 양도 → 과세", async () => {
    const r = await observeRaw(mkCase("2026-10-10", jform({ parentalCareMergeDate: "2026-09-01" })));
    expect(r.j.isExempt).toBe(false);
  });
  it("계산기: 합가 전 양도는 합가 없음과 같은 세액(60,621,000)", async () => {
    const r = await runCalc(cform({ marriageDate: "2026-09-01" } as Partial<TransferFormData>));
    expect(r.issues).toEqual([]);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(60_621_000);
  });
  it("긍정 짝: 혼인 2025-09-01(양도 전) → ⑨2호 성립 비과세", async () => {
    const r = await observeRaw(mkCase("2026-10-10", jform({ marriageDate: "2025-09-01" })));
    expect(r.j.isExempt).toBe(true);
  });

  it("경계 — 혼인일 = 양도일(같은 날)은 하한을 통과한다(성립)", async () => {
    const r = await observeRaw(mkCase("2026-10-10", jform({ marriageDate: "2026-06-01" })));
    expect(r.j.isExempt).toBe(true);
  });
  it("경계 — 혼인일 = 양도일 + 1일은 합가 전 양도라 불성립", async () => {
    const r = await observeRaw(mkCase("2026-10-10", jform({ marriageDate: "2026-06-02" })));
    expect(r.j.isExempt).toBe(false);
  });
  it("계산기 긍정 짝: 혼인 2025-09-01(양도 전) → 비과세", async () => {
    const r = await runCalc(cform({ marriageDate: "2025-09-01" } as Partial<TransferFormData>));
    expect(r.issues).toEqual([]);
    expect(r.isExempt).toBe(true);
  });
});
