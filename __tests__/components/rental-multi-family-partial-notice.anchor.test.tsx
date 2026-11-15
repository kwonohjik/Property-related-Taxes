/**
 * @vitest-environment jsdom
 *
 * anchor — §97의3·§97의5 다가구주택 일부 가구만 요건 충족 안내 (G-4 · 사용자 결정 2026-11-15 · 안분 입력은 만들지 않는다)
 *
 * 서면-2020-부동산-0826: 「요건을 충족한 임대가구는 양도소득세의 과세특례가 적용」.
 * 서면-2024-부동산-4764·서면-2024-법규재산-2823: §97의3 요건은 가구(호)별 판단.
 * 기준시가 6억 가구별 여부는 §97의3 정면 해석 없음 → 「임대개시일 당시 기준시가」 칸 바로 뒤 안내(사용자 결정 2026-11-15).
 * 세액 변경 없음 — 문구 존재·위치만 고정한다.
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
    expect(note.textContent).toContain("특례는 그 가구 몫에만 적용됩니다 (서면-2020-부동산-0826 · 서면-2024-부동산-4764 · 서면-2024-법규재산-2823)");
    expect(note.textContent).toContain("임대기간·임대료 증가율");
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

  it.each([
    ["rental_97_3", "973", "§97의3 정면 해석이 없습니다"],
    ["rental_97_5", "975", "§97의3·§97의5 정면 해석이 없습니다"],
  ] as const)("%s 폼 — 기준시가 6억 가구별 안내가 기준시가 칸 안내 바로 뒤", (type, suffix, phrase) => {
    if (type === "rental_97_3") {
      render(<Rental973InputForm value={getReductionDefault(type) as Parameters<typeof Rental973InputForm>[0]["value"]} {...common} />);
    } else {
      render(<Rental975InputForm value={getReductionDefault(type) as Parameters<typeof Rental975InputForm>[0]["value"]} {...common} />);
    }
    const note = screen.getByTestId(`rental-multi-family-price-cap-notice-${suffix}`);
    expect(note.textContent).toContain(phrase);
    expect(note.textContent).toContain("서면-2015-부동산-22301은 소득세법 시행령 §167의3");
    expect(note.textContent).toContain("입력한 주택 전체 값으로 판정");
    const hint = note.previousElementSibling;
    expect(hint?.textContent).toContain("6억(수도권 밖 3억) 이하 요건");
    expect(hint?.parentElement?.querySelector(`[data-field="reduction.${type}.officialPriceAtStart"]`)).not.toBeNull();
  });

  it("§97의4 폼(면적 요건 없음)에는 안내가 없다", () => {
    render(<Rental974InputForm value={{ type: "rental_97_4" } as never} onChange={() => {}} transferDate="2025-01-01" />);
    expect(screen.queryByTestId(/rental-multi-family-partial-notice/)).toBeNull();
    expect(screen.queryByTestId(/rental-multi-family-price-cap-notice/)).toBeNull();
  });
});
