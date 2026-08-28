/**
 * R-5 anchor — 입주권(right) + 청산금 수령 (§166①2호)
 *
 * ★ 2026-05-15 법령 원문 재확인 후 가목 산식 정정 (commit: 엔진 §166①2호 가목 산식 정정):
 *   법제처 소득세법 시행령 §166①2호 가목 원문:
 *     "[양도가액 − (기존건물과 그 부수토지의 평가액 − 지급받은 청산금) − 필요경비]"
 *   이전 구현: settlement.gain = 청산금 수령액 − 안분취득가액  (법령 불일치 — 폐기)
 *   정정 후:  settlement.gain = 양도가액 − (평가액 − 수령청산금) − 인가후 필요경비  (법령 원문 일치)
 *
 * 법령 근거 (law.go.kr 확인 2026-05-15):
 *   - §166①2호 가목 — 인가후 분 양도차익:
 *       양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
 *   - §166①2호 나목 — 인가전 양도차익(나목 축소):
 *       [(평가액 − 취득가액 − 필요경비)] × [(평가액 − 지급받은 청산금) ÷ 평가액]
 *   - §166⑤1호 — 인가전 LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 *   - §95② 본문 괄호 — 입주권 양도 시 인가전 분만 LTHD
 *
 * 입력:
 *   - propertyType: "right_to_move_in", redevSubject: "right"
 *   - 취득일: 2010-05-15, 양도일: 2024-04-10
 *   - 관리처분 인가일: 2020-08-20
 *   - 취득가액: 200,000,000
 *   - 권리가액: 500,000,000, 청산금 수령: 80,000,000
 *   - 양도가액(입주권): 600,000,000
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 미충족 (표1 적용)
 *
 * 계산 근거 (정정 후 §166①2호 법령 원문 기준):
 *   [인가전 양도차익 raw] = 권리가 500M − 취득가 200M = 300,000,000
 *   salePriceTotal = 평가액 − 청산금 = 500M − 80M = 420,000,000
 *
 *   [§166①2호 가목: 인가후 분 양도차익]
 *   settlement.gain = 양도가액 − (평가액 − 청산금) − 인가후 필요경비
 *                   = 600M − 420M − 0 = 180,000,000
 *
 *   [§166①2호 나목: 인가전 분 축소]
 *   preApprovalGainAdjusted = floor(300M × 420M / 500M)
 *                           = floor(126,000,000,000 / 500M)
 *                           = 252,000,000
 *
 *   [LTHD — 인가전 분만, §95② 본문 괄호]
 *   보유: 2010-05-15 ~ 2020-08-20 = 10년 3개월+ → 10년
 *   표1 (1세대1주택 미충족): 10년 × 2% = 20%
 *   preApproval.lthd = floor(252M × 0.20) = 50,400,000
 *   settlement.lthd = 0 (zeroBranch — §94①2호 + 집행기준)
 *
 *   [합계]
 *   total.gain = 252M + 180M = 432,000,000
 *   taxableIncome = 432M − 50.4M = 381,600,000
 *   과세표준 = 381.6M − 2.5M = 379,100,000
 *   2024년 §55: 3억~5억 구간 → 40% − 누진공제 25,940,000
 *   산출세액 = floor(379.1M × 0.40) − 25,940,000 = 151,640,000 − 25,940,000 = 125,700,000
 *   지방소득세 = floor(125,700,000 × 0.1) = 12,570,000
 *   총납부세액 = 138,270,000
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

  it("[R-5-1] 인가후 분 양도차익 (가목) = 180,000,000", () => {
    // ★ §166①2호 가목 법령 원문: 양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
    // = 600M − (500M − 80M) − 0 = 600M − 420M = 180,000,000
    expect(result.redevelopmentDetail?.settlement.gain).toBe(180_000_000);
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

  it("[R-5-5a] 양도소득금액 = 381,600,000 ((252M − 50.4M) + 180M)", () => {
    // total.gain = 252M + 180M = 432M
    // total.lthd = 50.4M + 0 = 50.4M
    // 양도소득금액 = 432M − 50.4M = 381,600,000
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(381_600_000);
  });

  it("[R-5-5b] ★ 산출세액 = 125,700,000 (2024년 §55 누진세율표 직접 적용)", () => {
    // 과세표준 = 381.6M − 2.5M = 379,100,000
    // 2024년 §55: 3억~5억 구간 → 40% − 누진공제 25,940,000
    // floor(379,100,000 × 0.40) − 25,940,000 = 151,640,000 − 25,940,000 = 125,700,000
    // (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`)
    expect(result.calculatedTax).toBe(125_700_000);
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
    expect(result.calculatedTax).toBe(125_700_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-5 안분 취득가 검증 (splitReceive 내부 정합)
// ──────────────────────────────────────────────────────────────────────────────

describe("R-5 splitReceive 정합 — 안분 취득가 검증", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-5-acq] settlement.apportionedAcquisition = 420,000,000 (salePriceTotal = 평가액 − 청산금)", () => {
    // ★ 정정: 가목 구조에서 인가후 분 취득가액 = 평가액 − 청산금 (= 500M − 80M = 420M)
    // 이전 값 32M은 잘못된 산식("수령액 − 안분취득가")에서 도출된 값
    expect(result.redevelopmentDetail?.settlement.apportionedAcquisition).toBe(420_000_000);
  });

  it("[R-5-total] total gain = 432,000,000 (preApproval 252M + settlement 180M)", () => {
    expect(result.redevelopmentDetail?.total.gain).toBe(432_000_000);
  });
});
