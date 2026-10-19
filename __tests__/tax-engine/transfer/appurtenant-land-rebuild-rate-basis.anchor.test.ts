/**
 * anchor: 구주택 멸실·신축 통산 — 주택 부수토지 세율 보유기간 (해석 (5))
 *
 * 계획서 docs/00-pm/appurtenant-land-rebuild-rate-basis.plan.md (§사용자 결정 Q-1~Q-9) ·
 * 설계 docs/02-design/features/appurtenant-land-rebuild-rate-basis.engine.design.md
 * 근거: 서면법규과-1222(2014.11.19.) · 사전-2023-법규재산-0097(2023.6.15.). 나대지·상가 철거 후 신축((7) 계열)은 입력이 없어 현행 `max` 그대로다.
 *
 * 공통 시드(Pre-Do 실측): 주택 split · 토지 양도 7억(취득 2억) / 건물 양도 3억(취득 2.5억) · 2주택 비조정 ·
 * 건물 신축 취득(사용승인) 2025-01-01 · 양도 2025-09-01(신축분 8개월) · 토지 취득 2022-01-01 · mock 세율.
 * 현행(입력 없음) 실측: 산출세액 362,250,000 · 토지 파트 70%(신축일 기산).
 * ⚠️ 세액은 `makeMockRates()` 실측 — 정본 세액이 아니다. 끝자리 999는 mock 누진공제에서 나온다(엔진 변경과 무관).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, parseRatesFromMap } from "@/lib/tax-engine/transfer-tax";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { buildSplitPartSeeds } from "@/lib/tax-engine/transfer-tax-split-part-seeds";
import { resolveAppurtenantLandRateBasisDate } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { equivalentRateBasisDate, collectLandRebuildIssues, landRebuildFactsOfInput, type LandRebuildPriorHouse } from "@/lib/tax-engine/transfer-land-rebuild-rate";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { splitRateBasisNote } from "@/lib/tax-engine/transfer-tax-split-display";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const months = (a: Date, b: Date) => {
  const h = calculateHoldingPeriod(a, b);
  return h.years * 12 + h.months;
};

function asset(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: D("2025-09-01"),
    acquisitionPrice: 450_000_000,
    acquisitionCause: "newConstruction",
    acquisitionDate: D("2025-01-01"),
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 300_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 250_000_000,
    landAcquisitionDate: D("2022-01-01"),
    ...o,
  });
}
const rb = (o: Partial<LandRebuildPriorHouse> & { demolitionDate: Date }): LandRebuildPriorHouse => ({
  startMode: "since_land",
  footprintUnchanged: true,
  ...o,
});
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(asset(o), makeMockRates());
/** 토지 파트의 확정 세율 — 엔진이 실제로 쓴 시드(`buildSplitPartSeeds`)로 `calcTax`를 돌려 읽는다. */
function landRate(o: Partial<TransferTaxInput>) {
  const input = asset(o);
  const r = calculateTransferTax(input, makeMockRates());
  const seeds = buildSplitPartSeeds(r.splitDetail, input)!;
  const t = calcTax(seeds[0].raw, parseRatesFromMap(makeMockRates()), seeds[0].rateInput);
  return { appliedRate: t.appliedRate, clause: t.rateClause, basis: seeds[0].basisDate };
}

