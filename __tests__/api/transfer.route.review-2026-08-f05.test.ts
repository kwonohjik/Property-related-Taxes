/**
 * [F05] 다건 ⑬ 공유 지분율(× ratio) 미적용 + ⑭ totalPropertyTransferPrice 미매핑 회귀 anchor
 *
 * 결함(2026-08 코드리뷰):
 *   ⑬ `lib/calc/multi-transfer-tax-api.ts`의 `buildPropertyPayload`가 `getOwnershipRatio`를
 *      import조차 하지 않아 금액 필드가 전부 폼 원값(100% 기준)으로 전송됐다. 폼 규약은
 *      「사용자 입력은 100% 기준, API 변환에서 × ratio」(`OwnershipRatioInput.tsx`)이고
 *      「공유 지분율」 칸은 다건 편집이 임베드하는 단건 Step에서 그대로 렌더된다.
 *   ⑭ `app/api/calc/transfer/multi/route.ts`가 `totalPropertyTransferPrice`를 매핑하지 않아
 *      1세대1주택 고가주택(§95③) 12억 안분의 **분모가 지분 양도가액**이 됐다.
 *
 * 안전망이 없었다: 리뷰 시점 다건 테스트에 "ownership"·"지분" 문자열이 0건이었다.
 *
 * 기대값은 전부 **엔진을 실제 호출해 관측한 값**이다.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
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

async function calc(payload: object, taxYear: number) {
  const res = await POST(
    makeRequest({
      taxYear,
      properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }],
    }),
  );
  return { status: res.status, json: await res.json() };
}

/** 토지 · 물건 전체 양도가 10억(2024-06-01) · 취득가 4억(2010-03-02) · 지분 n/d */
function landForm(numerator: string, denominator: string) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "1,000,000,000";
  form.householdHousingCount = "2";
  form.isOneHousehold = false;
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionDate: "2010-03-02",
    fixedAcquisitionPrice: "400,000,000",
    ownershipNumerator: numerator,
    ownershipDenominator: denominator,
  };
  return form;
}

describe("[F05] 다건 공유 지분율 — ⑬ × ratio", () => {
  it("F05-1: 지분 50%면 금액 필드가 × 0.5로 축소되고 ownershipRatio·총 물건가가 실린다", () => {
    const payload = buildPropertyPayload(landForm("50", "100")) as Record<string, unknown>;
    expect(payload.transferPrice).toBe(500_000_000);
    expect(payload.acquisitionPrice).toBe(200_000_000);
    // 개산공제(§163⑥) base 축소용 — 기준시가는 raw 유지하고 이 비율만 넘긴다.
    expect(payload.ownershipRatio).toBe(0.5);
    // 12억 안분 분모용 총 물건 양도가액 (지분 모드 전용)
    expect(payload.totalPropertyTransferPrice).toBe(1_000_000_000);
  });

  it("F05-2: 단독 소유(100/100)는 완전 no-op — 축소도 신규 키도 없다", () => {
    const payload = buildPropertyPayload(landForm("100", "100")) as Record<string, unknown>;
    expect(payload.transferPrice).toBe(1_000_000_000);
    expect(payload.acquisitionPrice).toBe(400_000_000);
    expect(payload.ownershipRatio).toBeUndefined();
    expect(payload.totalPropertyTransferPrice).toBeUndefined();
  });

  it("F05-3: 지분 50% 세액 — 100% 기준 과세가 아니라 지분 기준 과세", async () => {
    const half = await calc(buildPropertyPayload(landForm("50", "100")), 2024);
    expect(half.status).toBe(200);
    // 수정 전(원값 그대로 전송)에는 145,860,000 / 160,446,000이 나왔다.
    expect(half.json.data.determinedTax).toBe(61_190_000);
    expect(half.json.data.localIncomeTax).toBe(6_119_000);
    expect(half.json.data.totalTax).toBe(67_309_000);

    // 단독 소유(100%)는 종전과 동일한 값을 유지한다 — 이 수정이 비-지분 폼에 무해함의 증거.
    const whole = await calc(buildPropertyPayload(landForm("100", "100")), 2024);
    expect(whole.status).toBe(200);
    expect(whole.json.data.determinedTax).toBe(145_860_000);
    expect(whole.json.data.totalTax).toBe(160_446_000);
  });
});

describe("[F05] 다건 ⑭ totalPropertyTransferPrice — §95③ 12억 안분 분모", () => {
  /** 주택 · 1세대1주택 · 물건 전체 20억 · 지분 50% · 취득 8억(2014-01-01) · 거주 120개월 */
  function highPriceHouseForm() {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-03-01";
    form.contractTotalPrice = "2,000,000,000";
    form.householdHousingCount = "1";
    form.isOneHousehold = true;
    form.isRegulatedArea = false;
    form.residencePeriodMonths = "120";
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "housing",
      acquisitionDate: "2014-01-01",
      fixedAcquisitionPrice: "800,000,000",
      ownershipNumerator: "50",
      ownershipDenominator: "100",
    };
    return form;
  }

  it("F05-4: 분모가 총 물건가(20억)라 12억 초과분이 과세된다", async () => {
    const payload = buildPropertyPayload(highPriceHouseForm()) as Record<string, unknown>;
    expect(payload.transferPrice).toBe(1_000_000_000);
    expect(payload.totalPropertyTransferPrice).toBe(2_000_000_000);

    const r = await calc(payload, 2026);
    expect(r.status).toBe(200);
    expect(r.json.data.totalTransferGain).toBe(600_000_000);
    expect(r.json.data.determinedTax).toBe(48_422_000);
    expect(r.json.data.totalTax).toBe(53_264_200);
  });

  it("F05-5: 총 물건가를 떼면 지분 양도가(10억) < 12억이라 전액 비과세로 무너진다", async () => {
    // ⑭ 매핑 누락(또는 ⑬ 미전송)이 만드는 상태를 명시적으로 재현한다.
    const stripped = buildPropertyPayload(highPriceHouseForm()) as Record<string, unknown>;
    delete stripped.totalPropertyTransferPrice;

    const r = await calc(stripped, 2026);
    expect(r.status).toBe(200);
    expect(r.json.data.totalTransferGain).toBe(0);
    expect(r.json.data.totalTax).toBe(0);
  });
});
