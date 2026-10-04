/**
 * @vitest-environment jsdom
 *
 * Z-1 ⑤⑦ — 의제취득일 전 매수 카드 (영 §176의2④)
 *
 *   PD-1  Step 2에 카드가 «실제로 렌더»된다(소비 지점) — 의제 대상 매수일 때만
 *   PD-2  실가 모드: 안내 문구 · 실가 전용 입력칸 없음 · 배율칸은 1965.01 이전일 때만
 *   PD-3  환산·매매사례 모드: 취득 당시 실가 칸(선택) — 입력은 onChange로 · 배율칸은 실가를 입력했을 때만
 *   PD-4  결과 카드 — ②·① 금액 · 채택 표시 · 필요경비 방식 · 「원」 미표기
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PreDeemedAcquisitionCard } from "@/components/calc/stock-transfer/PreDeemedAcquisitionCard";
import { PreDeemedAcquisitionResultCard } from "@/components/calc/results/PreDeemedAcquisitionResultCard";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "unlisted",
    acquisitionCause: "purchase",
    acquisitionDate: "1975-06-01",
    transferDate: "2025-12-01",
    shareCount: "1000",
    ...o,
  } as StockTransferFormData;
}
const card = () => screen.queryByTestId("pre-deemed-acquisition-card");

describe("PD-1: 표시 조건 — 엔진·④·⑧·⑫와 같은 leaf", () => {
  it("의제 대상 매수 → 표시", () => {
    render(<PreDeemedAcquisitionCard form={formOf()} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
    expect(card()!.textContent).toContain("영 §176의2④");
  });
  it("의제일 이후(1986-01-01) · 증여 · 국외주식 → 숨김", () => {
    for (const o of [{ acquisitionDate: "1986-01-01" }, { acquisitionCause: "gift" as const }, { marketType: "foreign_stock" as const }]) {
      const { unmount } = render(<PreDeemedAcquisitionCard form={formOf(o)} onChange={vi.fn()} />);
      expect(card()).toBeNull();
      unmount();
    }
  });
  it("기타자산은 의제일이 1985.1.1. — 1985-06 취득이면 숨김 · 1984-06이면 표시", () => {
    const other = { marketType: "other_asset" as const, isHeavyRealEstateForRate: true };
    const { unmount } = render(<PreDeemedAcquisitionCard form={formOf({ ...other, acquisitionDate: "1985-06-01" })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
    unmount();
    render(<PreDeemedAcquisitionCard form={formOf({ ...other, acquisitionDate: "1984-06-01" })} onChange={vi.fn()} />);
    expect(card()!.textContent).toContain("1985.1.1.");
  });
  it("Step 2가 이 카드를 실제로 렌더한다 (소비 지점)", () => {
    render(<Step2 form={formOf({ acquisitionMode: "actual" })} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
    cleanup();
    render(<Step2 form={formOf({ acquisitionDate: "2010-06-01" })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
  });
});

describe("PD-2: 실가 모드", () => {
  it("안내만 있고 별도 실가 칸은 없다 · 1975 취득이면 배율칸 없음", () => {
    render(<PreDeemedAcquisitionCard form={formOf({ acquisitionMode: "actual" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-actual-note")).toBeTruthy();
    expect(card()!.textContent).not.toContain("취득 당시 실지거래가액 (1주당, 선택)");
    expect(screen.queryByTestId("pre-deemed-ppi-ratio")).toBeNull();
  });
  it("1964-12 취득 → 배율 입력칸이 나타나 입력이 onChange로 전달된다", () => {
    const onChange = vi.fn();
    render(<PreDeemedAcquisitionCard form={formOf({ acquisitionMode: "actual", acquisitionDate: "1964-12-01" })} onChange={onChange} />);
    const input = screen.getByTestId("pre-deemed-ppi-ratio");
    fireEvent.change(input, { target: { value: "3.5" } });
    expect(onChange).toHaveBeenCalledWith({ preDeemedPpiRatio: "3.5" });
  });
});

describe("PD-3: 환산·매매사례 모드", () => {
  it("취득 당시 실가 칸이 보인다 — 입력은 preDeemedActualPricePerShare로", () => {
    const onChange = vi.fn();
    render(<PreDeemedAcquisitionCard form={formOf({ acquisitionMode: "estimated" })} onChange={onChange} />);
    expect(card()!.textContent).toContain("취득 당시 실지거래가액 (1주당, 선택)");
    expect(screen.queryByTestId("pre-deemed-actual-note")).toBeNull();
    const input = card()!.querySelector("input")!;
    fireEvent.change(input, { target: { value: "10000" } });
    expect(onChange).toHaveBeenCalledWith({ preDeemedActualPricePerShare: "10000" });
  });
  it("1964 취득: 실가를 비우면 배율칸 없음 · 입력하면 나타난다 (⑧⑫와 같은 조건)", () => {
    const base = { acquisitionMode: "sale_case" as const, acquisitionDate: "1964-12-01" };
    const { unmount } = render(<PreDeemedAcquisitionCard form={formOf(base)} onChange={vi.fn()} />);
    expect(screen.queryByTestId("pre-deemed-ppi-ratio")).toBeNull();
    unmount();
    render(<PreDeemedAcquisitionCard form={formOf({ ...base, preDeemedActualPricePerShare: "10000" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-ppi-ratio")).toBeTruthy();
  });
});

describe("PD-4: 결과 카드", () => {
  const detail = {
    deemedDate: "1986-01-01",
    actualBase: 10_000_000,
    acquisitionMonth: "1975-06",
    deemedPrevMonth: "1985-12",
    ppiAtAcquisition: 17.61,
    ppiAtDeemedPrev: 50.57,
    ratioSource: "table" as const,
    ratio: 50.57 / 17.61,
    clause2Amount: 28_716_638,
    selected: "clause2" as const,
    expenseBasis: "actual" as const,
  };
  it("② 채택 — 금액·지수·필요경비 안내 · ①은 미입력 안내", () => {
    render(<PreDeemedAcquisitionResultCard detail={detail} />);
    const t = screen.getByTestId("pre-deemed-result-card").textContent ?? "";
    expect(t).toContain("28,716,638");
    expect(t).toContain("← 채택");
    expect(t).toContain("1985-12 지수 50.57");
    expect(t).toContain("1975-06 지수 17.61");
    expect(t).toContain("실제 지출액");
    expect(t).toContain("미입력");
    expect(t).not.toContain("÷");
    expect(t).not.toMatch(/\d원/); // 「원」 미표기 (feedback_no_won_suffix)
  });
  it("① 채택 — 환산 금액과 개산공제 안내", () => {
    render(
      <PreDeemedAcquisitionResultCard
        detail={{ ...detail, clause1Amount: 40_000_000, clause1Method: "estimated", selected: "clause1", expenseBasis: "estimated" }}
      />,
    );
    const t = screen.getByTestId("pre-deemed-result-card").textContent ?? "";
    expect(t).toContain("40,000,000");
    expect(t).toContain("개산공제");
  });
});
