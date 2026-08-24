/**
 * anchor — F39 · ⑭ 일괄양도 컴패니언 매핑이 `ownershipRatio`를 버렸다.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * ⑫(`companionAssetSchema:ownershipRatio` — 「⑫ 침묵 stripping 방지」 주석까지 달려 있다)와
 * ⑬(`buildAssetPayload`)에는 있는데 ⑭(`buildCompanionEngineInputs`)가 엔진 input에 싣지 않았다.
 *
 * 「소득세법 시행령」 §163⑥의 필요경비 개산공제는 **취득 당시 기준시가**에 정률을 곱하는데,
 * 공유지분 자산의 기준시가는 **물건 전체** 값이므로 지분율로 축소해야 한다.
 * 지분율이 도달하지 않으면 개산공제가 100% 기준시가로 계산돼 과대해진다.
 *
 * 수정 전/후 실측(F39-2 시나리오, `makeMockRates`):
 *   컴패니언 개산공제 3,000,000 → 1,500,000 · 양도차익 197,000,000 → 198,500,000
 *
 * ⚠️ 기준시가 자체는 물건 전체 값을 유지한다 — 환산취득가액 분모는 그대로다.
 *    지분 축소는 **개산공제에만** 걸린다(F39-2가 환산취득가 2억 불변을 함께 고정한다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildCompanionEngineInputs } from "@/app/api/calc/transfer/bundled-split-helpers";

const PRIMARY_HOUSE = {
  propertyType: "housing" as const,
  transferPrice: 600_000_000,
  transferDate: "2024-06-01",
  acquisitionPrice: 200_000_000,
  acquisitionDate: "2012-06-01",
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
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 300_000_000,
};

/** 컴패니언 토지 — 기준시가는 **물건 전체**(양도 2억 / 취득 1억), 환산 모드 */
const COMPANION_LAND_WHOLE = {
  assetId: "c1",
  assetLabel: "토지(지분)",
  assetKind: "land" as const,
  acquisitionCause: "purchase" as const,
  acquisitionDate: "2012-06-01",
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 100_000_000,
  standardPriceAtTransfer: 200_000_000,
  directExpenses: 0,
  reductions: [] as unknown[],
};

/** 같은 토지의 지분 50% 보유 */
const COMPANION_LAND_FRACTIONAL = { ...COMPANION_LAND_WHOLE, ownershipRatio: 0.5 };

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function run(body: object) {
  const res = await POST(makeRequest(body));
  return { status: res.status, json: await res.json() };
}

type Breakdown = {
  propertyId: string;
  acquisitionPrice: number;
  necessaryExpense: number;
  transferGain: number;
};

/** 엔진 실측값 (수정 후 route POST 관측) */
const EXPECTED_NECESSARY_EXPENSE = 1_500_000; // = 100,000,000 × 0.5 × 3%
const EXPECTED_GAIN = 198_500_000;
/** 종전(지분 미도달) 값 — 이 방향으로 되돌아가는 것을 막는다 */
const BUGGY_NECESSARY_EXPENSE = 3_000_000;
const BUGGY_GAIN = 197_000_000;

describe("F39 — 컴패니언 ownershipRatio ⑭ 매핑 (§163⑥ 개산공제 base 축소)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("F39-1: ⑭가 `ownershipRatio`를 엔진 input에 싣는다", () => {
    const [engineInput] = buildCompanionEngineInputs(
      COMPANION_LAND_FRACTIONAL as never,
      {
        allocatedSalePrice: 400_000_000,
        allocatedAcquisitionPrice: 0,
        allocatedExpenses: 0,
      },
      {
        primaryAcquisitionDate: new Date("2012-06-01"),
        transferDate: new Date("2024-06-01"),
        primaryAcquisitionCause: "purchase",
        primaryEngineInput: {
          householdHousingCount: 2,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          residencePeriodMonths: 0,
          propertyType: "housing",
        },
      },
    );

    // 🔴 종전에는 키 자체가 없었다("ownershipRatio" in input === false)
    expect(engineInput.ownershipRatio).toBe(0.5);
  });

  it("F39-2: 지분 50% 컴패니언의 개산공제가 지분 기준시가로 계산된다", async () => {
    const { status, json } = await run({
      ...PRIMARY_HOUSE,
      companionAssets: [COMPANION_LAND_FRACTIONAL],
    });

    expect(status).toBe(200);
    const props: Breakdown[] = json.data.aggregated.properties;
    expect(props).toHaveLength(2); // 대조군

    const companion = props.find((p) => p.propertyId === "c1")!;
    // 환산취득가액 분모는 **물건 전체** 기준시가 그대로 — 지분은 개산공제에만 걸린다
    expect(companion.acquisitionPrice).toBe(200_000_000);
    expect(companion.necessaryExpense).toBe(EXPECTED_NECESSARY_EXPENSE);
    expect(companion.necessaryExpense).not.toBe(BUGGY_NECESSARY_EXPENSE);
    expect(companion.transferGain).toBe(EXPECTED_GAIN);
    expect(companion.transferGain).not.toBe(BUGGY_GAIN);
  });

  it("F39-3: 지분 미전송(단독 소유) 컴패니언은 물건 전체 기준시가로 계산된다 (대조군)", async () => {
    const { status, json } = await run({
      ...PRIMARY_HOUSE,
      companionAssets: [COMPANION_LAND_WHOLE],
    });

    expect(status).toBe(200);
    const companion = (json.data.aggregated.properties as Breakdown[]).find(
      (p) => p.propertyId === "c1",
    )!;
    expect(companion.necessaryExpense).toBe(BUGGY_NECESSARY_EXPENSE);
    expect(companion.transferGain).toBe(BUGGY_GAIN);
  });
});
