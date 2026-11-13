/**
 * @vitest-environment jsdom
 *
 * anchor — §97의3 상속 합산 토글(V-14 ⑤⑦) · 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md §3.2
 * - 상속 자산에서만 보인다 · 상속개시일 칸은 없다 · 끄면 두 칸을 비운다 · 변경신고(before)와 함께면 경고(Q-2)
 * - 미리보기는 엔진과 같은 합산 함수(`mergedRentalYears97`) · 결과 카드는 엔진 echo(`rentalPeriod973`)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental97DetailCard } from "@/components/calc/results/transfer/Rental97DetailCard";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

type Form = Parameters<typeof Rental973InputForm>[0]["value"];
const TITLE = "상속받은 임대주택 — 피상속인 임대기간 합산";
const base = (over: Partial<Form> = {}) =>
  ({
    ...(getReductionDefault("rental_97_3") as Form),
    registrationDate: "2019-02-01",
    rentalStartDate: "2019-02-01",
    isTaxRegistered: true,
    taxRegistrationDate: "2019-02-01",
    ...over,
  }) as Form;
const renderForm = (cause: string, value: Form = base(), onChange = vi.fn()) => {
  render(
    <Rental973InputForm value={value} onChange={onChange} acquisitionDate="2019-01-01" transferDate="2026-06-01" assetContractDate="" acquisitionCause={cause} />,
  );
  return onChange;
};
const ON = { isInherited973: true, decedentRegistrationDate973: "2016-05-01", decedentRentalStartDate973: "2016-05-01" };

describe("토글 노출", () => {
  it("상속 자산 → 보인다 · 상속개시일 칸은 없다", () => {
    renderForm("inheritance");
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(document.querySelector('[data-field="reduction.rental_97_3.inheritanceDate973"]')).toBeNull();
  });
  it.each(["purchase", "gift", "carryover_gift"])("%s → 숨긴다", (cause) => {
    renderForm(cause);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
  it("켜면 피상속인 날짜 2칸 · 끄면 두 칸을 비운다", () => {
    const onChange = renderForm("inheritance", base(ON));
    expect(document.querySelector('[data-field="reduction.rental_97_3.decedentRegistrationDate973"]')).not.toBeNull();
    expect(document.querySelector('[data-field="reduction.rental_97_3.decedentRentalStartDate973"]')).not.toBeNull();
    const toggle = document.querySelector('[data-field="reduction.rental_97_3.isInherited973"] button, [data-field="reduction.rental_97_3.isInherited973"][role="switch"], [data-field="reduction.rental_97_3.isInherited973"] [role="switch"]') as HTMLElement;
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ isInherited973: false, decedentRegistrationDate973: "", decedentRentalStartDate973: "" });
  });
});

describe("Q-2 변경신고 충돌 경고 · 미리보기", () => {
  it("변경신고 before + 토글 ON → 경고 · 아니면 없음", () => {
    renderForm("inheritance", base({ ...ON, shortTermConversionMode: "before" }));
    expect(screen.getByText(/함께 계산하지 않습니다/)).toBeTruthy();
    cleanup();
    renderForm("inheritance", base(ON));
    expect(screen.queryByText(/함께 계산하지 않습니다/)).toBeNull();
  });
  it("🔴 합산 미리보기 = 엔진 연수(10년) · 변경신고 충돌이면 미리보기 없음", () => {
    renderForm("inheritance", base(ON));
    const row = screen.getByTestId("rental973-merged-preview");
    expect(row.textContent).toContain("2016-05-01 ~ 2019-01-01");
    expect(row.textContent).toContain("10년");
    cleanup();
    renderForm("inheritance", base({ ...ON, shortTermConversionMode: "before" }));
    expect(screen.queryByTestId("rental973-merged-preview")).toBeNull();
  });
});

describe("결과 카드 — 합산 구간", () => {
  const detail = {
    id: "rental_97_3", isEligible: true, legalBasis: "조특법 §97의3", effectCategory: "long_term_holding_special",
    overrideRate: 0.7, rentalGainRatio: 1, eligibleRentalYears: 10,
    rentalPeriod973: { decedent: { start: "2016-05-01", end: "2019-01-01" }, heir: { start: "2019-02-01", end: "2026-06-01" } },
  } as never;
  it("피상속인·상속인 임대기간 행", () => {
    render(<Rental97DetailCard detail={detail} calculatedTax={50_000_000} />);
    const box = screen.getByTestId("rental973-period-detail");
    expect(box.textContent).toContain("2016-05-01 ~ 2019-01-01");
    expect(box.textContent).toContain("2019-02-01 ~ 2026-06-01");
    expect(box.textContent).toContain("확인이 필요합니다");
  });
  it("합산 없음 → 행 없음", () => {
    const { rentalPeriod973: _omit, ...rest } = detail as Record<string, unknown>;
    void _omit;
    render(<Rental97DetailCard detail={rest as never} calculatedTax={50_000_000} />);
    expect(screen.queryByTestId("rental973-period-detail")).toBeNull();
  });
});
