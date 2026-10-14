/**
 * anchor: 소득세법 기본통칙 95-0…1 「주택부수토지가 주택보다 보유기간이 긴 경우」 — 토지·건물 분리 취득 주택(일반 split 경로)과 leaf.
 *
 * 통칙 문언(국세청 국세법령정보시스템 열람): 「소득세법」 제95조제2항을 적용할 때 1세대1주택에 딸린 토지를 양도하는 경우로서 주택보다
 * 보유기간이 오래된 주택 부수토지에 대한 장기보유특별공제는 그 토지의 전체보유기간에 따른 같은 항 표1의 공제율과 주택 부수토지로서의
 * 보유기간에 따른 같은 항 표2의 공제율 중 큰 공제율을 적용한다.
 *
 * 변경 전 값: 일반 split 경로는 토지 파트에 표2를 **토지 자신의 보유연수**로 적용했다(건물 9년·토지 20년이면 표2 보유 40%).
 * 변경 후 값: 토지가 건물보다 오래되면 토지분 = max(표1(토지 보유연수), 표2(**건물 보유연수** + 거주)). 건물이 10년 이상이면 두 값이 같다.
 * 토지가 건물과 같거나 더 짧은 경우·표2 대상이 아닌 경우(2주택 등)는 값이 바뀌지 않는다.
 *
 * 기대값은 엔진 함수를 부르지 않는 BigInt 정수 산식이다(엔진 출력 복사 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { resolveAppurtenantLandLthdRate } from "@/lib/tax-engine/appurtenant-land-lthd-rate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const mulDiv = (a: number, b: number, c: number): number => Number((BigInt(a) * BigInt(b)) / BigInt(c));

// ── 독립 공제율(정수 %) — §95② 표1·표2 현행(2021.1.1. 이후 양도) ──
const t1Pct = (y: number) => (y < 3 ? 0 : Math.min(y * 2, 30));
const t2HoldPct = (y: number) => (y < 3 ? 0 : Math.min(y * 4, 40));
const t2ResPct = (res: number, holdY: number) => (holdY < 3 || res < 2 ? 0 : Math.min(res * 4, 40));
/** 통칙 적용 토지분 = max(표1(토지), 표2(주택 보유 + 거주)) — 표2 대상일 때 */
const landMaxPct = (landY: number, houseY: number, res: number) => Math.max(t1Pct(landY), t2HoldPct(houseY) + t2ResPct(res, houseY));

