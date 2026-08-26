/**
 * anchor — 일괄양도 **컴패니언 주택**이 세대 보유 조합원입주권·분양권을 못 본다 (R-5)
 *
 * ## 조문
 *
 * > 「소득세법」 **§89②** 1세대가 주택(주택부수토지를 포함한다)과 **조합원입주권 또는 분양권을
 * > 보유하다가 그 주택을 양도하는 경우**에는 제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다.
 *
 * 「1세대가 … 보유」는 **세대 단위 사실**이다 ⇒ 같은 계약으로 함께 양도하는 주택이 두 채면
 * **양쪽 모두** 이 판정을 받아야 한다. §104⑦2호·4호(중과 주택 수)도 같은 층위다.
 *
 * ## 🔴 종전 실측 (2026-08-26 · 이 픽스처)
 *
 * | | 주 자산(주택) | **컴패니언(주택)** | 총세액 |
 * |---|---|---|---|
 * | 권리 없음 | 비과세 0원 | 비과세 0원 | 0 |
 * | 권리 보유 | **배제 71,260,000** | **비과세 0원 (그대로)** 🔴 | 77,341,000 |
 *
 * 원인은 ⑭ 한 층이다 — `buildCompanionEngineInputs`가 `householdHousingCount`·
 * `isRegulatedArea` 등 세대 단위 값은 주 자산에서 상속시키면서 **`presaleRights`만 빠뜨렸다**.
 * ⑬은 폼-전역 키로 한 번 싣고, 단건·다건 route는 둘 다 매핑한다 — **일괄양도 컴패니언만** 구멍이다.
 * 판정 불가 경고조차 뜨지 않아 화면에서도 알 수 없었다.
 *
 * ⇒ 세액이 **과소** 산출되는 방향이라 안전측 기본값으로 덮을 수 없다.
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

/**
 * 종전주택 취득(2015-06-01) 4개월 뒤 취득 ⇒ §156의2③의 「1년 이상이 지난 후」 미충족.
 * 나머지 예외도 전부 미해당이라 **배제가 확정**된다 — 판정 불가로 새지 않는다.
 */
const RIGHT = [
  {
    id: "r1",
    type: "redevelopment_right" as const,
    acquisitionDate: "2015-10-01",
    region: "capital" as const,
  },
];

function body(over: Record<string, unknown> = {}) {
  return {
    propertyType: "housing" as const,
    transferPrice: 900_000_000,
    transferDate: "2024-06-01",
    acquisitionPrice: 400_000_000,
    acquisitionDate: "2015-06-01",
    acquisitionCause: "purchase" as const,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    totalSalePrice: 1_500_000_000,
    bundledSaleMode: "actual" as const,
    primaryActualSalePrice: 900_000_000,
    standardPriceAtTransferForApportion: 500_000_000,
    companionAssets: [
      {
        assetId: "c1",
        assetLabel: "컴패니언 주택",
        assetKind: "housing" as const,
        propertyType: "housing" as const,
        standardPriceAtTransfer: 300_000_000,
        fixedSalePrice: 600_000_000,
        fixedAcquisitionPrice: 200_000_000,
        acquisitionDate: "2015-06-01",
        acquisitionCause: "purchase" as const,
        residencePeriodMonths: 60,
        isOneHousehold: true,
      },
    ],
    ...over,
  };
}

function makeRequest(b: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
}

interface PropertyResult {
  propertyId: string;
  isExempt: boolean;
  exemptReason?: string;
  determinedTax: number;
}

async function run(b: object) {
  const res = await POST(makeRequest(b));
  expect(res.status).toBe(200);
  const json = await res.json();
  const agg = json.data.aggregated as {
    properties: PropertyResult[];
    totalTax: number;
    warnings?: string[];
  };
  const byId = (id: string) => agg.properties.find((p) => p.propertyId === id)!;
  return { primary: byId("primary"), companion: byId("c1"), agg };
}

describe("R-5 — 일괄양도 컴패니언 주택도 §89② 판정을 받는다", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("기준선: 권리를 보유하지 않으면 두 주택 모두 1세대1주택 비과세", async () => {
    const r = await run(body());
    expect(r.primary.isExempt).toBe(true);
    expect(r.companion.isExempt).toBe(true);
    expect(r.agg.totalTax).toBe(0);
  });

  it("주 자산은 종전에도 배제됐다 (회귀 대조군)", async () => {
    const r = await run(body({ presaleRights: RIGHT }));
    expect(r.primary.isExempt).toBe(false);
    expect(r.primary.determinedTax).toBe(71_260_000);
  });

  it("★ 컴패니언 주택도 배제된다 — 종전에는 비과세 0원 그대로였다", async () => {
    const r = await run(body({ presaleRights: RIGHT }));
    expect(r.companion.isExempt).toBe(false);
    expect(r.companion.exemptReason).toBeUndefined();
    expect(r.companion.determinedTax).toBeGreaterThan(0);
  });

  it("★ 총세액이 실제로 움직인다 — 과소 산출이 해소된다", async () => {
    const kept = await run(body());
    const excluded = await run(body({ presaleRights: RIGHT }));
    expect(kept.agg.totalTax).toBe(0);
    // 종전 실측 77,341,000(주 자산분만) → 컴패니언분이 더해진다.
    expect(excluded.agg.totalTax).toBeGreaterThan(77_341_000);
  });

  it("🔑 판정 불가일 때는 컴패니언에도 경고가 남는다 (조용히 넘어가지 않는다)", async () => {
    // 3년 초과 + 예외 선언 없음 ⇒ `undetermined` — 종전 동작 유지 + 경고.
    const r = await run(
      body({
        presaleRights: [{ ...RIGHT[0], acquisitionDate: "2016-10-01" }],
      }),
    );
    expect(r.companion.isExempt).toBe(true); // 불리하게 뒤집지 않는다
    expect((r.agg.warnings ?? []).join("\n")).toContain("§89②");
  });

  it("⭐ 경고에 **자산 라벨**이 붙는다 — 두 자산이 같은 문구를 내면 구분이 사라진다", async () => {
    const r = await run(body({ presaleRights: [{ ...RIGHT[0], acquisitionDate: "2016-10-01" }] }));
    const ws = r.agg.warnings ?? [];
    // 라벨이 없으면 dedupe가 두 자산의 같은 경고를 하나로 접어 「어느 자산인가」를 잃는다.
    expect(ws.filter((w) => w.includes("§89②")).length).toBe(2);
    expect(ws.some((w) => w.startsWith("[주 자산(주택)]"))).toBe(true);
    expect(ws.some((w) => w.startsWith("[컴패니언 주택]"))).toBe(true);
  });

  it("🔑 세대 단위 값이므로 컴패니언 자신의 1세대 선언은 그대로 존중한다", async () => {
    // 컴패니언이 1세대1주택 축이 아니면(§89①3호 대상 아님) 이 판정 자체가 무의미하다.
    const r = await run(
      body({
        presaleRights: RIGHT,
        companionAssets: [{ ...body().companionAssets[0], isOneHousehold: false }],
      }),
    );
    expect(r.companion.isExempt).toBe(false);
  });
});
