/**
 * anchor — F40 · 컴패니언(일괄양도 동반) 자산의 공익수용·공매 §164⑨ 특례 배관.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * ④(`buildAssetPayload`)와 ⑭(`bundled-split-helpers.ts` `buildCompanionEngineInputs`)는
 * 특례 필드를 이미 다루고 있었는데 **⑫(`companionAssetSchema`)에만 필드가 없었다**.
 * Zod는 모르는 키를 **400 없이 조용히 떼어내므로**, 사용자가 컴패니언 카드에 보상액·
 * 기준시가를 입력해도 엔진에는 한 필드도 도달하지 않았다 — 화면에는 입력값이 그대로 보이는 채로.
 * 여기에 더해 ④가 **1호 게이트인 `transferCause` 자체를 emit하지 않아**, 스키마만 고쳐도
 * 1호는 발동하지 않는 이중 갭이었다.
 *
 * 수정 전 실측(아래 F40-1 케이스): 컴패니언 양도차익 594,000,000 · 결정세액 169,432,000
 *                                  (총 결정세액 280,857,200 · `expropriationValuationDetail` 없음)
 * 수정 후 실측:                     컴패니언 양도차익 327,333,334 · 결정세액  82,597,066
 *                                  (총 결정세액 189,017,200 · 산출근거 detail 노출)
 *
 * ## 법령 근거 — 컴패니언에도 미친다
 *
 * 「소득세법 시행령」 §164⑨은 법 §99①1호 **가목~라목(토지·건물·오피스텔 및 상업용 건물·주택)**
 * 전부를 대상으로 하는 **자산 단위** 규정이고, 「주된 자산 전용」·「일괄양도 제외」 문언이
 * 본문·괄호·단서 어디에도 없다. 나아가 법 §100② → 영 §166⑥ → 「부가가치세법 시행령」 §64①1호가
 * 일괄양도 안분 키를 **기준시가**로 지정하므로 컴패니언의 양도 당시 기준시가는 법적으로
 * 살아있는 값이고, §164⑨이 바로 그 값을 계산하는 규정이다.
 *
 * ⚠️ 1호(협의매수·수용)와 2호(공매·경락)는 **다른 호**다. 2호는 조문상 수용을 요건으로 하지
 *    않으므로 `transferCause`에 종속시키면 안 된다(F40-4가 그것을 고정한다).
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

// route를 먼저 import해야 스키마 모듈 순환 초기화(TDZ)가 정상 순서로 풀린다.
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { companionAssetSchema } from "@/lib/api/transfer-tax-schema-sub";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

// ─── 고정 수치 (엔진 실측값 — 산식 추론 아님) ────────────────────
/** 특례 **미적용** 대조군 양도차익 — 양도시 기준시가 5억이 환산 분모 */
const GAIN_NO_SPECIAL = 594_000_000;
/** 특례 **적용** 양도차익 — min[2,500,000·1,500,000·2,000,000] × 200㎡ = 3억이 분모 */
const GAIN_WITH_SPECIAL = 327_333_334;
const TAX_NO_SPECIAL = 169_432_000;
const TAX_WITH_SPECIAL = 82_597_066;

/** 1호(협의매수·수용) 원/㎡ 3후보 */
const EXPR_CLAUSE1 = {
  transferCause: "public_expropriation" as const,
  standardPricePerSqmAtTransfer: 2_500_000,
  transferArea: 200,
  compensationPerSqm: 1_500_000,
  compensationBasisStdPrice: 2_000_000,
};

const PRIMARY_LAND_BASE = {
  propertyType: "land" as const,
  transferPrice: 1_000_000_000,
  transferDate: "2020-06-01",
  acquisitionPrice: 0,
  acquisitionDate: "2010-06-01",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 500_000_000,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: 2_000_000_000,
  standardPriceAtTransferForApportion: 500_000_000,
};

