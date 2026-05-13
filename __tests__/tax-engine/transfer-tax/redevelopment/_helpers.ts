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
 * 사례 44: 2005-04-09 개별주택 취득 → 2009-10-23 관리처분 인가 → 2023-02-16 완공 APT 양도.
 * 청산금 92,781,500 납부분. 환산취득가 (주택분 기준시가 비율).
 *
 * 양도코리아 xlsx anchor:
 *   환산취득가:   141,221,534  (BigInt floor 결과 141,221,532, ±2 차이)
 *   인가전 양도차익: 75,445,917
 *   분양가:        312,000,000
 *   인가후 양도차익: 213,000,000
 *   기존주택분:    149,658,784
 *   청산금 분:      63,341,216
 *   LTHD 합계:      84,000,126
 *   양도소득금액:   204,445,791
 *   과세표준:       201,945,791  (− 기본공제 2,500,000)
 *   산출세액:        56,799,400  ★
 *   지방소득세:       5,679,940  ★
 *   세액합계:        62,479,340  ★
 */
export function case44Input(): RedevelopmentOrchestratorInput {
  return {
    redevelopment: case44RedevelopmentInfo(),
    acquisitionDate: new Date("2005-04-09"),
    transferDate: new Date("2023-02-16"),
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
    redevelopment: {
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
    },
    acquisitionDate: new Date("2007-04-09"),
    transferDate: new Date("2023-02-16"),
    transferPrice: 1_500_000_000,
    actualAcquisitionPrice: 450_000_000,
    useEstimatedAcquisition: false,
    isOneHouseSingle: true,
    residencePeriodMonths: 66, // 5년 6월
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
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2017-07-05"),
      rightsValue: 1_500_000_000,
      settlementDirection: "receive",
      settlementAmount: 500_000_000,
      settlementSaleDate: new Date("2023-02-16"), // 소유권이전 고시일 다음날 (사례 46 양도일과 동일 가정)
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      acquisitionRounding: "floor",
    },
    acquisitionDate: new Date("2016-05-06"),
    transferDate: new Date("2023-02-16"),
    transferPrice: 500_000_000, // 청산금 수령액 (사례 46 양도가액 = 수령액)
    actualAcquisitionPrice: 400_000_000,
    useEstimatedAcquisition: false,
    isOneHouseSingle: false, // 보유 2년 미충족 → 비과세 미달, 일반 과세
    residencePeriodMonths: 0,
  };
}
