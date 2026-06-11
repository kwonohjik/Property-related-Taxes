/**
 * @vitest-environment jsdom
 *
 * DebtItemTableView — 채무·공과·장례비 요약 테이블 배지 derive anchor
 *
 * Plan: docs/02-design/features/debt-item-table-view.plan.md §7 케이스 매트릭스 M-1~M-8.
 *
 * resolveDebtBadges 순수 함수 + 테이블 렌더 검증.
 *  M-1: 공과금+분배 합계 일치 → "배우자 (…) ✓" emerald
 *  M-2: 금융채무 §22 기본 true → 배지 없음 (노이즈 제거)
 *  M-3: 금융채무 §22 명시 false → "§22 제외" rose
 *  M-4: 장례비 봉안 → "봉안" emerald
 *  M-5: 분배 합계 불일치 → "… △" amber
 *  M-6: Table C(채권자 주소)만 입력 → "Table C" slate
 *  M-7: 다중 배지 (분배 + 봉안 + Table C)
 *  M-8: 빈 items → 테이블 미렌더
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  DebtItemTableView,
  resolveDebtBadges,
} from "@/components/calc/inheritance/DebtItemTableView";
import type { DebtItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIR_SPOUSE: Heir = { id: "h-spouse", relation: "spouse", name: "한배우자" };
const HEIR_CHILD: Heir = { id: "h-child", relation: "child", name: "김첫째" };
const HEIRS: Heir[] = [HEIR_SPOUSE, HEIR_CHILD];

function makeDebt(overrides: Partial<DebtItem> = {}): DebtItem {
  return {
    id: "debt_test_1",
    category: "tax",
    name: "",
    amount: 0,
    ...overrides,
  };
}

afterEach(cleanup);

describe("resolveDebtBadges — 케이스 매트릭스", () => {
  it("M-1 공과금 + 분배 합계 일치 → emerald ✓ 배지", () => {
    const item = makeDebt({
      category: "tax",
      name: "주택분 재산세",
      amount: 2_500_000,
      heirAllocations: [{ heirId: "h-spouse", amount: 2_500_000 }],
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const alloc = badges.find((b) => b.key === "allocation");
    expect(alloc).toBeDefined();
    expect(alloc!.label).toBe("배우자 (한배우자) ✓");
    expect(alloc!.tone).toBe("emerald");
  });

  it("M-2 금융채무 §22 기본 true → §22 배지 없음", () => {
    const item = makeDebt({
      category: "financial",
      amount: 400_000_000,
      // isFinancialDebtForDeduction 미설정 (기본 true)
    });
    const badges = resolveDebtBadges(item, HEIRS);
    expect(badges.find((b) => b.key === "section22")).toBeUndefined();
    expect(badges.length).toBe(0);
  });

  it("M-3 금융채무 §22 명시 false → §22 제외 rose 배지", () => {
    const item = makeDebt({
      category: "financial",
      amount: 400_000_000,
      isFinancialDebtForDeduction: false,
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const s22 = badges.find((b) => b.key === "section22");
    expect(s22).toBeDefined();
    expect(s22!.label).toBe("§22 제외");
    expect(s22!.tone).toBe("rose");
  });

  it("M-4 장례비 봉안 → 봉안 emerald 배지", () => {
    const item = makeDebt({
      category: "funeral",
      amount: 15_000_000,
      isBongan: true,
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const bongan = badges.find((b) => b.key === "bongan");
    expect(bongan).toBeDefined();
    expect(bongan!.tone).toBe("emerald");
  });

  it("M-5 분배 합계 불일치 → amber △ 배지", () => {
    const item = makeDebt({
      category: "personal",
      amount: 100,
      heirAllocations: [{ heirId: "h-spouse", amount: 70 }],
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const alloc = badges.find((b) => b.key === "allocation");
    expect(alloc).toBeDefined();
    expect(alloc!.label).toBe("배우자 (한배우자) △");
    expect(alloc!.tone).toBe("amber");
  });

  it("M-5b 분배 다중 → 첫 분배자 + 외 N명 요약", () => {
    const item = makeDebt({
      category: "financial",
      amount: 745_000_000,
      heirAllocations: [
        { heirId: "h-spouse", amount: 500_000_000 },
        { heirId: "h-child", amount: 245_000_000 },
      ],
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const alloc = badges.find((b) => b.key === "allocation");
    expect(alloc!.label).toBe("배우자 (한배우자) 외 1명 ✓");
    expect(alloc!.tone).toBe("emerald");
  });

  it("M-6 Table C 채권자 주소만 입력 → Table C slate 배지", () => {
    const item = makeDebt({
      category: "tax",
      amount: 2_500_000,
      creditorAddress: "시청",
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const tc = badges.find((b) => b.key === "tableC");
    expect(tc).toBeDefined();
    expect(tc!.tone).toBe("slate");
  });

  it("M-7 다중 배지 — 분배 + 봉안 + Table C", () => {
    const item = makeDebt({
      category: "funeral",
      name: "봉안시설 사용료",
      amount: 5_000_000,
      isBongan: true,
      creditorAddress: "추모공원",
      heirAllocations: [{ heirId: "h-child", amount: 5_000_000 }],
    });
    const badges = resolveDebtBadges(item, HEIRS);
    const keys = badges.map((b) => b.key).sort();
    expect(keys).toEqual(["allocation", "bongan", "tableC"]);
  });

  it("분배 없음 → allocation 배지 없음", () => {
    const item = makeDebt({ category: "tax", amount: 1_000_000 });
    const badges = resolveDebtBadges(item, HEIRS);
    expect(badges.find((b) => b.key === "allocation")).toBeUndefined();
  });
});

describe("DebtItemTableView — 렌더", () => {
  it("M-8 빈 items → 테이블 미렌더 (null)", () => {
    const { container } = render(
      <DebtItemTableView
        items={[]}
        selectedItemId={null}
        onSelect={() => {}}
        heirs={HEIRS}
      />,
    );
    expect(container.querySelector("table")).toBeNull();
  });

  it("항목 있으면 행 렌더 — 이름 빈값은 분류 라벨 fallback + 동적 testid", () => {
    const items: DebtItem[] = [
      makeDebt({ id: "debt_a", category: "tax", name: "주택분 재산세", amount: 2_500_000 }),
      makeDebt({ id: "debt_b", category: "financial", name: "", amount: 400_000_000 }),
    ];
    render(
      <DebtItemTableView
        items={items}
        selectedItemId={null}
        onSelect={() => {}}
        heirs={HEIRS}
      />,
    );
    // 이름 표시
    expect(screen.getByText("주택분 재산세")).toBeTruthy();
    // 빈 이름 → 분류 라벨 fallback (행 셀 + 칩 = 2회)
    expect(screen.getAllByText("금융채무").length).toBeGreaterThanOrEqual(1);
    // 동적 testid 행
    expect(screen.getByTestId("debt-table-row-debt_a")).toBeTruthy();
    expect(screen.getByTestId("debt-table-row-debt_b")).toBeTruthy();
    // 금액 우정렬 표시
    expect(screen.getByText("2,500,000")).toBeTruthy();
  });
});
