/**
 * 사례 48 — 승계조합원 준공 후 양도 (Do anchor — PDF 예제 정합)
 *
 * PDF: 재개발-승계조합원.pdf (예제 사례집 사례 47)
 * 법령: 소득세법 §95②·§104①, 시행령 §162①4호, 사전-2019-법령해석재산-0649 (2020.02.11.)
 *
 * 사실관계:
 *   - 아버지(원조합원) 관리처분 인가일 2016.2.20.
 *   - 아버지 사망 2020.4.15. → 별도세대 아들 갑氏 입주권 상속
 *   - 신축APT 준공 2022.12.2.
 *   - 갑氏 양도 2023.2.16. (양도가 920,000,000)
 *   - 상속 시가평가액 450,000,000, 추가분담금 150,000,000
 *
 * ★ Primary anchor:
 *   양도차익          320,000,000  (920M − 450M − 150M)
 *   LTHD                       0  (보유 1년 미만 — 준공일 기산)
 *   과세표준         317,500,000  (320M − 기본공제 2,500,000)
 *   세율                    70%   (1년 미만 단기 — 준공일 기산)
 *   산출세액         222,250,000  ★
 *   지방소득세        22,225,000  ★
 *   세액합계         244,475,000  ★
 *
 * Pre-Do 단계: 본 spec 은 현재 엔진(승계조합원 분기 미구현)에서 **실패** 해야 한다.
 *  - 기대 실패: acquisitionDate(2020.4.15.) 기산 → 보유 약 2.8년 → 기본세율 적용 + LTHD 적용
 *  - 실제 실패 메시지를 확인하여 디자인 환류 (메모리 정책 `feedback_pre_anchor_verification`).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/**
 * 사례 48 RedevelopmentInfo — 승계조합원 신축APT 양도.
 *
 * ⚠️ 본 Pre-Do anchor 는 신규 필드 `isSuccessorMember` / `completionDate` 를
 *    아직 RedevelopmentInfo 타입에 추가하지 않은 상태에서 작성된다.
 *    의도된 TS 컴파일 실패로 디자인 환류 확인 (정책 `feedback_pre_anchor_verification`).
 *
 *    Do 단계에서 types/transfer-redevelopment.types.ts 에 필드를 추가하면
 *    이 캐스트(`as unknown as ...`)는 제거된다.
 */
function case48RedevelopmentInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2016-02-20"),
    rightsValue: 450_000_000, // 상속 시가평가액 (입주권 평가)
    settlementDirection: "pay", // 본 사례는 settlement 미사용 — pay/0 default 사용
    settlementAmount: 0,
    preApprovalExpenses: 0,
    postApprovalExpenses: 150_000_000, // 추가분담금
    originalAssetType: "housing",
    completionDate: new Date("2022-12-02"),
    isSuccessorMember: true,
  };
}

