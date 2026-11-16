/**
 * ⑤ — 종부세 합산배제 문구 3건(T-05 · T-17a) 화면.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-wording-3.plan.md (Q-1·Q-2 권장안 · 2026-11-17)
 *  - 2호 라벨 「2018.3.31. 이전 등록 (단기·장기 공통 5년)」 · 짧은 라벨에 괄호가 남지 않는다
 *  - 8호(유효값 regType)를 고르면 「2호로도 판정할 수 있습니다」 안내 1줄(중립 문구) · 2호에서는 없다
 *  - 말소 토글 설명에 자동말소 포함
 */
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import { exclusionTypeLabel, exclusionTypeShortLabel } from "@/components/calc/property-list-shared";

afterEach(cleanup);

const renderWith = (exclusionType: string, rentalRegistrationType: string) =>
  render(
    <ExclusionInfoInput
      index={0}
      property={{ ...makeProperty(), exclusionType, rentalRegistrationType } as ReturnType<typeof makeProperty>}
      onUpdate={() => {}}
    />,
  );

const HINT = "2018.3.31. 이전에 임대사업자 등록과 사업자등록을 모두 마친 민간매입임대는 2호(의무임대기간 5년)로도 판정할 수 있습니다.";

describe("T-05 2호 라벨", () => {
  it("합산배제 신청 유형 · 표의 짧은 라벨", () => {
    expect(exclusionTypeLabel("private_purchase_rental_short")).toBe(
      "민간매입임대 2018.3.31. 이전 등록 (단기·장기 공통 5년, 시행령 §3①2호)",
    );
    expect(exclusionTypeShortLabel("private_purchase_rental_short")).toBe("민간매입임대 2018.3.31. 이전 등록");
  });
  it("임대등록 유형 선택지", () => {
    renderWith("private_purchase_rental_short", "private_purchase_short");
    expect(screen.getByRole("option", { name: "민간매입임대 2018.3.31. 이전 등록 (단기·장기 공통 5년)" })).toBeTruthy();
    expect(screen.queryByText(/단기 구법/)).toBeNull();
  });
});

describe("T-05 8호 → 2호 안내 (Q-2 항상 띄움)", () => {
  it("★ 8호에서 보인다", () => {
    renderWith("private_purchase_rental_long", "private_purchase_long");
    expect(screen.getByTestId("comprehensive-8ho-2ho-hint").textContent).toBe(HINT);
  });
  it("임대등록 유형이 비어 있어도 합산배제 유형이 8호면 보인다(유효값)", () => {
    renderWith("private_purchase_rental_long", "");
    expect(screen.getByTestId("comprehensive-8ho-2ho-hint")).toBeTruthy();
  });
  it.each([
    ["private_purchase_rental_short", "private_purchase_short"],
    ["public_support_purchase_rental", "public_support_purchase"],
  ])("%s 에서는 없다", (ex, reg) => {
    renderWith(ex, reg);
    expect(screen.queryByTestId("comprehensive-8ho-2ho-hint")).toBeNull();
  });
});

describe("T-17a 말소 토글 설명", () => {
  it("자동말소 포함 · 「의무임대기간 중」 없음", () => {
    renderWith("private_purchase_rental_long", "private_purchase_long");
    expect(screen.getByText("과세기준일까지 임대사업자 등록이 말소된 경우 (자진·자동·직권 말소)")).toBeTruthy();
    expect(screen.queryByText(/의무임대기간 중 자진·직권/)).toBeNull();
  });
});
