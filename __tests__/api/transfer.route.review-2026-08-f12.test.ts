/**
 * anchor — F12 · 컴패니언 **부수토지**의 거주기간이 항상 0이었다.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * `buildCompanionEngineInputs`는 세대 단위 3값(householdHousingCount·isRegulatedArea·
 * wasRegulatedAtAcquisition)을 primary에서 상속시키면서 거주기간만 `c.residencePeriodMonths ?? 0`
 * 으로 payload를 읽었다. 그런데 ⑬(`buildAssetPayload`)이 컴패니언 payload에 그 키를
 * **한 번도 싣지 않는다** — ⑫·⑭에는 있는데 ⑬만 빠진 침묵 strip이다.
 *
 * ⇒ 컴패니언은 항상 거주 0개월 → 「소득세법 시행령」 §159의4 표2(1세대1주택) 대상 판정
 *   (거주 2년 이상)에 영영 진입하지 못하고 표1(최대 30%)로 떨어졌다.
 *   `transfer-tax-lthd.ts` L-1b가 「부수토지는 1세대1주택 여부·거주기간을 주택과 공유」를
 *   전제로 짜여 있는데 구현이 그 전제를 만족시키지 못한 상태였다.
 *
 * ## 수정 범위 — 부수토지 한정
 *
 * `landNature === "appurtenant_to_housing"`인 컴패니언만 primary 주택의 거주기간을 상속한다.
 * **모든 컴패니언에 일괄 상속하면 안 된다** — 자기 거주요건을 갖추지 못한 별개 주택 컴패니언이
 * primary의 거주기간으로 §154① 비과세·표2를 잘못 여는 방향이 된다(F12-3이 그 경계를 고정한다).
 *
 * 수정 전/후 실측(F12-2 시나리오, `makeMockRates`):
 *   부수토지 LTHD 88,000,000(표1 22%) → 320,000,000(표2 80%) · 합산 총세액 128,766,000 → 31,333,500
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

// ─── 시나리오 — 1세대1주택 고가주택 + 부수토지 컴패니언 ──────────

const PRIMARY_HIGH_VALUE_HOUSE = {
  propertyType: "housing" as const,
  transferPrice: 1_500_000_000,
  transferDate: "2024-06-01",
  acquisitionPrice: 500_000_000,
  acquisitionDate: "2012-06-01",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 120,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  // primaryCtxForSplit 생성 조건 — 부수토지 일체과세 컨텍스트가 컴패니언에 전달된다
  buildingFootprintArea: 100,
  isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential" as const,
  totalSalePrice: 2_000_000_000,
  standardPriceAtTransferForApportion: 900_000_000,
};

const COMPANION_APPURTENANT_LAND = {
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land" as const,
  landNature: "appurtenant_to_housing" as const,
  acquisitionCause: "purchase" as const,
  acquisitionDate: "2012-06-01",
  fixedAcquisitionPrice: 100_000_000,
  standardPriceAtTransfer: 300_000_000,
  directExpenses: 0,
  isOneHousehold: true,
  reductions: [] as unknown[],
};

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
  longTermHoldingDeduction: number;
  determinedTax: number;
};

const CTX_BASE = {
  primaryAcquisitionDate: new Date("2012-06-01"),
  transferDate: new Date("2024-06-01"),
  // 겸용 축 없음 — 명시 opt-out(누락을 컴파일 에러로 남기기 위한 `| null`)
  mixedUseCtx: null,
  primaryAcquisitionCause: "purchase" as const,
  primaryEngineInput: {
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 120,
    propertyType: "housing" as const,
  },
};

const APPORTIONED = {
  allocatedSalePrice: 500_000_000,
  allocatedAcquisitionPrice: 100_000_000,
  allocatedExpenses: 0,
};

/** 엔진 실측값 (수정 후 route POST 관측 — 산식 추론 아님) */
const LAND_LTHD_TABLE2 = 320_000_000; // 표2 80%(보유 40% + 거주 40%)
const LAND_LTHD_TABLE1 = 88_000_000; // 종전(거주 0 → 표1 22%) 값
const LAND_DETERMINED_TABLE2 = 13_440_000;
const AGGREGATED_TOTAL_TAX = 28_253_500;

describe("F12 — 컴패니언 부수토지 거주기간 상속", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("F12-1: 부수토지 컴패니언이 primary 주택의 거주기간을 상속한다", () => {
    const [engineInput] = buildCompanionEngineInputs(
      COMPANION_APPURTENANT_LAND as never,
      APPORTIONED,
      CTX_BASE,
    );
    // 🔴 종전에는 0이었다 (⑬이 키를 싣지 않아 `c.residencePeriodMonths ?? 0`이 항상 0)
    expect(engineInput.residencePeriodMonths).toBe(120);
  });

  it("F12-2: 부수토지가 §95② 표2 대상 판정에 진입한다", async () => {
    const { status, json } = await run({
      ...PRIMARY_HIGH_VALUE_HOUSE,
      companionAssets: [COMPANION_APPURTENANT_LAND],
    });

    expect(status).toBe(200);
    const props: Breakdown[] = json.data.aggregated.properties;
    expect(props).toHaveLength(2); // 대조군

    const land = props.find((p) => p.propertyId === "c1")!;
    expect(land.longTermHoldingDeduction).toBe(LAND_LTHD_TABLE2);
    expect(land.longTermHoldingDeduction).not.toBe(LAND_LTHD_TABLE1);
    expect(land.determinedTax).toBe(LAND_DETERMINED_TABLE2);
    expect(json.data.aggregated.totalTax).toBe(AGGREGATED_TOTAL_TAX);
  });

  it("F12-3: **별개 주택** 컴패니언에는 상속되지 않는다 (§154① 오적용 차단)", () => {
    const [engineInput] = buildCompanionEngineInputs(
      {
        assetId: "c2",
        assetLabel: "별개 주택",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2012-06-01",
        isOneHousehold: true,
        reductions: [],
      } as never,
      APPORTIONED,
      CTX_BASE,
    );
    // primary가 120개월을 갖고 있어도 별개 주택은 자기 거주기간(미입력 → 0)을 쓴다
    expect(engineInput.residencePeriodMonths).toBe(0);
  });

  it("F12-4: 비부수 토지(`non_appurtenant`)에도 상속되지 않는다", () => {
    const [engineInput] = buildCompanionEngineInputs(
      { ...COMPANION_APPURTENANT_LAND, landNature: "non_appurtenant" } as never,
      APPORTIONED,
      CTX_BASE,
    );
    expect(engineInput.residencePeriodMonths).toBe(0);
  });
});
