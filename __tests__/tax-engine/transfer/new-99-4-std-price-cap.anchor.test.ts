/**
 * 조특법 §99의4① 가액 한도 — 양도일·농어촌주택 취득일 시기 분기 anchor (NH-05 PR-2a)
 *
 * 계획서: docs/00-pm/new-housing-99-review-fixes.plan.md §3-1 격자 · §3-3 P2a-1~35
 * 행(농어촌주택 취득일): R1 2003.8.1.~2007.12.31. · R2 2008년 · R3 2009~2013 · R4 2014.1.1.~
 * 열(일반주택 양도일):   C1 ~2016.12.31. · C2 2017~2020 · C3 2021~2022 · C4 2023.1.1.~
 *
 * 세액 anchor 규칙
 *   · 기대 세액 = 「선언이 불성립할 때의 값」 = 같은 사실에서 선언을 뺀 대조 세액(패리티로 검증).
 *   · 저장소 fallback 세율표는 2018.1.1. 전 양도에 법령과 다른 근사값을 쓴다(계획서 V-17) →
 *     C1 칸은 절대 세액을 쓰지 않고 평가기 판정 + 패리티만 고정한다.
 *   · 해석 칸(R1·R2 × C3·C4, 한옥 R1~R3 × C3·C4)은 후보 읽기 중 최대 한도(= 현행 유지 또는 2억)로 고정한다.
 *     「확인 필요」 고지는 PR-2b 범위다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import * as new994 from "@/lib/tax-engine/transfer-reductions/new-99-4";
import { evaluateNew994 } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import { baseTransferInput } from "../_helpers/mock-rates";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

const D = (v: string) => new Date(v);
const EOK = 100_000_000;

type Cell = {
  id: string;
  genAcq: string;
  ruralAcq: string;
  transfer: string;
  std: number;
  hanok?: boolean;
  hometown?: boolean;
  /** true = 한도 초과(불성립), false = 한도 이내(적격) */
  exceeds: boolean;
  /** 불성립 시 대조(선언 없음) 절대 세액 — C1은 생략(fallback 근사) */
  tax?: number;
};

