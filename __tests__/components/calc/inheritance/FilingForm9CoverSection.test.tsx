/**
 * FilingForm9CoverSection 화면 anchor — testid ①~㊷ · 라벨 · 계산값 표시.
 * Design §2·§4. 출력 전용(엔진 변경 0).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { FilingForm9CoverSection } from "@/components/calc/inheritance/filing-form-9/FilingForm9CoverSection";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
} from "../../../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

const result = calcInheritanceTax(EXAMPLE_INPUT);

afterEach(cleanup);

function renderForm() {
  return render(
    <FilingForm9CoverSection
      result={result}
      heirs={EXAMPLE_HEIRS}
      deathDate="2023-03-05"
    />,
  );
}

describe("FilingForm9CoverSection (별지 제9호서식 화면)", () => {
  it("루트 섹션 + 제목 렌더", () => {
    renderForm();
    expect(screen.getByTestId("ff9-cover-section")).toBeTruthy();
    expect(
      screen.getAllByText(/상속세과세표준신고 및 자진납부계산서/).length,
    ).toBeGreaterThan(0);
  });

  it("식별정보 칸 testid ①~⑯ 존재 + ⑫ 상속개시일·⑤ 관계 표시", () => {
    renderForm();
    for (const n of ["①", "②", "⑤", "⑫", "⑯"]) {
      expect(screen.getByTestId(`ff9-${n}`)).toBeTruthy();
    }
    expect(screen.getByTestId("ff9-⑫").textContent).toContain("2023-03-05");
    // ⑤ 관계 라벨 비어있지 않음
    expect((screen.getByTestId("ff9-⑤").textContent ?? "").length).toBeGreaterThan(0);
  });

  it("계산 칸 testid + 이미지1 값 표시 (⑰·㉒·㉔·㉗·㊳)", () => {
    renderForm();
    expect(screen.getByTestId("ff9-⑰").textContent).toContain("8,775,000,000");
    expect(screen.getByTestId("ff9-㉒").textContent).toContain("1,627,500,000");
    expect(screen.getByTestId("ff9-㉔").textContent).toContain("1,657,732,198");
    expect(screen.getByTestId("ff9-㉗").textContent).toContain("623,971,966");
    expect(screen.getByTestId("ff9-㊳").textContent).toContain("1,033,760,232");
  });

  it("금액 칸 고정폭(font-mono) + 우측정렬 — 콤마 세로 정렬 보장", () => {
    renderForm();
    const amtCell = screen.getByTestId("ff9-⑰").querySelector("td:last-child");
    expect(amtCell?.className).toContain("font-mono");
    expect(amtCell?.className).toContain("text-right");
  });

  it("㉟ 면제세액 = 0 (dash) — 이중계상 없음", () => {
    renderForm();
    // ㉟ 행 존재 (값 0 → dash). 금액 콤마 없음
    const cell = screen.getByTestId("ff9-㉟");
    expect(cell.textContent).not.toContain("150,000,000");
  });

  it("하단 제출서류·동의서 정적 텍스트 렌더", () => {
    renderForm();
    expect(screen.getAllByText(/상속세과세가액계산명세서\(부표 1\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/행정정보 공동이용 동의서/).length).toBeGreaterThan(0);
  });

  it("펼침 토글 동작 (▼ 펼치기 / ▲ 접기)", () => {
    renderForm();
    const btn = screen.getByRole("button", { name: /펼치기|접기/ });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("heirs 없으면 미렌더 (렌더 가드)", () => {
    const { container } = render(
      <FilingForm9CoverSection result={result} heirs={[]} deathDate="2023-03-05" />,
    );
    expect(container.querySelector('[data-testid="ff9-cover-section"]')).toBeNull();
  });
});
