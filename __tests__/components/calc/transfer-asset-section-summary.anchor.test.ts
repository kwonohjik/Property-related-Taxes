/**
 * anchor — 양도세 자산 카드 접기 섹션 헤더 라벨 요약 (summarizeAssetSections)
 *
 * 계획: docs/00-pm/transfer-asset-input-progressive-disclosure.plan.md §4-3
 * UI:   docs/02-design/features/transfer-asset-input-progressive-disclosure.ui.design.md §4
 *
 * 핵심 계약:
 *  - 헤더 요약은 **라벨 전용, 금액 미포함**(dual-truth 회피 — 금액 합계는 사이드바 computeTransferSummary)
 *  - 8 assetKind × (지분/부담부/환산/특수자산/일괄안분) 분기에서 라벨이 깨지지 않음
 *  - ④ filled 는 자산-수준 금액(>0) 또는 폼-전역 일괄 양도비 활성으로 판정 (자산 transferExpense 기본 "0")
 *  - ⑤ extras 는 land+NBL정밀 / housing·입주권에서만 non-null
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { summarizeAssetSections } from "@/components/calc/transfer/asset-section-summary";

function asset(overrides: Partial<AssetForm>): AssetForm {
  return { ...makeDefaultAsset(1), ...overrides };
}

describe("summarizeAssetSections — 헤더 라벨 요약 (금액 없음)", () => {
  it("신규 토지 — 전부 미입력", () => {
    const s = summarizeAssetSections(asset({ assetKind: "land" }), {});
    expect(s.basic).toEqual({ label: "단순토지(나대지,농지,임야) · 소재지 미입력", filled: false });
    expect(s.transfer).toEqual({ label: "일반 양도", filled: false });
    expect(s.acquisition).toEqual({ label: "매매 · 실거래가", filled: false });
    expect(s.expense).toEqual({ label: "미입력", filled: false });
    expect(s.extras).toBeNull();
  });

  it("토지 — 소재지·면적·환산·양도가·자본적지출 입력", () => {
    const s = summarizeAssetSections(
      asset({
        assetKind: "land",
        addressJibun: "제주특별자치도 서귀포시 효돈동 628-2",
        transferArea: "2417",
        acquisitionArea: "2417",
        useEstimatedAcquisition: true,
        acquisitionDate: "1988-12-03",
        actualSalePrice: "550000000",
        capitalExpenditure: "5000000",
      }),
      {},
    );
    expect(s.basic).toEqual({
      label: "단순토지(나대지,농지,임야) · 제주특별자치도 서귀포시 효돈동 628-2 · 면적 입력됨",
      filled: true,
    });
    expect(s.transfer).toEqual({ label: "일반 양도", filled: true });
    expect(s.acquisition).toEqual({ label: "매매 · 환산취득가", filled: true });
    expect(s.expense).toEqual({ label: "입력됨", filled: true });
    expect(s.extras).toBeNull();
  });

  it("주택 부담부증여 — §159 자동산정, 상속 취득", () => {
    const s = summarizeAssetSections(
      asset({
        assetKind: "housing",
        transferType: "burdened_gift",
        acquisitionCause: "inheritance",
        acquisitionDate: "2010-05-01",
        buildingName: "래미안",
      }),
      {},
    );
    expect(s.basic).toEqual({ label: "주택 · 래미안", filled: true });
    expect(s.transfer).toEqual({ label: "§159 자동산정", filled: true });
    expect(s.acquisition).toEqual({ label: "상속 · 실거래가", filled: true });
    expect(s.expense.filled).toBe(false);
    // 주택 → 장기임대 거주주택 특례 섹션 노출(미적용)
    expect(s.extras).toEqual({ label: "장기임대 거주주택 특례", filled: false });
  });

  it("일반건물(특수자산) — ③ 방식 대신 원인 라벨만", () => {
    const s = summarizeAssetSections(
      asset({
        assetKind: "general_building",
        acquisitionCause: "purchase",
        useEstimatedAcquisition: true,
        acquisitionDate: "2015-01-01",
      }),
      {},
    );
    expect(s.basic).toEqual({ label: "일반건물(토지+건물 일괄) · 소재지 미입력", filled: false });
    expect(s.acquisition).toEqual({ label: "매매", filled: true });
    expect(s.extras).toBeNull();
  });

  it("토지 + 비사업용 정밀판정 → extras 노출(적용)", () => {
    const s = summarizeAssetSections(
      asset({ assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: true }),
      {},
    );
    expect(s.extras).toEqual({ label: "비사업용 토지 정밀판정", filled: true });
  });

  it("④ 일괄 양도비(폼-전역) 활성 시 자산 transferExpense=0 이어도 filled", () => {
    const s = summarizeAssetSections(
      asset({ assetKind: "land", capitalExpenditure: "0", transferExpense: "0" }),
      { totalTransferExpense: "3000000" },
    );
    expect(s.expense).toEqual({ label: "입력됨", filled: true });
  });

  it("8개 assetKind 전부 basic.label 이 종류 라벨로 시작", () => {
    const expected: Record<AssetForm["assetKind"], string> = {
      housing: "주택",
      land: "단순토지(나대지,농지,임야)",
      building: "건물(토지 제외)",
      right_to_move_in: "입주권",
      presale_right: "분양권",
      commercial_building: "상업용건물·오피스텔",
      general_building: "일반건물(토지+건물 일괄)",
      redevelopment_apt: "재개발/재건축 APT",
    };
    (Object.keys(expected) as Array<AssetForm["assetKind"]>).forEach((kind) => {
      const s = summarizeAssetSections(asset({ assetKind: kind }), {});
      expect(s.basic.label.startsWith(expected[kind])).toBe(true);
    });
  });

  it("매매사례가액·감정가액 산정방식 라벨", () => {
    const salesCase = summarizeAssetSections(
      asset({ assetKind: "land", isSalesCaseAcquisition: true, acquisitionDate: "2020-01-01" }),
      {},
    );
    expect(salesCase.acquisition.label).toBe("매매 · 매매사례가액");
    const appraisal = summarizeAssetSections(
      asset({ assetKind: "building", isAppraisalAcquisition: true, acquisitionDate: "2020-01-01" }),
      {},
    );
    expect(appraisal.acquisition.label).toBe("매매 · 감정가액");
  });
});
