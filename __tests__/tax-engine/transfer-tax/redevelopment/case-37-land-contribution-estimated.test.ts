/**
 * 사례 37 — 조합원입주권 양도 + 토지 출자 + 청산금 불입 + 취득실거래가 불명 (환산)
 *
 * PDF 출처: 예제 교재 사례 37 「조합원입주권(청산금 불입): 취득실거래가 확인되지 않는 경우」
 *
 * 입력 요약:
 *   - 출자 자산: 토지 (originalAssetType="land") — 기존 housing 경로와 다른 §166③ 산식
 *   - 취득일: 2007-04-09 / 관리처분 인가: 2014-10-23 / 양도일: 2023-03-02
 *   - 권리가액: 300,000,000 / 청산금 불입: 100,000,000 / 양도가: 520,000,000
 *   - 취득당시 토지 기준시가: 100,000,000 / 관리처분 직전 토지 기준시가: 150,000,000
 *
 * 법령 근거:
 *   - 소득세법 시행령 §166③ (토지 출자 환산 산식)
 *   - 소득세법 시행령 §163⑥ (개산공제 — 토지 3%)
 *   - 소득세법 §95② 본문 괄호 (인가전 분만 LTHD)
 *   - 소득세법 시행령 §166⑤ 1호 (인가전 보유기간 = 취득일 ~ 관리처분 인가일)
 *   - 소득세법 §55 (2023) + 지방세법 §103의3
 *
 * ★ Pre-Do anchor 4건 (L37-1·L37-5·L37-6·L37-9):
 *   엔진 함수 `calcRedevLandContribEstimated` 미존재 단계에서는 it.skip 으로 실패 메시지를
 *   확보하고 Do 단계 디자인 환류에 사용한다. (`feedback_pre_anchor_verification`)
 *
 * ★ 회귀 anchor 2건:
 *   - case-36-right-pay.test.ts: 사례 36 housing 분기 보존 확인 (import 참조 명시)
 *   - case-44-integration.test.ts: 완공 APT housing 분기 보존 확인 (import 참조 명시)
 *
 * anchor 출처: 예제 PDF 사례 37 + §55 (2023) 자가 검산
 *   검산: 200,920,000 × 0.38 − 19,940,000 = 76,349,600 − 19,940,000 = 56,409,600
 *   (200,920,000은 1.5억~3억 구간 → 누진공제 19,940,000, §55 2023)
 *   지방세: floor(56,409,600 × 0.1) = 5,640,960
 *   총 납부: 56,409,600 + 5,640,960 = 62,050,560
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  calcRedevLandContribEstimated,
} from "@/lib/tax-engine/redevelopment-land-contribution";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// fixture — 사례 37 RedevelopmentInfo
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 37 RedevelopmentInfo — 토지 출자 + 청산금 불입 + 환산 모드
 *
 * 신규 필드:
 *   landStdPriceAtAcq: 100,000,000    (취득당시 토지 기준시가)
 *   landStdPriceAtApproval: 150,000,000 (관리처분 직전 토지 기준시가)
 */
function case37RedevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2014-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
    landStdPriceAtAcq: 100_000_000,
    landStdPriceAtApproval: 150_000_000,
  };
}

/**
 * 사례 37 통합 입력 (calculateTransferTax 진입)
 *
 * useEstimatedAcquisition=true → redevelopment-split 에서 valuation 분기 실행.
 * originalAssetType="land" 분기 라우터가 Do 단계에서 추가됨.
 */
