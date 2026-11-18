/**
 * ⑤ — T-14 2020.2.11. 전 세무서에만 등록한 다가구 토글(종부령 부칙<제30404호> 제6조).
 * 토글 노출 = 유형 1·2호 ∧ 다가구 층별 입력 ON(`asksDeemedMultiFamilyToggle`) · ON이면 지자체 등록일·말소 칸 숨김 · 구별 공시가격 행.
 * 토글 OFF 기본 화면의 날짜 칸 개수는 변하지 않는다(E2E `getByLabel("연도").first()` 가정 보호).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

afterEach(cleanup);

const U2 = [
  { label: "1층", area: "40", officialValue: "" },
  { label: "2층", area: "35.5", officialValue: "" },
];

function renderWith(over: Partial<PropertyEntry>, onUpdate = vi.fn()) {
  const p = {
    ...makeProperty(),
    exclusionType: "private_purchase_rental_short",
    rentalRegistrationType: "private_purchase_short",
    ...over,
  } as PropertyEntry;
  render(<ExclusionInfoInput index={0} property={p} onUpdate={onUpdate} />);
  return onUpdate;
}
const yearInputs = () => screen.getAllByLabelText("연도").length;
const TOGGLE = "comprehensive-deemed-multifamily-toggle";

describe("토글 노출 조건", () => {
  it("★ 2호·1호 + 다가구 입력 ON → 토글 보임", () => {
    renderWith({ multiFamilyEnabled: true, floorUnits: U2 });
    expect(screen.getByTestId(TOGGLE)).toBeTruthy();
    expect(screen.getByText("2020.2.11. 전 세무서에만 등록한 다가구")).toBeTruthy();
    cleanup();
    renderWith({ exclusionType: "private_construction_rental", rentalRegistrationType: "private_construction", multiFamilyEnabled: true, floorUnits: U2 });
    expect(screen.getByTestId(TOGGLE)).toBeTruthy();
  });

  it("★ 1·2호 + 다가구 입력 OFF → 토글 숨김 + 안내 한 줄", () => {
    renderWith({ multiFamilyEnabled: false });
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
    expect(screen.getByTestId("comprehensive-deemed-needs-multifamily").textContent).toContain("층별(구별) 면적 입력을 먼저 켜세요");
  });

  it("★ 8호 등 그 밖 유형 → 토글·안내 없음 · 종전 「판정하지 못합니다」 문구 유지", () => {
    renderWith({ exclusionType: "private_purchase_rental_long", rentalRegistrationType: "private_purchase_long", multiFamilyEnabled: true, floorUnits: U2 });
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
    expect(screen.queryByTestId("comprehensive-deemed-needs-multifamily")).toBeNull();
    expect(screen.getByText(/이 계산기는 판정하지 못합니다/)).toBeTruthy();
  });
});

describe("ON — 지자체 등록일·말소 칸 숨김 · 구별 공시가격", () => {
  const on = { multiFamilyEnabled: true, floorUnits: U2, deemedMultiFamily: true };

  it("★ 지자체 등록일 칸이 사라지고(날짜 칸 1개 감소) 세무서 등록일 hint가 바뀐다", () => {
    renderWith({ multiFamilyEnabled: true, floorUnits: U2, deemedMultiFamily: false });
    const off = yearInputs();
    expect(screen.getByText(/임대사업자 등록일/)).toBeTruthy();
    cleanup();
    renderWith(on);
    expect(yearInputs()).toBe(off - 1);
    expect(screen.queryByText(/지방자치단체 임대사업자 등록증의 등록일/)).toBeNull();
    expect(screen.getByText("본인 세무서 주택임대업 사업자등록일(2020.2.10. 이전)")).toBeTruthy();
  });

  it("★ 임대등록 말소 칸도 ON이면 숨기고 OFF면 보인다(지자체 말소일은 보지 않는다 — 조심2022서6703)", () => {
    renderWith({ multiFamilyEnabled: true, floorUnits: U2, deemedMultiFamily: false });
    expect(screen.getByText("임대등록 말소")).toBeTruthy();
    cleanup();
    renderWith(on);
    expect(screen.queryByText("임대등록 말소")).toBeNull();
  });

  it("전환 질문과 구별 공시가격 행(라벨·면적 표시)이 보이고, 입력하면 floorUnits[i].officialValue로 올라간다", () => {
    const onUpdate = renderWith(on);
    expect(screen.getByText("2020.2.11. 이후 임대로 바꾼 호실이 없다")).toBeTruthy();
    expect(screen.getByTestId("comprehensive-deemed-unit-0").textContent).toContain("1층");
    expect(screen.getByTestId("comprehensive-deemed-unit-1").textContent).toContain("35.5㎡");
    fireEvent.change(screen.getByTestId("comprehensive-deemed-unit-value-1"), { target: { value: "250000000" } });
    expect(onUpdate).toHaveBeenCalledWith({
      floorUnits: [U2[0], { ...U2[1], officialValue: "250000000" }],
    });
  });

  it("전환 질문 선택은 deemedNoConversionAfterCutoff로 올라간다", () => {
    const onUpdate = renderWith(on);
    fireEvent.click(screen.getByTestId("comprehensive-deemed-no-conversion-yes"));
    expect(onUpdate).toHaveBeenCalledWith({ deemedNoConversionAfterCutoff: "yes" });
  });

  it("OFF에서 토글을 켜면 deemedMultiFamily:true 한 곳만 갱신 · 켜기 전에는 구별 공시가격 행이 없다", () => {
    const onUpdate = renderWith({ multiFamilyEnabled: true, floorUnits: U2, deemedMultiFamily: false });
    expect(screen.queryByTestId("comprehensive-deemed-unit-0")).toBeNull();
    fireEvent.click(within(screen.getByTestId(TOGGLE)).getByRole("switch"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ deemedMultiFamily: true });
  });

  it("다가구 입력을 껐으면 토글이 true로 남아 있어도 적용되지 않는다(지자체 등록일 칸 복귀)", () => {
    renderWith({ multiFamilyEnabled: false, floorUnits: [], deemedMultiFamily: true });
    expect(screen.getByText(/지방자치단체 임대사업자 등록증의 등록일/)).toBeTruthy();
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
  });
});

describe("토글 OFF 기본 화면 — 날짜 칸 개수 불변", () => {
  it("★ 2호 다가구 입력 ON/OFF·토글 OFF 모두 같은 개수(지자체·세무서·임대개시일)", () => {
    renderWith({ multiFamilyEnabled: false });
    const a = yearInputs();
    cleanup();
    renderWith({ multiFamilyEnabled: true, floorUnits: U2 });
    expect(yearInputs()).toBe(a);
  });
});

describe("ON — 건물 단위 기준 공시가격 칸 숨김(엔진이 구별 가격으로 판정 · 브라우저 확인 2026-11-18)", () => {
  const base = { assessedValue: "750,000,000", location: "non_metro" as const, multiFamilyEnabled: true, floorUnits: U2, rentalRegistrationDate: "2017-06-01" };
  const NOTE = /그해 공시가격이 가격 상한을 넘습니다/;

  it("★ 토글 ON이면 건물 7.5억 > 지방 3억이어도 「기준 공시가격」 칸과 상한 초과 안내가 없다", () => {
    render(<ExclusionInfoInput index={0} property={{ ...makeProperty(), exclusionType: "private_purchase_rental_short", rentalRegistrationType: "private_purchase_short", ...base, deemedMultiFamily: true } as PropertyEntry} onUpdate={vi.fn()} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText("기준 공시가격 (선택)")).toBeNull();
  });

  it("대조: 토글 OFF면 칸과 안내가 그대로 보인다", () => {
    render(<ExclusionInfoInput index={0} property={{ ...makeProperty(), exclusionType: "private_purchase_rental_short", rentalRegistrationType: "private_purchase_short", ...base, deemedMultiFamily: false } as PropertyEntry} onUpdate={vi.fn()} />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});
