/**
 * Phase C(토지·건물 별개 취득 결과 표시 정합) anchor 공용 fixture — 독립 산식 모델.
 *
 * 엔진 함수를 부르지 않는 BigInt 정수 나눗셈 기대값(`model`)과, 같은 입력으로 엔진을 돌리는 `run`.
 * ⚠️ 수치는 mock 세율표 기준이고 fixture는 가상(실제 신고 사례 아님)이다.
 */
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../../_helpers/mock-rates";

export const rates = makeMockRates();

export const D = (s: string) => new Date(s);
export const won = (n: number) => n.toLocaleString("en-US");

// ═══════════════════════════════════════════════════════════════════════
// 독립 산식 — 엔진 함수를 부르지 않는다 (BigInt 정수 나눗셈 · floor)
// ═══════════════════════════════════════════════════════════════════════
/** floor(a × b ÷ c) — 정수 전용. 부동소수 곱을 쓰지 않는다. */
export const mulDiv = (a: number, b: number, c: number): number => Number((BigInt(a) * BigInt(b)) / BigInt(c));
export const trunc1000 = (n: number): number => Math.floor(n / 1000) * 1000;

export type Mode = "actual" | "estimated" | "appraisal" | "salesCase";

/** 시나리오 — N: 다주택(표1, 12억 이하라 안분 없음) / H: 1세대1주택 고가주택(12억 초과 안분 + 표2). */
export interface Scn {
  price: number;
  /** 양도시 기준시가 토지 · 건물 */
  stdT: [number, number];
  /** 취득시 기준시가 토지(㎡당 × 면적) · 건물(나목) */
  stdA: [number, number];
  landYears: number;
  buildingYears: number;
  oneHouse: boolean;
  residenceMonths: number;
}
export const SCN_N: Scn = {
  price: 900_000_000, stdT: [300_000_000, 100_000_000], stdA: [150_000_000, 50_000_000],
  landYears: 15, buildingYears: 7, oneHouse: false, residenceMonths: 0,
};
export const SCN_H: Scn = {
  price: 1_500_000_000, stdT: [450_000_000, 150_000_000], stdA: [150_000_000, 50_000_000],
  landYears: 15, buildingYears: 7, oneHouse: true, residenceMonths: 84,
};

export interface Combo {
  land: Mode;
  building: Mode;
  /** 실가·감정·매매사례 파트의 입력 금액 */
  landValue?: number;
  buildingValue?: number;
}
export const COMBOS: Record<string, Combo> = {
  AE: { land: "actual", building: "estimated", landValue: 200_000_000 },
  EA: { land: "estimated", building: "actual", buildingValue: 150_000_000 },
  EE: { land: "estimated", building: "estimated" },
  PA: { land: "appraisal", building: "actual", landValue: 210_000_000, buildingValue: 150_000_000 },
  SE: { land: "salesCase", building: "estimated", landValue: 210_000_000 },
  AA: { land: "actual", building: "actual", landValue: 200_000_000, buildingValue: 150_000_000 },
};

export function toInput(s: Scn, c: Combo, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const landModeKey = c.land === "appraisal" || c.land === "actual" ? "landAcquisitionPrice" : "landSalesCaseValue";
  const bldModeKey = c.building === "appraisal" || c.building === "actual" ? "buildingAcquisitionPrice" : "buildingSalesCaseValue";
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: s.price,
    transferDate: D("2026-07-01"),
    // 보유연수: 초일 산입 — 2011-06-01 → 15년 · 2019-06-01 → 7년 (2026-07-01 기준)
    acquisitionDate: D("2019-06-01"),
    landAcquisitionDate: D("2011-06-01"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false, // ④ 실측 body — 파트 모드는 환산이어도 이 플래그는 false다
    acquisitionMethod: "actual",
    transferCause: "general",
    isOneHousehold: s.oneHouse,
    householdHousingCount: s.oneHouse ? 1 : 2,
    residencePeriodMonths: s.residenceMonths,
    isSeparateAcquisition: true,
    saleSplitMode: "apportioned",
    landAcqMode: c.land,
    buildingAcqMode: c.building,
    ...(c.landValue != null ? { [landModeKey]: c.landValue } : {}),
    ...(c.buildingValue != null ? { [bldModeKey]: c.buildingValue } : {}),
    landStandardPriceAtTransfer: s.stdT[0],
    buildingStandardPriceAtTransfer: s.stdT[1],
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: s.stdA[0] / 1_000_000,
    buildingStandardPriceAtAcquisition: s.stdA[1],
    ...over,
  } as Partial<TransferTaxInput>);
}

