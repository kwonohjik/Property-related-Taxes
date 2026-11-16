/**
 * 분리취득 부수토지 — 건물 증여 전 동일세대 거주의 표2 거주기간 공제율 (서면-2025-법규재산-4289) · 엔진·leaf 직접
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §5·§6·§7 (시료 S1)
 * route(⑫→⑭) anchor는 `__tests__/api/transfer.route.split-land-residence-4289.anchor.test.ts`.
 * 겹친 방어(엔진 throw · ⑫ refine)는 mutation에서 서로를 가리므로 층마다 따로 잠근다.
 *
 * S1 손계산(`makeMockRates()` = 2024 누진표): 양도차익 토지 13억·건물 5.5억 → 12억 초과분 안분(×8/20) → 과세 양도차익 토지 5.2억·건물 2.2억.
 *   현행(토지 표1 30% · 건물 표1 24%): 공제 156,000,000 + 52,800,000 → 과세표준 528,700,000 → 528,700,000×42% − 35,940,000 = 186,114,000
 *   4289(토지 표2 80% · 건물 표2 40%): 공제 416,000,000 + 88,000,000 → 과세표준 233,500,000 → 233,500,000×38% − 19,940,000 = 68,790,000
 *   24개월(거주 2년 = 표2 대상 경계): 토지 48%(보유 12년 40% + 거주 2년 8%) · 건물 40% → 공제 249,600,000 + 88,000,000 → 과세표준 399,900,000 → ×40% − 25,940,000 = 134,020,000
 * 2020 양도(2020-06-15, 고가주택 기준 9억 → 과세 비율 11/20): 양도차익 토지 7.15억·건물 3.025억
 *   현행(표1): 토지 30%(보유 19년) 214,500,000 + 건물 14%(보유 7년) 42,350,000 → 과세표준 758,150,000 → ×42% − 35,940,000 = 282,483,000
 *   4289(표2 대상 — 거주 2년 요건을 11년이 채움 · 보유 연 8% 한 열): 토지 56%(주택 부수토지 보유 7년) 400,400,000 + 건물 56% 169,400,000 → 과세표준 445,200,000 → ×40% − 25,940,000 = 152,140,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import {
  collectSplitPartCauseIssues,
  type SplitPartCauseFacts,
} from "@/lib/tax-engine/transfer-split-part-cause";
import {
  collectSplitLandResidenceIssues,
  landPartPriorResidenceMonths,
  landPartResidenceMaxMonths,
  LAND_PART_RESIDENCE_GATE_MESSAGE,
  LAND_PART_RESIDENCE_COMPANION_MESSAGE,
  LAND_PART_RESIDENCE_RENTAL_20_MESSAGE,
  LAND_PART_RESIDENCE_STRAY_MESSAGE,
  LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE,
  LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE,
  LAND_PART_RESIDENCE_MONTHS_NOT_ELIGIBLE_MESSAGE,
  landPartResidenceMonthsExceedsMessage,
} from "@/lib/tax-engine/transfer-split-land-residence";
import { resolveExemptionRequirementResidenceMonths, resolveTable2SubjectResidenceMonths } from "@/lib/tax-engine/one-house/residence-months";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const ON = (months: number | undefined) => ({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: months });

/** S1 — D2 증여 호스트(건물 증여 + 토지 매수) 1세대 1주택. 토지 2000-06-01 → 건물 증여 2012-10-01(148개월). */
const s1 = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 2_000_000_000,
    transferDate: D("2025-01-15"),
    acquisitionDate: D("2012-10-01"),
    acquisitionCause: "gift",
    landAcquisitionCause: "purchase",
    landAcquisitionDate: D("2000-06-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 1_400_000_000,
    buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 1_400_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 100_000_000,
    buildingAcquisitionPrice: 50_000_000,
    residencePeriodMonths: 0,
    acquisitionPrice: 0,
    expenses: 0,
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(s1(o), makeMockRates());
const note4289 = (r: ReturnType<typeof run>) => (r.warnings ?? []).filter((w) => w.includes("서면-2025-법규재산-4289"));

describe("S1 엔진 직접 — 토글 짝", () => {
  it("OFF(현행): 표1 — 토지 30% · 건물 24% · 186,114,000 · 4289 고지 없음 · 파트 거주 연수 0/0", () => {
    const r = run();
    expect(r.calculatedTax).toBe(186_114_000);
    expect(r.taxBase).toBe(528_700_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.3, 10);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.24, 10);
    expect(r.splitDetail!.land.residenceYears).toBe(0);
    expect(r.splitDetail!.building.residenceYears).toBe(0);
    expect(note4289(r)).toHaveLength(0);
  });

  it("ON 132개월: 토지 80%(보유분 40% + 거주 11년 40%) · 건물 40% · 68,790,000 · 파트 거주 연수 11/0", () => {
    const r = run(ON(132));
    expect(r.calculatedTax).toBe(68_790_000);
    expect(r.taxBase).toBe(233_500_000);
    expect(r.longTermHoldingDeduction).toBe(504_000_000);
    const { land, building } = r.splitDetail!;
    expect(land.longTermRate).toBeCloseTo(0.8, 10);
    expect(land.longTermDeduction).toBe(416_000_000);
    expect(land.holdingDeductionRate).toBe(0.4);
    expect(land.residenceDeductionRate).toBe(0.4);
    expect(building.longTermRate).toBeCloseTo(0.4, 10);
    expect(building.longTermDeduction).toBe(88_000_000);
    expect(building.residenceDeductionRate).toBe(0);
    // 결과 echo — 토지만 더한 거주 연수(132개월 = 11년), 건물은 본인 거주(0)
    expect(land.residenceYears).toBe(11);
    expect(building.residenceYears).toBe(0);
  });

  it("산식 문구가 파트별 거주 연수를 말한다 — 토지 「거주 11년×4%」 · 건물 「거주 0년(2년 미만…)」 (자기모순 문장 없음)", () => {
    const lthd = run(ON(132)).steps.filter((s) => /장기보유|거주 기간분/.test(s.label)).map((s) => s.formula).join(" | ");
    expect(lthd).toContain("거주 11년×4% = 40%");
    expect(lthd).toContain("거주 0년(2년 미만 — 거주기간 공제 없음)");
    expect(lthd).not.toMatch(/거주 0년\(2년 미만[^)]*\)\s*=\s*40%/);
    expect(lthd).not.toContain("거주 11년(2년 미만");
  });

  it("고지 1건 — 4289 · 사전-2025-법규재산-1126 · 조심 2025서3843 확인 필요, 비과세 거주요건에는 쓰지 않았다고 밝힌다", () => {
    const n = note4289(run(ON(132)));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("132개월");
    expect(n[0]).toContain("1126");
    expect(n[0]).toContain("조심 2025서3843");
    expect(n[0]).toContain("비과세 거주요건에는 쓰지 않았습니다");
  });

  it("ON 0개월(「거주한 적 없음」): 종전과 같다 — 186,114,000 · 고지 없음 · 막지 않는다", () => {
    const r = run(ON(0));
    expect(r.calculatedTax).toBe(186_114_000);
    expect(note4289(r)).toHaveLength(0);
  });

  it("표2 대상 판정 경계(거주 2년): 23개월 = 표1 그대로 · 24개월 = 표2 — 토지 48%(40% + 거주 2년 8%) · 건물 40% · 134,020,000", () => {
    const r23 = run(ON(23));
    expect(r23.calculatedTax).toBe(186_114_000);
    expect(r23.splitDetail!.land.residenceYears).toBe(1); // 토지 거주 연수 echo는 1년이어도 표2 대상이 아니라 공제율에는 거주분이 없다
    const r24 = run(ON(24));
    expect(r24.calculatedTax).toBe(134_020_000);
    expect(r24.taxBase).toBe(399_900_000);
    expect(r24.splitDetail!.land.longTermRate).toBeCloseTo(0.48, 10);
    expect(r24.splitDetail!.building.longTermRate).toBeCloseTo(0.4, 10); // 건물도 표1 24% → 표2 40%로 뒤집힌다(대상 판정은 자산 단위 — Q-3 a 의도된 결과)
  });

  it("건물 파트는 새 개월을 거주 연수로 쓰지 않는다 — 건물 거주분 공제율 0", () => {
    const r = run(ON(132));
    expect(r.splitDetail!.building.residenceDeductionAmount).toBe(0);
    expect(r.splitDetail!.building.holdingDeductionRate).toBe(0.4);
  });

  it("본인 거주 + 새 개월은 합산해 연수를 낸다 — 본인 24개월 + 새 132개월 = 156개월 = 13년 → 거주분 40% 상한(토지 80%)", () => {
    const r = run({ residencePeriodMonths: 24, ...ON(132) });
    expect(r.splitDetail!.land.residenceYears).toBe(13);
    expect(r.splitDetail!.building.residenceYears).toBe(2);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.48, 10); // 건물은 본인 거주 2년만 — 40% + 8%
  });
});

