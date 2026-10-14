/**
 * 부담부증여 K-6(매매사례가액)·K-7(감정가액) — Pre-Do anchor
 *
 * 증여재산을 상증법 §60② 시가로 평가하고 증여자의 실지취득가액을 확인할 수 없는 경우,
 * 취득가액은 「소득세법」 §97①1호나목(소령 §163⑫ → §176의2③) 순서 — 매매사례가액 → 감정가액 → 환산 — 로
 * 정한다. 필요경비는 개산공제(소령 §163⑥, 취득당시 기준시가 × 3/100 × 채무비율)뿐이고
 * 실비 택일(§97②2호 단서)은 환산취득가액 전용이다.
 *
 * 계획서: docs/00-pm/burdened-gift-appraisal-sales-case-acquisition.plan.md §1.1·§3.1
 * 교재: 「문제 20 부담부증여(3)」 — 토지 A, 채무 80,000,000
 *
 *   | | 상황 1 (시가 400M) | 상황 2 (기준시가 320M) |
 *   | 양도가액 | 80,000,000 | 80,000,000 |
 *   | 취득가액 | 250M × 80/400 = 50,000,000 | 180M × 80/320 = 45,000,000 |
 *   | 개산공제 | 180M × 3% × 80/400 = 1,080,000 | 180M × 3% × 80/320 = 1,350,000 |
 *   | 양도차익 | 28,920,000 | 33,650,000 |
 *
 * Pre-Do(엔진 구현 전)에는 A-1·A-2·A-4·A-5 red / A-3 green(현행 통과 실측)이었고,
 * 엔진 구현 후 전부 green이며 A-6~A-13(엔진 층 분기·가드)이 추가됐다.
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 문제 20 공통 — 채무 80M(근저당 차입금) · 증여일 기준시가 320M · 취득시 기준시가 180M. */
const COMMON = {
  lendingDepositTotal: 0,
  mortgageDebtAmount: 80_000_000,
  annualRentTotal: 0,
  donorRelation: "lineal_descendant",
  landStdPriceAtTransfer: 320_000_000,
  buildingStdPriceAtTransfer: 0,
  landStdPriceAtAcquisition: 180_000_000,
  buildingStdPriceAtAcquisition: 0,
} as const;

/** 상황 1 — 시가 분명(400M) + 취득 실지거래가액 불명 + 취득 당시 감정/매매사례 250M. */
function marketInfo(method: "appraisal" | "salesCase"): BurdenedGiftInfo {
  return {
    ...COMMON,
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 400_000_000,
    acquisitionMethod: method,
    presumedLandAcquisitionPrice: 250_000_000,
    presumedBuildingAcquisitionPrice: 0,
  };
}

/** 상황 2 — 기준시가(보충적평가). */
const STANDARD_INFO: BurdenedGiftInfo = {
  ...COMMON,
  valuationMode: "sangjeungbeop_standard",
};

function breakdown(info: BurdenedGiftInfo, extra: Record<string, unknown> = {}) {
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: COMMON.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: 0,
    landStdPriceAtAcquisition: COMMON.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: 0,
    info,
    ...extra,
  });
}

function runTransfer(info: BurdenedGiftInfo, extra: Record<string, unknown> = {}) {
  const i = baseTransferInput({
    propertyType: "land",
    transferType: "burdened_gift",
    transferDate: new Date("2026-10-20"),
    transferPrice: 80_000_000,
    acquisitionPrice: 0,
    acquisitionDate: new Date("2018-10-20"),
    burdenedGiftInfo: info,
    ...extra,
  } as never);
  return calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
}

describe("부담부증여 K-7 감정가액 (소법 §97①1호나목 · 소령 §176의2③2호)", () => {
  it("A-1 문제 20 상황 1 — 함수 레벨: 양도 80M · 취득 50M · 개산공제 1,080,000", () => {
    const b = breakdown(marketInfo("appraisal"));
    expect(b.acquisitionMethodUsed).toBe("appraisal");
    expect(b.giftValuation.max).toBe(400_000_000); // C = 시가
    expect(b.perAsset.land.transferPrice).toBe(80_000_000);
    expect(b.perAsset.land.acquisitionPrice).toBe(50_000_000); // 250M × 80/400
    expect(b.perAsset.land.estimatedDeduction).toBe(1_080_000); // 180M × 80/400 × 3%
    expect(b.perAsset.land.estimatedDeductionRate).toBe(0.03);
  });

  it("A-1 문제 20 상황 1 — 통합: 양도차익 28,920,000", () => {
    const r = runTransfer(marketInfo("appraisal"));
    expect(r.transferGain).toBe(28_920_000);
  });

  it("A-4 실비(자본적지출 150M·양도비 20M)를 입력해도 무시된다 — swap은 환산 전용(§97②2호 단서)", () => {
    const r = runTransfer(marketInfo("appraisal"), {
      capitalExpenditure: 150_000_000,
      transferExpense: 20_000_000,
    });
    expect(r.transferGain).toBe(28_920_000);
    const b = breakdown(marketInfo("appraisal"), {
      capitalExpenditure: 150_000_000,
      transferExpense: 20_000_000,
    });
    expect(b.perAsset.land.estimatedDeduction).toBe(1_080_000);
  });

  it("A-5 미등기양도 — 개산공제율 3/1000(소령 §163⑥1호 단서)", () => {
    const b = breakdown(marketInfo("appraisal"), { isUnregistered: true });
    // 경로 단언 필수 — 새 값을 모르는 현행 엔진도 legacy 분기로 개산공제율만은 맞게 내므로(Pre-Do 실측: 가짜 green)
    // 이 단언이 없으면 새 분기를 검증하지 못한다.
    expect(b.acquisitionMethodUsed).toBe("appraisal");
    expect(b.perAsset.land.acquisitionPrice).toBe(50_000_000);
    expect(b.perAsset.land.estimatedDeductionRate).toBe(0.003);
    expect(b.perAsset.land.estimatedDeduction).toBe(108_000); // 180M × 80/400 × 0.3%
  });
});

