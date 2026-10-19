/**
 * anchor: §155⑳ 거주주택 특례(A) on = off — 주택보다 **나중에 취득**해 보유요건에 못 미치는 부수토지(G-3).
 *
 * [결함] 일반 경로는 나중 취득 부수토지분(영 §154① 보유요건 미달 — 양도일 연혁 2년·3년)을 1세대1주택 비과세에서 빼고 12억 안분 없이 전액 과세하며
 *   세율도 파트별(토지분 = 나중 취득 토지 기산일 · 건물분 = 건물 기산일 + §104⑤ 비교)로 정한다. 그런데 특례 on 경로는 이 토지분을 비과세 범위에서 빼지 않고
 *   토지·건물 전체를 특례 대상 주택분으로 계산했다. §155⑳은 거주주택을 1주택으로 「보아 제154조제1항을 적용」할 뿐이라 주택 수만 의제하고 비과세 범위·장기보유특별공제는
 *   바꾸지 않는데도 같은 사실에서 on/off 총세액이 갈렸다(8억 · 토지 2023-10 취득 · 건물 2014-09: off 336,875,000 / on 0 — 토지분 양도차익 440,000,000이 통째로 비과세).
 * [수정] 특례 경로도 같은 술어(`isLaterAcquiredLandExemptExcluded`)로 그 토지분을 특례 대상 주택분에서 떼어 전액 과세하고, 일반 경로와 같은 파트별 세율 함수
 *   (`resolveSplitAwareTax`)에 넘긴다. B(§161 기준시가 안분)도 같다 — 1주택 코드 리뷰 별건 ⑦ 사용자 결정(2026-10-19 「일반 경로와 맞춰 토지분 제외」)으로
 *   그 토지분을 떼고 나머지 주택분에만 §161 안분을 적용한다(종전에는 B만 토지분까지 §161 안분에 넣었다 — 8억 38,556,100 · 15억 191,034,800).
 *
 * 기대값은 엔진 출력을 베끼지 않고 정수 산식으로 독립 도출한다(격자는 같은 사실의 off를 정본으로 한다).
 *
 * ⚠️ 「on = off」는 아래 **격자 범위**(양도가 8종 · 토지 취득일 5종 · 면적 2종 · 양도일 2종)에서 성립한 값이다. 격자 밖 양도가(한도 1.5배·3배 등)의 A2에서는
 *   on이 장기보유특별공제를 먼저 빼고 안분하고 off가 안분 후 장기보유특별공제를 빼는 연산 순서 차이로 floor가 1~2원 갈린다 — G-3와 무관하게 비G-3 A2에도
 *   있는 별건이며 이 수정이 다루지 않았다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, parseRatesFromMap, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveSplitAwareTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
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
  it("양도가 × 토지 취득일 × 면적(배율 이내/초과) × 양도일 연혁(12억·9억) 격자(범위 한정) — 총세액·산출세액·과세표준이 같다", () => {
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

  it("건물분 양도차손 — 12억 초과 과세분만 토지분에서 공제한다(일반 경로와 같다 · 계획서 P2 Q-1): 건물 양도가 − 취득가 = −90,000,000 → on = off", () => {
    // 8억(A1) 건물 전액 비과세 → 차손도 0 · 15억 −90,000,000 × 3억/15억 = −18,000,000 · 20억 × 8억/20억 = −36,000,000 (차손에는 장기보유특별공제 없음)
    const expected: Record<number, number> = { 800_000_000: 0, 1_500_000_000: -18_000_000, 2_000_000_000: -36_000_000 };
    for (const S of [800_000_000, 1_500_000_000, 2_000_000_000]) {
      const over = { buildingAcquisitionPrice: 250_000_000 + Math.floor(S * 0.2) - 160_000_000 };
      const on = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over }), rates);
      const off = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, over }), rates);
      expect(on.splitDetail!.building.gain, `${S} 건물 양도차손`).toBe(-90_000_000);
      expect(on.splitDetail!.laterLandPart!.gain, `${S} 토지분 = 토지 양도차익 전액`).toBe(on.splitDetail!.land.gain);
      expect(on.rentalHousingExceptionDetail!.taxableGain, `${S} 특례 대상 주택분 = 차손의 과세분`).toBe(expected[S]);
      expect(on.taxableGain, `${S} 과세대상 = 토지분 + 건물 차손 과세분`).toBe(on.splitDetail!.laterLandPart!.gain + expected[S]);
      expect(on.totalTax, `${S} 총세액`).toBe(off.totalTax);
      expect(on.taxBase, `${S} 과세표준`).toBe(off.taxBase);
      // 다건 1건 = 단건 — 슬롯의 건물분이 음수여도 자산 단위로 후퇴하지 않는다
      const agg = aggOf("2024-06-01", [asItem(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over }), "p")]);
      expect(agg.totalTax, `${S} 다건`).toBe(on.totalTax);
    }
    // 15억 독립 도출 — 토지분 10억 − 차손 1,800만(다른 세율 파트로 안분 — 토지분만 이익) − 기본공제 250만, 단기 70%
    const r = calculateTransferTax(
      house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over: { buildingAcquisitionPrice: 390_000_000 } }),
      rates,
    );
    expect(r.taxBase).toBe(1_000_000_000 - 18_000_000 - 2_500_000);
    expect(r.calculatedTax).toBe(Math.floor((1_000_000_000 - 18_000_000 - 2_500_000) * 0.7));
  });

  it("배율 초과 + 고가주택(재산세제과-915 회신 방식) 특례 경로도 건물 차손의 과세분을 남긴다 — on = off (단건 · 다건 1건)", () => {
    let cells = 0;
    for (const S of [1_500_000_000, 2_000_000_000, 3_000_000_000]) {
      for (const bld of [90_000_000, 1_000_000_000]) {
        const over = { buildingAcquisitionPrice: S - Math.floor(S * 0.8) + bld };
        const on = calculateTransferTax(house(S, { landAcq: "2008-07-01", T: "2024-06-01", area: 660, rhe: rentalA, over }), rates);
        const off = calculateTransferTax(house(S, { landAcq: "2008-07-01", T: "2024-06-01", area: 660, over }), rates);
        const tag = `${S} 건물 차손 ${bld}`;
        if (on.rentalHousingExceptionDetail?.applied !== true) continue;
        expect(on.rentalHousingExceptionDetail.formulaTrace.highValueExcessRuling, `${tag} 회신 방식`).toBeDefined();
        // 건물분 과세 양도차익 = 차손 × (S − 12억)/S (내림)
        expect(on.rentalHousingExceptionDetail.formulaTrace.highValueExcessRuling!.buildingTaxableGain, tag).toBe(
          Math.floor((-bld * (S - 1_200_000_000)) / S),
        );
        expect(on.totalTax, tag).toBe(off.totalTax);
        expect(aggOf("2024-06-01", [asItem(house(S, { landAcq: "2008-07-01", T: "2024-06-01", area: 660, rhe: rentalA, over }), "p")]).totalTax, `${tag} 다건`).toBe(on.totalTax);
        cells++;
      }
    }
    expect(cells).toBeGreaterThanOrEqual(5);
  });

  it("B(§161 안분)는 건물 차손을 종전대로 0으로 보고 결합 고지에 그 사실을 덧붙인다 — 확인 필요", () => {
    const over = { buildingAcquisitionPrice: 390_000_000 };
    const r = calculateTransferTax(house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB, over }), rates);
    expect(r.rentalHousingExceptionDetail!.scenarioId).toBe("RH-B2");
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(0);
    const w = (r.warnings ?? []).filter((x) => x.includes("시나리오 B) 계산도 일반 경로와 같이"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("건물분 양도차손 90,000,000도 §161 안분과 결합하는 방법을 정한 근거를 확인하지 못해 0으로 계산했습니다 — 확인 필요");
    expect(w[0]).not.toMatch(/유리|불리|절감|절세/);
    // 차손이 없으면 덧붙이지 않는다
    const plain = calculateTransferTax(house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
    expect((plain.warnings ?? []).some((x) => x.includes("건물분 양도차손"))).toBe(false);
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

describe("§155⑳ B × 나중에 상속받은 토지(T-7) — B도 제외하므로 A와 같은 고지", () => {
  it("B도 그 토지분을 제외한다 — T-7 «제외했습니다» 고지(A와 같은 문장) + B 결합 확인 필요 고지", () => {
    const over = { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: D("2010-01-01") };
    const r = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB, over }), rates);
    expect(r.rentalHousingExceptionDetail!.scenarioId).toBe("RH-B1");
    const w = r.warnings ?? [];
    const a = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA, over }), rates);
    const t7 = (x: { warnings?: string[] }) => (x.warnings ?? []).filter((m) => m.includes("주택보다 나중에 상속받은 부수토지"));
    expect(t7(r)).toHaveLength(1);
    expect(t7(r)).toEqual(t7(a));
    // B 결합 고지는 B에만 — A는 §161 안분이 없다
    expect((a.warnings ?? []).some((m) => m.includes("시나리오 B) 계산도 일반 경로와 같이"))).toBe(false);
    expect(w.filter((x) => x.includes("나머지 주택분에만 §161 기준시가 안분을 적용했습니다"))).toHaveLength(1);
    expect(r.splitDetail!.laterLandPart!.gain).toBe(440_000_000);
  });
});

describe("§155⑳ B — 나중 취득 토지분을 떼고 나머지 주택분에만 §161 안분 (별건 ⑦ · 사용자 결정 2026-10-19)", () => {
  it("나중 취득 토지 + B: 결합에 정면 해석이 없다는 확인 필요 고지가 steps·warnings에 1건 — 토지를 먼저 취득한 B(G-3 아님)에는 없다", () => {
    for (const S of [800_000_000, 1_500_000_000]) {
      const r = calculateTransferTax(house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
      const w = (r.warnings ?? []).filter((x) => x.includes("직전거주주택보유주택(§155⑳ 시나리오 B) 계산도 일반 경로와 같이"));
      expect(w, `${S} warnings`).toHaveLength(1);
      expect(w[0]).toContain("부수토지분(보유 0년 8개월)을 비과세에서 제외해 전액 과세하고 나머지 주택분에만 §161 기준시가 안분을 적용했습니다");
      expect(w[0]).toContain("확인 필요");
      expect(w[0]).not.toMatch(/유리|불리|절감|절세/);
      expect(r.steps.some((st) => st.formula === w[0]), `${S} steps`).toBe(true);
      expect(r.steps.some((st) => st.label === "부수토지 비과세 제외 (§155⑳ 특례 경로)"), `${S} 제외 단계`).toBe(true);
    }
    const ok = calculateTransferTax(house(800_000_000, { landAcq: "2008-07-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
    expect(ok.splitDetail!.laterLandPart).toBeUndefined();
    expect((ok.warnings ?? []).some((x) => x.includes("시나리오 B) 계산도 일반 경로와 같이"))).toBe(false);
  });

  it("8억(B1) ★ — 토지분 4.4억 전액 과세(보유 8개월 70%) + 건물분만 §161①: (6천만 − 표1 18%) × 30% = 14,760,000 → 총세액 337,924,400 (종전 38,556,100)", () => {
    const r = calculateTransferTax(house(800_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B1");
    // 독립 도출 — 건물 1.6억 − 1억 = 6천만 · 표1(보유 9년 18%) → 49,200,000 · §161① 비율 (4.5억−3억)/(8억−3억) = 30%
    const bldGain95 = 60_000_000 - Math.floor(60_000_000 * 0.18);
    const bldIncome = Math.floor((bldGain95 * 3) / 10);
    expect(bldIncome).toBe(14_760_000);
    expect(d.taxableGain).toBe(bldIncome);
    const landGain = 640_000_000 - 200_000_000;
    expect(r.splitDetail!.laterLandPart).toMatchObject({ gain: landGain, holdingYears: 0, longTermRate: 0, longTermDeduction: 0 });
    expect(r.taxableGain).toBe(landGain + bldIncome);
    // 기본공제는 최고세율인 토지분에 귀속 — 토지분 단기 70% + 건물분 누진(1,400만~5,000만 15% · 누진공제 126만)
    const landTax = Math.floor((landGain - 2_500_000) * 0.7);
    const bldTax = Math.floor(bldIncome * 0.15) - 1_260_000;
    expect(r.taxBase).toBe(landGain + bldIncome - 2_500_000);
    expect(r.calculatedTax).toBe(landTax + bldTax);
    expect(r.calculatedTax).toBe(307_204_000);
    expect(r.totalTax).toBe(337_924_400);
  });

  it("15억(B2) — 건물분 §161②: 1호 164,000,000 × 30% + 2호 88,000,000 × 70% × (15억−12억)/15억 = 61,520,000 · 토지분 10억 전액 과세 → 총세액 777,980,280 (종전 191,034,800)", () => {
    const r = calculateTransferTax(house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB }), rates);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B2");
    // 독립 도출 — 건물 3억 − 1억 = 2억 · 표1 18% → 164,000,000 · 표2(보유 9년 36% + 거주 5년 20%) 56% → 88,000,000
    const part1 = Math.floor((164_000_000 * 3) / 10);
    const part2 = Math.floor((88_000_000 * 7 * 300_000_000) / (10 * 1_500_000_000));
    expect(part1 + part2).toBe(61_520_000);
    expect(d.taxableGain).toBe(part1 + part2);
    const landGain = 1_200_000_000 - 200_000_000;
    expect(r.taxableGain).toBe(landGain + part1 + part2);
    const landTax = Math.floor((landGain - 2_500_000) * 0.7);
    const bldTax = Math.floor((part1 + part2) * 0.24) - 5_760_000; // 5,000만~8,800만 24% · 누진공제 576만
    expect(r.calculatedTax).toBe(landTax + bldTax);
    expect(r.calculatedTax).toBe(707_254_800);
    expect(r.totalTax).toBe(777_980_280);
  });

  it("다건 합산 1건 = 단건 (B1·B2) — 파트(토지분·건물분) 세율 판정이 다건에서도 유지된다", () => {
    for (const S of [800_000_000, 1_500_000_000]) {
      const input = house(S, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalB });
      const agg = aggOf("2024-06-01", [asItem(input, "b")]);
      expect(agg.totalTax, `${S}`).toBe(calculateTransferTax(input, rates).totalTax);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 다건 합산 — G-3 특례 on 자산 1건의 다건 총세액 = 단건 총세액 (둘 다 on 경로라 on/off 연산 순서의 1~2원 잔차와 무관하다)
// ══════════════════════════════════════════════════════════════════════
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (T: string, items: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: Number(T.slice(0, 4)), properties: items, annualBasicDeductionUsed: 0 }, rates);

describe("§155⑳ A × G-3 — 다건 = 단건 (격자)", () => {
  it("양도가(한도 1.5배·3배 포함) × 토지 취득일 × 면적 × 양도일(2020·2024·2026) 격자 — 다건 총세액이 단건과 1원도 다르지 않다", () => {
    const LD: Record<string, string[]> = {
      "2020-06-01": ["2020-01-01", "2019-06-01", "2018-10-01", "2017-06-01", "2008-07-01"],
      "2024-06-01": ["2024-01-01", "2023-06-01", "2022-10-01", "2021-06-01", "2008-07-01"],
      "2026-06-01": ["2026-01-01", "2025-06-01", "2024-10-01", "2023-06-01", "2008-07-01"],
    };
    const bad: string[] = [];
    let g3Cells = 0;
    let withExcess = 0;
    for (const T of Object.keys(LD)) {
      const H = T < "2021-12-08" ? 900_000_000 : 1_200_000_000;
      const prices = [800_000_000, H, H + 1, Math.floor(H * 1.25), Math.floor(H * 1.5), H * 2, H * 3, 3_000_000_000];
      for (const S of prices) {
        for (const landAcq of LD[T]) {
          for (const area of [300, 660]) {
            const base = house(S, { landAcq, T, area, rhe: rentalA });
            const single = calculateTransferTax(base, rates);
            if (!single.splitDetail?.laterLandPart) continue;
            g3Cells++;
            if (single.splitDetail.nonBusinessLandPart) withExcess++;
            const agg = aggOf(T, [asItem(base, "p1")]);
            if (agg.totalTax !== single.totalTax) bad.push(`${T} ${S} 토지 ${landAcq} ${area}㎡ 단건 ${single.totalTax} 다건 ${agg.totalTax}`);
          }
        }
      }
    }
    expect(g3Cells).toBeGreaterThan(100);
    expect(withExcess).toBeGreaterThan(40);
    expect(bad).toEqual([]);
  });

  it("둘 이상 자산(양도차손 통산 포함) — 입력 순서와 무관하고 G-3 자산의 파트(토지분·건물분·배율 초과분)가 통산 뒤에도 유지된다", () => {
    const g3 = house(2_000_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 660, rhe: rentalA });
    const loss = baseTransferInput({
      propertyType: "housing", transferPrice: 500_000_000, acquisitionPrice: 600_000_000,
      acquisitionDate: D("2019-01-10"), transferDate: D("2024-06-01"), isOneHousehold: false, householdHousingCount: 2,
      expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const a = aggOf("2024-06-01", [asItem(g3, "g3"), asItem(loss, "loss")]);
    const b = aggOf("2024-06-01", [asItem(loss, "loss"), asItem(g3, "g3")]);
    expect(a.totalTax).toBe(b.totalTax);
    expect(a.totalTax).toBeGreaterThan(0);
    // 건물분 역산(슬롯 − 토지분 − 배율 초과분)은 통산 전 슬롯 기준이고, 통산 뒤 파트 배분은 `evaluateSplitPartTax`의 소득금액 비율 안분(잔액은 마지막 파트 흡수)이 맡는다 —
    // 이 시료는 자산 단위 후퇴 없이 파트별 세율 판정(`partRateBasisApplied` true)이 유지된다
    const parts = a.properties.find((p) => p.propertyId === "g3")!.splitDetail?.partRateBasisApplied;
    expect(parts).toBe(true);
  });

  it("다건 파트 역산 — 슬롯의 건물분(= 슬롯 − 토지분 − 배율 초과분)이 음수면 그 차손을 토지분에서 공제한다(계획서 P2 Q-1) · 파트 합이 0이면 자산 단위", () => {
    const input = house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe: rentalA });
    const r = calculateTransferTax(input, rates);
    const later = r.splitDetail!.laterLandPart!;
    const laterGross = later.gain - later.longTermDeduction;
    const parsedRates = parseRatesFromMap(rates);
    const ctx = (slot: number) => ({
      taxBase: Math.max(0, slot - r.basicDeduction), transferIncome: slot, basicDeduction: r.basicDeduction, splitDetail: r.splitDetail,
      parsedRates, taxRateInput: input, rentalHousingTaxableIncome: slot,
    });
    // 정상 슬롯(= 건물분 + 토지분) — 파트 3개가 아니라 토지분·건물분 2파트를 낸다
    const ok = resolveSplitAwareTax(ctx(r.taxableGain));
    expect(ok.splitPartDetail?.parts.map((p) => p.kind).sort()).toEqual(["building", "land"]);
    expect(ok.calculatedTax).toBe(r.calculatedTax);
    // 슬롯 = 토지분 − 1 → 건물분 −1: 파트를 유지하고 그 1원을 토지분에서 공제한다(세율이 달라 영 §167의2①2호)
    const neg = resolveSplitAwareTax(ctx(laterGross - 1));
    expect(neg.partRateBasisApplied).toBe(true);
    expect(neg.splitPartDetail?.lossOffset).toEqual([{ from: "building", to: "land", amount: 1, scope: "other_group" }]);
    // 슬롯 0 — 파트 합 0이라 자산 단위
    const zero = resolveSplitAwareTax(ctx(0));
    expect(zero.splitPartDetail).toBeUndefined();
    expect(zero.partRateBasisApplied).toBe(false);
  });

  it("다른 자산과 함께 신고 — 건물 차손의 과세분은 같은 세율 자산에서 먼저 공제(영 §167의2①1호): 특례 on = off · 입력 순서 무관", () => {
    const other = baseTransferInput({
      propertyType: "land", transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2019-01-10"), transferDate: D("2024-06-01"),
      isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const over = { buildingAcquisitionPrice: 390_000_000 };
    const tax = (rhe?: unknown) => {
      const h = house(1_500_000_000, { landAcq: "2023-10-01", T: "2024-06-01", area: 300, rhe, over });
      const a = aggOf("2024-06-01", [asItem(h, "h"), asItem(other, "o")]);
      const b = aggOf("2024-06-01", [asItem(other, "o"), asItem(h, "h")]);
      expect(a.totalTax).toBe(b.totalTax);
      return a;
    };
    const on = tax(rentalA);
    const off = tax(undefined);
    expect(on.totalTax).toBe(off.totalTax);
    expect(on.lossOffsetTable).toEqual([{ fromPropertyId: "h", fromPart: "building", toPropertyId: "o", amount: 18_000_000, scope: "same_group" }]);
    expect(on.lossOffsetTable).toEqual(off.lossOffsetTable);
  });
});
