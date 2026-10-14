/**
 * anchor — 부담부증여 「매매사례가액(K-6)·감정가액(K-7)」 ⑤ 입력 위젯 + ⑦ 결과 표시.
 *
 * ⑤: 라디오 4옵션(법령 순차 순서) · 고를 수 없는 자산의 비활성(⑧과 같은 술어) · 자산 종류별 입력 칸 · 개산공제 안내.
 * ⑦: 새 값이 「기준시가 안분」으로 **조용히 떨어지지 않는다** — 라벨·산식·개산공제 산식이 엔진 값과 일치한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import {
  buildBgAcquisitionFormula,
  buildBgExpenseFormula,
} from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function land(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2018-10-20",
    acquisitionCause: "purchase",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "400,000,000",
    bgMortgageDebtAmount: "80,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    bgPresumedAcquisitionLand: "250,000,000",
    standardPriceAtTransfer: "320,000,000",
    standardPriceAtAcq: "180,000,000",
    ...over,
  } as AssetForm;
}

const renderBlock = (a: AssetForm, props: { isFractionalSplit?: boolean; transferDate?: string } = {}) =>
  render(<BurdenedGiftBlock asset={a} onChange={() => {}} {...props} />);

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("⑤ 라디오 4옵션", () => {
  it("법령 순차 순서(실지 → 매매사례 → 감정 → 환산)로 4개가 렌더된다", () => {
    renderBlock(land());
    const group = document.querySelector('[data-field="bgAcquisitionMethod"]')!;
    const values = Array.from(group.querySelectorAll<HTMLInputElement>('input[type="radio"]')).map((r) => r.value);
    expect(values).toEqual(["actual", "salesCase", "appraisal", "converted"]);
  });

  it("🔴 새 옵션 문구에 「환산취득가액」·「실지취득가액 안분」이 없다 — 기존 E2E 라디오 셀렉터 strict mode", () => {
    renderBlock(land());
    expect(screen.getAllByRole("radio", { name: /환산취득가액/ })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: /실지취득가액 안분/ })).toHaveLength(1);
  });

  it("정상 자산에서는 새 두 옵션이 활성이다", () => {
    renderBlock(land({ bgAcquisitionMethod: "" }));
    expect(radio(/매매사례가액/).disabled).toBe(false);
    expect(radio(/감정가액/).disabled).toBe(false);
  });

  it("상속받은 자산 — 두 옵션 비활성 + 사유 (⑧과 같은 술어)", () => {
    renderBlock(land({ acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-01", bgAcquisitionMethod: "" }));
    expect(radio(/매매사례가액/).disabled).toBe(true);
    expect(radio(/감정가액/).disabled).toBe(true);
    expect(screen.getAllByText(/상증법 평가액이 취득 당시 실지거래가액으로 간주되어 쓸 수 없습니다/).length).toBe(2);
  });

  it("이월과세 자산 — 두 옵션이 활성(당초 증여자 값 입력 경로가 생겼다)", () => {
    renderBlock(land({ acquisitionCause: "carryover_gift", bgAcquisitionMethod: "" }));
    expect(radio(/매매사례가액/).disabled).toBe(false);
    expect(radio(/감정가액/).disabled).toBe(false);
  });

  it("증축 5년 이내(85㎡ 초과) × 감정가액 — 감정가액만 비활성(매매사례는 활성)", () => {
    const a = land({ assetKind: "housing", isSelfBuilt: true, buildingType: "extension", extensionFloorArea: "120", constructionDate: "2020-05-01", bgAcquisitionMethod: "" });
    renderBlock(a, { transferDate: "2023-06-01" });
    expect(radio(/감정가액/).disabled).toBe(true);
    expect(radio(/매매사례가액/).disabled).toBe(false);
    expect(screen.getByText(/증축한 부분 감정가액의 5% 가산세\(소득세법 §114조의2\)/)).toBeTruthy();
  });

  it("신축 5년 이내 × 감정가액 — 가산세를 연결해 계산하므로 비활성이 아니다(PR-3)", () => {
    const a = land({ assetKind: "housing", isSelfBuilt: true, buildingType: "new", constructionDate: "2020-05-01", bgAcquisitionMethod: "" });
    renderBlock(a, { transferDate: "2023-06-01" });
    expect(radio(/감정가액/).disabled).toBe(false);
    expect(screen.queryByText(/5% 가산세\(소득세법 §114조의2\)/)).toBeNull();
  });

  it("라디오 선택 시 onChange가 방식 patch(값 초기화 포함)를 낸다", () => {
    const calls: Partial<AssetForm>[] = [];
    render(<BurdenedGiftBlock asset={land({ bgAcquisitionMethod: "appraisal" })} onChange={(p) => calls.push(p)} />);
    fireEvent.click(radio(/매매사례가액/));
    expect(calls[0]).toMatchObject({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionLand: "", bgPresumedAcquisitionTotal: "" });
  });
});

describe("⑤ 입력 칸 — 자산 종류별 3분기 + 안내", () => {
  const field = (n: string) => document.querySelector(`[data-field="${n}"]`);

  it("토지: 토지 칸 1개", () => {
    renderBlock(land());
    expect(field("bgPresumedAcquisitionLand")).toBeTruthy();
    expect(field("bgPresumedAcquisitionTotal")).toBeNull();
    expect(screen.getByText("토지 감정가액")).toBeTruthy();
  });

  it("주택: 총액 1칸 (라벨 「매매사례가액 (주택·건물 전체)」)", () => {
    renderBlock(land({ assetKind: "housing", bgAcquisitionMethod: "salesCase" }));
    expect(field("bgPresumedAcquisitionTotal")).toBeTruthy();
    expect(field("bgPresumedAcquisitionLand")).toBeNull();
    expect(screen.getByText("매매사례가액 (주택·건물 전체)")).toBeTruthy();
  });

  it("일반건물: 토지·건물 2칸", () => {
    renderBlock(land({ assetKind: "general_building" }));
    expect(field("bgPresumedAcquisitionLand")).toBeTruthy();
    expect(field("bgPresumedAcquisitionBuilding")).toBeTruthy();
    expect(field("bgPresumedAcquisitionTotal")).toBeNull();
  });

  it("개산공제 안내 — 자본적지출·양도비 미공제, 실지취득가액 입력 블록은 뜨지 않는다", () => {
    renderBlock(land());
    const notice = document.querySelector('[data-testid="bg-presumed-expense-notice"]')!;
    expect(notice.textContent).toContain("개산공제");
    expect(notice.textContent).toContain("자본적지출·양도비는 공제하지 않습니다");
    expect(screen.queryByText("실지취득가액 입력")).toBeNull();
    expect(screen.queryByText("자본적지출 (선택)")).toBeNull();
  });

  it("대조군 — 실지·환산 선택 시 새 입력 블록이 없다", () => {
    for (const m of ["actual", "converted"] as const) {
      renderBlock(land({ bgAcquisitionMethod: m }));
      expect(field("bgPresumedAcquisitionLand")).toBeNull();
      cleanup();
    }
  });
});

// ── ⑦ 결과 표시 ──────────────────────────────────────────────────────────────

function breakdownOf(a: AssetForm) {
  const info = buildBurdenedGiftInfo(a) as unknown as BurdenedGiftInfo;
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: info.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
    info,
  });
}

describe("⑦ BurdenedGiftDetailCard — 「기준시가 안분」으로 떨어지지 않는다", () => {
  it.each([
    ["appraisal", "감정가액 안분", "토지 취득가 = 감정가액 250,000,000 × 채무비율 20.0000%"],
    ["salesCase", "매매사례가액 안분", "토지 취득가 = 매매사례가액 250,000,000 × 채무비율 20.0000%"],
  ] as const)("%s", (method, header, row) => {
    const bg = breakdownOf(land({ bgAcquisitionMethod: method }));
    render(<BurdenedGiftDetailCard breakdown={bg} propertyType="land" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(`자산별 취득가액 (${header}`);
    expect(text).not.toContain("기준시가 안분 · 소령 §159①1호");
    expect(text).toContain(row.replace(/\s+/g, " "));
    // 개산공제 산식이 값과 일치한다 — 취득시 기준시가 180,000,000 × 20% × 3% = 1,080,000
    expect(text).toContain("토지 개산공제 = 취득시 기준시가 180,000,000 × 채무비율 20.0000% × 개산공제율 3%");
    expect(text).toContain("1,080,000");
    expect(text).toContain("필요경비는 개산공제(소령 §163⑥)만 인정하며 자본적지출·양도비는 공제하지 않습니다");
  });

  it("대조군 — 기준시가 모드는 종전 문구", () => {
    const bg = breakdownOf(land({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" }));
    render(<BurdenedGiftDetailCard breakdown={bg} propertyType="land" />);
    expect(document.body.textContent).toContain("기준시가 안분 · 소령 §159①1호");
  });
});

describe("⑦ 상세명세서 산식(Q-7) — 적힌 산식이 적힌 값을 만든다", () => {
  const bg = breakdownOf(land());
  const l = bg.perAsset.land;

  it("취득가액: 감정가액 × 채무액 / 증여재산 평가액", () => {
    const f = buildBgAcquisitionFormula(bg, l, l.acquisitionPrice);
    expect(f).toContain("취득가액 = 감정가액 × 채무액 / 증여재산 평가액");
    expect(f).toContain("= 250,000,000 × 80,000,000 / 400,000,000");
    expect(f).toContain("= 50,000,000");
    expect(f).not.toContain("기준시가 모드 환산");
  });

  it("필요경비: 개산공제 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × 율 (= 취득가액 × 3%가 아니다)", () => {
    const f = buildBgExpenseFormula(bg, l);
    expect(f).toContain("= 180,000,000 × 80,000,000 / 400,000,000 × 0.03");
    expect(f).toContain("= 1,080,000");
    expect(f).toContain("자본적지출·양도비는 공제하지 않습니다");
    // 종전 거짓 등식(안분 취득가액 50,000,000 × 3% = 1,500,000)을 적지 않는다
    expect(f).not.toContain("50,000,000 × 0.03");
  });

  it("미등기 — 율 0.3%가 echo대로 적힌다", () => {
    const info = buildBurdenedGiftInfo(land()) as unknown as BurdenedGiftInfo;
    const u = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: info.landStdPriceAtTransfer,
      buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
      landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
      buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
      info,
      isUnregistered: true,
    });
    const f = buildBgExpenseFormula(u, u.perAsset.land);
    expect(f).toContain("× 0.3%");
    expect(f).toContain("× 0.003");
    expect(f).toContain("= 108,000");
  });

  it("환산(K-5)도 개산공제 base를 정확히 적는다 — 종전 「환산 취득가액 × 3%」 거짓 등식 정정", () => {
    const k5 = breakdownOf(land({ bgAcquisitionMethod: "converted", bgPresumedAcquisitionLand: "" }));
    const f = buildBgExpenseFormula(k5, k5.perAsset.land);
    expect(f).toContain("= 180,000,000 × 80,000,000 / 400,000,000 × 0.03");
    expect(f).toContain(`= ${k5.perAsset.land.estimatedDeduction.toLocaleString("ko-KR")}`);
    const a = buildBgAcquisitionFormula(k5, k5.perAsset.land, k5.perAsset.land.acquisitionPrice);
    expect(a).toContain("환산취득가액");
    expect(a).toContain("× 180,000,000 / 320,000,000");
  });

  it("기준시가 모드(K-1~K-3)는 종전 표기 유지", () => {
    const std = breakdownOf(land({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" }));
    const f = buildBgAcquisitionFormula(std, std.perAsset.land, std.perAsset.land.acquisitionPrice);
    expect(f).toContain("기준시가 모드 환산");
    expect(buildBgExpenseFormula(std, std.perAsset.land)).toContain("안분 취득가액 × 3% (개산공제, 소령 §163⑥)");
  });
});

describe("⑦ BurdenedTransferTaxResultCard — 상세 펼침 산식 + 양도차익 행", () => {
  const resultOf = (a: AssetForm) =>
    ({
      isExempt: false,
      transferGain: 28_920_000,
      taxableGain: 28_920_000,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      basicDeduction: 0,
      taxBase: 28_920_000,
      calculatedTax: 4_000_000,
      reductionAmount: 0,
      determinedTax: 4_000_000,
      penaltyTax: 0,
      localIncomeTax: 400_000,
      totalTax: 4_400_000,
      progressiveDeduction: 0,
      appliedRate: 0.15,
      steps: [],
      transferBurdenedGiftBreakdown: breakdownOf(a),
    }) as unknown as TransferTaxResult;

  it.each([
    ["appraisal", "감정가액", "2호"],
    ["salesCase", "매매사례가액", "1호"],
  ] as const)("%s — 취득가액 산정 문구·개산공제 합계가 보인다(상세는 접혀 있어도 DOM에 있다)", (method, label, item) => {
    render(<BurdenedTransferTaxResultCard transferTaxResults={[resultOf(land({ bgAcquisitionMethod: method }))]} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(`취득가액 산정: ${label}`);
    expect(text).toContain(`시행령 §176의2③${item}`);
    expect(text).toContain("개산공제 1,080,000");
    expect(text).toContain("자본적지출·양도비는 공제하지 않습니다");
    expect(text).not.toContain("취득시 기준시가 × 채무 증여재산 기준시가");
    // 양도가액 80,000,000 · 취득가액 (−) 50,000,000
    expect(text).toContain("80,000,000");
    expect(text).toContain("(−) 50,000,000");
  });
});
