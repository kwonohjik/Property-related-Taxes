// F-1 — 하이브리드 4조문(§99의2·§98의3·§98의5·§98의6) 5년 경과 양도 기준시가 validate
//
// 하이브리드는 5년 이내=세액감면(기준시가 불요) / 5년 후=기준시가 안분 차감.
// 따라서 5년 분기 조건부로만 취득시·5년시점 기준시가를 차단한다(§99의3·§99 무조건 필수와 다름).
// 5년 분기는 houseType·조문 무관 공통(isWithin5YearsCheck) — §98의7과 동일 헬퍼.
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Std = { acq?: string; y5?: string };

function make992(houseType992: "new_or_unsold" | "self_built" | "existing_one_house", std: Std): AssetReductionForm {
  return {
    type: "unsold_99_2",
    houseType992,
    contractDate992: houseType992 === "self_built" ? "" : "2013-06-01",
    usageApprovalDate992: houseType992 === "self_built" ? "2013-06-01" : "",
    acquisitionPrice992: "550,000,000",
    exclusiveAreaSqm992: "84",
    standardPriceAtAcquisition992: std.acq ?? "",
    standardPriceAt5Years992: std.y5 ?? "",
  } as AssetReductionForm;
}

function make983(std: Std): AssetReductionForm {
  return {
    type: "unsold_98_3",
    residencyType983: "resident",
    houseType983: "purchased",
    contractDate983: "2009-06-01",
    isOverconcentration983: false,
    standardPriceAtAcquisition983: std.acq ?? "",
    standardPriceAt5Years983: std.y5 ?? "",
  } as AssetReductionForm;
}

function make985(std: Std): AssetReductionForm {
  return {
    type: "unsold_98_5",
    contractDate985: "2011-03-01",
    priceReductionRatePct985: "15",
    standardPriceAtAcquisition985: std.acq ?? "",
    standardPriceAt5Years985: std.y5 ?? "",
  } as AssetReductionForm;
}

function make986(hoType986: "seller_rented" | "buyer_rented", std: Std): AssetReductionForm {
  return {
    type: "unsold_98_6",
    hoType986,
    contractDate986: "2011-06-01",
    stdPriceSumAtBase986: "500,000,000",
    floorAreaSqm986: "100",
    rentalContractDate986: hoType986 === "buyer_rented" ? "2011-08-01" : "",
    rentalStartDate986: hoType986 === "buyer_rented" ? "2011-09-01" : "",
    standardPriceAtAcquisition986: std.acq ?? "",
    standardPriceAt5Years986: std.y5 ?? "",
  } as AssetReductionForm;
}

function makeForm(acqDate: string, transferDate: string, reduction: AssetReductionForm) {
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  form.assets[0] = { ...form.assets[0], acquisitionDate: acqDate, reductions: [reduction] };
  return form;
}

const OVER5Y = ["2014-06-01", "2022-08-01"] as const; // 약 8년
const WITHIN5Y = ["2019-06-01", "2022-08-01"] as const; // 약 3년
const FULL = { acq: "200,000,000", y5: "300,000,000" };

describe("[F-1] 하이브리드 4조문 5년 경과 기준시가 validate", () => {
  it("C1: §99의2 new_or_unsold 5년 초과 + 미입력 → 차단(취득시)", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make992("new_or_unsold", { y5: "300,000,000" })));
    expect(msg).toContain("취득시 기준시가");
  });

  it("C2: §99의2 self_built 5년 초과 + 입력 → 통과", () => {
    expect(validateStep(2, makeForm(...OVER5Y, make992("self_built", FULL)))).toBeNull();
  });

  it("C3: §99의2 existing_one_house 5년 이내 + 미입력 → 통과 (세액감면 경로)", () => {
    expect(validateStep(2, makeForm(...WITHIN5Y, make992("existing_one_house", {})))).toBeNull();
  });

  it("C4: §98의3 5년 초과 + 취득시만 입력 → 차단(5년시점)", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make983({ acq: "200,000,000" })));
    expect(msg).toContain("5년 시점 기준시가");
  });

  it("C5: §98의3 5년 이내 + 미입력 → 통과", () => {
    expect(validateStep(2, makeForm(...WITHIN5Y, make983({})))).toBeNull();
  });

  it("C6: §98의5 5년 초과 + 미입력 → 차단", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make985({})));
    expect(msg).toContain("§98의5");
    expect(msg).toContain("취득시 기준시가");
  });

  it("C7: §98의6 seller_rented(1호) 5년 초과 + 미입력 → 차단", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make986("seller_rented", {})));
    expect(msg).toContain("§98의6");
  });

  it("C8: §98의6 buyer_rented(2호) 5년 초과 + 미입력 → 차단 (2호=차감 전용)", () => {
    const msg = validateStep(2, makeForm(...OVER5Y, make986("buyer_rented", {})));
    expect(msg).toContain("§98의6");
    expect(msg).toContain("취득시 기준시가");
  });

  it("C9: §98의6 seller_rented 5년 이내 + 미입력 → 통과", () => {
    expect(validateStep(2, makeForm(...WITHIN5Y, make986("seller_rented", {})))).toBeNull();
  });

  it("C10: 정확히 5년차(당일) 양도는 5년 이내(세액감면)로 통과 — §99의2", () => {
    expect(validateStep(2, makeForm("2017-08-01", "2022-08-01", make992("new_or_unsold", {})))).toBeNull();
  });
});