describe("부담부증여 K-6 매매사례가액 (소법 §97①1호나목 · 소령 §176의2③1호)", () => {
  it("A-2 문제 20 상황 1과 같은 값 — 취득 50M · 개산공제 1,080,000 · 양도차익 28,920,000", () => {
    const b = breakdown(marketInfo("salesCase"));
    expect(b.acquisitionMethodUsed).toBe("salesCase");
    expect(b.perAsset.land.acquisitionPrice).toBe(50_000_000);
    expect(b.perAsset.land.estimatedDeduction).toBe(1_080_000);
    expect(runTransfer(marketInfo("salesCase")).transferGain).toBe(28_920_000);
  });
});

describe("문제 20 상황 2 — 기준시가 모드 (회귀 가드, 현행 통과)", () => {
  it("A-3 취득 45M · 개산공제 1,350,000 · 양도차익 33,650,000", () => {
    const b = breakdown(STANDARD_INFO);
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.giftValuation.max).toBe(320_000_000); // C = 보충적평가
    expect(b.perAsset.land.acquisitionPrice).toBe(45_000_000); // 180M × 80/320
    expect(b.perAsset.land.estimatedDeduction).toBe(1_350_000); // 180M × 80/320 × 3%
    expect(runTransfer(STANDARD_INFO).transferGain).toBe(33_650_000);
  });

  it("A-3 자본적지출·양도비를 입력해도 무시된다 (기준시가 모드는 개산공제)", () => {
    const r = runTransfer(STANDARD_INFO, {
      capitalExpenditure: 150_000_000,
      transferExpense: 20_000_000,
    });
    expect(r.transferGain).toBe(33_650_000);
  });
});