export interface PartModel {
  transferPrice: number;
  acquisition: number;
  deduction: number;
  gain: number;
  taxableGain: number;
  years: number;
  /** 보유분·거주분 공제율(%) — 표1이면 (총율, 0) */
  holdPct: number;
  resPct: number;
  ltd: number;
  holdAmt: number;
  resAmt: number;
}
export interface Model {
  land: PartModel;
  building: PartModel;
  transferGain: number;
  taxableGain: number;
  ltd: number;
  taxBase: number;
  holdTotal: number;
  resTotal: number;
}

export function model(s: Scn, c: Combo): Model {
  const landT = mulDiv(s.price, s.stdT[0], s.stdT[0] + s.stdT[1]);
  const bldT = s.price - landT;
  const one = (
    mode: Mode, tp: number, stdA: number, stdT: number, given: number | undefined, years: number,
  ): PartModel => {
    let acquisition: number;
    let deduction = 0;
    if (mode === "estimated") {
      acquisition = mulDiv(tp, stdA, stdT);
      deduction = mulDiv(stdA, 3, 100);
    } else if (mode === "actual") {
      acquisition = given!;
    } else {
      acquisition = given!; // 감정·매매사례 — 값 직접 + 개산공제
      deduction = mulDiv(stdA, 3, 100);
    }
    const gain = tp - acquisition - deduction;
    const prorated = s.oneHouse ? mulDiv(gain, s.price - 1_200_000_000, s.price) : gain;
    const table2 = s.oneHouse;
    const resYears = Math.floor(s.residenceMonths / 12);
    const holdPct = table2 ? Math.min(years * 4, 40) : Math.min(years * 2, 30);
    const resPct = table2 ? Math.min(resYears * 4, 40) : 0;
    const ltd = mulDiv(Math.max(prorated, 0), holdPct + resPct, 100);
    const resAmt = holdPct + resPct > 0 ? mulDiv(ltd, resPct, holdPct + resPct) : 0;
    return {
      transferPrice: tp, acquisition, deduction, gain, taxableGain: prorated, years,
      holdPct, resPct, ltd, holdAmt: ltd - resAmt, resAmt,
    };
  };
  const land = one(c.land, landT, s.stdA[0], s.stdT[0], c.landValue, s.landYears);
  const building = one(c.building, bldT, s.stdA[1], s.stdT[1], c.buildingValue, s.buildingYears);
  const transferGain = land.gain + building.gain;
  const taxableGain = s.oneHouse ? mulDiv(transferGain, s.price - 1_200_000_000, s.price) : transferGain;
  const ltd = land.ltd + building.ltd;
  return {
    land, building, transferGain, taxableGain, ltd,
    taxBase: trunc1000(taxableGain - ltd - 2_500_000),
    holdTotal: land.holdAmt + building.holdAmt,
    resTotal: land.resAmt + building.resAmt,
  };
}

export const run = (s: Scn, c: Combo, over: Partial<TransferTaxInput> = {}): TransferTaxResult =>
  calculateTransferTax(toInput(s, c, over), rates);
export const step = (r: TransferTaxResult, label: string) => r.steps.find((x) => x.label === label);
