/**
 * anchor — 다건(연간합산) **비주택 → 주택 용도변경** 배관 (§95⑤·⑥ · 시행령 §154⑤ 단서)
 *
 * ## 무엇이 끊겨 있었나
 *
 * 입력 위젯은 **자산 카드**에 있다(`AssetSectionBasic`·`AssetSectionAcquisition` →
 * `NonHousingConversionSection`). 다건 마법사도 같은 자산 카드를 쓰므로 화면에는 뜨고
 * `asset.residentialUseStartDate`에 저장된다. ⑫ Zod 도 이 키를 수락하고
 * (`transfer-tax-schema-refines.ts:36`) 엔진은 두 곳에서 **세액에 쓴다**:
 *
 * · `transfer-tax-lthd.ts:291` — 장기보유특별공제 기간 분할
 * · `transfer-tax-exemption-requirements.ts:272·350·419` — 1세대1주택 보유·거주 기산
 *
 * 그런데 **⑬·⑭ 두 층이 모두 비어 있었다** — P1-02(분양권)와 같은 형태다:
 *
 * | 층 | 단건 | 다건(종전) |
 * |---|---|---|
 * | ⑬ payload | `transfer-tax-api.ts:463` | **키 자체가 없음** |
 * | ⑭ route → 엔진 | `engine-input.ts:80` | **매핑 없음** |
 *
 * ⇒ 같은 자산이 단건과 다건에서 **다른 세액**이 됐다.
 *
 * ## 🔑 키만 넣으면 더 나빠진다 — 거주기간 클램프가 짝이다
 *
 * §95⑤2호는 「**주택으로 보유한 기간 중**의 거주기간」만 산입한다. 단건은
 * `clampResidenceToHousingPeriod`로 잘라내는데 다건은 전 구간을 합산하고 있었다.
 * 용도변경만 켜고 미클램프 거주기간을 함께 보내면 **비과세 요건이 과다 충족**된다.
 * 그래서 두 leaf 를 함께 옮긴다.
 *
 * ⚠️ `deriveResidencePeriodMonths`(클램프 내부가 부르는 것)는 종전 다건 인라인 식과
 *    **문자 그대로 같다** — 용도변경 OFF 일 때 동작 변화는 0이다(C-3 가 고정).
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

/** 상가로 취득 → 2019-01-01 주거용 전환 → 2026 양도. 거주는 전환 **이전부터** 있었다. */
function conversionForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-06-01";
  form.contractTotalPrice = "1,500,000,000";
  form.isOneHousehold = true;
  form.householdHousingCount = "1";
  form.residencePeriodMonths = "0";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionDate: "2010-01-10",
    fixedAcquisitionPrice: "700,000,000",
    hasNonHousingConversion: true,
    residentialUseStartDate: "2019-01-01",
    // 전환 «이전»부터 거주 — §95⑤2호가 잘라내야 하는 구간이 포함된다.
    residenceInputMode: "interval",
    residencePeriods: [{ moveInDate: "2012-03-01", moveOutDate: "2026-05-01" }],
  };
  return form;
}

describe("[MUC-A] ⑬ buildPropertyPayload — 용도변경 키", () => {
  it("A-1: 용도변경 ON 이면 키를 싣는다 (종전에는 hasOwnProperty 자체가 false)", () => {
    const payload = buildPropertyPayload(conversionForm()) as Record<string, unknown>;
    expect(
      Object.prototype.hasOwnProperty.call(payload, "nonHousingToHousingConversion"),
      "⑬이 키를 만들지 않는다 — ⑫가 받아도 아무도 보내지 않으면 조용히 무시된다",
    ).toBe(true);
    const conv = payload.nonHousingToHousingConversion as Record<string, unknown>;
    expect(conv.residentialUseStartDate).toBe("2019-01-01");
  });

  it("A-2: §95⑤2호 — 거주기간이 «주거 전환 이후»로 잘린다", () => {
    const payload = buildPropertyPayload(conversionForm()) as Record<string, unknown>;
    const conv = payload.nonHousingToHousingConversion as { residenceMonthsTrimmed: number };
    // 2012-03 ~ 2019-01 구간이 잘려야 한다.
    expect(conv.residenceMonthsTrimmed).toBeGreaterThan(0);
    // 잘린 뒤 거주기간은 전환일~퇴거일(2019-01 ~ 2026-05 ≈ 88개월) 범위다.
    const months = payload.residencePeriodMonths as number;
    expect(months).toBeGreaterThan(80);
    expect(months).toBeLessThan(95);
  });

  it("A-3: 대조군 — 용도변경 OFF 면 키를 만들지 않고 거주기간도 종전 그대로다", () => {
    const form = conversionForm();
    form.assets[0] = {
      ...form.assets[0],
      hasNonHousingConversion: false,
      residentialUseStartDate: "",
    };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.nonHousingToHousingConversion).toBeUndefined();
    // 전 구간 합산(2012-03 ~ 2026-05 ≈ 170개월) — 클램프 도입 전과 같아야 한다.
    expect(payload.residencePeriodMonths as number).toBeGreaterThan(160);
  });
});

describe("[MUC-B] ⑭ multi route → 엔진 — 세액으로 관측", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });

  /**
   * 상가 취득(2019) → 주거 전환(2022) → 2026 양도. 고가주택이라 §95⑤ LTHD 분할이 세액에 닿는다.
   *
   * ⚠️ **격자를 잘못 잡으면 이 anchor 는 구별력이 0이 된다.** 처음에 2010 취득으로 잡았더니
   *    보유 16년이라 양쪽 다 §95⑤1호 **단서 40% 한도**에 걸려 세액이 같았다 — 배선이 없어서가
   *    아니라 한도가 차이를 삼킨 것이었다([[feedback_mutation_zero_discrimination_is_not_proof]]).
   *    보유 7년으로 줄여 한도가 걸리지 않게 한다:
   *      · 용도변경 없음 — 표2 보유 7년 × 4% = 28%
   *      · 용도변경 있음 — 표1 3년 × 2% + 표2 4년 × 4% = 6% + 16% = 22%
   */
  const prop = (over: object = {}) => ({
    propertyId: "h1",
    propertyLabel: "h1",
    propertyType: "housing" as const,
    transferDate: "2026-06-01",
    acquisitionDate: "2019-01-10",
    transferPrice: 2_000_000_000,
    acquisitionPrice: 700_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    residencePeriodMonths: 50,
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

  it("B-1: 용도변경을 보내면 세액이 달라진다 (§95⑤ LTHD 분할이 엔진에 도달)", async () => {
    const without = await call([prop()]);
    const withConv = await call([
      prop({
        nonHousingToHousingConversion: {
          residentialUseStartDate: "2022-01-01",
          residenceMonthsTrimmed: 0,
        },
      }),
    ]);
    expect(
      withConv.determinedTax,
      "⑭ 매핑이 없으면 두 세액이 같다 — 엔진에 도달하지 않았다는 뜻",
    ).not.toBe(without.determinedTax);
  });
});
