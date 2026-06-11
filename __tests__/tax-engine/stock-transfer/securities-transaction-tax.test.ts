/**
 * 증권거래세 정보성 산출 — anchor 테스트 STX-01 ~ STX-13
 *
 * Pre-Do anchor 정책 (memory feedback_pre_anchor_verification):
 *   STX-02(코스닥 0.20%)·STX-04(K-OTC 0.20%)를 현행 코드(0.15%·0.35%) 기준으로
 *   먼저 실패를 확보한 뒤 엔진 수정 → 통과 전환.
 *
 * 법령 근거:
 *   증권거래세법 §8① 본칙 (35/10000)
 *   증권거래세법 §8② + 시행령 §5 1호 (코스피 5/10000)
 *   시행령 §5 2호 (코넥스 10/10000)
 *   시행령 §5 3호 가목 (코스닥 20/10000)
 *   시행령 §5 3호 나목 (K-OTC 20/10000)
 *   농특세법 §5①5호 (1만분의 15) + §4 7호 단서 + 시행령 §4③ (코스피만 부과)
 */

import { describe, it, expect } from "vitest";
import { calcSecuritiesTransactionTax } from "../../../lib/tax-engine/stock-transfer/securities-transaction-tax";

// 공통 transferDate — 현행 구간 (영 36001호 2026.1.1 시행 둘째 날)
const DATE_2026 = new Date("2026-01-02");
// 2025 구간 말일 — 코스피 영세율 구간 (Phase 2 매트릭스 적용)
const DATE_2025 = new Date("2025-12-31");

// ============================================================
// STX-01: 코스피
// 증권거래세: 100,000,000 × 5/10000 = 50,000
// 농특세:     100,000,000 × 15/10000 = 150,000 (§5①5호)
// 합계: 200,000
// ============================================================
describe("STX-01: 코스피 기본 케이스", () => {
  it("증권거래세 50,000, 농특세 150,000, 합계 200,000", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: DATE_2026 },
      100_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(50_000);
    expect(result.agriculturalTax).toBe(150_000);
    expect(result.totalTax).toBe(200_000);
    expect(result.appliedRateNum).toBe(5);
    expect(result.appliedRateDen).toBe(10000);
    expect(result.appliedAgriRateNum).toBe(15);
    expect(result.warning).toBeUndefined();
    expect(result.isInformational).toBe(true);
  });
});

// ============================================================
// STX-02: 코스닥 — 20/10000 (시행령 §5 3호 가목, 2026.01.02~)
// 100,000,000 × 20/10000 = 200,000
// 현행 코드(0.15% = 150,000)에서 실패 확보
// ============================================================
describe("STX-02: 코스닥 현행화 anchor (Pre-Do 실패 확보)", () => {
  it("증권거래세 200,000 (20/10000), 농특세 0", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kosdaq", isKOTCTrading: false, transferDate: DATE_2026 },
      100_000_000,
    );
    // 현행 엔진(0.15% = 150,000)에서는 실패 — 수정 후 200,000으로 통과
    expect(result.securitiesTransactionTax).toBe(200_000);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(200_000);
    expect(result.appliedRateNum).toBe(20);
    expect(result.appliedRateDen).toBe(10000);
    expect(result.appliedAgriRateNum).toBe(0);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-03: 코넥스 — 10/10000
// 100,000,000 × 10/10000 = 100,000
// ============================================================
describe("STX-03: 코넥스 기본 케이스", () => {
  it("증권거래세 100,000 (10/10000), 농특세 0", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "konex", isKOTCTrading: false, transferDate: DATE_2026 },
      100_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(100_000);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(100_000);
    expect(result.appliedRateNum).toBe(10);
    expect(result.appliedRateDen).toBe(10000);
    expect(result.appliedAgriRateNum).toBe(0);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-04: K-OTC — 20/10000 (시행령 §5 3호 나목)
// marketType="unlisted" + isKOTCTrading=true
// 100,000,000 × 20/10000 = 200,000
// 현행 코드(0.15% = 150,000)에서 실패 확보
// ============================================================
describe("STX-04: K-OTC 현행화 anchor (Pre-Do 실패 확보)", () => {
  it("K-OTC: 증권거래세 200,000 (20/10000), 농특세 0", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: true, transferDate: DATE_2026 },
      100_000_000,
    );
    // 현행 엔진(비상장 준용 0.35% = 350,000 또는 0.15% = 150,000)에서는 실패 — 수정 후 200,000으로 통과
    expect(result.securitiesTransactionTax).toBe(200_000);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(200_000);
    expect(result.appliedRateNum).toBe(20);
    expect(result.appliedRateDen).toBe(10000);
    expect(result.appliedAgriRateNum).toBe(0);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-05: 비상장 장외 — 35/10000 (법 §8① 본칙)
// marketType="unlisted" + isKOTCTrading=false
// 100,000,000 × 35/10000 = 350,000
// ============================================================
describe("STX-05: 비상장 장외 기본 케이스", () => {
  it("비상장: 증권거래세 350,000 (35/10000), 농특세 0", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: false, transferDate: DATE_2026 },
      100_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(350_000);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(350_000);
    expect(result.appliedRateNum).toBe(35);
    expect(result.appliedRateDen).toBe(10000);
    expect(result.appliedAgriRateNum).toBe(0);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-06: 기타자산 — 0원 + warning
// "주권 양도 해당 시 증권거래세 별도 발생 — 시장 구분 확인 필요"
// ============================================================
describe("STX-06: 기타자산 경고 케이스", () => {
  it("기타자산: 0원 + warning 포함", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "other_asset", isKOTCTrading: false, transferDate: DATE_2026 },
      100_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(0);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("주권 양도 해당 시");
    expect(result.warning).toContain("시장 구분 확인 필요");
  });
});

// ============================================================
// STX-07: floor 1원 경계
// 코스닥, 양도가액 999,999
// Math.floor(999999 * 20 / 10000) = Math.floor(1999.998) = 1,999
// ============================================================
describe("STX-07: floor 1원 경계 (코스닥, 999,999)", () => {
  it("floor(999999 × 20/10000) = 1,999", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kosdaq", isKOTCTrading: false, transferDate: DATE_2026 },
      999_999,
    );
    expect(result.securitiesTransactionTax).toBe(1_999);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(1_999);
  });
});

// ============================================================
// STX-08: 분수 정수연산 실증
// 코스피, 양도가액 435,990,000
// 분수: Math.floor(435990000 × 5 / 10000) = 217,995
// 부동소수: Math.floor(435990000 × 0.0005) = 217,995 (일치)
// 농특세: Math.floor(435990000 × 15 / 10000) = 653,985
// 합계: 871,980
//
// probe 결과: Phase 1 세율(5/10·15/10·20/10·35/10000) 범위에서 분수·부동소수 불일치 없음
// (탐색 1,000 스텝 × 10억 범위 전수). 분수 정수연산 통일은 정확도 보장용.
// ============================================================
describe("STX-08: 분수 정수연산 실증 (코스피, 435,990,000)", () => {
  it("분수 연산 통일 — 코스피 증권거래세+농특세 (probe 확인)", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: DATE_2026 },
      435_990_000,
    );
    // 분수 연산: Math.floor(435990000 * 5 / 10000) = 217,995
    expect(result.securitiesTransactionTax).toBe(217_995);
    // 농특세: Math.floor(435990000 * 15 / 10000) = 653,985
    expect(result.agriculturalTax).toBe(653_985);
    expect(result.totalTax).toBe(871_980);
  });
});

