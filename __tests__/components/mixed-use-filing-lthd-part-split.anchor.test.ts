/**
 * anchor — 겸용주택 신고서 4열(주택분·상가분 × 토지·건물)의 **장기보유특별공제·양도소득금액·과세대상 양도차익·보유/거주 기간분**은
 * 엔진 파트 echo(`partLthd`)를 그대로 읽는다.
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-filing-lthd-part-split.plan.md
 *
 * 종전: 엔진은 토지·건물을 각자의 공제율로 계산해 더하지만 합계만 내보냈고, 신고서가 양도차익 비율·건물 개월 비율로 다시 나눴다.
 * 공제율이 다른 파트에서 열 값이 수백만~1,900만 원 어긋났고(상가분 포함), 토지분이 표1인 사례(B)는 거주분 합계 열까지 틀렸다.
 * 기대값(정답)은 계획서 §2 실측 — 엔진과 같은 leaf로 파트마다 따로 계산한 값이고, 파트 합이 엔진 합계와 같음을 확인했다.
 *
 * 픽스처: CASE14(토지 1992-01-01) · 30억 · 양도 2026-06-01 · mock 세율 · 거주는 「직접 입력」 모드.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const TD = D("2026-06-01");
const PRICE = 3_000_000_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const COLS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;

function engine(over: Partial<MixedUseAssetInput>) {
  const a = { ...mixedUseCase14(), ...over } as MixedUseAssetInput;
  return { a, r: calc(PRICE, TD, a, makeMockRates()) };
}

function filing(a: MixedUseAssetInput, r: MixedUseGainBreakdown) {
  const months = String((a.residencePeriodYears ?? 0) * 12);
  const fd = { ...createDefaultTransferFormData(), contractTotalPrice: String(PRICE), transferDate: ymd(TD), residencePeriodMonths: months };
  fd.assets = [
    {
      ...fd.assets[0],
      acquisitionDate: ymd(a.buildingAcquisitionDate),
      landAcquisitionDate: ymd(a.landAcquisitionDate),
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: months,
    },
  ];
  const result = mixedUseToFilingResult(r);
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, fd, undefined, PRICE);
  const cell = (label: string, col: string): number => {
    const row = rows.find((x) => x.label.trim() === label);
    if (!row) throw new Error(`row not found: ${label}`);
    const v = row.values[col];
    return typeof v === "number" ? v : 0;
  };
  const row = (label: string) => COLS.map((c) => cell(label, c));
  return { result, cell, row };
}

const LT = "장기보유특별공제";
const INCOME = "양도소득금액";
const TAXABLE = "과세대상 양도차익";
const HOLD = "보유 기간분 장특";
const RES = "거주 기간분 장특";

describe("겸용 신고서 4열 — 엔진 파트 echo", () => {
  it("A 건물 2019·거주 7년·1주택 — 상가 열(토지 30% · 건물 14%)이 정답 (종전 247,773,861 · 9,944,736)", () => {
    const { a, r } = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 });
    const f = filing(a, r);
    expect(f.row(LT)).toEqual([27_052_133, 131_494_973, 252_980_205, 4_738_393]);
    expect(f.row(INCOME)).toEqual([21_255_249, 103_317_479, 590_287_147, 29_107_274]);
    expect(f.row(TAXABLE).slice(0, 2)).toEqual([48_307_382, 234_812_452]);
    expect(f.row(HOLD).slice(0, 2)).toEqual([13_526_067, 65_747_487]);
    expect(f.row(RES).slice(0, 2)).toEqual([13_526_066, 65_747_486]);
  });

  it("B 건물 2023·거주 3년 — 토지분 표1 승: 토지 거주분 0 · 거주분 합계 = 엔진 28,177,494 (종전 35,423,601)", () => {
    const { a, r } = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    const f = filing(a, r);
    expect(f.row(LT)).toEqual([14_492_214, 56_354_988, 252_980_205, 2_030_740]);
    expect(f.row(HOLD).slice(0, 2)).toEqual([14_492_214, 28_177_494]);
    expect(f.row(RES)).toEqual([0, 28_177_494, 0, 0]);
    expect(f.cell(RES, "total")).toBe(28_177_494);
    expect(f.cell(RES, "total")).toBe(r.housingPart.residenceDeductionAmount);
  });

  it("C 토지 2015·건물 2020·다주택(표1 22% · 12%) — 주택 토지 51,125,240 (종전 31,851,610)", () => {
    const { a, r } = engine({ landAcquisitionDate: D("2015-03-01"), buildingAcquisitionDate: D("2020-03-01"), residencePeriodYears: 0, isOneHouseExempt: false });
    const f = filing(a, r);
    expect(f.row(LT)).toEqual([51_125_240, 135_550_631, 185_518_817, 4_061_480]);
    expect(f.row(INCOME).slice(0, 2)).toEqual([181_262_216, 994_037_967]);
    expect(f.row(RES)).toEqual([0, 0, 0, 0]);
  });

  it("D 양쪽 상한(대조군) — 1원 잔액까지 맞는다", () => {
    const { a, r } = engine({ residencePeriodYears: 10 });
    const f = filing(a, r);
    expect(f.row(LT)).toEqual([38_645_905, 187_849_961, 252_980_205, 10_153_700]);
    expect(f.row(HOLD).slice(0, 2)).toEqual([19_322_953, 93_924_981]);
    expect(f.row(RES).slice(0, 2)).toEqual([19_322_952, 93_924_980]);
  });

  it.each([
    ["A", { buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 }],
    ["B", { buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 }],
    ["C", { landAcquisitionDate: D("2015-03-01"), buildingAcquisitionDate: D("2020-03-01"), residencePeriodYears: 0, isOneHouseExempt: false }],
  ] as const)("%s 항등식 — 열 합 = 합계 · 열마다 보유분 + 거주분 = 장특 · 합계 장특 = 결과", (_n, over) => {
    const { a, r } = engine(over as Partial<MixedUseAssetInput>);
    const f = filing(a, r);
    const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
    for (const label of [LT, INCOME, HOLD, RES]) expect(sum(f.row(label))).toBe(f.cell(label, "total"));
    COLS.forEach((c) => expect(f.cell(HOLD, c) + f.cell(RES, c)).toBe(f.cell(LT, c)));
    expect(f.cell(LT, "total")).toBe(f.result.longTermHoldingDeduction);
  });

  it("옛 결과(파트 echo 없음)는 종전 근사 그대로 — 이력 화면 fallback", () => {
    const { a, r } = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    const legacy: MixedUseGainBreakdown = {
      ...r,
      housingPart: { ...r.housingPart, partLthd: undefined },
      commercialPart: { ...r.commercialPart, partLthd: undefined },
    };
    const f = filing(a, legacy);
    // 계획서 §2.1·§2.2 B의 «신고서» 값(종전 근사)
    expect(f.row(LT)).toEqual([12_088_319, 58_758_882, 245_170_690, 9_840_254]);
    expect(f.cell(RES, "total")).toBe(35_423_601);
  });
});

describe("상가 건물 차익이 음수 — 열 소득금액 = 열 양도차익 − 파트 장특", () => {
  it("열 합 = 상가 소득금액 · 건물 열 장특 0", () => {
    const base = mixedUseCase14();
    const { a, r } = engine({
      buildingAcquisitionDate: D("2019-06-01"),
      residencePeriodYears: 7,
      acquisitionStandardPrice: { ...base.acquisitionStandardPrice, commercialBuildingPrice: 300_000_000 },
    });
    const c = r.commercialPart;
    expect(c.buildingTransferGain).toBeLessThan(0); // 전제 — 이 입력이 실제로 음수 차익을 만든다
    expect(c.landTransferGain).toBeGreaterThan(0);
    expect(c.incomeAmount).toBeGreaterThan(0); // 상가 합계는 양수 — 0으로 막힌 예외 구간이 아니다
    const f = filing(a, r);
    expect(f.cell(LT, "commercialBuilding")).toBe(0);
    expect(f.cell(INCOME, "commercialLand") + f.cell(INCOME, "commercialBuilding")).toBe(c.incomeAmount);
    expect(f.cell(INCOME, "commercialBuilding")).toBe(c.buildingTransferGain);
  });
});

describe("§154③ 본문 — 상가 부분도 주택(OH-17)", () => {
  // 주택 연면적 > 주택 외 연면적 · 전체 12억 이하 · 1세대1주택 → 상가 부분까지 비과세(장특 0). 픽스처는 OH-61/OH-17 anchor와 같다.
  const a: MixedUseAssetInput = {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2021-06-01"),
    buildingAcquisitionDate: D("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
  } as MixedUseAssetInput;
  const r = calc(1_000_000_000, D("2024-06-01"), a, makeMockRates());

  it("엔진은 상가 파트 echo를 지운다(장특 0인데 낡은 파트 값을 남기지 않는다)", () => {
    expect(r.commercialPart.deemedHouseBy154_3Main).toBe(true);
    expect(r.commercialPart.partLthd).toBeUndefined();
  });

  it("신고서 상가 열 장특·보유분·거주분 0 · 항등식 유지", () => {
    const result = mixedUseToFilingResult(r);
    const rows = buildRows(result, deriveColumns(result).mode, undefined, undefined, 1_000_000_000);
    const v = (label: string, col: string) => {
      const x = rows.find((row) => row.label.trim() === label)!.values[col];
      return typeof x === "number" ? x : 0;
    };
    for (const c of ["commercialLand", "commercialBuilding"]) {
      expect(v(LT, c)).toBe(0);
      expect(v(HOLD, c)).toBe(0);
      expect(v(RES, c)).toBe(0);
    }
    COLS.forEach((c) => expect(v(HOLD, c) + v(RES, c)).toBe(v(LT, c)));
  });
});

describe("엔진 파트 echo 자체", () => {
  it("주택분 파트 합 = 합계(과세 양도차익·장특·보유분·거주분), 상가분 거주분 0", () => {
    const { r } = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 });
    const h = r.housingPart;
    const p = h.partLthd!;
    expect(p.land.taxableGain + p.building.taxableGain).toBe(h.proratedTaxableGain);
    expect(p.land.longTermDeduction + p.building.longTermDeduction).toBe(h.longTermDeductionAmount);
    expect(p.land.holdingDeductionAmount + p.building.holdingDeductionAmount).toBe(h.holdingDeductionAmount);
    expect(p.land.residenceDeductionAmount + p.building.residenceDeductionAmount).toBe(h.residenceDeductionAmount);
    const c = r.commercialPart.partLthd!;
    expect(c.land.longTermDeduction + c.building.longTermDeduction).toBe(r.commercialPart.longTermDeductionAmount);
    expect(c.land.residenceDeductionAmount + c.building.residenceDeductionAmount).toBe(0);
  });
});
