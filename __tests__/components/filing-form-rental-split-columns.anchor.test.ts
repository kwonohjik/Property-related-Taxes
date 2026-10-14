/**
 * anchor — 신고서 split-2col × §155⑳ 장기임대 거주주택 특례: 토지·건물 열이 엔진 echo로 만들어진다.
 *
 * [결함] 열의 과세 양도차익을 `파트 gain × result.taxableGain / Σ파트 gain`으로 만들었는데 특례 결과의 `result.taxableGain`은
 *   이미 장기보유특별공제를 뺀 값이다. 파트 장특 echo를 채우자(기본통칙 95-0…1 파트별 정렬) 그 열이 같은 장특을 한 번 더 빼
 *   양도소득금액이 음수가 됐다(20억·토지 2008-07·건물 2014-09·300㎡·양도 2024-06-01·거주 60개월 — 토지 −537,600,000 · 건물 −115,200,000 · 합계 748,000,000).
 *   종전(echo 미채움)은 246,400,000 · 52,800,000이었다.
 * [수정] 특례 결과는 합계 열 의미(과세대상 양도차익 = 전체 양도차익 · 양도소득금액 = 양도차익 − 장특 · 감면후 소득금액 = 특례 후 과세대상)를
 *   따라 파트 값을 엔진 echo로 만든다(`FilingFormTableRentalSplit.ts`).
 */
import { describe, it, expect } from "vitest";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { calc, filingRows, LABEL, type Calc } from "./_helpers/filing-split-excess-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const N = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? 0 : (v as number));
const INCOME_AFTER = "감면후 소득금액";
const NONTAX = "비과세 양도소득금액";

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

