/**
 * anchor — 겸용주택 **별개 취득 파트 모델**(B1) 엔진·⑫ 보강.
 *
 * 짝: `__tests__/api/transfer.route.mixed-use-separate-acq-per-part.b1.predo.anchor.test.ts`(4×4 모드·계약액·PHD·단서·가드·Route).
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md`
 *
 * 이 파일이 고정하는 것
 *  · leaf 술어 `mixedPartAcqNeeds` 표 · 기존 필수 술어 3개의 **AND**(파트 모델이 아니면 불변)
 *  · 결합 제외 X-1~X-7 목록(코드·경로) — 엔진 throw·⑫가 같은 목록을 쓴다
 *  · 실가 파트의 실제 필요경비(U-1·U-2) · 감정·매매사례 파트의 개산공제만 · 환산 묶음 단서(한쪽만 환산)
 *  · 필수값이 없어도 계산되는 조합(양쪽 실가 + 계약액) · 지분·미등기 개산공제 · echo
 *
 * 기대값은 독립 산식(BigInt 정수 나눗셈·하드 리터럴)이다 — 엔진 함수를 부르지 않는다(`ap`).
 * fixture는 가상(실제 신고 사례 아님). 세액은 mock 세율표 기준.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import {
  collectMixedPartAcqIssues,
  isMixedExpenseDeclared,
  isMixedUsePerPartAcq,
  mixedPartAcqNeeds,
  mixedPartAcqNeedsOf,
} from "@/lib/tax-engine/mixed-use-part-acq";
import { isBuildingDayLandPriceRequired } from "@/lib/tax-engine/mixed-use-acq-date";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
} from "@/lib/tax-engine/mixed-use-housing-std";
import { mixedUseAssetSchema } from "@/lib/api/transfer-tax-schema-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const PRICE = 3_000_000_000;

function base(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2005-06-10"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
      housingBuildingPrice: 800_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      landPricePerSqmAtBuildingAcq: 1_800_000,
      housingBuildingPrice: 320_000_000,
    },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
const AA = { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 } as const;
/** 취득시 기준시가가 하나도 없는 입력 — 양쪽 실가 + 계약액이면 쓰이지 않아야 한다. */
const NO_ACQ_STD = { housingPrice: undefined, commercialBuildingPrice: 0, landPricePerSqm: 0 };

/** 독립 재구현 — BigInt 정수 나눗셈(floor), 잔액 흡수. 엔진 `apportionByStdPrice`와 구현이 겹치지 않는다. */
const ap = (total: number, a: number, b: number) => {
  const l = Number((BigInt(total) * BigInt(a)) / BigInt(a + b));
  return [l, total - l] as const;
};
const pct3 = (v: number) => Math.floor((v * 3) / 100);

function run(asset: MixedUseAssetInput) {
  const r = calcMixedUseTransferTax(PRICE, TD, asset, rates);
  const h = r.housingPart;
  const c = r.commercialPart;
  return {
    h: { acq: [h.landAcqPrice, h.buildingAcqPrice], ded: [h.landAppraisalDed, h.buildingAppraisalDed] },
    c: { acq: [c.landAcqPrice, c.buildingAcqPrice], ded: [c.landAppraisalDed, c.buildingAppraisalDed] },
    raw: r,
  };
}

// 취득시 경비 안분 축(독립 도출) — 취득시 주택 H_A 400M : 상가(토지 120M + 건물 80M) 200M, γ1 basis 96M/256M · 상가 120M/80M
const capexShares = (capex: number) => {
  const [h, c] = ap(capex, 400_000_000, 200_000_000);
  return { hl: ap(h, 96_000_000, 256_000_000)[0], hb: h - ap(h, 96_000_000, 256_000_000)[0], cl: ap(c, 120_000_000, 80_000_000)[0], cb: c - ap(c, 120_000_000, 80_000_000)[0] };
};
// 양도비 안분 축(독립 도출) — 양도시 주택 H_T 1.6B : 상가(토지 12M×100㎡ + 건물 100M) 1.3B, 주택 토지:건물 = 960M:640M · 상가 1.2B:100M
const transferShares = (exp: number) => {
  const [h, c] = ap(exp, 1_600_000_000, 1_300_000_000);
  const [hl] = ap(h, 960_000_000, 640_000_000);
  const [cl] = ap(c, 1_200_000_000, 100_000_000);
  return { hl, hb: h - hl, cl, cb: c - cl };
};

