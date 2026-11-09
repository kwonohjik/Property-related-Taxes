/**
 * @vitest-environment jsdom
 *
 * 컴패니언 조합원입주권 §89①4호 열기 PR-3 — 보유 상황 단계(Step4)가 첫 자산이 토지·건물이어도 함께 양도 입주권이 있으면
 * ① 세대·주택 현황과 «분양권·조합원입주권 없음» 확인을 연다. ④·⑧ 쪽은 `companion-right-4ho-open-pr3.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function form(kinds: string[]): TransferFormData {
  const base = createDefaultTransferFormData();
  const proto = base.assets[0];
  return {
    ...base,
    transferDate: "2026-06-01",
    assets: kinds.map((assetKind, i) => ({ ...proto, assetId: `a${i + 1}`, assetKind: assetKind as never, acquisitionDate: "2015-01-10" })),
  };
}

const SECTION = "① 세대·주택 현황";
const NO_OTHER = "다른 보유 주택이 없습니다";
const NO_PRESALE = "보유한 분양권·조합원입주권이 없습니다";
const COUNT = "household-right-count-derived";

describe("컴패니언 입주권 PR-3 ⑤ — 세대·주택 현황 칸의 표시 조건", () => {
  it("🔑 첫 자산 토지 + 함께 양도 입주권 → ① 칸 · 두 확인 토글 · 입주권 기준 고지 (종전: 칸 전체 숨김)", () => {
    render(<Step4 form={form(["land", "right_to_move_in"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(1);
    expect(screen.queryAllByText(NO_OTHER)).toHaveLength(1);
    expect(screen.queryAllByText(NO_PRESALE)).toHaveLength(1);
    expect(screen.getByTestId("household-facts-companion-notice").textContent).toContain("조합원입주권");
  });

  it("🔑 세대 보유 입주권 수 안내가 뜬다 — 이번에 양도하는 입주권 1개", () => {
    render(<Step4 form={form(["land", "right_to_move_in"])} onChange={() => {}} />);
    expect(screen.getByTestId(COUNT).textContent).toContain("1개");
    expect(screen.getByTestId(COUNT).textContent).toContain("양도하는 입주권 1개");
  });

  it("🔑 입주권 두 개를 함께 양도하면 안내가 2개 — 종전 문구(«양도하는 입주권 1개 + …»)와 어긋나지 않는다", () => {
    render(<Step4 form={form(["right_to_move_in", "right_to_move_in"])} onChange={() => {}} />);
    expect(screen.getByTestId(COUNT).textContent).toContain("2개");
    expect(screen.getByTestId(COUNT).textContent).toContain("양도하는 입주권 2개");
  });

  it("🔑 «분양권·입주권» 카드는 한 벌이다 — 입주권 수 안내 블록 안쪽 목록이 ④ 명부와 중복 렌더되지 않는다 (브라우저 확인에서 발견: 토지 + 입주권에서 ① 안에 토글 없는 카드가 하나 더 떴다)", () => {
    for (const kinds of [["land", "right_to_move_in"], ["right_to_move_in"], ["right_to_move_in", "right_to_move_in"], ["land", "housing", "right_to_move_in"]]) {
      render(<Step4 form={form(kinds)} onChange={() => {}} />);
      expect(screen.queryAllByText("분양권·입주권"), kinds.join("+")).toHaveLength(1);
      expect(screen.queryAllByText(NO_PRESALE), kinds.join("+")).toHaveLength(1);
      cleanup();
    }
  });

  it("짝 — 토지 + 주택(입주권 없음)은 종전과 같다 — 입주권 수 안내 없음 · 고지는 «주택»", () => {
    render(<Step4 form={form(["land", "housing"])} onChange={() => {}} />);
    expect(screen.queryByTestId(COUNT)).toBeNull();
    expect(screen.getByTestId("household-facts-companion-notice").textContent).not.toContain("조합원입주권");
  });

  it("짝 — 토지 + 분양권은 칸 숨김 유지", () => {
    render(<Step4 form={form(["land", "presale_right"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(0);
  });

  it("짝 — 입주권 단건은 종전과 같다(고지 없음 · 안내 1개)", () => {
    render(<Step4 form={form(["right_to_move_in"])} onChange={() => {}} />);
    expect(screen.queryByTestId("household-facts-companion-notice")).toBeNull();
    expect(screen.getByTestId(COUNT).textContent).toContain("1개");
  });
});
