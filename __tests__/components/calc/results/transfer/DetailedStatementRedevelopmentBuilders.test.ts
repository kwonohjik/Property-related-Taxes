/**
 * DetailedStatementRedevelopmentBuilders 단위 테스트
 *
 * 산식 문자열에 변수값이 inline되는지, perAsset 배열이 3원소인지 검증.
 * 사례 44 redevelopmentDetail fixture 사용.
 */

import { describe, it, expect } from "vitest";
import {
  buildRedevTransferFormula,
  buildRedevAcquisitionFormula,
  buildRedevExpenseFormula,
  buildRedevGainFormula,
  buildRedevLthdFormula,
  buildRedevIncomeFormula,
  buildRedevPerAssetForTransfer,
  buildRedevPerAssetForAcquisition,
  buildRedevPerAssetForExpense,
  buildRedevPerAssetForGain,
  buildRedevPerAssetForLthd,
  buildRedevPerAssetForIncome,
  applyRedevelopmentOverrides,
} from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

// 사례 44 — APT-환산-납부-주택출자 redevelopmentDetail fixture
// (실제 runRedevelopment 결과 구조와 동일)
function case44Detail(): RedevelopmentResult {
  return {
    preApproval: {
      apportionedTransfer: 219_218_500, // 권리가액 (의제)
      apportionedAcquisition: 141_221_534, // 환산취득가 = floor(219,218,500 × 85,034,988 / 132,000,000)
      gain: 75_445_917, // 219,218,500 - 141,221,534 - 2,551,049
      holdingMonths: 214, // 17년 10개월
      lthd: 22_633_775, // floor(75,445,917 × 30%)
      lthdRate: 0.3,
    },
    postApprovalExistingHouse: {
      apportionedTransfer: 368_877_283, // floor(525,000,000 × 219,218,500 / 312,000,000)
      apportionedAcquisition: 219_218_500, // 권리가액 (의제)
      gain: 149_658_784, // 안분 분 양도차익
      holdingMonths: 214,
      lthd: 44_897_634, // floor(149,658,784 × 30%)
      lthdRate: 0.3,
    },
    settlement: {
      apportionedTransfer: 156_122_716, // floor(525,000,000 × 92,781,500 / 312,000,000)
      apportionedAcquisition: 92_781_500, // 청산금
      gain: 63_341_216,
      holdingMonths: 159, // 13년 3개월 (인가일 기산)
      lthd: 16_468_716, // floor(63,341,216 × 26%)
      lthdRate: 0.26,
    },
    total: {
      gain: 288_445_917,
      lthd: 84_000_125,
      taxableIncome: 204_445_792,
    },
    salePriceTotal: 312_000_000,
    valuationMeta: {
      method: "estimated_post_disclosure_decree_166_3",
      numerator: 85_034_988,
      denominator: 132_000_000,
      rationale: "최초공시일 미입력 → 본문 미발동",
    },
    estimatedLumpDeduction: 2_551_049, // floor(85,034,988 × 3%)
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 산식 빌더 — 변수값 inline 검증
// ──────────────────────────────────────────────────────────────────────────────

describe("buildRedevTransferFormula — 분할별 양도가액 산식", () => {
  const detail = case44Detail();

  it("preApproval: 의제 양도가액 = 권리가액 inline", () => {
    const f = buildRedevTransferFormula("preApproval", detail, 525_000_000);
    expect(f).toContain("219,218,500");
    expect(f).toContain("§166④");
  });

  it("postApprovalExistingHouse: 안분 산식에 변수값 inline", () => {
    const f = buildRedevTransferFormula("postApprovalExistingHouse", detail, 525_000_000);
    expect(f).toContain("525,000,000");
    expect(f).toContain("219,218,500");
    expect(f).toContain("312,000,000");
    expect(f).toContain("368,877,283");
  });

  it("settlement: 청산금 안분 산식에 변수값 inline", () => {
    const f = buildRedevTransferFormula("settlement", detail, 525_000_000);
    expect(f).toContain("525,000,000");
    expect(f).toContain("92,781,500");
    expect(f).toContain("312,000,000");
    expect(f).toContain("156,122,716");
  });
});

describe("buildRedevAcquisitionFormula — 분할별 취득가액 산식", () => {
  const detail = case44Detail();

  it("preApproval: 환산취득가 산식에 P_A·D inline", () => {
    const f = buildRedevAcquisitionFormula("preApproval", detail);
    expect(f).toContain("219,218,500"); // 권리가액
    expect(f).toContain("85,034,988"); // P_A
    expect(f).toContain("132,000,000"); // D
    expect(f).toContain("141,221,534"); // 결과
    expect(f).toContain("§166③");
  });

  it("postApprovalExistingHouse: 의제 = 권리가액", () => {
    const f = buildRedevAcquisitionFormula("postApprovalExistingHouse", detail);
    expect(f).toContain("219,218,500");
  });

  it("settlement: 의제 = 청산금", () => {
    const f = buildRedevAcquisitionFormula("settlement", detail);
    expect(f).toContain("92,781,500");
  });
});

describe("buildRedevExpenseFormula — 분할별 개산공제 산식", () => {
  const detail = case44Detail();

  it("preApproval: 개산공제 = floor(P_A × 3%) inline + §163⑥", () => {
    const f = buildRedevExpenseFormula("preApproval", detail);
    expect(f).toContain("85,034,988"); // P_A
    expect(f).toContain("3%");
    expect(f).toContain("2,551,049"); // 결과
    expect(f).toContain("§163⑥");
  });

  it("postApprovalExistingHouse: 미적용", () => {
    const f = buildRedevExpenseFormula("postApprovalExistingHouse", detail);
    expect(f).toContain("미적용");
  });

  it("settlement: 미적용", () => {
    const f = buildRedevExpenseFormula("settlement", detail);
    expect(f).toContain("미적용");
  });
});

describe("buildRedevGainFormula — 분할별 양도차익 산식", () => {
  const detail = case44Detail();

  it("preApproval: 양도가액 − 취득가액 − 개산공제 inline", () => {
    const f = buildRedevGainFormula("preApproval", detail);
    expect(f).toContain("219,218,500"); // 양도가액
    expect(f).toContain("141,221,534"); // 취득가액
    expect(f).toContain("2,551,049"); // 개산공제
    expect(f).toContain("75,445,917"); // 결과
  });

  it("postApprovalExistingHouse: 양도가액 − 취득가액 inline", () => {
    const f = buildRedevGainFormula("postApprovalExistingHouse", detail);
    expect(f).toContain("368,877,283");
    expect(f).toContain("219,218,500");
    expect(f).toContain("149,658,784");
  });

  it("settlement: 양도가액 − 청산금 inline", () => {
    const f = buildRedevGainFormula("settlement", detail);
    expect(f).toContain("156,122,716");
    expect(f).toContain("92,781,500");
    expect(f).toContain("63,341,216");
  });
});

describe("buildRedevLthdFormula — 분할별 LTHD 산식", () => {
  const detail = case44Detail();

  it("preApproval: 양도차익 × 30% (17년 10개월)", () => {
    const f = buildRedevLthdFormula("preApproval", detail);
    expect(f).toContain("75,445,917");
    expect(f).toContain("30%");
    expect(f).toContain("17년 10개월");
    expect(f).toContain("22,633,775");
  });

  it("settlement: 양도차익 × 26% (13년 3개월)", () => {
    const f = buildRedevLthdFormula("settlement", detail);
    expect(f).toContain("63,341,216");
    expect(f).toContain("26%");
    expect(f).toContain("13년 3개월");
    expect(f).toContain("16,468,716");
  });
});

describe("buildRedevIncomeFormula — 분할별 양도소득금액", () => {
  const detail = case44Detail();

  it("preApproval: gain − lthd", () => {
    const f = buildRedevIncomeFormula("preApproval", detail);
    expect(f).toContain("75,445,917");
    expect(f).toContain("22,633,775");
    expect(f).toContain("52,812,142"); // 75,445,917 - 22,633,775
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// perAsset[] 빌더 — 3원소 + 라벨 prefix 검증
// ──────────────────────────────────────────────────────────────────────────────

describe("buildRedevPerAsset* — 3원소 + 라벨 검증", () => {
  const detail = case44Detail();

  it("transfer: 3원소 + ①②③ 라벨", () => {
    const arr = buildRedevPerAssetForTransfer(detail, 525_000_000);
    expect(arr).toHaveLength(3);
    expect(arr[0].label).toContain("①");
    expect(arr[0].label).toContain("인가전");
    expect(arr[1].label).toContain("②");
    expect(arr[1].label).toContain("인가후");
    expect(arr[2].label).toContain("③");
    expect(arr[2].label).toContain("청산금");
    expect(arr[0].value).toBe(219_218_500);
    expect(arr[1].value).toBe(368_877_283);
    expect(arr[2].value).toBe(156_122_716);
  });

  it("acquisition: 3원소 합 = preApproval+post+settlement", () => {
    const arr = buildRedevPerAssetForAcquisition(detail);
    const sum = (arr[0].value as number) + (arr[1].value as number) + (arr[2].value as number);
    expect(sum).toBe(141_221_534 + 219_218_500 + 92_781_500);
  });

  it("expense: 인가전만 2,551,049, 나머지 0", () => {
    const arr = buildRedevPerAssetForExpense(detail);
    expect(arr[0].value).toBe(2_551_049);
    expect(arr[1].value).toBe(0);
    expect(arr[2].value).toBe(0);
  });

  it("gain: 분할별 양도차익", () => {
    const arr = buildRedevPerAssetForGain(detail);
    expect(arr[0].value).toBe(75_445_917);
    expect(arr[1].value).toBe(149_658_784);
    expect(arr[2].value).toBe(63_341_216);
  });

  it("lthd: 분할별 LTHD", () => {
    const arr = buildRedevPerAssetForLthd(detail);
    expect(arr[0].value).toBe(22_633_775);
    expect(arr[1].value).toBe(44_897_634);
    expect(arr[2].value).toBe(16_468_716);
  });

  it("income: 분할별 (gain − lthd)", () => {
    const arr = buildRedevPerAssetForIncome(detail);
    expect(arr[0].value).toBe(52_812_142); // 75,445,917 - 22,633,775
    expect(arr[1].value).toBe(104_761_150); // 149,658,784 - 44,897,634
    expect(arr[2].value).toBe(46_872_500); // 63,341,216 - 16,468,716
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// applyRedevelopmentOverrides — 통합 진입 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

describe("applyRedevelopmentOverrides — StatementItem 갱신", () => {
  const detail = case44Detail();
  const totalTransferPrice = 525_000_000;

  function buildBaseItems(): Map<string, StatementItem> {
    const m = new Map<string, StatementItem>();
    m.set("transferPrice", { label: "양도가액", value: totalTransferPrice, formula: "", legalBasis: "" });
    m.set("acquisitionPrice", { label: "취득가액", value: 0, formula: "", legalBasis: "" });
    m.set("expenses", { label: "필요경비", value: 0, formula: "", legalBasis: "" });
    m.set("transferGain", { label: "전체 양도차익", value: 288_445_917, formula: "", legalBasis: "" });
    m.set("taxableGain", { label: "과세대상 양도차익", value: 288_445_917, formula: "", legalBasis: "" });
    m.set("ltDeduction", { label: "장기보유특별공제", value: 84_000_125, formula: "", legalBasis: "" });
    m.set("ltHoldingPart", { label: " 보유 기간분 장특", value: 0, formula: "", legalBasis: "" });
    m.set("ltResidencePart", { label: " 거주 기간분 장특", value: 0, formula: "", legalBasis: "" });
    m.set("incomeAmount", { label: "양도소득금액", value: 204_445_792, formula: "", legalBasis: "" });
    return m;
  }

  it("transferPrice: perAsset[3] 부착, 합계 그대로", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    const item = items.get("transferPrice")!;
    expect(item.value).toBe(totalTransferPrice); // 합계 보존
    expect(item.perAsset).toHaveLength(3);
  });

  it("acquisitionPrice: 합계 = 분할별 합산", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    const item = items.get("acquisitionPrice")!;
    expect(item.value).toBe(141_221_534 + 219_218_500 + 92_781_500);
    expect(item.perAsset).toHaveLength(3);
  });

  it("expenses: 합계 = estimatedLumpDeduction", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    expect(items.get("expenses")!.value).toBe(2_551_049);
  });

  it("transferGain: 합계 그대로 (회귀 보존)", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    expect(items.get("transferGain")!.value).toBe(288_445_917);
  });

  it("ltDeduction: perAsset[3] + 분할별 율 다름", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    const item = items.get("ltDeduction")!;
    expect(item.perAsset).toHaveLength(3);
    // 청산금분 26%·인가전·인가후 30% 다른 율 inline
    expect(item.perAsset?.[2].formula).toContain("26%");
    expect(item.perAsset?.[0].formula).toContain("30%");
  });

  it("ltHoldingPart/ltResidencePart: perAsset 제거 + note 변경", () => {
    const items = buildBaseItems();
    applyRedevelopmentOverrides(items, detail, totalTransferPrice);
    expect(items.get("ltHoldingPart")!.perAsset).toBeUndefined();
    expect(items.get("ltHoldingPart")!.note).toContain("재개발");
  });
});
