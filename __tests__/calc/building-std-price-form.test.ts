/**
 * 건물 기준시가 폼 변환·검증 (④ toEngineInput · ⑧ validate)
 *
 * 폼 상태 → 엔진 입력 → calcBuildingStandardPrice 결과가 엔진 anchor(BSP-01·06)와 일치하는지 검증.
 * 용도는 번호(usageNo) 기반. 독립 도구(API route 미사용).
 */
import { describe, it, expect } from "vitest";
import { initialBuildingStdPriceForm, emptyCompositePart, toEngineInput, deriveYearFromEventDate, availableYears, type BuildingStdPriceFormState, type CompositePartForm } from "../../lib/calc/building-std-price-form";
import { validateBuildingStdPriceForm } from "../../lib/calc/building-std-price-validate";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";

const form = (o: Partial<BuildingStdPriceFormState>): BuildingStdPriceFormState => ({
  ...initialBuildingStdPriceForm,
  ...o,
});

/**
 * 복합 부분 fixture — 신규 필드(acqUsageNo·조정률 번호) 기본값 채움.
 *
 * `adjustmentMode`를 명시하는 이유: 아래 anchor는 전부 조정률을 **직접 입력**(%·번호)하는
 * 시나리오다. 폼 기본값이 `features`로 바뀌면(2026-08-12) `toCompositePart`가 수동 필드를
 * 엔진에 전달하지 않아 조정률이 통째로 빠진다 — 시나리오가 기본값에 의존하지 않도록 고정한다.
 * (`features` 시나리오는 호출부에서 `...o`로 덮어쓰면 된다.)
 */
const cp = (o: Partial<CompositePartForm>): CompositePartForm => ({
  ...emptyCompositePart(),
  adjustmentMode: "manual",
  ...o,
});

describe("building-std-price 폼 변환 (④) — 엔진 anchor 연동", () => {
  it("BSP-01 상증 폼 → 224,600,000 (엔진 anchor 일치)", () => {
    const f = form({
      taxType: "inheritance_gift",
      floorArea: "200",
      builtYear: "2020",
      valuationYear: "2025",
      valStructureKey: "rc",
      valUsageNo: "1",
      valLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.valuation?.pricePerM2).toBe(1_123_000);
    expect(r.valuation?.standardPrice).toBe(224_600_000);
  });

  it("BSP-06 양도 2시점 폼 → 취득 80,400,000 / 양도 90,000,000", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2010",
      acquisitionYear: "2015",
      transferYear: "2025",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "5,000,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.acquisition?.standardPrice).toBe(80_400_000); // 2015=era-B rc=Ⅱ(40년)·경과5·잔가0.90
    expect(r.transfer?.standardPrice).toBe(90_000_000);
  });

  it("기계식주차 폼 → 255,000,000", () => {
    const f = form({
      taxType: "inheritance_gift",
      isMechanicalParking: true,
      parkingLotCount: "50",
      builtYear: "2020",
      valuationYear: "2025",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.valuation?.standardPrice).toBe(255_000_000);
  });

  it("동일연도 §164⑧ 제1산식 폼 → 양도 62,450,000 (2010 era-B)", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2005",
      acquisitionYear: "2010",
      transferYear: "2010",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "4,500,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "4,500,000",
      holdingMonths: "6",
      adjustMonths: "12",
      sameYearFormula: "prev",
      prevLandPrice: "4,000,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(62_450_000);
  });

  it("동일연도 — 양도당시 구조·용도·공시지가 없이 검증 통과 + 동일 anchor (§164⑧ 미사용 입력)", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2005",
      acquisitionYear: "2010",
      transferYear: "2010",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "4,500,000",
      // trans* 3필드 비입력 — 동일연도는 취득 기준시가를 환산하므로 불요
      holdingMonths: "6",
      adjustMonths: "12",
      sameYearFormula: "prev",
      prevLandPrice: "4,000,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const input = toEngineInput(f);
    expect(input.transfer).toBeUndefined(); // ④ 동일연도는 transfer point 미전달
    const r = calcBuildingStandardPrice(input);
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(62_450_000); // trans* 입력 유무와 무관 — 동일 결과
  });
});

