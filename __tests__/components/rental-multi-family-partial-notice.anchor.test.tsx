/**
 * @vitest-environment jsdom
 *
 * anchor — §97의3·§97의5 다가구주택 일부 가구만 요건 충족 안내 (G-4 · 사용자 결정 2026-11-15 · 안분 입력은 만들지 않는다)
 *
 * 서면-2020-부동산-0826: 「요건을 충족한 임대가구는 양도소득세의 과세특례가 적용」.
 * 세액 변경 없음 — 문구 존재·위치(「국민주택규모 이하」 칸 바로 뒤)만 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const common = { onChange: () => {}, acquisitionDate: "2016-03-10", transferDate: "2029-12-01", assetContractDate: "" };

function expectRightAfterScaleToggle(note: HTMLElement, type: "rental_97_3" | "rental_97_5") {
  const toggle = document.querySelector(`[data-field="reduction.${type}.isNationalHousingScale"]`);
  expect(toggle).not.toBeNull();
  expect(toggle!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(toggle!.nextElementSibling).toBe(note);
}

describe("다가구 일부 가구 충족 안내 (G-4)", () => {
  it("§97의3 폼 — 「국민주택규모 이하」 칸 바로 뒤 · 0826 인용 · 전체 판정 고지", () => {
    render(<Rental973InputForm value={getReductionDefault("rental_97_3") as Parameters<typeof Rental973InputForm>[0]["value"]} {...common} />);
    const note = screen.getByTestId("rental-multi-family-partial-notice-973");
    expect(note.textContent).toContain("특례는 그 가구 몫에만 적용됩니다 (서면-2020-부동산-0826)");
    expect(note.textContent).toContain("주택 전체를 하나로 판정합니다");
    expect(note.textContent).toContain("확인이 필요합니다");
    expectRightAfterScaleToggle(note, "rental_97_3");
  });

  it("§97의5 폼 — §97의5 정면 해석 미확인 고지", () => {
    render(<Rental975InputForm value={getReductionDefault("rental_97_5") as Parameters<typeof Rental975InputForm>[0]["value"]} {...common} />);
    const note = screen.getByTestId("rental-multi-family-partial-notice-975");
    expect(note.textContent).toContain("§97의5 정면 해석은 미확인");
    expect(note.textContent).toContain("주택 전체를 하나로 판정합니다");
    expectRightAfterScaleToggle(note, "rental_97_5");
  });

  it("§97의4 폼(면적 요건 없음)에는 안내가 없다", () => {
    render(<Rental974InputForm value={{ type: "rental_97_4" } as never} onChange={() => {}} transferDate="2025-01-01" />);
    expect(screen.queryByTestId(/rental-multi-family-partial-notice/)).toBeNull();
  });
});
