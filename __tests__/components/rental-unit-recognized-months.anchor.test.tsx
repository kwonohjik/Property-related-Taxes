/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §155⑳ 임대주택 카드 「실제 임대 기간」 아래 인정 임대개월 표시 · 상속 임대주택 토글
 * (계획서 `docs/01-plan/features/rental-155-20-period-count.plan.md`).
 *
 * | # | 주장 |
 * |---|---|
 * | UI-1 | 구간이 있으면 ④가 엔진에 싣는 것과 같은 인정 개월(등록일 자르기·3월 이내 공실 산입)을 보여 준다 |
 * | UI-2 | 구간이 없으면 표시하지 않는다 |
 * | UI-3 | 상속 토글 ON이면 피상속인 임대기간 칸이 보이고, 입력은 `decedentRentalMonths`로 간다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalUnitPeriodPriceBlock } from "@/components/calc/transfer/RentalUnitPeriodPriceBlock";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { deriveRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";

afterEach(cleanup);

type Unit = ReturnType<typeof makeDefaultRentalUnit>;

function renderBlock(over: Partial<Unit>, set = vi.fn()) {
  const unit: Unit = {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2016-01-01",
    rentalRegistrationDate: "2016-01-01",
    ...over,
  };
  render(
    <RentalUnitPeriodPriceBlock
      unit={unit}
      index={0}
      set={set}
      onChange={vi.fn()}
      transferDate="2024-01-01"
      reqYears={5}
      showAcqPrice
      capLabel="6억(수도권)"
      rentalStartDate=""
      showTermination={false}
    />,
  );
  return { unit, set };
}

describe("⑳ 임대주택 카드 — 인정 임대개월·상속", () => {
  it("UI-1 ★ 인정 개월 = ④ 값(등록 2016-01-01 · 2014~2019 구간 → 36)", () => {
    const { unit } = renderBlock({
      rentalInputMode: "interval",
      rentalPeriods: [{ start: "2014-01-01", end: "2019-01-01" }],
    });
    const t = screen.getByTestId("rental-recognized-months-0").textContent ?? "";
    expect(t).toContain("36개월");
    expect(deriveRentalMonths(unit)).toBe(36);
    expect(t).toContain("조특칙 §44");
  });

  it("UI-2 구간이 없으면 인정 개월을 표시하지 않는다", () => {
    renderBlock({ rentalInputMode: "direct", rentalPeriods: [] });
    expect(screen.queryByTestId("rental-recognized-months-0")).toBeNull();
  });

  it("UI-3 ★ 상속 토글 ON → 피상속인 임대기간 칸 입력이 decedentRentalMonths로 간다", () => {
    const { set } = renderBlock({ isInheritedRental: true, decedentRentalMonths: "" });
    const card = screen.getByTestId("rental-inherited-0");
    expect(card.textContent).toContain("피상속인 임대기간");
    const input = card.querySelector("input[type='text'], input:not([type])") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    expect(set).toHaveBeenCalledWith("decedentRentalMonths", "30");
  });
});
