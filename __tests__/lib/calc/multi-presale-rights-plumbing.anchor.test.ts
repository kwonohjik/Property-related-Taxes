/**
 * Pre-Do anchor — 다건(연간합산) 세대 보유 분양권·입주권 배관 (P1-02)
 *
 * ## 무엇이 끊겨 있었나
 *
 * 다건 마법사는 단건 마법사(`TransferTaxCalculator`)를 **그대로 임베드**하므로 Step4의
 * 「분양권·입주권」 위젯이 화면에 뜨고 `form.presaleRights`에 저장된다. ⑫ Zod(`propertyBaseShape`)도
 * 이 키를 수락한다. 그런데 **⑬·⑭ 두 층이 모두 비어 있었다**:
 *
 * | 층 | 단건 | 다건(종전) |
 * |---|---|---|
 * | ⑬ payload | `transfer-tax-api.ts:86` `presaleRightsPayload` | **키 자체가 없음** |
 * | ⑭ route → 엔진 | `engine-input.ts:163` | **매핑 없음** |
 *
 * 한쪽만 고치면 도달하지 않으므로 **두 층을 같은 PR에서** 배선한다.
 *
 * ## 조문
 *
 * · 「소득세법」 §104⑦2호 — 조정대상지역 주택으로서 「1세대가 1주택과 조합원입주권 또는 분양권을
 *   **1개** 보유한 경우의 해당 주택」 → §55① 세율 + 20%p.
 * · 같은 항 4호 — 「주택과 조합원입주권 또는 분양권을 보유한 경우로서 그 수의 **합이 3 이상**」 → +30%p.
 * · 「소득세법 시행령」 §167의11②1호 — 산입 제외는 「수도권·광역시·특별자치시 외 지역 + 3억 이하」.
 *
 * ## 안전망 실측 (수정 전)
 *
 * `__tests__/lib/calc/multi-transfer-api-sync.test.ts`의 `presaleRights` 언급 **0건**.
 * 다건 경로에서 이 축을 보는 테스트가 하나도 없었다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRatesWithHouseEngine } from "../../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

/** 조정대상지역 주택 1채 + 세대 보유 분양권 1개(2022-02-01 취득 · 수도권). */
function housingFormWithPresaleRight() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-06-01"; // 중과 한시배제 종료(2026-05-09) 이후
  form.contractTotalPrice = "1,500,000,000";
  form.isOneHousehold = true;
  form.householdHousingCount = "1";
  form.presaleRights = [
    {
      id: "pr1",
      type: "presale_right",
      acquisitionDate: "2022-02-01",
      region: "capital",
    },
  ];
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-10",
    fixedAcquisitionPrice: "700,000,000",
  };
  return form;
}

describe("P1-02 · 다건 세대 보유 분양권·입주권 배관", () => {
  it("P1-02-01: ⑬ buildPropertyPayload가 presaleRights를 싣는다", () => {
    const payload = buildPropertyPayload(housingFormWithPresaleRight()) as Record<string, unknown>;
    // 종전에는 hasOwnProperty 자체가 false였다.
    expect(Object.prototype.hasOwnProperty.call(payload, "presaleRights")).toBe(true);
    const rights = payload.presaleRights as Array<Record<string, unknown>>;
    expect(rights).toHaveLength(1);
    expect(rights[0].type).toBe("presale_right");
    expect(rights[0].acquisitionDate).toBe("2022-02-01");
  });

  it("P1-02-02: ⑬ 취득일 미입력분은 제외한다 (단건과 동일 규칙)", () => {
    const form = housingFormWithPresaleRight();
    form.presaleRights = [
      ...form.presaleRights,
      { id: "pr2", type: "redevelopment_right", acquisitionDate: "", region: "capital" },
    ];
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.presaleRights as unknown[]).toHaveLength(1);
  });

  it("P1-02-03: ⑬ 주택류가 아니면 보내지 않는다 (단건 게이트와 동일)", () => {
    const form = housingFormWithPresaleRight();
    form.assets[0] = { ...form.assets[0], assetKind: "land" };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.presaleRights).toBeUndefined();
  });

  it("P1-02-04: ⑬ 목록이 비면 키를 만들지 않는다", () => {
    const form = housingFormWithPresaleRight();
    form.presaleRights = [];
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.presaleRights).toBeUndefined();
  });
});

/** ⑭ — route가 presaleRights를 엔진에 매핑하는가 (세액으로 관측). */
describe("P1-02 · ⑭ multi route → 엔진 매핑", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });

  const houseProperty = (over: object = {}) => ({
    propertyId: "h1",
    propertyLabel: "h1",
    propertyType: "housing" as const,
    transferDate: "2026-06-01",
    acquisitionDate: "2015-01-10",
    transferPrice: 1_500_000_000,
    acquisitionPrice: 700_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    residencePeriodMonths: 0,
    houses: [
      {
        id: "selling",
        region: "capital" as const,
        acquisitionDate: "2015-01-10",
        officialPrice: 0,
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
    sellingHouseId: "selling",
    ...over,
  });

  async function call(properties: object[]) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: 2026, annualBasicDeductionUsed: 0, properties }),
      }),
    );
    expect(res.status).toBe(200);
    return (await res.json()).data as { determinedTax: number };
  }

  it("P1-02-05: 분양권 1개를 보내면 세액이 달라진다 (§104⑦2호 도달)", async () => {
    const without = await call([houseProperty()]);
    const withRight = await call([
      houseProperty({
        presaleRights: [
          {
            id: "pr1",
            type: "presale_right",
            acquisitionDate: "2022-02-01",
            region: "capital",
          },
        ],
      }),
    ]);
    // 종전에는 ⑭ 매핑이 없어 두 값이 **완전히 같았다**(침묵 소실).
    expect(withRight.determinedTax).not.toBe(without.determinedTax);
    expect(withRight.determinedTax).toBeGreaterThan(without.determinedTax);
  });
});