const CELLS: Cell[] = [
  // ── R3·R4 × C1~C3 = 2억, C4 = 3억 ─────────────────────────────
  { id: "P2a-1 R4×C3 2.5억", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2022-06-01", std: 2.5 * EOK, exceeds: true, tax: 146_960_000 },
  { id: "P2a-2 R4×C3 2.0억 경계", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2022-06-01", std: 2 * EOK, exceeds: false },
  { id: "P2a-3 R4×C3 2억+1", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2022-06-01", std: 200_000_001, exceeds: true, tax: 146_960_000 },
  { id: "P2a-4 C3 마지막 날 2022-12-31", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2022-12-31", std: 2.5 * EOK, exceeds: true, tax: 142_560_000 },
  { id: "P2a-5 C4 첫날 2023-01-01 [짝]", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2023-01-01", std: 2.5 * EOK, exceeds: false },
  { id: "P2a-6 R4×C2", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2019-06-01", std: 2.5 * EOK, exceeds: true, tax: 160_160_000 },
  { id: "P2a-7 고향 R3×C3", genAcq: "2010-01-01", ruralAcq: "2012-05-01", transfer: "2022-06-01", std: 2.5 * EOK, hometown: true, exceeds: true, tax: 138_160_000 },
  { id: "P2a-33 일반 R3×C3", genAcq: "2010-01-01", ruralAcq: "2012-05-01", transfer: "2022-06-01", std: 2.5 * EOK, exceeds: true, tax: 138_160_000 },
  { id: "P2a-34 일반 R3×C2", genAcq: "2010-01-01", ruralAcq: "2012-05-01", transfer: "2019-06-01", std: 2.5 * EOK, exceeds: true, tax: 151_360_000 },
  { id: "P2a-35a R3×C1", genAcq: "2008-01-01", ruralAcq: "2010-01-01", transfer: "2015-06-01", std: 2.5 * EOK, exceeds: true },
  { id: "P2a-35b R4×C1", genAcq: "2008-01-01", ruralAcq: "2014-03-01", transfer: "2016-06-01", std: 2.5 * EOK, exceeds: true },
  // ── 한옥 ─────────────────────────────────────────────────────
  { id: "P2a-8 한옥 R3×C3 3.5억 [짝 — 현행 4억 유지]", genAcq: "2010-01-01", ruralAcq: "2012-05-01", transfer: "2022-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  { id: "P2a-9 한옥 R3×C3 2.0억", genAcq: "2010-01-01", ruralAcq: "2013-12-31", transfer: "2022-06-01", std: 2 * EOK, hanok: true, exceeds: false },
  { id: "P2a-10 한옥 R4 첫날×C3 3.5억 [짝]", genAcq: "2010-01-01", ruralAcq: "2014-01-01", transfer: "2022-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  { id: "P2a-11 한옥 R4×C4 3.5억 [짝]", genAcq: "2012-01-01", ruralAcq: "2015-03-01", transfer: "2024-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  { id: "P2a-19 한옥 R3×C4 3.5억 [짝 — 현행 유지]", genAcq: "2010-01-01", ruralAcq: "2012-05-01", transfer: "2024-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  { id: "P2a-31 한옥 R3 마지막 날(2013-12-31)×C2 3.5억", genAcq: "2010-01-01", ruralAcq: "2013-12-31", transfer: "2019-06-01", std: 3.5 * EOK, hanok: true, exceeds: true, tax: 151_360_000 },
  { id: "P2a-32 한옥 R4 첫날(2014-01-01)×C2 3.5억 [짝]", genAcq: "2010-01-01", ruralAcq: "2014-01-01", transfer: "2019-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  { id: "한옥 R3×C2 2억 경계", genAcq: "2010-01-01", ruralAcq: "2013-12-31", transfer: "2019-06-01", std: 2 * EOK, hanok: true, exceeds: false },
  { id: "한옥 R2×C2 1.5억 경계 (일반과 같음)", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2019-06-01", std: 1.5 * EOK, hanok: true, exceeds: false },
  { id: "한옥 R2×C2 1.6억 (일반과 같음)", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2019-06-01", std: 1.6 * EOK, hanok: true, exceeds: true, tax: 124_960_000 },
  { id: "한옥 R1×C2 8천만 (일반과 같음)", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2019-06-01", std: 80_000_000, hanok: true, exceeds: true, tax: 124_960_000 },
  { id: "한옥 R1×C3 3.5억 [현행 4억 유지]", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2022-06-01", std: 3.5 * EOK, hanok: true, exceeds: false },
  // ── R1·R2 × C1~C2 ────────────────────────────────────────────
  { id: "P2a-12 R2×C1 1.6억", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2012-06-01", std: 1.6 * EOK, exceeds: true },
  { id: "P2a-13 R2×C1 1.5억 경계", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2012-06-01", std: 1.5 * EOK, exceeds: false },
  { id: "P2a-14 R1×C1 8천만", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2012-06-01", std: 80_000_000, exceeds: true },
  { id: "P2a-15 R1×C1 7천만 경계", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2012-06-01", std: 70_000_000, exceeds: false },
  { id: "P2a-20 E129형 R1×C1 1억", genAcq: "2003-01-01", ruralAcq: "2003-11-15", transfer: "2010-12-15", std: 1 * EOK, exceeds: true },
  { id: "P2a-23 R2×C2 1.6억", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2019-06-01", std: 1.6 * EOK, exceeds: true, tax: 124_960_000 },
  { id: "P2a-24 R2×C2 1.5억 경계", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2019-06-01", std: 1.5 * EOK, exceeds: false },
  { id: "P2a-25 R1×C2 8천만", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2019-06-01", std: 80_000_000, exceeds: true, tax: 124_960_000 },
  { id: "P2a-26 R1×C2 7천만 경계", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2019-06-01", std: 70_000_000, exceeds: false },
  // ── 행 경계 최소쌍 (날짜 하나만 다름) ─────────────────────────
  { id: "P2a-27 R1 마지막 날 2007-12-31 ×C2 1억", genAcq: "2003-01-01", ruralAcq: "2007-12-31", transfer: "2019-06-01", std: 1 * EOK, exceeds: true, tax: 124_960_000 },
  { id: "P2a-28 R2 첫날 2008-01-01 ×C2 1억", genAcq: "2003-01-01", ruralAcq: "2008-01-01", transfer: "2019-06-01", std: 1 * EOK, exceeds: false },
  { id: "P2a-29 R2 마지막 날 2008-12-31 ×C2 1.8억", genAcq: "2003-01-01", ruralAcq: "2008-12-31", transfer: "2019-06-01", std: 1.8 * EOK, exceeds: true, tax: 124_960_000 },
  { id: "P2a-30 R3 첫날 2009-01-01 ×C2 1.8억", genAcq: "2003-01-01", ruralAcq: "2009-01-01", transfer: "2019-06-01", std: 1.8 * EOK, exceeds: false },
  // ── 해석 칸 — 후보 읽기 중 최대 한도 ─────────────────────────
  { id: "P2a-16 R1×C3 1억 [짝 — 2억 이내]", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2022-06-01", std: 1 * EOK, exceeds: false },
  { id: "P2a-17 R2×C3 1.8억 [짝 — 2억 이내]", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2022-06-01", std: 1.8 * EOK, exceeds: false },
  { id: "P2a-18 R1×C4 1억 [짝 — 현행]", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2024-06-01", std: 1 * EOK, exceeds: false },
  { id: "P2a-21 R1×C3 2.5억", genAcq: "2003-01-01", ruralAcq: "2005-06-01", transfer: "2022-06-01", std: 2.5 * EOK, exceeds: true, tax: 124_960_000 },
  { id: "P2a-22 R2×C3 2.5억", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2022-06-01", std: 2.5 * EOK, exceeds: true, tax: 124_960_000 },
  { id: "R2×C4 2.9억 [현행 3억 유지]", genAcq: "2003-01-01", ruralAcq: "2008-06-01", transfer: "2024-06-01", std: 2.9 * EOK, exceeds: false },
];

function declOf(c: Cell, locationConfirmed = true) {
  return {
    type: c.hometown ? "new_99_4_hometown" : "new_99_4_rural",
    houseId: "r1",
    ruralHouseAcquisitionDate: D(c.ruralAcq),
    ruralHouseStdPrice: c.std,
    isRegisteredHanok: !!c.hanok,
    adjacentArea994: "no" as const,
    // PR-2b 면적 요건(대지 2021.1.1. 전 · 주택 2017.1.1. 전 양도)은 요건 안 값으로 둔다 — 이 격자는 가액 한도만 본다
    ruralLandAreaSqm994: 330,
    ruralHouseType994: "other" as const,
    ruralHouseAreaSqm994: 99,
    meetsLocationRequirement: locationConfirmed,
    ...(c.hometown ? { meetsHometownRequirement: true } : {}),
  };
}

function run(c: Cell, mode: "decl" | "none" | "declFail") {
  const r = calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: D(c.genAcq),
      transferDate: D(c.transfer),
      householdHousingCount: 2,
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      reductions: mode === "none" ? [] : [declOf(c, mode === "decl") as never],
    } as never),
    loadFallbackTransferRates(D(c.transfer)),
  );
  const detail = r.new994Detail;
  return {
    totalTax: r.totalTax,
    isExempt: r.isExempt,
    eligible: detail ? detail.isEligible : null,
    codes: detail && !detail.isEligible ? detail.ineligibleReasons.map((x) => x.code) : [],
  };
}

function evaluate(c: Cell) {
  return evaluateNew994({
    id: c.hometown ? "new_99_4_hometown" : "new_99_4_rural",
    generalHouseAcquisitionDate: D(c.genAcq),
    transferDate: D(c.transfer),
    ruralHouseAcquisitionDate: D(c.ruralAcq),
    ruralHouseStdPrice: c.std,
    isRegisteredHanok: !!c.hanok,
    adjacentArea994: "no" as const,
    ruralLandAreaSqm994: 330,
    ruralHouseType994: "other",
    ruralHouseAreaSqm994: 99,
    meetsLocationRequirement: true,
    meetsHometownRequirement: c.hometown ? true : undefined,
  });
}

describe("§99의4 가액 한도 — 평가기 격자 (양도일 × 취득일)", () => {
  it.each(CELLS)("$id", (c) => {
    const ev = evaluate(c);
    if (c.exceeds) {
      expect(ev.isEligible).toBe(false);
      if (!ev.isEligible) expect(ev.ineligibleReasons.map((x) => x.code)).toEqual(["STD_PRICE_EXCEEDED"]);
    } else {
      expect(ev.isEligible).toBe(true);
    }
  });
});

describe("§99의4 가액 한도 — 엔진 세액 (불성립 = 선언 뺀 대조 세액 패리티)", () => {
  it.each(CELLS)("$id", (c) => {
    const withDecl = run(c, "decl");
    const ctrl = run(c, "none");
    const declFail = run(c, "declFail");
    // 전제: 선언이 불성립(소재 미확인)이면 대조와 같은 세액이다
    expect(declFail.totalTax).toBe(ctrl.totalTax);
    if (c.exceeds) {
      expect(withDecl.eligible).toBe(false);
      expect(withDecl.codes).toEqual(["STD_PRICE_EXCEEDED"]);
      expect(withDecl.totalTax).toBe(ctrl.totalTax);
      if (c.tax !== undefined) expect(withDecl.totalTax).toBe(c.tax);
      expect(withDecl.totalTax).toBeGreaterThan(0);
    } else {
      expect(withDecl.eligible).toBe(true);
      expect(withDecl.totalTax).toBe(0);
      expect(withDecl.isExempt).toBe(true);
      // 적격이면 선언을 뺀 대조는 과세 — 선언의 효과가 실제로 세액에 닿는다
      expect(ctrl.totalTax).toBeGreaterThan(0);
    }
  });
});

describe("resolveNew994StdPriceLimit — 한도 함수", () => {
  const resolve = (new994 as Record<string, unknown>).resolveNew994StdPriceLimit as
    | ((i: { transferDate: Date; ruralHouseAcquisitionDate: Date; isRegisteredHanok?: boolean }) => { limit: number; legalBasis: string })
    | undefined;
  const lim = (transfer: string, acq: string, hanok = false) =>
    resolve!({ transferDate: D(transfer), ruralHouseAcquisitionDate: D(acq), isRegisteredHanok: hanok }).limit;

  it("함수가 export된다", () => {
    expect(typeof resolve).toBe("function");
  });
  it("R3·R4 일반: C1~C3 2억 / C4 3억", () => {
    for (const acq of ["2009-01-01", "2013-12-31", "2014-01-01", "2025-01-01"]) {
      expect(lim("2012-06-01", acq)).toBe(2 * EOK);
      expect(lim("2016-12-31", acq)).toBe(2 * EOK);
      expect(lim("2017-01-01", acq)).toBe(2 * EOK);
      expect(lim("2020-12-31", acq)).toBe(2 * EOK);
      expect(lim("2021-01-01", acq)).toBe(2 * EOK);
      expect(lim("2022-12-31", acq)).toBe(2 * EOK);
      expect(lim("2023-01-01", acq)).toBe(3 * EOK);
      expect(lim("2030-01-01", acq)).toBe(3 * EOK);
    }
  });
  it("R1: C1·C2 7천만 / C3 2억 / C4 3억", () => {
    for (const acq of ["2003-08-01", "2007-12-31"]) {
      expect(lim("2012-06-01", acq)).toBe(70_000_000);
      expect(lim("2020-12-31", acq)).toBe(70_000_000);
      expect(lim("2021-01-01", acq)).toBe(2 * EOK);
      expect(lim("2022-12-31", acq)).toBe(2 * EOK);
      expect(lim("2023-01-01", acq)).toBe(3 * EOK);
    }
  });
  it("R2: C1·C2 1억5천만 / C3 2억 / C4 3억", () => {
    for (const acq of ["2008-01-01", "2008-12-31"]) {
      expect(lim("2012-06-01", acq)).toBe(150_000_000);
      expect(lim("2020-12-31", acq)).toBe(150_000_000);
      expect(lim("2021-01-01", acq)).toBe(2 * EOK);
      expect(lim("2023-01-01", acq)).toBe(3 * EOK);
    }
  });
  it("등록 한옥: R4 4억 전 열 / R3 C1·C2 2억 · C3·C4 4억 / R1·R2 C1·C2 일반과 같음 · C3·C4 4억", () => {
    for (const t of ["2012-06-01", "2019-06-01", "2022-06-01", "2024-06-01"]) expect(lim(t, "2014-01-01", true)).toBe(4 * EOK);
    expect(lim("2016-12-31", "2013-12-31", true)).toBe(2 * EOK);
    expect(lim("2020-12-31", "2013-12-31", true)).toBe(2 * EOK);
    expect(lim("2021-01-01", "2013-12-31", true)).toBe(4 * EOK);
    expect(lim("2024-06-01", "2013-12-31", true)).toBe(4 * EOK);
    expect(lim("2019-06-01", "2007-12-31", true)).toBe(70_000_000);
    expect(lim("2019-06-01", "2008-06-01", true)).toBe(150_000_000);
    expect(lim("2022-06-01", "2007-12-31", true)).toBe(4 * EOK);
    expect(lim("2024-06-01", "2008-06-01", true)).toBe(4 * EOK);
  });
});

describe("§99의4 가액 한도 — 메시지·미입력", () => {
  it("취득일 미입력이면 가액 비교를 건너뛴다 (MISSING_RURAL_ACQ_DATE만)", () => {
    const r = evaluateNew994({
      id: "new_99_4_rural",
      generalHouseAcquisitionDate: D("2010-01-01"),
      transferDate: D("2022-06-01"),
      ruralHouseAcquisitionDate: undefined,
      ruralHouseStdPrice: 5 * EOK,
      isRegisteredHanok: false,
      adjacentArea994: "no" as const,
      meetsLocationRequirement: true,
    });
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) expect(r.ineligibleReasons.map((x) => x.code)).toEqual(["MISSING_RURAL_ACQ_DATE"]);
  });

  it("STD_PRICE_EXCEEDED 메시지에 칸별 한도와 근거가 실린다", () => {
    const msgOf = (c: Cell) => {
      const r = evaluate(c);
      if (r.isEligible) throw new Error("적격");
      return r.ineligibleReasons.find((x) => x.code === "STD_PRICE_EXCEEDED")!.message;
    };
    const find = (id: string) => CELLS.find((c) => c.id.startsWith(id))!;
    // R3·R4 × C1~C3
    expect(msgOf(find("P2a-1 "))).toContain("한도(2억)");
    expect(msgOf(find("P2a-1 "))).toContain("조특법 법률 제19199호 부칙 제39조");
    // R1 × C2
    expect(msgOf(find("P2a-25"))).toContain("한도(7천만원)");
    expect(msgOf(find("P2a-25"))).toContain("조특법 법률 제9272호 부칙 제22조");
    expect(msgOf(find("P2a-25"))).toContain("조특법 법률 제8827호 부칙 제31조");
    // R2 × C2
    expect(msgOf(find("P2a-23"))).toContain("한도(1억5천만원)");
    // R1·R2 × C3 (2억)
    expect(msgOf(find("P2a-21"))).toContain("한도(2억)");
    expect(msgOf(find("P2a-21"))).toContain("조특법 법률 제17759호 부칙 제21조②");
    // 한옥이 4억이 아닌 칸은 부칙 제32조를 덧붙인다
    expect(msgOf(find("P2a-31"))).toContain("등록 한옥");
    expect(msgOf(find("P2a-31"))).toContain("조특법 법률 제12173호 부칙 제32조");
  });

  it("C4 현행 칸: 3억 초과 메시지는 현행 문구(조특법 §99의4①1호나목)", () => {
    const r = evaluateNew994({
      id: "new_99_4_rural",
      generalHouseAcquisitionDate: D("2010-01-01"),
      transferDate: D("2024-06-01"),
      ruralHouseAcquisitionDate: D("2015-03-01"),
      ruralHouseStdPrice: 350_000_000,
      isRegisteredHanok: false,
      adjacentArea994: "no" as const,
      meetsLocationRequirement: true,
    });
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      const m = r.ineligibleReasons.find((x) => x.code === "STD_PRICE_EXCEEDED")!.message;
      expect(m).toContain("한도(3억)");
      expect(m).toContain("1호나목");
    }
  });
});
