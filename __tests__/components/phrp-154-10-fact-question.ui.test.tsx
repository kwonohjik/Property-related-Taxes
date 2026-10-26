/**
 * @vitest-environment jsdom
 *
 * ⑤ — §154⑩ 사실 질문 위젯(계획서 `phrp-154-10-undeclared-one-house.plan.md` Q-1·Q-2·Q-3 (a)). 판정·⑧·AI 경로는
 * `__tests__/calc/phrp-154-10-fact-question.anchor.test.tsx`.
 *
 * | # | 주장 |
 * |---|---|
 * | PU-1 | 판정 메뉴(`facts`)·부담부증여(`full`)는 ⑳ 토글 **바깥**에 질문을 띄운다 — 미응답이면 어느 쪽도 선택돼 있지 않다 |
 * | PU-2 | 「예」를 누르면 §154⑩ 선언(B · 임대주택 0호 · 등록 사실)이 올라가고, 다시 그리면 「예」가 선택돼 있고 §154⑩ 블록이 열린다 |
 * | PU-3 | 계산기(`calc`)는 묻지 않고, 미선언 안내에 §154⑩ 한 줄을 더한다 |
 * | PU-4 | ⑳을 임대주택 1호 이상으로 선언했으면 띄우지 않는다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalHousingExceptionSection, type RentalHousingSectionMode } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type Rh = AssetForm["rentalHousingException"];

function asset(rh?: Partial<Rh>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2018-06-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "13",
    rentalHousingException: { ...a.rentalHousingException, ...rh },
  };
}

function renderSection(mode: RentalHousingSectionMode, a = asset(), onChange = vi.fn()) {
  render(
    <RentalHousingExceptionSection
      mode={mode}
      rh={a.rentalHousingException}
      asset={a}
      acquisitionDate={a.acquisitionDate ?? ""}
      transferDate="2020-07-01"
      onChange={onChange}
    />,
  );
  return onChange;
}

const radio = (v: "yes" | "no") => screen.getByTestId(`phrp-154-10-answer-${v}`) as HTMLInputElement;

describe("§154⑩ 사실 질문 — ⑤", () => {
  it.each(["facts", "full"] as const)("PU-1 ★ %s 모드 — ⑳ 토글 바깥에 질문 · 미응답이면 둘 다 꺼져 있다", (mode) => {
    renderSection(mode);
    expect(screen.getByTestId("phrp-154-10-question")).toBeTruthy();
    expect([radio("yes").checked, radio("no").checked]).toEqual([false, false]);
    // 토글이 꺼져 있어도 보인다 — 혜택 토글 안쪽이 아니다
    expect(screen.queryByTestId("rental-154-10-block")).toBeNull();
  });

  it("PU-2 ★ 「예」 → §154⑩ 선언을 올리고, 그 값으로 다시 그리면 「예」 선택 + §154⑩ 블록", () => {
    const onChange = renderSection("facts");
    fireEvent.click(radio("yes"));
    const next = onChange.mock.calls[0][0] as Rh;
    expect(next).toMatchObject({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true, phrp154_10Answer: "yes" });
    cleanup();
    renderSection("facts", asset(next));
    expect(radio("yes").checked).toBe(true);
    expect(screen.getByTestId("rental-154-10-block")).toBeTruthy();
  });

  it("PU-2b 「아니오」 → 응답만 저장 · 선택 표시", () => {
    const onChange = renderSection("full");
    fireEvent.click(radio("no"));
    const next = onChange.mock.calls[0][0] as Rh;
    expect(next).toMatchObject({ applyException: false, phrp154_10Answer: "no" });
    cleanup();
    renderSection("full", asset(next));
    expect(radio("no").checked).toBe(true);
  });

  it("PU-3 계산기 — 질문 없음 · 미선언 안내에 §154⑩ 한 줄", () => {
    renderSection("calc");
    expect(screen.queryByTestId("phrp-154-10-question")).toBeNull();
    expect(screen.getByTestId("rental-housing-154-10-calc-notice").textContent).toContain(
      "판정 메뉴에서 선언하지 않으면 기간 안분 없이 계산됩니다",
    );
  });

  it("PU-4 ⑳ 임대주택 1호 이상 선언이면 묻지 않는다", () => {
    renderSection("facts", asset({ applyException: true, scenario: "A", rentalUnits: [makeDefaultRentalUnit()] }));
    expect(screen.queryByTestId("phrp-154-10-question")).toBeNull();
  });
});