const COMPANION_BASE = {
  assetId: "c1",
  assetLabel: "동반자산",
  acquisitionCause: "purchase" as const,
  acquisitionDate: "2010-06-01",
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 500_000_000,
  fixedSalePrice: 1_000_000_000,
  reductions: [] as unknown[],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Breakdown = {
  propertyId: string;
  transferGain: number;
  determinedTax: number;
  expropriationValuationDetail?: unknown;
  housingExpropriationValuationDetail?: unknown;
  auctionValuationDetail?: unknown;
};

async function run(body: object) {
  const res = await POST(makeRequest(body));
  const json = await res.json();
  return { status: res.status, json };
}

function propsOf(json: {
  data: { mode: string; aggregated: { properties: Breakdown[]; determinedTax: number } };
}) {
  return json.data.aggregated.properties;
}

describe("F40 — 컴패니언 §164⑨ 특례 배관 (④ transferCause emit + ⑫ 스키마)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("F40-1: 1호 수용 — 컴패니언 토지도 주 자산과 **같은** 양도차익을 낸다", async () => {
    const { status, json } = await run({
      ...PRIMARY_LAND_BASE,
      ...EXPR_CLAUSE1,
      companionAssets: [{ ...COMPANION_BASE, assetKind: "land", ...EXPR_CLAUSE1 }],
    });

    expect(status).toBe(200);
    expect(json.data.mode).toBe("bundled");

    const props = propsOf(json);
    expect(props).toHaveLength(2); // 대조군 — 컴패니언이 실제로 실려야 아래 단언이 의미를 갖는다
    const primary = props.find((p) => p.propertyId === "primary")!;
    const companion = props.find((p) => p.propertyId === "c1")!;

    // 주 자산은 종전에도 특례가 적용됐다(단건 경로) — 회귀 감시용 고정
    expect(primary.transferGain).toBe(GAIN_WITH_SPECIAL);
    // 🔴 여기가 결함 지점이었다: ⑫ strip + transferCause 미emit 로 594,000,000 이었다
    expect(companion.transferGain).toBe(GAIN_WITH_SPECIAL);
    expect(companion.transferGain).not.toBe(GAIN_NO_SPECIAL);
    expect(companion.determinedTax).toBe(TAX_WITH_SPECIAL);

    // 산출근거가 자산별 breakdown에 실린다 — 값만 맞고 근거가 비면 화면에서 설명 불가
    expect(companion.expropriationValuationDetail).toEqual({
      perSqmCandidates: { standard: 2_500_000, compensation: 1_500_000, basis: 2_000_000 },
      chosenPerSqm: 1_500_000,
      area: 200,
      denominator: 300_000_000,
    });

    expect(json.data.aggregated.determinedTax).toBe(189_017_200); // 수정 전 280,857,200
  });

  it("F40-2: ④ buildAssetPayload가 1호 게이트 `transferCause`를 싣는다", () => {
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "land" as const,
      acquisitionCause: "purchase" as const,
      useEstimatedAcquisition: true,
      acquisitionDate: "2010-06-01",
      transferCause: "public_expropriation" as const,
      standardPricePerSqmAtTransfer: "2,500,000",
      transferArea: "200",
      compensationPerSqm: "1,500,000",
      compensationBasisStdPrice: "2,000,000",
      standardPriceAtAcq: "200,000,000",
      standardPriceAtTransfer: "500,000,000",
      actualSalePrice: "1,000,000,000",
    };
    const payload = buildAssetPayload(asset as never, "actual", "2020-06-01") as Record<
      string,
      unknown
    >;

    // 후보 3종은 종전에도 실렸다 — 게이트만 빠져 있어 min[] 비교가 한 번도 돌지 않았다
    expect(payload.standardPricePerSqmAtTransfer).toBe(2_500_000);
    expect(payload.compensationPerSqm).toBe(1_500_000);
    expect(payload.compensationBasisStdPrice).toBe(2_000_000);
    expect(payload.transferCause).toBe("public_expropriation");
  });

  it("F40-3: ⑫ companionAssetSchema가 특례 9필드를 **떼어내지 않는다**", () => {
    const input = {
      assetId: "c1",
      assetLabel: "동반자산",
      assetKind: "land" as const,
      acquisitionCause: "purchase" as const,
      ...EXPR_CLAUSE1,
      isAuctionTransfer: true,
      auctionPrice: 300_000_000,
      housingCompensationTotal: 700_000_000,
      housingCompensationBasisTotal: 800_000_000,
    };
    const parsed = companionAssetSchema.safeParse(input);
    expect(parsed.success).toBe(true);

    const data = (parsed as { data: Record<string, unknown> }).data;
    // 🔴 종전에는 **9개 전부** undefined 였다(400이 아니라 조용한 strip이라 아무도 몰랐다)
    for (const key of [
      "transferCause",
      "standardPricePerSqmAtTransfer",
      "transferArea",
      "compensationPerSqm",
      "compensationBasisStdPrice",
      "isAuctionTransfer",
      "auctionPrice",
      "housingCompensationTotal",
      "housingCompensationBasisTotal",
    ] as const) {
      expect(data[key], `${key} 가 ⑫에서 strip 됨`).toBe(input[key]);
    }
  });

  it("F40-4: 2호(공매·경락)는 `transferCause` **없이도** 발동한다 — 별개의 호", async () => {
    // §164⑨2호는 「국세징수법에 의한 공매와 민사집행법에 의한 강제경매 또는 저당권실행을 위하여
    // 경매되는 경우」로, 조문상 수용을 요건으로 하지 않는다. 2호를 transferCause에 종속시키는
    // 구현은 조문에 정면으로 반한다 — 이 테스트가 그 방향의 수정을 차단한다.

    // ④ — `transferCause`가 "general"(수용 아님)이어도 2호 필드는 그대로 실려야 한다
    const auctionAsset = {
      ...makeDefaultAsset(2),
      assetKind: "land" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2010-06-01",
      transferCause: "general" as const,
      isAuctionTransfer: true,
      auctionPrice: "300,000,000",
    };
    const auctionPayload = buildAssetPayload(
      auctionAsset as never,
      "actual",
      "2020-06-01",
    ) as Record<string, unknown>;
    expect(auctionPayload.isAuctionTransfer).toBe(true);
    expect(auctionPayload.auctionPrice).toBe(300_000_000);

    const { status, json } = await run({
      ...PRIMARY_LAND_BASE, // 주 자산은 수용도 공매도 아님 → 대조군
      companionAssets: [
        {
          ...COMPANION_BASE,
          assetKind: "land",
          isAuctionTransfer: true,
          auctionPrice: 300_000_000,
          // transferCause 의도적 미전송
        },
      ],
    });

    expect(status).toBe(200);
    const props = propsOf(json);
    const primary = props.find((p) => p.propertyId === "primary")!;
    const companion = props.find((p) => p.propertyId === "c1")!;

    expect(primary.transferGain).toBe(GAIN_NO_SPECIAL);
    expect(primary.determinedTax).toBe(TAX_NO_SPECIAL);
    expect(companion.transferGain).toBe(GAIN_WITH_SPECIAL);
    expect(companion.auctionValuationDetail).toEqual({
      standardTotal: 500_000_000,
      auctionPrice: 300_000_000,
      chosen: 300_000_000,
      denominator: 300_000_000,
    });
  });

  it("F40-5: 1호 주택(라목) 총액 트랙 — ④가 게이트를 열고 컴패니언 주택이 발동한다", async () => {
    // 개별·공동주택가격은 **총액**이라 원/㎡ 3후보 모델이 아닌 총액 3후보를 쓴다.
    // ⚠️ ④의 `transferCause` 게이트를 **원/㎡ 트랙(`isExprValuationEligibleAssetKind`)만으로**
    //    두면 주택은 그 목록에 없어(총액 트랙) 게이트가 열리지 않는다 — `housingCompensationTotal`
    //    만 실리고 1호는 영영 발동하지 않는 「트리거 없는 입력 경로」가 된다. 그래서 게이트는
    //    원/㎡ 트랙 ∪ 주택 총액 트랙이다. 아래 ④ 단언이 그 합집합을 고정한다.
    const housingAsset = {
      ...makeDefaultAsset(2),
      assetKind: "housing" as const,
      acquisitionCause: "purchase" as const,
      useEstimatedAcquisition: true,
      acquisitionDate: "2010-06-01",
      transferCause: "public_expropriation" as const,
      housingCompensationTotal: "300,000,000",
      housingCompensationBasisTotal: "400,000,000",
      standardPriceAtAcq: "200,000,000",
      standardPriceAtTransfer: "500,000,000",
      actualSalePrice: "1,000,000,000",
    };
    const housingPayload = buildAssetPayload(
      housingAsset as never,
      "actual",
      "2020-06-01",
    ) as Record<string, unknown>;
    expect(housingPayload.transferCause).toBe("public_expropriation");
    expect(housingPayload.housingCompensationTotal).toBe(300_000_000);
    // 주택은 원/㎡ 트랙이 아니다 — 총액 트랙만 열려야 한다(stale per-sqm shadowing 방지)
    expect(housingPayload.standardPricePerSqmAtTransfer).toBeUndefined();

    const { status, json } = await run({
      ...PRIMARY_LAND_BASE,
      companionAssets: [
        {
          ...COMPANION_BASE,
          assetKind: "housing",
          transferCause: "public_expropriation",
          housingCompensationTotal: 300_000_000,
          housingCompensationBasisTotal: 400_000_000,
        },
      ],
    });

    expect(status).toBe(200);
    const companion = propsOf(json).find((p) => p.propertyId === "c1")!;
    expect(companion.transferGain).toBe(GAIN_WITH_SPECIAL);
    expect(companion.housingExpropriationValuationDetail).toEqual({
      standardTotal: 500_000_000,
      compensationTotal: 300_000_000,
      compensationBasisTotal: 400_000_000,
      chosen: 300_000_000,
      denominator: 300_000_000,
    });
  });

  it("F40-6: 조합원입주권은 §164⑨ **미대상** — 게이트를 넓혀도 새지 않는다", () => {
    // 조합원입주권은 법 §99①**2호**(부동산을 취득할 수 있는 권리)이고 §164⑨은 1호 가~라목 전용이다
    // (`lib/tax-engine/expropriation-scope.ts` — 「여기에 추가하면 §164⑨ 오적용, 절대 금지」).
    // 🔄 **2026-09-03**: 종전에는 `toEngineAssetKind`가 입주권을 "housing"으로 접어 보내
    //    「엔진 축에서는 구분이 사라진다」가 이 테스트의 전제였다. 컴패니언 §166 개방으로
    //    fold를 걷어내 자산 종류가 그대로 나간다 — **그래도 §164⑨은 새면 안 된다**는 것이
    //    이 테스트의 본론이고, 그 단언(아래 8키)은 그대로다.
    const rightToMoveIn = {
      ...makeDefaultAsset(2),
      assetKind: "right_to_move_in" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2010-06-01",
      transferCause: "public_expropriation" as const,
      housingCompensationTotal: "300,000,000",
      housingCompensationBasisTotal: "400,000,000",
      compensationPerSqm: "1,500,000",
      compensationBasisStdPrice: "2,000,000",
      isAuctionTransfer: true,
      auctionPrice: "300,000,000",
    };
    const payload = buildAssetPayload(rightToMoveIn as never, "actual", "2020-06-01") as Record<
      string,
      unknown
    >;

    expect(payload.assetKind).toBe("right_to_move_in"); // fold 제거 후 자산 종류가 보존된다
    for (const key of [
      "transferCause",
      "standardPricePerSqmAtTransfer",
      "compensationPerSqm",
      "compensationBasisStdPrice",
      "isAuctionTransfer",
      "auctionPrice",
      "housingCompensationTotal",
      "housingCompensationBasisTotal",
    ]) {
      expect(payload[key], `입주권에 ${key} 가 새어나감 — §164⑨ 오적용`).toBeUndefined();
    }
  });
});