// ═══════════════════════════════════════════════════════════════════════
describe("leaf — mixedPartAcqNeeds (무엇이 쓰이는가 = 무엇이 필수인가)", () => {
  const T = mixedPartAcqNeeds;
  const m = (land: PartAcqMode, building: PartAcqMode) => ({ land, building });

  it("N-1 양쪽 실가 + 계약액 + 취득측 경비 없음 → 취득시 기준시가 축 전부 불요", () => {
    expect(T({ modes: m("actual", "actual"), buildingContractDeclared: true })).toEqual({
      housingPriceAtAcq: false, landPricePerSqmAtBuildingDay: false, housingBuildingStdAtAcq: false, commercialStdAtAcq: false,
    });
  });
  it("N-2 양쪽 실가 + 계약액 없음(S-2 나목비) → 나목·상가 취득시만 필요, H_A·L_b는 불요", () => {
    expect(T({ modes: m("actual", "actual") })).toEqual({
      housingPriceAtAcq: false, landPricePerSqmAtBuildingDay: false, housingBuildingStdAtAcq: true, commercialStdAtAcq: true,
    });
  });
  it("N-3 하나라도 비-실가(감정·매매사례·환산)면 전부 필요 — 개산공제·환산 basis(γ1)가 H_A·L_b·N에서 온다", () => {
    for (const other of ["appraisal", "salesCase", "estimated"] as const) {
      expect(T({ modes: m("actual", other), buildingContractDeclared: true })).toEqual({
        housingPriceAtAcq: true, landPricePerSqmAtBuildingDay: true, housingBuildingStdAtAcq: true, commercialStdAtAcq: true,
      });
      expect(T({ modes: m(other, "actual"), buildingContractDeclared: true }).housingPriceAtAcq).toBe(true);
    }
  });
  it("N-4 취득측 경비 선언이면 양쪽 실가 + 계약액이라도 전부 필요(경비를 취득시 기준시가로 안분)", () => {
    expect(T({ modes: m("actual", "actual"), buildingContractDeclared: true, expenseDeclared: true })).toEqual({
      housingPriceAtAcq: true, landPricePerSqmAtBuildingDay: true, housingBuildingStdAtAcq: true, commercialStdAtAcq: true,
    });
  });
  it("N-5 PHD는 H_A·L_b·나목을 대체(주택측 불요) — 상가 취득시는 그대로", () => {
    expect(T({ modes: m("actual", "estimated"), usePhd: true })).toEqual({
      housingPriceAtAcq: false, landPricePerSqmAtBuildingDay: false, housingBuildingStdAtAcq: false, commercialStdAtAcq: true,
    });
  });
  it("N-6 파트 모델이 아니면(separateAcquisition 부재) mixedPartAcqNeedsOf는 undefined — 기존 술어 불변", () => {
    expect(mixedPartAcqNeedsOf({})).toBeUndefined();
    expect(isMixedUsePerPartAcq({})).toBe(false);
    expect(isMixedUsePerPartAcq({ separateAcquisition: AA })).toBe(true);
  });
  it("N-7 U-1: 취득측 경비 선언 = 자본적지출>0 ∨ 주택분 직접 경비>0 ∨ 상가분 직접 경비>0 (양도비는 제외 — 양도시 기준시가로 나뉜다)", () => {
    expect(isMixedExpenseDeclared({})).toBe(false);
    expect(isMixedExpenseDeclared({ capitalExpenditure: 0 })).toBe(false);
    expect(isMixedExpenseDeclared({ capitalExpenditure: 1 })).toBe(true);
    expect(isMixedExpenseDeclared({ housingInheritedExpense: 1 })).toBe(true);
    expect(isMixedExpenseDeclared({ commercialInheritedExpense: 1 })).toBe(true);
    // 파트 모델 needs는 transferExpense를 보지 않는다
    expect(mixedPartAcqNeedsOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 300_000_000 } })!.housingPriceAtAcq).toBe(false);
  });
});

