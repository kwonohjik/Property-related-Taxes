/**
 * anchor: 다건 합산 — 「소득세법 시행령」 §155⑳ 장기임대 거주주택 특례 자산 × 토지·건물 분리 취득(splitDetail)의 산출세액이 단건과 같다.
 *
 * [결함] 다건 `assetTaxOf`가 §155⑳ 적용 자산에도 일반 split 경로(`resolveSplitAwareTax` → `evaluateSplitPartTax`)를 태웠다.
 *   단건 §155⑳ 경로(`transfer-tax-rental-housing-step.ts`)는 파트 세율을 쓰지 않는다 — 자산 단위 `calcTax`, 배율 초과 부수토지가 있으면
 *   주택분 + 배율 초과 비사업용 토지분 2파트(`resolveClause5Tax`)다. 그런데 다건은 소득금액 `taxableGain` 슬롯(특례 적용 후 과세대상 양도소득금액)을
 *   「파트 양도차익 − 파트 장특」 비율(= 12억 안분·비과세 제외 전의 파트 양도차익이 섞인 가중치)로 토지·건물·배율초과 파트에 다시 나눠 파트별 세율을 적용했다.
 *   기본통칙 95-0…1·파트별 보유연수(#2205)가 §155⑳ 파트 장특 echo를 바꾸자 그 가중치가 움직여 다건 세액이 이동했다 — 원래 틀렸던 값이다.
 *
 * [수정] 다건이 §155⑳ 적용 자산의 파트 소득금액을 엔진이 낸 echo(과세대상 소득금액 슬롯 − 배율 초과분 `nonBusinessLandPart` 소득금액)로 읽고,
 *   단건과 같은 함수(`resolveClause5Tax`)를 부른다. 배율 초과분이 없으면 단건처럼 자산 단위 세액이다.
 *
 * 기대값은 엔진을 베끼지 않고 정수 산식으로 독립 도출했다(모의 세율표 누진 8구간 · 비사업용 +10%p · 지방소득세 10% 절사).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};

const yearsBefore = (t: string, y: number, m = 2): string => {
  const x = new Date(t);
  x.setUTCFullYear(x.getUTCFullYear() - y);
  x.setUTCMonth(x.getUTCMonth() - m);
  return x.toISOString().slice(0, 10);
};

interface Cell {
  S: number;
  T: string;
  /** 건물 보유연수 · 토지 보유연수 */
  B: number;
  L: number;
  res: number;
  /** 토지 면적(㎡) — 300이면 배율 이내, 660이면 초과 60㎡(배율 초과 비사업용 토지 분리) */
  area: number;
  rhe: boolean;
}

/** 토지:건물 = 80:20 양도가 · 토지 2억 + 건물 1억 취득가 — 기준시가는 양도가와 같은 비율. */
function house(c: Cell): TransferTaxInput {
  const landT = Math.floor(c.S * 0.8);
  const bldT = c.S - landT;
  return baseTransferInput({
    propertyType: "housing", transferPrice: c.S, acquisitionPrice: 300_000_000,
    landTransferPrice: landT, buildingTransferPrice: bldT,
    landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: bldT,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D(yearsBefore(c.T, c.B)), landAcquisitionDate: D(yearsBefore(c.T, c.L)), transferDate: D(c.T),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: c.area, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: c.res, isOneHousehold: true, householdHousingCount: 1,
    expenses: 0, annualBasicDeductionUsed: 0,
    ...(c.rhe ? { rentalHousingException: rentalA } : {}),
  } as Partial<TransferTaxInput>);
}

