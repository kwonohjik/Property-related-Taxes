/**
 * 국외전출세 경정청구 실제 양도 입력 방식(전역/종목별) 판정 anchor (PR-7b)
 *
 * 판정 입력은 **엔진 분류 helper**(`previewExitTaxClassificationFromBody`)다 — 화면이 따로 판정하지 않는다.
 *   M-1 2026 이전 출국 → 전역(선택 없음) — 국외 행이 있어도 엔진이 제외한다
 *   M-2 2027 이후 · 국외 2호 과세 → 종목별 **강제**
 *   M-3 2027 이후 · 1호 + 2호(구분 ≥2) → 종목별 강제
 *   M-4 2027 이후 · 1호뿐 → 선택 가능, 기본 전역, 고른 값 반영
 *   M-5 5억 이하라 국외가 제외되면(1호뿐) → 선택 가능 · 제외 종목은 taxedIds에 없다
 *   M-6 입력 미완(판정 불가) · 보유 종목 없음 → 전역 · 선택 없음
 *   M-7 거주 3년(납세의무 없음)이어도 분류는 하므로 판정은 그대로 — 엔진이 세액을 0으로 돌려준다
 */
import { describe, it, expect } from "vitest";
import { previewExitTaxActualMode } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { hasGlobalActualInput, holdingAllowsDomesticWithholding } from "@/lib/calc/stock-transfer-exit-tax-actual-mode";
import { exitActual, exitForm, F1, H1 } from "../_helpers/exit-tax-2027-form";

describe("previewExitTaxActualMode", () => {
  it("M-1 2026 이전 출국 → 전역 · 선택 없음", () => {
    const info = previewExitTaxActualMode(exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1(), F1()] }));
    expect(info).toMatchObject({ mode: "global", forced: false, selectable: false });
    expect([...info.taxedIds]).toEqual(["h1"]); // 국외 행은 엔진이 제외한다
  });

  it("M-2 국외 2호 과세 단독 → 종목별 강제", () => {
    const info = previewExitTaxActualMode(exitForm());
    expect(info).toMatchObject({ mode: "per_holding", forced: true, selectable: false });
    expect([...info.taxedIds]).toEqual(["f1"]);
  });

  it("M-3 1호 + 2호(구분 ≥2) → 종목별 강제 — 저장된 방식 값은 무시한다", () => {
    for (const mode of ["global", "per_holding"] as const) {
      const info = previewExitTaxActualMode(exitForm({ etHoldings: [H1(), F1()], etActualTransferMode: mode }));
      expect(info).toMatchObject({ mode: "per_holding", forced: true, selectable: false });
    }
  });

  it("M-4 1호뿐(2027 이후) → 선택 가능 · 기본 전역 · 고른 값 반영", () => {
    expect(previewExitTaxActualMode(exitForm({ etHoldings: [H1()] }))).toMatchObject({
      mode: "global",
      forced: false,
      selectable: true,
    });
    expect(
      previewExitTaxActualMode(exitForm({ etHoldings: [H1()], etActualTransferMode: "per_holding" })),
    ).toMatchObject({ mode: "per_holding", forced: false, selectable: true });
  });

  it("M-5 5억 이하라 국외가 제외되면 1호뿐 — 선택 가능 · 제외 종목은 taxedIds에 없다", () => {
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    const info = previewExitTaxActualMode(exitForm({ etHoldings: [H1(), small] }));
    expect(info).toMatchObject({ mode: "global", selectable: true });
    expect(info.taxedIds.has("h1")).toBe(true);
    expect(info.taxedIds.has("f1")).toBe(false);
  });

  it("M-6 판정 불가(취득일 없음)·종목 없음 → 전역 · 선택 없음", () => {
    expect(previewExitTaxActualMode(exitForm({ etHoldings: [H1({ acquisitionDate: "" })] }))).toMatchObject({
      mode: "global",
      selectable: false,
    });
    expect(previewExitTaxActualMode(exitForm({ etHoldings: [] }))).toMatchObject({ mode: "global", selectable: false });
  });

  it("M-7 출국일 미입력 → 전역(era 판정 불가)", () => {
    expect(previewExitTaxActualMode(exitForm({ etDepartureDate: "" }))).toMatchObject({ mode: "global", selectable: false });
  });
});

describe("보조 판정", () => {
  it("hasGlobalActualInput — 외국납부세액 토글 ON도 입력이다", () => {
    const base = exitForm();
    expect(hasGlobalActualInput(base)).toBe(false);
    expect(hasGlobalActualInput({ ...base, etActualTransferDate: "2027-06-01" })).toBe(true);
    expect(hasGlobalActualInput({ ...base, etActualTransferPricePerShare: "1" })).toBe(true);
    expect(hasGlobalActualInput({ ...base, etHasForeignTax: true })).toBe(true);
    expect(hasGlobalActualInput({ ...base, etDomesticSourceTaxWithheld: "1" })).toBe(true);
    expect(hasGlobalActualInput({ ...base, etActualTransferDate: "  " })).toBe(false);
  });

  it("holdingAllowsDomesticWithholding — 국내·내국법인 발행 국외주식만 (엔진 isDomesticIssuer와 같은 기준)", () => {
    expect(holdingAllowsDomesticWithholding(H1())).toBe(true);
    expect(holdingAllowsDomesticWithholding(F1())).toBe(false); // 외국법인 발행(기본)
    expect(holdingAllowsDomesticWithholding(F1({ isListedForeignCorp: false }))).toBe(true);
  });

  it("exitActual 팩토리는 매번 새 객체다", () => {
    expect(exitActual()).not.toBe(exitActual());
  });
});