describe("기존 필수 술어 3개 — 산정방식 입력 AND (파트 모델이 아니면 불변)", () => {
  const none = { housingPriceAtAcq: false, landPricePerSqmAtBuildingDay: false, housingBuildingStdAtAcq: false, commercialStdAtAcq: false };
  const all = { housingPriceAtAcq: true, landPricePerSqmAtBuildingDay: true, housingBuildingStdAtAcq: true, commercialStdAtAcq: true };
  const dates = { landDate: "2005-06-10", buildingDate: "2010-03-15", housingPrice: 400_000_000 };

  it("PR-1 isBuildingDayLandPriceRequired: needs 미지정=종전(true) · needs.L_b=false면 false · true면 true", () => {
    expect(isBuildingDayLandPriceRequired(dates)).toBe(true);
    expect(isBuildingDayLandPriceRequired({ ...dates, partAcqNeeds: none })).toBe(false);
    expect(isBuildingDayLandPriceRequired({ ...dates, partAcqNeeds: all })).toBe(true);
    // AND — needs가 참이어도 기존 조건(두 날짜 다름)이 거짓이면 거짓
    expect(isBuildingDayLandPriceRequired({ ...dates, buildingDate: "2005-06-10", partAcqNeeds: all })).toBe(false);
  });
  it("PR-2 isHousingPriceAtAcqRequired: 같은 AND", () => {
    expect(isHousingPriceAtAcqRequired({})).toBe(true);
    expect(isHousingPriceAtAcqRequired({ partAcqNeeds: none })).toBe(false);
    expect(isHousingPriceAtAcqRequired({ partAcqNeeds: all })).toBe(true);
    expect(isHousingPriceAtAcqRequired({ partAcqNeeds: all, byInheritanceOrGift: true })).toBe(false);
  });
  it("PR-3 isHousingBuildingStdAtAcqRequired: 같은 AND · 양도시 술어는 needs를 보지 않는다", () => {
    expect(isHousingBuildingStdAtAcqRequired({})).toBe(true);
    expect(isHousingBuildingStdAtAcqRequired({ partAcqNeeds: none })).toBe(false);
    expect(isHousingBuildingStdAtAcqRequired({ partAcqNeeds: all })).toBe(true);
    expect(isHousingBuildingStdAtTransferRequired({ partAcqNeeds: none })).toBe(true);
  });
});

