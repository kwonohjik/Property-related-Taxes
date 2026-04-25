import { describe, it, expect } from "vitest";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

const baseDefault = createDefaultTransferFormData();

describe("migrateLegacyForm — Step1·Step3 통합 마이그레이션", () => {
  it("legacy acquisitionMethod='appraisal' + appraisalValue → assets[0].isAppraisalAcquisition + fixedAcquisitionPrice", () => {
    const legacy = {
      acquisitionMethod: "appraisal",
      appraisalValue: "300000000",
      propertyType: "housing",
    };
    const result = migrateLegacyForm(legacy, baseDefault);
    expect(result.assets[0].isAppraisalAcquisition).toBe(true);
    expect(result.assets[0].fixedAcquisitionPrice).toBe("300000000");
  });

  it("legacy isSelfBuilt=true + buildingType='new' → assets[0]로 이전", () => {
    const legacy = {
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: "2020-05-15",
      propertyType: "building",
    };
    const result = migrateLegacyForm(legacy, baseDefault);
    expect(result.assets[0].isSelfBuilt).toBe(true);
    expect(result.assets[0].buildingType).toBe("new");
    expect(result.assets[0].constructionDate).toBe("2020-05-15");
  });

  it("legacy buildingType='extension' + extensionFloorArea → assets[0]", () => {
    const legacy = {
      isSelfBuilt: true,
      buildingType: "extension",
      constructionDate: "2021-08-01",
      extensionFloorArea: "85.5",
      propertyType: "housing",
    };
    const result = migrateLegacyForm(legacy, baseDefault);
    expect(result.assets[0].isSelfBuilt).toBe(true);
    expect(result.assets[0].buildingType).toBe("extension");
    expect(result.assets[0].extensionFloorArea).toBe("85.5");
  });

  it("legacy pre1990Enabled + 7필드 → assets[0]로 이전", () => {
    const legacy = {
      pre1990Enabled: true,
      pre1990PricePerSqm_1990: "10000",
      pre1990PricePerSqm_atTransfer: "241700",
      pre1990Grade_current: "108",
      pre1990Grade_prev: "103",
      pre1990Grade_atAcq: "103",
      pre1990GradeMode: "number",
      propertyType: "land",
    };
    const result = migrateLegacyForm(legacy, baseDefault);
    expect(result.assets[0].pre1990Enabled).toBe(true);
    expect(result.assets[0].pre1990PricePerSqm_1990).toBe("10000");
    expect(result.assets[0].pre1990PricePerSqm_atTransfer).toBe("241700");
    expect(result.assets[0].pre1990Grade_current).toBe("108");
    expect(result.assets[0].pre1990Grade_prev).toBe("103");
    expect(result.assets[0].pre1990Grade_atAcq).toBe("103");
    expect(result.assets[0].pre1990GradeMode).toBe("number");
  });

  it("legacy 빈 객체 → 기본값 + 자산 1개", () => {
    const result = migrateLegacyForm({ propertyType: "housing" }, baseDefault);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].isAppraisalAcquisition).toBe(false);
    expect(result.assets[0].isSelfBuilt).toBe(false);
    expect(result.assets[0].pre1990Enabled).toBe(false);
  });
});