describe("building-std-price 검증 (⑧) — 미입력 차단", () => {
  it("연면적 미입력(일반) 차단", () => {
    const f = form({ taxType: "inheritance_gift", builtYear: "2020", valuationYear: "2025" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/연면적/);
  });
  it("기계식 주차대수 미입력 차단", () => {
    const f = form({ isMechanicalParking: true, builtYear: "2020", valuationYear: "2025", taxType: "inheritance_gift" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/주차대수/);
  });
  it("공시지가 미입력 차단(상증)", () => {
    const f = form({
      taxType: "inheritance_gift",
      floorArea: "200",
      builtYear: "2020",
      valuationYear: "2025",
      valStructureKey: "rc",
      valUsageNo: "1",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/공시지가/);
  });
  it("동일연도 보유월수 미입력 차단", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2005",
      acquisitionYear: "2010",
      transferYear: "2010",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "4,500,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "4,500,000",
      prevLandPrice: "4,000,000",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/보유월수/);
  });
});

describe("building-std-price 복합구조 폼 (④) — 엔진 anchor 연동", () => {
  it("층별 다른 구조 폼 → 1층 676,200,000 + 2층 84,500,000 = 760,700,000", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "1998",
      valuationYear: "2026",
      valLandPrice: "560,000",
      compositeMode: true,
      compositeParts: [
        cp({ label: "1층 공장", structureKey: "rc", usageNo: "48", floorArea: "2100", adjustmentRate: "100" }),
        cp({ label: "2층 창고", structureKey: "light_steel_frame", usageNo: "48", floorArea: "1300", adjustmentRate: "80" }),
      ],
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.compositeBreakdowns?.[0].standardPrice).toBe(676_200_000);
    expect(r.compositeBreakdowns?.[1].standardPrice).toBe(84_500_000);
    expect(r.compositeTotal).toBe(760_700_000);
  });

  it("공용시설 면적비율 안분 폼 → 합계 187,640,000", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "2000",
      valuationYear: "2026",
      valLandPrice: "2,500,000",
      compositeMode: true,
      sharedFacilityArea: "90",
      compositeParts: [
        cp({ label: "1층 슈퍼", structureKey: "rc", usageNo: "41", floorArea: "100", adjustmentRate: "108", sharedAdjustmentRate: "54" }),
        cp({ label: "2~3층 주택", structureKey: "rc", usageNo: "2", floorArea: "200", adjustmentRate: "100", sharedAdjustmentRate: "60" }),
      ],
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.compositeTotal).toBe(187_640_000);
  });
});

describe("building-std-price 양도 복합 폼 (④⑧) — 계산서 작성례(1)(2)", () => {
  it("양도 복합 폼 → 양도당시 217,230,000 / 취득당시(2001) 154,960,000 / ※ 157,439,360", () => {
    const f = form({
      taxType: "transfer",
      builtYear: "2000",
      transferYear: "2023",
      acquisitionYear: "2000",
      acqLandPrice: "2,240,000",
      transLandPrice: "2,500,000",
      compositeMode: true,
      sharedFacilityArea: "90",
      compositeParts: [
        cp({ label: "지상1", structureKey: "rc", usageNo: "41", acqUsageNo: "27", floorArea: "100" }),
        cp({ label: "지상2", structureKey: "rc", usageNo: "2", acqUsageNo: "1", floorArea: "100" }),
        cp({ label: "지상3", structureKey: "rc", usageNo: "2", acqUsageNo: "1", floorArea: "100" }),
      ],
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.transferComposite?.total).toBe(217_230_000);
    expect(r.acquisitionComposite?.total).toBe(154_960_000);
    expect(r.acqBaseConversion?.convertedTotal).toBe(157_439_360);
  });

  it("양도 복합 — 취득시 용도 미입력 차단", () => {
    const f = form({
      taxType: "transfer",
      builtYear: "2000",
      transferYear: "2023",
      acquisitionYear: "2015",
      acqLandPrice: "2,000,000",
      transLandPrice: "2,500,000",
      compositeMode: true,
      compositeParts: [cp({ label: "지상1", structureKey: "rc", usageNo: "2", floorArea: "100" })],
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/취득시 용도/);
  });

  it("상증 복합 조정률 번호 폼 → 200,540,000 (% 입력과 동일)", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "2000",
      valuationYear: "2023",
      valLandPrice: "2,500,000",
      compositeMode: true,
      sharedFacilityArea: "90",
      compositeParts: [
        cp({ label: "지상1", structureKey: "rc", usageNo: "41", floorArea: "100", adjustmentNos: "9,20", sharedAdjustmentNos: "9,24" }),
        cp({ label: "지상2", structureKey: "rc", usageNo: "2", floorArea: "100", sharedAdjustmentNos: "24" }),
        cp({ label: "지상3", structureKey: "rc", usageNo: "2", floorArea: "100", sharedAdjustmentNos: "24" }),
      ],
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.compositeTotal).toBe(200_540_000);
  });
});

