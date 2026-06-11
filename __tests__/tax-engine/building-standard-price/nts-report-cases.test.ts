/**
 * Pre-Do anchor — 국세청 「건물 기준시가 계산서」 작성례 3건 (교재 p.75~80)
 *
 * 설계: docs/02-design/features/building-std-price-nts-report.engine.design.md
 * 목적: Do 진입 전 PDF 원단위 anchor로 ① 복합 산식의 PDF 재현성 ② G-1(양도 복합 미라우팅) 실증.
 *
 * A-1·A-2·A-3math·A-4math: 현행 inheritance_gift 복합 경로로 PDF ⑪ 재현 → 데이터·산식 정합 확정.
 * A-3gap: 양도 모드 compositeParts 무시(G-1) 실증. A-5: ※ 산정기준율 데이터 probe.
 *
 * ⚠️ Pre-Do 단계 — "현행 일치 예상" 단정 금지. 실행 결과로 갭을 확정하고 설계에 환류한다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "../../../lib/tax-engine/building-standard-price";
import type {
  BuildingStandardPriceInput,
  BuildingCompositePart,
} from "../../../lib/tax-engine/types/building-standard-price.types";
import {
  resolveAcqBaseRate,
  resolveAdjustmentRateByNo,
} from "../../../lib/tax-engine/data/building-standard-price";

/** case(1)(3) 2023 공통: rc·종로 공시지가 2,500,000(위치지수 1.16)·2000 신축(잔가율 0.586) */
const parts2023 = (withAdj: boolean, withShared: boolean): BuildingCompositePart[] => [
  {
    label: "지상1",
    structureKey: "rc",
    usageNo: 41, // 근린생활시설(2023)
    floorArea: 100,
    adjustmentRate: withAdj ? 108 : undefined, // 0.9(9)×1.2(20)=1.08
    sharedAdjustmentRate: withShared ? (withAdj ? 54 : 100) : undefined, // 0.9×0.6=0.54 / 양도 1.0
  },
  {
    label: "지상2",
    structureKey: "rc",
    usageNo: 2, // 단독주택(2023)
    floorArea: 100,
    adjustmentRate: undefined,
    sharedAdjustmentRate: withShared ? (withAdj ? 60 : 100) : undefined, // 0.6(24) / 양도 1.0
  },
  {
    label: "지상3",
    structureKey: "rc",
    usageNo: 2,
    floorArea: 100,
    adjustmentRate: undefined,
    sharedAdjustmentRate: withShared ? (withAdj ? 60 : 100) : undefined,
  },
];

/** case(2) 2001 취득당시: 근생 #27(용도지수 0.9)·단독 #1·공시지가 2,240,000(1.05)·잔가율 0.98 */
const parts2001 = (withShared: boolean): BuildingCompositePart[] => [
  { label: "지상1", structureKey: "rc", usageNo: 27, floorArea: 100, sharedAdjustmentRate: withShared ? 100 : undefined },
  { label: "지상2", structureKey: "rc", usageNo: 1, floorArea: 100, sharedAdjustmentRate: withShared ? 100 : undefined },
  { label: "지상3", structureKey: "rc", usageNo: 1, floorArea: 100, sharedAdjustmentRate: withShared ? 100 : undefined },
];

const baseInh = (
  year: number,
  landPrice: number,
  parts: BuildingCompositePart[],
  sharedFacilityArea: number,
): BuildingStandardPriceInput => ({
  taxType: "inheritance_gift",
  floorArea: 300,
  builtYear: 2000,
  valuationYear: year,
  valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: landPrice },
  compositeParts: parts,
  sharedFacilityArea,
});

