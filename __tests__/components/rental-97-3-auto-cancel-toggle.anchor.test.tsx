/**
 * @vitest-environment jsdom
 *
 * anchor — §97의3 자동말소 8년 간주 토글(구 조특령 §97의3②2호 · ⑤⑦) · 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md
 * - 「양도 전에 임대 종료 또는 등록 말소」를 골랐을 때만 종료 칸 아래에 보인다 · §97의5 폼에는 없다(M-12)
 * - 미리보기는 엔진과 같은 leaf(`autoCancelDeemed973Applies`) · 결과 카드는 엔진 echo(`autoCancelDeemed973`)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental97DetailCard } from "@/components/calc/results/transfer/Rental97DetailCard";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

type F973 = Parameters<typeof Rental973InputForm>[0]["value"];
type F975 = Parameters<typeof Rental975InputForm>[0]["value"];
const TOGGLE = '[data-field="reduction.rental_97_3.autoCancelled973"]';
const base = (over: Partial<F973> = {}) =>
  ({
    ...(getReductionDefault("rental_97_3") as F973),
    registrationDate: "2018-03-15",
    rentalStartDate: "2018-03-15",
    isTaxRegistered: true,
    taxRegistrationDate: "2018-03-15",
    ...over,
  }) as F973;
const renderForm = (value: F973, onChange = vi.fn()) => {
  render(<Rental973InputForm value={value} onChange={onChange} acquisitionDate="2018-02-15" transferDate="2026-06-15" assetContractDate="" acquisitionCause="purchase" />);
  return onChange;
};
const ENDED = { rentalContinuesToTransfer: false, rentalEndDate: "2026-03-15" } as Partial<F973>;

describe("토글 노출", () => {
  it("양도일까지 유지·미선택 → 없다", () => {
    renderForm(base());
    expect(document.querySelector(TOGGLE)).toBeNull();
    cleanup();
    renderForm(base({ rentalContinuesToTransfer: true } as Partial<F973>));
    expect(document.querySelector(TOGGLE)).toBeNull();
  });
  it("종료(말소) 선택 → 종료 칸 아래에 보인다 · 켜면 onChange", () => {
    const onChange = renderForm(base(ENDED));
    const el = document.querySelector(TOGGLE) as HTMLElement;
    expect(el).not.toBeNull();
    const sw = el.querySelector('[role="switch"]') ?? el.querySelector("button");
    fireEvent.click(sw as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ autoCancelled973: true });
  });
  it("M-12 §97의5 폼에는 없다", () => {
    render(
      <Rental975InputForm
        value={{ ...(getReductionDefault("rental_97_5") as F975), rentalContinuesToTransfer: false, rentalEndDate: "2026-03-15" } as F975}
        onChange={() => {}}
        acquisitionDate="2016-02-15"
        transferDate="2030-10-15"
        assetContractDate=""
      />,
    );
    expect(document.querySelector(TOGGLE)).toBeNull();
  });
});

describe("미리보기 — 엔진과 같은 leaf", () => {
  it("🔴 ON + 말소일 ≥ 2020-08-18 + 등록 < 2020-08-18 → 8년 · 50% · 안내 문구", () => {
    renderForm(base({ ...ENDED, autoCancelled973: true }));
    expect(screen.getByTestId("rental973-auto-cancel-preview").textContent).toContain("8년 · 50%");
    expect(screen.getByTestId("rental973-auto-cancel-hint").textContent).toContain("자진말소는 해당하지 않습니다");
  });
  it("말소일 2020-08-17 → 미리보기 없음", () => {
    renderForm(base({ ...ENDED, registrationDate: "2012-08-01", rentalStartDate: "2012-08-01", taxRegistrationDate: "2012-08-01", rentalEndDate: "2020-08-17", autoCancelled973: true }));
    expect(screen.queryByTestId("rental973-auto-cancel-preview")).toBeNull();
  });
  it("OFF → 미리보기 없음", () => {
    renderForm(base(ENDED));
    expect(screen.queryByTestId("rental973-auto-cancel-preview")).toBeNull();
  });
});

describe("결과 카드", () => {
  const detail = {
    id: "rental_97_3", isEligible: true, legalBasis: "조특법 §97의3", effectCategory: "long_term_holding_special",
    overrideRate: 0.5, rentalGainRatio: 0.8, eligibleRentalYears: 8,
    autoCancelDeemed973: { cancelledDate: "2024-11-26", actualYears: 7 },
  } as never;
  it("자동말소일 · 8년 간주(실제 7년) · 근거", () => {
    render(<Rental97DetailCard detail={detail} calculatedTax={50_000_000} />);
    const box = screen.getByTestId("rental973-auto-cancel-detail");
    expect(box.textContent).toContain("2024-11-26");
    expect(box.textContent).toContain("8년 (실제 통산 7년)");
    expect(box.textContent).toContain("기준-2024-법규재산-0079");
  });
  it("간주 없음 → 행 없음", () => {
    const { autoCancelDeemed973: _o, ...rest } = detail as Record<string, unknown>;
    void _o;
    render(<Rental97DetailCard detail={rest as never} calculatedTax={50_000_000} />);
    expect(screen.queryByTestId("rental973-auto-cancel-detail")).toBeNull();
  });
});