describe("엔진 층 분기·가드 (A-6~A-13)", () => {
  it("A-6 담보평가(§66)가 시가보다 커서 C가 되면 괄호가 발동해 기준시가로 강제 — 감정값은 쓰이지 않는다", () => {
    const info: BurdenedGiftInfo = {
      ...marketInfo("appraisal"),
      mortgageDebtAmount: 80_000_000,
      mortgageSetAmount: 80_000_000,
      marketValueAtTransfer: 50_000_000, // C = max(시가 50M, 담보 80M) = 80M
    };
    const b = breakdown(info);
    // 담보평가 80M 채택 → 기준시가로 강제 → 취득가액 = 180M × 80/80M
    expect(b.giftValuation.selectedMode).toBe("mortgage");
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.perAsset.land.acquisitionPrice).toBe(180_000_000);
  });

  it("A-7 일반건물 — 토지·건물 감정가를 분리 입력하면 자산별 감정가 × 채무비율", () => {
    const info: BurdenedGiftInfo = {
      ...COMMON,
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: 400_000_000,
      landStdPriceAtTransfer: 280_000_000,
      buildingStdPriceAtTransfer: 120_000_000,
      landStdPriceAtAcquisition: 140_000_000,
      buildingStdPriceAtAcquisition: 60_000_000,
      acquisitionMethod: "appraisal",
      presumedLandAcquisitionPrice: 180_000_000,
      presumedBuildingAcquisitionPrice: 70_000_000,
    };
    const b = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 280_000_000,
      buildingStdPriceAtTransfer: 120_000_000,
      landStdPriceAtAcquisition: 140_000_000,
      buildingStdPriceAtAcquisition: 60_000_000,
      info,
    });
    expect(b.perAsset.land.acquisitionPrice).toBe(36_000_000); // 180M × 80/400
    expect(b.perAsset.building.acquisitionPrice).toBe(14_000_000); // 70M × 80/400
    expect(b.perAsset.land.presumedAcquisition).toBe(180_000_000);
    // 개산공제 base = 취득시 기준시가 × 채무비율 (감정가가 아님)
    expect(b.perAsset.land.estimatedDeduction).toBe(840_000); // 140M × 80/400 × 3%
    expect(b.perAsset.building.estimatedDeduction).toBe(360_000); // 60M × 80/400 × 3%
  });

  it("A-8 단일 총액 — 취득시 기준시가 비율로 토지·건물 분배(잔액 흡수) 후 × 채무비율", () => {
    const info: BurdenedGiftInfo = {
      ...COMMON,
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: 400_000_000,
      landStdPriceAtTransfer: 280_000_000,
      buildingStdPriceAtTransfer: 120_000_000,
      landStdPriceAtAcquisition: 140_000_000,
      buildingStdPriceAtAcquisition: 60_000_000,
      acquisitionMethod: "salesCase",
      presumedAcquisitionTotal: 250_000_000,
    };
    const b = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 280_000_000,
      buildingStdPriceAtTransfer: 120_000_000,
      landStdPriceAtAcquisition: 140_000_000,
      buildingStdPriceAtAcquisition: 60_000_000,
      info,
    });
    expect(b.perAsset.land.presumedAcquisition).toBe(175_000_000); // 250M × 140/200
    expect(b.perAsset.building.presumedAcquisition).toBe(75_000_000); // 잔액 흡수
    expect(b.perAsset.land.acquisitionPrice).toBe(35_000_000); // 175M × 80/400
    expect(b.perAsset.building.acquisitionPrice).toBe(15_000_000);
  });

  it("A-8b 단일 총액인데 취득시 기준시가가 0이면 분배 불가 — fail-fast", () => {
    const info: BurdenedGiftInfo = {
      ...marketInfo("appraisal"),
      landStdPriceAtAcquisition: 0,
      presumedLandAcquisitionPrice: undefined,
      presumedBuildingAcquisitionPrice: undefined,
      presumedAcquisitionTotal: 250_000_000,
    };
    expect(() => breakdown(info)).toThrow(/취득시 기준시가/);
  });

  it("A-9 금액 미입력 — 0으로 계산하지 않고 fail-fast (취득가액 0 → 양도차익 과대 방지)", () => {
    const info: BurdenedGiftInfo = {
      ...marketInfo("appraisal"),
      presumedLandAcquisitionPrice: undefined,
      presumedBuildingAcquisitionPrice: undefined,
    };
    expect(() => breakdown(info)).toThrow(/감정가액/);
    const sales: BurdenedGiftInfo = { ...info, acquisitionMethod: "salesCase" };
    expect(() => breakdown(sales)).toThrow(/매매사례가액/);
  });

  it("A-10 공유지분 — 감정가액도 지분분으로 축소(A·C 같은 비율, 채무 B는 그대로)", () => {
    const b = breakdown(marketInfo("appraisal"), { ownershipRatio: 0.5 });
    expect(b.perAsset.land.presumedAcquisition).toBe(125_000_000); // 250M × 1/2
    expect(b.giftValuation.max).toBe(200_000_000); // C 400M × 1/2
    // 취득가액 = 125M × 80M/200M
    expect(b.perAsset.land.acquisitionPrice).toBe(50_000_000);
  });

  it("A-11 조합원입주권 × 감정가액 — 조용히 K-4로 무시하지 않고 차단", () => {
    const info: BurdenedGiftInfo = {
      ...marketInfo("appraisal"),
      rightValuation: { memberRightsValue: 300_000_000, paidInstallments: 50_000_000, premium: 50_000_000 },
    };
    expect(() => breakdown(info)).toThrow(/조합원입주권/);
  });

  it("A-12 이월과세 × 감정가액·매매사례가액 — 1차 차단(당초 증여자 값 칸 없음)", async () => {
    const { assertCarryoverDonorBasis } = await import("@/lib/tax-engine/transfer-tax-carryover-burdened-gift");
    const ct = {} as never;
    expect(() => assertCarryoverDonorBasis(marketInfo("appraisal"), ct)).toThrow(/이월과세/);
    expect(() => assertCarryoverDonorBasis(marketInfo("salesCase"), ct)).toThrow(/이월과세/);
  });

  it("A-13 신축 5년 이내 × 감정가액 — 차단하지 않는다(PR-3: §114조의2 가산세 연결, 건물 몫이 없는 토지는 0). 매매사례가액도 통과", () => {
    const selfBuilt = {
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2023-01-01"),
    };
    expect(runTransfer(marketInfo("appraisal"), selfBuilt).transferGain).toBe(28_920_000);
    expect(runTransfer(marketInfo("salesCase"), selfBuilt).transferGain).toBe(28_920_000);
  });

  it("A-13b 증축 5년 이내 × 감정가액 — 증축한 부분의 감정가액을 받는 칸이 없어 차단 (가산세 연결은 신축만)", () => {
    const extension = {
      isSelfBuilt: true,
      buildingType: "extension",
      extensionFloorArea: 120,
      constructionDate: new Date("2023-01-01"),
    };
    expect(() => runTransfer(marketInfo("appraisal"), extension)).toThrow(/제114조의2/);
    expect(runTransfer(marketInfo("salesCase"), extension).transferGain).toBe(28_920_000);
  });
});
