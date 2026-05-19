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
});
