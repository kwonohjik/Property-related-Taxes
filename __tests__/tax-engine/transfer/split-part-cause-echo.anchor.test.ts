/**
 * D1-3 파트 취득원인·기산일 echo + T-7 비과세 고지 (2026-10-09, 표시 전용 · 세액 불변)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10.2 T-1·T-7
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md §2.4
 *
 * E-7이 핵심이다 — echo 날짜가 파트 세율 계산(`computeSplitPartTax`)이 실제로 쓴 `basisDate`와 다르면
 * 화면이 엔진을 속인다. 파트별 결과(`splitPartDetail`)는 단건 결과로 노출되지 않아 echo가 유일한 노출 경로다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { computeSplitPartTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { SplitGainResult, SplitPartResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";

const D = (s: string) => new Date(s);

/** 건물 2018-03-02 매매 + 토지 2025-02-01(원인은 케이스별) · 2주택(비과세 없음) · 2026-06-30 양도 */
const asset = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_200_000_000,
    transferDate: D("2026-06-30"),
    acquisitionDate: D("2018-03-02"),
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 500_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcquisitionDate: D("2025-02-01"),
    ...o,
  });
const inherit = (decedent: string): Partial<TransferTaxInput> => ({
  landAcquisitionCause: "inheritance",
  landDecedentAcquisitionDate: D(decedent),
});
const echoOf = (p: SplitPartResult) => ({
  acquisitionCause: p.acquisitionCause,
  acquisitionDate: p.acquisitionDate,
  rateBasisAcquisitionDate: p.rateBasisAcquisitionDate,
  rateBasisRule: p.rateBasisRule,
  appliedRateBasisDate: p.appliedRateBasisDate,
});
const BUILDING_ECHO = {
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-02",
  rateBasisAcquisitionDate: "2018-03-02",
  rateBasisRule: "own",
  appliedRateBasisDate: "2018-03-02",
};

describe("E-1~E-5 — SplitPartResult echo 5필드", () => {
  it("E-1 주택 토지 상속(피상속인 2000) → decedent · 법정 기산 2000 · 적용 = max(2000, 건물 2018)", () => {
    const sd = calcSplitGain(asset(inherit("2000-01-01")))!;
    expect(echoOf(sd.land)).toEqual({
      acquisitionCause: "inheritance",
      acquisitionDate: "2025-02-01",
      rateBasisAcquisitionDate: "2000-01-01",
      rateBasisRule: "decedent",
      appliedRateBasisDate: "2018-03-02",
    });
    expect(echoOf(sd.building)).toEqual(BUILDING_ECHO);
  });

  it("E-2 토지 단순 증여 → own(§104②2호는 이월과세 자산만) · 두 기산일 = 증여일", () => {
    const sd = calcSplitGain(asset({ landAcquisitionCause: "gift", landDonorAcquisitionDate: D("2001-01-01") }))!;
    expect(echoOf(sd.land)).toEqual({
      acquisitionCause: "gift",
      acquisitionDate: "2025-02-01",
      rateBasisAcquisitionDate: "2025-02-01",
      rateBasisRule: "own",
      appliedRateBasisDate: "2025-02-01",
    });
  });

  it("E-3 비주택(building) — max 없음: 적용 = 법정 기산(피상속인 2000)", () => {
    const sd = calcSplitGain(asset({ propertyType: "building", ...inherit("2000-01-01") }))!;
    expect(sd.land.rateBasisAcquisitionDate).toBe("2000-01-01");
    expect(sd.land.appliedRateBasisDate).toBe("2000-01-01");
  });

  it("E-4 원인 미지정 → acquisitionCause 키 생략(「매매」로 지어내지 않는다) · 날짜는 사실이라 채운다", () => {
    const sd = calcSplitGain(asset({ acquisitionCause: undefined }))!;
    expect("acquisitionCause" in sd.land).toBe(false);
    expect("acquisitionCause" in sd.building).toBe(false);
    expect(sd.land.acquisitionDate).toBe("2025-02-01");
    expect(sd.land.rateBasisRule).toBe("own");
    expect(sd.building.acquisitionDate).toBe("2018-03-02");
  });

  it("E-4′ 토지 원인 미지정이면 자산 원인을 상속(엔진 컨벤션) — 같은 원인이면 mixedCause 거짓", () => {
    const sd = calcSplitGain(asset())!;
    expect(sd.land.acquisitionCause).toBe("purchase");
    expect(summarizeSplitGain(sd).mixedCause).toBe(false);
  });

  it("E-5 PHD 경로(calcSplitGainPreDisclosure)도 같은 helper로 채운다", () => {
    const sd = calcSplitGain(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: PHD_TRANSFER_PRICE,
        transferDate: D("2023-02-16"),
        acquisitionDate: D("2014-09-14"),
        acquisitionCause: "purchase",
        landAcquisitionDate: D("2013-06-01"),
        acquisitionPrice: 0,
        useEstimatedAcquisition: true,
        acquisitionMethod: "estimated",
        expenses: 0,
        landSplitMode: "apportioned",
        preHousingDisclosure: PHD_INPUT,
      }),
    )!;
    expect(sd.preHousingDisclosureDetail).toBeDefined();
    expect(echoOf(sd.land)).toEqual({
      acquisitionCause: "purchase",
      acquisitionDate: "2013-06-01",
      rateBasisAcquisitionDate: "2013-06-01",
      rateBasisRule: "own",
      appliedRateBasisDate: "2014-09-14", // 주택: max(토지 2013, 건물 2014)
    });
    expect(sd.building.acquisitionDate).toBe("2014-09-14");
  });
});