describe("결합 제외 X-1~X-7 목록 (엔진 throw · ⑫ superRefine · ⑧이 같은 목록을 쓴다)", () => {
  const issuesOf = (over: Record<string, unknown>) => collectMixedPartAcqIssues(base({ separateAcquisition: AA, ...over }));
  const codes = (over: Record<string, unknown>) => issuesOf(over).map((i) => i.code);

  it("X-0 파트 모델이 아니면 어떤 조합도 이 목록이 막지 않는다(총액 모델 현행 가드는 별개)", () => {
    expect(collectMixedPartAcqIssues(base({ partialUsageChange: { direction: "house_to_commercial" }, acquisitionByInheritance: true }))).toEqual([]);
  });
  it("정상 입력은 이슈 없음", () => {
    expect(issuesOf({})).toEqual([]);
  });
  it("X-1 용도변경 · X-2 공익수용 · X-3 상속/증여 · X-4 총액 플래그 3종 · X-5 같은 날", () => {
    expect(codes({ partialUsageChange: { direction: "house_to_commercial" } })).toContain("X-1");
    expect(codes({ transferCause: "public_expropriation" })).toContain("X-2");
    expect(codes({ acquisitionByInheritance: true })).toContain("X-3");
    expect(codes({ acquisitionByGift: true })).toContain("X-3");
    expect(issuesOf({ useActualAcquisition: true }).map((i) => i.path[0])).toEqual(["useActualAcquisition"]);
    expect(issuesOf({ useAppraisalSalesAcquisition: true }).map((i) => i.path[0])).toEqual(["useAppraisalSalesAcquisition"]);
    expect(issuesOf({ acquisitionActualTotalPrice: 900_000_000 }).map((i) => i.path[0])).toEqual(["acquisitionActualTotalPrice"]);
    expect(codes({ landAcquisitionDate: D("2010-03-15") })).toEqual(["X-5"]);
  });
  it("X-6 값 누락 — 모드별 값 필드·경로 · 계약액 ≥ 총액 · 감정/매매사례에 계약액", () => {
    const sepOf = (s: Record<string, unknown>) => collectMixedPartAcqIssues(base({ separateAcquisition: s }));
    expect(sepOf({ landMode: "actual", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 }).map((i) => i.path.join("."))).toEqual(["separateAcquisition.landAcquisitionPrice"]);
    expect(sepOf({ landMode: "salesCase", buildingMode: "actual", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 }).map((i) => i.path.join("."))).toEqual(["separateAcquisition.landSalesCaseValue"]);
    expect(sepOf({ landMode: "actual", buildingMode: "appraisal", landAcquisitionPrice: 500_000_000 }).map((i) => i.path.join("."))).toEqual(["separateAcquisition.buildingAcquisitionPrice"]);
    // 환산 파트는 값이 필요 없다(현행 환산값)
    expect(sepOf({ landMode: "estimated", buildingMode: "estimated" })).toEqual([]);
    // 쓰이지 않는 값 필드는 무시된다(환산 파트에 값이 남아 있어도 통과 — ④는 활성 모드 값만 싣는다)
    expect(sepOf({ landMode: "estimated", buildingMode: "estimated", landAcquisitionPrice: 1 })).toEqual([]);
    expect(issuesOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 400_000_000 } }).map((i) => i.code)).toEqual(["X-6"]);
    expect(issuesOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 450_000_000 } }).map((i) => i.code)).toEqual(["X-6"]);
    expect(issuesOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 399_999_999 } })).toEqual([]);
    expect(issuesOf({ separateAcquisition: { ...AA, buildingMode: "appraisal", housingBuildingContractPrice: 300_000_000 } }).map((i) => i.code)).toEqual(["X-6"]);
    // 0·미입력 계약액 = 계약액 없음(나목 비율)
    expect(issuesOf({ separateAcquisition: { ...AA, housingBuildingContractPrice: 0 } })).toEqual([]);
  });
  it("X-7 PHD인데 환산 파트가 없음 · 나목 비율에 필요한 PHD 건물 기준시가 누락", () => {
    expect(codes({ usePreHousingDisclosure: true })).toEqual(["X-7"]);
    const estB = { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 300_000_000 } as const;
    expect(collectMixedPartAcqIssues(base({ separateAcquisition: estB, usePreHousingDisclosure: true }))).toEqual([]);
    // 토지 환산 + 건물 실가(계약액 없음)면 S-2 나목 = PHD 건물 취득일 주택건물 기준시가 — 없으면 막는다
    const estL = { landMode: "estimated", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 } as const;
    expect(collectMixedPartAcqIssues(base({ separateAcquisition: estL, usePreHousingDisclosure: true })).map((i) => i.path.join("."))).toEqual(["preHousingDisclosure.buildingStdPriceAtAcquisition"]);
    expect(
      collectMixedPartAcqIssues(base({ separateAcquisition: estL, usePreHousingDisclosure: true, preHousingDisclosure: { buildingStdPriceAtAcquisition: 50_000_000 } })),
    ).toEqual([]);
  });
  it("엔진은 같은 목록의 첫 이슈로 throw — 값 누락을 다른 값으로 대신하지 않는다", () => {
    expect(() => run(base({ separateAcquisition: { landMode: "actual", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 } }))).toThrow(/토지 실거래가를 입력하세요/);
    expect(() => run(base({ separateAcquisition: { ...AA, buildingMode: "appraisal" }, usePreHousingDisclosure: true }))).toThrow(/미공시/);
  });
});