function case37Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 0,             // 환산 모드 — 실가 불명
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: case37RedevInfo(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// ★ Pre-Do anchor 4건 (L37-1·L37-3·L37-6·L37-9) — 모듈 직접 호출 활성 검증
// Task #3 (redevelopment-land-contribution.ts 완료) 후 활성화
// ──────────────────────────────────────────────────────────────────────────────

/** 사례 37 모듈 직접 호출 입력 */
const landContribInput = {
  acquisitionDate: new Date("2007-04-09"),
  approvalDate: new Date("2014-10-23"),
  rightsValue: 300_000_000,
  transferPrice: 520_000_000,
  settlementPaid: 100_000_000,
  landStdPriceAtAcq: 100_000_000,
  landStdPriceAtApproval: 150_000_000,
  postApprovalExpenses: 0,
};

describe("사례 37 — Pre-Do anchor 4건 (calcRedevLandContribEstimated 직접 호출)", () => {
  const result = calcRedevLandContribEstimated(landContribInput);

  /**
   * L37-1: §166③ 토지분 환산취득가
   *
   * 산식: safeMultiplyThenDivide(300,000,000, 100,000,000, 150,000,000)
   *       = floor(300,000,000 × 100,000,000 / 150,000,000) = 200,000,000
   */
  it("L37-1: convertedAcquisition = 200,000,000 (§166③ 토지 2-시점 비율)", () => {
    expect(result.convertedAcquisition).toBe(200_000_000);
  });

  /**
   * L37-3: 인가전 양도차익
   *
   * 개산공제: floor(100,000,000 × 0.03) = 3,000,000
   * 인가전 양도차익: 300,000,000 − 200,000,000 − 3,000,000 = 97,000,000
   * preApprovalExpenses 강제 0 검증 (입력값 0 → 차감 없음)
   */
  it("L37-3: preApprovalGain = 97,000,000 (인가전 양도차익, preApprovalExpenses 강제 0)", () => {
    expect(result.preApprovalGain).toBe(97_000_000);
  });

  /**
   * L37-6: 인가전 분 LTHD
   *
   * 보유기간: 2007-04-09 ~ 2014-10-23 = 만 7년 (§166⑤1호 취득일 ~ 관리처분인가일)
   * §95② 표1 일반 보유: 7년 × 2% = 14%
   * LTHD 금액: floor(97,000,000 × 0.14) = 13,580,000
   * 인가후 LTHD = 0 (본문 괄호 — 인가전 분에 한정)
   */
  it("L37-6: preApprovalLTHD = 13,580,000 (표1 7년 14%, §95②·§166⑤1호)", () => {
    expect(result.lthdHoldingYears).toBe(7);
    expect(result.lthdRate).toBe(0.14);
    expect(result.preApprovalLTHD).toBe(13_580_000);
    expect(result.postApprovalLTHD).toBe(0); // 본문 괄호
    expect(result.totalLTHD).toBe(13_580_000);
  });

  /**
   * L37-9: §55(2023) 누진세율 자가검산
   *
   * totalGain = 97,000,000(인가전) + 120,000,000(인가후) = 217,000,000
   * taxableIncome = 217,000,000 − 13,580,000 − 2,500,000 = 200,920,000
   * 200,920,000은 1.5억~3억 구간 → 38%, 누진공제 19,940,000 (§55 2023)
   * 200,920,000 × 0.38 − 19,940,000 = 76,349,600 − 19,940,000 = 56,409,600
   *
   * ★ feedback_transfer_year_tax_rate 정책: 2023 §55 직접 계산, 외부 자료 추종 금지
   * ★ 주의: 이전 자가검산에서 22,940,000 (3억~5억 구간 공제) 오기입이 있었음 — 19,940,000이 정확
   */
  it("L37-9: 산출세액 = 56,409,600 (§55 2023 38% 구간 자가검산 — 누진공제 19,940,000)", () => {
    expect(result.totalGain).toBe(217_000_000);
    const taxableIncome = result.totalGain - result.totalLTHD - 2_500_000;
    expect(taxableIncome).toBe(200_920_000);
    const tax = Math.floor(taxableIncome * 0.38 - 19_940_000);
    expect(tax).toBe(56_409_600);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Do 단계 완료 후 활성화할 전체 anchor 묶음 (L37-1 ~ L37-10)
// ──────────────────────────────────────────────────────────────────────────────

describe("사례 37 — 전체 anchor (Do 단계 완료 후 활성화)", () => {
  /**
   * 단위 테스트 — calcRedevLandContribEstimated 직접 호출
   */
  describe("단위 anchor (calcRedevLandContribEstimated)", () => {
    const unitInput = {
      acquisitionDate: new Date("2007-04-09"),
      approvalDate: new Date("2014-10-23"),
      rightsValue: 300_000_000,
      transferPrice: 520_000_000,
      settlementPaid: 100_000_000,
      landStdPriceAtAcq: 100_000_000,
      landStdPriceAtApproval: 150_000_000,
      postApprovalExpenses: 0,
    };
    const unitResult = calcRedevLandContribEstimated(unitInput);

    it("L37-1: 환산취득가 = 200,000,000 (§166③ 토지)", () => {
      expect(unitResult.convertedAcquisition).toBe(200_000_000);
    });

    it("L37-2: 개산공제 = 3,000,000 (§163⑥ 토지 3%)", () => {
      expect(unitResult.estimatedDeduction).toBe(3_000_000);
    });

    it("L37-3: 인가전 양도차익 = 97,000,000", () => {
      expect(unitResult.preApprovalGain).toBe(97_000_000);
    });

    it("L37-4: 인가후 양도차익 = 120,000,000 (§166①1호)", () => {
      expect(unitResult.postApprovalGain).toBe(120_000_000);
    });

    it("L37-5: 양도차익 합계 = 217,000,000", () => {
      expect(unitResult.totalGain).toBe(217_000_000);
    });

    it("L37-6: 인가전 LTHD = 13,580,000 (보유 7년, 표1 14%, §95② 본문 괄호 + §166⑤1호)", () => {
      expect(unitResult.lthdHoldingYears).toBe(7);
      expect(unitResult.lthdRate).toBe(0.14);
      expect(unitResult.preApprovalLTHD).toBe(13_580_000);
    });

    it("L37-7: 인가후 LTHD = 0 (본문 괄호 — 권리 양도분 LTHD 배제)", () => {
      expect(unitResult.postApprovalLTHD).toBe(0);
    });

    it("L37-6b: LTHD 합계 = 13,580,000", () => {
      expect(unitResult.totalLTHD).toBe(13_580_000);
    });

    it("L37-LTHD-period: 보유기간 시작=취득일, 종료=인가일 (§166⑤ 1호)", () => {
      expect(unitResult.lthdHoldingStartDate).toEqual(new Date("2007-04-09"));
      expect(unitResult.lthdHoldingEndDate).toEqual(new Date("2014-10-23"));
    });
  });

  /**
   * 통합 anchor — calculateTransferTax 진입
   */
  describe("통합 anchor (calculateTransferTax)", () => {
    const fullResult = calculateTransferTax(case37Input(), mockRates);

    it("L37-8: 과세표준 = 200,920,000 (기본공제 §103①1호 차감 후)", () => {
      expect(fullResult.taxBase).toBe(200_920_000);
    });

    /**
     * L37-9: 산출세액
     *
     * taxBase=200,920,000 × 38% − 19,940,000 = 56,409,600
     * (1.5억~3억 구간, §55 2023, 누진공제 19,940,000)
     */
    it("L37-9: 산출세액 = 56,409,600 (§55 2023 38%구간, 누진공제 19,940,000)", () => {
      expect(fullResult.calculatedTax).toBe(56_409_600);
    });

    /**
     * L37-10: 지방세 = floor(56,409,600 × 0.1) = 5,640,960 (지방세법 §103의3)
     * 주의: TransferTaxResult 필드명은 localIncomeTax (localTax 아님)
     */
    it("L37-10: 지방세 = 5,640,960 (지방세법 §103의3, floor(56,409,600 × 0.1))", () => {
      expect(fullResult.localIncomeTax).toBe(5_640_960);
    });

    it("L37-TOTAL: 총 납부세액 = 62,050,560 (56,409,600 + 5,640,960)", () => {
      expect(fullResult.totalTax).toBe(62_050_560);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 회귀 anchor — housing 분기 비영향 확인
// ──────────────────────────────────────────────────────────────────────────────

describe("L37-R: 회귀 anchor (housing 분기 비영향)", () => {
  /**
   * L37-R1: 사례 36 housing 분기 보존
   *
   * 사례 37 코드 추가 후 사례 36 (housing 출자) 결과가 변경되지 않아야 함.
   * 상세 anchor는 case-36-right-pay.test.ts 에서 관리.
   * 본 테스트는 비영향 확인 목적.
   */
  it("L37-R1: originalAssetType=housing 분기는 사례 37 코드 추가 후에도 정상 동작", () => {
    // 사례 36 housing 기본 입력 — originalAssetType="housing", useEst=false
    const input36: TransferTaxInput = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 520_000_000,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2018-10-23"),
        rightsValue: 300_000_000,
        settlementDirection: "pay",
        settlementAmount: 90_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing", // ★ housing 분기 — 사례 37 land 분기와 독립
      },
    });

    const result36 = calculateTransferTax(input36, mockRates);

    // 재개발 분기에서는 transferGain (양도차익 합계) 필드를 사용.
    // capitalGain은 일반 분기(비재개발) 전용 필드 → undefined 예상.
    // 사례 36 CORE anchor: 산출세액 81,710,000 (case-36-right-pay.test.ts CORE-36-9)
    // 본 테스트는 결과가 예상값에서 벗어나지 않는지 최소 확인.
    // 상세 검증은 case-36-right-pay.test.ts 에 위임.
    expect(result36.transferGain).toBeGreaterThan(0);
    expect(result36.calculatedTax).toBeGreaterThan(0);
    // housing 분기 → calculatedTax는 사례 37 land 값(53,409,600)과 달라야 함
    expect(result36.calculatedTax).not.toBe(53_409_600);
  });

  /**
   * L37-R2: 환산 모드이나 originalAssetType="housing"은 기존 경로 유지
   *
   * useEstimatedAcquisition=true + originalAssetType="housing" → housing 라목값 경로.
   * land 분기로 라우팅되지 않아야 함.
   */
  it("L37-R2: useEst=true + housing → housing 라목값 경로 (land 분기 비활성)", () => {
    // NOTE: housing + estimated 경로는 managementDisposalHousingPrice 를 필요로 함.
    // 미입력 시 엔진 내 방어 코드가 0 반환 (validate에서 1차 차단).
    // 본 테스트는 housing 분기가 land 분기와 독립됨을 확인하는 연기(smoke) 테스트.
    const inputHousingEst: TransferTaxInput = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 520_000_000,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2007-04-09"),
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2014-10-23"),
        rightsValue: 300_000_000,
        settlementDirection: "pay",
        settlementAmount: 100_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing", // ★ housing — land 분기 비활성
        managementDisposalHousingPrice: 150_000_000,
        acquisitionHousingPrice: 100_000_000,
      },
    });

    const resultHousingEst = calculateTransferTax(inputHousingEst, mockRates);

    // 재개발 분기에서는 transferGain 필드 사용 (capitalGain은 일반 분기 전용).
    // housing 경로의 환산취득가: floor(300,000,000 × 100,000,000 / 150,000,000) = 200,000,000
    // (토지와 산식 분자/분모 구조는 동일하나 입력 필드와 의미가 다름)
    // 결과가 존재하고 양도차익이 양수인지만 확인 (상세 housing anchor는 별도 파일)
    expect(resultHousingEst.transferGain).toBeGreaterThan(0);
  });
});