describe("연혁 — 양도일", () => {
  it("2009~2019 양도(표2 보유 연 8% 한 열 · 거주요건 없음): 새 개월이 세액을 바꾸지 않고 고지도 없다", () => {
    for (const transferDate of ["2009-03-16", "2015-06-30", "2019-12-31"]) {
      const off = run({ transferDate: D(transferDate) });
      const on = run({ transferDate: D(transferDate), ...ON(132) });
      expect(on.calculatedTax, transferDate).toBe(off.calculatedTax);
      expect(on.longTermHoldingDeduction, transferDate).toBe(off.longTermHoldingDeduction);
      expect(note4289(on), transferDate).toHaveLength(0);
    }
  });

  it("2020 양도(`holding_8pct_residence_2y` — 거주 2년이 표2 대상 판정을 가른다): OFF 282,483,000 → ON 152,140,000(토지·건물 56%) · 고지는 대상 판정에만 썼다고 밝힌다", () => {
    const off = run({ transferDate: D("2020-06-15") });
    expect(off.calculatedTax).toBe(282_483_000);
    expect(off.longTermHoldingDeduction).toBe(256_850_000);
    expect(off.splitDetail!.land.longTermRate).toBeCloseTo(0.3, 10);
    expect(off.splitDetail!.building.longTermRate).toBeCloseTo(0.14, 10);
    const on = run({ transferDate: D("2020-06-15"), ...ON(132) });
    expect(on.calculatedTax).toBe(152_140_000);
    expect(on.taxBase).toBe(445_200_000);
    expect(on.longTermHoldingDeduction).toBe(569_800_000);
    expect(on.splitDetail!.land.longTermRate).toBeCloseTo(0.56, 10);
    expect(on.splitDetail!.building.longTermRate).toBeCloseTo(0.56, 10);
    const n = note4289(on);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("표2 대상 판정(거주 2년)에 더했습니다");
    expect(n[0]).toContain("거주기간별 공제율에는 쓰이지 않았습니다");
  });

  it("2020 양도 경계: 새 개월 23개월(거주 1년)은 대상 판정을 채우지 못해 OFF와 같다 — 24개월부터 뒤집힌다", () => {
    expect(run({ transferDate: D("2020-06-15"), ...ON(23) }).calculatedTax).toBe(282_483_000);
    expect(run({ transferDate: D("2020-06-15"), ...ON(24) }).calculatedTax).toBe(152_140_000);
  });
});