describe("A) 회귀 가드 — 입력이 없으면 현행 `max` 그대로 (나대지·상가 철거 후 신축 (7) 계열 포함)", () => {
  it("RB-A1 입력 없음: 토지 기산 = 신축일 2025-01-01 · 70% · 산출세액 362,250,000", () => {
    const r = run();
    expect(r.calculatedTax).toBe(362_250_000);
    expect(r.splitDetail?.land.appliedRateBasisDate).toBe("2025-01-01");
    expect(r.splitDetail?.land.rateHoldingAggregation).toBeUndefined();
    expect(landRate({}).appliedRate).toBe(0.7);
    expect((r.warnings ?? []).some((w) => w.includes("통산한"))).toBe(false);
  });

  it("RB-A2 (7) 나대지 2020 취득 → 2025-01 신축 → 2025-09 양도: 입력 없음 = 70% (기재부 재산세제과-1354 · 사전-2023-법규재산-0389)", () => {
    const r = run({ landAcquisitionDate: D("2020-01-01") });
    expect(r.calculatedTax).toBe(348_250_000);
    expect(landRate({ landAcquisitionDate: D("2020-01-01") }).appliedRate).toBe(0.7);
  });

  it("RB-A3 토지를 나중에 취득(토지 2025-03-01 > 신축 2025-01-01): max = 토지 취득일 — 변경 없음", () => {
    expect(resolveAppurtenantLandRateBasisDate(asset({ landAcquisitionDate: D("2025-03-01") }))).toEqual(D("2025-03-01"));
  });
});

