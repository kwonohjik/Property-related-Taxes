/**
 * 대주주 판정 — 토글 폐지 + 판정 기준일 자동 제안 anchor.
 *
 * Plan: docs/00-pm/stock-major-shareholder-toggle-removal.plan.md §7 (T-1·T-2·T-6·T-7)
 *
 * 배경(실측):
 *   - 안전망 0건 — 토글 폐지 뮤테이션에 331파일 3130테스트가 전부 통과했다.
 *   - 닭-달걀: priorYearEndDate 입력이 innerContent 안에 있는데(MajorShareholderBlock:250)
 *     ToggleCard는 `{checked && children}`(ToggleCard:303)라 닫히면 렌더조차 안 됐다.
 *     자동 판정을 켜려면 기준일이 필요한데 그 입력에 닿으려면 대주주 여부를 먼저 알아야 했다.
 *
 * ⚠️ 진입점은 **Step1**이다 — 자동 제안 배선이 Step1의 양도일 onChange에 있으므로
 *    MajorShareholderBlock을 직접 렌더하면 그 층을 통째로 건너뛴다.
 */

// Step1 하위가 Dexie(IndexedDB)에 접근한다 — jsdom엔 IndexedDB가 없어 unhandled rejection이 난다.
// 저장소의 확립된 패턴대로 fake-indexeddb를 주입한다(__tests__/lib/storage/*).
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { MajorShareholderBlock } from "@/components/calc/stock-transfer/MajorShareholderBlock";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function block(patch: Partial<StockTransferFormData> = {}) {
  const form = { ...createInitialStockFormData(), marketType: "kospi", ...patch } as StockTransferFormData;
  render(<MajorShareholderBlock form={form} onChange={vi.fn()} />);
}

describe("T-1 — 닭-달걀 해소: 기준일 미입력이어도 입력 위젯이 렌더된다", () => {
  it("판정 기준일 입력이 접근 가능하다", () => {
    block({ priorYearEndDate: "" });
    expect(screen.getByText("직전 사업연도 종료일")).toBeTruthy();
  });

  it("비상장에서도 마찬가지다", () => {
    block({ marketType: "unlisted", priorYearEndDate: "" });
    expect(screen.getByText("직전 사업연도 종료일")).toBeTruthy();
  });
});

describe("T-2 — 항상 거짓인 안내 문구는 어떤 조건에서도 렌더되지 않는다", () => {
  it.each([
    ["kospi", ""],
    ["kospi", "2025-12-31"],
    ["unlisted", ""],
    ["konex", ""],
  ] as const)("%s · 기준일 '%s'", (marketType, priorYearEndDate) => {
    block({ marketType, priorYearEndDate });
    expect(screen.queryByText(/기타자산은 자동 판정 미적용/)).toBeNull();
  });
});

describe("T-6 — 기준일이 있으면 판정 배지가 자동 산출값을 표시한다", () => {
  it("코스피 지분 3% → 대주주 배지", () => {
    block({ priorYearEndDate: "2025-12-31", selfShareRatio: "3" });
    expect(screen.getByText(/✓ 대주주/)).toBeTruthy();
  });

  it("코스피 지분 0.1% → 비대주주 배지", () => {
    block({ priorYearEndDate: "2025-12-31", selfShareRatio: "0.1" });
    expect(screen.getByText(/✗ 비대주주/)).toBeTruthy();
  });
});

/**
 * T-7 — 양도일에서 판정 기준일을 자동 제안한다.
 *
 * 「조용한 fallback」과의 차이: 값이 **폼에 실제로 채워져** 화면에 보이고 사용자가 고칠 수 있다.
 * 종전 D-2는 API 변환에서 오늘 날짜를 몰래 넣어 화면에 나타나지 않았다.
 */
describe("T-7 — 양도일 입력 시 판정 기준일 자동 제안 (Step1 배선)", () => {
  /**
   * DateInput은 YYYY/MM/DD **3분할 입력**이다(`components/ui/date-input.tsx:171-201`).
   * 연도 칸만 채우면 날짜가 완성되지 않아 onChange가 완전한 값으로 불리지 않는다.
   * 또 form은 controlled이므로 patch를 실제로 반영하는 stateful 하네스가 필요하다 —
   * 그러지 않으면 이전 칸 입력이 되돌아가 날짜가 영영 완성되지 않는다.
   */
  function Harness({
    initial,
    onPatch,
  }: {
    initial: Partial<StockTransferFormData>;
    onPatch: (p: Partial<StockTransferFormData>) => void;
  }) {
    const [form, setForm] = React.useState<StockTransferFormData>({
      ...createInitialStockFormData(),
      marketType: "kospi",
      ...initial,
    } as StockTransferFormData);
    return (
      <Step1
        form={form}
        onChange={(patch) => {
          onPatch(patch);
          setForm((prev) => ({ ...prev, ...patch }));
        }}
      />
    );
  }

  function fillTransferDate(y: string, m: string, d: string) {
    const label = screen.getByText("양도일");
    const card = label.closest("[data-slot='field-card']") as HTMLElement;
    const scope = within(card);
    fireEvent.change(scope.getByLabelText("연도"), { target: { value: y } });
    fireEvent.change(scope.getByLabelText("월"), { target: { value: m } });
    fireEvent.change(scope.getByLabelText("일"), { target: { value: d } });
  }

  it("양도일 2026-05-31 입력 → priorYearEndDate 2025-12-31 이 같은 patch에 실린다", () => {
    const onPatch = vi.fn();
    render(<Harness initial={{ transferDate: "", priorYearEndDate: "" }} onPatch={onPatch} />);
    fillTransferDate("2026", "05", "31");

    const patches = onPatch.mock.calls.map((c) => c[0]);
    const withDate = patches.find((p) => p.transferDate === "2026-05-31");
    expect(withDate).toBeTruthy();
    expect(withDate.priorYearEndDate).toBe("2025-12-31");
  });

  it("사용자가 이미 입력한 기준일은 덮어쓰지 않는다", () => {
    const onPatch = vi.fn();
    render(<Harness initial={{ transferDate: "", priorYearEndDate: "2024-06-30" }} onPatch={onPatch} />);
    fillTransferDate("2026", "05", "31");

    const patches = onPatch.mock.calls.map((c) => c[0]);
    const withDate = patches.find((p) => p.transferDate === "2026-05-31");
    expect(withDate).toBeTruthy();
    expect(withDate.priorYearEndDate).toBeUndefined();
  });
});
