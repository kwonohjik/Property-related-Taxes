/**
 * @vitest-environment jsdom
 *
 * A2 ⑧ — 일반건물 감정가액·매매사례가액 validate 신규 규칙 + **막다른 오류 금지**(앵커 렌더 대조)
 *
 * 설계서 §4.1: R1(감정 파트 금액 문구) · R2(매매사례 파트 금액) · R3(감정·매매사례 파트 기준시가) · R5(자산 단위 매매사례 → similarSalesValue)
 *            · R8(이월과세 파트 × 감정·매매사례) · R9(증축 × 자산 단위 감정·매매사례, Q-A3 사용자 확정)
 *
 * 각 규칙은 ① 차단 메시지(지정값 prefix, 범위 단언 금지) ② 긍정 짝(통과해야 하는 조합) ③ 그 field가 화면에 **실제 렌더**되는지를 본다.
 * 서버 ⑫ refine(`GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE`)과 R9 문구가 같은 문자열인지도 고정한다(UI 통과 ↔ 서버 400 문구 불일치 방지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE } from "@/lib/api/transfer-tax-schema-required-refines-gb";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";

function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: LAND,
    acquisitionDate: BUILDING,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "120000000",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}
const CARRYOVER_EVENT = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2020-05-01",
  giftTaxCalculated: "30,000,000",
  giftTaxBase: "500,000,000",
  donorAcquisitionDate: "2010-03-01",
  donorAcquisitionPrice: "200,000,000",
  giftDateValuation: "300,000,000",
  donorRelation: "spouse",
};
const STD = { gbAcqLandPricePerSqm: "2800000", gbAcqBuildingValue: "2814470" };
const run = (a: AssetForm) => collectWithFields(() => validateGeneralBuildingAsset(a, "자산1", "2026-02-16"));

/** 오류의 field가 화면(취득 카드 + 일반건물 블록)에 data-field 앵커로 **실제 존재**하는지 — 막다른 오류 금지. */
function anchorRendered(a: AssetForm, field: string): boolean {
  render(
    <>
      <GeneralBuildingAcquisitionCards asset={a} onChange={() => {}} transferDate="2026-02-16" />
      <GeneralBuildingBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />
    </>,
  );
  return document.querySelector(`[data-field="${field}"]`) !== null;
}

describe("R1 — 실가·감정 파트 금액 (매매사례는 이 칸을 요구하지 않는다)", () => {
  it("감정 파트 미입력 → 「감정가액을 입력하세요」, field = landAcquisitionPrice, 앵커 렌더", () => {
    const a = base({ landAcqMode: "appraisal", landAcquisitionPrice: "", ...STD });
    const { result, fieldOf } = run(a);
    expect(result).toMatch(/^자산1: 토지 감정가액을 입력하세요\. 별개 취득이라 총액에서 자동 계산되지 않습니다/);
    expect(fieldOf(result!)).toBe("landAcquisitionPrice");
    expect(anchorRendered(a, "landAcquisitionPrice")).toBe(true);
  });

  it("(긍정 짝) 실가 파트 미입력은 종전 「취득가액을 입력하세요」 문구", () => {
    expect(run(base({ buildingAcquisitionPrice: "" })).result).toMatch(/^자산1: 건물 취득가액을 입력하세요/);
  });

  it("매매사례 파트는 `*AcquisitionPrice`를 요구하지 않는다 — 거짓 차단 제거 (값이 있으면 통과)", () => {
    const a = base({ landAcqMode: "salesCase", landAcquisitionPrice: "", landSalesCaseValue: "310000000", ...STD });
    expect(run(a).result).toBeNull();
  });
});

