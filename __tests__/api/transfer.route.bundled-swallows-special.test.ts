/**
 * 함께양도(bundled)가 특수 계산 경로를 **삼킨다** — 라우트 if-체인 순서 결함.
 *
 * ## 원인
 *
 * `app/api/calc/transfer/route.ts`는 순서 있는 if-체인이고 **일괄 분기가 맨 앞**이다:
 *
 * ```
 * 5-a   일괄(bundled)    :446  → return :555
 * 5-a-2 겸용주택 분리계산  :568  → return :604
 * 5-a-3 일반건물          :611  → return :646
 * 5-b   단건             :660  → return :678
 * ```
 *
 * companion이 하나라도 있으면 `bundledOk`가 참이 되어 **뒤쪽 특수 분기는 실행조차 되지 않는다**.
 * 부담부증여(§159 STEP 0.48)도 일괄 집계 경로에서 안분 결과에 덮여 결과에 나타나지 않는다.
 *
 * 화면에는 특수 입력이 그대로 보이는데 계산에서만 빠지므로 **사용자가 알 수 없다**.
 *
 * ## 이 테스트가 지키는 것
 *
 * 각 기능을 **단건 ↔ 함께양도 대조**로 돌려 "단건에서는 나오는 산출물이 함께양도에서는 사라진다"를
 * 고정한다. 이 대조 구조가 판별력의 핵심이다 — 단건 쪽이 녹색이어야 소실이 입증된다.
 *
 * 계산 자체는 `transfer-tax-validate.ts`가 **차단**하므로 사용자에게 도달하지 않는다.
 * 본 테스트는 **차단이 풀렸을 때 무슨 일이 일어나는지**를 문서화하는 회귀 방어선이다
 * (차단만 테스트하면 왜 막는지가 코드에서 사라진다).
 *
 * 실측: 2026-07-28. 상가(commercial_building)는 전용 분기가 없어 **미확인** — 별도 판단.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const COMMON = {
  transferPrice: 500_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

/** companion 1건 — bundled 진입용 (apportioned 모드) */
const COMPANION = {
  companionAssets: [
    {
      assetId: "c1",
      assetLabel: "다른 주택",
      assetKind: "housing" as const,
      standardPriceAtTransfer: 400_000_000,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2010-01-01",
      fixedAcquisitionPrice: 111_000_000,
      reductions: [] as unknown[],
      isOneHousehold: false,
    },
  ],
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 400_000_000,
};

const MIXED = {
  ...COMMON,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2009-03-01",
    buildingAcquisitionDate: "2009-03-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

const REDEV = {
  ...COMMON,
  propertyType: "redevelopment_apt" as const,
  redevelopment: {
    subject: "apt" as const,
    approvalLawBasis: "urban_renovation_art_74" as const,
    approvalDate: "2018-06-20",
    rightsValue: 400_000_000,
    settlementDirection: "pay" as const,
    settlementAmount: 0,
    preApprovalExpenses: 0,
    originalAssetType: "housing" as const,
    acquisitionStdPrice: 200_000_000,
    managementDisposalStdPrice: 400_000_000,
  },
};

const BURDENED = {
  ...COMMON,
  propertyType: "housing" as const,
  transferType: "burdened_gift" as const,
  burdenedGiftInfo: {
    valuationMode: "sangjeungbeop_standard" as const,
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 300_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_001,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_001,
    donorRelation: "lineal_descendant" as const,
  },
};

/** 단건 ↔ 함께양도 대조. marker가 단건에만 있으면 "일괄이 삼켰다"는 뜻이다. */
async function compare(payload: object, marker: string) {
  const single = await POST(req(payload));
  const bundled = await POST(req({ ...payload, ...COMPANION }));
  const [sBody, bBody] = [await single.json(), await bundled.json()];
  return {
    singleStatus: single.status,
    bundledStatus: bundled.status,
    singleMode: sBody.data?.mode,
    bundledMode: bBody.data?.mode,
    inSingle: JSON.stringify(sBody).includes(marker),
    inBundled: JSON.stringify(bBody).includes(marker),
  };
}

const GB = {
  ...COMMON,
  propertyType: "general_building" as const,
  generalBuildingValuation: {
    landArea: 100,
    buildingFootprintArea: 50,
    transferLandPricePerSqm: 2_000_000,
    transferBuildingStdPrice: 200_000_000,
    acqLandPricePerSqm: 1_000_000,
    acqBuildingStdPrice: 100_000_000,
    buildingAcquisitionCause: "purchase" as const,
    zoneType: "general_residential" as const,
  },
};

describe("함께양도가 특수 계산 경로를 삼킨다 (라우트 if-체인 순서)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("🔴 겸용주택 — 단건 mode=mixed-use / 함께양도에서 분리계산 소실", async () => {
    const r = await compare(MIXED, "housingPart");
    expect(r.singleStatus).toBe(200);
    expect(r.singleMode).toBe("mixed-use");
    expect(r.inSingle, "단건 대조군이 녹색이어야 소실이 입증된다").toBe(true);
    expect(r.bundledMode).toBe("bundled");
    expect(r.inBundled, "일괄에서 겸용 분리계산이 사라진다").toBe(false);
  });

  it("🔴 재개발 — 단건에는 redevelopment 산출물, 함께양도에서 소실", async () => {
    const r = await compare(REDEV, "redevelopment");
    expect(r.singleStatus).toBe(200);
    expect(r.inSingle).toBe(true);
    expect(r.inBundled).toBe(false);
  });

  it("🔴 일반건물 — 단건 토지·건물 분리 안분이 함께양도에서 소실", async () => {
    const r = await compare(GB, "generalBuilding");
    expect(r.singleStatus).toBe(200);
    expect(r.inSingle).toBe(true);
    expect(r.inBundled).toBe(false);
  });

  it("🔴 일반건물 — 단건 필수 검증(zoneType)조차 함께양도에서는 타지 않는다", async () => {
    // 분기 미실행의 **결정적 증거**: 단건이면 500으로 막히는 입력이 일괄에서는 200으로 통과한다.
    const noZone = {
      ...GB,
      generalBuildingValuation: { ...GB.generalBuildingValuation, zoneType: undefined },
    };
    const single = await POST(req(noZone));
    const bundled = await POST(req({ ...noZone, ...COMPANION }));
    expect(single.status).toBe(500);
    expect(bundled.status).toBe(200);
  });

  it("🔴 부담부증여 — §159 채무비율이 함께양도에서 소실 (대조군)", async () => {
    const r = await compare(BURDENED, "debtRatio");
    expect(r.singleMode).toBe("single");
    expect(r.inSingle).toBe(true);
    expect(r.inBundled).toBe(false);
  });
});
