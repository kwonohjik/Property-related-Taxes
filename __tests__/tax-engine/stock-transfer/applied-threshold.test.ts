/**
 * Applied Threshold Echo — anchor 테스트
 *
 * StockTransferResult.appliedThreshold 필드 전파 검증
 * §157 대주주 임계 echo → UI 동기화 (MajorShareholderBlock.tsx 로컬 재계산 버그 수정)
 *
 * Pre-Do anchor (AT-3, AT-7) 우선 실행 → FAIL 메시지 확인 → 구현 후 전체 통과
 * Design v2 §6 Anchor 검증 매트릭스 기준
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 공통 입력 팩토리
// ============================================================

function makeInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 6_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    cumulativeTransferRatio: undefined,
    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

// ============================================================
// Pre-Do anchor — AT-3 (회귀 차단 핵심: konex 4% 임계 확인)
// ============================================================

describe("AT-3 konex 비대주주 장내 비과세 — appliedThreshold.shareRatio === 0.04", () => {
  /**
   * 코넥스 3%·30억 (isKOTCTrading=false) → 비과세
   * 핵심: UI MajorShareholderBlock.tsx가 코스닥 2%를 코넥스에도 적용하는 버그 차단
   * Design v2 AT-3 anchor
   */
  it("konex / 2024-12-31 / selfRatio=0.03 / selfCap=30억 → 비과세 + threshold.shareRatio=0.04", () => {
    const input = makeInput({
      marketType: "konex",
      // 자기 지분율 3% < 코넥스 4% 임계 → 비대주주
      selfShareRatio: 0.03,
      // 시총 30억 < 50억 임계 → 비대주주
      selfMarketCap: 3_000_000_000,
      isKOTCTrading: false,   // 장내거래 → 비과세
      isMajorShareholder: false,
      priorYearEndDate: new Date("2024-12-31"),
    });

    const result = calculateStockTransferTax(input);

    // 비과세 확인
    expect(result.taxCategory).toBe("listed_non_major_in_market");
    expect(result.isExempt).toBe(true);

    // appliedThreshold echo — 코넥스 4% 임계 (버그 차단: 코스닥 2% 매핑 방지)
    expect(result.appliedThreshold).toBeDefined();
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
    expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    expect(result.appliedThreshold?.marketType).toBe("konex");
    expect(result.appliedThreshold?.priorYearEndDate).toBe("2024-12-31");
    expect(result.appliedThreshold?.fromDate).toBe("2024-01-01");
  });
});

// ============================================================
// Pre-Do anchor — AT-7 (exempt 경로 propagation 확인)
// ============================================================

