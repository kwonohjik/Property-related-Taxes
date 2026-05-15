/**
 * R-5 anchor — 입주권(right) + 청산금 수령 (§166①2호)
 *
 * 법령 근거:
 *   - 시행령 §166①2호 가목 — 청산금 수령분 양도차익
 *       = 청산금 수령액 − (취득가액 × 청산금수령액 / 평가액)
 *   - 시행령 §166①2호 나목 — 인가전 양도차익(입주권 분)
 *       = (권리가액 − 취득가액) × (평가액 − 청산금수령액) / 평가액
 *       ※ 입주권 부분 양도차익은 나목 산식으로 축소됨
 *   - 시행령 §166⑤1호 — 인가전 LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 *   - §95② 단서 — 입주권 양도 시 인가전 분만 LTHD
 *   - §95② settlement 분 zeroBranch 사유:
 *       §94①2호 (조합원입주권 = 부동산을 취득할 수 있는 권리) + §166①2호 가목 산식 구조상
 *       청산금 분은 권리 이전에 따른 정산금으로, §95② 본문 "토지 또는 건물" 범위 외.
 *       집행기준상 입주권 양도 시 LTHD는 인가전 분(§166⑤1호)만 적용하는 것이 지배적 해석.
 *       → 현행 엔진: zeroBranch (보수적, 납세자 과세 안전 적용) — 별도 법령해석 확보 전 유지.
 *   - §55 (2024년 누진세율표 — 2023년과 동일 세율 구조)
 *
 * 입력:
 *   - propertyType: "right_to_move_in", redevSubject: "right"
 *   - 취득일: 2010-05-15, 양도일: 2024-04-10
 *   - 관리처분 인가일: 2020-08-20
 *   - 취득가액: 200,000,000
 *   - 권리가액: 500,000,000, 청산금 수령: 80,000,000
 *   - 양도가액(입주권): 600,000,000 (right+receive 엔진은 transferPrice 미사용)
 *   - settlementSaleDate: 2024-04-10
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 미충족 (표1 적용)
 *   - 원조합원
 *
 * 계산 근거:
 *   [인가전 양도차익 raw] = 권리가 500M − 취득가 200M = 300,000,000
 *
 *   [§166①2호 가목: 청산금 수령분 양도차익]
 *   안분 취득가 = floor(200M × 80M / 500M) = floor(16,000,000,000 / 500M) = 32,000,000
 *   settlement gain = 80M − 32M = 48,000,000
 *
 *   [§166①2호 나목: 인가전 분 축소]
 *   preApprovalGainAdjusted = floor(300M × (500M − 80M) / 500M)
 *                           = floor(300M × 420M / 500M)
 *                           = floor(126,000,000,000 / 500M)
 *                           = 252,000,000
 *
 *   [LTHD — 인가전 분만, §95② 단서]
 *   보유: 2010-05-15 ~ 2020-08-20 = 10년 3개월+ → 10년
 *   표1 (1세대1주택 미충족): 10년 × 2% = 20%
 *   preApproval.lthd = floor(252M × 0.20) = 50,400,000
 *   settlement.lthd = 0 (zeroBranch — §94①2호 + 집행기준)
 *
 *   [합계]
 *   total_gain = 252M + 48M = 300,000,000
 *   양도소득금액 = 300M − 50.4M = 249,600,000
 *   과세표준 = 249.6M − 2.5M = 247,100,000
 *   2024년 §55: 150M~300M 구간 → 38% − 누진공제 19,940,000
 *   산출세액 = floor(247,100,000 × 0.38) − 19,940,000 = 93,898,000 − 19,940,000 = 73,958,000
 *   지방소득세 = floor(73,958,000 × 0.1) = 7,395,800
 *   총납부세액 = 81,353,800
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// 공용 fixture
// ──────────────────────────────────────────────────────────────────────────────

function baseRedevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2020-08-20"),
    rightsValue: 500_000_000,
    settlementDirection: "receive",
    settlementAmount: 80_000_000,
    settlementSaleDate: new Date("2024-04-10"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
}

function baseInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 600_000_000, // right+receive: 입주권 양도가 (§166①2호 나목 산식에서는 미사용)
    transferDate: new Date("2024-04-10"),
    acquisitionDate: new Date("2010-05-15"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: baseRedevInfo(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// R-5 기본 시나리오 — right + receive + 1세대1주택 미충족
// ──────────────────────────────────────────────────────────────────────────────

describe("R-5 — 입주권(right) + 청산금 수령 (§166①2호 가목·나목) — 분기별 정합 검증", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-5-1] 청산금 수령분 양도차익 (가목) = 48,000,000", () => {
    // §166①2호 가목: 청산금수령액 − (취득가 × 청산금 / 권리가)
    // = 80M − floor(200M × 80M / 500M) = 80M − 32M = 48,000,000
    expect(result.redevelopmentDetail?.settlement.gain).toBe(48_000_000);
  });

  it("[R-5-2] 인가전 분 양도차익 (나목 축소 후) = 252,000,000", () => {
    // §166①2호 나목: floor(300M × (500M − 80M) / 500M) = floor(300M × 420M / 500M)
    // = floor(126,000,000,000 / 500M) = 252,000,000
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(252_000_000);
  });

  it("[R-5-3] 인가전 분 LTHD = 50,400,000 (252M × 20% — 표1, 보유 10년)", () => {
    // 보유기간: 2010-05-15 ~ 2020-08-20 = 10년 3개월+ → 10년
    // 표1 (1세대1주택 미충족): 10년 × 2% = 20%
    // floor(252,000,000 × 0.20) = 50,400,000
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(50_400_000);
  });

  it("[R-5-4] settlement LTHD = 0 (zeroBranch — §94①2호 + 집행기준 보수적 적용)", () => {
    // §94①2호: 조합원입주권 = 부동산을 취득할 수 있는 권리 (토지/건물 범위 외)
    // §166①2호 가목 청산금분: 집행기준상 LTHD 미적용 (보수적 해석)
    // 별도 법령해석 확보 전 zeroBranch 유지
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
  });

  it("[R-5-5a] 양도소득금액 = 249,600,000 ((252M − 50.4M) + 48M)", () => {
    // total_gain = 252M + 48M = 300M
    // total_lthd = 50.4M + 0 = 50.4M
    // 양도소득금액 = 300M − 50.4M = 249,600,000
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(249_600_000);
  });

  it("[R-5-5b] ★ 산출세액 = 73,958,000 (2024년 §55 누진세율표 직접 적용)", () => {
    // 과세표준 = 249.6M − 2.5M = 247,100,000
    // 2024년 §55: 150M~300M 구간 → 38% − 누진공제 19,940,000
    // floor(247,100,000 × 0.38) − 19,940,000 = 93,898,000 − 19,940,000 = 73,958,000
    // (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`)
    expect(result.calculatedTax).toBe(73_958_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-5-6 — settlementSaleDate 동작 확인 (right+receive 분기)
// ──────────────────────────────────────────────────────────────────────────────

describe("R-5-6 — settlementSaleDate 동작 확인 (right+receive 분기)", () => {
  it("[R-5-6] right+receive 분기는 splitReceive 호출 — settlementSaleDate 는 LTHD 미사용", () => {
    // right+receive 분기 (computeRightReceive): splitReceive()로 안분
    // settlementSaleDate는 apt+receive 분기의 LTHD 종료일 계산에만 사용 (§95④)
    // right 분기: settlement.lthd = zeroBranch → settlementSaleDate 무관
    const noSaleDateInput = baseInput({
      redevelopment: {
        ...baseRedevInfo(),
        settlementSaleDate: undefined, // 미입력
      },
    });
    const result = calculateTransferTax(noSaleDateInput, mockRates);
    // settlement.lthd = 0 → settlementSaleDate 없어도 동일 결과
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
    expect(result.calculatedTax).toBe(73_958_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-5 안분 취득가 검증 (splitReceive 내부 정합)
// ──────────────────────────────────────────────────────────────────────────────

describe("R-5 splitReceive 정합 — 안분 취득가 검증", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-5-acq] settlement.apportionedAcquisition = 32,000,000", () => {
    // floor(200M × 80M / 500M) = floor(32,000,000) = 32,000,000
    expect(result.redevelopmentDetail?.settlement.apportionedAcquisition).toBe(32_000_000);
  });

  it("[R-5-total] total gain = 300,000,000 (preApproval 252M + settlement 48M)", () => {
    expect(result.redevelopmentDetail?.total.gain).toBe(300_000_000);
  });
});
