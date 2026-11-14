/**
 * @vitest-environment jsdom
 *
 * ⑤ UI anchor (G-7) — 조합원입주권은 장기임대 그룹에서 **§97의3만** 고를 수 있다(조문 단위 예외 · 서면-2023-법규재산-2731).
 * 카드 안에는 2731 사실관계 안내와 안분 D(관리처분계획 인가일 기준시가 · Q-6 a) 라벨이 보인다.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §6 PR-3 · Q-5 a · Q-6 a.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const HOUSING_ONLY = /주택 양도에만 적용되는 감면입니다 \(현재 자산: /g;

function renderPanel(assetKind: string) {
  const a = { ...makeDefaultAsset(1), assetKind, acquisitionDate: "2013-06-30" } as unknown as AssetForm;
  const { container } = render(<UnifiedReductionPanel asset={a} transferDate="2024-06-01" onChange={() => {}} />);
  fireEvent.click(screen.getByText("장기임대주택").closest("button")!);
  const text = container.textContent ?? "";
  if (!text.includes("§97의3")) throw new Error("장기임대 그룹이 펼쳐지지 않았다 — 셀렉터 확인");
  return text;
}

describe("G-7 ⑤ 장기임대 그룹 — 조합원입주권", () => {
  it("입주권: 그룹이 열리고 활성 1(§97의3) — 나머지 조문은 「주택 양도에만」 사유로 막힌다", () => {
    const text = renderPanel("right_to_move_in");
    expect(text).toMatch(/활성 1\s*\/\s*전체 6/);
    expect((text.match(HOUSING_ONLY) ?? []).length).toBe(5);
  });

  it("입주권에서 §97의3을 고른 카드 — 패널이 입주권임을 카드에 넘긴다(안내·D 라벨)", () => {
    const a = {
      ...makeDefaultAsset(1), assetKind: "right_to_move_in", acquisitionDate: "2013-06-30",
      reductions: [{ ...getReductionDefault("rental_97_3"), rentalContinuesToTransfer: false }],
    } as unknown as AssetForm;
    // 선택된 조문이 있는 그룹은 처음부터 펼쳐져 있다(클릭하면 접힌다)
    render(<UnifiedReductionPanel asset={a} transferDate="2024-06-01" onChange={() => {}} />);
    expect(screen.getByTestId("r973-right-to-move-in-notice")).toBeTruthy();
    expect(screen.getByTestId("reduction-rental_97_3-std-price-d-hint")).toBeTruthy();
  });

  it("분양권: 지금처럼 그룹 전체가 막힌다 (구별력)", () => {
    const text = renderPanel("presale_right");
    expect(text).toMatch(/활성 0\s*\/\s*전체 6/);
    expect((text.match(HOUSING_ONLY) ?? []).length).toBe(6);
  });
});

describe("G-7 ⑤ §97의3 카드 — 입주권 안내·D 라벨", () => {
  const value = { ...getReductionDefault("rental_97_3"), rentalContinuesToTransfer: false } as never;

  it("입주권이면 2731 안내 + D 칸 라벨 「관리처분계획 인가일 당시 기준시가」 + 확인 필요 안내", () => {
    render(<Rental973InputForm value={value} onChange={vi.fn()} transferDate="2024-06-01" isRightToMoveIn />);
    expect(screen.getByTestId("r973-right-to-move-in-notice").textContent).toContain("서면-2023-법규재산-2731");
    expect(screen.getAllByText(/관리처분계획 인가일 당시 기준시가 \(주택\+부속토지 합계\)/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("reduction-rental_97_3-std-price-d-hint").textContent).toContain("확인 필요");
    expect(screen.queryAllByText("양도 당시 기준시가 (주택+부속토지 합계)").length).toBe(0);
  });

  it("주택이면 안내 없음 · 라벨 「양도 당시 기준시가」 그대로", () => {
    render(<Rental973InputForm value={value} onChange={vi.fn()} transferDate="2024-06-01" />);
    expect(screen.queryByTestId("r973-right-to-move-in-notice")).toBeNull();
    expect(screen.queryByTestId("reduction-rental_97_3-std-price-d-hint")).toBeNull();
    expect(screen.getAllByText("양도 당시 기준시가 (주택+부속토지 합계)").length).toBeGreaterThan(0);
  });
});
