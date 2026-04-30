/**
 * 검용주택 — 보유 중 일부 용도변경 분리계산 테스트
 *
 * 시행령 §166⑥ + 양도소득세 집행기준 99-164-10 (재산-1384, 2009.7.8.).
 * 양도시 검용이지만 취득시 단일 용도였던 경우의 환산취득가 안분.
 *
 * 설계: docs/02-design/features/transfer-tax-mixed-use-partial-change.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUsePdfGap,
  mixedUseCommercialToHouseMirror,
  mixedUseCase14,
  GAP_TRANSFER_PRICE,
  GAP_TRANSFER_DATE,
  GAP_RESIDENTIAL_FLOOR,
  GAP_NON_RESIDENTIAL_FLOOR,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
  PARTIAL_USAGE_CHANGE_ANCHORS,
} from "../_helpers/mixed-use-fixture";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────
// SC-1: PDF 갑氏 — house_to_commercial + 다주택자 + PHD (1985 의제취득)
// ──────────────────────────────────────────────────────────────

describe("SC-1: PDF 갑氏 — 주택→상가 + 다주택자 + 1985 의제취득(PHD)", () => {
  const asset = mixedUsePdfGap();
  const result = calcMixedUseTransferTax(
    GAP_TRANSFER_PRICE,
    GAP_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("post-2022 모드로 정상 처리", () => {
    expect(result.splitMode).toBe("post-2022");
  });

  it("partialUsageChange 메타가 결과에 포함됨 (direction + 자동 면적)", () => {
    expect(result.partialUsageChange).toBeDefined();
    expect(result.partialUsageChange?.direction).toBe("house_to_commercial");
    // 자동 도출: 취득시 주택 = 양도시 합계, 상가 = 0
    expect(result.partialUsageChange?.acqResidentialArea).toBe(
      GAP_RESIDENTIAL_FLOOR + GAP_NON_RESIDENTIAL_FLOOR,
    );
    expect(result.partialUsageChange?.acqCommercialArea).toBe(0);
    expect(result.partialUsageChange?.isAreaCustomized).toBe(false);
  });

  it("🚨 Critical: 다주택자(isOneHouseExempt=false) → highValueRule = non_one_house_full_taxation", () => {
    expect(result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("🚨 Critical: 다주택자 → 12억 비과세 미적용 (isExempt = false)", () => {
    expect(result.housingPart.isExempt).toBe(false);
  });

  it("🚨 Critical: 다주택자 → 표1 적용 (longTermDeductionTable = 1)", () => {
    expect(result.housingPart.longTermDeductionTable).toBe(1);
  });

  it("양도가액 안분 합계 = 총 양도가액", () => {
    expect(
      result.apportionment.housingTransferPrice
        + result.apportionment.commercialTransferPrice,
    ).toBe(GAP_TRANSFER_PRICE);
  });

  it("부동소수점 누적 — 토지+건물 양도가액 합계 = 부분 양도가액 (주택)", () => {
    const { housingPart } = result;
    expect(housingPart.landTransferPrice + housingPart.buildingTransferPrice).toBe(
      result.apportionment.housingTransferPrice,
    );
  });

  it("부동소수점 누적 — 토지+건물 양도가액 합계 = 부분 양도가액 (상가)", () => {
    const { commercialPart } = result;
    expect(commercialPart.landTransferPrice + commercialPart.buildingTransferPrice).toBe(
      result.apportionment.commercialTransferPrice,
    );
  });

  it("PHD 결합 — 취득시 환산 주택가격이 산정됨 (phdAcqHousingPrice)", () => {
    expect(result.housingPart.phdEstimatedAcqHousingPrice).toBeDefined();
    expect(result.housingPart.phdEstimatedAcqHousingPrice).toBeGreaterThan(0);
  });

  it("이슈 2 회귀 방지 — 상가부분 토지 환산취득가가 0이 아님 (acqLandStd fallback)", () => {
    // 취득시 상가가 없었으므로 acqLandStd는 fallback으로 양수가 되어야 함
    // (이전 acqLandStd=0 버그 시 토지 환산이 0이 되어 buildingAcqPrice에 100% 몰림)
    expect(result.commercialPart.landAcqPrice).toBeGreaterThan(0);
  });

  it("calculationRoute에 partialUsageChangeReason 포함", () => {
    expect(result.calculationRoute.partialUsageChangeReason).toBeDefined();
    expect(result.calculationRoute.partialUsageChangeReason).toContain("99-164-10");
  });

  it("총 납부세액 계산 정상 (양수)", () => {
    expect(result.total.totalPayable).toBeGreaterThan(0);
  });

  // golden test anchor (회귀 방어용 — 첫 실행 결과 확정 후 toBe로 잠금)
  it("golden anchor: 양도세 + 지방세 합산", () => {
    const sum = result.total.transferTax + result.total.localTax;
    expect(sum).toBe(result.total.totalPayable);
  });

  // ──────────────────────────────────────────────────────────────
  // 🔒 GOLDEN ANCHOR — 원단위 toBe 잠금 (회귀 방어)
  // 입력값 변경 없이 결과 변동 시 엔진 회귀 발생 신호.
  // 양도시 상가건물 기준시가 100,000,000(추정)·거주 0년 가정 — 픽스처 변경 시 anchor 재산출 필요.
  // ──────────────────────────────────────────────────────────────
  describe("🔒 PDF 갑氏 anchor — 원단위 toBe 잠금", () => {
    const a = PARTIAL_USAGE_CHANGE_ANCHORS.pdf_gap_house_to_commercial;

    it("양도가액 안분 — housingTransferPrice", () => {
      expect(result.apportionment.housingTransferPrice).toBe(a.housingTransferPrice);
    });
    it("양도가액 안분 — commercialTransferPrice", () => {
      expect(result.apportionment.commercialTransferPrice).toBe(a.commercialTransferPrice);
    });
    it("양도가액 안분 — housingRatio", () => {
      expect(result.apportionment.housingRatio).toBeCloseTo(a.housingRatio, 10);
    });
    it("환산취득가 — 주택부분", () => {
      expect(result.housingPart.estimatedAcquisitionPrice).toBe(a.housingEstimatedAcq);
    });
    it("환산취득가 — 상가부분", () => {
      expect(result.commercialPart.estimatedAcquisitionPrice).toBe(a.commercialEstimatedAcq);
    });
    it("양도차익 — 주택부분", () => {
      expect(result.housingPart.transferGain).toBe(a.housingTransferGain);
    });
    it("양도차익 — 상가부분", () => {
      expect(result.commercialPart.transferGain).toBe(a.commercialTransferGain);
    });
    it("양도소득금액 — 주택부분 (다주택자 표1)", () => {
      expect(result.housingPart.incomeAmount).toBe(a.housingIncomeAmount);
    });
    it("양도소득금액 — 상가부분 (표1)", () => {
      expect(result.commercialPart.incomeAmount).toBe(a.commercialIncomeAmount);
    });
    it("합산 — aggregateIncome", () => {
      expect(result.total.aggregateIncome).toBe(a.aggregateIncome);
    });
    it("합산 — taxBase (250만원 공제 후)", () => {
      expect(result.total.taxBase).toBe(a.taxBase);
    });
    it("산출세액 — transferTax (양도소득세)", () => {
      expect(result.total.transferTax).toBe(a.transferTax);
    });
    it("지방소득세 — localTax (10%)", () => {
      expect(result.total.localTax).toBe(a.localTax);
    });
    it("🎯 총 납부세액 — totalPayable (golden anchor)", () => {
      expect(result.total.totalPayable).toBe(a.totalPayable);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// SC-2: 미러 케이스 — commercial_to_house (보수 검토 안내)
// ──────────────────────────────────────────────────────────────

describe("SC-2: 미러 케이스 — 상가→주택", () => {
  const asset = mixedUseCommercialToHouseMirror();
  const result = calcMixedUseTransferTax(
    GAP_TRANSFER_PRICE,
    GAP_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("partialUsageChange.direction = commercial_to_house", () => {
    expect(result.partialUsageChange?.direction).toBe("commercial_to_house");
  });

  it("자동 면적: 취득시 주택 = 0, 상가 = 양도시 합계", () => {
    expect(result.partialUsageChange?.acqResidentialArea).toBe(0);
    expect(result.partialUsageChange?.acqCommercialArea).toBe(
      GAP_RESIDENTIAL_FLOOR + GAP_NON_RESIDENTIAL_FLOOR,
    );
  });

  it("partialUsageChangeReason에 '보수 검토 필요' 안내 포함", () => {
    expect(result.calculationRoute.partialUsageChangeReason).toContain("보수 검토 필요");
  });

  it("주택부분 환산취득가 산정 정상 (양수)", () => {
    expect(result.housingPart.estimatedAcquisitionPrice).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-3: 사용자 수정 면적 케이스 (증축 시뮬)
// ──────────────────────────────────────────────────────────────

describe("SC-3: 사용자 수정 면적 (취득시 합계 ≠ 양도시 합계)", () => {
  it("acqResidentialArea만 입력 시 자동/수동 구분", () => {
    const asset = mixedUsePdfGap({
      partialUsageChange: {
        direction: "house_to_commercial",
        acqResidentialArea: 100,  // 사용자 수정값
      },
    });
    const result = calcMixedUseTransferTax(
      GAP_TRANSFER_PRICE,
      GAP_TRANSFER_DATE,
      asset,
      mockRates,
    );
    expect(result.partialUsageChange?.acqResidentialArea).toBe(100);
    expect(result.partialUsageChange?.isAreaCustomized).toBe(true);
  });

  it("둘 다 미입력 시 자동 도출 + isAreaCustomized = false", () => {
    const asset = mixedUsePdfGap();
    const result = calcMixedUseTransferTax(
      GAP_TRANSFER_PRICE,
      GAP_TRANSFER_DATE,
      asset,
      mockRates,
    );
    expect(result.partialUsageChange?.isAreaCustomized).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-4: PHD 결합 케이스 (1985 의제취득)
// ──────────────────────────────────────────────────────────────

describe("SC-4: PHD 결합 — house_to_commercial + usePreHousingDisclosure=true", () => {
  it("PHD 미적용 시 throw — 취득시 개별주택공시가격 0", () => {
    const asset = mixedUsePdfGap({
      usePreHousingDisclosure: false,
      preHousingDisclosure: undefined,
      acquisitionStandardPrice: {
        housingPrice: 0,
        commercialBuildingPrice: 0,
        landPricePerSqm: 0,
      },
    });
    expect(() => {
      calcMixedUseTransferTax(GAP_TRANSFER_PRICE, GAP_TRANSFER_DATE, asset, mockRates);
    }).toThrow(/취득시 개별주택공시가격이 0이거나 미입력/);
  });

  it("PHD 적용 시 phdAcqHousingPrice가 면적비율 안분 기준값으로 사용됨", () => {
    const asset = mixedUsePdfGap();
    const result = calcMixedUseTransferTax(
      GAP_TRANSFER_PRICE,
      GAP_TRANSFER_DATE,
      asset,
      mockRates,
    );
    // 상가부분 환산취득가가 0보다 커야 함 (PHD가 정상 작동)
    expect(result.commercialPart.estimatedAcquisitionPrice).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-5: 회귀 — 토글 OFF (partialUsageChange undefined) → 기존 검용주택과 동일 결과
// ──────────────────────────────────────────────────────────────

describe("SC-5: 회귀 — 기존 검용주택 사례14 (partialUsageChange 미적용)", () => {
  it("partialUsageChange = undefined → 사례14 결과 변동 없음", () => {
    const asset = mixedUseCase14();
    const result = calcMixedUseTransferTax(
      CASE14_TRANSFER_PRICE,
      CASE14_TRANSFER_DATE,
      asset,
      mockRates,
    );
    expect(result.splitMode).toBe("post-2022");
    expect(result.partialUsageChange).toBeUndefined();
    // 사례14는 isOneHouseExempt 미주입(=true) → highValueRule는 below_threshold_exempt 또는 above_threshold_prorated
    expect(result.calculationRoute.highValueRule).not.toBe("non_one_house_full_taxation");
  });

  it("사례14에 isOneHouseExempt=false 추가 시 highValueRule 변경", () => {
    const asset = { ...mixedUseCase14(), isOneHouseExempt: false };
    const result = calcMixedUseTransferTax(
      CASE14_TRANSFER_PRICE,
      CASE14_TRANSFER_DATE,
      asset,
      mockRates,
    );
    expect(result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(result.housingPart.isExempt).toBe(false);
    expect(result.housingPart.longTermDeductionTable).toBe(1);  // 다주택자 → 표1
  });
});