describe("NTS 계산서 작성례 — Pre-Do anchor (복합 산식 PDF 재현)", () => {
  it("A-1: 상속 복합 Ⅲ합(조정률 적용, 부속 제외) = 171,500,000 [작성례(3) p.79]", () => {
    const r = calcBuildingStandardPrice(baseInh(2023, 2500000, parts2023(true, false), 0));
    // 지상1 601,000×100=60,100,000 / 지상2·3 557,000×100=55,700,000
    expect(r.compositeTotal).toBe(171_500_000);
    const g1 = r.compositeBreakdowns?.find((b) => b.label === "지상1");
    expect(g1?.pricePerM2).toBe(601_000);
  });

  it("A-2: 상속 복합 ⑪(부속 종류별 합산) = 200,540,000 [작성례(3) p.80]", () => {
    const r = calcBuildingStandardPrice(baseInh(2023, 2500000, parts2023(true, true), 90));
    // Ⅲ합 171,500,000 + Ⅳ합 29,040,000(슈퍼 30㎡@300,000 + 주택 60㎡@334,000)
    expect(r.compositeTotal).toBe(200_540_000);
  });

  it("A-3math: 양도당시 복합 ⑪(조정률 미적용) = 217,230,000 [작성례(1) p.75~76]", () => {
    // 양도당시 = 2023 복합 NO 조정률 + 부속(조정률 1.0). 산식 재현(라우팅은 Do)
    const r = calcBuildingStandardPrice(baseInh(2023, 2500000, parts2023(false, true), 90));
    // Ⅲ합 167,100,000(557,000×300) + Ⅳ합 50,130,000(557,000×90)
    expect(r.compositeTotal).toBe(217_230_000);
  });

  it("A-4math: 취득당시(2001) 복합 ⑪ = 154,960,000 [작성례(2) p.77~78]", () => {
    const r = calcBuildingStandardPrice(baseInh(2001, 2240000, parts2001(true), 90));
    // Ⅲ합 119,200,000(근생 370,000 + 단독 411,000×2) + Ⅳ합 35,760,000
    expect(r.compositeTotal).toBe(154_960_000);
    const g1 = r.compositeBreakdowns?.find((b) => b.label === "지상1");
    expect(g1?.pricePerM2).toBe(370_000); // 근생 #27 용도지수 0.9
  });

  it("A-5: ※ 산정기준율 환산 = 157,439,360 [작성례(2) p.78]", () => {
    // (1)154,960,000 × (2)산정기준율 1.016 = (3)157,439,360
    const rate = resolveAcqBaseRate("I", 2000, 2000);
    expect(rate).toBe(1.016);
    expect(Math.floor(154_960_000 * rate!)).toBe(157_439_360);
  });
});

describe("NTS 계산서 — 양도 복합 라우팅 (G-1·G-5 해소, 신규 API)", () => {
  // 작성례(1)+(2) 세트: 양도당시 2023(2,500,000)·취득당시 2000.2.1(≤2000, 2001 지수표 2,240,000)
  const transferParts: BuildingCompositePart[] = [
    { label: "지상1", structureKey: "rc", usageNo: 41, acqUsageNo: 27, floorArea: 100 }, // 근생: 2023 #41 / 2001 #27
    { label: "지상2", structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 100 }, // 단독: 2023 #2 / 2001 #1
    { label: "지상3", structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 100 },
  ];
  const transferInput: BuildingStandardPriceInput = {
    taxType: "transfer",
    floorArea: 300,
    builtYear: 2000,
    transferYear: 2023,
    acquisitionYear: 2000, // ≤2000 → ※ 산정기준율
    transfer: { structureKey: "", usageNo: 0, landPricePerM2: 2_500_000 },
    acquisition: { structureKey: "", usageNo: 0, landPricePerM2: 2_240_000 },
    compositeParts: transferParts,
    sharedFacilityArea: 90,
  };

  it("A-3: 양도당시 복합 ⑪ = 217,230,000 [작성례(1)]", () => {
    const r = calcBuildingStandardPrice(transferInput);
    expect(r.transferComposite?.total).toBe(217_230_000); // Ⅲ 167,100,000 + Ⅳ 50,130,000
  });

  it("A-4: 취득당시(2001) 복합 ⑪ = 154,960,000 [작성례(2)]", () => {
    const r = calcBuildingStandardPrice(transferInput);
    expect(r.acquisitionComposite?.total).toBe(154_960_000); // 2001 기준(근생 #27 용도지수 0.9)
  });

  it("A-5: ※ 산정기준율 환산 = 157,439,360 [작성례(2)]", () => {
    const r = calcBuildingStandardPrice(transferInput);
    expect(r.acqBaseConversion?.acqBaseRate).toBe(1.016);
    expect(r.acqBaseConversion?.total2001).toBe(154_960_000);
    expect(r.acqBaseConversion?.convertedTotal).toBe(157_439_360);
  });

  it("양도 복합 — 조정률 입력 시 차단(고시: 조정률은 상증만)", () => {
    expect(() =>
      calcBuildingStandardPrice({ ...transferInput, compositeParts: [{ ...transferParts[0], adjustmentRate: 108 }, transferParts[1], transferParts[2]] }),
    ).toThrow(/조정률은 상속·증여/);
  });

  it("양도 복합 — 취득시 용도 미입력 차단(연도별 용도체계 상이)", () => {
    const noAcq = transferParts.map((p) => ({ ...p, acqUsageNo: undefined }));
    expect(() => calcBuildingStandardPrice({ ...transferInput, compositeParts: noAcq })).toThrow(/취득시 용도/);
  });

  it("양도 복합 + 동일연도(§164⑧) → 차단(범위 외)", () => {
    expect(() =>
      calcBuildingStandardPrice({ ...transferInput, acquisitionYear: 2023, acquisition: { structureKey: "", usageNo: 0, landPricePerM2: 2_500_000 } }),
    ).toThrow(/동일연도.*복합/);
  });
});

