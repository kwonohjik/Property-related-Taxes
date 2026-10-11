/**
 * 결정 #21(S16-5) ⑤ — §154⑩ 표준 경로(B · 임대 0호)의 경과조치 선언은 **사유까지** 받는다 (양도일 구간 안팎 공통).
 *
 *  · 구간 안에서도 ⑳ 본문 괄호(생애 1회·1주택 한정) 안내 카드가 아니라 §154⑩ 전용 안내 — 이 경로에서 경과조치가 바꾸는 것은 거주요건이다.
 *  · 사유가 종전규정을 주지 않으면(사유 미선택 · 「계약금 · 그 전 등록 임대주택 없음」) ③이 「종전규정이 적용됩니다」라고 말하지 않는다.
 *  · 계산기(calc) 요약은 「계약금 · 임대주택 없음」을 「이력: 없음」으로 말하지 않고 종전 규정 미적용으로 말한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
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

describe("S16-5 §154⑩ 경로 — 사유 칸", () => {
  for (const [label, td] of [["구간 밖 2026-03-01", "2026-03-01"], ["구간 안 2024-06-01", "2024-06-01"]] as const) {
    it(`${label} — 체크하면 사유 선택지가 뜬다 · 고르면 한 patch로 올라간다`, () => {
      const onChange = renderAt("facts", "2020-05-01", td, { residenceTransitionUnderAddendum: true });
      expect(screen.getByTestId("rental-transition-basis")).toBeTruthy();
      fireEvent.click(screen.getByTestId("rental-transition-basis-contract-without-rental"));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ residenceTransitionBasis: "contract_without_prior_rental" }));
    });
    it(`${label} — 체크하지 않으면 사유 선택지가 없다 (짝)`, () => {
      renderAt("facts", "2020-05-01", td);
      expect(screen.queryByTestId("rental-transition-basis")).toBeNull();
    });
  }
  it("구간 안이어도 ⑳ 본문 괄호 안내(생애 1회 · 1주택 한정)·이력 칸을 싣지 않고 §154⑩ 전용 안내를 싣는다", () => {
    renderAt("facts", "2020-05-01", "2024-06-01", { residenceTransitionUnderAddendum: true });
    expect(screen.queryByText(/적용 범위 제한/)).toBeNull();
    expect(screen.queryByTestId("rental-prior-history")).toBeNull();
    expect(screen.getByText(/경과조치에 따라 거주요건이 달라집니다/)).toBeTruthy();
  });
  it("③ — 사유가 종전규정을 주면 「종전규정이 적용됩니다」 / 주지 않으면 신규정 안내 (등록일 이후 거주기간 칸 유지)", () => {
    renderAt("facts", "2020-05-01", "2026-03-01", { residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing" });
    expect(document.body.textContent).toContain("종전규정이 적용됩니다");
    expect(screen.queryByTestId("rental-transition-not-effective-note")).toBeNull();
    cleanup();
    renderAt("facts", "2020-05-01", "2026-03-01", { residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_without_prior_rental" });
    expect(document.body.textContent).not.toContain("종전규정이 적용됩니다");
    expect(screen.getByTestId("rental-transition-not-effective-note")).toBeTruthy();
    expect(screen.getByLabelText("사업자등록·임대사업자 등록 이후 거주기간")).toBeTruthy();
    cleanup();
    // 체크만(사유 없음)도 같다
    renderAt("facts", "2020-05-01", "2026-03-01", { residenceTransitionUnderAddendum: true });
    expect(document.body.textContent).not.toContain("종전규정이 적용됩니다");
    expect(screen.getByTestId("rental-transition-not-effective-note")).toBeTruthy();
  });
});

describe("S16-5 계산기 요약 — 넘겨받은 경과조치 사유 표기", () => {
  it("「계약금 · 그 전 등록 임대주택 없음」은 종전 규정 미적용으로 말한다 (종전: 「이력: 없음」으로 표기)", () => {
    renderAt("calc", "2019-06-01", "2024-06-01", { scenario: "A", residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_without_prior_rental" });
    const t = screen.getByTestId("imported-rental-lifetime-facts").textContent ?? "";
    expect(t).toContain("그 전 등록 임대주택 없음(종전 규정 미적용)");
    expect(t).not.toContain("이력: 없음");
  });
  it("종전 규정을 주는 사유면 이력을 말하지 않는다 / 경과조치 없음이면 이력만 말한다 (짝)", () => {
    renderAt("calc", "2019-06-01", "2024-06-01", { scenario: "A", residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing", priorRentalExemptionHistory: "used" });
    expect(screen.getByTestId("imported-rental-lifetime-facts").textContent).not.toContain("이력");
    cleanup();
    renderAt("calc", "2019-06-01", "2024-06-01", { scenario: "A", priorRentalExemptionHistory: "used" });
    expect(screen.getByTestId("imported-rental-lifetime-facts").textContent).toContain("있음");
  });
});
