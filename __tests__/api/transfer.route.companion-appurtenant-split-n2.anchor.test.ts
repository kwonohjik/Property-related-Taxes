/**
 * anchor — **컴패니언 주택부수토지 배율초과 분리**(영 §167의5) N-2.
 *
 * 계획서: `docs/00-pm/transfer-f16-spinoff-items.plan.md` §N-2
 *
 * ## 결함 (수정 전 실측)
 *
 * `resolveCompanionSplit`(`bundled-split-helpers.ts`)이 `landNature`를 **이미 확인해 놓고도**
 * `resolveCompanionLandRate`에 넘기지 않아, 수신부(`appurtenant-land-rate.ts`)가 그 필드를 보고
 * **항상 `applied: false`**를 반환했다 ⇒ `splitCompanionIntoTwo`가 한 번도 실행되지 않았다.
 *
 * 결과: 배율 **초과분에도 주택 세율이 그대로** 붙었다. 엔진(`appurtenant-land-rate.ts`)은
 * `excessRate`·`limitArea`·`excessArea`를 반환하며 주석으로 「route 레이어에서 별도 자산 분리」를
 * **명시적으로 기대**하는데, 그 route 분리가 죽어 있었다(`excessRate`는 저장소 전체에서 **미소비**).
 *
 * ## 법령
 *
 * - 영 §167의5 — 「해당 주택이 정착된 면적에 지역별 배율을 곱하여 산정한 면적 **이내**의 토지」.
 *   **면적 범위 정의뿐이고 안분 명문은 없다**(2026-08-23 verbatim 확인).
 * - 법 §100② 후문의 「공통되는 취득가액과 양도비용」 안분은 **토지·건물 축 + 가액 구분 불분명**이
 *   요건이라 이 축(한 필지를 면적 한도로 나눔)에는 직접 미치지 않는다.
 * - ⇒ 배분 키는 **면적 비율**이다. 형제 경로(겸용주택)가 이미 같은 규칙을 쓴다 —
 *   `transfer-tax-mixed-use-helpers.ts` `calcExcessLandRatio`(`excessArea / residentialLandArea`).
 *   조심 2024서2826도 647㎡ 중 222.83㎡에 초과분 세율을 적용해 **면적 기준 분리를 전제**한다.
 *
 * ## 픽스처
 *
 *   primary 주택 — 정착면적 100㎡ · 수도권 주거지역(3배) ⇒ 부수토지 한도 **300㎡**
 *   companion 토지 500㎡ ⇒ 한도 내 300㎡(60%) / 초과 200㎡(40%)
 *   양도일 2024-06-01 · 일괄양도(총액 2,000,000,000 · 안분 기준시가 900,000,000)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const primary = (acqDate: string) => ({
  propertyType: "housing" as const,
  transferPrice: 1_000_000_000,
  transferDate: "2024-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: acqDate,
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  buildingFootprintArea: 100,
  isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential" as const,
  totalSalePrice: 2_000_000_000,
  standardPriceAtTransferForApportion: 900_000_000,
});

const companion = (over: object = {}) => ({
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land" as const,
  landNature: "appurtenant_to_housing" as const,
  acquisitionCause: "purchase" as const,
  acquisitionDate: "2012-06-01",
  fixedAcquisitionPrice: 200_000_000,
  standardPriceAtTransfer: 300_000_000,
  directExpenses: 0,
  isOneHousehold: false,
  /** 500㎡ — 한도 300㎡ 대비 200㎡ 초과. 이 값이 없으면 split 진입 조건 자체가 불충족이다. */
  areaM2: 500,
  reductions: [] as unknown[],
});

/** 증여 2022-05-01 — 양도(2024-06-01)까지 2년 1개월이라 §97의2 적용기간 **이내**. */
const CARRYOVER = {
  giftRegistryDate: "2022-05-01",
  donorAcquisitionDate: "2005-03-01",
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 20_000_000,
  giftDateValuation: 250_000_000,
  exclusionDeclared: {},
};

type Prop = {
  propertyId: string;
  transferGain: number;
  acquisitionPrice: number;
  necessaryExpense: number;
  transferPrice: number;
  appliedRate?: number;
  carryoverTaxationDetail?: { adoptedScenario?: string };
};

