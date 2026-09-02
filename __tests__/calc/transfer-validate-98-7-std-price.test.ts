// 리뷰 M-4 — §98의7 취득 후 5년 경과 양도 시 기준시가 validate
//
// 5년 후 양도는 5년 발생분 기준시가 안분(조특령 §40① 준용) 경로 → 취득시·5년시점 기준시가 필수.
// 미입력 시 엔진이 MISSING_STD_PRICE로 감면을 부적격 처리(조용한 미적용)하므로 validate가 미리 차단.
// 5년 이내 양도는 세액감면 경로라 기준시가 불요.
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

function make987(stdPrices: { acq?: string; y5?: string; transfer?: string }): AssetReductionForm {
  return {
    type: "unsold_98_7",
    contractDate987: "2012-10-15",
    acquisitionPrice987: "550,000,000",
    isUnsoldAtCutoff987: true,
    isFirstContract987: true,
    isNotOccupiedAtContract987: true,
    isNotRecontract987: true,
    // D11-05 — 법 §98의7① 「내국인이 …」 적용 주체 요건 (조특법 §2①1호)
    isDomestic987: true,
    standardPriceAtAcquisition987: stdPrices.acq ?? "",
    standardPriceAt5Years987: stdPrices.y5 ?? "",
    standardPriceAtTransfer987: stdPrices.transfer ?? "",
  };
}

/** acq·transfer 일자와 §98의7 reduction을 갖춘 step2 폼 */
function makeForm(acqDate: string, transferDate: string, reduction: AssetReductionForm) {
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  form.assets[0] = {
    ...form.assets[0],
    acquisitionDate: acqDate,
    reductions: [reduction],
  };
  return form;
}

describe("[M-4] §98의7 5년 경과 기준시가 validate", () => {
  it("M4-1: 5년 초과 양도 + 취득시 기준시가 미입력 → 차단", () => {
    const form = makeForm("2014-06-01", "2022-08-01", make987({ y5: "300,000,000", transfer: "400,000,000" }));
    const msg = validateStep(2, form);
    expect(msg).not.toBeNull();
    expect(msg).toContain("취득시 기준시가");
  });

  it("M4-2: 5년 초과 양도 + 5년시점 기준시가 미입력 → 차단", () => {
    const form = makeForm("2014-06-01", "2022-08-01", make987({ acq: "200,000,000", transfer: "400,000,000" }));
    const msg = validateStep(2, form);
    expect(msg).not.toBeNull();
    expect(msg).toContain("5년 시점 기준시가");
  });

  it("M4-3: 5년 초과 양도 + 취득시·5년시점 기준시가 입력 → 통과 (양도시는 fallback)", () => {
    const form = makeForm("2014-06-01", "2022-08-01", make987({ acq: "200,000,000", y5: "300,000,000" }));
    expect(validateStep(2, form)).toBeNull();
  });

  it("M4-4: 5년 이내 양도 + 기준시가 미입력 → 통과 (세액감면 경로 — 기준시가 불요)", () => {
    const form = makeForm("2019-06-01", "2022-08-01", make987({}));
    expect(validateStep(2, form)).toBeNull();
  });

  it("M4-5: 5년 이내 경계 — 취득 후 정확히 5년차 양도는 5년 이내(세액감면)로 통과", () => {
    const form = makeForm("2017-08-01", "2022-08-01", make987({}));
    expect(validateStep(2, form)).toBeNull();
  });
});
