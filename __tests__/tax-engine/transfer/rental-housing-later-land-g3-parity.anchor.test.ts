/**
 * anchor: §155⑳ 거주주택 특례(A) on = off — 주택보다 **나중에 취득**해 보유요건에 못 미치는 부수토지(G-3).
 *
 * [결함] 일반 경로는 나중 취득 부수토지분(영 §154① 보유요건 미달 — 양도일 연혁 2년·3년)을 1세대1주택 비과세에서 빼고 12억 안분 없이 전액 과세하며
 *   세율도 파트별(토지분 = 나중 취득 토지 기산일 · 건물분 = 건물 기산일 + §104⑤ 비교)로 정한다. 그런데 특례 on 경로는 이 토지분을 비과세 범위에서 빼지 않고
 *   토지·건물 전체를 특례 대상 주택분으로 계산했다. §155⑳은 거주주택을 1주택으로 「보아 제154조제1항을 적용」할 뿐이라 주택 수만 의제하고 비과세 범위·장기보유특별공제는
 *   바꾸지 않는데도 같은 사실에서 on/off 총세액이 갈렸다(8억 · 토지 2023-10 취득 · 건물 2014-09: off 336,875,000 / on 0 — 토지분 양도차익 440,000,000이 통째로 비과세).
 * [수정] 특례 경로도 같은 술어(`isLaterAcquiredLandExemptExcluded`)로 그 토지분을 특례 대상 주택분에서 떼어 전액 과세하고, 일반 경로와 같은 파트별 세율 함수
 *   (`resolveSplitAwareTax`)에 넘긴다. A 시나리오에 한한다 — B(§161 기준시가 안분)는 비과세 범위를 정하는 산식이 달라 종전 값을 유지한다(결정 보류).
 *
 * 기대값은 엔진 출력을 베끼지 않고 정수 산식으로 독립 도출한다(격자는 같은 사실의 off를 정본으로 한다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const unit = (over: Record<string, unknown> = {}) => ({
  businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
  ...over,
});
const rentalA = { applyException: true, scenario: "A", rentalUnits: [unit()] };
const rentalB = {
  applyException: true, scenario: "B",
  rentalUnits: [unit({ businessRegistrationDate: D("2014-01-01"), rentalRegistrationDate: D("2014-01-01"), isApartment: true, region: "seoul-metro" as const, standardPriceAtRentalStart: 500_000_000 })],
  priorResidenceTransferDate: D("2016-08-25"),
  standardPriceAtAcquisition: 300_000_000, standardPriceAtPriorTransfer: 450_000_000, standardPriceAtTransfer: 800_000_000,
  postRegistrationResidenceMonths: 30,
};

/** 분리 취득 주택 — 토지 80% · 건물 20% 양도가, 토지 취득가 2억(→ 양도가 비율 무관 고정) · 건물 취득가 1억. */
function house(S: number, o: { landAcq: string; T: string; area: number; rhe?: unknown; over?: Record<string, unknown> }): TransferTaxInput {
  const landT = Math.floor(S * 0.8);
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 300_000_000,
    landTransferPrice: landT, buildingTransferPrice: S - landT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D(o.landAcq), transferDate: D(o.T),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: o.area, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...(o.rhe ? { rentalHousingException: o.rhe } : {}),
    ...o.over,
  } as never);
}

// 토지 취득일 — 양도일 기준 5개월·12개월·20개월(전부 보유 2년 미만 = G-3) / 36개월·2008-07(G-3 아님)
const LAND_DATES: Record<string, [string, boolean][]> = {
  "2024-06-01": [["2024-01-01", true], ["2023-06-01", true], ["2022-10-01", true], ["2021-06-01", false], ["2008-07-01", false]],
  "2020-06-01": [["2020-01-01", true], ["2019-06-01", true], ["2018-10-01", true], ["2017-06-01", false], ["2008-07-01", false]],
};

