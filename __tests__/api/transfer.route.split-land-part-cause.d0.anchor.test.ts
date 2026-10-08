/**
 * anchor: 주택 토지·건물 분리 계산의 **토지 파트 취득원인** 입력 규칙 — Phase D0 (2026-10-08)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §2.3 G-1·G-2·G-3 / §4 D0
 *
 * ⑫는 `landAcquisitionCause` 4종을 의존 검사 없이 받았고 엔진은 그중 일부를 조용히 틀리게 계산했다.
 * 변경 전 실측(이 파일의 RED 기준값 — 같은 시드):
 *   G-1 토지 `carryover_gift`(증여자 2005) = 단순 `gift`와 결정세액 동일 149,060,000 · 토지 보유 4년·장특 8%
 *       (§95④ 단서면 증여자 취득일부터 21년 · 30%) → 엔진이 이월과세를 무시했다
 *   G-2 상속 토지 + 환산 → 200, 토지 취득가 100,000,000(환산)·개산공제 3,000,000, 결정세액 173,820,000
 *       (일반건물은 같은 조합을 막는다 — §163⑨ 평가액이 실지거래가액)
 *   G-3 상속 토지 + 피상속인 취득일 미입력 → 200, 세율 60%(통산 없이 단기)
 * 변경 후: 셋 다 400(⑫). 엔진 직접 호출도 같은 규칙으로 던진다(D0-E).
 * 긍정 짝(D0-P): 피상속인 취득일을 넣은 상속 토지(실가)는 그대로 계산되고 통산이 적용된다(기본세율 42%).
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
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

/** 주택, 양도 12억(토지 7억/건물 5억), 별개 취득, 파트 실가(토지 3억·건물 4억). 매매/매매 결정세액 118,660,000. */
const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2026-06-30",
  acquisitionDate: "2018-03-02",
  landAcquisitionDate: "2008-05-10",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 500_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 500_000_000,
  landAcquisitionPrice: 300_000_000,
  buildingAcquisitionPrice: 400_000_000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(over: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await POST(req({ ...BASE, ...over }));
  return { status: res.status, body: await res.json() };
}

/** 400 본문에서 ⑫ 메시지를 모은다(경로와 무관하게 문구로 단언). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messages = (body: any): string => JSON.stringify(body.error ?? body);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("D0 토지 파트 취득원인 규칙 — 주택 분리 계산", () => {
  it("D0-0 기준: 매매/매매 결정세액 118,660,000 (손계산)", async () => {
    const { status, body } = await post({});
    expect(status).toBe(200);
    expect(body.data.result.determinedTax).toBe(118_660_000);
  });

  it("D0-1 (G-1) 토지 이월과세(carryover_gift)는 400 — 종전 단순 증여와 같은 149,060,000으로 조용히 계산", async () => {
    const { status, body } = await post({
      acquisitionDate: "2012-03-02",
      landAcquisitionDate: "2022-01-10",
      landAcquisitionCause: "carryover_gift",
      landDonorAcquisitionDate: "2005-01-01",
    });
    expect(status).toBe(400);
    expect(messages(body)).toContain("이월과세로 계산하는 기능은 지원하지 않습니다");
  });

  it("D0-1′ 단순 증여(gift)는 그대로 계산 — G-1 차단이 증여 전체를 막지 않는다", async () => {
    const { status, body } = await post({
      acquisitionDate: "2012-03-02",
      landAcquisitionDate: "2022-01-10",
      landAcquisitionCause: "gift",
      landDonorAcquisitionDate: "2005-01-01",
    });
    expect(status).toBe(200);
    expect(body.data.result.determinedTax).toBe(149_060_000);
    // 단순 증여는 §104②2호 통산 대상이 아니다 — 토지 보유는 증여일부터 4년
    expect(body.data.result.splitDetail.land.holdingYears).toBe(4);
  });

  it("D0-2 (G-2) 상속 토지 + 환산은 400 — 종전 200·환산 1억·개산공제 300만", async () => {
    const { status, body } = await post({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1995-01-01",
      landAcqMode: "estimated",
      landAcquisitionPrice: undefined,
      standardPricePerSqmAtAcquisition: 500_000,
      acquisitionArea: 200,
    });
    expect(status).toBe(400);
    expect(messages(body)).toContain("상속·증여로 취득한 토지는 취득가액을 환산취득가");
  });

  it("D0-2′ 증여 토지 + 감정가액도 400 (§163⑨는 증여도 같다)", async () => {
    const { status, body } = await post({
      landAcquisitionCause: "gift",
      landAcqMode: "appraisal",
    });
    expect(status).toBe(400);
    expect(messages(body)).toContain("상속·증여로 취득한 토지는 취득가액을 환산취득가");
  });

  it("D0-3 (G-3) 상속 토지 + 피상속인 취득일 미입력은 400 — 종전 200·세율 60%", async () => {
    const { status, body } = await post({
      isOneHousehold: true,
      householdHousingCount: 1,
      transferPrice: 1_500_000_000,
      landTransferPrice: 900_000_000,
      buildingTransferPrice: 600_000_000,
      landStandardPriceAtTransfer: 900_000_000,
      buildingStandardPriceAtTransfer: 600_000_000,
      acquisitionDate: "2015-01-10",
      landAcquisitionDate: "2025-02-01",
      landAcquisitionCause: "inheritance",
    });
    expect(status).toBe(400);
    expect(messages(body)).toContain("피상속인 취득일이 필요합니다");
  });

  it("D0-P 긍정 짝: 피상속인 취득일을 넣은 상속 토지(실가)는 계산되고 §104②1호 통산 — 세율 42%", async () => {
    const { status, body } = await post({
      isOneHousehold: true,
      householdHousingCount: 1,
      transferPrice: 1_500_000_000,
      landTransferPrice: 900_000_000,
      buildingTransferPrice: 600_000_000,
      landStandardPriceAtTransfer: 900_000_000,
      buildingStandardPriceAtTransfer: 600_000_000,
      acquisitionDate: "2015-01-10",
      landAcquisitionDate: "2025-02-01",
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "2000-01-01",
    });
    expect(status).toBe(200);
    expect(body.data.result.appliedRate).toBe(0.42);
  });
});

/**
 * ⑫ 단독 — 엔진도 같은 규칙으로 던지므로(D0-E) route 400만으로는 ⑫가 빠져도 통과한다(겹친 방어).
 * 스키마를 직접 파싱해 ⑫가 **그 칸에** 오류를 붙이는지 본다.
 */
