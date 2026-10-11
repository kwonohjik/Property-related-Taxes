/**
 * S16-4 anchor — §154⑩ 표준 경로(B · 임대 0호)의 대통령령 제29523호 부칙 제7조② 경과조치 선언은 **양도일과 무관하게** 거주요건 분기를
 * 가른다(엔진 `eligibility.ts` · ⑧ · ③ 표시 · ④ 모두 `isPreLifetimeLimitRegime` — 양도일 인자 없음). 그러므로 그 선언을 넣고 끄는 입력 경로가
 * 2025.2.28. 이후 양도에도 있어야 한다. 종전에는 입력 칸이 양도일 구간(2025.2.28. 전)에서만 열려, 이후 양도는 칸도 고지도 없었고
 * 구간 안에서 켠 값은 양도일을 옮기면 끌 수 없었다.
 *
 * 입력 경로만 다룬다 — 사유 요건은 `rental-155-20-transition-basis-s16-5.ui.test.tsx`(결정 #21).
 * 법령: 「소득세법 시행령」 §154⑩2호는 2019.2.12. 이후 개정이 없고(MST 290841 연혁), 제29523호 부칙 제7조②는 「제154조제10항제2호,
 * 제155조제20항(제2호는 제외한다)의 개정규정 … 에도 불구하고 종전의 규정에 따른다」다(리뷰의 법제처 DRF 부칙 원문 확인 — 이 PR에서
 * 본문을 직접 재확인한 것은 아래 「확인」 절).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function asset(acq: string, rhOver: Partial<AssetForm["rentalHousingException"]> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a, assetKind: "housing", acquisitionDate: acq, residenceInputMode: "direct", residencePeriodMonthsAsset: "40",
    rentalHousingException: {
      ...a.rentalHousingException, applyException: true, scenario: "B", rentalUnits: [],
      priorResidenceTransferDate: "2023-01-10", wasRegisteredRentalOrChildcare: true, postRegistrationResidenceMonths: "10",
      residenceTransitionUnderAddendum: false, residenceTransitionBasis: "", ...rhOver,
    } as AssetForm["rentalHousingException"],
  };
}
function renderAt(mode: "facts" | "full" | "calc", acq: string, td: string, rhOver: Partial<AssetForm["rentalHousingException"]> = {}, onChange = vi.fn()) {
  const a = asset(acq, rhOver);
  render(<RentalHousingExceptionSection mode={mode} rh={a.rentalHousingException} asset={a} acquisitionDate={acq} transferDate={td} onChangeResidence={() => {}} onChange={onChange} />);
  return onChange;
}
const TOGGLE = "rental-residence-transition";

describe("S16-4 §154⑩ 경로 — 경과조치 선언 칸은 양도일과 무관하게 열린다", () => {
  for (const mode of ["facts", "full"] as const) {
    it(`${mode} — 양도 2026-03-01(구간 밖)에도 선언 칸이 있다 · 켜면 onChange`, () => {
      const onChange = renderAt(mode, "2020-05-01", "2026-03-01");
      expect(document.body.textContent).toMatch(/부칙 제7조②/);
      fireEvent.click(within(screen.getByTestId(TOGGLE)).getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ residenceTransitionUnderAddendum: true }));
    });
    it(`${mode} 대조 — 양도 2024-06-01(구간 안)에도 같은 선언 칸이 있다(현행)`, () => {
      renderAt(mode, "2020-05-01", "2024-06-01");
      expect(screen.getByTestId(TOGGLE)).toBeTruthy();
    });
  }
  it("구간 밖에서 켜 둔 값은 끌 수 있다 — 끄면 사유도 함께 비운다(한 patch)", () => {
    const onChange = renderAt("facts", "2020-05-01", "2026-03-01", { residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing" });
    fireEvent.click(within(screen.getByTestId(TOGGLE)).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ residenceTransitionUnderAddendum: false, residenceTransitionBasis: "" }));
  });
  it("구간 밖에서는 적용 범위 제한 안내·생애 1회 이력을 싣지 않는다(구간 안 ⑳ 괄호의 축) — 사유 칸은 S16-5로 연다", () => {
    renderAt("facts", "2020-05-01", "2026-03-01", { residenceTransitionUnderAddendum: true });
    expect(screen.queryByText(/적용 범위 제한/)).toBeNull();
    expect(screen.queryByTestId("rental-prior-history")).toBeNull();
    // S16-5 — 사유가 종전규정을 주는지를 가르므로 §154⑩ 경로는 양도일과 무관하게 사유를 받는다.
    expect(screen.getByTestId("rental-transition-basis")).toBeTruthy();
  });
  it("경계 짝 — 2019.2.12. 전 취득은 이미 종전규정이라 선언 칸이 없다", () => {
    renderAt("facts", "2018-05-01", "2026-03-01");
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
  });
  it("경계 짝 — 임대주택이 있는 B · A는 구간 밖에서 칸이 없다(소비 축은 §154⑩ 표준 경로뿐)", () => {
    renderAt("facts", "2020-05-01", "2026-03-01", { rentalUnits: [makeDefaultRentalUnit()] });
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
    cleanup();
    renderAt("facts", "2020-05-01", "2026-03-01", { scenario: "A", rentalUnits: [makeDefaultRentalUnit()] });
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
  });
  it("계산기(calc) 카드는 판정 사실 칸을 받지 않는다 — 칸 없음(종전과 같다)", () => {
    renderAt("calc", "2020-05-01", "2026-03-01");
    expect(screen.queryByTestId(TOGGLE)).toBeNull();
  });
});
