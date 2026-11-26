/**
 * anchor — 가업상속공제 자산 §95④ 후단 부분별 양도차익 장특이 화면 → ⑧ → ④ → ⑫ Zod → ⑭ route → 엔진 → 응답까지 살아 도착한다.
 *
 * 교재(이월과세5 — 사용자 확인) S1: 乙 2012.3.8. 5억 취득 → 2022.4.10. 상속(평가 15억 · 적용률 70%) → 2026.10.15. 18억 양도 · 양도비 3천만.
 *   기대(손계산): 적용분 889,000,000 × 28% + 비적용분 81,000,000 × 8% = 장특 255,400,000 · 과세표준 712,100,000 · 산출세액 263,142,000.
 * 새 입력 필드가 없으므로(계획서 §5.1) ⑫ stripping 위험은 입력 쪽이 아니라 **응답 echo(`fbLthdDetail`)가 route에서 잘리지 않는가**다(V-7).
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md §5·§10 V-7
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

function textbookForm() {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2026-10-15";
  form.contractTotalPrice = "1,800,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2022-04-10",
    inheritanceStartDate: "2022-04-10",
    fixedAcquisitionPrice: "1,500,000,000",
    inheritanceAssetKind: "land",
    publishedValueAtInheritance: "1,500,000,000",
    decedentAcquisitionDate: "2012-03-08",
    transferExpense: "30,000,000",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 500_000_000,
      inheritanceMarketValue: 1_500_000_000,
      fbDeductionAppliedRate: 0.7,
      inheritanceDate: "2022-04-10",
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
    },
  };
  return form;
}

async function captureBody(form: ReturnType<typeof textbookForm>) {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  return captured;
}

/** 응답 트리에서 키를 재귀 탐색 (단건 응답 모양에 묶이지 않도록) */
function find(node: unknown, key: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  const o = node as Record<string, unknown>;
  if (key in o && o[key] !== undefined) return o[key];
  for (const v of Object.values(o)) {
    const hit = find(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

describe("교재 S1 — ⑧ → ④ → route → 엔진 → 응답", () => {
  it("장특 255,400,000 · 과세표준 712,100,000 · 산출세액 263,142,000 · fbLthdDetail echo가 응답까지 도착", async () => {
    const form = textbookForm();
    expect(validateStep(0, form) ?? "").not.toMatch(/가업상속공제 —/);
    const body = await captureBody(form);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(find(json, "longTermHoldingDeduction")).toBe(255_400_000);
    expect(find(json, "taxBase")).toBe(712_100_000);
    expect(find(json, "calculatedTax")).toBe(263_142_000);
    const detail = find(json, "fbLthdDetail") as Record<string, Record<string, number>> & { basis: string };
    expect(detail.basis).toBe("slice_gain");
    expect(detail.decedentSlice.gain).toBe(889_000_000);
    expect(detail.decedentSlice.deduction).toBe(248_920_000);
    expect(detail.heirSlice.gain).toBe(81_000_000);
    expect(detail.heirSlice.deduction).toBe(6_480_000);
    expect((find(json, "familyBusinessDetail") as { creditAmount: number }).creditAmount).toBe(204_004_000);
  });
});
