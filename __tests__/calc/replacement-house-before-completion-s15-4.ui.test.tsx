/**
 * S15-4 UI — 대체주택 특례 블록의 「신축주택 완성 시점」 갈래: 완성 전 양도를 고르면 준공일 칸이 사라지고(요구하지 않는다),
 * 완성 후 양도는 종전과 같이 준공일 필수 칸을 그린다. 임포트 요약 카드도 갈래를 적는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ReplacementHouseSpecialBlock } from "@/app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock";
import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const form = (over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    replacementHouseSpecial: true, transferDate: "2019-12-23", replBusinessApprovalDate: "2011-09-07", ...over,
  });

describe("S15-4 ReplacementHouseSpecialBlock", () => {
  it("기본(완성 후 양도) — 준공일 필수 칸이 있다", () => {
    render(<ReplacementHouseSpecialBlock form={form()} onChange={() => {}} />);
    expect(screen.getByTestId("repl-completion-date")).toBeTruthy();
    expect(screen.getByLabelText(/신축주택이 완성된 뒤 양도했다/)).toHaveProperty("checked", true);
  });
  it("완성 전 양도 — 준공일 칸을 그리지 않는다", () => {
    render(<ReplacementHouseSpecialBlock form={form({ replSoldBeforeCompletion: true })} onChange={() => {}} />);
    expect(screen.queryByTestId("repl-completion-date")).toBeNull();
    expect(screen.getByLabelText(/신축주택이 완성되기 전에 양도했다/)).toHaveProperty("checked", true);
  });
  it("완성 전 갈래를 고르면 replSoldBeforeCompletion=true로 알린다 · 되돌리면 false", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ReplacementHouseSpecialBlock form={form()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/신축주택이 완성되기 전에 양도했다/));
    expect(onChange).toHaveBeenLastCalledWith({ replSoldBeforeCompletion: true });
    rerender(<ReplacementHouseSpecialBlock form={form({ replSoldBeforeCompletion: true })} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/신축주택이 완성된 뒤 양도했다/));
    expect(onChange).toHaveBeenLastCalledWith({ replSoldBeforeCompletion: false });
  });
  it("특례를 끄면 갈래 선언도 지운다(숨은 값이 남지 않게)", () => {
    const onChange = vi.fn();
    render(<ReplacementHouseSpecialBlock form={form({ replSoldBeforeCompletion: true })} onChange={onChange} />);
    fireEvent.click(screen.getByText(/대체주택 비과세 특례 해당/));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ replacementHouseSpecial: false, replSoldBeforeCompletion: false }));
  });
});

describe("S15-4 ImportedOneHouseFactsCard", () => {
  const card = (f: Record<string, unknown>) => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={{ replacementHouseSpecial: true, replBusinessApprovalDate: "2011-09-07", replResidenceMonths: "97", replWillResideNewHouse: true, ...f } as never}
        replacementHouseApplies
      />,
    );
    return screen.getByTestId("imported-one-house-facts").textContent ?? "";
  };
  it("완성 전 양도 갈래면 「완성 전 양도」를 적고 준공일 행은 없다", () => {
    const t = card({ replSoldBeforeCompletion: true });
    expect(t).toContain("완성 전 양도");
    expect(t).not.toContain("신축주택 준공일");
  });
  it("완성 후 갈래(옛 record 포함)는 준공일 행을 적는다", () => {
    const t = card({ replCompletionDate: "2018-01-01" });
    expect(t).toContain("신축주택 준공일");
    expect(t).toContain("2018-01-01");
  });
});