// ══════════════════════════════════════════════════════════════════════
// 1. leaf — resolveAppurtenantLandLthdRate
// ══════════════════════════════════════════════════════════════════════
describe("95-0…1 leaf — resolveAppurtenantLandLthdRate", () => {
  const T = D("2026-06-01");
  const r = (landY: number, houseY: number, res: number, useTable2 = true, transferDate: Date = T) =>
    resolveAppurtenantLandLthdRate({ landHoldingYears: landY, houseHoldingYears: houseY, residenceYears: res, useTable2, transferDate });

  it("토지 20년 · 건물 9년 · 거주 5년 — 표1 30% < 표2(주택 9년 36% + 거주 20%) 56% → 표2", () => {
    expect(r(20, 9, 5)).toMatchObject({ table1Rate: 0.3, table2Rate: 0.56, table1Applied: false });
    expect(r(20, 9, 5).rate).toBeCloseTo(0.56, 12);
  });

  it("건물 10년 경계 — 9년 56% → 10년 60%(보유 40% 캡), 토지가 더 길어도 건물 연수만 쓴다", () => {
    expect(r(20, 9, 5).rate).toBeCloseTo(0.56, 12);
    expect(r(20, 10, 5).rate).toBeCloseTo(0.6, 12);
    expect(r(30, 15, 5).rate).toBeCloseTo(0.6, 12);
  });

  it("표2 거주 0 — 거주분 없이 표2 보유분만(36%)이라도 표1(토지 20년 30%)보다 크면 표2", () => {
    expect(r(20, 9, 0)).toMatchObject({ table1Rate: 0.3, table1Applied: false });
    expect(r(20, 9, 0).rate).toBeCloseTo(0.36, 12);
    // 건물 7년(28%)이면 표1 30%가 이긴다
    expect(r(20, 7, 0)).toMatchObject({ rate: 0.3, table1Applied: true });
  });

  it("보유 3년 미만 게이트 — 건물 2년이면 표2 후보 0, 토지 15년 표1 30% 적용(표1)", () => {
    expect(r(15, 2, 5)).toMatchObject({ rate: 0.3, table2Rate: 0, table1Applied: true });
    // 토지도 3년 미만이면 둘 다 0 — 동률은 표1
    expect(r(2, 1, 5)).toMatchObject({ rate: 0, table1Rate: 0, table2Rate: 0, table1Applied: true });
  });

  it("표2 대상이 아니면 표2 후보가 없다 — 표1(토지 자신의 보유연수) 그대로", () => {
    expect(r(20, 9, 5, false)).toMatchObject({ rate: 0.3, table2Rate: 0, table1Applied: true });
  });

  it("동률은 표1 — 현행 표는 4% 단위라 0 = 0(보유 3년 미만) 조합으로 고정한다", () => {
    expect(r(2, 2, 0)).toMatchObject({ rate: 0, table1Applied: true });
  });

  it("양도일 연혁 — 2020.1.1.~2020.12.31.은 표2 보유 연 8%(거주분 없음): 건물 5년 40% vs 표1(토지 15년) 30% → 40%, 건물 3년 24% → 표1 30%", () => {
    const t = D("2020-06-01");
    expect(r(15, 5, 0, true, t)).toMatchObject({ rate: 0.4, table1Rate: 0.3, table2Rate: 0.4, table1Applied: false });
    expect(r(15, 3, 0, true, t)).toMatchObject({ rate: 0.3, table2Rate: 0.24, table1Applied: true });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. 일반 split 경로 — 토지·건물 분리 취득 주택
// ══════════════════════════════════════════════════════════════════════
const addYears = (d: string, y: number, m = 2): string => {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() - y);
  x.setUTCMonth(x.getUTCMonth() - m);
  return x.toISOString().slice(0, 10);
};

interface Case {
  S: number;
  T: string;
  /** 건물 보유연수 · 토지 보유연수 */
  B: number;
  L: number;
  /** 거주 개월 */
  res: number;
  /** 주택 수 (1 = 1세대1주택) */
  hc?: number;
  /** 토지 취득가액 override — 손실 파트 시료 */
  landAcq?: number;
}
/** 토지:건물 = 80:20 양도가 · 취득가 토지 2억 + 건물 1억 — 기준시가는 양도가와 같은 비율(§100③ 의제 방지). */
function split(c: Case): TransferTaxInput {
  const landPrice = Math.floor(c.S * 0.8);
  const bldPrice = c.S - landPrice;
  return baseTransferInput({
    propertyType: "housing", transferPrice: c.S, acquisitionPrice: 300_000_000,
    landTransferPrice: landPrice, buildingTransferPrice: bldPrice,
    landStandardPriceAtTransfer: landPrice, buildingStandardPriceAtTransfer: bldPrice,
    landAcquisitionPrice: c.landAcq ?? 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D(addYears(c.T, c.B)), landAcquisitionDate: D(addYears(c.T, c.L)), transferDate: D(c.T),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: 300, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: c.res, isOneHousehold: true, householdHousingCount: c.hc ?? 1,
    expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}

/** 독립 기대값 — 파트 과세 양도차익(12억 초과분 안분)과 파트별 공제(floor). `landPct`·`bldPct`는 정수 %. */
function expectedLthd(c: Case, landPct: number, bldPct: number) {
  const landPrice = Math.floor(c.S * 0.8);
  const bldPrice = c.S - landPrice;
  const landGain = landPrice - (c.landAcq ?? 200_000_000);
  const bldGain = bldPrice - 100_000_000;
  const prorate = (g: number) => (g <= 0 ? g : mulDiv(g, c.S - 1_200_000_000, c.S));
  const landTaxable = c.hc && c.hc > 1 ? landGain : prorate(landGain);
  const bldTaxable = c.hc && c.hc > 1 ? bldGain : prorate(bldGain);
  const landDed = mulDiv(Math.max(landTaxable, 0), landPct, 100);
  const bldDed = mulDiv(Math.max(bldTaxable, 0), bldPct, 100);
  return { landTaxable, bldTaxable, landDed, bldDed, total: landDed + bldDed };
}
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes("기본통칙 95-0…1"));

describe("95-0…1 일반 split 경로 — 값이 바뀌는 시료 (토지 > 건물 · 표2 대상)", () => {
  const cases: Array<[string, Case]> = [
    ["15억 · 2026 · 건물 9년 · 토지 20년 · 거주 5년", { S: 1_500_000_000, T: "2026-06-01", B: 9, L: 20, res: 60 }],
    ["15억 · 2024 · 건물 5년 · 토지 15년 · 거주 5년", { S: 1_500_000_000, T: "2024-06-01", B: 5, L: 15, res: 60 }],
    ["30억 · 2026 · 건물 5년 · 토지 25년 · 거주 2년", { S: 3_000_000_000, T: "2026-06-01", B: 5, L: 25, res: 24 }],
    ["30억 · 2024 · 건물 2년(표2 보유 3년 미만) · 토지 15년 — 표1이 이긴다", { S: 3_000_000_000, T: "2024-06-01", B: 2, L: 15, res: 60 }],
  ];
  for (const [name, c] of cases) {
    it(name, () => {
      const r = calculateTransferTax(split(c), rates);
      const landPct = landMaxPct(c.L, c.B, Math.floor(c.res / 12));
      const bldPct = t2HoldPct(c.B) + t2ResPct(Math.floor(c.res / 12), c.B);
      const e = expectedLthd(c, landPct, bldPct);
      const sd = r.splitDetail!;
      expect(r.isExempt).toBe(false);
      expect(sd.land.longTermDeduction).toBe(e.landDed);
      expect(sd.building.longTermDeduction).toBe(e.bldDed);
      expect(r.longTermHoldingDeduction).toBe(e.total);
      expect(sd.land.longTermRate).toBeCloseTo(landPct / 100, 12);
      // 변경 전(토지 자신의 보유연수 표2)과 값이 다르다 — 바뀌는 시료임을 고정
      const oldLandPct = t2HoldPct(c.L) + t2ResPct(Math.floor(c.res / 12), c.L);
      expect(landPct).toBeLessThan(oldLandPct);
      // echo + 고지
      expect(sd.land.appurtenantLthd).toMatchObject({
        houseHoldingYears: c.B,
        table1Rate: t1Pct(c.L) / 100,
        table1Applied: t1Pct(c.L) >= t2HoldPct(c.B) + t2ResPct(Math.floor(c.res / 12), c.B),
        changedFromOwnYears: true,
      });
      expect(hasNotice(r)).toBe(true);
      const w = r.warnings!.find((x) => x.includes("기본통칙 95-0…1"))!;
      expect(w).toContain("표1(토지 전체 보유기간");
      expect(w).toContain("표2(주택 부수토지로서의 보유기간");
      expect(w).not.toMatch(/유리|불리|절세|절감/);
      // 건물분은 자신의 보유연수 표2 — 통칙 echo 없음
      expect(sd.building.appurtenantLthd).toBeUndefined();
    });
  }

  it("2020.1.1.~2020.12.31. 양도(표2 보유 연 8%·거주 2년 요건) — 건물 5년 40% vs 표1(토지 15년) 30% → 토지분 40% (종전: 토지 자신의 15년 80%)", () => {
    const c: Case = { S: 1_500_000_000, T: "2020-06-01", B: 5, L: 15, res: 60 };
    const r = calculateTransferTax(split(c), rates);
    // 기준금액 9억(2021.12.7. 이전 양도) — 안분 (S − 9억)/S
    const landPrice = Math.floor(c.S * 0.8);
    const bldPrice = c.S - landPrice;
    const p = (g: number) => mulDiv(g, c.S - 900_000_000, c.S);
    const landT = p(landPrice - 200_000_000);
    const bldT = p(bldPrice - 100_000_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.4, 12);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.4, 12);
    expect(r.splitDetail!.land.longTermDeduction).toBe(mulDiv(landT, 40, 100));
    expect(r.splitDetail!.building.longTermDeduction).toBe(mulDiv(bldT, 40, 100));
    expect(r.splitDetail!.land.appurtenantLthd).toMatchObject({ table2Rate: 0.4, table1Rate: 0.3, table1Applied: false });
  });

  describe("고지 문구의 근거 인용은 양도일 연혁을 따른다 — 통칙 신설(2019.12.23.) 전은 과세관청 해석, 2021.1.1. 이후는 독법 미확인 병기", () => {
    const noticeOf = (T: string) => {
      const r = calculateTransferTax(split({ S: 1_500_000_000, T, B: 5, L: 15, res: 60 }), rates);
      return (r.warnings ?? []).find((w) => w.includes("토지가 주택보다 먼저 취득돼"));
    };
    it("2019-06-01 양도(통칙 신설 전) — 「기본통칙」이라 쓰지 않고 재산세과-4375 해석을 인용한다 · 독법 병기 없음(표2 단일축)", () => {
      const w = noticeOf("2019-06-01")!;
      expect(w).toBeDefined();
      expect(w).toContain("과세관청 해석(재산세과-4375, 2008.12.24. 등 — 주택보다 보유기간이 오래된 주택 부수토지는 표1과 표2 중 큰 공제율)에 따라");
      expect(w).not.toContain("기본통칙");
      expect(w).not.toContain("확인하지 못해");
    });
    it("2020-06-01 양도(통칙 시행 · 표2 단일축) — 통칙 인용 · 독법 병기 없음", () => {
      const w = noticeOf("2020-06-01")!;
      expect(w).toContain("소득세법 기본통칙 95-0…1에 따라");
      expect(w).not.toContain("재산세과-4375");
      expect(w).not.toContain("확인하지 못해");
    });
    it("2024-06-01 양도(표2 2축) — 통칙 인용 + 표1과 비교하는 표2의 단위를 다룬 해석례 미확인 병기", () => {
      const w = noticeOf("2024-06-01")!;
      expect(w).toContain("소득세법 기본통칙 95-0…1에 따라");
      expect(w).toContain(
        "표2가 보유분과 거주분으로 나뉜 2021.1.1. 이후 양도분에서 표1과 비교하는 표2의 단위(보유분과 거주분의 합인지 보유분만인지)를 다룬 해석례는 확인하지 못해 확인이 필요합니다.",
      );
      expect(w).not.toMatch(/유리|불리|절세|절감/);
    });
    it("경계 — 통칙 신설일 2019-12-22 → 해석, 2019-12-23 → 통칙", () => {
      expect(noticeOf("2019-12-22")).toContain("재산세과-4375");
      expect(noticeOf("2019-12-23")).toContain("기본통칙 95-0…1에 따라");
    });
  });

  it("합산(aggregate) 경로도 단건과 같은 세액 — 통칙 값이 다건에서 되돌려지지 않는다", () => {
    const c: Case = { S: 1_500_000_000, T: "2026-06-01", B: 9, L: 20, res: 60 };
    const single = calculateTransferTax(split(c), rates);
    const item = { ...split(c), propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput;
    const agg = calculateTransferTaxAggregate({ taxYear: 2026, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    expect(agg.totalTax).toBe(single.totalTax);
  });
});

describe("95-0…1 일반 split 경로 — 값이 바뀌지 않는 시료 (anchor 고정)", () => {
  const unchanged: Array<[string, Case]> = [
    ["건물 10년 · 토지 20년 — 표2 보유 40% 캡이라 두 값이 같다", { S: 1_500_000_000, T: "2026-06-01", B: 10, L: 20, res: 60 }],
    ["건물 15년 · 토지 15년(같은 보유연수)", { S: 1_500_000_000, T: "2026-06-01", B: 15, L: 15, res: 60 }],
    ["토지가 건물보다 짧다(토지 9년 · 건물 15년) — 토지 자신의 보유연수", { S: 1_500_000_000, T: "2026-06-01", B: 15, L: 9, res: 60 }],
    ["건물 9년 · 토지 9년 · 30억", { S: 3_000_000_000, T: "2024-06-01", B: 9, L: 9, res: 60 }],
  ];
  for (const [name, c] of unchanged) {
    it(name, () => {
      const r = calculateTransferTax(split(c), rates);
      const res = Math.floor(c.res / 12);
      const e = expectedLthd(
        c,
        t2HoldPct(c.L) + t2ResPct(res, c.L),
        t2HoldPct(c.B) + t2ResPct(res, c.B),
      );
      expect(r.splitDetail!.land.longTermDeduction).toBe(e.landDed);
      expect(r.splitDetail!.building.longTermDeduction).toBe(e.bldDed);
      expect(r.longTermHoldingDeduction).toBe(e.total);
      expect(r.splitDetail!.land.appurtenantLthd?.changedFromOwnYears ?? false).toBe(false);
      expect(hasNotice(r)).toBe(false);
    });
  }

  it("같은 보유연수(건물 15년 · 토지 15년)는 «주택보다 오래된» 경우가 아니라 통칙 echo 자체가 없다(M12 `>`→`>=` 변형 kill)", () => {
    const r = calculateTransferTax(split({ S: 1_500_000_000, T: "2026-06-01", B: 15, L: 15, res: 60 }), rates);
    expect(r.splitDetail!.land.appurtenantLthd).toBeUndefined();
  });

  it("표2 대상이 아니다(2주택 — 표1): 토지·건물 각자 보유연수 표1, 통칙 echo·고지 없음", () => {
    const c: Case = { S: 1_500_000_000, T: "2026-06-01", B: 9, L: 20, res: 60, hc: 2 };
    const r = calculateTransferTax(split(c), rates);
    const e = expectedLthd(c, t1Pct(c.L), t1Pct(c.B));
    expect(r.splitDetail!.land.longTermDeduction).toBe(e.landDed);
    expect(r.splitDetail!.building.longTermDeduction).toBe(e.bldDed);
    expect(r.splitDetail!.land.appurtenantLthd).toBeUndefined();
    expect(hasNotice(r)).toBe(false);
  });

  it("거주 2년 미만(표2 대상 아님 — 1세대1주택이어도 표1) — 통칙 echo·고지 없음", () => {
    const c: Case = { S: 1_500_000_000, T: "2026-06-01", B: 9, L: 20, res: 12 };
    const r = calculateTransferTax(split(c), rates);
    // 거주 1년 → 표2 대상 요건(거주 2년) 미충족 → 표1 파트별
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.3, 12);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.18, 12);
    expect(r.splitDetail!.land.appurtenantLthd).toBeUndefined();
    expect(hasNotice(r)).toBe(false);
  });

  it("12억 이하 — 전액 비과세라 장기보유특별공제가 없다", () => {
    const r = calculateTransferTax(split({ S: 1_100_000_000, T: "2026-06-01", B: 9, L: 20, res: 60 }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});

describe("95-0…1 일반 split 경로 — 파트 손실 0 하한 유지", () => {
  it("토지 파트 양도차손(토지 양도 12억 < 취득 12.5억) · 건물 이익 — 토지분 공제 0, 건물분만 공제", () => {
    // 15억(토지 12억 + 건물 3억) — 토지 양도차익 12억 − 12.5억 = −5천만, 건물 3억 − 1억 = 2억 → 합계 1.5억(양수라 차손 조기반환이 아니다)
    const c: Case = { S: 1_500_000_000, T: "2026-06-01", B: 9, L: 20, res: 60, landAcq: 1_250_000_000 };
    const r = calculateTransferTax(split(c), rates);
    const e = expectedLthd(c, landMaxPct(c.L, c.B, 5), t2HoldPct(c.B) + t2ResPct(5, c.B));
    expect(e.landTaxable).toBeLessThan(0);
    expect(r.splitDetail!.land.longTermDeduction).toBe(0);
    expect(r.splitDetail!.building.longTermDeduction).toBe(e.bldDed);
    expect(r.longTermHoldingDeduction).toBe(e.bldDed);
  });
});
