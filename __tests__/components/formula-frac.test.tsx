import { render, screen } from "@testing-library/react";
import { renderFormula } from "@/components/calc/results/shared/FormulaParts";
import { describe, it, expect } from "vitest";

describe("renderFormula", () => {
  it("숫자 나눗셈을 분수로 렌더", () => {
    const { container } = render(<p>{renderFormula("1,200,000,000 × 672,000,000 / (672,000,000+83,248,000) = 1,067,728,746")}</p>);
    expect(container.querySelectorAll(".inline-flex").length).toBe(1);
    expect(container.textContent).not.toContain("/");
  });
  it("법령 인용 슬래시는 유지", () => {
    const { container } = render(<p>{renderFormula("취득가액(추계) — 소득세법 §97 / 시행령 §163·§176의2")}</p>);
    expect(container.querySelectorAll(".inline-flex").length).toBe(0);
    expect(container.textContent).toContain("§97 / 시행령");
  });
});