describe("B) 합산 ≥2년 / 1~2년 / <1년 — 계획서 §3 프로토타입 실측과 같은 수치", () => {
  it("RB-B1 S1 구주택 17개월(토지 취득 때부터) + 신축 8개월 = 25 → 토지 기본세율 · 195,309,999 (현행 362,250,000 대비)", () => {
    const o = { landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) };
    const r = run(o);
    expect(r.calculatedTax).toBe(195_309_999);
    expect(landRate(o).appliedRate).not.toBe(0.7);
    expect(landRate(o).appliedRate).not.toBe(0.6);
    expect(landRate(o).clause).toBe("104-1-1");
    expect(r.splitDetail?.land.rateHoldingAggregation).toEqual({
      priorHouse: { from: "2022-01-01", to: "2023-05-31", months: 17 },
      newHouse: { from: "2025-01-01", to: "2025-09-01", months: 8 },
      totalMonths: 25,
      equivalentBasisDate: "2023-08-02",
      startRule: "land_basis",
    });
    expect(r.splitDetail?.land.appliedRateBasisDate).toBe("2023-08-02");
  });

  it("RB-B2 S2 구주택 7개월(later) + 신축 8개월 = 15 → 토지 60% · 315,249,999", () => {
    const o = { landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2023-01-01"), demolitionDate: D("2023-07-31") }) };
    const r = run(o);
    expect(r.calculatedTax).toBe(315_249_999);
    expect(landRate(o).appliedRate).toBe(0.6);
    expect(r.splitDetail?.land.rateHoldingAggregation?.totalMonths).toBe(15);
    expect(r.splitDetail?.land.rateHoldingAggregation?.startRule).toBe("input_date");
  });

  it("RB-B3 S3 구주택 2개월 + 신축 8개월 = 10 → 토지 70% (세액 불변이지만 통산 echo·고지는 난다)", () => {
    const o = { landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2023-01-01"), demolitionDate: D("2023-02-28") }) };
    const r = run(o);
    expect(r.calculatedTax).toBe(362_250_000);
    expect(landRate(o).appliedRate).toBe(0.7);
    expect(r.splitDetail?.land.rateHoldingAggregation?.totalMonths).toBe(10);
  });

  it("RB-B4 장기보유특별공제·건물 파트는 불변 — 토지 장특 30,000,000(토지 전체 보유 3년 6%)은 세 경우 모두 같다 (사전-2025-법규재산-0289: 장특은 토지 전체 보유기간)", () => {
    const base = run();
    for (const demolitionDate of [D("2023-05-31"), D("2023-02-28")]) {
      const r = run({ landRebuildPriorHouse: rb({ demolitionDate }) });
      expect(r.splitDetail?.land.longTermDeduction).toBe(30_000_000);
      expect(r.splitDetail?.land.longTermDeduction).toBe(base.splitDetail!.land.longTermDeduction);
      expect(r.splitDetail?.building).toEqual(base.splitDetail!.building);
      expect(r.taxBase).toBe(base.taxBase);
    }
  });

  it("RB-B5 통산 고지(세액 불변): 구간 2개·합산 개월·확인 필요(0097은 2년 이상만 직접 판단 · 비과세·장특 통산 별도)", () => {
    const w = (run({ landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2023-01-01"), demolitionDate: D("2023-07-31") }) }).warnings ?? []).find((x) => x.includes("통산한"));
    expect(w).toContain("7개월(2023-01-01~2023-07-31)");
    expect(w).toContain("8개월(2025-01-01~2025-09-01)");
    expect(w).toContain("15개월");
    expect(w).toContain("2년 미만 구간");
    expect(w).toContain("확인 필요");
    // 합산 2년 이상이면 확장 적용 문장은 빠진다
    const w2 = (run({ landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }).warnings ?? []).find((x) => x.includes("통산한"));
    expect(w2).not.toContain("2년 미만 구간");
  });
});

describe("C) 공사기간 제외(Q-1) · 일수 버림(Q-2) · 경계", () => {
  it("RB-C1 멸실~신축 취득일(나대지 2년)은 산입하지 않는다: 6개월 + 9개월 = 15 → 60% (공백 포함 시 ≥24로 기본세율)", () => {
    const o = {
      acquisitionDate: D("2024-07-01"),
      landRebuildPriorHouse: rb({ demolitionDate: D("2022-06-30") }),
      transferDate: D("2025-03-31"),
    };
    const agg = run(o).splitDetail?.land.rateHoldingAggregation;
    expect(agg?.priorHouse.months).toBe(6);
    expect(agg?.newHouse.months).toBe(9);
    expect(agg?.totalMonths).toBe(15);
    expect(landRate(o).appliedRate).toBe(0.6);
  });

  it("RB-C2 일수 버림: 11개월 29일 + 12개월 20일 → 11 + 12 = 23개월 (일수 합 49일 ≥ 30이어도 이월하지 않는다) → 60%", () => {
    // seg2: 2024-02-10 ~ 2025-02-28 = 12개월 19일(초일 산입), seg1: 2022-01-01 ~ 2022-12-30 = 11개월 30일
    const o = {
      acquisitionDate: D("2024-02-10"),
      transferDate: D("2025-02-28"),
      landRebuildPriorHouse: rb({ demolitionDate: D("2022-12-30") }),
    };
    const agg = run(o).splitDetail!.land.rateHoldingAggregation!;
    expect(agg.priorHouse.months + agg.newHouse.months).toBe(agg.totalMonths);
    expect(agg.priorHouse.months).toBe(11);
    expect(agg.newHouse.months).toBe(12);
    expect(agg.totalMonths).toBe(23);
    expect(landRate(o).appliedRate).toBe(0.6);
  });

  it("RB-C3 경계 M=24: 정확히 24개월이면 기본세율, 23개월이면 60% (구주택 12개월 + 신축 12개월 / 11개월)", () => {
    const mk = (demolitionDate: string) => ({
      acquisitionDate: D("2024-09-01"),
      transferDate: D("2025-08-31"), // 신축 12개월
      landRebuildPriorHouse: rb({ demolitionDate: D(demolitionDate) }),
    });
    const at24 = run(mk("2022-12-31")).splitDetail!.land.rateHoldingAggregation!;
    expect(at24.totalMonths).toBe(24);
    expect(landRate(mk("2022-12-31")).clause).toBe("104-1-1");
    const at23 = run(mk("2022-11-30")).splitDetail!.land.rateHoldingAggregation!;
    expect(at23.totalMonths).toBe(23);
    expect(landRate(mk("2022-11-30")).appliedRate).toBe(0.6);
  });

  it("RB-C4 경계 M=12: 12개월이면 60%, 11개월이면 70% (구주택 4개월 + 신축 8개월 / 3개월)", () => {
    const mk = (demolitionDate: string) => ({
      landRebuildPriorHouse: rb({ startMode: "later" as const, priorHouseStartDate: D("2023-01-01"), demolitionDate: D(demolitionDate) }),
    });
    expect(run(mk("2023-04-30")).splitDetail!.land.rateHoldingAggregation!.totalMonths).toBe(12);
    expect(landRate(mk("2023-04-30")).appliedRate).toBe(0.6);
    expect(run(mk("2023-03-31")).splitDetail!.land.rateHoldingAggregation!.totalMonths).toBe(11);
    expect(landRate(mk("2023-03-31")).appliedRate).toBe(0.7);
  });

  it("RB-C5 윤년: 2024-02-29 멸실·2024-02-29 구주택 시작 구간도 `calculateHoldingPeriod` 규약 그대로 개월을 센다", () => {
    const o = {
      acquisitionDate: D("2024-09-01"),
      landAcquisitionDate: D("2023-02-28"),
      landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2023-02-28"), demolitionDate: D("2024-02-29") }),
    };
    const agg = run(o).splitDetail!.land.rateHoldingAggregation!;
    expect(agg.priorHouse.months).toBe(months(D("2023-02-28"), D("2024-02-29")));
    expect(agg.priorHouse.months).toBe(12);
  });

  it("RB-C6 등가 기산일 격자: 양도일 4,000일 × 개월 0·1·6·11·12·13·17·23·24·25·36·150 전건 `calculateHoldingPeriod(E, 양도일)` 개월 = M (양도일 이후 기산일 없음)", () => {
    let bad = 0;
    for (let i = 0; i < 4000; i++) {
      const T = new Date(Date.UTC(2015, 0, 1) + i * 86_400_000);
      for (const M of [0, 1, 6, 11, 12, 13, 17, 23, 24, 25, 36, 150]) {
        const E = equivalentRateBasisDate(T, M);
        if (months(E, T) !== M || E.getTime() > T.getTime()) bad++;
      }
    }
    expect(bad).toBe(0);
  });
});

describe("D) 이월과세·상속·단순증여 토지와 결합 — 구주택 시작일 = 토지 법정 기산일 (since_land)", () => {
  it("RB-D1 토지 상속(피상속인 취득 2000-01-01): 구주택 시작 = 피상속인 취득일 (사전-2023-법규재산-0097 사실관계 형태)", () => {
    const input = asset({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("2000-01-01"),
      landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }),
    });
    const agg = calculateTransferTax(input, makeMockRates()).splitDetail!.land.rateHoldingAggregation!;
    expect(agg.priorHouse.from).toBe("2000-01-01");
    expect(agg.startRule).toBe("land_basis");
    expect(agg.totalMonths).toBe(months(D("2000-01-01"), D("2023-05-31")) + 8);
  });

  it("RB-D2 토지 상속 + later: 구주택 취득일이 피상속인 취득일보다 늦으면 입력일, 앞서면 피상속인 취득일 (부수토지 기간은 토지 보유기간을 넘지 못한다)", () => {
    const base = { landAcquisitionCause: "inheritance" as const, landDecedentAcquisitionDate: D("2000-01-01") };
    const late = calculateTransferTax(asset({ ...base, landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2010-01-01"), demolitionDate: D("2023-05-31") }) }), makeMockRates());
    expect(late.splitDetail!.land.rateHoldingAggregation!.priorHouse.from).toBe("2010-01-01");
    expect(late.splitDetail!.land.rateHoldingAggregation!.startRule).toBe("input_date");
    const early = calculateTransferTax(asset({ ...base, landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("1995-01-01"), demolitionDate: D("2023-05-31") }) }), makeMockRates());
    expect(early.splitDetail!.land.rateHoldingAggregation!.priorHouse.from).toBe("2000-01-01");
    expect(early.splitDetail!.land.rateHoldingAggregation!.startRule).toBe("land_basis");
  });

  it("RB-D3 토지 이월과세(carryover_gift, 증여자 취득 2019-01-01): 구주택 시작 = 증여자 취득일 (§104②2호)", () => {
    const input = asset({
      landAcquisitionCause: "carryover_gift",
      landDonorAcquisitionDate: D("2019-01-01"),
      landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }),
    });
    expect(resolveAppurtenantLandRateBasisDate(input)).toEqual(equivalentRateBasisDate(D("2025-09-01"), months(D("2019-01-01"), D("2023-05-31")) + 8));
  });

  it("RB-D4 토지 단순 증여(gift): 통산 없음 — 구주택 시작 = 증여일(토지 취득일)", () => {
    const input = asset({ landAcquisitionCause: "gift", landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) });
    const agg = calculateTransferTax(input, makeMockRates()).splitDetail!.land.rateHoldingAggregation!;
    expect(agg.priorHouse.from).toBe("2022-01-01");
  });
});