describe("상한 — 토지 취득일과 증여자 건물 취득일 중 늦은 날 ~ 건물 증여일", () => {
  it("토지 취득일 기준: 2000-06-01 → 2012-10-01 = 148개월 — 148 통과 · 149 throw(문구에 148개월)", () => {
    expect(() => run(ON(148))).not.toThrow();
    expect(() => run(ON(149))).toThrow(landPartResidenceMonthsExceedsMessage(148, false));
  });

  it("증여자 건물 취득일(선택 칸)이 토지 취득일보다 늦으면 그 날이 시작일 — 2005-03-01 → 91개월: 91 통과 · 92 throw", () => {
    const donor = { donorAcquisitionDate: D("2005-03-01") };
    expect(() => run({ ...donor, ...ON(91) })).not.toThrow();
    expect(() => run({ ...donor, ...ON(92) })).toThrow(landPartResidenceMonthsExceedsMessage(91, true));
  });

  it("증여자 건물 취득일이 토지 취득일보다 이르거나 같으면 토지 취득일이 시작일(상한 148)", () => {
    expect(() => run({ donorAcquisitionDate: D("1998-01-01"), ...ON(148) })).not.toThrow();
    expect(() => run({ donorAcquisitionDate: D("2000-06-01"), ...ON(148) })).not.toThrow();
    expect(() => run({ donorAcquisitionDate: D("2000-06-01"), ...ON(149) })).toThrow(landPartResidenceMonthsExceedsMessage(148, false));
  });

  it("leaf `landPartResidenceMaxMonths` — 시작일이 증여일 이후이거나 날짜가 비면 상한 없음(undefined)", () => {
    expect(landPartResidenceMaxMonths({ landAcquisitionDate: "2000-06-01", buildingAcquisitionDate: "2012-10-01" })).toEqual({ max: 148, startedByDonor: false });
    expect(landPartResidenceMaxMonths({ landAcquisitionDate: "2012-10-01", buildingAcquisitionDate: "2012-10-01" })).toBeUndefined();
    expect(landPartResidenceMaxMonths({ landAcquisitionDate: "2013-01-01", buildingAcquisitionDate: "2012-10-01" })).toBeUndefined();
    expect(landPartResidenceMaxMonths({ landAcquisitionDate: "2000-06-01", buildingAcquisitionDate: undefined })).toBeUndefined();
    expect(landPartResidenceMaxMonths({ landAcquisitionDate: "2000-06-01T00:00:00.000Z", buildingAcquisitionDate: "2000-06-30", donorAcquisitionDate: "2000-06-15" })).toEqual({ max: 0, startedByDonor: true });
  });
});

