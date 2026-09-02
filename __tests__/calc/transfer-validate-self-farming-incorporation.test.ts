// #20 validate — 자경 편입 부분감면(영 §66⑦) 기준시가 3점 필수 + §66④1호 소재지 필수(D7-07).
// 엔진 silent-0 도달 조건(편입 ON + 2002후 + 유예 내 + 3점 결손)을 정밀 미러하여
// 계산 전 차단. 2002 전 편입·3년 경과는 엔진이 별도 처리하므로 차단 금지(UI↔validate 모순 방지).
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

function makeSF(overrides: Partial<Extract<AssetReductionForm, { type: "self_farming" }>> = {}): AssetReductionForm {
  return {
    type: "self_farming",
    farmingYears: "8",
    useSelfFarmingIncorporation: true,
    selfFarmingIncorporationDate: "2020-02-14",
    selfFarmingIncorporationZone: "residential",
    // §66④1호 3년 배제 판정에 필요 — 3년 경과 케이스에서만 요구된다 (D7-07)
    selfFarmingIncorporationLocation: "metro_or_city",
    selfFarmingStandardPriceAtIncorporation: "",
    selfFarmingStandardPriceAtAcquisition: "",
    selfFarmingStandardPriceAtTransfer: "",
    ...overrides,
  };
}

function makeForm(reduction: AssetReductionForm, opts: { transferDate?: string; assetStdAcq?: string; assetStdTransfer?: string } = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = opts.transferDate ?? "2022-06-01"; // 편입 2020-02-14 + 3년 이내
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionDate: "2010-01-01",
    standardPriceAtAcq: opts.assetStdAcq ?? "",
    standardPriceAtTransfer: opts.assetStdTransfer ?? "",
    reductions: [reduction],
  };
  return form;
}

const msg = "편입일 부분감면";

describe("[#20] 자경 편입 부분감면 기준시가 3점 validate", () => {
  it("SF-V1: 편입 ON + 2002후 + 유예 내 + 3점 결손 → 차단", () => {
    const issue = validateStep(2, makeForm(makeSF()));
    expect(issue).toContain(msg);
  });

  it("SF-V2: reduction 3점 완비 → 통과", () => {
    const issue = validateStep(2, makeForm(makeSF({
      selfFarmingStandardPriceAtIncorporation: "3,000",
      selfFarmingStandardPriceAtAcquisition: "1,000",
      selfFarmingStandardPriceAtTransfer: "4,000",
    })));
    expect(issue).toBeNull();
  });

  it("SF-V3: 2002 전 편입 → 통과(부분감면 산식 미적용, 차단 금지)", () => {
    const issue = validateStep(2, makeForm(makeSF({ selfFarmingIncorporationDate: "2001-06-01" })));
    expect(issue).toBeNull();
  });

  it("SF-V3b (D7-07): 3년 경과 + 소재지 미선택 → 차단 (엔진 «판정 불가»와 대칭)", () => {
    const issue = validateStep(
      2,
      makeForm(makeSF({ selfFarmingIncorporationLocation: "" }), { transferDate: "2024-01-01" }),
    );
    expect(issue).toContain("소재지 구분");
  });

  it("SF-V3c (D7-07): 3년 «이내»면 소재지 미선택이어도 차단하지 않는다", () => {
    const issue = validateStep(
      2,
      makeForm(
        makeSF({
          selfFarmingIncorporationLocation: "",
          selfFarmingStandardPriceAtIncorporation: "3,000",
          selfFarmingStandardPriceAtAcquisition: "1,000",
          selfFarmingStandardPriceAtTransfer: "4,000",
        }),
      ),
    );
    expect(issue).toBeNull();
  });

  it("SF-V4: 편입일+3년 경과 양도 → 통과(엔진 별도 상실, 차단 금지)", () => {
    // 편입 2020-02-14 + 3년 = 2023-02-14. 양도 2024-01-01(경과) → 차단 안 함
    const issue = validateStep(2, makeForm(makeSF(), { transferDate: "2024-01-01" }));
    expect(issue).toBeNull();
  });

  it("SF-V5: 편입 OFF → 통과", () => {
    const issue = validateStep(2, makeForm(makeSF({ useSelfFarmingIncorporation: false })));
    expect(issue).toBeNull();
  });

  it("SF-V6: 환산 자산 기준시가 존재(reduction 공란) → 통과(자산 fallback)", () => {
    const issue = validateStep(2, makeForm(
      makeSF({ selfFarmingStandardPriceAtIncorporation: "3,000" }),
      { assetStdAcq: "1,000", assetStdTransfer: "4,000" },
    ));
    expect(issue).toBeNull();
  });
});