describe("실가 파트의 실제 필요경비 · 감정/매매사례 파트의 개산공제만 (§97②1호 가산 / 2호 본문)", () => {
  it("EX-1 양쪽 실가 + 자본적지출·양도비 → 4부분 경비 몫이 독립 산식과 일치하고 총액 모델(실가 총액)의 경비 몫과도 같다", () => {
    const capex = 600_000_000, tExp = 30_000_000;
    const r = run(base({ separateAcquisition: AA, capitalExpenditure: capex, transferExpense: tExp }));
    const a = capexShares(capex), t = transferShares(tExp);
    expect(r.h.ded).toEqual([a.hl + t.hl, a.hb + t.hb]);
    expect(r.c.ded).toEqual([a.cl + t.cl, a.cb + t.cb]);
    expect(r.h.ded).toEqual([119_021_943, 297_529_781]);
    expect(r.c.ded).toEqual([132_413_793, 81_034_483]);
    // 단서는 환산 파트가 없어 비교 자체를 하지 않는다
    expect(r.raw.necessaryExpenseProviso).toBeUndefined();
    expect(r.raw.separateAcquisition!.provisoGroup).toBeUndefined();
    // 같은 경비의 총액 모델(실가 총액)과 경비 몫이 같다 — 파트 모델이 새 안분 규칙을 만들지 않았다
    const total = run(base({ useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000, capitalExpenditure: capex, transferExpense: tExp }));
    expect(r.h.ded).toEqual(total.h.ded);
    expect(r.c.ded).toEqual(total.c.ded);
  });

  it("EX-2 주택분 직접 경비(housingInheritedExpense=U-2): 토지 실가 파트만 그 몫을 가산, 건물 감정 파트는 개산공제만", () => {
    const direct = 50_000_000;
    const r = run(base({ separateAcquisition: { ...AA, buildingMode: "appraisal" }, housingInheritedExpense: direct }));
    const [dl] = ap(direct, 96_000_000, 256_000_000);
    expect(r.h.ded).toEqual([dl, pct3(256_000_000)]); // 13,636,363 · 7,680,000 — 직접 경비의 건물 몫은 감정 파트라 반영하지 않는다
    expect(r.h.ded[0]).toBe(13_636_363);
    expect(r.c.ded).toEqual([0, pct3(80_000_000)]);
  });

  it("EX-3 감정 + 감정 + 큰 자본적지출: 경비 미반영·단서 대상 아님 — 개산공제만, 단서 없음", () => {
    const r = run(base({ separateAcquisition: { landMode: "appraisal", buildingMode: "appraisal", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 }, capitalExpenditure: 900_000_000 }));
    expect(r.h.ded).toEqual([pct3(96_000_000), pct3(256_000_000)]);
    expect(r.c.ded).toEqual([pct3(120_000_000), pct3(80_000_000)]);
    expect(r.raw.necessaryExpenseProviso).toBeUndefined();
    expect(r.h.acq).toEqual([250_000_000, 320_000_000]);
  });

  it("EX-4 필수값이 하나도 없어도 계산된다(양쪽 실가 + 계약액 + 취득측 경비 없음 — 취득시 기준시가 전무) · 양도비 몫은 양도시 축으로만 나뉜다", () => {
    const sepc = { ...AA, housingBuildingContractPrice: 300_000_000 };
    const withStd = run(base({ separateAcquisition: sepc }));
    const noStd = run(base({ separateAcquisition: sepc, acquisitionStandardPrice: NO_ACQ_STD }));
    expect(noStd.h.acq).toEqual([250_000_000, 300_000_000]);
    expect(noStd.c.acq).toEqual([250_000_000, 100_000_000]);
    expect(noStd.h.acq).toEqual(withStd.h.acq);
    expect(noStd.raw.total.transferTax).toBe(withStd.raw.total.transferTax);
    const t = transferShares(30_000_000);
    const withT = run(base({ separateAcquisition: sepc, acquisitionStandardPrice: NO_ACQ_STD, transferExpense: 30_000_000 }));
    expect(withT.h.ded).toEqual([t.hl, t.hb]);
    expect(withT.c.ded).toEqual([t.cl, t.cb]);
  });

  it("EX-6 H_A는 있고 L_b(건물 취득일 공시지가)만 없어도 양쪽 실가면 계산된다 — γ1 basis가 쓰이지 않는 조합에서 거짓 요구를 만들지 않는다", () => {
    const sepc = { ...AA, housingBuildingContractPrice: 300_000_000 };
    const { landPricePerSqmAtBuildingAcq: _drop, ...noLb } = (base().acquisitionStandardPrice as unknown) as Record<string, number>;
    void _drop;
    const r = run(base({ separateAcquisition: sepc, acquisitionStandardPrice: noLb }));
    expect(r.h.acq).toEqual([250_000_000, 300_000_000]);
    // 감정 파트가 있으면 같은 입력이 차단된다(L_b가 γ1 분모의 가목) — 다른 값으로 대신하지 않는다
    expect(() => run(base({ separateAcquisition: { ...sepc, landMode: "appraisal", housingBuildingContractPrice: undefined }, acquisitionStandardPrice: noLb }))).toThrow(/landPricePerSqmAtBuildingAcq/);
  });

  it("EX-5 양쪽 실가 + 계약액 없음인데 나목이 없으면 throw(자동 안분 fallback 금지)", () => {
    expect(() =>
      run(base({ separateAcquisition: AA, acquisitionStandardPrice: { ...NO_ACQ_STD, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 } })),
    ).toThrow(/주택건물 기준시가/);
  });
});

