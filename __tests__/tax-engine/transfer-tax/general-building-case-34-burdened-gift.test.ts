/**
 * 사례 34 — 부담부증여(burdened gift) 양도소득세 anchor 테스트
 *
 * 출처: 2023 양도·상속·증여세 이론 및 계산실무 (양도코리아 교재) 사례 34 — 노량진 양코빌딩
 *   증여일(=양도일) 2023-02-19, 갑→장남
 *   취득일 1998-09-07 (실거래가 25억, 필요경비 192백만 — 부담부증여에서는 미사용)
 *   자산: 일반건물(양코빌딩) — 토지 1,279㎡ + 건물 1,341.5㎡ (B1·1~3F)
 *
 *   양도(증여)시 평가모드: 상증법상 기준시가 (보충적평가)
 *   임대보증금 1,000,000,000 / 연간 임대료 130,000,000 / 담보차입금 3,120,000,000
 *   채무인수액 = 보증금 + 차입금 = 4,120,000,000 (= 양도가액)
 *
 *   토지 양도시 기준시가 = 1,279 × 6,215,000 = 7,948,985,000
 *   건물 양도시 기준시가 합계 = 629,310,360 (B1 132,164,000 + 1F 135,413,550 + 2F 178,857,640 + 3F 182,875,170)
 *   보충적평가 합계 = 8,578,295,360 (Max 채택)
 *
 *   토지 취득시 기준시가 = 1,279 × 2,130,000 = 2,724,270,000
 *   건물 취득시 기준시가 합계 = 424,472,064
 *
 * 법령 근거:
 *   - 소득세법 §88 ① 1호 후단 (양도 정의)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간, 양도자=증여자 본인)
 *   - 소득세법 시행령 §159 (양도차익 계산)
 *   - 소득세법 시행령 §163 ⑥ (개산공제 3%)
 *   - 상증법 §60~§66 (Max 평가)
 *   - 상증법 시행령 §50 ⑦ (임대료 환산가액 12%)
 *
 * 양도자 = 증여자 본인이므로 §97의2(이월과세) 미적용.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  buildBurdenedGiftBreakdown,
  computeSangjeungbeopValuation,
  computeDebtRatio,
} from "@/lib/tax-engine/burdened-gift-apportionment";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

// ============================================================
// 사례 34 잠금 입력값
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19"); // = 증여일
const ACQUISITION_DATE = new Date("1998-09-07"); // 증여자 당초 취득일

const LAND_STD_TRANSFER = 7_948_985_000;      // 1,279 × 6,215,000
const BUILDING_STD_TRANSFER = 629_310_360;    // B1+1F+2F+3F 합계
const LAND_STD_ACQUISITION = 2_724_270_000;   // 1,279 × 2,130,000
const BUILDING_STD_ACQUISITION = 424_472_064;

const LENDING_DEPOSIT = 1_000_000_000;
const ANNUAL_RENT = 130_000_000;
const MORTGAGE_DEBT = 3_120_000_000;

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: LENDING_DEPOSIT,
  mortgageDebtAmount: MORTGAGE_DEBT,
  annualRentTotal: ANNUAL_RENT,
  landStdPriceAtTransfer: LAND_STD_TRANSFER,
  buildingStdPriceAtTransfer: BUILDING_STD_TRANSFER,
  landStdPriceAtAcquisition: LAND_STD_ACQUISITION,
  buildingStdPriceAtAcquisition: BUILDING_STD_ACQUISITION,
};

function makeCase34Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "general_building",
    transferDate: TRANSFER_DATE,
    acquisitionDate: ACQUISITION_DATE,
    transferPrice: 0, // engine override
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    acquisitionCause: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo,
    ...overrides,
  });
}

// ============================================================
// 헬퍼 단위 테스트
// ============================================================

describe("사례 34 — 부담부증여 헬퍼 단위 테스트", () => {
  it("computeSangjeungbeopValuation — Max(보충적·담보·임대) 채택", () => {
    const v = computeSangjeungbeopValuation(LAND_STD_TRANSFER, BUILDING_STD_TRANSFER, burdenedGiftInfo);
    expect(v.supplementary).toBe(8_578_295_360);
    expect(v.mortgage).toBe(4_120_000_000); // 보증금 10억 + 담보차입금 31.2억 (mortgageSetAmount=차입금 fallback)
    expect(v.rental).toBe(2_083_333_333);   // 10억 + 1.3억/0.12 = 10억 + 1,083,333,333
    expect(v.selectedMode).toBe("supplementary");
    expect(v.max).toBe(8_578_295_360);
  });

  it("computeDebtRatio — 인수채무액·채무비율", () => {
    const r = computeDebtRatio(burdenedGiftInfo, 8_578_295_360);
    expect(r.assumedDebtAmount).toBe(4_120_000_000);
    // 4,120,000,000 / 8,578,295,360 ≈ 0.4802819006688993
    expect(r.debtRatio).toBeCloseTo(0.4802819, 7);
  });

  it("buildBurdenedGiftBreakdown — 자산-수준 양도가액·취득가액·개산공제", () => {
    const b = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: LAND_STD_TRANSFER,
      buildingStdPriceAtTransfer: BUILDING_STD_TRANSFER,
      landStdPriceAtAcquisition: LAND_STD_ACQUISITION,
      buildingStdPriceAtAcquisition: BUILDING_STD_ACQUISITION,
      info: burdenedGiftInfo,
    });
    // 자산-수준 양도가액 (소령 §159 ① 2호) — 엔진은 상증법 max(8,578,295,360)를 분모로 사용.
    // ⚠️ Excel/PDF anchor는 소법 보충적평가 합계(8,580,831,500)를 per-asset 분모로 사용하므로
    //    asset-level transferPrice는 Excel(3,816,625,253)과 약 1.1M 차이가 있다.
    //    합계(transferGain·calculatedTax·localIncomeTax)는 1원 이내로 일치 — Phase 1 strict §159 채택.
    expect(b.perAsset.land.transferPrice).toBe(3_817_753_624);
    expect(b.perAsset.building.transferPrice).toBe(302_246_375);
    // 자산-수준 취득가액 (소령 §159 ① 1호 A 괄호) — Excel D9·E9 1원 이내 일치
    expect(b.perAsset.land.acquisitionPrice).toBe(1_308_417_573);
    expect(b.perAsset.building.acquisitionPrice).toBe(203_866_249);
    // 자산-수준 개산공제 (소령 §163 ⑥) — Excel D10·E10 일치
    expect(b.perAsset.land.estimatedDeduction).toBe(39_252_527);
    expect(b.perAsset.building.estimatedDeduction).toBe(6_115_987);
    // Phase 2 연결 — 무상이전분
    expect(b.assumedDebtAmount).toBe(4_120_000_000);
    expect(b.gratuitousPortion).toBe(4_458_295_360);
    expect(b.taxpayer).toBe("donor");
  });
});

// ============================================================
// 통합 anchor — calculateTransferTax 전체 파이프라인
// ============================================================

describe("사례 34 — 통합 anchor (PDF p.534·537·538)", () => {
  it("산출세액 740,074,514 + 지방소득세 74,007,451 정확 재현 (PDF 740,074,515와 1원 차이)", () => {
    const input = makeCase34Input();
    const result = calculateTransferTax(input, rates);

    // 합계 — 양도차익 (BigInt per-asset truncation 누적으로 PDF anchor와 2원 차이)
    expect(result.transferGain).toBe(2_562_347_663);
    // 장특공 (24년 보유 → 표1 30%) — Excel anchor 일치
    expect(result.longTermHoldingRate).toBe(0.30);
    expect(result.longTermHoldingDeduction).toBe(768_704_298);
    // 과세표준 = 양도소득금액 − 기본공제(250만)
    expect(result.taxBase).toBe(1_791_143_365);
    // 산출세액 (§55 누진세율 1,000,000,000 초과 45% + 누진공제 65,940,000)
    // 1,791,143,365 × 0.45 − 65,940,000 = 740,074,514.25 → 740,074,514 (마지막 1회 절사)
    expect(result.calculatedTax).toBe(740_074_514);
    // 지방소득세 (10%) — Excel anchor 정확 일치
    expect(result.localIncomeTax).toBe(74_007_451);
  });

  it("breakdown 결과 객체 — Phase 2 연결용 export 필드 보장", () => {
    const input = makeCase34Input();
    const result = calculateTransferTax(input, rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b).toBeDefined();
    expect(b.assumedDebtAmount).toBe(4_120_000_000);
    expect(b.sangjeungbeopValuation.supplementary).toBe(8_578_295_360);
    expect(b.sangjeungbeopValuation.mortgage).toBe(4_120_000_000);
    expect(b.sangjeungbeopValuation.rental).toBe(2_083_333_333);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.sangjeungbeopValuation.max).toBe(8_578_295_360);
    expect(b.debtRatio).toBeCloseTo(0.4802819, 7);
    expect(b.gratuitousPortion).toBe(4_458_295_360);
    expect(b.taxpayer).toBe("donor");
  });

  it("Phase 2 — 증여세 통합 (PDF p.534 자진납부세액 1,691,823,250)", () => {
    // 사례 34: 갑→장남(직계비속) 부담부증여
    // 무상이전분 4,458,295,360 - 직계비속 공제 5천만 = 과세표준 4,408,295,360
    // 산출세액 = 4,408,295,360 × 50% - 460,000,000 = 1,744,147,680
    // 신고세액공제(3%) = 1,744,147,680 × 0.03 = 52,324,430
    // 결정세액 = 1,744,147,680 - 52,324,430 = 1,691,823,250
    const input = makeCase34Input();
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt).toBeDefined();
    expect(gt.grossGiftValue).toBe(4_458_295_360);
    expect(gt.deduction).toBe(50_000_000); // 직계비속 §53
    expect(gt.taxBase).toBe(4_408_295_360);
    expect(gt.computedTax).toBe(1_744_147_680); // §56 누진세율 50% 구간
    expect(gt.filingCredit).toBe(52_324_430);   // §69 3%
    expect(gt.finalTax).toBe(1_691_823_250);    // PDF p.534 정확 일치
    expect(gt.donorRelation).toBe("lineal_descendant");
  });

  it("Phase 2 — donorRelation 미입력 시 lineal_descendant 기본값", () => {
    const input = makeCase34Input({
      burdenedGiftInfo: { ...burdenedGiftInfo, donorRelation: undefined },
    });
    const result = calculateTransferTax(input, rates);
    expect(result.transferBurdenedGiftBreakdown?.giftTax?.donorRelation).toBe("lineal_descendant");
    expect(result.transferBurdenedGiftBreakdown?.giftTax?.finalTax).toBe(1_691_823_250);
  });

  it("Phase 2 — 배우자 부담부증여 (공제 6억)", () => {
    const input = makeCase34Input({
      burdenedGiftInfo: { ...burdenedGiftInfo, donorRelation: "spouse" },
    });
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    // 배우자 공제 6억 → 과세표준 = 4,458,295,360 - 600,000,000 = 3,858,295,360
    // 산출세액 = 3,858,295,360 × 50% - 460,000,000 = 1,469,147,680
    expect(gt.deduction).toBe(600_000_000);
    expect(gt.taxBase).toBe(3_858_295_360);
    expect(gt.computedTax).toBe(1_469_147_680);
    expect(gt.donorRelation).toBe("spouse");
  });

  it("총 세부담 합계 (양도세 + 지방세 + 증여세) = 약 2,505,905,215", () => {
    // PDF: 양도세 740,074,515 + 지방세 74,007,451 + 증여세 1,691,823,250 = 2,505,905,216
    // 엔진: 양도세 740,074,514(-1) + 지방세 74,007,451 + 증여세 1,691,823,250 = 2,505,905,215
    const input = makeCase34Input();
    const result = calculateTransferTax(input, rates);
    const total = result.calculatedTax + result.localIncomeTax +
      (result.transferBurdenedGiftBreakdown?.giftTax?.finalTax ?? 0);
    expect(total).toBe(2_505_905_215);
  });

  it("이월과세 §97의2 미적용 보장 — carryoverTaxation === null (디자인 쟁점 7)", () => {
    // 부담부증여 채무인수 양도분은 양도자 = 증여자 본인이므로 §97의2(이월과세) 적용 대상 아님.
    // 후속 개발자가 §97의2 회귀를 도입할 때 본 anchor가 가드 역할.
    const input = makeCase34Input();
    const result = calculateTransferTax(input, rates);
    // carryoverTaxationDetail은 §97의2 이월과세 발동 시만 채워지는 optional 필드.
    // 부담부증여 분기에서는 carryoverTaxation 입력 자체가 없으므로 undefined여야 함.
    expect(result.carryoverTaxationDetail).toBeUndefined();
  });

  it("§55 누진세율표 자가검증 — 곱셈 후 누진공제 차감 마지막 1회 절사", () => {
    // 1,791,143,365 × 0.45 − 65,940,000 = 740,074,514.25 → 740,074,514
    const taxBase = 1_791_143_365;
    const rate = 0.45;
    const progressiveDeduction = 65_940_000;
    const calculated = Math.floor(taxBase * rate - progressiveDeduction);
    expect(calculated).toBe(740_074_514);
    // 1,791,143,367 (PDF taxBase) × 0.45 − 65,940,000 = 740,074,515.15 → 740,074,515
    // PDF 산출세액 anchor 740,074,515는 위 PDF taxBase를 가정한 결과. 엔진은 자체 floor 누적으로 1원 낮음.
    expect(Math.floor(1_791_143_367 * 0.45 - 65_940_000)).toBe(740_074_515);
  });
});

// ============================================================
// Max 분기 — 담보평가 채택 (합성 anchor)
// ============================================================

describe("Max 분기 — 담보평가 채택 (합성)", () => {
  it("보충적평가 < 담보평가일 때 selectedMode === 'mortgage'", () => {
    const info: BurdenedGiftInfo = {
      ...burdenedGiftInfo,
      // 보충적평가를 임의로 낮춤
      landStdPriceAtTransfer: 1_000_000_000,
      buildingStdPriceAtTransfer: 100_000_000, // supplementary = 1,100,000,000
      // mortgage = 1,000,000,000 + 3,120,000,000 = 4,120,000,000 (담보 채택)
      // rental = 1,000,000,000 + 1,083,333,333 = 2,083,333,333
    };
    const v = computeSangjeungbeopValuation(
      info.landStdPriceAtTransfer,
      info.buildingStdPriceAtTransfer,
      info,
    );
    expect(v.selectedMode).toBe("mortgage");
    expect(v.max).toBe(4_120_000_000);
  });
});

// ============================================================
// Max 분기 — 임대평가 채택 (합성 anchor)
// ============================================================

describe("Max 분기 — 임대평가 채택 (합성)", () => {
  it("보충적·담보 < 임대평가일 때 selectedMode === 'rental'", () => {
    const info: BurdenedGiftInfo = {
      valuationMode: "sangjeungbeop_standard",
      lendingDepositTotal: 5_000_000_000,
      mortgageDebtAmount: 100_000_000,
      annualRentTotal: 1_000_000_000, // rental_capitalized = 1,000,000,000 / 0.12 = 8,333,333,333
      // rental = 5,000,000,000 + 8,333,333,333 = 13,333,333,333 (임대 채택)
      // mortgage = 5,000,000,000 + 100,000,000 = 5,100,000,000
      landStdPriceAtTransfer: 1_000_000_000,
      buildingStdPriceAtTransfer: 100_000_000, // supplementary = 1,100,000,000
      landStdPriceAtAcquisition: 500_000_000,
      buildingStdPriceAtAcquisition: 50_000_000,
    };
    const v = computeSangjeungbeopValuation(
      info.landStdPriceAtTransfer,
      info.buildingStdPriceAtTransfer,
      info,
    );
    expect(v.selectedMode).toBe("rental");
    expect(v.max).toBe(13_333_333_333);
  });
});

// ============================================================
// 가드 — propertyType !== "general_building" throw
// ============================================================

describe("가드 — Phase 1은 general_building 전용", () => {
  it("propertyType === 'housing' 일 때 throw", () => {
    const input = makeCase34Input({ propertyType: "housing" });
    expect(() => calculateTransferTax(input, rates)).toThrow(/general_building/);
  });
});

// ============================================================
// 시가 모드 (합성 anchor)
// ============================================================

describe("시가 모드 — sangjeungbeop_market", () => {
  it("marketValueAtTransfer가 보충적평가보다 클 때 supplementary로 시가 채택", () => {
    const info: BurdenedGiftInfo = {
      ...burdenedGiftInfo,
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: 10_000_000_000, // 시가 > 보충적
      marketValueAtAcquisition: 4_000_000_000,
    };
    const v = computeSangjeungbeopValuation(
      info.landStdPriceAtTransfer,
      info.buildingStdPriceAtTransfer,
      info,
    );
    expect(v.supplementary).toBe(10_000_000_000); // 시가 모드 → market 값이 보충적 슬롯
    expect(v.selectedMode).toBe("supplementary");
    expect(v.max).toBe(10_000_000_000);
  });

  it("시가 모드 통합 anchor — calculateTransferTax 엔진 호출 산출세액·자산별 안분 검증", () => {
    // 시가 모드: 양도시 시가 100억, 취득시 시가 40억 (가공 시나리오).
    // 채무비율 = 4,120,000,000 / 10,000,000,000 = 0.412
    // → 양도가액 합계 = 4,120,000,000 (= 채무액 유지)
    // → 취득가액 합계 = 4,000,000,000 × 0.412 = 1,648,000,000
    const input = makeCase34Input({
      burdenedGiftInfo: {
        ...burdenedGiftInfo,
        valuationMode: "sangjeungbeop_market",
        marketValueAtTransfer: 10_000_000_000,
        marketValueAtAcquisition: 4_000_000_000,
      },
    });
    const result = calculateTransferTax(input, rates);
    const b = result.transferBurdenedGiftBreakdown!;
    // 시가 모드: supplementary 슬롯에 marketValueAtTransfer 주입
    expect(b.sangjeungbeopValuation.supplementary).toBe(10_000_000_000);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.sangjeungbeopValuation.max).toBe(10_000_000_000);
    expect(b.assumedDebtAmount).toBe(4_120_000_000);
    expect(b.debtRatio).toBeCloseTo(0.412, 3); // 4.12B / 10B
    expect(b.gratuitousPortion).toBe(5_880_000_000); // 10B - 4.12B
    // 양도가액 합계 = 채무액 (자산별 안분 ≈ 4.12B 보존)
    const transferTotal = b.perAsset.land.transferPrice + b.perAsset.building.transferPrice;
    expect(transferTotal).toBeGreaterThanOrEqual(4_119_999_998);
    expect(transferTotal).toBeLessThanOrEqual(4_120_000_000);
    // Phase 2 증여세 — 무상이전분 58.8억 케이스
    // 58.8억 - 5천만 = 58.3억 → 50% × 58.3억 - 4.6억 = 24.55억
    expect(b.giftTax?.donorRelation).toBe("lineal_descendant");
    expect(b.giftTax?.grossGiftValue).toBe(5_880_000_000);
    // 산출세액 정수 양수 보장 (회귀 가드)
    expect(result.calculatedTax).toBeGreaterThan(0);
    expect(result.localIncomeTax).toBeGreaterThan(0);
  });
});