describe("E-6 — summarizeSplitGain.mixedCause 진리표", () => {
  const part = (c?: SplitPartResult["acquisitionCause"]): SplitPartResult => ({
    transferPrice: 1,
    acquisitionPrice: 0,
    directExpenses: 0,
    appraisalDeduction: 0,
    gain: 1,
    holdingYears: 1,
    longTermRate: 0,
    longTermDeduction: 0,
    ...(c ? { acquisitionCause: c } : {}),
  });
  const sd = (
    land?: SplitPartResult["acquisitionCause"],
    building?: SplitPartResult["acquisitionCause"],
    selfOwns: SplitGainResult["selfOwns"] = "both",
  ): SplitGainResult => ({ land: part(land), building: part(building), note: "", selfOwns });

  it.each([
    ["상속 · 매매", sd("inheritance", "purchase"), true],
    ["증여 · 신축", sd("gift", "newConstruction"), true],
    ["매매 · 매매", sd("purchase", "purchase"), false],
    ["토지 echo 없음(구 이력)", sd(undefined, "purchase"), false],
    ["건물 echo 없음", sd("inheritance", undefined), false],
    ["원인 달라도 소유자 분리 — 소유 파트 하나", sd("inheritance", "purchase", "land_only"), false],
  ])("%s → %s", (_, s, expected) => {
    expect(summarizeSplitGain(s).mixedCause).toBe(expected);
  });

  it("파트 요약이 echo를 재계산 없이 그대로 통과시킨다", () => {
    const s = summarizeSplitGain(calcSplitGain(asset(inherit("2000-01-01")))!);
    expect(s.parts[0]).toMatchObject({
      key: "land",
      acquisitionCause: "inheritance",
      acquisitionDate: "2025-02-01",
      rateBasisAcquisitionDate: "2000-01-01",
      rateBasisRule: "decedent",
      appliedRateBasisDate: "2018-03-02",
    });
    expect(s.mixedCause).toBe(true);
  });
});

describe("E-7 — echo 날짜 = computeSplitPartTax가 실제로 쓴 basisDate", () => {
  const parsedRates = parseRatesFromMap(makeMockRates());
  const day = (d: Date) => d.toISOString().slice(0, 10);

  it.each([
    ["주택 · 토지 증여(1년 4개월)", asset({ landAcquisitionCause: "gift" })],
    ["주택 · 토지 상속(피상속인 2025-01-01 — 통산해도 단기, decedent)", asset(inherit("2025-01-01"))],
    ["비주택 · 토지 상속(피상속인 2025-01-01)", asset({ propertyType: "building", ...inherit("2025-01-01") })],
  ])("%s", (_, input) => {
    const r = calculateTransferTax(input, makeMockRates());
    const parts = computeSplitPartTax({
      taxBase: r.taxBase,
      transferIncome: r.taxBase + r.basicDeduction,
      basicDeduction: r.basicDeduction,
      splitDetail: r.splitDetail!,
      parsedRates,
      taxRateInput: input,
    });
    // 파트 세율이 실제로 갈리는 시드다(게이트 통과) — null이면 비교 대상이 없어 이 테스트가 무의미해진다.
    expect(parts).not.toBeNull();
    const byKind = (k: "land" | "building") => parts!.parts.find((p) => p.kind === k)!;
    expect(r.splitDetail!.land.appliedRateBasisDate).toBe(day(byKind("land").basisDate));
    expect(r.splitDetail!.building.appliedRateBasisDate).toBe(day(byKind("building").basisDate));
  });

  it("주택 토지 상속(피상속인 2000) — 통산으로 기본세율: 같은 토지일의 증여(60%)보다 세액이 작다", () => {
    const inh = calculateTransferTax(asset(inherit("2000-01-01")), makeMockRates());
    const gift = calculateTransferTax(asset({ landAcquisitionCause: "gift" }), makeMockRates());
    // echo가 말하는 적용 기산일(2018 vs 2025)이 세액 차이와 같은 방향이다.
    expect(inh.splitDetail!.land.appliedRateBasisDate).toBe("2018-03-02");
    expect(gift.splitDetail!.land.appliedRateBasisDate).toBe("2025-02-01");
    expect(inh.calculatedTax).toBeLessThan(gift.calculatedTax);
  });
});

