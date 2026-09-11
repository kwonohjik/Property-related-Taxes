/**
 * @vitest-environment jsdom
 *
 * G5 배치 «렌더» anchor — 인쇄 언마운트 · 공용 컴포넌트 전환 · testid 전달.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";
import { SourceDataSummarySection } from "@/components/calc/results/source-summary/SourceDataSummarySection";
import { SpecificCorpShareholderTable } from "@/components/calc/deemed-gift/SpecificCorpShareholderTable";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

// ════════════════════════════════════════════════
// IG-099 · IG-106 · IG-122 — 공용 카드가 data-testid를 DOM까지 내보낸다
// ════════════════════════════════════════════════
describe("공용 카드 data-testid 전달 — 19곳이 이 한 지점에 걸려 있다", () => {
  it("T-1 (양성): ToggleCard(card)가 루트에 testid를 붙인다", () => {
    render(
      <ToggleCard title="테스트" checked={false} onCheckedChange={() => {}} data-testid="tc-card" />,
    );
    expect(screen.getByTestId("tc-card")).toBeTruthy();
  });

  it("T-2 (양성): ToggleCard(chip)도 마찬가지다", () => {
    render(
      <ToggleCard
        variant="chip"
        title="테스트칩"
        checked
        onCheckedChange={() => {}}
        data-testid="tc-chip"
      />,
    );
    expect(screen.getByTestId("tc-chip")).toBeTruthy();
  });

  it("T-3 (양성): RadioCardGroup 그룹 루트에도 붙는다", () => {
    render(
      <RadioCardGroup
        name="t"
        value="a"
        onChange={() => {}}
        options={[{ value: "a", label: "A" }]}
        data-testid="rcg-root"
      />,
    );
    expect(screen.getByTestId("rcg-root")).toBeTruthy();
  });

  it("T-4 (음성·대조군): 안 넘기면 속성 자체가 없다 (빈 문자열 부착 금지)", () => {
    const { container } = render(
      <ToggleCard title="무testid" checked={false} onCheckedChange={() => {}} />,
    );
    expect(container.querySelector("[data-testid]")).toBeNull();
  });
});

// ════════════════════════════════════════════════
// IG-075 · IG-143 — 「처음으로」가 확인 Dialog를 거친다
// ════════════════════════════════════════════════
describe("IG-075 · IG-143 — 전체 폐기는 확인을 거친다", () => {
  it("T-5 (양성): 버튼을 눌러도 즉시 onReset되지 않고 확인 Dialog가 뜬다", () => {
    const onReset = vi.fn();
    render(<RestartFromScratchButton onReset={onReset} />);
    fireEvent.click(screen.getByText("처음부터 새로"));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByText("입력값을 모두 삭제할까요?")).toBeTruthy();
  });

  it("T-6: 확인을 눌러야 실제로 폐기된다", () => {
    const onReset = vi.fn();
    render(<RestartFromScratchButton onReset={onReset} />);
    fireEvent.click(screen.getByText("처음부터 새로"));
    fireEvent.click(screen.getByText("삭제하고 처음부터"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════
// IG-090 — 접혀 있어도 인쇄용으로 DOM에 남는다
// ════════════════════════════════════════════════
describe("IG-090 — 접힘이 언마운트가 아니다 (print-only-css-toggle)", () => {
  const heirs = [{ id: "h1", relation: "child", name: "자녀" } as unknown as Heir];

  it("T-7 (양성): 기본 접힘 상태에서도 본문이 DOM에 있고 `hidden print:block`을 단다", () => {
    const { container } = render(
      <SourceDataSummarySection
        deathDate="2024-01-01"
        heirs={heirs}
        priorGifts={[
          {
            giftDate: "2021-08-10",
            isHeir: true,
            beneficiaryType: "heir",
            doneeRelation: "lineal_descendant",
            propertyCategory: "cash",
            propertyName: "현금증여",
            giftAmount: 100_000_000,
            giftTaxPaid: 0,
          },
        ]}
      />,
    );
    // 접힌 상태 — 종전에는 이 표가 DOM에 아예 없어 인쇄물이 빈 껍데기였다
    expect(screen.getByTestId("prior-gift-summary-table")).toBeTruthy();
    expect(container.querySelector(".hidden.print\\:block")).toBeTruthy();
  });
});

// ════════════════════════════════════════════════
// IG-096 — native checkbox → ToggleCard
// ════════════════════════════════════════════════
describe("IG-096 — 증여자 본인 토글이 공용 ToggleCard다", () => {
  it("T-8: native checkbox가 아니라 role=switch이고, testid가 DOM에 있다", () => {
    render(
      <SpecificCorpShareholderTable
        rows={[{ id: "r0", name: "부", relation: "lineal_ascendant", shares: "20000", isDonor: false }]}
        onChange={() => {}}
      />,
    );
    const card = screen.getByTestId("sc-sh-is-donor-0");
    // 종전엔 이 testid가 «native input» 자체에 붙어 있었다. 지금은 ToggleCard 루트다.
    // (Switch 내부에 숨은 checkbox input이 있으므로 「input이 없다」로는 구별이 안 된다.)
    expect(card.getAttribute("data-slot")).toBe("toggle-card");
    expect(card.getAttribute("data-variant")).toBe("chip");
    expect(card.querySelector('[role="switch"]')).toBeTruthy();
  });
});
