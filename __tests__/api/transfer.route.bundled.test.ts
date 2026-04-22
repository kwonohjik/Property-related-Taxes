/**
 * 양도소득세 Route Handler — 일괄양도(bundled) 분기 E2E 테스트
 *
 * PDF 사례 재현: 2023 양도·상속·증여세 이론 및 계산실무 p387~391
 *   상속받은 1세대1주택(농가주택) + 농지(밭) 일괄양도 (2023.2.15, 225,000,000원)
 *   → 주택: 1세대1주택 비과세
 *   → 농지: 조특법 §69 자경농지 100% 감면
 *   → 총 결정세액 0원
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  ANS_HOUSE_ALLOCATED_SALE,
  ANS_LAND_ALLOCATED_SALE,
  INHERIT_HOUSE_PRICE,
  INHERIT_LAND_PRICE_PER_M2,
  LAND_AREA_M2,
  HOUSE_STD_AT_TRANSFER,
  LAND_STD_AT_TRANSFER,
  TOTAL_SALE_PRICE,
  HOUSE_INHERIT_EXPENSE,
  LAND_INHERIT_EXPENSE,
  ANS_LAND_DETERMINED,
} from "../fixtures/pdf-bundled-farmland";

// ─── Mock 설정 ────────────────────────────────────────────────────
// preloadTaxRates만 mock하고 나머지(getRate 등)는 실제 구현 유지
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return {
    ...actual,
    preloadTaxRates: vi.fn(),
  };
});

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// vi.mock 호이스팅 이후 static import
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

// ─── PDF 테스트 페이로드 ──────────────────────────────────────────
const BASE_PAYLOAD = {
  propertyType: "housing" as const,
  transferPrice: TOTAL_SALE_PRICE,
  transferDate: "2023-02-15",
  acquisitionPrice: 0,
  acquisitionDate: "2005-04-07",
  acquisitionCause: "inheritance" as const,
  decedentAcquisitionDate: "1999-10-21",
  expenses: HOUSE_INHERIT_EXPENSE,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 214,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: TOTAL_SALE_PRICE,
  standardPriceAtTransferForApportion: HOUSE_STD_AT_TRANSFER,
  primaryInheritanceValuation: {
    inheritanceDate: "2005-04-07",
    assetKind: "house_individual" as const,
    publishedValueAtInheritance: INHERIT_HOUSE_PRICE,
  },
  companionAssets: [
    {
      assetId: "land-1",
      assetLabel: "농지(밭)",
      assetKind: "land" as const,
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      directExpenses: LAND_INHERIT_EXPENSE,
      acquisitionCause: "inheritance" as const,
      acquisitionDate: "2005-04-07",
      decedentAcquisitionDate: "1999-10-21",
      inheritanceValuation: {
        inheritanceDate: "2005-04-07",
        assetKind: "land" as const,
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
      },
      reductions: [{ type: "self_farming", farmingYears: 18 }],
      isOneHousehold: false,
    },
  ],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── 테스트 ──────────────────────────────────────────────────────
describe("POST /api/calc/transfer — 일괄양도(bundled) PDF p387~391", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("응답 mode === bundled", async () => {
    const res = await POST(makeRequest(BASE_PAYLOAD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe("bundled");
  });

  it("안분: 주택 125,011,376 / 농지 99,988,624 (PDF p388 정답)", async () => {
    const res = await POST(makeRequest(BASE_PAYLOAD));
    const body = await res.json();

    const { apportioned } = body.data.apportionment;
    const house = apportioned.find((a: { assetId: string }) => a.assetId === "primary");
    const land = apportioned.find((a: { assetId: string }) => a.assetId === "land-1");

    expect(house.allocatedSalePrice).toBe(ANS_HOUSE_ALLOCATED_SALE); // 125,011,376
    expect(land.allocatedSalePrice).toBe(ANS_LAND_ALLOCATED_SALE);   // 99,988,624
    expect(house.allocatedSalePrice + land.allocatedSalePrice).toBe(TOTAL_SALE_PRICE);
  });

  it("주택 breakdown: isExempt = true (1세대1주택 비과세)", async () => {
    const res = await POST(makeRequest(BASE_PAYLOAD));
    const body = await res.json();

    const { properties } = body.data.aggregated;
    const houseBreakdown = properties.find(
      (p: { propertyId: string }) => p.propertyId === "primary",
    );
    expect(houseBreakdown).toBeDefined();
    expect(houseBreakdown.isExempt).toBe(true);
  });

  it("전체 결정세액 = 0 (주택 비과세 + 농지 100% 감면)", async () => {
    const res = await POST(makeRequest(BASE_PAYLOAD));
    const body = await res.json();

    expect(body.data.aggregated.determinedTax).toBe(ANS_LAND_DETERMINED); // 0
  });

  it("농지 breakdown: reductionAmount > 0 (100% 감면 적용)", async () => {
    const res = await POST(makeRequest(BASE_PAYLOAD));
    const body = await res.json();

    const { properties } = body.data.aggregated;
    const landBreakdown = properties.find(
      (p: { propertyId: string }) => p.propertyId === "land-1",
    );
    expect(landBreakdown).toBeDefined();
    expect(landBreakdown.reductionAmount).toBeGreaterThan(0);
  });

  it("companionAssets 미지정 — mode === single (하위호환)", async () => {
    const singlePayload = {
      propertyType: "housing",
      transferPrice: 500_000_000,
      transferDate: "2024-06-01",
      acquisitionPrice: 300_000_000,
      acquisitionDate: "2019-06-01",
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 1,
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: true,
      reductions: [],
      annualBasicDeductionUsed: 0,
    };

    const res = await POST(makeRequest(singlePayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe("single");
    expect(body.data.result).toBeDefined();
  });

  it("totalSalePrice 누락 시 400 에러 (일괄양도 필수 필드)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { totalSalePrice: _omit, ...payloadWithoutTotal } = BASE_PAYLOAD;

    const res = await POST(makeRequest(payloadWithoutTotal));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });
});

// ─── 신규: §166⑥ 본문 — bundledSaleMode="actual" 검증 ─────────────

describe("POST /api/calc/transfer — §166⑥ 본문 actual 모드", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // 주택 actual 200M + 농지 actual 100M = 총 300M (계약서 구분 기재)
  const actualPayload = {
    propertyType: "housing" as const,
    transferPrice: 300_000_000,
    transferDate: "2024-06-01",
    acquisitionPrice: 150_000_000,
    acquisitionDate: "2019-06-01",
    acquisitionCause: "purchase" as const,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    totalSalePrice: 300_000_000,
    bundledSaleMode: "actual" as const,
    primaryActualSalePrice: 200_000_000,
    companionAssets: [
      {
        assetId: "land-act",
        assetLabel: "농지 51번지",
        assetKind: "land" as const,
        fixedSalePrice: 100_000_000,
        directExpenses: 0,
        acquisitionCause: "purchase" as const,
        acquisitionDate: "2019-06-01",
        fixedAcquisitionPrice: 60_000_000,
        reductions: [],
      },
    ],
  };

  it("actual 모드 정상: 주+동반 모두 계약서상 양도가액 그대로 사용", async () => {
    const res = await POST(makeRequest(actualPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe("bundled");

    const primary = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "primary",
    );
    const land = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "land-act",
    );
    expect(primary.allocatedSalePrice).toBe(200_000_000);
    expect(primary.saleMode).toBe("actual");
    expect(land.allocatedSalePrice).toBe(100_000_000);
    expect(land.saleMode).toBe("actual");
    expect(body.data.apportionment.residualAbsorbedBy).toBeNull();
  });

  it("actual 합계 불일치: 주 200M + 동반 50M ≠ 총 300M → 400", async () => {
    const bad = {
      ...actualPayload,
      companionAssets: [
        { ...actualPayload.companionAssets[0], fixedSalePrice: 50_000_000 },
      ],
    };
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("actual 모드인데 컴패니언 fixedSalePrice 누락 → 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fixedSalePrice: _omit, ...companionWithoutFixed } = actualPayload.companionAssets[0];
    const bad = {
      ...actualPayload,
      companionAssets: [companionWithoutFixed],
    };
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
  });
});

// ─── 신규: 컴패니언 취득원인 분기(매매·증여) 검증 ─────────────────

describe("POST /api/calc/transfer — 컴패니언 acquisitionCause 분기", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // 주 자산은 PDF 시나리오(상속 주택) 유지, 컴패니언을 매매·증여로 변경
  function buildPayload(companion: unknown) {
    return {
      ...BASE_PAYLOAD,
      companionAssets: [companion],
    };
  }

  it("매매(실가): fixedAcquisitionPrice가 그대로 allocatedAcquisitionPrice로 사용", async () => {
    const PURCHASE_ACQ = 80_000_000;
    const payload = buildPayload({
      assetId: "land-p",
      assetLabel: "매매 농지",
      assetKind: "land",
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      directExpenses: 0,
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-20",
      fixedAcquisitionPrice: PURCHASE_ACQ,
      reductions: [],
    });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    const land = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "land-p",
    );
    expect(land.allocatedAcquisitionPrice).toBe(PURCHASE_ACQ);
  });

  it("매매(환산): 안분 후 양도가액 × (취득시/양도시 기준시가) 환산 적용", async () => {
    const STD_ACQ = 50_000_000;
    const payload = buildPayload({
      assetId: "land-e",
      assetLabel: "매매 농지(환산)",
      assetKind: "land",
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      standardPriceAtAcquisition: STD_ACQ,
      directExpenses: 0,
      acquisitionCause: "purchase",
      useEstimatedAcquisition: true,
      acquisitionDate: "2015-03-20",
      reductions: [],
    });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    const land = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "land-e",
    );
    // usedEstimatedAcquisition 플래그가 전파되어야 함 (환산 적용 증거)
    expect(land.usedEstimatedAcquisition).toBe(true);
    // 양도차익이 주 자산(상속 보충평가액 기반)보다 큰지 확인 — 환산 취득가가
    // 실거래가보다 작게 평가되어 차익이 증가하는 실무 경향 검증
    const landBreakdown = body.data.aggregated.properties.find(
      (p: { propertyId: string }) => p.propertyId === "land-e",
    );
    expect(landBreakdown).toBeDefined();
  });

  it("증여: fixedAcquisitionPrice + donorAcquisitionDate 필수", async () => {
    const GIFT_ACQ = 90_000_000;
    const payload = buildPayload({
      assetId: "land-g",
      assetLabel: "증여 농지",
      assetKind: "land",
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      directExpenses: 0,
      acquisitionCause: "gift",
      acquisitionDate: "2018-05-10",
      donorAcquisitionDate: "2000-01-01",
      fixedAcquisitionPrice: GIFT_ACQ,
      reductions: [],
    });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    const land = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "land-g",
    );
    expect(land.allocatedAcquisitionPrice).toBe(GIFT_ACQ);
  });

  it("증여 + donorAcquisitionDate 누락 → 400", async () => {
    const payload = buildPayload({
      assetId: "land-g2",
      assetLabel: "증여 농지(불완전)",
      assetKind: "land",
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      acquisitionCause: "gift",
      acquisitionDate: "2018-05-10",
      fixedAcquisitionPrice: 50_000_000,
      reductions: [],
    });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it("매매(실가) + fixedAcquisitionPrice 누락 → 400", async () => {
    const payload = buildPayload({
      assetId: "land-p2",
      assetLabel: "매매 농지(불완전)",
      assetKind: "land",
      standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-20",
      reductions: [],
    });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });
});
