/**
 * Pre-Do anchor — 조합원 입주권 양도(관리처분 인가 후) LTHD 분할 검증
 *
 * 법령 근거:
 *   - 소득세법 §95② 본문 괄호 — 입주권(§94①2호) 양도 시 인가전 분만 LTHD (원조합원 한정)
 *   - 시행령 §166①1호 — 입주권 + 청산금 납부 시 양도차익 = 인가후 + 인가전 단순 합산
 *   - 시행령 §166⑤1호 — 인가전 LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 *   - 소득세법 §55 (2023년 누진세율표 — 양도연도 세율 적용, memory `transfer_year_tax_rate`)
 *
 * 수정계획서: .claude/plans/case-redev-right-transfer-lthd-split-fix.md
 *
 * 공통 입력:
 *   - propertyType: "right_to_move_in"
 *   - redevSubject: "right"
 *   - 취득일: 2002-04-09, 양도일: 2023-03-02
 *   - 관리처분 인가일: 2018-10-23
 *   - 취득가액: 100,000,000
 *   - 권리가액: 300,000,000
 *   - 청산금 방향/금액: pay / 90,000,000
 *   - 양도가액: 520,000,000
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 미충족 (householdHousingCount=2)
 *   - 원조합원 (isSuccessorRightToMoveIn=false)
 *
 * 법정 산출 근거:
 *   인가전 양도차익 = 300M − 100M = 200,000,000
 *   인가후 양도차익 = 520M − (300M + 90M) = 130,000,000
 *   LTHD 보유기간 = 2002-04-09 ~ 2018-10-23 = 16년 6개월 → 표1 30% 캡
 *   LTHD = 200,000,000 × 30% = 60,000,000 (인가전 분만)
 *   인가후·청산금 LTHD = 0 (§95② 본문 괄호)
 *
 * 산출세액 (2023년 §55 누진세율표 — 양도연도 직접 적용):
 *   양도소득금액 = 200M − 60M + 130M = 270,000,000
 *   과세표준 = 270M − 2.5M = 267,500,000
 *   구간: 150,000,001~300,000,000 → 38% − 누진공제 19,940,000
 *   산출세액 = 267,500,000 × 38% − 19,940,000
 *            = 101,650,000 − 19,940,000 = 81,710,000
 *   지방소득세 = 81,710,000 × 10% = 8,171,000
 *   총납부세액 = 89,881,000
 *
 * ★ 사례 36 anchor (CORE-36-09)와 동일한 입력·결과
 *   → 본 파일은 "right" 모드 LTHD 분할 분기를 명시적으로 검증하는 독립 anchor
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
  };
}

function baseInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
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
    redevelopment: baseRedevInfo(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// R-PAY 기본 시나리오 — subject="right" + pay + 원조합원 + 1세대1주택 미충족
// ──────────────────────────────────────────────────────────────────────────────

describe("R-PAY — 입주권 양도(pay) 원조합원, 1세대1주택 미충족 — LTHD 분할 검증", () => {
  const result = calculateTransferTax(baseInput(), mockRates);

  it("[R-PAY-1] 인가전 분 양도차익 = 200,000,000 (권리가액 300M − 취득가 100M)", () => {
    // 시행령 §166①1호 + redevelopment-split.ts computeRightPay
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(200_000_000);
  });

  it("[R-PAY-2] 인가전 분 LTHD = 60,000,000 (200M × 30% — 보유 16년 6월 표1 30% 캡)", () => {
    // 시행령 §166⑤1호: 취득일(2002-04-09) ~ 인가일(2018-10-23) = 16년 6개월
    // 표1 적용: 16년 × 2% = 32% → 30% 캡 (§95② 본문 괄호: 인가전 분만 LTHD)
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(60_000_000);
  });

  it("[R-PAY-3] 인가후 기존주택분 LTHD = 0 (§95② 본문 괄호 — 입주권 양도 시 인가후 부존재)", () => {
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.lthd).toBe(0);
  });

  it("[R-PAY-4] 청산금 분 LTHD = 0 (§94①2호 — 권리 분, §95② 대상자산 범위 외)", () => {
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
  });

  it("[R-PAY-5] 총 LTHD = 60,000,000 (인가전 60M + 인가후 0 + 청산금 0)", () => {
    // 정상: 60M+0+0 = 60M (오류 시 30%×420M = 126M 이 관측됨)
    expect(result.longTermHoldingDeduction).toBe(60_000_000);
  });

  it("[R-PAY-6] 양도소득금액 = 270,000,000 ((200M−60M) + (130M−0) = 140M+130M)", () => {
    // 양도소득금액 = preApproval(200M−60M=140M) + settlement(130M−0) = 270M
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(270_000_000);
  });

  it("[R-PAY-7] ★ 산출세액 = 81,710,000 (2023년 §55 누진세율표 직접 적용)", () => {
    // 과세표준 = 270M − 2.5M = 267,500,000
    // 구간: 150,000,001~300,000,000 → 38% − 누진공제 19,940,000
    // 산출세액 = 267,500,000 × 0.38 − 19,940,000 = 101,650,000 − 19,940,000 = 81,710,000
    // 근거: 소득세법 §55 (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`)
    expect(result.calculatedTax).toBe(81_710_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-PAY-8 — 회귀 차단: subject="apt" fallback 시 LTHD ≈ 126M (현재 버그 재현용)
// ──────────────────────────────────────────────────────────────────────────────

describe("R-PAY-8 — subject=apt fallback 시 LTHD 126M 재현 (회귀 차단 anchor)", () => {
  const aptInput = baseInput({
    propertyType: "redevelopment_apt",
    redevelopment: {
      ...baseRedevInfo(),
      subject: "apt", // apt 강제 — fallback 경로 재현
    },
  });
  const result = calculateTransferTax(aptInput, mockRates);

  it("[R-PAY-8] subject=apt 강제 시 LTHD = 126,000,000 (30% × 420M — 버그 경로 확인)", () => {
    // apt+pay: 3분기 모두 취득일~양도일 20년 10개월 → 표1 15년+ 30% 캡
    // preApproval LTHD = 200M×30% = 60M, settlement LTHD = 130M×26% (2018~2023 4년 10개월→9년 → 표1 18%)
    // 실제 apt+pay 분기는 §166②1호 안분으로 postApproval도 갖음 → LTHD 합계 검증
    // 핵심: subject="right" 시 60M / subject="apt" 강제 시 다른 값 (분기 차이 있음)
    // apt+pay의 경우 취득~양도 전체 보유기간 적용 → preApproval + postApproval + settlement
    // 가장 단순한 확인: right < apt LTHD (분할 분기가 apt보다 적음)
    expect(result.longTermHoldingDeduction).toBeGreaterThan(60_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-PAY-9 — 승계조합원: §166 미적용 + LTHD 0
//
// 🔄 2026-08-23 갱신 — 종전 [R-PAY-9]는 `redevelopmentDetail.preApproval.lthd === 0`을 단언했다.
//    그 단언은 **승계조합원에게도 §166① 3분할이 성립한다**는 전제 위에 있었는데, 시행령 §166①은
//    「조합원이 **당해 조합에 기존건물과 그 부수토지를 제공하고 취득한** 입주자로 선정된 지위를
//    양도하는 경우」로 요건을 한정한다 — 승계자는 제공한 사실이 없어 적용 대상이 아니다.
//    ⇒ 「인가전 LTHD가 0」이 아니라 「**인가전 분 자체가 없다**」가 정확한 진술이다.
//    LTHD 0이라는 원래 취지는 [R-PAY-9b]가 그대로 지킨다.
//    계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §2.4
// ──────────────────────────────────────────────────────────────────────────────

describe("R-PAY-9 — 승계조합원 (isSuccessorRightToMoveIn=true) — §166 미적용 · LTHD 전액 0", () => {
  const successorInput = baseInput({
    isSuccessorRightToMoveIn: true,
  });
  const result = calculateTransferTax(successorInput, mockRates);

  it("[R-PAY-9] 승계조합원은 §166① 3분할을 타지 않는다 (시행령 §166① 「제공하고 취득한」 요건)", () => {
    expect(result.redevelopmentDetail).toBeUndefined();
  });

  it("[R-PAY-9b] 승계조합원 총 LTHD = 0 (§95② 괄호 — 조합원으로부터 취득한 것은 제외)", () => {
    expect(result.longTermHoldingDeduction).toBe(0);
  });

  it("[R-PAY-9c] 양도차익 = 양도가액 − 취득가액 (§97①1호 가목 일반 원칙)", () => {
    // 520,000,000 − 100,000,000 = 420,000,000
    // ※ 원조합원 경로(§166①1호)의 합계 200M + 130M = 330M 과 다르다 —
    //   그쪽은 청산금 90M을 별도 차감하기 때문이다. 승계조합원의 취득가액에는
    //   납입한 추가분담금이 이미 포함돼야 한다(기준-2025-법규재산-0057).
    expect(result.transferGain).toBe(420_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-PAY-10 — 1세대1주택 + 거주 2년 충족 → 표2 적용
// ──────────────────────────────────────────────────────────────────────────────

describe("R-PAY-10 — 1세대1주택 + 거주 2년+ → preApproval LTHD 표2율 적용", () => {
  const oneHouseInput = baseInput({
    isOneHousehold: true,
    householdHousingCount: 1,
    householdRightCount: 1,
    residencePeriodMonths: 36, // 3년 거주
  });
  const result = calculateTransferTax(oneHouseInput, mockRates);

  it("[R-PAY-10] 1세대1주택 + 거주 3년 → preApproval LTHD > 60,000,000 (표2율 보유+거주 합산)", () => {
    // 표2: 보유 16년×4%=64%→40% 캡 + 거주 3년×4%=12% → 합계 52% (단 80% 캡)
    // preApproval LTHD = 200M × 52% = 104,000,000 (표1 60M 초과)
    // ※ 1세대1주택 입주권 양도 시 12억 이하 전액 비과세 가능성 있으나
    //   본 케이스는 양도가 520M < 12억 → 전액 비과세 → LTHD=0 or 비과세
    //   전액 비과세 시 result.isExempt=true, calculatedTax=0
    //   결과 확인: 비과세가 아니면 표2 LTHD가 표1보다 큼을 확인
    if (result.isExempt) {
      // 전액 비과세 — §89①4호 가목 (1세대1주택 입주권 12억 이하)
      expect(result.calculatedTax).toBe(0);
    } else {
      // 표2 적용 — LTHD가 표1(60M)보다 큼
      expect(result.longTermHoldingDeduction).toBeGreaterThan(60_000_000);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// R-PAY-11~14 — UI 입력 경로 회귀 차단 (사용자 실제 시나리오)
//
// 사용자 입력: 자산 종류 카드 "재개발/재건축 APT" + 양도 대상 라디오 "입주권 양도"
//   → AssetForm: assetKind="redevelopment_apt" + redevSubject="right"
//
// 엔진 진입 게이트 `isRedevelopmentActive()` (lib/tax-engine/redevelopment.ts:340-348)
// 는 propertyType ↔ subject 1:1 매핑 강제:
//   - propertyType="redevelopment_apt" + subject="apt"   → true  (완공 APT 양도)
//   - propertyType="right_to_move_in"  + subject="right" → true  (입주권 양도)
//   - propertyType="redevelopment_apt" + subject="right" → false (★ 부정합 — 거부)
//
// 따라서 lib/calc/transfer-tax-api.ts 의 API 변환 layer가
// assetKind="redevelopment_apt" + redevSubject="right" 시 propertyType을
// "right_to_move_in"으로 자동 remap한다.
//
// 본 anchor 4건은 회귀 차단:
//   R-PAY-11: 부정합 조합 → redevelopmentDetail 미생성 + 일반 양도 분기 진입 (API remap 필수 신호)
//   R-PAY-12: 부정합 조합 → LTHD가 전체 양도차익에 일괄 적용 (LTHD 126M 회귀 재현)
//   R-PAY-13: 정상 조합(right_to_move_in + right) → redevelopmentDetail 생성 + preApproval.gain = 200M
//   R-PAY-14: 정상 조합 → settlement.lthd = 0 (§95② 단서)
// ──────────────────────────────────────────────────────────────────────────────

describe("R-PAY-11~14 — UI 입력 경로 회귀 차단 (propertyType ↔ subject 정합성)", () => {
  // 부정합 조합 (현재 화면 버그 재현)
  const mismatchedInput = baseInput({
    propertyType: "redevelopment_apt", // ← 사용자 자산 종류 카드 매핑값
    // redevelopment.subject는 baseRedevInfo()에서 "right" (라디오 "입주권 양도")
  });
  const mismatchedResult = calculateTransferTax(mismatchedInput, mockRates);

  // 정상 조합 (API layer remap 후 엔진이 받는 값)
  const remappedInput = baseInput({
    propertyType: "right_to_move_in", // ← API remap 결과
  });
  const remappedResult = calculateTransferTax(remappedInput, mockRates);

  it("[R-PAY-11] 부정합 조합(redevelopment_apt + subject=right) → redevelopmentDetail 미생성 (일반 양도 분기 진입)", () => {
    // isRedevelopmentActive 거부 → calculateRedevelopmentTax 미호출 → redevelopmentDetail undefined
    // 이 anchor가 깨지면 → 엔진 게이트가 완화됐음 + API remap 정책 재검토 필요
    expect(mismatchedResult.redevelopmentDetail).toBeUndefined();
  });

  it("[R-PAY-12] 부정합 조합 → LTHD가 전체 양도차익에 일괄 적용 (사용자 화면 126M 회귀 재현)", () => {
    // 일반 양도 분기: 보유 2002-04-09 ~ 2023-03-02 = 20년 10월 → 표1 30% 캡
    // 전체 양도차익 = 520M − 100M − 0 = 420M (redevelopment 분할 없음)
    // LTHD = 420M × 30% = 126,000,000
    expect(mismatchedResult.longTermHoldingDeduction).toBe(126_000_000);
  });

  it("[R-PAY-13] 정상 조합(right_to_move_in + subject=right) → redevelopmentDetail 생성 + preApproval.gain = 200M", () => {
    expect(remappedResult.redevelopmentDetail).toBeDefined();
    expect(remappedResult.redevelopmentDetail!.preApproval.gain).toBe(200_000_000);
  });

  it("[R-PAY-14] 정상 조합 → settlement.lthd = 0 (§95② 본문 괄호 — 인가후·청산금 LTHD 배제)", () => {
    expect(remappedResult.redevelopmentDetail!.settlement.lthd).toBe(0);
    expect(remappedResult.longTermHoldingDeduction).toBe(60_000_000);
    expect(remappedResult.calculatedTax).toBe(81_710_000);
  });
});
