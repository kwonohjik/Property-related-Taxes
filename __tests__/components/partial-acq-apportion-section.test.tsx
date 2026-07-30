/**
 * B4-2b — 일부양도 취득가액 안분 계산기
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-1~C-7 · §4
 *
 * 법령 제약이 UI에 반영됐는지 고정한다:
 *   C-2 구분되면 그 값 우선 → "구분되는가"를 먼저 묻는다
 *   C-3 안분 기준은 **취득 당시** 기준시가 또는 감정가액
 *   C-4 **양도 당시** 가액 기준 안분은 제공하지 않는다
 *   자동 반영 금지 → 「적용」 버튼을 눌러야 취득가액에 기록된다
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PartialAcqApportionSection } from "@/components/calc/transfer/PartialAcqApportionSection";
import { calcPartialAcqPrice } from "@/lib/stores/calc-wizard-asset-partial-area";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function renderSection(over: Partial<AssetForm> = {}) {
  const onChange = vi.fn();
  const onApply = vi.fn();
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    areaScenario: "partial",
    acquisitionArea: "300",
    transferArea: "100",
    ...over,
  } as AssetForm;
  render(
    <PartialAcqApportionSection asset={asset} onChange={onChange} onApply={onApply} />,
  );
  return { onChange, onApply };
}

// ══════════════════════════════════════════════════════════
describe("산식 — calcPartialAcqPrice", () => {
  it("전체 × 양도분 ÷ (양도분 + 잔여분), floor 절사", () => {
    // 3억 × 5천만 / (5천만 + 1억) = 100,000,000
    expect(calcPartialAcqPrice(300_000_000, 50_000_000, 100_000_000)).toBe(100_000_000);
  });

  it("부분별 가치가 같으면 면적비 안분과 일치한다 (국심1992서2655 사안)", () => {
    // 양도 100㎡ · 잔여 200㎡, 단가 동일 → 기준시가비 = 면적비 = 1/3
    const unit = 500_000;
    const byStd = calcPartialAcqPrice(300_000_000, 100 * unit, 200 * unit);
    const byArea = Math.floor((300_000_000 * 100) / 300);
    expect(byStd).toBe(byArea);
    expect(byStd).toBe(100_000_000);
  });

  it("부분별 가치가 다르면 면적비와 갈린다 — 이 계산기를 쓰는 이유", () => {
    // 양도분이 더 비싼 용도지역
    const byStd = calcPartialAcqPrice(300_000_000, 100 * 800_000, 200 * 300_000)!;
    const byArea = Math.floor((300_000_000 * 100) / 300);
    expect(byStd).not.toBe(byArea);
    expect(byStd).toBeGreaterThan(byArea); // 비싼 부분을 양도 → 취득가액도 더 배분
  });

  it("금액은 floor 절사 (Math.round 금지)", () => {
    // 1억 × 1 / 3 = 33,333,333.33… → 33,333,333
    expect(calcPartialAcqPrice(100_000_000, 1, 2)).toBe(33_333_333);
  });

  it("세 값 중 하나라도 양수가 아니면 null (계산 불가)", () => {
    expect(calcPartialAcqPrice(0, 1, 1)).toBeNull();
    expect(calcPartialAcqPrice(1, 0, 1)).toBeNull();
    expect(calcPartialAcqPrice(1, 1, 0)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════
describe("UI 흐름 — C-2 구분 여부를 먼저 묻는다", () => {
  it("미선택 상태에서는 안분 입력이 노출되지 않는다", () => {
    renderSection();
    expect(screen.getByText("양도분 취득가액이 구분되는가")).toBeInTheDocument();
    expect(screen.queryByTestId("partial-total-acq-price")).not.toBeInTheDocument();
  });

  it("「구분됨」 선택 시 — 안분 입력 대신 직접 입력 안내", () => {
    renderSection({ partialAcqDistinct: "yes" });
    expect(screen.getByTestId("partial-acq-distinct-note")).toBeInTheDocument();
    expect(screen.queryByTestId("partial-total-acq-price")).not.toBeInTheDocument();
  });

  it("「불분명」 선택 시 — 안분 기준을 묻는다 (기준 미선택이면 금액 입력 미노출)", () => {
    renderSection({ partialAcqDistinct: "no" });
    expect(screen.getByText("안분 기준")).toBeInTheDocument();
    expect(screen.queryByTestId("partial-total-acq-price")).not.toBeInTheDocument();
  });

  it("C-3 — 안분 기준은 취득 당시 기준시가·감정가액 2종", () => {
    renderSection({ partialAcqDistinct: "no" });
    expect(screen.getByText("취득 당시 기준시가")).toBeInTheDocument();
    expect(screen.getByText("취득 당시 감정가액")).toBeInTheDocument();
  });

  it("🔴 C-4 — 「양도 당시」 가액 기준 안분은 제공하지 않는다", () => {
    renderSection({ partialAcqDistinct: "no" });
    // 조심 2018부0572가 배척한 기준이 옵션으로 있으면 안 된다
    expect(screen.queryByText(/양도 당시 감정가액/)).not.toBeInTheDocument();
    expect(screen.queryByText(/양도 당시 실거래가/)).not.toBeInTheDocument();
    // 안내 문구로는 금지 사실을 알린다
    expect(screen.getByText(/양도 당시 가액.*인정되지 않는다/)).toBeInTheDocument();
  });

  it("기준 선택 후 금액 3칸이 노출되고 라벨이 기준에 따라 바뀐다", () => {
    renderSection({ partialAcqDistinct: "no", partialApportionBasis: "appraisal" });
    expect(screen.getByTestId("partial-total-acq-price")).toBeInTheDocument();
    expect(screen.getByText("양도분 감정가액 (원)")).toBeInTheDocument();
    expect(screen.getByText("잔여분 감정가액 (원)")).toBeInTheDocument();
  });

  it("기준시가 선택 시 라벨은 「기준시가」", () => {
    renderSection({ partialAcqDistinct: "no", partialApportionBasis: "std_price" });
    expect(screen.getByText("양도분 기준시가 (원)")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════
describe("적용 — 자동 반영 금지 (useEffect 미러링 금지)", () => {
  const filled = {
    partialAcqDistinct: "no" as const,
    partialApportionBasis: "std_price" as const,
    partialTotalAcqPrice: "300,000,000",
    partialSoldValue: "50,000,000",
    partialRemainValue: "100,000,000",
  };

  it("계산 결과가 표시된다", () => {
    renderSection(filled);
    const box = screen.getByTestId("partial-acq-result");
    expect(box).toBeInTheDocument();
    expect(box.textContent).toContain("100,000,000");
  });

  it("「적용」을 눌러야 onApply가 호출된다 — 렌더만으로는 호출되지 않는다", () => {
    const { onApply } = renderSection(filled);
    expect(onApply).not.toHaveBeenCalled(); // 자동 반영 금지
    fireEvent.click(screen.getByTestId("partial-acq-apply"));
    expect(onApply).toHaveBeenCalledWith("100000000");
  });

  it("금액이 불완전하면 「적용」이 비활성된다", () => {
    renderSection({ ...filled, partialRemainValue: "" });
    expect(screen.getByTestId("partial-acq-apply")).toBeDisabled();
    expect(screen.queryByTestId("partial-acq-result")).not.toBeInTheDocument();
  });

  it("「구분됨」으로 되돌리면 안분 입력을 비운다 (stale 값으로 오적용 방지)", () => {
    const { onChange } = renderSection(filled);
    fireEvent.click(screen.getByText("구분됨"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        partialAcqDistinct: "yes",
        partialApportionBasis: "",
        partialTotalAcqPrice: "",
        partialSoldValue: "",
        partialRemainValue: "",
      }),
    );
  });
});