describe("AT-7 kosdaq 상장 비대주주 장내 비과세 — appliedThreshold propagation", () => {
  /**
   * kosdaq 비대주주 (isKOTCTrading=false) → isExempt=true
   * exempt 조기 반환 경로에서도 appliedThreshold가 전파되는지 확인
   * Design v2 AT-7 anchor
   */
  it("kosdaq / 2024-12-31 / selfRatio=0 / selfCap=0 / isKOTCTrading=false → isExempt + threshold echo", () => {
    const input = makeInput({
      marketType: "kosdaq",
      selfShareRatio: 0,
      selfMarketCap: 0,
      isKOTCTrading: false,
      isMajorShareholder: false,
      priorYearEndDate: new Date("2024-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.taxCategory).toBe("listed_non_major_in_market");
    expect(result.isExempt).toBe(true);

    // exempt 경로에서도 appliedThreshold가 전파되어야 함
    expect(result.appliedThreshold).toBeDefined();
    expect(result.appliedThreshold?.marketType).toBe("kosdaq");
    expect(result.appliedThreshold?.shareRatio).toBe(0.02);
    expect(result.appliedThreshold?.fromDate).toBe("2024-01-01");
  });
});

// ============================================================
// AT-1: 코스피 2024.1.1.~ 대주주 (지분율 1.5%·시총 30억)
// ============================================================

describe("AT-1 kospi 현행 임계 — 2024-12-31 기준 대주주", () => {
  /**
   * marketType="kospi" / priorYearEndDate=2024-12-31 / selfShareRatio=0.015 / isMajorShareholder=true
   * Design v2 AT-1 anchor
   */
  it("kospi / 2024-12-31 / selfRatio=1.5% / selfCap=30억 → listed_major + threshold.shareRatio=0.01", () => {
    const input = makeInput({
      marketType: "kospi",
      selfShareRatio: 0.015,
      selfMarketCap: 3_000_000_000,
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("2024-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.taxCategory).toBe("listed_major");
    expect(result.isExempt).toBe(false);
    expect(result.appliedThreshold?.shareRatio).toBe(0.01);
    expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    expect(result.appliedThreshold?.marketType).toBe("kospi");
    expect(result.appliedThreshold?.fromDate).toBe("2024-01-01");
    expect(result.appliedThreshold?.priorYearEndDate).toBe("2024-12-31");
  });
});

// ============================================================
// AT-2: 코스닥 K-OTC 장외 대주주 (지분율 2.5%·시총 60억)
// ============================================================

describe("AT-2 kosdaq K-OTC 대주주 (isKOTCTrading=true) — appliedThreshold", () => {
  /**
   * marketType="kosdaq" / priorYearEndDate=2024-12-31 / selfShareRatio=0.025
   * selfMarketCap=6,000,000,000 / isKOTCTrading=true / isMajorShareholder=true
   * Design v2 AT-2 anchor
   */
  it("kosdaq K-OTC 대주주 → listed_major + threshold.shareRatio=0.02 + marketCap=50억", () => {
    const input = makeInput({
      marketType: "kosdaq",
      selfShareRatio: 0.025,
      selfMarketCap: 6_000_000_000,
      isMajorShareholder: true,
      isKOTCTrading: true,   // K-OTC 장외이지만 대주주이면 과세
      priorYearEndDate: new Date("2024-12-31"),
    });

    const result = calculateStockTransferTax(input);

    // 대주주이면 K-OTC 여부 무관하게 listed_major
    expect(result.taxCategory).toBe("listed_major");
    expect(result.isExempt).toBe(false);
    expect(result.appliedThreshold?.shareRatio).toBe(0.02);
    expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    expect(result.appliedThreshold?.marketType).toBe("kosdaq");
  });
});

// ============================================================
// AT-4: 코스피 2018.4.1.~2020.3.31. 임계 (시총 15억)
// ============================================================

describe("AT-4 kospi 2018-04-01 임계 — 2019-12-31 기준", () => {
  /**
   * marketType="kospi" / priorYearEndDate=2019-12-31 / selfMarketCap=1,500,000,000
   * → 2018.4.1.~ 행 적용: marketCapThreshold=1,500,000,000 / fromDate="2018-04-01"
   * Design v2 AT-4 anchor
   */
  it("kospi / 2019-12-31 / byCap 15억 → threshold.marketCap=15억 + fromDate=2018-04-01", () => {
    const input = makeInput({
      marketType: "kospi",
      selfShareRatio: 0,        // 지분율 조건 미충족
      selfMarketCap: 1_500_000_000,  // 시총 조건만 충족 (byCap)
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("2019-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.taxCategory).toBe("listed_major");
    expect(result.appliedThreshold?.marketCap).toBe(1_500_000_000);
    expect(result.appliedThreshold?.fromDate).toBe("2018-04-01");
    expect(result.appliedThreshold?.marketType).toBe("kospi");
  });
});

// ============================================================
// AT-5: 코스닥 2013.8.29.~ 임계 (2013-09-01 기준 / 지분율 2.5%)
// ============================================================

describe("AT-5 kosdaq 2013-08-29 임계 — 2013-09-01 기준", () => {
  /**
   * marketType="kosdaq" / priorYearEndDate=2013-09-01 / selfShareRatio=0.025
   * → 2013.8.29.~ 행 적용: shareRatioThreshold=0.02 / fromDate="2013-08-29"
   * Design v2 AT-5 anchor
   */
  it("kosdaq / 2013-09-01 / selfRatio=2.5% → threshold.fromDate=2013-08-29 + shareRatio=0.02", () => {
    const input = makeInput({
      marketType: "kosdaq",
      selfShareRatio: 0.025,   // 2.5% > 2% 임계 → 대주주
      selfMarketCap: 0,
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("2013-09-01"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.appliedThreshold?.fromDate).toBe("2013-08-29");
    expect(result.appliedThreshold?.shareRatio).toBe(0.02);
    expect(result.appliedThreshold?.marketType).toBe("kosdaq");
  });
});

// ============================================================
// AT-6: 정상 경로 echo — 코스피 2024 byCap 대주주
// ============================================================

describe("AT-6 정상 경로 echo — kospi 2024 byCap 대주주", () => {
  /**
   * marketType="kospi" / priorYearEndDate=2024-12-31 / selfMarketCap=6,000,000,000
   * 정상 과세 경로에서 appliedThreshold 전파 확인
   * Design v2 AT-6 anchor
   */
  it("kospi / 2024-12-31 / byCap 60억 → isExempt=false + threshold echo", () => {
    const input = makeInput({
      marketType: "kospi",
      selfShareRatio: 0,
      selfMarketCap: 6_000_000_000,
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("2024-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.isExempt).toBe(false);
    expect(result.appliedThreshold?.marketType).toBe("kospi");
    expect(result.appliedThreshold?.fromDate).toBe("2024-01-01");
    expect(result.appliedThreshold?.priorYearEndDate).toBe("2024-12-31");
    expect(result.appliedThreshold?.shareRatio).toBe(0.01);
    expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
  });
});

// ============================================================
// AT-8 갱신 (F-5): 비상장 자동 판정 + appliedThreshold echo
// ============================================================

describe("AT-8 unlisted — 자동 판정 + appliedThreshold echo (F-5 갱신)", () => {
  /**
   * marketType="unlisted" / priorYearEndDate=2024-12-31
   * selfShareRatio=0.05 (5% ≥ 4% 임계) → 자동 판정 대주주
   * 폼 토글 isMajorShareholder=true → 자동 산출과 일치 (불일치 warning 없음)
   *
   * 현행 §167의8①2호:
   * - 가목: 지분율 4% 이상 (KoreanLaw MCP 확인, 2026-05-17)
   * - 나목: 시총 10억원 이상 (동)
   */
  it("unlisted / 2024-12-31 / selfRatio=5% / selfCap=0 → isMajor=true + threshold.shareRatio=0.04", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.05,         // 5% ≥ 4% 임계 → 대주주
      selfMarketCap: 0,
      isMajorShareholder: true,     // 폼 토글 = 자동 산출과 일치
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
    });

    const result = calculateStockTransferTax(input);

    // 비상장도 appliedThreshold echo (F-5 갱신)
    expect(result.appliedThreshold).toBeDefined();
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
    // 현행 §167의8①2나목: 시총 10억 (상장 §157의 50억과 다름)
    expect(result.appliedThreshold?.marketCap).toBe(1_000_000_000);
    expect(result.appliedThreshold?.marketType).toBe("unlisted");
    expect(result.appliedThreshold?.priorYearEndDate).toBe("2024-12-31");
    expect(result.appliedThreshold?.fromDate).toBe("2020-04-01");
    // 불일치 warning 없음 (폼 토글 = 자동 산출)
    expect(result.warnings.some((w) => w.includes("자동 판정"))).toBe(false);
  });
});

// ============================================================
// AT-9: 기타자산 — appliedThreshold undefined
// ============================================================

describe("AT-9 other_asset — appliedThreshold undefined", () => {
  /**
   * marketType="other_asset" → §94①4 별도 트랙
   * Design v2 AT-9 anchor
   */
  it("other_asset + isQualifyingBlockShareholder → appliedThreshold undefined", () => {
    const input = makeInput({
      marketType: "other_asset",
      isQualifyingBlockShareholder: true,
      selfShareRatio: 0.6,
      selfMarketCap: 0,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 10_000,
    });

    const result = calculateStockTransferTax(input);

    expect(result.appliedThreshold).toBeUndefined();
  });
});

// ============================================================
// AT-10: 코스피 1998-12-31 fallback (1900-01-01 행 매칭)
// ============================================================

describe("AT-10 kospi 1998-12-31 fallback — 1900-01-01 행 매칭", () => {
  /**
   * marketType="kospi" / priorYearEndDate=1998-12-31 / selfShareRatio=0.06
   * → 1998년 이전 행 (`from: 1900-01-01`) 매칭
   * Design v2 AT-10 anchor
   */
  it("kospi / 1998-12-31 / selfRatio=6% → fromDate=1900-01-01 + shareRatio=0.05", () => {
    const input = makeInput({
      marketType: "kospi",
      selfShareRatio: 0.06,    // 6% > 5% 임계 → 대주주
      selfMarketCap: 0,
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("1998-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.appliedThreshold?.fromDate).toBe("1900-01-01");
    expect(result.appliedThreshold?.shareRatio).toBe(0.05);
    expect(result.appliedThreshold?.marketType).toBe("kospi");
  });
});

// ============================================================
// AT-11: 코넥스 2013-06-30 fallback (시장 개설 직전 — sorted.length-1 가드)
// ============================================================

describe("AT-11 konex fallback — 2013-06-30 이전 (최초 개설 전)", () => {
  /**
   * marketType="konex" / priorYearEndDate=2013-06-30
   * → 코넥스 최초 임계 2013-07-01 이전이므로 sorted.length-1 fallback
   * Design v2 AT-11 anchor
   */
  it("konex / 2013-06-30 → sorted.length-1 fallback → fromDate=2013-07-01 + shareRatio=0.04", () => {
    const input = makeInput({
      marketType: "konex",
      selfShareRatio: 0.05,
      selfMarketCap: 1_500_000_000,
      isMajorShareholder: true,
      isKOTCTrading: false,
      priorYearEndDate: new Date("2013-06-30"),
    });

    const result = calculateStockTransferTax(input);

    // 코넥스는 2013-07-01이 최초 임계 → 2013-06-30은 fallback 적용
    expect(result.appliedThreshold?.fromDate).toBe("2013-07-01");
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
    expect(result.appliedThreshold?.marketType).toBe("konex");
  });
});

// ============================================================
// AT-12 (F-5 신설): 비상장 비대주주 경계 — 지분율·시총 모두 미충족
// ============================================================

describe("AT-12 unlisted — 비대주주 경계 (3%·4억)", () => {
  /**
   * marketType="unlisted" / priorYearEndDate=2024-12-31
   * selfShareRatio=0.03 (3% < 4% 임계) / selfMarketCap=400,000,000 (4억 < 10억 임계)
   * → 자동 판정 비대주주
   *
   * §167의8①2호 현행 (KoreanLaw MCP 확인):
   * - 가목 4%: 3% 미충족
   * - 나목 10억: 4억 미충족
   * → isMajor = false
   */
  it("unlisted / 2024-12-31 / selfRatio=3% / selfCap=4억 → isMajor=false (비대주주)", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.03,           // 3% < 4% 임계
      selfMarketCap: 400_000_000,     // 4억 < 10억 임계
      isMajorShareholder: false,      // 폼 토글 = 자동 산출 일치
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
    });

    const result = calculateStockTransferTax(input);

    // 비대주주 → 비상장은 §94①3 나목 → 과세 (비과세 아님)
    expect(result.taxCategory).toBe("unlisted_non_major");
    expect(result.isExempt).toBe(false);
    // appliedThreshold는 비대주주여도 echo됨 (비상장 임계 확인용)
    expect(result.appliedThreshold).toBeDefined();
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
    expect(result.appliedThreshold?.marketCap).toBe(1_000_000_000);
    expect(result.appliedThreshold?.marketType).toBe("unlisted");
    // 불일치 warning 없음
    expect(result.warnings.some((w) => w.includes("자동 판정"))).toBe(false);
  });
});

// ============================================================
// AT-13 (F-5 신설): 비상장 2019-12-31 — 2018.4.1.~ 임계 적용 (시총 15억)
// ============================================================

describe("AT-13 unlisted 2019-12-31 — 2018-04-01 임계 행 검증 (시총 15억)", () => {
  /**
   * marketType="unlisted" / priorYearEndDate=2019-12-31
   * selfShareRatio=0 / selfMarketCap=1,500,000,000 (15억)
   * → 2018.4.1.~ 임계 적용: shareRatio=0.04 / marketCap=1,500,000,000
   * → byCap: 15억 ≥ 15억 임계 → 대주주
   *
   * ⚠️ 주의: §167의8 2018~2020 임계는 법제처 연혁 API 미확인 상태.
   * §157 코스닥 개정 패턴 병행 추정값. 실무 재검증 필요 시 확인할 것.
   */
  it("unlisted / 2019-12-31 / selfCap=15억 → byCap 대주주 + fromDate=2018-04-01", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0,
      selfMarketCap: 1_500_000_000,   // 15억 → byCap
      isMajorShareholder: true,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
      priorYearEndDate: new Date("2019-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.appliedThreshold?.marketCap).toBe(1_500_000_000);
    expect(result.appliedThreshold?.fromDate).toBe("2018-04-01");
    expect(result.appliedThreshold?.marketType).toBe("unlisted");
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
  });
});

// ============================================================
// AT-14 (F-5 신설): 비상장 1998-12-31 fallback (1900-01-01 행 매칭)
// ============================================================

describe("AT-14 unlisted 1998-12-31 fallback — 1900-01-01 행 매칭", () => {
  /**
   * marketType="unlisted" / priorYearEndDate=1998-12-31
   * selfShareRatio=0.06 (6%) / selfMarketCap=0
   * → 1900-01-01 fallback 행: shareRatio=0.02 / marketCap=Infinity
   * → byRatio: 6% ≥ 5% → 대주주 (F-6 정정 후)
   *
   * F-6 정정 (2026-05-17): 1900-01-01 fallback 지분율 2% → 5%
   * §94①3 나목 일반 표준 5% 보수적 fallback. 법제처 부칙 미확인.
   */
  it("unlisted / 1998-12-31 / selfRatio=6% → fromDate=1900-01-01 + shareRatio=0.05", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.06,           // 6% ≥ 5% fallback 임계 → 대주주
      selfMarketCap: 0,
      isMajorShareholder: true,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
      priorYearEndDate: new Date("1998-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.appliedThreshold?.fromDate).toBe("1900-01-01");
    expect(result.appliedThreshold?.shareRatio).toBe(0.05);
    expect(result.appliedThreshold?.marketType).toBe("unlisted");
    expect(result.appliedThreshold?.marketCap).toBe(Infinity);
  });
});

// ============================================================
// AT-16 (F-6 신설): 2014년 비상장 회귀 차단 — 지분율 4% 정정 (2%→4%)
// ============================================================

describe("AT-16 unlisted 2014-12-31 — 지분율 4% 임계 (F-6 정정)", () => {
  /**
   * F-6 정정 회귀 차단: 2013-01-01 행 지분율 2% → 4%
   * marketType="unlisted" / priorYearEndDate=2014-12-31 / selfShareRatio=0.03
   * → 변경 전: 3% ≥ 2% → 대주주 (오판)
   * → 변경 후: 3% < 4% → 비대주주 (정정)
   */
  it("unlisted / 2014-12-31 / selfRatio=3% → byRatio=false (비대주주)", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.03,
      selfMarketCap: 0,
      isMajorShareholder: false,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
      priorYearEndDate: new Date("2014-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.taxCategory).toBe("unlisted_non_major");
    expect(result.appliedThreshold?.fromDate).toBe("2013-01-01");
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
    expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
  });
});

// ============================================================
// AT-17 (F-6 신설): 2010년 비상장 회귀 차단 — 1900 fallback 5% 정정 (2%→5%)
// ============================================================

describe("AT-17 unlisted 2010-12-31 — fallback 5% 임계 (F-6 정정)", () => {
  /**
   * F-6 정정 회귀 차단: 1900-01-01 fallback 지분율 2% → 5%
   * marketType="unlisted" / priorYearEndDate=2010-12-31 / selfShareRatio=0.04
   * → 변경 전: 4% ≥ 2% → 대주주 (오판)
   * → 변경 후: 4% < 5% → 비대주주 (정정)
   */
  it("unlisted / 2010-12-31 / selfRatio=4% → byRatio=false (fallback 5% 기준)", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.04,
      selfMarketCap: 0,
      isMajorShareholder: false,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
      priorYearEndDate: new Date("2010-12-31"),
    });

    const result = calculateStockTransferTax(input);

    expect(result.taxCategory).toBe("unlisted_non_major");
    expect(result.appliedThreshold?.fromDate).toBe("1900-01-01");
    expect(result.appliedThreshold?.shareRatio).toBe(0.05);
  });
});

// ============================================================
// AT-15 (F-5 신설): warning — 비상장 폼 토글 불일치
// ============================================================

describe("AT-15 unlisted — 폼 토글 vs 자동 산출 불일치 warning", () => {
  /**
   * marketType="unlisted" / priorYearEndDate=2024-12-31
   * selfShareRatio=0.01 (1% < 4%) / selfMarketCap=500,000,000 (5억 < 10억)
   * → 자동 산출: false (비대주주)
   * → 폼 토글 isMajorShareholder=true (사용자 직접 true 선택)
   * → 자동 산출 우선 + warnings에 불일치 메시지 추가
   */
  it("unlisted / 자동 산출 false + 폼 토글 true → warnings에 불일치 메시지", () => {
    const input = makeInput({
      marketType: "unlisted",
      selfShareRatio: 0.01,           // 1% < 4% → 자동 산출 false
      selfMarketCap: 500_000_000,     // 5억 < 10억 → 자동 산출 false
      isMajorShareholder: true,       // 폼 토글 = true (불일치!)
      acquisitionMode: "actual",
      perShareAcquisitionPrice: 20_000,
    });

    const result = calculateStockTransferTax(input);

    // 자동 산출 우선 → 비대주주 적용
    expect(result.taxCategory).toBe("unlisted_non_major");
    // warnings에 불일치 메시지 포함
    expect(result.warnings.some((w) => w.includes("자동 판정"))).toBe(true);
    // appliedThreshold는 여전히 echo됨
    expect(result.appliedThreshold).toBeDefined();
    expect(result.appliedThreshold?.shareRatio).toBe(0.04);
  });
});