describe("§155⑳ A — 나중 취득 부수토지(G-3): 특례 on = off", () => {
  it("양도가 × 토지 취득일 × 면적(배율 이내/초과) × 양도일 연혁(12억·9억) 격자 — 총세액·산출세액·과세표준이 같다", () => {
    let g3Cells = 0;
    let nonG3Cells = 0;
    let withExcess = 0;
    const scenarios = new Set<string>();
    for (const T of Object.keys(LAND_DATES)) {
      const prices = [800_000_000, 900_000_000, 900_000_001, 1_200_000_000, 1_200_000_001, 1_500_000_000, 2_000_000_000, 3_000_000_000];
      for (const S of prices) {
        for (const [landAcq, isG3] of LAND_DATES[T]) {
          for (const area of [300, 660]) {
            const tag = `${T} ${S} 토지취득 ${landAcq} ${area}㎡`;
            const on = calculateTransferTax(house(S, { landAcq, T, area, rhe: rentalA }), rates);
            const off = calculateTransferTax(house(S, { landAcq, T, area }), rates);
            // G-3 셀은 전부 특례가 적용된다(거주 60개월 · 임대 8년) — 비G-3 셀 중 일부는 요건 미충족으로 일반 경로로 돌아가 on = off가 자명하다
            if (isG3) expect(on.rentalHousingExceptionDetail?.applied, `${tag} 특례 적용`).toBe(true);
            expect(on.totalTax, `${tag} 총세액`).toBe(off.totalTax);
            expect(on.calculatedTax, `${tag} 산출세액`).toBe(off.calculatedTax);
            expect(on.taxBase, `${tag} 과세표준`).toBe(off.taxBase);
            // G-3 술어와 echo가 같은 축 — G-3 셀에만 나중 취득 토지분 echo가 있다
            expect(!!on.splitDetail?.laterLandPart, `${tag} echo`).toBe(isG3);
            if (isG3) g3Cells++; else nonG3Cells++;
            if (on.splitDetail?.nonBusinessLandPart) withExcess++;
            if (isG3) scenarios.add(on.rentalHousingExceptionDetail!.scenarioId);
          }
        }
      }
    }
    // 가드 — 격자가 G-3 · 비G-3 · 배율 초과 · A1 · A2를 모두 거쳤다
    expect(g3Cells).toBe(96);
    expect(nonG3Cells).toBe(64);
    expect(withExcess).toBeGreaterThan(40);
    expect(scenarios).toEqual(new Set(["RH-A1", "RH-A2"]));
  });

  it("8억(A1) — 건물분만 비과세: 토지분 양도차익 440,000,000 전액 과세(보유 8개월 70% · 기본공제 250만) → 총세액 336,875,000 (종전 0)", () => {
    const r = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA }), rates);
    expect(r.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A1");
    // 독립 도출 — 토지 6.4억 − 2억 = 4.4억(장특 없음: 보유 3년 미만) · 건물 1.6억 − 1억 = 0.6억(A1 전액 비과세)
    const landGain = 640_000_000 - 200_000_000;
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(0);
    expect(r.splitDetail!.laterLandPart).toMatchObject({ gain: landGain, holdingYears: 0, longTermRate: 0, longTermDeduction: 0 });
    expect(r.taxableGain).toBe(landGain);
    expect(r.isExempt).toBe(false);
    const base = landGain - 2_500_000;
    const calc = Math.floor(base * 0.7); // 주택 1년 미만 단기 70%
    expect(r.taxBase).toBe(base);
    // A1은 특례 대상 주택분 과세소득이 0이어도 전액 과세되는 토지분에서 기본공제를 쓴다 — 결과의 기본공제 echo도 같다(종전 조건은 주택분만 봐 0이 됐을 것)
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.calculatedTax).toBe(calc);
    expect(r.totalTax).toBe(calc + Math.floor(calc * 0.1));
    expect(r.totalTax).toBe(336_875_000);
  });

  it("15억(A2) — 건물분만 12억 초과 비율 안분(2억×44%×3/15 = 17,600,000), 토지분 10억 전액 과세 · 토지분 단기 70% + 건물분 누진(§104⑤) → 산출세액 699,630,000", () => {
    const r = calculateTransferTax(house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA }), rates);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-A2");
    // 독립 도출 — 건물 3억 − 1억 = 2억 · 표2(보유 9년 36% + 거주 5년 20% = 56%) → gain95 = 2억 − 112,000,000 = 88,000,000 → × (15억−12억)/15억
    const bldIncome = Math.floor((88_000_000 * 300_000_000) / 1_500_000_000);
    expect(bldIncome).toBe(17_600_000);
    expect(d.taxableGain).toBe(bldIncome);
    const landGain = 1_200_000_000 - 200_000_000;
    expect(r.taxableGain).toBe(bldIncome + landGain);
    // 기본공제는 세액이 가장 크게 줄어드는(최고세율) 토지분에 귀속 — 파트별 산출세액 합이 합산 누진세액보다 크다
    const landBase = landGain - 2_500_000;
    const landTax = Math.floor(landBase * 0.7);
    const bldTax = Math.floor(bldIncome * 0.15) - 1_260_000; // 1,400만~5,000만 15% · 누진공제 126만
    expect(r.taxBase).toBe(landBase + bldIncome);
    expect(r.calculatedTax).toBe(landTax + bldTax);
    expect(r.calculatedTax).toBe(699_630_000);
    expect(r.steps.some((s) => s.label.startsWith("부수토지 비과세 제외"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("재산세제과-915"))).toBe(false);
  });

  it("일반 경로 사유 문구와 같은 문장을 쓴다 — 단계 라벨만 §155⑳ 경로로 구분", () => {
    const on = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA }), rates);
    const off = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300 }), rates);
    const reasonOn = on.steps.find((s) => s.label.startsWith("부수토지 비과세 제외"))!.formula;
    const reasonOff = off.steps.find((s) => s.label === "부수토지 비과세 제외")!.formula;
    const head = "주택 취득 후 취득한 부수토지(보유 0년 8개월)는 「소득세법」 시행령 제154조 제1항 보유요건 미충족으로 1세대1주택 비과세 대상이 아님 — 양도차익 440,000,000을 고가주택 안분 없이 전액 과세";
    expect(reasonOn).toContain(head);
    expect(reasonOff).toContain(head);
    expect(`${reasonOn} ${reasonOff}`).not.toMatch(/유리|불리|절감|절세/);
  });

  it("건물분 양도차손 — 토지 이익과 상쇄하지 않는다(일반 경로와 같다): 건물 양도가 1.6억 · 취득가 2.5억(−90,000,000) → on = off", () => {
    for (const S of [800_000_000, 1_500_000_000, 2_000_000_000]) {
      const over = { buildingAcquisitionPrice: 250_000_000 + Math.floor(S * 0.2) - 160_000_000 };
      const on = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over }), rates);
      const off = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, over }), rates);
      expect(on.splitDetail!.building.gain, `${S} 건물 양도차손`).toBeLessThan(0);
      expect(on.splitDetail!.laterLandPart!.gain, `${S} 토지분 = 토지 양도차익 전액`).toBe(on.splitDetail!.land.gain);
      expect(on.rentalHousingExceptionDetail!.taxableGain, `${S} 특례 대상 주택분(음수 0)`).toBe(0);
      expect(on.totalTax, `${S} 총세액`).toBe(off.totalTax);
      expect(on.taxBase, `${S} 과세표준`).toBe(off.taxBase);
    }
  });

  it("T-7 — 나중에 상속받은 토지: 일반 경로와 같은 제외 고지가 특례 경로에도 나온다 · 총세액 일치", () => {
    const over = { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: D("2010-01-01") };
    const on = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over }), rates);
    const off = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, over }), rates);
    expect(on.totalTax).toBe(off.totalTax);
    const w = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((x) => x.includes("나중에 상속받은 부수토지"));
    expect(w(off)).toHaveLength(1);
    expect(w(on)).toEqual(w(off));
  });

  it("거주주택 특례 on에서 G-3가 아닌 같은 시료(토지를 먼저 취득)는 종전 값 그대로 — 20억 · 660㎡ 116,574,000 (#2201·#2205 확정값)", () => {
    const r = calculateTransferTax(house(2_000_000_000, { landAcq: "2008-07-01", T: "2024-06-01", area: 660, rhe: rentalA }), rates);
    expect(r.splitDetail!.laterLandPart).toBeUndefined();
    expect(r.totalTax).toBe(116_574_000);
  });
});

describe("§155⑳ B — 직전거주주택보유주택은 종전 계산을 유지한다 (결정 보류 · 이 값이 바뀌면 그 결정을 거쳐야 한다)", () => {
  it("나중 취득 토지 + B: 토지분이 §161 안분 대상에 들어간 종전 값 (8억 38,556,100 · 15억 191,034,800)", () => {
    for (const [S, expected, id] of [[800_000_000, 38_556_100, "RH-B1"], [1_500_000_000, 191_034_800, "RH-B2"]] as const) {
      const r = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
      expect(r.rentalHousingExceptionDetail!.scenarioId).toBe(id);
      expect(r.splitDetail!.laterLandPart).toBeUndefined();
      expect(r.totalTax).toBe(expected);
    }
  });
});