describe("D0-Z ⑫ 스키마 단독", () => {
  const issuePaths = (body: object) => {
    const r = propertySchema.safeParse(body);
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("주 자산: 이월과세·추계·피상속인 취득일 각각 해당 칸", () => {
    expect(issuePaths({ ...BASE, landAcquisitionCause: "carryover_gift" })).toContain("landAcquisitionCause");
    expect(
      issuePaths({ ...BASE, landAcquisitionCause: "gift", landAcqMode: "estimated", standardPricePerSqmAtAcquisition: 500_000, acquisitionArea: 200 }),
    ).toContain("landAcqMode");
    expect(issuePaths({ ...BASE, landAcquisitionCause: "inheritance" })).toContain("landDecedentAcquisitionDate");
    expect(issuePaths({ ...BASE, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1995-01-01" })).toEqual([]);
  });

  it("컴패니언: 같은 규칙이 companionAssets[i] 경로에 붙는다(종전 컴패니언엔 분리 refine이 없었다)", () => {
    const companion = buildAssetPayload(
      {
        ...makeDefaultAsset(2),
        assetId: "c1",
        assetKind: "housing",
        acquisitionCause: "newConstruction",
        acquisitionDate: "2020-06-01",
        fixedAcquisitionPrice: "400000000",
        landAcquisitionCause: "inheritance",
        landAcquisitionDate: "2015-03-10",
        hasSeperateLandAcquisitionDate: true,
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300000000",
        standardPriceAtTransfer: "400000000",
        landStandardPriceAtTransfer: "250000000",
        buildingStandardPriceAtTransfer: "150000000",
      } as AssetForm,
      "apportioned",
      "2026-06-30",
    ) as Record<string, unknown>;
    const body = {
      propertyType: "land",
      transferDate: "2026-06-30",
      transferPrice: 600_000_000,
      acquisitionDate: "2010-01-01",
      acquisitionPrice: 200_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      reductions: [],
      annualBasicDeductionUsed: 0,
      residencePeriodMonths: 0,
      standardPriceAtTransferForApportion: 400_000_000,
      totalSalePrice: 1_000_000_000,
      companionAssets: [companion],
    };
    expect(companion.landAcquisitionCause, "④가 싣는다(G-4)").toBe("inheritance");
    expect(issuePaths(body)).toContain("companionAssets.0.landDecedentAcquisitionDate");
    expect(issuePaths({ ...body, companionAssets: [{ ...companion, landAcquisitionCause: "carryover_gift" }] })).toContain(
      "companionAssets.0.landAcquisitionCause",
    );
    expect(
      issuePaths({ ...body, companionAssets: [{ ...companion, landDecedentAcquisitionDate: "1995-01-01" }] }).filter((p) =>
        p.startsWith("companionAssets.0.land"),
      ),
    ).toEqual([]);
  });
});
