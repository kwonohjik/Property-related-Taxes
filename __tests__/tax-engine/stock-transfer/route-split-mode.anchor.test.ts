/**
 * LO-PRE-1 — API 경로 split 모드 회귀 보호
 *
 * 발견: app/api/calc/stock-transfer/route.ts 단건 POST 핸들러(L88~160) + buildEngineInput()(L175~233)
 * 두 곳 모두 acquisitionLots/transferLots/costAllocationMethod/specificMatchings 매핑이 누락되어 있어
 * 기존 split 모드 자체가 API 경로에서 silent stripping 중이었음 (engine 직접 호출 anchor로만 검증되어 미발견).
 *
 * 본 anchor는 route.ts를 직접 호출(Request 시뮬레이션)하여 split 4종 필드가
 * 엔진 input까지 전파되어 result.lotMatchingDetail이 echo되는지 검증.
 */

import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/calc/stock-transfer/route";

describe("LO-PRE-1: route.ts split 모드 — API 경로 회귀 보호", () => {
  it("LO-PRE-1: split body 전송 시 result.lotMatchingDetail이 응답에 포함된다", async () => {
    const body = {
      // 필수 공통 필드 (비상장 대주주 — 과세 경로 확보)
      marketType: "unlisted",
      isMajorShareholder: true,
      selfShareRatio: 0.6,
      selfMarketCap: 2_000_000_000,
      isLargestShareholderGroup: false,
      combinedShareRatio: 0,
      combinedMarketCap: 0,
      priorYearEndDate: "2024-12-31",
      isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false,
      isHeavyRealEstateForValuation: false,
      isSmallMediumEnterprise: true,
      isMidsizeEnterprise: false,
      isListedSmallShareholder: false,
      isVentureCompany: false,
      isKOTCTrading: false,
      acquisitionDate: "2022-01-10",
      transferDate: "2025-07-01",
      shareCount: 1200,
      totalIssuedShares: 1_000_000,
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "per_share",
      perShareTransferPrice: 18000,
      acquisitionMode: "actual",
      acquiredBeforeListing: false,
      tradingHaltAtTransfer: false,
      bookLost: false,
      expenseMode: "actual",
      filingType: "preliminary",
      filingDate: "2025-08-31",
      isElectronicFiling: false,
      filingViolation: "none",
      isFraudulent: false,
      isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0,
      // split 4종 필드 (선결 수정 전: 엔진까지 전파 안 됨)
      costAllocationMethod: "fifo",
      acquisitionLots: [
        {
          id: "a",
          acquisitionDate: "2022-01-10",
          shareCount: 1000,
          perShareAcquisitionPrice: 10000,
          acquisitionCause: "purchase",
        },
        {
          id: "b",
          acquisitionDate: "2023-05-20",
          shareCount: 500,
          perShareAcquisitionPrice: 12000,
          acquisitionCause: "purchase",
        },
      ],
      transferLots: [
        {
          id: "t1",
          transferDate: "2025-07-01",
          shareCount: 1200,
          perShareTransferPrice: 18000,
        },
      ],
    };

    const req = new Request("http://localhost/api/calc/stock-transfer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
    });

    // route.POST는 NextRequest 타입을 받지만 Request 시뮬레이션으로 충분
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();

    // 핵심 검증: lotMatchingDetail이 echo되어야 함 (선결 수정 전은 undefined)
    expect(json.result.lotMatchingDetail).toBeDefined();
    expect(json.result.lotMatchingDetail.matched.length).toBeGreaterThan(0);

    // FIFO: a lot 전량(1000) + b lot 200주 → 취득가 = 1000×10000 + 200×12000 = 12,400,000
    expect(json.result.acquisitionPrice).toBe(12_400_000);
    expect(json.result.transferPrice).toBe(21_600_000); // 1200 × 18000
  });

  // ============================================================
  // 다자산(aggregate) 경로 7필드 보존 회귀 (route buildEngineInput 단일화)
  // 발견: 단건/다자산 매핑 중복으로 buildEngineInput에서 7필드 silent strip
  //   (isOnMarketTransaction·lentSharesCount·pefIndirectSharesCount·
  //    judgmentDateOverride·judgmentBasis·acqFaceValueOnly·acqFaceValuePerShare)
  // 검증: isOnMarketTransaction=false(장외)가 aggregate 경로에서 엔진까지 전파되어
  //   비과세(strip 시 default true→장내 비과세)가 아닌 과세(장외)로 분류되는지.
  // ============================================================
  it("LO-PRE-2: aggregate 경로 isOnMarketTransaction=false 보존 — 장외 과세(비과세 strip 회귀)", async () => {
    const item = {
      // KOSPI 비대주주 + 중소기업 — 장내면 비과세, 장외면 나목 1) 10% 과세
      marketType: "kospi",
      isMajorShareholder: false,
      selfShareRatio: 0.001,
      selfMarketCap: 100_000_000,
      isLargestShareholderGroup: false,
      combinedShareRatio: 0,
      combinedMarketCap: 0,
      priorYearEndDate: "2024-12-31",
      isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false,
      isHeavyRealEstateForValuation: false,
      isSmallMediumEnterprise: true,
      isMidsizeEnterprise: false,
      isListedSmallShareholder: false,
      isVentureCompany: false,
      isKOTCTrading: false,
      // ★ strip 대상 7필드 중 가장 관찰 가능 — 장외 거래 명시
      isOnMarketTransaction: false,
      acquisitionDate: "2022-01-10",
      transferDate: "2025-07-01",
      shareCount: 1000,
      totalIssuedShares: 100_000_000,
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "per_share",
      perShareTransferPrice: 20000,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 10000,
      acquiredBeforeListing: false,
      tradingHaltAtTransfer: false,
      bookLost: false,
      expenseMode: "actual",
      filingType: "preliminary",
      filingDate: "2025-08-31",
      isElectronicFiling: false,
      filingViolation: "none",
      isFraudulent: false,
      isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0,
    };

    const req = new Request("http://localhost/api/calc/stock-transfer", {
      method: "POST",
      body: JSON.stringify({ items: [item], deductionMode: "each_item" }),
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();

    // 장외 거래 보존 → 비과세 아님, 나목 1) 중소기업 10% 과세
    const item0 = json.result.items[0];
    expect(item0.taxCategory).toBe("listed_off_market_non_major");
    // 양도차익 = 20,000,000 - 10,000,000 = 10,000,000
    // 과세표준 = 10,000,000 - 기본공제 2,500,000 = 7,500,000
    // 산출세액 = 7,500,000 × 10% = 750,000
    expect(item0.calculatedTax).toBe(750_000);
  });

  // ============================================================
  // 소칙 §81④ 월할 가산 — API 경로 ⑬⑭ silent strip 방어
  // prePriorYear* 3필드 + monthlyAccrualToggle가 Zod·route·coerce를 통과해
  // 엔진 monthlyAccrualDetail로 echo되는지 (TS 미감지 strip 회귀 보호)
  // ============================================================
  it("LO-PRE-3: §81④ 전전연도 3필드 + 토글이 API 경로로 엔진까지 전파 (monthlyAccrualDetail echo)", async () => {
    const body = {
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.05,
      selfMarketCap: 6_000_000_000,
      isLargestShareholderGroup: false,
      combinedShareRatio: 0,
      combinedMarketCap: 0,
      priorYearEndDate: "2022-12-31",
      isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false,
      isHeavyRealEstateForValuation: false,
      isSmallMediumEnterprise: true,
      isMidsizeEnterprise: false,
      isListedSmallShareholder: false,
      isVentureCompany: false,
      isKOTCTrading: false,
      acquisitionDate: "2024-03-15",
      transferDate: "2025-02-26",
      shareCount: 5_000,
      totalIssuedShares: 100_000,
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "per_share",
      perShareTransferPrice: 8_950,
      acquisitionMode: "estimated",
      acquiredBeforeListing: true,
      listingDate: "2024-10-20", // m=8
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 50_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetIncomePerShare: 50_000,
      acquisitionYearNetAssetPerShare: 5_000,
      // ★ ⑬⑭ strip 대상 — 전전연도 평가 + 월수 + 토글
      prePriorYearNetIncomePerShare: 40_000,
      prePriorYearNetAssetPerShare: 4_000,
      priorBizYearMonths: 12,
      postListingDetail: { unlistedDetailMode: "simple", monthlyAccrualToggle: true },
      tradingHaltAtTransfer: false,
      bookLost: false,
      expenseMode: "estimated",
      filingType: "preliminary",
      filingDate: "2025-08-31",
      isElectronicFiling: false,
      filingViolation: "none",
      isFraudulent: false,
      isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0,
    };

    const req = new Request("http://localhost/api/calc/stock-transfer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();

    // §81④ 1호 보정 발동 — 전전 3필드가 엔진까지 전파됐다는 증거
    const post = json.result.postListingDetail;
    expect(post?.monthlyAccrualApplied).toBe(true);
    expect(post?.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(25_600);
    expect(post?.monthlyAccrualDetail?.holdingMonths).toBe(8);
    expect(post?.monthlyAccrualDetail?.adjustedListingYearPerShareValue).toBe(36_266);
  });
});
