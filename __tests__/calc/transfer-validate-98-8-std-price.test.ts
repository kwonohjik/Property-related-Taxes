// §98의8 — 취득 후 5년 경과 양도의 안분 기준시가 ⑧ (계획서 `docs/00-pm/surcharge-oos-remaining.plan.md` B)
//
// ⑤(`Unsold988InputForm` 「취득일부터 5년이 지난 후 양도 시 필수」)는 필수라고 안내하는데 ⑧이 묻지 않아, 비우면 엔진이 `MISSING_STD_PRICE`로
// 차감을 0으로 냈다. 하이브리드(리뷰 Q-3 (A) · US-35)와 같은 헬퍼로 막는다. 5년 이내 양도는 양도소득금액 전액이 5년간 발생분이라 기준시가가 불요하다.
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

function make988(std: { acq?: string; y5?: string; transfer?: string }, over: Partial<AssetReductionForm> = {}): AssetReductionForm {
  return {
    type: "unsold_98_8",
    contractDate988: "2015-06-01",
    acquisitionPrice988: "550,000,000",
    exclusiveAreaSqm988: "84.5",
    rentalContractDate988: "2015-12-20",
    rentalStartDate988: "2016-01-01",
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    isResident988: true,
    standardPriceAtAcquisition988: std.acq ?? "",
    standardPriceAt5Years988: std.y5 ?? "",
    standardPriceAtTransfer988: std.transfer ?? "",
    ...over,
  } as AssetReductionForm;
}

function makeForm(acqDate: string, transferDate: string, reduction: AssetReductionForm, asset: Record<string, unknown> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  form.assets[0] = { ...form.assets[0], acquisitionDate: acqDate, reductions: [reduction], ...asset };
  return form;
}

const OVER5Y = ["2015-07-01", "2026-07-01"] as const;
const WITHIN5Y = ["2022-07-01", "2026-07-01"] as const;
const ALL = { acq: "200,000,000", y5: "300,000,000", transfer: "400,000,000" };

describe("§98의8 5년 경과 기준시가 ⑧", () => {
  it.each([
    ["취득시 기준시가", { y5: ALL.y5, transfer: ALL.transfer }],
    ["5년 시점 기준시가", { acq: ALL.acq, transfer: ALL.transfer }],
    ["양도시 기준시가", { acq: ALL.acq, y5: ALL.y5 }],
  ])("V-1: 🔴 5년 초과 양도 + %s 미입력 → 차단 (실가 모드 — 엔진에 실리는 자산값 없음)", (label, std) => {
    expect(validateStep(2, makeForm(...OVER5Y, make988(std)))).toContain(label);
  });

  it("V-2: 5년 초과 양도 + 3시점 모두 입력 → 통과", () => {
    expect(validateStep(2, makeForm(...OVER5Y, make988(ALL)))).toBeNull();
  });

  it("V-3: 5년 이내 양도 + 기준시가 미입력 → 통과", () => {
    expect(validateStep(2, makeForm(...WITHIN5Y, make988({})))).toBeNull();
  });

  it("V-4: 환산 모드 — 양도시 칸을 비워도 ④가 자산 양도시 기준시가를 싣으면 통과(엔진 `?? ctx.standardPriceAtTransfer`와 같은 값)", () => {
    const form = makeForm(...OVER5Y, make988({ acq: ALL.acq, y5: ALL.y5 }), {
      useEstimatedAcquisition: true,
      standardPriceAtAcq: "150,000,000",
      standardPriceAtTransfer: "400,000,000",
    });
    expect(validateStep(2, form)).toBeNull();
  });

  it("V-5: PHD 환산 ON인데 환산 입력이 모자라면 차단 — §98의7과 같은 규칙", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make988({ y5: ALL.y5, transfer: ALL.transfer }, { phdMode988: true } as Partial<AssetReductionForm>)));
    expect(msg).toContain("§98의8 PHD 환산 모드");
  });
});