describe("§97②2호 단서 — 환산 파트 묶음 (한쪽만 환산이면 그 쪽만 비교)", () => {
  // 토지 환산 + 건물 실가 400M. 환산 묶음 = 토지측(주택부수토지 + 상가부수토지).
  const estLandSep = { landMode: "estimated", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 } as const;
  const EST_LAND = [99_310_344, 124_137_930] as const; // 환산 토지 파트(주택·상가) — PR #2027 이후 독립 도출은 predo 파일 상단 참조
  const GAMOK = EST_LAND[0] + EST_LAND[1] + pct3(96_000_000) + pct3(120_000_000); // 가목 = 환산취득가 + 개산공제 = 229,928,274

  it("PV-1 나목_G < 가목_G → 환산 유지(본문), 실가 건물 파트는 경비 몫을 가산", () => {
    const capex = 600_000_000;
    const a = capexShares(capex);
    expect(a.hl + a.cl).toBeLessThan(GAMOK); // 229,090,909 < 229,928,274 — 구별력의 근거
    const r = run(base({ separateAcquisition: estLandSep, capitalExpenditure: capex }));
    expect(r.raw.necessaryExpenseProviso).toEqual({ estimatedSide: GAMOK, directSide: a.hl + a.cl, chosen: "estimated" });
    expect(r.raw.separateAcquisition!.provisoGroup).toEqual({ parts: ["land"], estimatedSide: GAMOK, directSide: a.hl + a.cl, chosen: "estimated" });
    expect(r.h.acq[0]).toBe(EST_LAND[0]);
    expect(r.h.ded).toEqual([pct3(96_000_000), a.hb]); // 토지 개산공제 · 실가 건물 경비 몫
    expect(r.c.ded).toEqual([pct3(120_000_000), a.cb]);
  });

  it("PV-2 나목_G > 가목_G → 토지측만 나목 채택(취득가액 0 + 경비 몫) — 실가 건물 파트는 그대로 §97②1호 가산", () => {
    const capex = 700_000_000;
    const a = capexShares(capex);
    expect(a.hl + a.cl).toBeGreaterThan(GAMOK); // 267,272,727 > 229,928,274
    const r = run(base({ separateAcquisition: estLandSep, capitalExpenditure: capex }));
    expect(r.raw.necessaryExpenseProviso).toEqual({ estimatedSide: GAMOK, directSide: a.hl + a.cl, chosen: "direct" });
    expect(r.h.acq).toEqual([0, 320_000_000]); // 토지 환산 취득가액 소멸(이중차감 금지) · 건물은 S-2 나목비 몫
    expect(r.c.acq).toEqual([0, 80_000_000]);
    expect(r.h.ded).toEqual([a.hl, a.hb]);
    expect(r.c.ded).toEqual([a.cl, a.cb]);
    expect(r.raw.separateAcquisition!.parts.housingLand).toEqual({ mode: "estimated", acquisitionPrice: 0, deemedDeduction: false, basis: 96_000_000 });
  });

  it("PV-3 건물측만 환산이어도 같은 규칙 — 묶음은 건물측(주택건물 + 상가건물)", () => {
    const sepB = { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 500_000_000 } as const;
    const r = run(base({ separateAcquisition: sepB, capitalExpenditure: 900_000_000 }));
    expect(r.raw.separateAcquisition!.provisoGroup!.parts).toEqual(["building"]);
    expect(r.raw.necessaryExpenseProviso!.chosen).toBe("direct");
    expect(r.h.acq[1]).toBe(0);
    expect(r.c.acq[1]).toBe(0);
    expect(r.h.acq[0]).toBe(250_000_000); // 실가 토지 파트는 취득가액 유지
  });
});

