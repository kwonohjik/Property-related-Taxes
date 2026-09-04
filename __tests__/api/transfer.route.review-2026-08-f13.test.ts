/**
 * anchor — F13 · ⑭ 일괄양도 컴패니언 매핑이 §154⑧3호 통산 3필드를 버렸다.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * `buildCompanionEngineInputs`가 `decedentAcquisitionDate` **하나만** 매핑하고
 * `decedentSameHouseholdBeforeInheritance` · `decedentCohabitationHoldingStartDate` ·
 * `decedentCohabitationResidenceMonths` 셋을 엔진 input에 싣지 않았다.
 * 세 필드는 ⑫(`companionAssetSchema`)에도 있고 ⑬(`buildAssetPayload`)이 실제로 전송하는데
 * ⑭만 빠져 있었다 — `CompanionRawAsset`가 Zod의 부분집합이라 TypeScript도 잡지 못했다.
 *
 * 「소득세법 시행령」 §154⑧3호는 상속받은 주택을 상속인이 양도하는 경우,
 * 상속개시 당시 동일세대였다면 **상속개시 전 동일세대로서 보유·거주한 기간을 통산**한다.
 * 세 값이 도달하지 않으면 보유 기산일이 상속개시일에 묶여 §154① 비과세가 통째로 사라진다.
 *
 * 수정 전/후 실측(F13-2 시나리오, `makeMockRates`):
 *   컴패니언 isExempt false · transferGain 50,000,000 · 합산 determinedTax 39,150,000
 *   →         isExempt true  · transferGain          0 · 합산 determinedTax 21,485,000
 *
 * ⚠️ 일자는 `toOptionalDate` 필수 — JSON 경유 string이 그대로 도달하면
 *    `decedentCohabitationHoldingStartDate < acquisitionDate` 비교가 침묵 false가 되어
 *    필드를 실어도 backdate가 일어나지 않는다(F13-3이 그 축을 고정한다).
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
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

// ─── 시나리오 ────────────────────────────────────────────────────

/** 동일세대 상속주택 — 상속개시 2023-06-01, 동일세대 보유·거주 개시 2010-01-01, 통산 거주 120개월 */
const INHERITED_COHABIT = {
  acquisitionCause: "inheritance" as const,
  acquisitionDate: "2023-06-01",
  decedentAcquisitionDate: "2010-01-01",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2010-01-01",
  decedentCohabitationResidenceMonths: 120,
};

const PRIMARY_LAND = {
  propertyType: "land" as const,
  transferPrice: 300_000_000,
  transferDate: "2024-05-01",
  acquisitionPrice: 150_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: 500_000_000,
  standardPriceAtTransferForApportion: 300_000_000,
};

const COMPANION_HOUSE = {
  assetId: "c1",
  assetLabel: "상속주택",
  assetKind: "housing" as const,
  fixedAcquisitionPrice: 150_000_000,
  standardPriceAtTransfer: 200_000_000,
  directExpenses: 0,
  isOneHousehold: true,
  reductions: [] as unknown[],
  ...INHERITED_COHABIT,
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
  isExempt: boolean;
  transferGain: number;
  determinedTax: number;
};

/** 엔진 실측값 (수정 후 route POST 관측 — 산식 추론 아님) */
const AGGREGATED_DETERMINED = 21_485_000;

describe("F13 — 컴패니언 §154⑧3호 통산 3필드 ⑭ 매핑", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("F13-1: ⑭가 세 필드를 엔진 input에 싣는다 (일자는 Date)", () => {
    const [engineInput] = buildCompanionEngineInputs(
      { ...COMPANION_HOUSE } as never,
      { allocatedSalePrice: 200_000_000, allocatedAcquisitionPrice: 150_000_000, allocatedExpenses: 0 },
      {
        primaryAcquisitionDate: new Date("2010-01-01"),
        transferDate: new Date("2024-05-01"),
        // 겸용 축 없음 — 명시 opt-out(누락을 컴파일 에러로 남기기 위한 `| null`)
        mixedUseCtx: null,
        primaryAcquisitionCause: "purchase",
        primaryEngineInput: {
          householdHousingCount: 1,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          residencePeriodMonths: 0,
          propertyType: "land",
        },
      },
    );

    // 🔴 종전에는 `decedentAcquisitionDate` 하나뿐이었다
    expect(engineInput.decedentSameHouseholdBeforeInheritance).toBe(true);
    expect(engineInput.decedentCohabitationResidenceMonths).toBe(120);
    expect(engineInput.decedentCohabitationHoldingStartDate).toBeInstanceOf(Date);
    expect(engineInput.decedentAcquisitionDate).toBeInstanceOf(Date);
  });

  it("F13-2: 동일세대 상속주택 컴패니언이 §154① 비과세를 받는다", async () => {
    const { status, json } = await run({
      ...PRIMARY_LAND,
      companionAssets: [COMPANION_HOUSE],
    });

    expect(status).toBe(200);
    const props: Breakdown[] = json.data.aggregated.properties;
    expect(props).toHaveLength(2); // 대조군

    const companion = props.find((p) => p.propertyId === "c1")!;
    // 🔴 종전: isExempt false · transferGain 50,000,000 (보유 기산일이 상속개시일에 묶였다)
    expect(companion.isExempt).toBe(true);
    expect(companion.transferGain).toBe(0);
    expect(companion.determinedTax).toBe(0);

    // 주 자산(토지)분은 그대로 남는다 — 「합산 세액 0」이 아니다
    const primary = props.find((p) => p.propertyId === "primary")!;
    expect(primary.isExempt).toBe(false);
    expect(json.data.aggregated.determinedTax).toBe(AGGREGATED_DETERMINED); // 종전 39,150,000
  });

  it("F13-3: 동일세대 게이트가 꺼지면 비과세가 열리지 않는다 (게이트 자체가 살아있다)", async () => {
    const { status, json } = await run({
      ...PRIMARY_LAND,
      companionAssets: [
        { ...COMPANION_HOUSE, decedentSameHouseholdBeforeInheritance: false },
      ],
    });

    expect(status).toBe(200);
    const companion = (json.data.aggregated.properties as Breakdown[]).find(
      (p) => p.propertyId === "c1",
    )!;
    expect(companion.isExempt).toBe(false);
    expect(companion.transferGain).toBe(50_000_000);
  });

  it("F13-4: ⑬ buildAssetPayload가 세 필드를 실제로 전송한다 (파이프라인 상류 확인)", () => {
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "house" as const,
      acquisitionCause: "inheritance" as const,
      acquisitionDate: "2023-06-01",
      decedentAcquisitionDate: "2010-01-01",
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2010-01-01",
      decedentCohabitationResidenceMonths: "120",
      actualSalePrice: "200,000,000",
      actualAcquisitionPrice: "150,000,000",
    };
    const payload = buildAssetPayload(asset as never, "actual", "2024-05-01") as Record<
      string,
      unknown
    >;

    expect(payload.decedentSameHouseholdBeforeInheritance).toBe(true);
    expect(payload.decedentCohabitationHoldingStartDate).toBe("2010-01-01");
    expect(payload.decedentCohabitationResidenceMonths).toBe(120);
  });
});