describe("building-std-price 다필지 폼 (④) — 위치지수 가중평균", () => {
  it("다필지 + 복합용도 폼 → 위치지수 114 / 합계 4,198,000,000", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "1997",
      valuationYear: "2026",
      landParcelMode: true,
      landParcels: [
        { areaM2: "1000", pricePerM2: "2,500,000" },
        { areaM2: "2000", pricePerM2: "3,000,000" },
        { areaM2: "3000", pricePerM2: "1,500,000" },
      ],
      compositeMode: true,
      compositeParts: [
        cp({ label: "1~5층 사무소", structureKey: "rc", usageNo: "29", floorArea: "6000", adjustmentRate: "110" }),
        cp({ label: "지하1층 주차장", structureKey: "rc", usageNo: "29", floorArea: "2000", adjustmentRate: "60" }),
      ],
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.weightedLandPricePerM2).toBeCloseTo(2_166_666.67, 1);
    expect(r.compositeBreakdowns?.[0].locationIndex).toBe(114);
    expect(r.compositeTotal).toBe(4_198_000_000);
  });
});

describe("building-std-price 공동주택 환산 폼 (④) — 양도 전용", () => {
  it("공동주택 고시 전 취득 폼 → 취득당시 128,660,408", () => {
    const f = form({
      taxType: "transfer",
      builtYear: "1998",
      acquisitionYear: "1998",
      apartmentConversionMode: true,
      apartmentConversion: {
        firstNoticeApartmentPrice: "119,000,000",
        firstNoticeYear: "1999",
        landAreaM2: "33.15",
        totalFloorArea: "105.78",
        structureKey: "rc",
        usageNo: "1",
        firstNoticeLandPrice: "1,820,000",
        acquisitionLandPrice: "2,050,000",
        building2001LandPrice: "1,820,000",
      },
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.apartmentConversion?.convertedAcquisitionPrice).toBe(128_660_408);
  });
});

describe("building-std-price 고급 케이스 검증 (⑧) — 미입력 차단", () => {
  it("복합 부분 구조 미선택 차단", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "1998",
      valuationYear: "2026",
      valLandPrice: "560,000",
      compositeMode: true,
      compositeParts: [cp({ label: "1층", structureKey: "", usageNo: "48", floorArea: "2100", adjustmentRate: "100" })],
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/복합 부분 1.*구조/);
  });
  it("공용시설 면적만 입력하고 공용 조정률 없으면 차단", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "2000",
      valuationYear: "2026",
      valLandPrice: "2,500,000",
      compositeMode: true,
      sharedFacilityArea: "90",
      compositeParts: [cp({ label: "1층", structureKey: "rc", usageNo: "41", floorArea: "100", adjustmentRate: "108" })],
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/공용 조정률/);
  });
  it("다필지 모드에서 필지 미입력 차단", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "2020",
      valuationYear: "2026",
      valStructureKey: "rc",
      valUsageNo: "1",
      floorArea: "200",
      landParcelMode: true,
      landParcels: [{ areaM2: "", pricePerM2: "" }],
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/다필지/);
  });
  it("공동주택 환산 필드 미입력 차단", () => {
    const f = form({
      taxType: "transfer",
      builtYear: "1998",
      acquisitionYear: "1998",
      apartmentConversionMode: true,
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/최초고시 공동주택기준시가/);
  });
});

describe("building-std-price 연도 옵션 — 데이터 보유 교집합", () => {
  it("일반 모드: 2026 위치지수 확보 → 2026~2001 전 연도", () => {
    const ys = availableYears(false);
    expect(ys[0]).toBe(2026);
    expect(ys).toContain(2025);
    expect(ys[ys.length - 1]).toBe(2001);
  });
  it("기계식 모드: 2026 포함", () => {
    expect(availableYears(true)).toContain(2026);
  });
});