describe("E) 입력 검증 leaf — 엔진 진입·⑫·⑧ 공유 (UI 통과 ↔ 400 모순 방지의 단일 소스)", () => {
  const rejects = (o: Partial<TransferTaxInput>, needle: string) =>
    expect(() => run(o)).toThrow(needle);

  it("RB-E1 정착면적 확인이 true가 아니면 계산하지 않는다 (자동 안분 금지)", () => {
    rejects({ landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31"), footprintUnchanged: false }) }, "정착면적이 구주택보다 늘어난");
  });
  it("RB-E2 later인데 구주택 취득일 없음 / since_land인데 취득일 있음 (자동 채움·잔재 금지)", () => {
    rejects({ landRebuildPriorHouse: rb({ startMode: "later", demolitionDate: D("2023-05-31") }) }, "구주택 취득일(본인 소유 개시일)이 필요");
    rejects({ landRebuildPriorHouse: rb({ priorHouseStartDate: D("2022-06-01"), demolitionDate: D("2023-05-31") }) }, "함께 보낼 수 없습니다");
  });
  it("RB-E3 날짜 순서 위반: 멸실일 < 토지 취득일 / 멸실일 ≥ 신축 취득일 / 구주택 시작 > 멸실", () => {
    rejects({ landRebuildPriorHouse: rb({ demolitionDate: D("2021-12-31") }) }, "날짜 순서");
    rejects({ landRebuildPriorHouse: rb({ demolitionDate: D("2025-01-01") }) }, "날짜 순서");
    rejects({ landRebuildPriorHouse: rb({ startMode: "later", priorHouseStartDate: D("2023-06-01"), demolitionDate: D("2023-05-31") }) }, "날짜 순서");
  });
  it("RB-E3b leaf 직접: 멸실일 = 신축 취득일은 위반(strict) · 하루 전은 통과 — 엔진 aggregator의 같은 경계와 별개로 ⑫·⑧이 쓰는 leaf가 막는다", () => {
    const f = (demolitionDate: Date) => collectLandRebuildIssues(landRebuildFactsOfInput(asset({ landRebuildPriorHouse: rb({ demolitionDate }) })));
    expect(f(D("2025-01-01")).map((i) => i.field)).toEqual(["landRebuildPriorHouse.demolitionDate"]);
    expect(f(D("2024-12-31"))).toEqual([]);
  });
  it("RB-E4 호스트: 건물 취득원인이 신축·매매가 아니면 / 토지 취득일 없으면 / 소유자 분리면 거부", () => {
    // 건물 원인이 신축·매매(+ 토지 취득일 분리)가 아니면 거부 — 상속·증여·이월과세·부담부증여(매매는 H절에서 받는다)
    // (엔진 진입은 토지 취득원인 leaf가 먼저 던지는 조합이 있어, 통산 leaf 문구는 leaf 직접으로 단언한다)
    for (const acquisitionCause of ["inheritance", "gift", "carryover_gift", "burdened_gift"] as const) {
      const f = landRebuildFactsOfInput(asset({ acquisitionCause, landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }));
      expect(collectLandRebuildIssues(f).map((i) => i.message).join("|"), acquisitionCause).toContain("상속·증여·이월과세로 받은 건물은 받지 않습니다");
    }
    rejects({ selfOwns: "land_only", landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }, "소유자가 갈리는");
    const f = landRebuildFactsOfInput(asset({ landAcquisitionDate: undefined, landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }));
    expect(collectLandRebuildIssues(f).map((i) => i.field)).toContain("landAcquisitionDate");
  });
  it("RB-E5 비주택(일반건물)·컴패니언 자리는 거부 — 침묵 무시 금지", () => {
    const f = landRebuildFactsOfInput(asset({ propertyType: "building", landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }));
    expect(collectLandRebuildIssues(f).map((i) => i.message).join("|")).toContain("주택(토지·건물 취득일이 다른 분리 계산)");
    const c = collectLandRebuildIssues({ ...landRebuildFactsOfInput(asset({ landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) })), hostSupported: false });
    expect(c.some((i) => i.message.includes("함께 양도"))).toBe(true);
  });
  it("RB-E6 입력이 없으면 검증은 아무것도 보지 않는다 (회귀 0)", () => {
    expect(collectLandRebuildIssues(landRebuildFactsOfInput(asset({ acquisitionCause: "purchase", selfOwns: "land_only" })))).toEqual([]);
  });
});

describe("F) 비과세와의 관계 — 비과세 판정은 신축일 기준 그대로 (통산 확장은 별건 · 고지만)", () => {
  it("RB-F1 1세대1주택 12억 이하(신축 보유 3년 8개월) 전액 비과세: 입력 유무와 무관하게 비과세 · 세액 0", () => {
    const o = {
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D("2022-01-01"),
      landAcquisitionDate: D("2020-01-01"),
    };
    const base = run(o);
    const withRebuild = run({ ...o, landRebuildPriorHouse: rb({ demolitionDate: D("2021-06-30") }) });
    expect(base.isExempt).toBe(true);
    expect(withRebuild.isExempt).toBe(true);
    expect(withRebuild.calculatedTax).toBe(base.calculatedTax);
  });

  it("RB-F2 1세대1주택이지만 신축 보유 2년 미만(8개월)이면 과세 — 비과세 보유기간에 구주택 기간을 통산하지 않는다(영 §154⑧ 별건): 비과세 불성립은 입력 유무와 같다", () => {
    const o = { isOneHousehold: true, householdHousingCount: 1 };
    expect(run(o).isExempt).toBe(false);
    expect(run({ ...o, landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }).isExempt).toBe(false);
  });
});

describe("G) 표시 — 환산 기산일을 실제 취득일로 오독하게 두지 않는다", () => {
  it("RB-G1 통산 echo가 있으면 「세율 기산일」 보조 문구는 두 구간과 합산 개월을 밝힌다 (주택 취득일부터 문구 금지)", () => {
    const land = run({ landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) }).splitDetail!.land;
    const note = splitRateBasisNote(land, "newConstruction");
    expect(note).toContain("구주택 부수토지 17개월(2022-01-01~2023-05-31)");
    expect(note).toContain("신축주택 부수토지 8개월(2025-01-01~2025-09-01)");
    expect(note).toContain("25개월 통산");
    expect(note).not.toContain("주택 취득일부터");
    // 입력이 없는 토지 파트는 종전 문구(법정 기산일과 적용 기산일 비교)를 그대로 쓴다
    const plain = splitRateBasisNote(run().splitDetail!.land, "newConstruction");
    expect(plain).toContain("주택부수토지로서의 보유기간");
  });
});

