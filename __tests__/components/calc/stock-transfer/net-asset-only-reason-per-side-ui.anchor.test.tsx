/**
 * @vitest-environment jsdom
 *
 * ⑤ 영 §165④3 순자산 단독 사유 — 양도 당시 · 취득 당시 칸이 따로다 (PR-6)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §14
 *
 *   UI-PS-1  양측 화면 → 사유 칸 둘 / 취득측만 → 취득 칸 / 양도측만 → 양도 칸 / 사례 49 → 양도 칸
 *   UI-PS-2  양도만 단독 → 양도 순손익 칸 숨김 · 취득 순손익 칸 유지 · 2:3 토글 유지 · 시점 안내
 *   UI-PS-3  취득만 단독 → 반대
 *   UI-PS-4  결산서(full) 모드 → 단독인 시점의 열만 숨김
 *   UI-PS-5  취득 칸을 누르면 acquisitionNetAssetOnlyReason
 *   UI-PS-6  증여 부담부 — 종전 레코드에서 양도 사유를 바꾸면 취득 사유를 고정
 *   UI-PS-7  증여 부담부 — 새로 켠 레코드의 취득 사유는 null
 *   UI-PS-8  결과 — 취득일 거래정지 산식 분해는 취득 근거를 읽는다
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { fromUnlistedBlockPatch } from "@/components/calc/gift/StockBurdenedUnlistedValuationBlock";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import { EstimatedValuationBreakdown } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), securityName: "시점별사유법인", marketType: "unlisted", transferDate: "2024-06-01", ...o };
}
const groups = (c: HTMLElement) =>
  [...new Set(Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"]')).map((i) => i.name))].filter((n) =>
    n.endsWith("etAssetOnlyReason"),
  );
const niBox = (name: string) => screen.queryByRole("textbox", { name });

describe("UI-PS-1: 화면별 사유 칸", () => {
  it("양측 → 양도·취득 두 칸", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} />);
    expect(groups(container)).toEqual(["netAssetOnlyReason", "acquisitionNetAssetOnlyReason"]);
  });
  it("취득측만(취득일 거래정지·매매사례) → 취득 칸", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} acquisitionSideOnly />);
    expect(groups(container)).toEqual(["acquisitionNetAssetOnlyReason"]);
  });
  it("양도측만(이월과세 증여자 기준 환산의 분모) → 양도 칸", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} transferSideOnly />);
    expect(groups(container)).toEqual(["netAssetOnlyReason"]);
  });
  it("사례 49(취득시 장부분실 액면가) → 양도 칸", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ acqFaceValueOnly: true })} onChange={vi.fn()} />);
    expect(groups(container)).toEqual(["netAssetOnlyReason"]);
  });
});

describe("UI-PS-2·3: 한쪽만 단독", () => {
  it("양도만 → 양도 순손익 칸 없음 · 취득 순손익 칸 있음 · 2:3 토글 있음 · 시점 안내", () => {
    render(<EstimatedUnlistedBlock form={formOf({ netAssetOnlyReason: "no_business_or_short_or_closed" })} onChange={vi.fn()} />);
    expect(niBox("1주당 순손익가치")).toBeNull();
    expect(niBox("1주당 순손익가치 (취득시점)")).not.toBeNull();
    expect(screen.queryByTestId("reversal-corp-toggle")).not.toBeNull();
    expect(screen.getByTestId("net-asset-only-side-caption").textContent).toContain("양도 당시 평가는 순자산가치 단독");
  });
  it("취득만 → 반대", () => {
    render(
      <EstimatedUnlistedBlock form={formOf({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" })} onChange={vi.fn()} />,
    );
    expect(niBox("1주당 순손익가치")).not.toBeNull();
    expect(niBox("1주당 순손익가치 (취득시점)")).toBeNull();
    expect(screen.getByTestId("net-asset-only-side-caption").textContent).toContain("취득 당시 평가는 순자산가치 단독");
  });
  it("양측 → 두 순손익 칸 없음 · 2:3 토글 없음 · 시점 안내 없음", () => {
    render(
      <EstimatedUnlistedBlock
        form={formOf({ netAssetOnlyReason: "no_business_or_short_or_closed", acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" })}
        onChange={vi.fn()}
      />,
    );
    expect(niBox("1주당 순손익가치")).toBeNull();
    expect(niBox("1주당 순손익가치 (취득시점)")).toBeNull();
    expect(screen.queryByTestId("reversal-corp-toggle")).toBeNull();
    expect(screen.queryByTestId("net-asset-only-side-caption")).toBeNull();
  });
});

describe("UI-PS-4: 결산서 모드 — 열별", () => {
  it("양도만 단독 → 순손익 계산서는 취득 열만 · 시점 안내", () => {
    render(
      <EstimatedUnlistedBlock
        form={formOf({ unlistedValuationMode: "full", netAssetOnlyReason: "no_business_or_short_or_closed" })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/순손익 계산서 .*24행 × 취득연도/)).toBeInTheDocument();
    expect(screen.getByTestId("eu-ni-side-hidden-notice").textContent).toContain("양도연도");
    expect(screen.queryByTestId("eu-ni-hidden-notice")).toBeNull();
  });
  it("양측 단독 → 순손익 계산서 자체가 없다", () => {
    render(
      <EstimatedUnlistedBlock
        form={formOf({
          unlistedValuationMode: "full",
          netAssetOnlyReason: "no_business_or_short_or_closed",
          acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed",
        })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/순손익 계산서/)).toBeNull();
    expect(screen.getByTestId("eu-ni-hidden-notice")).toBeInTheDocument();
  });
});

describe("UI-PS-5: 취득 칸 선택", () => {
  it("누르면 acquisitionNetAssetOnlyReason만 실린다", () => {
    const onChange = vi.fn();
    const { container } = render(<EstimatedUnlistedBlock form={formOf()} onChange={onChange} />);
    fireEvent.click(container.querySelector<HTMLInputElement>('input[name="acquisitionNetAssetOnlyReason"][value="liquidation_or_owner_death"]')!);
    expect(onChange).toHaveBeenCalledWith({ acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" });
  });
});

describe("UI-PS-6: 증여 부담부 — 종전 레코드의 취득 사유 고정", () => {
  it("취득 키 없음 + 양도 사유 변경 → 취득은 종전 양도 사유로 고정", () => {
    expect(
      fromUnlistedBlockPatch({ netAssetOnlyReason: "" }, { netAssetOnlyReason: "liquidation_or_owner_death" }),
    ).toEqual({ netAssetOnlyReason: undefined, acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" });
  });
  it("취득 키 null(새 레코드) → 고정하지 않는다", () => {
    expect(
      fromUnlistedBlockPatch({ netAssetOnlyReason: "liquidation_or_owner_death" }, { acquisitionNetAssetOnlyReason: null }),
    ).toEqual({ netAssetOnlyReason: "liquidation_or_owner_death" });
  });
});

describe("UI-PS-7: 증여 부담부 — 새로 켠 레코드의 취득 사유는 null(«없음»)", () => {
  it("「양도소득세 함께 계산」을 켜면 acquisitionNetAssetOnlyReason: null로 만든다 (undefined면 종전 레코드로 읽힌다)", () => {
    const onUpdate = vi.fn();
    const item = {
      id: "g1",
      name: "비상장",
      category: "unlisted_stock",
      marketValue: 5_000_000_000,
      assumedDebtForGift: 1_000_000_000,
      unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    } as unknown as EstateItem;
    render(<StockBurdenedDebtSection item={item} onUpdate={onUpdate} mode="gift" transferDate="2025-06-02" />);
    fireEvent.click(screen.getByText("양도소득세 함께 계산"));
    const bgt = (onUpdate.mock.calls.at(-1)?.[0] as EstateItem).burdenedGiftStockTransferTax;
    expect(bgt).toBeDefined();
    expect(bgt!.acquisitionNetAssetOnlyReason).toBeNull();
  });
});

describe("UI-PS-8: 결과 — 취득일 거래정지 산식 분해는 취득 근거를 읽는다", () => {
  it("acquisitionNetAssetOnlyReason → 「순자산가치 단독」 · 양도 근거만 있으면 가중평균", () => {
    const at = (vd: Record<string, unknown>) =>
      ({
        acquisitionPrice: 80_000_000,
        appliedRules: [],
        valuationDetail: {
          method: "halt_acquisition_conversion",
          netAssetFloorApplied: false,
          finalPerShareValue: 10_000,
          conversionAcqStdPerShare: 10_000,
          conversionTransferStd: 750_000,
          niPerShare: 6_000,
          naPerShare: 10_000,
          isHeavyRE: false,
          section165_4Model: "weighted",
          ...vd,
        },
      }) as unknown as StockTransferResult;
    const a = render(<EstimatedValuationBreakdown result={at({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" })} />);
    expect(a.container.textContent).toContain("순자산가치 단독 (§165④3)");
    a.unmount();
    const t = render(<EstimatedValuationBreakdown result={at({ netAssetOnlyReason: "no_business_or_short_or_closed" })} />);
    expect(t.container.textContent).not.toContain("순자산가치 단독");
  });
});