describe("상속·증여 평가시점 — eventDate 단일 입력 → 연도 도출", () => {
  // deriveYearFromEventDate: valuationYear 단일 진실 writer의 도출 규칙
  it("헬퍼: 완성 일자만 연도 도출, 미완성/빈값은 빈 문자열", () => {
    expect(deriveYearFromEventDate("2025-03-15")).toBe("2025");
    expect(deriveYearFromEventDate("")).toBe("");
    expect(deriveYearFromEventDate("2025-03")).toBe(""); // 미완성
    expect(deriveYearFromEventDate("2025")).toBe(""); // 연도만
    expect(deriveYearFromEventDate("2026-12-31")).toBe("2026");
  });

  // C-1: 평가연도 미설정(=일자 미완성) → 차단, 메시지는 날짜 기준
  it("C-1: 평가연도 빈값 → '상속·증여일을 입력하세요'", () => {
    const f = form({ taxType: "inheritance_gift", builtYear: "2020", floorArea: "500", valuationYear: "" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/상속·증여일을 입력하세요/);
  });

  // C-3: 데이터 없는 연도(2000) → 차단(유효연도 검증, 드롭다운 폐지 후에도 방어)
  it("C-3: 데이터 없는 연도 → '자료가 없습니다'", () => {
    const f = form({
      taxType: "inheritance_gift",
      builtYear: "2020",
      floorArea: "500",
      valuationYear: "2000",
      valStructureKey: "rc",
      valUsageNo: "1",
      valLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/자료가 없습니다/);
  });
});

describe("단일 시점 모드 (④ toEngineInput · ⑧ validate) — S5·S6", () => {
  /** 양도 전용 모달 상황 — 양도 시점만 채우고 취득 4필드는 비운다 */
  const transferOnly = (o: Partial<BuildingStdPriceFormState> = {}) =>
    form({
      taxType: "transfer",
      singleTimePoint: "transfer",
      builtYear: "2010",
      floorArea: "200",
      transferYear: "2025",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "7,500,000",
      ...o,
    });

  /** 취득 전용 모달 상황 — 취득 시점만 채우고 양도 3필드는 비운다 */
  const acqOnly = (o: Partial<BuildingStdPriceFormState> = {}) =>
    form({
      taxType: "transfer",
      singleTimePoint: "acquisition",
      builtYear: "2010",
      floorArea: "200",
      acquisitionYear: "2015",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "5,000,000",
      ...o,
    });

  // S5 — 반대 시점 미입력이 오류가 아니다(폼에서 숨겨져 입력 경로 자체가 없다)
  it("S5-a 양도 전용: 취득 4필드 미입력이 검증 통과", () => {
    expect(validateBuildingStdPriceForm(transferOnly())).toBeNull();
  });

  it("S5-b 취득 전용: 양도 3필드 미입력이 검증 통과", () => {
    expect(validateBuildingStdPriceForm(acqOnly())).toBeNull();
  });

  it("S5-c 양도 전용이라도 양도 필드 누락은 차단", () => {
    expect(validateBuildingStdPriceForm(transferOnly({ transLandPrice: "" }))).toMatch(
      /양도당시 ㎡당 개별공시지가/,
    );
  });

  it("S5-d 취득 전용이라도 취득 필드 누락은 차단", () => {
    expect(validateBuildingStdPriceForm(acqOnly({ acqStructureKey: "" }))).toMatch(
      /취득당시 건물 구조/,
    );
  });

  // §164⑧ — 취득연도 == 양도연도이면 단일 시점을 적용하지 않고 2시점 검증 그대로
  it("S5-e 동일연도: 양도 전용이어도 취득 입력을 요구", () => {
    const f = transferOnly({ acquisitionYear: "2025" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/취득당시/);
  });

  // S6 — 변환이 반대 시점 point를 만들지 않는다(빈 point 전달 금지)
  it("S6-a 양도 전용: input.acquisition 미구성 · singleTimePoint 전달", () => {
    const input = toEngineInput(transferOnly());
    expect(input.acquisition).toBeUndefined();
    expect(input.transfer).toBeDefined();
    expect(input.singleTimePoint).toBe("transfer");
  });

  it("S6-b 취득 전용: input.transfer·transferYear 미구성", () => {
    const input = toEngineInput(acqOnly());
    expect(input.transfer).toBeUndefined();
    expect(input.transferYear).toBeUndefined();
    expect(input.acquisition).toBeDefined();
    expect(input.singleTimePoint).toBe("acquisition");
  });

  // 양도 전용에서도 acquisitionYear는 남긴다 — 엔진 §164⑧ 판정의 근거
  it("S6-c 양도 전용: acquisitionYear는 엔진에 전달된다", () => {
    const input = toEngineInput(transferOnly({ acquisitionYear: "2015" }));
    expect(input.acquisitionYear).toBe(2015);
    expect(input.acquisition).toBeUndefined();
  });

  it("S6-d 동일연도: 단일 시점 분기를 타지 않고 2시점 input 구성", () => {
    const input = toEngineInput(
      transferOnly({
        acquisitionYear: "2025",
        acqStructureKey: "rc",
        acqUsageNo: "1",
        acqLandPrice: "7,000,000",
        holdingMonths: "6",
        adjustMonths: "12",
        prevLandPrice: "6,500,000",
      }),
    );
    expect(input.acquisition).toBeDefined();
    expect(input.holdingMonths).toBe(6);
  });

  // 폼 → 엔진 왕복 — 단일 시점 결과가 실제로 산출된다
  it("S6-e 양도 전용 왕복: transfer만 산출", () => {
    const r = calcBuildingStandardPrice(toEngineInput(transferOnly()));
    expect(r.transfer).toBeDefined();
    expect(r.acquisition).toBeUndefined();
  });

  it("S6-f 미지정(기존 스냅샷)은 종전 2시점 검증 — 하위호환", () => {
    const f = form({
      taxType: "transfer",
      builtYear: "2010",
      floorArea: "200",
      transferYear: "2025",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/취득연도/);
  });
});
