/**
 * [F02] 다건 route ⑭ — 매매사례가액 추계(소득령 §176의2③1호) 침묵 stripping 회귀 anchor
 *
 * 결함(2026-08 코드리뷰): `app/api/calc/transfer/multi/route.ts`의 인라인 96키 매핑이
 *   형제 모드인 `acquisitionMethod`·`appraisalValue`는 옮기면서 `similarSalesValue`만 빠뜨렸다.
 *   ⑫Zod(`transfer-tax-schema.ts` propertyBaseShape)는 수락하고 ⑬(`multi-transfer-tax-api.ts`)은
 *   실제로 전송하므로 전형적 침묵 stripping이다.
 *
 *   엔진(`transfer-tax-helpers.ts`)은 salesCase에서 `similarSalesValue ?? acquisitionPrice`를 쓰는데
 *   ⑬이 salesCase일 때 acquisitionPrice=0을 보내므로, 매핑이 빠지면 **취득가액이 통째로 0**이 된다.
 *
 * 안전망이 없었다: 리뷰 시점에 다건 route를 import하는 테스트가 0건이었다.
 *
 * 기대값은 전부 **엔진을 실제 호출해 관측한 값**이다(산식 추론 아님).
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  // 빈 Map을 돌려주면 route가 loadFallbackTransferRates로 후퇴한다 → 환경 무관 결정성 확보.
  return { ...actual, preloadTaxRates: vi.fn().mockResolvedValue(new Map()) };
});

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 15,
    remaining: 14,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/multi/route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 토지 · 양도가 10억(2025-06-01) · 매매사례가액 6억 · 취득 2015-06-01 · 1세대1주택 아님 */
function salesCaseLandForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2025-06-01";
  form.contractTotalPrice = "1,000,000,000";
  form.householdHousingCount = "2";
  form.isOneHousehold = false;
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionDate: "2015-06-01",
    isSalesCaseAcquisition: true,
    similarSalesValue: "600,000,000",
  };
  return form;
}

describe("[F02] 다건 매매사례가액 추계 — ⑬→⑭ 도달", () => {
  it("F02-1: ⑬ payload가 similarSalesValue를 싣는다 (선재 동작 고정)", () => {
    const payload = buildPropertyPayload(salesCaseLandForm()) as Record<string, unknown>;
    expect(payload.acquisitionMethod).toBe("salesCase");
    expect(payload.similarSalesValue).toBe(600_000_000);
    // salesCase는 acquisitionPrice를 0으로 보낸다 — 그래서 ⑭ 누락이 곧 취득가액 0이 된다.
    expect(payload.acquisitionPrice).toBe(0);
  });

  it("F02-2: ⑭ route가 매핑해 취득가액 6억이 엔진에 도달한다", async () => {
    const payload = buildPropertyPayload(salesCaseLandForm());
    const res = await POST(
      makeRequest({
        taxYear: 2025,
        properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }],
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();

    // 양도가 10억 − 매매사례가액 6억 = 양도차익 4억.
    // ⑭ 매핑이 빠지면 취득가액 0 → 양도차익 10억(관측값 1,000,000,000)이 된다.
    expect(data.totalTransferGain).toBe(400_000_000);
    expect(data.determinedTax).toBe(104_260_000);
    expect(data.localIncomeTax).toBe(10_426_000);
    expect(data.totalTax).toBe(114_686_000);
  });

  it("F02-3: 동일 취득가액을 실지거래가(actual)로 넣은 대조군과 세액이 일치한다", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2025-06-01";
    form.contractTotalPrice = "1,000,000,000";
    form.householdHousingCount = "2";
    form.isOneHousehold = false;
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "land",
      acquisitionDate: "2015-06-01",
      fixedAcquisitionPrice: "600,000,000",
    };
    const res = await POST(
      makeRequest({
        taxYear: 2025,
        properties: [{ propertyId: "p1", propertyLabel: "건1", ...buildPropertyPayload(form) }],
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.totalTransferGain).toBe(400_000_000);
    expect(data.determinedTax).toBe(104_260_000);
    expect(data.totalTax).toBe(114_686_000);
  });
});