describe("빈칸·이상값·짝 — 보정하지 않고 막는다", () => {
  it("토글 ON + 빈칸 → throw(자동 0·상한 보정 금지)", () => {
    expect(() => run(ON(undefined))).toThrow("거주한 개월 수를 입력하세요");
  });
  it("개월 수가 음수·소수 → throw", () => {
    expect(() => run(ON(-1))).toThrow(LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE);
    expect(() => run(ON(12.5))).toThrow(LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE);
  });
  it("개월 수만 있고 토글이 없거나 꺼짐 → throw(게이트 밖 값을 조용히 버리지 않는다)", () => {
    expect(() => run({ landPartPriorHouseholdResidenceMonths: 132 })).toThrow(LAND_PART_RESIDENCE_STRAY_MESSAGE);
    expect(() => run({ landPartDonorSameHousehold: false, landPartPriorHouseholdResidenceMonths: 132 })).toThrow(LAND_PART_RESIDENCE_STRAY_MESSAGE);
  });
  it("토글만 `false`이고 개월 수가 없으면 입력 없음과 같다(막지 않는다)", () => {
    expect(run({ landPartDonorSameHousehold: false }).calculatedTax).toBe(186_114_000);
  });
});

describe("게이트 — D2 증여 호스트 밖의 값은 막는다", () => {
  it("건물 상속(D2 상속)은 받지 않는다(Q-1 a) — 같은 값을 상속에 얹으면 throw", () => {
    expect(() =>
      run({ acquisitionCause: "inheritance", decedentAcquisitionDate: D("1990-01-01"), acquisitionDate: D("2012-10-01"), ...ON(132) }),
    ).toThrow(LAND_PART_RESIDENCE_GATE_MESSAGE);
  });
  it("토지 overlay 없음(건물·토지 같은 원인 분리) · 건물 매매 · 부담부증여 · 소유자 분리 → throw", () => {
    expect(() => run({ landAcquisitionCause: undefined, ...ON(132) })).toThrow(); // overlay 부재(Y8) 또는 게이트
    expect(() => run({ acquisitionCause: "purchase", ...ON(132) })).toThrow(LAND_PART_RESIDENCE_GATE_MESSAGE);
    expect(() => run({ transferType: "burdened_gift", ...ON(132) })).toThrow();
    expect(() => run({ selfOwns: "land_only", ...ON(132) })).toThrow();
  });
  it("긍정 짝: 같은 S1에서 값을 빼면 모두 계산된다(차단이 값 때문이다)", () => {
    expect(() => run({ acquisitionCause: "purchase" })).not.toThrow();
  });
});

