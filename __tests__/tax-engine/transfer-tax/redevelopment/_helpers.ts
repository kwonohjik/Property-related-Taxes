/**
 * 재개발/재건축 양도소득세 — 테스트 공용 fixture
 *
 * 사례 36~46 입력 데이터 표준화 (양도코리아 xlsx 기반).
 * 본 PR primary anchor 는 사례 44 (APT-환산-납부-주택출자).
 *
 * 격리 단위테스트: redevelopment.ts orchestrator (runRedevelopment) 직접 호출.
 * 전체 양도세 산출세액 anchor 는 transfer-tax.ts 통합 후 별도 spec.
 */

import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { RedevelopmentOrchestratorInput } from "@/lib/tax-engine/redevelopment";

// ──────────────────────────────────────────────────────────────────────────────
// 사례 44 — APT-환산-납부-주택출자 (★ PR primary anchor)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 44: 2005-04-09 개별주택 취득 → 2009-10-23 관리처분 인가 → 2026-02-16 완공 APT 양도.
 * 청산금 92,781,500 납부분. 환산취득가 (주택분 기준시가 비율).
 *
 * 양도코리아 SW anchor (2026 개정판 스크린샷 — 양도일 2026-02-16):
 *   환산취득가:   141,221,534  (BigInt floor 결과 141,221,532, ±2 차이)
 *   인가전 양도차익: 75,445,917
 *   분양가:        312,000,000
 *   인가후 양도차익: 213,000,000
 *   기존주택분:    149,658,784
 *   청산금 분:      63,341,216
 *   LTHD 합계:      86,533,774  (청산금분 보유 16년 → 30%; 2023판 26%와 상이)
 *   양도소득금액:   201,912,142
 *   과세표준:       199,412,142  (− 기본공제 2,500,000)
 *   산출세액:        55,836,613  ★
 *   지방소득세:       5,583,661  ★
 *   세액합계:        61,420,274  ★
 */
export function case44Input(): RedevelopmentOrchestratorInput {
  return {
    redevelopment: case44RedevelopmentInfo(),
    acquisitionDate: new Date("2005-04-09"),
    transferDate: new Date("2026-02-16"),
    transferPrice: 525_000_000,
    actualAcquisitionPrice: undefined, // 환산 모드
    useEstimatedAcquisition: true,
    isSuccessorRightToMoveIn: false,
    isOneHouseSingle: false, // 사례 44 는 1세대1주택 아님 (표1 적용)
    residencePeriodMonths: 0,
  };
}

export function case44RedevelopmentInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2009-10-23"),
    rightsValue: 219_218_500,
    settlementDirection: "pay",
    settlementAmount: 92_781_500,
    // §163⑥ 개산공제(취득당시 라목값 × 3% = 2,551,049)는 엔진이 자동 차감.
    // PDF anchor의 "개산공제 2,551,049"는 이 자동 차감으로 재현됨.
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    // PHD 패턴 마이그레이션 (2026-05-13): firstDisclosureDate 미입력 → 본문 미발동
    // 사용자 단일 직접 입력: acquisitionHousingPrice = 85,034,988 (구 acquisitionStdPrice 단일값 그대로)
    // D = managementDisposalHousingPrice = 132,000,000 (구 managementDisposalStdPrice 단일값 그대로)
    // 결과: 환산취득가 = floor(219,218,500 × 85,034,988 / 132,000,000) = 141,221,534 (회귀 보존)
    acquisitionHousingPrice: 85_034_988,
    managementDisposalHousingPrice: 132_000_000,
    acquisitionRounding: "floor",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 45 — APT-실가-납부-주택출자 (1세대1주택 12억 안분 + LTHD 표2)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 45: 2007-04-09 개별주택 취득 → 2013-10-23 관리처분 인가 → 2023-02-16 완공 APT 양도.
 * 청산금 300,000,000 납부. 실가 취득가 450,000,000. 거주 5년 6월.
 * 1세대1주택 12억 초과 → §95③·시행령 §160 안분.
 *
 * 양도코리아 xlsx anchor:
 *   인가전 양도차익:    200,000,000  (650M − 450M − 0)
 *   인가후 양도차익:    541,000,000  (1500M − 950M − 9M)
 *   분양가:             950,000,000  (650M + 300M)
 *   청산금 납부분 양도차익: 170,842,105
 *   12억 안분 비율 = (1500-1200)/1500 = 0.2
 *   과세대상 양도차익:  148,200,000  (= 741M × 0.2)
 *   LTHD 합계 (표2 80% 캡):  74,569,262
 *   양도소득금액:        73,630,738
 *   산출세액:           11,311,377  (본 PR 격리 검증 외 — 12억 안분은 transfer-tax.ts 통합 후)
 */
