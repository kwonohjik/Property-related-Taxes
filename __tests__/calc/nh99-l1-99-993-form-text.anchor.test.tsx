/**
 * anchor — §99·§99의3 입력 폼 문구·노출 (리뷰 NH-35·NH-42·NH-44·NH-45·NH-57)
 *
 * - NH-57: 재계약·대체취득 배제 토글은 주택건설사업자로부터 취득한 갈래에만 보인다
 *   (조특령 §99②는 법 §99①2호 단서, 조특령 §99의3④는 법 §99의3①1호의 사유).
 * - NH-42·NH-45: 조특칙 §44의4 카브백 사유(소득세법 시행규칙 §71③)는 「다른 시·군으로 주거를 이전하는 경우」다
 *   (1998.8.11.·2002.1.1.·현행 시행본 모두 같은 요건 — KoreanLaw 실독 2026-11-05).
 * - NH-35: §99의3①1호 단서는 「매매계약일 현재 입주한 사실이 있거나」 — 「다른 자가」는 법률 제6538호(2002.1.1. 시행)로 삭제됐다.
 *   §99①2호 단서는 「다른 자가」가 남아 있다(유지).
 * - NH-44: §99의3 폼의 시행령 링크는 조특령 §99의3이다.
 */
import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { New99InputForm } from "@/components/calc/transfer/New99InputForm";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const RECONTRACT_99 = "1998.5.21 이전 분양계약 해제 후 재계약·대체취득";
const RECONTRACT_993 = "2001.5.23 전 분양계약 해제 후 재계약·대체취득";

const text99 = (o: Record<string, unknown>) => {
  render(<New99InputForm value={{ ...getReductionDefault("new_99"), ...o } as never} onChange={vi.fn()} />);
  return document.body.textContent ?? "";
};
const text993 = (o: Record<string, unknown>) => {
  render(
    <New993InputForm value={{ ...getReductionDefault("new_99_3"), ...o } as never} onUpdate={vi.fn()} onUpdateMany={vi.fn()} />,
  );
  return document.body.textContent ?? "";
};

describe("NH-57 재계약·대체취득 토글 노출", () => {
  it("§99 2호(주택건설사업자 취득)에는 보인다", () => {
    expect(text99({ acquisitionType99: "from_builder" })).toContain(RECONTRACT_99);
  });
  it("🔴 §99 1호(자기건설)에는 보이지 않는다", () => {
    expect(text99({ acquisitionType99: "self_built" })).not.toContain(RECONTRACT_99);
  });
  it("§99의3 1호에는 보인다", () => {
    expect(text993({ acquisitionType993: "from_builder" })).toContain(RECONTRACT_993);
  });
  it("🔴 §99의3 2호(자기건설)에는 보이지 않는다", () => {
    expect(text993({ acquisitionType993: "self_built" })).not.toContain(RECONTRACT_993);
  });
});

describe("NH-42·NH-45 카브백 사유 — 다른 시·군 주거 이전 요건", () => {
  it("🔴 §99 카브백 칩", () => {
    expect(text99({ acquisitionType99: "from_builder", isRecontractExcluded99: true })).toContain(
      "다른 시·군으로 주거를 이전하면서",
    );
  });
  it("🔴 §99의3 카브백 칩", () => {
    expect(text993({ acquisitionType993: "from_builder", isRecontractExcluded993: true })).toContain(
      "다른 시·군으로 주거를 이전하면서",
    );
  });
});

describe("NH-35·NH-44 §99의3 폼 문구", () => {
  it("🔴 1호 단서 토글에 「다른 자가」가 없다", () => {
    const t = text993({ acquisitionType993: "from_builder" });
    expect(t).toContain("매매계약일 현재 입주한 사실 있음");
    expect(t).not.toContain("다른 자가");
  });
  it("짝 — §99 2호 단서는 「다른 자가」가 유지된다", () => {
    expect(text99({ acquisitionType99: "from_builder" })).toContain("매매계약일 현재 다른 자가 입주한 사실 있음");
  });
  it("🔴 시행령 링크는 조특령 §99의3", () => {
    const t = text993({});
    expect(t).toContain("조특령 §99의3");
  });
});