describe("NTS 계산서 — 조정률 번호 API + echo (G-3·G-4)", () => {
  it("상증 복합 adjustmentNos = 작성례(3) ⑪ 200,540,000 (현행 % API와 동일값)", () => {
    // 지상1 근생 조정 9(0.9)·20(1.2) / 공용 9·24(0.54) → 주택 공용 24(0.6)
    const parts: BuildingCompositePart[] = [
      { label: "지상1", structureKey: "rc", usageNo: 41, floorArea: 100, adjustmentNos: [9, 20], sharedAdjustmentNos: [9, 24] },
      { label: "지상2", structureKey: "rc", usageNo: 2, floorArea: 100, sharedAdjustmentNos: [24] },
      { label: "지상3", structureKey: "rc", usageNo: 2, floorArea: 100, sharedAdjustmentNos: [24] },
    ];
    const r = calcBuildingStandardPrice(baseInh(2023, 2500000, parts, 90));
    expect(r.compositeTotal).toBe(200_540_000);
    // G-3 echo: 지상1 주용도 조정률 번호 9·20
    const g1 = r.compositeBreakdowns?.find((b) => b.label === "지상1");
    expect(g1?.adjustmentItems?.map((x) => x.nos[0])).toEqual([9, 20]);
    // G-4 echo: 잔가율 그룹·내용연수 (2023 rc = I그룹 50년)
    expect(g1?.residualGroup).toBe("I");
    expect(g1?.durableYears).toBe(50);
    // 부속 종류 echo
    const apport = r.ancillaryApportionment;
    expect(apport?.totalByKind.other).toBe(90);
  });
});

describe("NTS 계산서 — resolveAdjustmentRateByNo 데이터 (케이스 7)", () => {
  it("번호 → 지수 매핑(분산 테이블 단일 출처)", () => {
    expect(resolveAdjustmentRateByNo(9)).toBe(90); // 연면적 1천㎡ 미만
    expect(resolveAdjustmentRateByNo(20)).toBe(120); // 상가 1층
    expect(resolveAdjustmentRateByNo(24)).toBe(60); // 주차장·기계실
    expect(resolveAdjustmentRateByNo(1)).toBe(100); // 지붕재료
    expect(resolveAdjustmentRateByNo(36)).toBe(0); // 철거대상(미사용)
    expect(resolveAdjustmentRateByNo(37)).toBeUndefined(); // 비율 입력형 — 번호 비대상
    expect(resolveAdjustmentRateByNo(0)).toBeUndefined();
  });
});