export function case45Input(): RedevelopmentOrchestratorInput {
  return {
    redevelopment: case45RedevelopmentInfo(),
    acquisitionDate: new Date("2007-04-09"),
    transferDate: new Date("2023-02-16"),
    transferPrice: 1_500_000_000,
    actualAcquisitionPrice: 450_000_000,
    useEstimatedAcquisition: false,
    isOneHouseSingle: true,
    residencePeriodMonths: 66, // legacy fallback (사용 안 됨 — prior/new 사용)
    priorHouseResidenceMonths: 66, // 종전주택 5년 6월
    newHouseResidenceMonths: 0,    // 신축주택 거주 X
  };
}

export function case45RedevelopmentInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 650_000_000,
    settlementDirection: "pay",
    settlementAmount: 300_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 9_000_000,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    priorHouseResidenceMonths: 66,
    newHouseResidenceMonths: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 46 — APT-실가-수령-주택출자 (1세대1주택 보유 2년 미충족 → 비과세 미달)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 46: 2016-05-06 개별주택 취득 → 2017-07-05 관리처분 인가 → 2023-02-16 완공 APT 양도.
 * 청산금 500,000,000 수령. 실가 취득가 400,000,000. 양도 직후 거주 0일.
 *
 * 본 PR 범위: 과세 산출 anchor만 (§166②2호·§166①2호 산식 검증).
 *           시행령 §154 비과세 미달 자동 판정 로직은 후속 PR.
 *
 * 양도코리아 xlsx anchor:
 *   청산금 수령분 양도가액: 500,000,000
 *   안분 취득가액:          133,333,333
 *   청산금 수령분 양도차익: 366,666,667
 *   LTHD (6년 9월, 표1 12%):  44,000,000
 *   양도소득금액:           322,666,667
 *   과세표준:               320,166,667
 *   산출세액:               102,126,666
 */
export function case46Input(): RedevelopmentOrchestratorInput {
  return {
    redevelopment: case46RedevelopmentInfo(),
    acquisitionDate: new Date("2016-05-06"),
    transferDate: new Date("2023-02-17"), // 소유권이전 고시일 익일 (NTS 집행기준)
    transferPrice: 500_000_000, // 청산금 수령액 = 양도가액 (receiveOnly 미러)
    actualAcquisitionPrice: 400_000_000,
    useEstimatedAcquisition: false,
    isOneHouseSingle: false, // exemptionEligibleAtApproval=false 일관 (legacy fallback 안전)
    residencePeriodMonths: 0,
  };
}

export function case46RedevelopmentInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2017-07-05"),
    rightsValue: 1_500_000_000,
    settlementDirection: "receive",
    settlementAmount: 500_000_000,
    settlementSaleDate: new Date("2023-02-17"), // 소유권이전 고시일 익일
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    // 사례 46 신규 — 청산금 수령분 단독 신고 + 인가일 기준 보유 2년 미충족
    receiveOnlyMode: true,
    exemptionEligibleAtApproval: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 47 — 신축APT 양도 + 청산금 수령 동시 신고 (PDF 사례수정 2)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 47: 2001-01-01 구주택 취득 → 2014-02-01 관리처분 인가 → 2022-03-01 신축APT 양도.
 * 평가액 8억, 청산금 수령 2억, 신축APT 양도가 20억, 1세대1주택 + 거주=보유, 21년 보유.
 *
 * PDF 사례수정 2 anchor (이미지 24~25):
 *   인가전 양도차익 = (8억 − 1억) × (8억 − 2억)/8억 = 525,000,000
 *   인가후 양도차익 = 20억 − (8억 − 2억) = 1,400,000,000
 *   청산금 분 양도차익 = 200M − (100M × 2/8) = 175,000,000 (안분 취득가 25M)
 *   12억 초과분 (안분 후) = (525M + 1,400M) × 8/20 = 770,000,000 (settlement는 비과세 제외)
 *   LTHD = 770M × 80% (보유 40% + 거주 40%) = 616,000,000
 *   양도소득금액 = 154,000,000
 *   과세표준 = 151,500,000 (− 기본공제 2.5M)
 *   산출세액 = 38,170,000 (38% − 누진공제 19.4M)
 *
 * 비과세 차감 조건 (§3.4):
 *   - settlementDirection = "receive"
 *   - exemptionEligibleAtApproval = true (1세대1주택 비과세 요건 충족)
 *   - rightsValue ≤ 12억 (8억 ≤ 12억)
 *
 * ★ Pre-Do anchor: 본 테스트는 비과세 차감 로직 구현 전에는 산출세액이 PDF 38.17M과 불일치 (현행 ≈ 44.4M).
 */
export function case47RedevelopmentInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2014-02-01"),
    rightsValue: 800_000_000,
    settlementDirection: "receive",
    settlementAmount: 200_000_000,
    settlementSaleDate: new Date("2022-03-01"), // 소유권이전 고시일 익일 = 양도일
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    // 사례 47 — 신축APT 양도 + 청산금 수령 동시 신고 (사례 46과 달리 receiveOnlyMode=false)
    receiveOnlyMode: false,
    exemptionEligibleAtApproval: true, // 1세대1주택 비과세 요건 충족 (보유 21년 + 거주 21년)
  };
}
