/**
 * R-3 anchor — 입주권(right) + 청산금 납부 + 1세대1주택 + 12억 초과 안분
 *
 * 법령 근거:
 *   - 시행령 §166①1호 — 입주권 + 청산금 납부 시 인가후 + 인가전 단순 합산
 *   - §95③ + 시행령 §160 — 12억 초과분 과세대상 안분
 *
 * ⚠️ **2026-08-25 fixture 정정 (E3-03 · C1-03)** — 세액·산식은 그대로, **요건 2개를 채웠다**.
 *
 * §95③의 문언은 「제89조제1항제3호에 따라 … 제외되는 고가주택 … **및 같은 항 제4호 각 목 외의
 * 부분 단서에 따라 양도소득의 비과세대상에서 제외되는 조합원입주권**에 해당하는 자산의 …」이다.
 * 즉 조합원입주권의 12억 안분은 **§89①4호 본문·각 목 요건을 충족해 「단서로 제외된」 경우**에만
 * 성립한다. 종전 fixture는 `householdHousingCount: 1`만 두고
 *   · 본문 요건(인가일 현재 §89①3호가목 기존주택 소유) = `exemptionEligibleAtApproval`
 *   · 나목 요건(그 1주택 취득일부터 3년 이내 양도)     = `otherHouseAcquisitionDate`
 * 둘 다 비워 둔 채 안분을 기대했다 — 엔진이 「세대 주택수 1」만으로 안분을 걸고 있었기 때문이다
 * (E3-03. 요건 미충족 사안에 안분이 걸려 실측 Δ 409,152,700 과소).
 *
 * 엔진을 조문에 맞춘 뒤 이 fixture는 **요건을 선언해야** 같은 경로를 탄다. 산식·기대값은
 * 1원도 바뀌지 않았다 — 바뀐 것은 「그 안분이 legal하게 성립하는가」의 전제뿐이다.
 *   - 시행령 §166⑤1호 — 인가전 LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 *   - §95② 본문 괄호 — 입주권 양도 시 인가전 분만 LTHD (인가후·청산금 분 0)
 *   - §55 (2023년 누진세율표) — 양도연도 직접 적용 (외부 PDF 추종 금지)
 *
 * 입력:
 *   - propertyType: "right_to_move_in", redevSubject: "right"
 *   - 취득일: 2002-04-09, 양도일: 2023-03-02
 *   - 관리처분 인가일: 2018-10-23
 *   - 취득가액: 100,000,000
 *   - 권리가액: 300,000,000, 청산금 납부: 90,000,000
 *   - 양도가액: 1,500,000,000 (12억 초과)
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 (householdHousingCount=1), 거주 2년 충족
 *   - 원조합원 (isSuccessorRightToMoveIn=false)
 *
 * 계산 근거:
 *   [안분 전]
 *   인가전 양도차익 = 300M − 100M = 200,000,000
 *   인가후 양도차익 = 1,500M − (300M + 90M) = 1,110,000,000 → settlement 분기에 배치
 *   (right+pay: postApprovalExistingHouse.gain=0, settlement.gain=인가후양도차익 §166①1호)
 *
 *   [12억 안분] taxableRatio = (1,500M − 1,200M) / 1,500M = 0.2
 *   preApproval.gain = floor(200M × 0.2) = 40,000,000
 *   settlement.gain  = floor(1,110M × 0.2) = 222,000,000
 *   total 과세대상 = 262,000,000
 *
 *   [LTHD] 인가전 분만 (§95② 본문 괄호)
 *   보유: 2002-04-09 ~ 2018-10-23 = 16년 6개월+ → 16년
 *   표2 (1세대1주택 + 거주 2년): 16년×4%=64%→40% 캡 + 2년×4%=8% = 48%
 *   preApproval.lthd = floor(40,000,000 × 0.48) = 19,200,000
 *   settlement.lthd = 0 (§95② 단서)
 *
 *   [세액] 과세표준 = (262M − 19.2M) − 2.5M = 240,300,000
 *   2023년 §55: 150M~300M 구간 → 38% − 누진공제 19,940,000
 *   산출세액 = floor(240,300,000 × 0.38) − 19,940,000
 *           = 91,314,000 − 19,940,000 = 71,374,000
 *   지방소득세 = floor(71,374,000 × 0.1) = 7,137,400
 *   총납부세액 = 78,511,400
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
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 90_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    // §89①4호 본문 — 인가일 현재 §89①3호가목 기존주택 소유 (자기선언)
    exemptionEligibleAtApproval: true,
    // §89①4호 나목 — 그 1주택 취득일. 2021-06-01 취득 → 2023-03-02 양도 = 1년 9개월 < 3년
    otherHouseAcquisitionDate: new Date("2021-06-01"),
  };
}

function baseInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    householdRightCount: 1,
    residencePeriodMonths: 24, // 거주 2년 (표2 진입 가드)
    redevelopment: baseRedevInfo(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// R-3 기본 시나리오 — right + pay + 1세대1주택 + 12억 초과
// ──────────────────────────────────────────────────────────────────────────────

describe("R-3 — 입주권(right) + 청산금 납부 + 1세대1주택 + 양도가 15억 (12억 초과 안분)", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-3-1] 안분 전 인가전 양도차익 원본 (gainBeforeAllocation)", () => {
    // 안분 전: 권리가 300M − 취득가 100M = 200,000,000
    // applyHighValueAllocation 후 gainBeforeAllocation 에 원본 보존
    expect(result.redevelopmentDetail?.preApproval.gainBeforeAllocation).toBe(200_000_000);
  });

  it("[R-3-2] 12억 안분비 = 0.2 (= (1,500M − 1,200M) / 1,500M)", () => {
    // 시행령 §160: taxableRatio = (양도가 − 12억) / 양도가
    expect(result.redevelopmentDetail?.highValueAllocation?.taxableRatio).toBeCloseTo(0.2, 10);
  });

  it("[R-3-3a] 안분 후 인가전 분 양도차익 = 40,000,000 (200M × 0.2 floor)", () => {
    // scaleBranch: floor(200M × 0.2) = 40,000,000
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(40_000_000);
  });

  it("[R-3-3b] 안분 후 인가전 분 LTHD = 19,200,000 (40M × 48% — 표2, 보유16년+거주2년)", () => {
    // 표2: 보유 16년 × 4% = 64% → 40% 캡, 거주 2년 × 4% = 8% → 합계 48%
    // floor(40,000,000 × 0.48) = 19,200,000
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(19_200_000);
  });

  it("[R-3-4a] 인가후 기존주택분 LTHD = 0 (§95② 본문 괄호 — 입주권 양도 시 부존재)", () => {
    // right 분기: postApprovalExistingHouse는 항상 gain=0, lthd=0
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.lthd).toBe(0);
  });

  it("[R-3-4b] settlement(=인가후) LTHD = 0 (§95② 본문 괄호 — §94①2호 권리 범위 외)", () => {
    // right 분기 settlement는 zeroBranch → LTHD 0
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
  });

  it("[R-3-5] LTHD율: 표2 48% (보유 16년 × 4% = 40% 캡 + 거주 2년 × 4% = 8%)", () => {
    // preApproval.lthdRate = 0.40 + 0.08 = 0.48
    expect(result.redevelopmentDetail?.preApproval.lthdRate).toBeCloseTo(0.48, 5);
  });

  it("[R-3-6] 총 LTHD = 19,200,000 (인가전 분만)", () => {
    // 3분기 합: 19,200,000 + 0 + 0 = 19,200,000
    expect(result.longTermHoldingDeduction).toBe(19_200_000);
  });

  it("[R-3-7] ★ 산출세액 = 71,374,000 (2023년 §55 누진세율표 직접 적용)", () => {
    // 과세대상 = 40M + 222M = 262M (preApproval + settlement 안분 후)
    // LTHD = 19,200,000
    // 양도소득금액 = 262M − 19.2M = 242,800,000
    // 과세표준 = 242.8M − 2.5M = 240,300,000
    // 2023년 §55: 150M~300M 구간 → 38% − 누진공제 19,940,000
    // 산출세액 = floor(240,300,000 × 0.38) − 19,940,000 = 91,314,000 − 19,940,000 = 71,374,000
    // (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`)
    expect(result.calculatedTax).toBe(71_374_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-3-8 — 안분비 0 검증: 양도가 = 12억 정확히 → isHighValue=false → 전액 과세
// ──────────────────────────────────────────────────────────────────────────────

/**
 * R-3-8 — 12억 **경계**.
 *
 * ⚠️ **2026-08-25 기대값 정정**: 종전 제목은 「안분 미발동 — 전액 **과세**, 비과세 아님」이었다.
 *    그 전제는 이 fixture가 §89①4호 요건을 충족하지 못한다는 것이었는데(요건 2필드 미입력),
 *    엔진이 요건을 보지 않아 12억 초과에서는 안분이 걸리고 12억 이하에서는 아무 일도 없는
 *    **자기모순**이 그대로 spec에 굳어 있었다.
 *
 *    요건을 채운 지금은 조문대로다 — §89①4호 각 목 외의 부분 단서는 「양도 당시 실지거래가액이
 *    **12억원을 초과**하는 경우에는 양도소득세를 과세한다」이므로, **정확히 12억이면 초과가
 *    아니라 전액 비과세**다. 경계는 12억 초과 여부 하나로 일관된다.
 */