describe("지분·미등기 개산공제 · 조합 · echo", () => {
  it("EC-1 지분 50%: 개산공제 base가 지분 기준시가(현행 규약) — 토지 감정 파트 1,440,000/1,800,000, 취득가액은 입력(이미 지분 금액) 그대로", () => {
    const r = run(base({ separateAcquisition: { ...AA, landMode: "appraisal" }, ownershipRatio: 0.5 }));
    expect(r.h.ded[0]).toBe(pct3(48_000_000));
    expect(r.c.ded[0]).toBe(pct3(60_000_000));
    expect(r.h.acq).toEqual([250_000_000, 320_000_000]);
    expect(r.h.ded[1]).toBe(0); // 실가 건물
  });
  it("EC-2 미등기: 개산공제율 3/1000 — 토지 감정 파트 288,000/360,000", () => {
    const r = run(base({ separateAcquisition: { ...AA, landMode: "appraisal" }, isUnregistered: true }));
    expect(r.h.ded[0]).toBe(Math.floor((96_000_000 * 3) / 1000));
    expect(r.c.ded[0]).toBe(Math.floor((120_000_000 * 3) / 1000));
  });
  it("EC-3 환산 토지 + 매매사례 건물: 토지는 환산값 · 건물은 salesCase 값을 S-2 나목비로 · 단서 대상 아님", () => {
    const r = run(base({ separateAcquisition: { landMode: "estimated", buildingMode: "salesCase", buildingSalesCaseValue: 400_000_000 } }));
    const [hb, cb] = ap(400_000_000, 320_000_000, 80_000_000);
    expect(r.h.acq).toEqual([99_310_344, hb]);
    expect(r.c.acq).toEqual([124_137_930, cb]);
    expect(r.h.ded).toEqual([pct3(96_000_000), pct3(256_000_000)]);
  });
  it("EC-4 echo: 비-실가 파트만 basis·개산공제 표시, 근거(면적비·나목비) 포함 — 결과 카드는 이 값을 읽는다", () => {
    const r = run(base({ separateAcquisition: { ...AA, buildingMode: "appraisal" } }));
    expect(r.raw.separateAcquisition).toEqual({
      landMode: "actual",
      buildingMode: "appraisal",
      parts: {
        housingLand: { mode: "actual", acquisitionPrice: 250_000_000, deemedDeduction: false },
        housingBuilding: { mode: "appraisal", acquisitionPrice: 320_000_000, deemedDeduction: true, basis: 256_000_000 },
        commercialLand: { mode: "actual", acquisitionPrice: 250_000_000, deemedDeduction: false },
        commercialBuilding: { mode: "appraisal", acquisitionPrice: 80_000_000, deemedDeduction: true, basis: 80_000_000 },
      },
      landSplit: { basis: "area_ratio", housingArea: 100, commercialArea: 100 },
      buildingSplit: { kind: "std_ratio", housingStd: 320_000_000, commercialStd: 80_000_000 },
    });
    const c = run(base({ separateAcquisition: { ...AA, housingBuildingContractPrice: 300_000_000 } }));
    expect(c.raw.separateAcquisition!.buildingSplit).toEqual({ kind: "contract", contract: 300_000_000 });
  });
  it("EC-5 총액 모델(필드 부재)은 echo·결과 모두 현행 — separateAcquisition echo 없음", () => {
    expect(run(base()).raw.separateAcquisition).toBeUndefined();
  });
  it("EC-6 S-1 면적비는 주택부수토지·상가부수토지 면적이 달라도 정수 면적비(소수 2자리) — 70㎡:130㎡", () => {
    // 주택 연면적 70 · 상가 130 → 주택부수토지 = 200 × 70/200 = 70㎡, 상가부수토지 130㎡
    const r = run(base({ residentialFloorArea: 70, nonResidentialFloorArea: 130, separateAcquisition: AA }));
    const [hl, cl] = ap(500_000_000, 7_000, 13_000);
    expect(r.h.acq[0]).toBe(hl);
    expect(r.c.acq[0]).toBe(cl);
    expect(hl + cl).toBe(500_000_000);
  });
});

