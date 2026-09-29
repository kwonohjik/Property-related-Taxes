/**
 * ⑤ 배선 — 장기임대 9유형 매트릭스의 「5% 넘게 올린 계약의 체결·갱신일」 칸 (E-14m · 대통령령 제29523호 부칙 제6조).
 *
 * ④(`rentIncreaseContractDatePayload`)와 **같은 술어**(`rentIncreaseContractDateInScope`)로 뜨는지 컴포넌트를
 * 렌더해 본다([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-store";

afterEach(() => cleanup());

const BASE: RentalDeclaration = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: "2015-01-01",
  businessRegistrationDate: "2015-01-01",
  rentalType: "A",
  rentIncreaseUnder5Pct: false,
};
const shown = (d: RentalDeclaration) => {
  render(<HouseEntryRentalTypeSection house={d} idPrefix="t" onUpdate={vi.fn()} />);
  const on = screen.queryByTestId("rent-increase-contract-date-t") !== null;
  cleanup();
  return on;
};

describe("E-14m ⑤ — 계약일 칸 노출 범위", () => {
  it("F-1 가목 · 등록 2019-02-11 이전 · 5% 미충족 → 뜬다", () => {
    expect(shown(BASE)).toBe(true);
    expect(shown({ ...BASE, rentalRegistrationDate: "2019-02-11", businessRegistrationDate: "2019-02-11" })).toBe(true);
  });

  it("F-2 [짝] 5% 충족 선언 · 등록기준일(늦은 날) 2019-02-12 이후 · 아목 → 안 뜬다", () => {
    expect(shown({ ...BASE, rentIncreaseUnder5Pct: true })).toBe(false);
    expect(shown({ ...BASE, businessRegistrationDate: "2019-02-12" })).toBe(false);
    expect(shown({ ...BASE, rentalType: "H" })).toBe(false);
  });

  it("F-3 사목 — base 가·다·마목이면 뜨고 라목이면 안 뜬다", () => {
    expect(shown({ ...BASE, rentalType: "G", saMokBaseArticle: "마" })).toBe(true);
    expect(shown({ ...BASE, rentalType: "G", saMokBaseArticle: "라" })).toBe(false);
  });
});