describe("H) 매매 호스트 — 매수한 토지 + 그 위에 신축한 주택 (서면법규과-1222 사실관계 · 「토지·건물 취득일 다름」 경로)", () => {
  // 시드: 토지 매수 2022-01-01 · 구주택 멸실 · 신축 취득(사용승인) 2025-01-01 = 건물 취득일 · 양도 2025-09-01. 건물 취득원인 purchase.
  const purchase = (o: Partial<TransferTaxInput> = {}) => ({ acquisitionCause: "purchase" as const, ...o });

  it("RB-H1 서면법규과-1222형: 구주택 17개월(2022-01-01~2023-05-31) + 신축 8개월 = 25 → 토지 기본세율(104-1-1) · 195,309,999 — 신축 호스트(RB-B1)와 같은 값", () => {
    const o = purchase({ landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) });
    const r = run(o);
    expect(r.calculatedTax).toBe(195_309_999);
    expect(landRate(o).clause).toBe("104-1-1");
    expect([0.7, 0.6]).not.toContain(landRate(o).appliedRate);
    expect(r.splitDetail?.land.rateHoldingAggregation).toEqual({
      priorHouse: { from: "2022-01-01", to: "2023-05-31", months: 17 },
      newHouse: { from: "2025-01-01", to: "2025-09-01", months: 8 },
      totalMonths: 25,
      equivalentBasisDate: "2023-08-02",
      startRule: "land_basis",
    });
    expect(r.splitDetail?.land.acquisitionCause).toBe("purchase");
    expect(r.splitDetail?.building.acquisitionDate).toBe("2025-01-01");
    expect(run({ landRebuildPriorHouse: o.landRebuildPriorHouse }).calculatedTax).toBe(r.calculatedTax);
  });

  it("RB-H2 같은 사례에서 입력이 없으면 현행 결과 — 토지 70%(신축일 기산) · 362,250,000", () => {
    const o = purchase();
    const r = run(o);
    expect(r.calculatedTax).toBe(362_250_000);
    expect(landRate(o).appliedRate).toBe(0.7);
    expect(r.splitDetail?.land.rateHoldingAggregation).toBeUndefined();
    expect(r.splitDetail?.land.appliedRateBasisDate).toBe("2025-01-01");
  });

  // 신축 8개월 고정. 구주택 개월을 바꿔 합산 경계(24/23, 12/11)를 건드린다 — 멸실일 = 시작 + (개월)에서 하루 전.
  it.each([
    ["24개월(16+8) — 기본세율", "since_land", undefined, "2023-04-30", 24, "104-1-1"],
    ["23개월(15+8) — 60%", "since_land", undefined, "2023-03-31", 23, "104-1-2"],
    ["12개월(4+8) — 60%", "later", "2023-01-01", "2023-04-30", 12, "104-1-2"],
    ["11개월(3+8) — 70%", "later", "2023-01-01", "2023-03-31", 11, "104-1-3"],
  ] as const)("RB-H3 경계 %s", (_n, startMode, start, demolition, total, clause) => {
    const o = purchase({
      landRebuildPriorHouse: rb({ startMode, ...(start ? { priorHouseStartDate: D(start) } : {}), demolitionDate: D(demolition) }),
    });
    const r = run(o);
    expect(r.splitDetail?.land.rateHoldingAggregation?.totalMonths).toBe(total);
    expect(landRate(o).clause).toBe(clause);
    // 신축 호스트와 같은 세율 판정
    expect(landRate({ ...o, acquisitionCause: "newConstruction" }).clause).toBe(clause);
  });

  it("RB-H4 상속·증여·이월과세·부담부증여 건물 원인은 거부 · 건물 매매 + 토지 상속·증여 overlay도 거부(건물을 산 것이지 신축이 아니다)", () => {
    const input = { landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) };
    const leafMsg = (o: Partial<TransferTaxInput>) => collectLandRebuildIssues(landRebuildFactsOfInput(asset({ ...input, ...o }))).map((i) => i.message).join("|");
    for (const acquisitionCause of ["inheritance", "gift", "carryover_gift", "burdened_gift"] as const) {
      expect(leafMsg({ acquisitionCause }), acquisitionCause).toContain("상속·증여·이월과세로 받은 건물은 받지 않습니다");
    }
    // D2(건물 상속·증여 + 토지 매매)도 건물 원인이 매매가 아니라 같은 문구로 거부
    expect(leafMsg({ acquisitionCause: "inheritance", landAcquisitionCause: "purchase" })).toContain("상속·증여·이월과세로 받은 건물은 받지 않습니다");
    for (const landAcquisitionCause of ["inheritance", "gift", "carryover_gift"] as const) {
      expect(leafMsg({ acquisitionCause: "purchase", landAcquisitionCause }), landAcquisitionCause).toContain("건물을 산 것이지 같은 토지 위에 신축한 것이 아닙니다");
    }
    // 신축 호스트는 토지 overlay가 호스트의 전제라 같은 overlay를 막지 않는다(회귀)
    expect(leafMsg({ acquisitionCause: "newConstruction", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: D("2010-01-01") })).toBe("");
    // D2 호스트 잔재 landAcquisitionCause: purchase는 overlay가 아니다
    expect(leafMsg({ acquisitionCause: "purchase", landAcquisitionCause: "purchase" })).toBe("");
  });

  it("RB-H5 매매 호스트 + 토지 취득일 없음 / 소유자 분리 / 비주택은 신축 호스트와 같이 거부", () => {
    const input = { landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) };
    expect(() => run({ ...input, acquisitionCause: "purchase", selfOwns: "land_only" })).toThrow("소유자가 갈리는");
    const f = landRebuildFactsOfInput(asset({ ...input, acquisitionCause: "purchase", landAcquisitionDate: undefined }));
    expect(collectLandRebuildIssues(f).map((i) => i.field)).toContain("landAcquisitionDate");
    expect(collectLandRebuildIssues(landRebuildFactsOfInput(asset({ ...input, acquisitionCause: "purchase", propertyType: "building" }))).length).toBeGreaterThan(0);
  });

  // 매매 하위 모드와의 상호작용(UI 설계 R-5 근거) — 통산은 세율 기산일 축 하나만 바꾸므로 취득가액 산정 방식·양도가액 구분·배율 초과·비과세·PHD·1990 이전 토지와 독립이다.
  // 모든 변형에서 매매 호스트 = 신축 호스트(같은 입력) — 한쪽만 다르면 이 매트릭스가 깨진다.
  const MODES: [string, Partial<TransferTaxInput>][] = [
    ["건물 환산취득가", { buildingAcqMode: "estimated", standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000 }],
    ["토지 매매사례가액", { landAcqMode: "salesCase", landSalesCaseValue: 200_000_000, standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000 }],
    ["양도가액 기준시가 안분", { saleSplitMode: "apportioned", landTransferPrice: undefined, buildingTransferPrice: undefined }],
    ["배율 초과분 분리(3배 지역)", { buildingFootprintArea: 50, appurtenantLandZone: "metropolitan_residential", acquisitionArea: 400, transferArea: 400 }],
    ["1세대1주택(신축 보유 8개월 → 과세)", { isOneHousehold: true, householdHousingCount: 1 }],
    ["1990 이전 취득 토지", { landAcquisitionDate: D("1988-01-01") }],
  ];
  it.each(MODES)("RB-H6 매매 하위 모드 — %s: 매매 호스트 = 신축 호스트(세액·통산 echo)", (_n, mode) => {
    const rebuild = { landRebuildPriorHouse: rb({ demolitionDate: D("2023-05-31") }) };
    const a = run({ ...mode, ...rebuild });
    const b = run({ ...mode, ...rebuild, acquisitionCause: "purchase" });
    expect(b.calculatedTax).toBe(a.calculatedTax);
    expect(b.splitDetail?.land.rateHoldingAggregation).toEqual(a.splitDetail?.land.rateHoldingAggregation);
    expect(b.splitDetail?.land.rateHoldingAggregation).toBeDefined();
    expect((b.warnings ?? []).filter((w) => w.includes("통산한"))).toEqual((a.warnings ?? []).filter((w) => w.includes("통산한")));
  });
});
