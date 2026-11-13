/**
 * ⑤ — 종부령 §3①9호(「소유」)는 「임대등록 말소」 칸을 묻지 않는다(엔진이 말소일을 보지 않으므로 · ④와 같은 술어
 * `asksRegistrationRevokedDate`). 다른 임대 유형에서는 그대로 보인다.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { makeProperty } from "@/lib/stores/comprehensive-wizard-store";

const renderWith = (exclusionType: string, rentalRegistrationType: string) =>
  render(
    <ExclusionInfoInput
      index={0}
      property={{ ...makeProperty(), exclusionType, rentalRegistrationType } as ReturnType<typeof makeProperty>}
      onUpdate={() => {}}
    />,
  );

describe("임대등록 말소 칸", () => {
  it("★ 9호에서는 보이지 않는다", () => {
    renderWith("public_conversion_pending_rental", "public_conversion_pending");
    expect(screen.queryByText("임대등록 말소")).toBeNull();
  });
  it("4호에서는 보인다", () => {
    renderWith("vacant_construction_rental", "vacant_construction");
    expect(screen.getByText("임대등록 말소")).toBeTruthy();
  });
});
