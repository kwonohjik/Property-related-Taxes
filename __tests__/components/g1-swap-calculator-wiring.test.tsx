/** @vitest-environment jsdom */
/**
 * G1 — `TransferTaxCalculator` → `Step1` 배선: 교환 클릭이 **스토어의 result를 비운다**(`onInvalidateResult` = `clearResult`) · 다건 임베드(`/multi`)에서는 카드를 숨긴다.
 * 사이드바 `computeTransferPerAssetSummary(formData, result)`가 결과의 «첫 자산»(`primary`) 매칭을 읽으므로, 순서가 바뀌면 옛 결과가 새 첫 자산에 붙는다.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/calc/transfer-tax" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import TransferTaxCalculator from "@/app/calc/transfer-tax/TransferTaxCalculator";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { HOUSE, LAND, form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";

afterEach(cleanup);
beforeEach(() => {
  nav.pathname = "/calc/transfer-tax";
  useCalcWizardStore.getState().reset();
});

const seed = () =>
  useCalcWizardStore.setState({
    formData: form(LAND("l1", 300), HOUSE(0)),
    result: { mode: "single", sentinel: "old-result" } as never,
    currentStep: 0,
  });

describe("TransferTaxCalculator 배선", () => {
  it("🔑 교환 클릭 → 순서가 바뀌고 스토어 result가 비워진다", () => {
    seed();
    render(<TransferTaxCalculator />);
    expect(useCalcWizardStore.getState().result).not.toBeNull();
    fireEvent.click(screen.getByTestId("reverse-appurtenant-swap-button"));
    const s = useCalcWizardStore.getState();
    expect(s.formData.assets.map((a) => a.assetId)).toEqual(["h1", "l1"]);
    expect(s.result).toBeNull();
  });

  it("교환을 누르지 않으면 result를 비우지 않는다(교환에만 한정)", () => {
    seed();
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("reverse-appurtenant-swap-button")).not.toBeNull();
    expect(useCalcWizardStore.getState().result).not.toBeNull();
  });

  it("다건 임베드(/multi)에서는 카드를 숨긴다", () => {
    nav.pathname = "/calc/transfer-tax/multi";
    seed();
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("reverse-appurtenant-swap-notice")).toBeNull();
  });
});