describe("R-3-8 — 양도가 12억 정확히 (§89①4호 단서 미발동 → 전액 비과세)", () => {
  const input12 = baseInput({ transferPrice: 1_200_000_000 });
  const result12 = calculateTransferTax(input12, mockRates);

  it("[R-3-8a] 12억 정확히 → 안분 미발동 (highValueAllocation 미부착)", () => {
    expect(result12.redevelopmentDetail?.highValueAllocation).toBeUndefined();
    expect(result12.redevelopmentDetail?.oneRightHighValueApplied).toBeUndefined();
  });

  it("[R-3-8b] 12억 정확히 → §89①4호 나목 전액 비과세 (「12억원을 초과하는 경우」가 아니다)", () => {
    expect(result12.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(result12.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(result12.redevelopmentDetail?.preApproval.gain).toBe(0);
    expect(result12.totalTax).toBe(0);
  });

  it("[R-3-8c] 12억 + 1원 → 단서 발동, 안분 과세로 전환 (경계 구별력)", () => {
    const over = calculateTransferTax(baseInput({ transferPrice: 1_200_000_001 }), mockRates);
    // 전액 비과세 → 안분 과세로 **분기가 바뀐다**. 다만 안분비가 1/12억이라 과세대상 양도차익은
    // 사실상 0이고 세액도 0이다 — 경계에서 세액이 튀지 않는다(불연속 없음)는 것 자체가 확인점이다.
    expect(over.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
    expect(over.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(over.redevelopmentDetail?.preApproval.gainBeforeAllocation).toBe(200_000_000);
    expect(over.redevelopmentDetail?.preApproval.gain).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-3 회귀 — settlement 분기 scaleBranch 적용 검증
// ──────────────────────────────────────────────────────────────────────────────

describe("R-3 scaleBranch — settlement(=인가후) 분기 12억 안분 정상 적용", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-3-scaleBranch-1] settlement 안분 후 gain = 222,000,000 (1,110M × 0.2 floor)", () => {
    // right+pay: settlement.gain = floor(1,110,000,000 × 0.2) = 222,000,000
    expect(result.redevelopmentDetail?.settlement.gain).toBe(222_000_000);
  });

  it("[R-3-scaleBranch-2] settlement 비과세 gain = 888,000,000 (1,110M − 222M)", () => {
    expect(result.redevelopmentDetail?.settlement.nontaxableGain).toBe(888_000_000);
  });
});