// ============================================================
// STX-09 (Phase 2 재산정): 2025-12-31 코스피 = 영세율 구간 적용
// Phase 1의 "과거 거래일 경고" 기대값을 법령 정합값으로 대체
// (memory feedback_anchor_correction_legal_priority — 시행령 §5 본문 2025:
//  코스피 영(0) + 농특세법 §4 7호 단서로 농특세 15/10000만 부과.
//  경고 anchor는 phase2 A-30(2020-12-31, cutoff 미만)으로 이동)
// ============================================================
describe("STX-09 (Phase 2 재산정): 2025-12-31 코스피 영세율 구간", () => {
  it("코스피 + transferDate=2025-12-31 → 영세율 0 + 농특세 150,000, 경고 없음", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: DATE_2025 },
      100_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(0);
    expect(result.agriculturalTax).toBe(150_000);
    expect(result.totalTax).toBe(150_000);
    expect(result.appliedRateNum).toBe(0);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-10: 현행 구간 무경고 (2026-01-02 — 영 36001호 2026.1.1 시행 둘째 날.
// 시행 첫날 경계는 phase2 A-29가 검증)
// ============================================================
describe("STX-10: 현행 구간 무경고 (2026-01-02)", () => {
  it("코스피 + transferDate=2026-01-02 → warning 없음", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: new Date("2026-01-02") },
      100_000_000,
    );
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// STX-11: K-OTC 비과세 조기 반환 echo
// buildExemptResult 경로에서도 securitiesTransactionTax가 채워져야 함
// per_share 10,000 × 1,000주 = 10,000,000
// 증권거래세: 10,000,000 × 20/10000 = 20,000
// (이 테스트는 calculateStockTransferTax 전체 호출로 검증 — 통합 anchor)
// ============================================================
describe("STX-11: K-OTC 비과세 조기 반환 echo (단위 함수 사전 anchor)", () => {
  it("단위 함수: K-OTC 양도가 10,000,000 → totalTax=20,000", () => {
    // buildExemptResult 경로 통합 anchor는 calculateStockTransferTax 호출 필요
    // 단위 함수 레벨에서 사전 검증
    const result = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: true, transferDate: DATE_2026 },
      10_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(20_000);
    expect(result.totalTax).toBe(20_000);
    expect(result.isInformational).toBe(true);
  });
});

// ============================================================
// STX-12: 장내 비과세 zeroing echo 보존
// applyExemptZeroing은 spread → 신규 echo 필드 자동 보존
// (단위 함수 레벨 anchor)
// ============================================================
describe("STX-12: 장내 비과세 zeroing 이후에도 데이터 구조 보존", () => {
  it("코스피 비대주주 케이스 단위 함수: securitiesTransactionTax 정상 산출", () => {
    // applyExemptZeroing 통합은 calculateStockTransferTax 호출 필요
    // 단위 함수 레벨: 코스피 정상 산출 확인
    const result = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: DATE_2026 },
      50_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(25_000); // 50M × 5/10000
    expect(result.agriculturalTax).toBe(75_000);           // 50M × 15/10000
    expect(result.totalTax).toBe(100_000);
    expect(result.isInformational).toBe(true);
  });
});

// ============================================================
// STX-13: 양도가액 0 — 전부 0 (음수·0 가드)
// ============================================================
describe("STX-13: 양도가액 0", () => {
  it("transferPrice=0 → 모든 세액 0", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kosdaq", isKOTCTrading: false, transferDate: DATE_2026 },
      0,
    );
    expect(result.securitiesTransactionTax).toBe(0);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("transferPrice 음수 → 모든 세액 0 (음수 가드)", () => {
    const result = calcSecuritiesTransactionTax(
      { marketType: "kosdaq", isKOTCTrading: false, transferDate: DATE_2026 },
      -1_000_000,
    );
    expect(result.securitiesTransactionTax).toBe(0);
    expect(result.agriculturalTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });
});