describe("R2 — 매매사례 파트의 매매사례가액", () => {
  it("미입력 → field = landSalesCaseValue / buildingSalesCaseValue, 앵커 렌더", () => {
    const land = base({ landAcqMode: "salesCase", landAcquisitionPrice: "", landSalesCaseValue: "", ...STD });
    const r = run(land);
    expect(r.result).toMatch(/^자산1: 토지 매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라/);
    expect(r.fieldOf(r.result!)).toBe("landSalesCaseValue");
    expect(anchorRendered(land, "landSalesCaseValue")).toBe(true);
    cleanup();
    const bld = base({ buildingAcqMode: "salesCase", buildingAcquisitionPrice: "", buildingSalesCaseValue: "", ...STD });
    const r2 = run(bld);
    expect(r2.result).toMatch(/^자산1: 건물 매매사례가액을 입력하세요/);
    expect(r2.fieldOf(r2.result!)).toBe("buildingSalesCaseValue");
    expect(anchorRendered(bld, "buildingSalesCaseValue")).toBe(true);
  });

  it("(긍정 짝) 값이 있으면 통과", () => {
    expect(run(base({ landAcqMode: "salesCase", landSalesCaseValue: "310000000", ...STD })).result).toBeNull();
  });
});

describe("R3 — 감정·매매사례 파트의 취득시 기준시가 (칸이 열려 있어야 요구할 수 있다)", () => {
  it.each([
    ["토지 감정", { landAcqMode: "appraisal" }, "gbAcqLandPricePerSqm", /^자산1: 취득시 토지 공시지가를 입력하세요/],
    ["건물 감정", { buildingAcqMode: "appraisal" }, "gbAcqBuildingValue", /^자산1: 취득시 건물기준시가 총액을 입력하세요/],
    ["건물 매매사례", { buildingAcqMode: "salesCase", buildingSalesCaseValue: "120000000" }, "gbAcqBuildingValue", /^자산1: 취득시 건물기준시가 총액을 입력하세요/],
  ] as const)("%s — 기준시가 요구 + 그 칸 앵커가 렌더된다", (_n, over, field, msg) => {
    const a = base({ ...over, gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" } as Partial<AssetForm>);
    const { result, fieldOf } = run(a);
    expect(result).toMatch(msg);
    expect(fieldOf(result!)).toBe(field);
    expect(anchorRendered(a, field)).toBe(true);
  });
});

describe("R5 — 분리 OFF 자산 단위 (I3′)", () => {
  const off = (over: Partial<AssetForm>) =>
    base({ hasSeperateLandAcquisitionDate: false, landAcquisitionDate: BUILDING, landAcqMode: "", buildingAcqMode: "", landAcquisitionPrice: "", buildingAcquisitionPrice: "", fixedAcquisitionPrice: "", ...STD, ...over });

  it("매매사례 미입력 → similarSalesValue(필드·문구) — 그 칸이 렌더된다", () => {
    const a = off({ isSalesCaseAcquisition: true });
    const { result, fieldOf } = run(a);
    expect(result).toMatch(/^자산1: 매매사례가액을 입력하세요\. 토지·건물 일괄 매매사례가액입니다/);
    expect(fieldOf(result!)).toBe("similarSalesValue");
    expect(anchorRendered(a, "similarSalesValue")).toBe(true);
  });

  it("감정 미입력 → fixedAcquisitionPrice 「감정가액을 입력하세요」 — 그 칸이 렌더된다", () => {
    const a = off({ isAppraisalAcquisition: true });
    const { result, fieldOf } = run(a);
    expect(result).toMatch(/^자산1: 감정가액을 입력하세요\. 토지·건물 일괄 실지거래가액입니다/);
    expect(fieldOf(result!)).toBe("fixedAcquisitionPrice");
    expect(anchorRendered(a, "fixedAcquisitionPrice")).toBe(true);
  });

  it("(긍정 짝) 값이 있으면 통과 — 감정 fixedAcquisitionPrice · 매매사례 similarSalesValue", () => {
    expect(run(off({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "410000000" })).result).toBeNull();
    expect(run(off({ isSalesCaseAcquisition: true, similarSalesValue: "420000000" })).result).toBeNull();
  });
});

describe("R8 — 이월과세 파트 × 감정·매매사례 (stale 방어)", () => {
  const CARRY = {
    acquisitionCause: "carryover_gift",
    gbBuildingAcquisitionCause: "carryover_gift",
    carryover: CARRYOVER_EVENT,
    buildingCarryover: { ...CARRYOVER_EVENT, giftDateValuation: "150,000,000" },
  } as unknown as Partial<AssetForm>;

  it("분리 ON 토지 감정 → 차단, field = landAcqMode, 앵커(필터 후 라디오 FieldCard)가 렌더된다", () => {
    const a = base({ ...CARRY, landAcqMode: "appraisal", ...STD });
    const { result, fieldOf } = run(a);
    expect(result).toBe(
      "자산1: 이월과세로 취득한 토지는 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 이월과세는 증여자의 취득가액을 승계합니다 (소득세법 §97의2①). 「실거래가」를 선택하세요.",
    );
    expect(fieldOf(result!)).toBe("landAcqMode");
    expect(anchorRendered(a, "landAcqMode")).toBe(true);
  });

  it("분리 ON 건물 매매사례 → 차단, field = buildingAcqMode", () => {
    const a = base({ ...CARRY, buildingAcqMode: "salesCase", ...STD });
    const { result, fieldOf } = run(a);
    expect(result).toMatch(/^자산1: 이월과세로 취득한 건물은 취득가액을/);
    expect(fieldOf(result!)).toBe("buildingAcqMode");
  });

  it("(긍정 짝) 이월과세 × 실거래가·환산취득가는 R8이 막지 않는다 — 현행 경로 유지", () => {
    for (const m of ["actual", "estimated"] as const) {
      const msg = run(base({ ...CARRY, landAcqMode: m, buildingAcqMode: m, ...STD })).result;
      expect(msg ?? "").not.toMatch(/이월과세로 취득한/);
    }
  });

  it("(긍정 짝) 매매 파트의 감정은 R8 대상이 아니다", () => {
    expect(run(base({ landAcqMode: "appraisal", ...STD })).result ?? "").not.toMatch(/이월과세로 취득한/);
  });
});

describe("R9 — 증축 × 자산 단위 감정·매매사례 (Q-A3 사용자 확정 — 차단)", () => {
  const EXT = { gbHasExtension: true, hasSeperateLandAcquisitionDate: false, landAcquisitionDate: BUILDING, landAcqMode: "", buildingAcqMode: "", landAcquisitionPrice: "", buildingAcquisitionPrice: "", ...STD } as Partial<AssetForm>;

  it.each([{ isAppraisalAcquisition: true }, { isSalesCaseAcquisition: true }])("%o → 차단, 문구는 ⑫ refine과 같다, 앵커(자산 단위 라디오)가 렌더된다", (flag) => {
    const a = base({ ...EXT, ...flag, fixedAcquisitionPrice: "410000000", similarSalesValue: "420000000" });
    const { result, fieldOf } = run(a);
    expect(result).toBe(`자산1: ${GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE}`);
    expect(fieldOf(result!)).toBe("useEstimatedAcquisition");
    expect(anchorRendered(a, "useEstimatedAcquisition")).toBe(true);
  });

  it("(긍정 짝) 증축 × 분리 ON 파트 감정은 막지 않는다 — 파트 값이 있어 3파트 경로가 처리", () => {
    const a = base({ gbHasExtension: true, landAcqMode: "appraisal", ...STD, gbExtensionDate: "2020-05-01", gbExtensionAcquisitionCause: "purchase", gbExtensionAcquisitionMode: "actual", gbTransferExtensionBuildingStdPrice: "5000000", gbExtensionActualAcquisitionPrice: "50000000" });
    expect(run(a).result ?? "").not.toMatch(/원건물 취득가액을 감정가액·매매사례가액으로/);
  });

  it("(긍정 짝) 증축 × 자산 단위 실거래가는 종전대로 일괄 취득가액 요구(R9 아님)", () => {
    const a = base({ ...EXT, fixedAcquisitionPrice: "" });
    expect(run(a).result ?? "").not.toMatch(/감정가액·매매사례가액으로 산정할 수 없습니다/);
  });
});

describe("V-2 상속·증여 파트 × 감정 (기존 anchor 유지 — 변경 없음)", () => {
  it("상속 토지 + 감정 → 기존 차단 문구", () => {
    const a = base({ acquisitionCause: "inheritance", landAcqMode: "appraisal", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "100000000" });
    expect(run(a).result).toMatch(/상속으로 취득한 토지는 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다/);
  });
});