async function run(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as {
    data?: { aggregated?: { determinedTax: number; properties: Prop[] } };
  };
  expect(res.status).toBe(200);
  const agg = json.data?.aggregated;
  expect(agg).toBeDefined();
  return agg!;
}

const byId = (agg: { properties: Prop[] }, id: string) =>
  agg.properties.find((p) => p.propertyId === id)!;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("N2 — 컴패니언 부수토지 배율초과 분리 (영 §167의5)", () => {
  // ══════════════════════════════════════════════════════════════════
  // N2-01·02 — 분리가 실제로 일어난다
  // ══════════════════════════════════════════════════════════════════
  it("N2-01: 초과면적이 있으면 컴패니언이 한도 내/초과 **두 자산**으로 갈린다", async () => {
    const agg = await run({ ...primary("2012-06-01"), companionAssets: [companion()] });
    const ids = agg.properties.map((p) => p.propertyId);
    expect(ids).toContain("c1__appurtenant");
    expect(ids).toContain("c1__excess");
    // 갈리기 전 단일 자산 id는 사라진다 — 남아 있으면 3중 계상이다.
    expect(ids).not.toContain("c1");
  });

  it("N2-02: 금액은 면적 비율(300:200 = 60:40)로 안분되고 **합이 보존**된다", async () => {
    const agg = await run({ ...primary("2012-06-01"), companionAssets: [companion()] });
    const a = byId(agg, "c1__appurtenant");
    const e = byId(agg, "c1__excess");
    // 컴패니언 안분 양도가액 500,000,000 (총액 2,000,000,000 × 기준시가 안분)
    expect(a.transferPrice).toBe(300_000_000);
    expect(e.transferPrice).toBe(200_000_000);
    expect(a.transferPrice + e.transferPrice).toBe(500_000_000);
    expect(a.acquisitionPrice).toBe(120_000_000);
    expect(e.acquisitionPrice).toBe(80_000_000);
    expect(a.acquisitionPrice + e.acquisitionPrice).toBe(200_000_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // N2-03 — 세율: 초과분은 주택 세율을 **잃는다**
  // ══════════════════════════════════════════════════════════════════
  it("N2-03: primary 단기(5개월) — 한도 내만 70%, 초과분은 토지 본래 보유기간 세율", async () => {
    const agg = await run({ ...primary("2024-01-01"), companionAssets: [companion()] });
    const a = byId(agg, "c1__appurtenant");
    const e = byId(agg, "c1__excess");
    // 한도 내 — 주택 일체과세(§104①2호 괄호·영 §167의5)
    expect(a.appliedRate).toBe(0.7);
    // 초과분 — 주택이 아니므로 토지 본래 보유기간(2012~2024 = 12년) 기준 누진
    expect(e.appliedRate).toBe(0.35);
    /**
     * 🔴 수정 전에는 **500㎡ 전량에 70%**가 붙어 결정세액이 932,050,000이었다.
     *    초과 200㎡에 주택 단기세율을 붙인 것이라 **48,200,001원 과대**였다.
     */
    expect(agg.determinedTax).toBe(883_849_999);
  });

  it("N2-04: primary 장기(12년) — 양쪽 다 누진이라 **세액은 같고 분리만 일어난다**", async () => {
    const agg = await run({ ...primary("2012-06-01"), companionAssets: [companion()] });
    // 수정 전 924,335,000이 아니라 424,335,000 — 이 케이스는 수정 전후 동일하다.
    // 「세액이 안 변한다」가 곧 「분리가 안 됐다」는 뜻이 아님을 고정한다(N2-01이 분리를 본다).
    expect(agg.determinedTax).toBe(424_335_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // N2-05·06 — 🔴 이월과세 2배 계상 방지 (F16이 도달 가능하게 만든 축)
  // ══════════════════════════════════════════════════════════════════
  /**
   * 🔑 **지분(공유) 축과 규칙이 다르다.**
   *
   * 지분 축(`transfer-tax-api-carryover.ts` · `-gb-carryover.ts`)에서 `giftTaxAmount`는
   * **미스케일**이다 — 사용자가 「실제 증여받은 지분 기준」 금액을 넣기 때문이다.
   *
   * 여기는 **하나의 자산을 둘로 쪼개는** 축이다. 증여받은 것은 토지 1필지 하나이고 그 위에
   * 증여세 상당액도 하나다. 쪼갠 뒤 양쪽에 전액을 실으면 **입력의 2배**가 된다.
   * ⇒ 이 축에서는 **모든 이월과세 금액이 면적 비율로 나뉜다.**
   */
  it("N2-05: 이월과세 취득가액·증여세 상당액이 **합계 보존**되며 나뉜다", async () => {
    const agg = await run({
      ...primary("2012-06-01"),
      companionAssets: [
        {
          ...companion(),
          acquisitionCause: "carryover_gift",
          acquisitionDate: "2022-05-01",
          carryoverTaxation: CARRYOVER,
        },
      ],
    });
    const a = byId(agg, "c1__appurtenant");
    const e = byId(agg, "c1__excess");
    expect(a.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(e.carryoverTaxationDetail?.adoptedScenario).toBe("A");

    // §97의2①1호 증여자 취득가액 100,000,000 → 60,000,000 + 40,000,000
    expect(a.acquisitionPrice).toBe(60_000_000);
    expect(e.acquisitionPrice).toBe(40_000_000);
    expect(a.acquisitionPrice + e.acquisitionPrice).toBe(100_000_000);

    // §97의2①3호 증여세 상당액 20,000,000 → 12,000,000 + 8,000,000
    expect(a.necessaryExpense).toBe(12_000_000);
    expect(e.necessaryExpense).toBe(8_000_000);
    expect(a.necessaryExpense + e.necessaryExpense).toBe(20_000_000);
  });

  it("N2-06: 🔴 양도차익 합이 미분리 대조군과 같다 (2배 계상 → 차익 소실 방지)", async () => {
    const withSplit = await run({
      ...primary("2012-06-01"),
      companionAssets: [
        {
          ...companion(),
          acquisitionCause: "carryover_gift",
          acquisitionDate: "2022-05-01",
          carryoverTaxation: CARRYOVER,
        },
      ],
    });
    const a = byId(withSplit, "c1__appurtenant");
    const e = byId(withSplit, "c1__excess");
    /**
     * 미분리 대조군: 양도가액 500,000,000 − 취득가액 100,000,000 − 증여세 20,000,000
     *              = 양도차익 380,000,000 (결정세액 438,735,000)
     *
     * 🔴 안분 없이 split만 켜면 취득가액·증여세가 양쪽에 **전액** 실려
     *    차익 합이 260,000,000으로 **120,000,000 소실**되고 결정세액이 400,935,000으로
     *    **37,800,000원 과소**가 됐다.
     */
    expect(a.transferGain + e.transferGain).toBe(380_000_000);
    // 초과 파트에 음수 양도차익이 나오지 않는다(허수 차손 통산 차단).
    expect(e.transferGain).toBeGreaterThan(0);
  });

  // ══════════════════════════════════════════════════════════════════
  // N2-07 — 진입 조건 대조군: 분리되지 않아야 하는 경우
  // ══════════════════════════════════════════════════════════════════
  it("N2-07: 초과면적이 없으면(250㎡ ≤ 한도 300㎡) 분리하지 않는다", async () => {
    const agg = await run({
      ...primary("2012-06-01"),
      companionAssets: [{ ...companion(), areaM2: 250 }],
    });
    const ids = agg.properties.map((p) => p.propertyId);
    expect(ids).toContain("c1");
    expect(ids).not.toContain("c1__excess");
  });

  it("N2-08: `landNature`가 부수토지가 아니면 분리하지 않는다", async () => {
    const agg = await run({
      ...primary("2012-06-01"),
      companionAssets: [{ ...companion(), landNature: "non_appurtenant" }],
    });
    const ids = agg.properties.map((p) => p.propertyId);
    expect(ids).toContain("c1");
    expect(ids).not.toContain("c1__excess");
  });
});
