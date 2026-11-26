/**
 * anchor — F-3 가업상속공제적용률 법정량(`fbRateBasis`)이 화면 → ④ → ⑫ Zod → ⑭ route → 엔진까지 살아 도착한다.
 *
 * ⑫는 TypeScript가 감지하지 못한다 — Zod 객체 정의에 `fbRateBasis`가 없으면 route가 조용히 떼어 내고
 * 엔진은 소수 6자리 basis로 돌아간다(의제 취득가액 +268원). 이 anchor가 그 stripping을 잡는다.
 * ⑧(validateStep)과 ⑫(superRefine)는 같은 술어(`familyBusinessRateBasisError`)·같은 문구로 막는다.
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §5
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

/** 상속 토지 · 피상속인 2억 · 평가 10억 · 공제 400억 ÷ 가업상속 재산가액 1,200억(= 1/3) */
function fbForm(fbOver: Record<string, unknown> = {}) {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2026-01-01";
  form.contractTotalPrice = "2,000,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2024-01-01",
    inheritanceStartDate: "2024-01-01",
    fixedAcquisitionPrice: "1,000,000,000",
    inheritanceAssetKind: "land",
    publishedValueAtInheritance: "1,000,000,000",
    decedentAcquisitionDate: "2005-01-01",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 200_000_000,
      inheritanceMarketValue: 1_000_000_000,
      fbDeductionAppliedRate: 40_000_000_000 / 120_000_000_000,
      inheritanceDate: "2024-01-01",
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 120_000_000_000 },
      ...fbOver,
    },
  };
  return form;
}

async function captureBody(form: ReturnType<typeof fbForm>) {
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

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** 응답 어딘가의 familyBusinessDetail (단건 응답 모양에 묶이지 않도록 재귀 탐색) */
function findFbDetail(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  const o = node as Record<string, unknown>;
  if (o.familyBusinessDetail && typeof o.familyBusinessDetail === "object") return o.familyBusinessDetail as Record<string, unknown>;
  for (const v of Object.values(o)) {
    const hit = findFbDetail(v);
    if (hit) return hit;
  }
  return undefined;
}

describe("F-3 route — fbRateBasis ④⑬ → ⑫ → ⑭ → 엔진", () => {
  it("④가 법정량을 싣고, route를 지나 엔진이 분수로 곱한다 — 의제 취득가액 733,333,332 (6자리 basis면 733,333,600)", async () => {
    const form = fbForm();
    expect(validateStep(0, form) ?? "").not.toMatch(/가업상속공제 —/);
    const body = await captureBody(form);
    expect(JSON.stringify(body)).toContain('"fbRateBasis":{"kind":"deduction_ratio","deductionAmount":40000000000,"businessEstateValue":120000000000}');

    const { status, json } = await post(body);
    expect(status).toBe(200);
    const detail = findFbDetail(json);
    expect(detail?.imputedAcquisitionPrice).toBe(733_333_332);
    expect(detail?.appliedRateBasis).toEqual({ kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 120_000_000_000 });
  });

  it("법정량 없이 % 입력만 있으면 종전 경로 — 733,333,600", async () => {
    const form = fbForm({ fbRateBasis: undefined });
    const { status, json } = await post(await captureBody(form));
    expect(status).toBe(200);
    expect(findFbDetail(json)?.imputedAcquisitionPrice).toBe(733_333_600);
  });

  it("적용률과 법정량이 다르면 ⑧·⑫가 같은 문구로 막는다", async () => {
    const form = fbForm({ fbDeductionAppliedRate: 0.333333 });
    const msg = "적용률이 입력한 금액으로 계산한 비율과 다릅니다";
    expect(validateStep(0, form)).toMatch(msg);
    const { status, json } = await post(await captureBody(form));
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain(msg);
  });

  it("가업상속 재산가액 0 → ⑧·⑫ 차단", async () => {
    const form = fbForm({ fbDeductionAppliedRate: 0, fbRateBasis: { kind: "deduction_ratio", deductionAmount: 0, businessEstateValue: 0 } });
    expect(validateStep(0, form)).toMatch("가업상속 재산가액을 입력하세요");
    const { status, json } = await post(await captureBody(form));
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain("가업상속 재산가액을 입력하세요");
  });

  it("부동산은 법인 ③2호 법정량을 받지 않는다 — ⑫ 400", async () => {
    const body = await captureBody(fbForm());
    const raw = JSON.stringify(body).replace(
      '"fbRateBasis":{"kind":"deduction_ratio","deductionAmount":40000000000,"businessEstateValue":120000000000}',
      '"fbRateBasis":{"kind":"corporate_business_assets","totalAssets":5000000000,"nonBusinessAssets":1000000000}',
    );
    expect(raw).not.toEqual(JSON.stringify(body));
    const { status } = await post(JSON.parse(raw));
    expect(status).toBe(400);
  });
});