describe("E-8 — partRateBasisApplied: 파트 기산일로 세율을 실제로 판정했는가(「세율 기산일」 표시 게이트)", () => {
  const flag = (i: TransferTaxInput) => calculateTransferTax(i, makeMockRates()).splitDetail!.partRateBasisApplied;

  it("세율이 같아 자산 단위로 합친 경우(게이트 7)도 판정은 했다 → true — 건물 2025-03 매매 · 토지 2025-02 증여: 둘 다 주택 1~2년 60%", () => {
    const i = asset({ acquisitionDate: D("2025-03-01"), landAcquisitionCause: "gift" });
    const r = calculateTransferTax(i, makeMockRates());
    // 게이트 7(uniform)이 진입을 막았다 — 파트가 만들어지지 않았다
    expect(
      computeSplitPartTax({
        taxBase: r.taxBase,
        transferIncome: r.taxBase + r.basicDeduction,
        basicDeduction: r.basicDeduction,
        splitDetail: r.splitDetail!,
        parsedRates: parseRatesFromMap(makeMockRates()),
        taxRateInput: i,
      }),
    ).toBeNull();
    expect(r.splitDetail!.partRateBasisApplied).toBe(true);
  });
  it("누진 한계세율이 갈린 경우(토지 상속 통산) → true", () => {
    expect(flag(asset(inherit("2000-01-01")))).toBe(true);
  });
  it("파트별 세율이 갈린 경우 → true", () => {
    expect(flag(asset({ landAcquisitionCause: "gift" }))).toBe(true);
  });
  it("건물(2025-03-01)분 결손 → 게이트로 자산 단위 단기세율 → false (토지 echo는 피상속인 기산이지만 계산에 안 쓰였다)", () => {
    const r = calculateTransferTax(
      asset({ ...inherit("2000-01-01"), acquisitionDate: D("2025-03-01"), buildingAcquisitionPrice: 600_000_000 }),
      makeMockRates(),
    );
    expect(r.splitDetail!.partRateBasisApplied).toBe(false);
    expect(r.splitDetail!.land.rateBasisRule).toBe("decedent");
    expect(r.shortTermNote).toContain("2년 미만");
  });
});

describe("T-7 — 나중 취득 상속 토지분 비과세 제외 고지 (세액 불변)", () => {
  /** 1세대1주택 · 12억 이하 — 건물분 비과세, 토지분(2025-02-01 상속, 1년 4개월)은 G-3 제외 */
  const oneHouse = (o: Partial<TransferTaxInput> = {}) =>
    asset({ isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 96, ...o });
  const NOTICE = "제154조 제8항 제3호";
  const warns = (i: TransferTaxInput) => calculateTransferTax(i, makeMockRates()).warnings ?? [];

  it("상속 토지 + 2년 미만 + 비과세 → 고지 1줄", () => {
    const w = warns(oneHouse(inherit("2000-01-01")));
    expect(w.filter((x) => x.includes(NOTICE))).toHaveLength(1);
  });
  it("고지는 세액을 바꾸지 않는다 — 같은 토지분 제외 step이 그대로 있다", () => {
    const r = calculateTransferTax(oneHouse(inherit("2000-01-01")), makeMockRates());
    expect(r.steps.some((s) => s.label === "부수토지 비과세 제외")).toBe(true);
    expect(r.calculatedTax).toBeGreaterThan(0);
  });
  /**
   * 고가주택(12억 초과 → 부분 비과세) — 전액 비과세는 STEP 1a 조기 반환으로 STEP 3에 닿지 않아
   * 「2년 이상이면 고지 없음」을 가를 수 없다(겹친 방어가 서로를 가린다). 이 짝은 STEP 3까지 간다.
   */
  const highValue = (o: Partial<TransferTaxInput> = {}) =>
    oneHouse({
      transferPrice: 1_500_000_000,
      landTransferPrice: 900_000_000,
      buildingTransferPrice: 600_000_000,
      landStandardPriceAtTransfer: 900_000_000,
      buildingStandardPriceAtTransfer: 600_000_000,
      ...inherit("2000-01-01"),
      ...o,
    });
  it("고가주택 + 상속 토지 2년 미만 → 고지(긍정 짝 — STEP 3 도달 확인)", () => {
    expect(warns(highValue()).some((x) => x.includes(NOTICE))).toBe(true);
  });
  it("고가주택 + 상속 토지 2년 이상(2022-01-10) → 고지 없음", () => {
    expect(warns(highValue({ landAcquisitionDate: D("2022-01-10") })).some((x) => x.includes(NOTICE))).toBe(false);
  });
  it.each([
    ["토지 단순 증여", oneHouse({ landAcquisitionCause: "gift" })],
    ["토지 원인 없음(매매)", oneHouse()],
    ["상속 토지 2년 이상(2022-01-10)", oneHouse({ ...inherit("2000-01-01"), landAcquisitionDate: D("2022-01-10") })],
    ["비과세 아님(2주택)", asset(inherit("2000-01-01"))],
  ])("%s → 고지 없음", (_, input) => {
    expect(warns(input).some((x) => x.includes(NOTICE))).toBe(false);
  });
});
