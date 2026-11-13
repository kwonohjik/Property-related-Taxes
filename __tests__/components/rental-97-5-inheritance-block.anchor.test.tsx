/**
 * @vitest-environment jsdom
 *
 * anchor — §97의5 상속 합산 토글(V-13 ⑤⑦) · 계획서 docs/01-plan/features/rental-97-5-inheritance-merge.plan.md §3.2
 * - 상속 자산에서만 보인다(Q-G) · 상속개시일 칸은 없다(Q-F) · 끄면 두 칸을 비운다
 * - 결과 카드는 엔진 echo(`rentalPeriod975`)로 피상속인·상속인 구간을 보인다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental97DetailCard } from "@/components/calc/results/transfer/Rental97DetailCard";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

type Form = Parameters<typeof Rental975InputForm>[0]["value"];
const TITLE = "상속받은 임대주택 — 피상속인 임대기간 합산";
const base = (over: Partial<Form> = {}) => ({ ...(getReductionDefault("rental_97_5") as Form), ...over });
const renderForm = (cause: string, value: Form = base(), onChange = vi.fn()) => {
  render(
    <Rental975InputForm value={value} onChange={onChange} acquisitionDate="2017-06-01" transferDate="2026-03-01" assetContractDate="" acquisitionCause={cause} />,
  );
  return onChange;
};

describe("토글 노출", () => {
  it("상속 자산 → 보인다 · 상속개시일 칸은 없다", () => {
    renderForm("inheritance");
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(document.querySelector('[data-field="reduction.rental_97_5.inheritanceDate975"]')).toBeNull();
  });
  it.each(["purchase", "gift", "carryover_gift"])("%s → 숨긴다", (cause) => {
    renderForm(cause);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
  it("켜면 피상속인 날짜 2칸 · 끄면 두 칸을 비운다", () => {
    const onChange = renderForm("inheritance", base({ isInherited975: true, decedentRegistrationDate975: "2015-03-01", decedentRentalStartDate975: "2015-03-01" }));
    expect(document.querySelector('[data-field="reduction.rental_97_5.decedentRegistrationDate975"]')).not.toBeNull();
    expect(document.querySelector('[data-field="reduction.rental_97_5.decedentRentalStartDate975"]')).not.toBeNull();
    const toggle = document.querySelector('[data-field="reduction.rental_97_5.isInherited975"] button, [data-field="reduction.rental_97_5.isInherited975"][role="switch"], [data-field="reduction.rental_97_5.isInherited975"] [role="switch"]') as HTMLElement;
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ isInherited975: false, decedentRegistrationDate975: "", decedentRentalStartDate975: "" });
  });
});

describe("결과 카드 — 합산 구간", () => {
  const detail = {
    id: "rental_97_5", isEligible: true, legalBasis: "조특법 §97의5", effectCategory: "tax_amount",
    reductionRate: 1, reductionAmount: 50_000_000, rentalGainRatio: 1, isFullExemption: true,
    rentalPeriod975: { decedent: { start: "2015-03-01", end: "2017-06-01" }, heir: { start: "2017-07-15", end: "2026-03-01" } },
  } as never;
  it("피상속인·상속인 임대기간 행", () => {
    render(<Rental97DetailCard detail={detail} calculatedTax={50_000_000} />);
    const box = screen.getByTestId("rental975-period-detail");
    expect(box.textContent).toContain("2015-03-01 ~ 2017-06-01");
    expect(box.textContent).toContain("2017-07-15 ~ 2026-03-01");
    expect(box.textContent).toContain("확인이 필요합니다");
  });
  it("합산 없음 → 행 없음", () => {
    const { rentalPeriod975: _omit, ...rest } = detail as Record<string, unknown>;
    void _omit;
    render(<Rental97DetailCard detail={rest as never} calculatedTax={50_000_000} />);
    expect(screen.queryByTestId("rental975-period-detail")).toBeNull();
  });
});