/** 분리 취득 주택 — `landDate`·`area`로 같은 날/토지 먼저 · 초과 유무를 가른다. 토지 80% · 건물 20% 양도가. */
function house(price: number, o: { landDate: string; area: number; res: number; rhe: unknown; T?: string }): TransferTaxInput {
  const landP = Math.floor(price * 0.8);
  return baseTransferInput({
    propertyType: "housing", transferPrice: price, acquisitionPrice: 300_000_000,
    landTransferPrice: landP, buildingTransferPrice: price - landP,
    landStandardPriceAtTransfer: landP, buildingStandardPriceAtTransfer: price - landP,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D(o.landDate), transferDate: D(o.T ?? "2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: o.area, appurtenantLandZone: "non_urban",
    residencePeriodMonths: o.res, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    rentalHousingException: o.rhe,
  } as never);
}

/** 열 합 = 합계 열 + 열 안 항등식 — 시료와 무관한 불변식 */
function expectConsistent(r: Calc, price: number, tag: string) {
  const rows = filingRows(r, price);
  // 「비과세 양도소득금액」 라벨은 시나리오별로 근거 접미(예: «(소령 §161①)»)가 붙는다 — 접두로 찾는다.
  const row = (l: string) => rows.get(l) ?? [...rows.entries()].find(([k]) => k.trim().startsWith(l))![1];
  for (const l of [LABEL.gain, LABEL.exempt, LABEL.taxable, LABEL.lt, LABEL.hold, LABEL.res, LABEL.income, INCOME_AFTER, NONTAX]) {
    expect(N(row(l).land) + N(row(l).building), `${tag} ${l.trim()} 열 합`).toBe(N(row(l).total));
  }
  for (const c of ["land", "building"] as const) {
    expect(N(row(LABEL.income)[c]), `${tag} ${c} 양도소득금액 = 양도차익 − 장특`).toBe(N(row(LABEL.gain)[c]) - N(row(LABEL.lt)[c]));
    expect(N(row(LABEL.hold)[c]) + N(row(LABEL.res)[c]), `${tag} ${c} 보유분+거주분`).toBe(N(row(LABEL.lt)[c]));
    expect(N(row(NONTAX)[c]), `${tag} ${c} 비과세 = 양도소득금액 − 감면후`).toBe(N(row(LABEL.income)[c]) - N(row(INCOME_AFTER)[c]));
    expect(N(row(LABEL.income)[c]), `${tag} ${c} 양도소득금액 ≥ 0`).toBeGreaterThanOrEqual(0);
    expect(N(row(INCOME_AFTER)[c]), `${tag} ${c} 감면후 ≥ 0`).toBeGreaterThanOrEqual(0);
  }
  // 합계 열은 엔진 자산 값
  expect(N(row(LABEL.lt).total), `${tag} 합계 장특`).toBe(r.longTermHoldingDeduction);
  expect(N(row(INCOME_AFTER).total), `${tag} 합계 감면후`).toBe(r.taxableGain);
}

describe("리뷰 시료 — 20억 · 토지 2008-07 · 건물 2014-09 · 300㎡ · 양도 2024-06-01 · 거주 60개월 · 특례 A on", () => {
  const price = 2_000_000_000;
  const r = calc(house(price, { landDate: "2008-07-01", area: 300, res: 60, rhe: rentalA }));
  const rows = filingRows(r, price);
  it("양도소득금액 — 음수가 아니다: 토지 1,400,000,000 − 784,000,000 = 616,000,000 · 건물 300,000,000 − 168,000,000 = 132,000,000 · 합 748,000,000", () => {
    // 토지 15년·건물 9년 → 토지 max(표1 30%, 표2 36%+20%) = 56% · 건물 56%
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(rows.get(LABEL.income)).toMatchObject({ land: 616_000_000, building: 132_000_000, total: 748_000_000 });
    expect(rows.get(LABEL.lt)).toMatchObject({ land: 784_000_000, building: 168_000_000, total: 952_000_000 });
    expect(rows.get(LABEL.taxable)).toMatchObject({ land: 1_400_000_000, building: 300_000_000, total: 1_700_000_000 });
  });
  it("감면후 소득금액 — 합 = 특례 후 과세대상 299,200,000(748,000,000 × 8/20), 파트는 양도소득금액 비율 배분", () => {
    expect(N(rows.get(INCOME_AFTER)!.total)).toBe(299_200_000);
    expect(N(rows.get(INCOME_AFTER)!.land)).toBe(Number((299_200_000n * 616_000_000n) / 748_000_000n));
    expect(N(rows.get(INCOME_AFTER)!.building)).toBe(299_200_000 - N(rows.get(INCOME_AFTER)!.land));
    expectConsistent(r, price, "리뷰 시료");
  });
});

describe("§155⑳ A · B × 같은 날/토지 먼저 × 초과 유무 × 거주 × 양도가 — 열 합 = 합계 · 열 안 항등식 · 소득금액 ≥ 0", () => {
  let applied = 0;
  let withExcess = 0;
  let withB = 0;
  it("전 셀", () => {
    for (const price of [1_250_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000]) {
      for (const landDate of ["2014-09-01", "2008-07-01"]) {
        for (const area of [300, 660]) {
          for (const res of [0, 24, 60, 120]) {
            for (const [name, rhe] of [["A", rentalA], ["B", rentalB]] as const) {
              const r = calc(house(price, { landDate, area, res, rhe }));
              if (r.rentalHousingExceptionDetail?.applied !== true || !r.splitDetail || !r.rentalHousingExceptionDetail.formulaTrace.partsLthd) continue;
              applied++;
              if (r.splitDetail.nonBusinessLandPart) withExcess++;
              if (name === "B") withB++;
              expectConsistent(r, price, `${name} ${price / 1e8}억 토지${landDate} ${area}㎡ 거주${res}`);
            }
          }
        }
      }
    }
    // 가드 — 시료가 실제로 특례·초과분·B를 모두 거쳤다
    expect(applied).toBeGreaterThan(20);
    expect(withExcess).toBeGreaterThan(0);
    expect(withB).toBeGreaterThan(0);
  });

  it("같은 날 취득 · 초과 없음(균일 비율과 같은 값) — 파트 양도소득금액은 파트 gain − echo 장특, 감면후는 합계 비율 배분", () => {
    const price = 2_000_000_000;
    const r = calc(house(price, { landDate: "2014-09-01", area: 300, res: 60, rhe: rentalA }));
    const rows = filingRows(r, price);
    // 같은 56% — 토지 1,400,000,000 × 56% / 건물 300,000,000 × 56%
    expect(N(rows.get(LABEL.income)!.land)).toBe(1_400_000_000 - Math.floor(1_400_000_000 * 0.56));
    expect(N(rows.get(LABEL.income)!.building)).toBe(300_000_000 - Math.floor(300_000_000 * 0.56));
    expectConsistent(r, price, "같은 날");
  });
});