describe("⑫ Zod — 중첩 객체 정의(strip 아님) · 모드 키 필수 술어 · 제외 조합 경로", () => {
  const payload = (over: Record<string, unknown> = {}, sepOver: Record<string, unknown> | null = AA) => ({
    isMixedUseHouse: true as const,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: "2005-06-10",
    buildingAcquisitionDate: "2010-03-15",
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000 },
    residencePeriodYears: 0,
    ...(sepOver !== null ? { separateAcquisition: sepOver } : {}),
    ...over,
  });
  const paths = (r: ReturnType<typeof mixedUseAssetSchema.safeParse>) => (r.success ? [] : r.error.issues.map((i) => i.path.join(".")));

  it("Z-1 중첩 객체가 strip되지 않는다 — 모든 필드가 그대로 파싱 결과에 남는다", () => {
    const full = { landMode: "salesCase", buildingMode: "actual", landSalesCaseValue: 520_000_000, buildingAcquisitionPrice: 400_000_000, housingBuildingContractPrice: 300_000_000, landAcquisitionPrice: 1, buildingSalesCaseValue: 2 };
    const r = mixedUseAssetSchema.safeParse(payload({}, full));
    expect(r.success).toBe(true);
    expect(r.success && r.data.separateAcquisition).toEqual(full);
  });
  it("Z-2 모드 enum 밖의 값은 400(Zod 일반 오류)", () => {
    expect(paths(mixedUseAssetSchema.safeParse(payload({}, { ...AA, landMode: "bogus" })))).toContain("separateAcquisition.landMode");
  });
  it("Z-3 모드 키 필수: 양쪽 실가 + 계약액이면 H_A·나목·상가 취득시 기준시가 없이 통과 / 계약액 없으면 나목만 요구 / 감정 파트가 있으면 H_A 요구", () => {
    const noStd = { housingPrice: undefined, commercialBuildingPrice: 0, landPricePerSqm: 0 };
    expect(mixedUseAssetSchema.safeParse(payload({ acquisitionStandardPrice: noStd }, { ...AA, housingBuildingContractPrice: 300_000_000 })).success).toBe(true);
    // H_A는 있고 건물 취득일 공시지가 L_b만 없다 — 양쪽 실가면 γ1 basis가 쓰이지 않으므로 요구하지 않는다(B0 술어의 AND)
    const hasHaNoLb = { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 };
    expect(mixedUseAssetSchema.safeParse(payload({ acquisitionStandardPrice: hasHaNoLb }, { ...AA, housingBuildingContractPrice: 300_000_000 })).success).toBe(true);
    const noContract = paths(mixedUseAssetSchema.safeParse(payload({ acquisitionStandardPrice: { ...noStd, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 } })));
    expect(noContract).toEqual(["acquisitionStandardPrice.housingBuildingPrice"]);
    const appraisal = paths(
      mixedUseAssetSchema.safeParse(
        payload({ acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 } }, { ...AA, buildingMode: "appraisal" }),
      ),
    );
    expect(appraisal).toContain("acquisitionStandardPrice.housingPrice");
    // 건물 취득일 공시지가 L_b도 같은 술어로 — 비-실가 파트가 있으면 요구
    expect(
      paths(mixedUseAssetSchema.safeParse(payload({ acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 } }, { ...AA, buildingMode: "appraisal" }))),
    ).toContain("acquisitionStandardPrice.landPricePerSqmAtBuildingAcq");
  });
  it("Z-4 총액 모델(필드 부재)의 기존 규칙은 불변 — 환산인데 개별주택가격이 없으면 400", () => {
    const r = mixedUseAssetSchema.safeParse(payload({ acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 } }, null));
    expect(paths(r)).toContain("acquisitionStandardPrice.housingPrice");
  });
  it("Z-5 제외 조합은 leaf 목록의 경로로 400 — 용도변경·공익수용·총액 플래그·같은 날", () => {
    expect(paths(mixedUseAssetSchema.safeParse(payload({ partialUsageChange: { direction: "house_to_commercial" } })))).toContain("partialUsageChange");
    expect(paths(mixedUseAssetSchema.safeParse(payload({ transferCause: "public_expropriation" })))).toContain("transferCause");
    expect(paths(mixedUseAssetSchema.safeParse(payload({ useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 })))).toEqual(
      expect.arrayContaining(["useActualAcquisition", "acquisitionActualTotalPrice"]),
    );
    expect(paths(mixedUseAssetSchema.safeParse(payload({ landAcquisitionDate: "2010-03-15" })))).toContain("buildingAcquisitionDate");
  });
});