/** 둘째 자산 — 같은 연도 일반 누진 자산(다주택 아님 가정 입력). */
function otherAsset(T: string): TransferTaxInput {
  const y = Number(T.slice(0, 4));
  return baseTransferInput({
    propertyType: "housing", transferPrice: 900_000_000, acquisitionPrice: 700_000_000,
    acquisitionDate: D(`${y - 5}-01-10`), transferDate: D(T), isOneHousehold: false, householdHousingCount: 2,
    expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (T: string, items: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: Number(T.slice(0, 4)), properties: items, annualBasicDeductionUsed: 0 }, rates);

describe("다건 §155⑳ × split — 독립 산식 anchor", () => {
  it("배율 초과 부수토지 없음 · 토지가 건물보다 늦게 취득(G-3) — 자산 단위 세율(단건과 같다): 과세표준 70,976,923 → 24% 누진 11,274,461", () => {
    // 단건 §155⑳ 경로의 과세대상 양도소득금액 73,476,923 − 기본공제 2,500,000 = 70,976,923 → 70,976,923 × 24% − 5,760,000 = 11,274,461(floor).
    // 지방소득세 floor(11,274,461 × 10%) = 1,127,446 → 총 12,401,907.
    const c: Cell = { S: 1_300_000_000, T: "2022-06-01", B: 5, L: 1, res: 24, area: 300, rhe: true };
    const single = calculateTransferTax(house(c), rates);
    expect(single.taxBase).toBe(70_976_923);
    expect(single.calculatedTax).toBe(11_274_461);
    expect(single.totalTax).toBe(12_401_907);
    const agg = aggOf(c.T, [asItem(house(c), "p1")]);
    expect(agg.totalTax).toBe(12_401_907);
  });

  it("배율 초과 부수토지 있음 — 주택분 8,861,539 + 초과분 68,727,273 2파트: 초과분 +10%p 가산, 총 19,017,860", () => {
    // 초과분 과세표준 = 68,727,273 − 기본공제 2,500,000 = 66,227,273 → 24% 누진 10,134,545 + 가산 10%p 6,622,727 = 16,757,272.
    // 주택분 8,861,539 × 6% = 531,692. 2호 합 17,288,964 ≥ 1호 합산 누진 12,261,314 → 17,288,964. 지방소득세 1,728,896 → 총 19,017,860.
    // (종전 다건: 소득금액 77,588,812를 파트 양도차익 가중치로 나눠 초과분이 약 6.6백만원만 받아 13,487,445.)
    const c: Cell = { S: 1_300_000_000, T: "2022-06-01", B: 5, L: 5, res: 24, area: 660, rhe: true };
    const single = calculateTransferTax(house(c), rates);
    expect(single.calculatedTax).toBe(17_288_964);
    expect(single.totalTax).toBe(19_017_860);
    const agg = aggOf(c.T, [asItem(house(c), "p1")]);
    expect(agg.totalTax).toBe(19_017_860);
    // 자산 breakdown: 소득금액 슬롯이 엔진 값 그대로다
    expect(agg.properties[0].incomeAfterOffset).toBe(77_588_812);
  });
});

describe("다건 §155⑳ × split — 양도차손 통산으로 자산 소득금액이 줄면 두 파트가 단건 소득금액 비율로 나눈다", () => {
  it("주택분 8,861,539 : 배율 초과분 68,727,273 → 통산 후 67,588,812 = 7,719,423 + 59,869,389 · 총 15,629,631", () => {
    // 같은 연도 다른 호 자산 양도차손 10,000,000이 §102② 2호로 안분 차감돼 자산 소득금액 77,588,812 → 67,588,812.
    // 파트 소득금액 = 통산 후 × 단건 파트 소득금액 / 단건 합계 (잔액은 배율 초과분이 흡수): 주택분 floor(67,588,812 × 8,861,539 / 77,588,812) = 7,719,423.
    // 기본공제 2,500,000은 한계세율이 높은 배율 초과분에 귀속 → 초과분 과세표준 59,869,389 − 2,500,000 = 57,369,389.
    // 2호: 주택분 7,719,423 × 6% = 463,165 + 초과분(24% 누진 − 5,760,000 = 8,008,653, 가산 10%p 5,736,938) · 합 14,208,756 ≥ 1호 합산 누진 9,861,314.
    // 지방소득세 floor(14,208,756 × 10%) = 1,420,875 → 총 15,629,631.
    const c: Cell = { S: 1_300_000_000, T: "2022-06-01", B: 5, L: 5, res: 24, area: 660, rhe: true };
    const loss = baseTransferInput({
      propertyType: "housing", transferPrice: 690_000_000, acquisitionPrice: 700_000_000,
      acquisitionDate: D("2017-01-10"), transferDate: D(c.T), isOneHousehold: false, householdHousingCount: 2,
      expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const agg = aggOf(c.T, [asItem(house(c), "p1"), asItem(loss, "p2")]);
    expect(agg.properties[0].incomeAfterOffset).toBe(67_588_812);
    expect(agg.calculatedTax).toBe(14_208_756);
    expect(agg.totalTax).toBe(15_629_631);
  });
});

describe("다건 §155⑳ × split — 자산 1건 다건 = 단건 (격자)", () => {
  const cells: Cell[] = [];
  for (const S of [1_300_000_000, 2_000_000_000, 3_000_000_000])
    for (const T of ["2020-06-01", "2022-06-01", "2024-06-01", "2026-06-01"])
      for (const [B, L] of [[5, 1], [15, 1], [2, 1], [9, 9], [5, 20], [9, 5], [15, 25], [3, 2]] as const)
        for (const res of [24, 120])
          for (const area of [300, 660])
            cells.push({ S, T, B, L, res, area, rhe: true });

  it(`§155⑳ 적용 ${cells.length}셀 — 다건 총세액 = 단건 총세액`, () => {
    const bad: string[] = [];
    for (const c of cells) {
      const single = calculateTransferTax(house(c), rates);
      const agg = aggOf(c.T, [asItem(house(c), "p1")]);
      if (agg.totalTax !== single.totalTax) bad.push(`${JSON.stringify(c)} 단건 ${single.totalTax} 다건 ${agg.totalTax}`);
    }
    expect(bad).toEqual([]);
  });

  it("대조군 — 특례 미적용(일반 split 경로)도 단건과 같다(이 수정이 일반 경로를 건드리지 않는다)", () => {
    const bad: string[] = [];
    for (const c of cells) {
      const g = { ...c, rhe: false };
      const single = calculateTransferTax(house(g), rates);
      const agg = aggOf(g.T, [asItem(house(g), "p1")]);
      if (agg.totalTax !== single.totalTax) bad.push(`${JSON.stringify(g)} 단건 ${single.totalTax} 다건 ${agg.totalTax}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("다건 §155⑳ × split — 둘 이상 자산: 입력 순서와 무관", () => {
  const cells: Cell[] = [
    { S: 1_500_000_000, T: "2022-06-01", B: 10, L: 1, res: 120, area: 300, rhe: true },
    { S: 1_500_000_000, T: "2026-06-01", B: 15, L: 1, res: 24, area: 300, rhe: true },
    { S: 1_300_000_000, T: "2022-06-01", B: 5, L: 5, res: 24, area: 660, rhe: true },
    { S: 3_000_000_000, T: "2024-06-01", B: 9, L: 20, res: 60, area: 660, rhe: true },
    { S: 3_000_000_000, T: "2026-06-01", B: 2, L: 1, res: 60, area: 660, rhe: true },
  ];
  for (const c of cells) {
    it(`${c.S / 1e8}억 · ${c.T} · 건물 ${c.B}년 · 토지 ${c.L}년 · 면적 ${c.area}`, () => {
      const a = asItem(house(c), "p1");
      const b = asItem(otherAsset(c.T), "p2");
      const ab = aggOf(c.T, [a, b]);
      const ba = aggOf(c.T, [b, a]);
      expect(ab.totalTax).toBe(ba.totalTax);
    });
  }
});
