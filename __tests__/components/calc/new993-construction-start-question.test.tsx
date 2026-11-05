/**
 * §99의3 — 「2003.1.1. 전 공사 착수 여부」 질문 (법률 제6762호 부칙 §29②, 리뷰 NH-01 · Q-4).
 * 2호(자기건설)이고 사용승인일이 2003.1.1.~2003.6.30.일 때만 보인다. 선택은 onUpdate로 값만 올린다(미러링 없음).
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type New993 = Extract<AssetReductionForm, { type: "new_99_3" }>;
const makeValue = (over: Partial<New993> = {}): New993 => ({ ...(getReductionDefault("new_99_3") as New993), ...over });

const renderForm = (value: New993, onUpdate = vi.fn()) =>
  render(<New993InputForm value={value} onUpdate={onUpdate} onUpdateMany={vi.fn()} />);

describe("착공 여부 질문 노출 범위", () => {
  it.each(["2003-01-01", "2003-03-10", "2003-06-30"])("2호 · 사용승인 %s → 보인다", (d) => {
    renderForm(makeValue({ acquisitionType993: "self_built", usageApprovalDate993: d }));
    expect(screen.getByTestId("new993-construction-start")).toBeTruthy();
    expect(screen.getByTestId("new993-construction-start-yes")).toBeTruthy();
    expect(screen.getByTestId("new993-construction-start-no")).toBeTruthy();
    expect(screen.getByTestId("new993-construction-start-unknown")).toBeTruthy();
  });

  it.each(["", "2002-12-31", "2003-07-01"])("2호 · 사용승인 '%s' → 보이지 않는다", (d) => {
    renderForm(makeValue({ acquisitionType993: "self_built", usageApprovalDate993: d }));
    expect(screen.queryByTestId("new993-construction-start")).toBeNull();
  });

  it("1호는 사용승인일이 2003년 안이어도 묻지 않는다", () => {
    renderForm(makeValue({ acquisitionType993: "from_builder", usageApprovalDate993: "2003-03-10" }));
    expect(screen.queryByTestId("new993-construction-start")).toBeNull();
  });
});

describe("선택 반영", () => {
  it("모름을 고르면 unknown 값을 올린다 (미응답 \"\"은 어느 칸도 선택되지 않는다)", () => {
    const onUpdate = vi.fn();
    renderForm(makeValue({ acquisitionType993: "self_built", usageApprovalDate993: "2003-03-10" }), onUpdate);
    expect((screen.getByTestId("new993-construction-start-unknown") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("new993-construction-start-unknown"));
    expect(onUpdate).toHaveBeenCalledWith("constructionStartedBefore2003_993", "unknown");
  });

  it("저장된 응답 yes가 선택 상태로 복원된다", () => {
    renderForm(
      makeValue({
        acquisitionType993: "self_built",
        usageApprovalDate993: "2003-03-10",
        constructionStartedBefore2003_993: "yes",
      }),
    );
    expect((screen.getByTestId("new993-construction-start-yes") as HTMLInputElement).checked).toBe(true);
  });
});

describe("지역 라벨 — 2003.1.1. 이후 계약·승인분만 배제", () => {
  it("선택값 표시가 시기 한정을 말한다", () => {
    renderForm(makeValue({ region993: "speculation" }));
    expect(screen.getByText(/2003\.1\.1\. 이후 계약·승인분만 적용 배제/)).toBeTruthy();
  });
});