describe("leaf 직접 — 게이트 순서·호스트·⑳", () => {
  const OK: SplitPartCauseFacts = {
    isSplitable: true,
    hasLandAcquisitionDate: true,
    landAcquisitionCause: "purchase",
    hasLandDecedentAcquisitionDate: false,
    landMode: "actual",
    landAcquisitionDate: "2000-06-01",
    buildingAcquisitionCause: "gift",
    buildingAcquisitionDate: "2012-10-01",
    buildingMode: "actual",
    selfOwns: "both",
    ...ON(132),
  };
  const only = (f: Partial<SplitPartCauseFacts>) => collectSplitLandResidenceIssues({ ...OK, ...f });

  it("기준 사실은 통과", () => {
    expect(only({})).toEqual([]);
    // `collectSplitPartCauseIssues`(엔진·⑧·⑫ 공유 진입점)도 이 입력에서 4289 위반이 없다
    expect(collectSplitPartCauseIssues({ ...OK, hasLandAcquisitionDate: true }).filter((i) => i.field.startsWith("landPart"))).toEqual([]);
  });
  it("입력이 하나도 없으면 규칙이 걸리지 않는다(어떤 호스트에서도)", () => {
    expect(only({ landPartDonorSameHousehold: undefined, landPartPriorHouseholdResidenceMonths: undefined, buildingAcquisitionCause: "inheritance", partCarryoverSupported: false })).toEqual([]);
  });
  it("컴패니언(partCarryoverSupported=false)은 다른 사유보다 먼저 컴패니언 문구", () => {
    expect(only({ partCarryoverSupported: false })).toEqual([{ field: "landPartDonorSameHousehold", message: LAND_PART_RESIDENCE_COMPANION_MESSAGE }]);
    expect(only({ partCarryoverSupported: false, buildingAcquisitionCause: "inheritance" })[0].message).toBe(LAND_PART_RESIDENCE_COMPANION_MESSAGE);
    expect(only({ partCarryoverSupported: true })).toEqual([]);
  });
  it("§155⑳ 선언 → ⑳ 문구 · 미선언은 통과(Q-7 b)", () => {
    expect(only({ rentalHousingDeclared: true })).toEqual([{ field: "landPartDonorSameHousehold", message: LAND_PART_RESIDENCE_RENTAL_20_MESSAGE }]);
    expect(only({ rentalHousingDeclared: false })).toEqual([]);
  });
  it("D2 증여 호스트가 아니면 게이트 문구 — 분리 불가 자산·상속·이월과세·부담부증여·소유자 분리·overlay 부재", () => {
    for (const f of [
      { isSplitable: false },
      { buildingAcquisitionCause: "inheritance" },
      { buildingAcquisitionCause: "carryover_gift" },
      { isBurdenedGift: true },
      { selfOwns: "land_only" },
      { selfOwns: "building_only" },
      { landAcquisitionCause: undefined },
      { landAcquisitionCause: "gift" },
    ] as Partial<SplitPartCauseFacts>[]) {
      expect(only(f).map((i) => i.message), JSON.stringify(f)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
    }
  });
  it("분리 불가 자산(isSplitable=false)에 실려도 진입점(`collectSplitPartCauseIssues`)이 막는다 — stray 분기", () => {
    const issues = collectSplitPartCauseIssues({ ...OK, isSplitable: false });
    expect(issues.map((i) => i.message)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
  });
  it("값 규칙 순서 — 빈칸 → 음수·소수 → 날짜 불가 → 상한", () => {
    expect(only({ landPartPriorHouseholdResidenceMonths: undefined })).toEqual([{ field: "landPartPriorHouseholdResidenceMonths", message: LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE }]);
    expect(only({ landPartPriorHouseholdResidenceMonths: -3 })[0].message).toBe(LAND_PART_RESIDENCE_MONTHS_INVALID_MESSAGE);
    expect(only({ landAcquisitionDate: "2012-10-01" })[0].message).toBe(LAND_PART_RESIDENCE_MONTHS_NOT_ELIGIBLE_MESSAGE);
    expect(only({ landPartPriorHouseholdResidenceMonths: 149 })[0].message).toBe(landPartResidenceMonthsExceedsMessage(148, false));
  });
});

describe("`landPartPriorResidenceMonths` · 표2 대상 판정 leaf", () => {
  it("토글 true + 양의 정수만 값을 낸다 — 그 밖은 0", () => {
    expect(landPartPriorResidenceMonths({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 132 })).toBe(132);
    expect(landPartPriorResidenceMonths({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 0 })).toBe(0);
    expect(landPartPriorResidenceMonths({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: undefined })).toBe(0);
    expect(landPartPriorResidenceMonths({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 1.5 })).toBe(0);
    expect(landPartPriorResidenceMonths({ landPartDonorSameHousehold: false, landPartPriorHouseholdResidenceMonths: 132 })).toBe(0);
    expect(landPartPriorResidenceMonths({ landPartPriorHouseholdResidenceMonths: 132 })).toBe(0);
  });
  it("`resolveTable2SubjectResidenceMonths`는 비과세 거주요건 값에 새 개월만 더한다 — 새 입력이 없으면 같은 값", () => {
    const input = s1({ residencePeriodMonths: 7 });
    expect(resolveTable2SubjectResidenceMonths(input)).toBe(resolveExemptionRequirementResidenceMonths(input));
    const on = s1({ residencePeriodMonths: 7, ...ON(132) });
    expect(resolveTable2SubjectResidenceMonths(on)).toBe(7 + 132);
    // 비과세 거주요건·§155⑳ 소비처가 읽는 값은 새 개월을 더하지 않는다
    expect(resolveExemptionRequirementResidenceMonths(on)).toBe(7);
  });
});