describe("사례 48-A — 승계조합원 준공 후 양도 (PDF 예제 정합)", () => {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2020-04-15"), // 상속개시일
    acquisitionPrice: 450_000_000, // 상속 시가평가액
    expenses: 0, // ★ 추가분담금은 redev.postApprovalExpenses 로 전달 — 일반 expenses 필드 미사용
    useEstimatedAcquisition: false,
    isOneHousehold: true, // 갑氏 본 아파트 외 무주택
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: case48RedevelopmentInfo(),
  });

  const result = calculateTransferTax(input, mockRates);

  it("redevelopmentDetail 부착 (분기 라우팅)", () => {
    expect(result.redevelopmentDetail).toBeDefined();
  });

  it("양도차익 = 320,000,000 (920M − 450M − 150M)", () => {
    expect(result.transferGain).toBe(320_000_000);
  });

  it("★ LTHD = 0 (보유 1년 미만 — 준공일 2022.12.2. 기산)", () => {
    expect(result.longTermHoldingDeduction).toBe(0);
  });

  it("과세표준 = 317,500,000 (320M − 기본공제 2,500,000)", () => {
    expect(result.taxBase).toBe(317_500_000);
  });

  it("★ 산출세액 = 222,250,000 (317,500,000 × 70% — 1년 미만 단기세율)", () => {
    expect(result.calculatedTax).toBe(222_250_000);
  });

  it("★ 지방소득세 = 22,225,000 (산출세액 × 10%)", () => {
    expect(result.localIncomeTax).toBe(22_225_000);
  });

  it("★ 세액합계 = 244,475,000", () => {
    expect(result.totalTax).toBe(244_475_000);
  });

  it("1세대1주택 비과세 자동 미해당 (보유 1년 미만 — §155 미충족, nontaxableGainAmount 부재)", () => {
    expect(result.nontaxableGainAmount ?? 0).toBe(0);
  });

  it("lthdStartDate = 준공일 (2022-12-02) — getEffectiveAcquisitionDate 통합", () => {
    expect(result.lthdStartDate?.toISOString().slice(0, 10)).toBe("2022-12-02");
  });

  it("redevelopmentDetail.successorMemberApplied = true (분기 활성)", () => {
    expect(result.redevelopmentDetail?.successorMemberApplied).toBe(true);
  });

  it("redevelopmentDetail.valuationMeta.method = 'successor_member_decree_162_1_4'", () => {
    expect(result.redevelopmentDetail?.valuationMeta?.method).toBe("successor_member_decree_162_1_4");
  });

  it("redevelopmentDetail.preApproval.gain = 0 (안분 우회 강제)", () => {
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(0);
  });

  it("redevelopmentDetail.postApprovalExistingHouse.gain = 320,000,000 (단순 차감 primary)", () => {
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.gain).toBe(320_000_000);
  });

  it("redevelopmentDetail.settlement.gain = 0 (settlement 미신고)", () => {
    expect(result.redevelopmentDetail?.settlement.gain).toBe(0);
  });

  it("successorMemberDetail.rateLabel = '1년 미만 70% (§104①3호 주택 본문)'", () => {
    expect(result.redevelopmentDetail?.successorMemberDetail?.rateLabel).toBe(
      "1년 미만 70% (§104①3호 주택 본문)",
    );
  });
});

describe("사례 48 — 매매 취득원인 (옵션 D-Plus P2 anchor)", () => {
  // 승계조합원 + 매매 케이스 — 자산 카드의 actualAcquisitionPrice가 우선 사용됨을 검증.
  // 양도차익 = 920M − 500M(매매가) − 150M(추가분담금) = 270M
  // RedevelopmentInfo.rightsValue는 의도적으로 다른 값(450M) — actualAcquisitionPrice 우선순위 확인.
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2020-04-15"),
    acquisitionPrice: 500_000_000, // ★ 매매가 (자산 카드 흐름)
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false, // 매매 경우 다주택 가능
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: {
      ...case48RedevelopmentInfo(),
      // rightsValue는 legacy fallback 슬롯 — actualAcquisitionPrice(500M)가 우선 사용되어 무시됨.
      rightsValue: 450_000_000,
    },
  });

  const result = calculateTransferTax(input, mockRates);

  it("actualAcquisitionPrice(500M) 우선 사용 — 양도차익 = 270,000,000 (920M − 500M − 150M)", () => {
    expect(result.transferGain).toBe(270_000_000);
  });

  it("postApprovalExistingHouse.apportionedAcquisition = 500,000,000 (P8 표시값 통일)", () => {
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.apportionedAcquisition).toBe(
      500_000_000,
    );
  });
});

describe("사례 48-B — 양도가 변형 산식 회귀 anchor (양도연도 2023 한정)", () => {
  // 48-A 동일 시나리오에서 양도가 920M → 700M 변경, 추가분담금 그대로.
  // 단순 차감 산식이 양도가 변형에도 유지됨을 검증.
  // 양도차익 = 700M − 450M − 150M = 100M, 과세표준 = 97.5M, 산출세액 = 97.5M × 70% = 68,250,000
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 700_000_000,
    transferDate: new Date("2023-06-01"), // 양도연도 2023 한정
    acquisitionDate: new Date("2020-04-15"),
    acquisitionPrice: 450_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: {
      ...case48RedevelopmentInfo(),
      // 동일 RedevelopmentInfo + postApprovalExpenses 150M
    },
  });

  const result = calculateTransferTax(input, mockRates);

  it("양도차익 = 100,000,000 (700M − 450M − 150M)", () => {
    expect(result.transferGain).toBe(100_000_000);
  });

  it("과세표준 = 97,500,000 (100M − 기본공제 2,500,000)", () => {
    expect(result.taxBase).toBe(97_500_000);
  });

  it("산출세액 = 68,250,000 (97,500,000 × 70%)", () => {
    expect(result.calculatedTax).toBe(68_250_000);
  });

  it("redevelopmentDetail.successorMemberApplied = true", () => {
    expect(result.redevelopmentDetail?.successorMemberApplied).toBe(true);
  });
});
