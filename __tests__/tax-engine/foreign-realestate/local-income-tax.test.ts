/**
 * 개인지방소득세 — 지방세법 §103③(과세표준 = 소득세 과세표준) · §103의3③→§92①(세율표) · 지방세기본법 §59→국고금 관리법 §47①(10원 미만 절사).
 * 기대값은 KoreanLaw MCP로 읽은 §92① 표(시행본 2020.01.01 · 2022.01.13 · 2026.01.01)를 그대로 옮긴 독립 기준 구현으로 낸다 —
 * 엔진은 §55① seed 구간의 1/10로 계산하므로 두 경로가 맞아떨어진다는 것 자체가 검증이다.
 */
import { describe, it, expect } from "vitest";
import { calcForeignRealEstateLocalIncomeTax } from "@/lib/tax-engine/foreign-realestate";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { k1Input, ratesAt, k1Asset, usd } from "./_fixtures";

/** [상한(이하), 기준액, 구간 시작(초과), 1천분율] — 표의 「기준액 + (구간 시작을 초과하는 금액의 n/1000)」 */
type Row = [upTo: number, base: number, over: number, perMille: number];
const T2026: Row[] = [
  [14_000_000, 0, 0, 6],
  [50_000_000, 84_000, 14_000_000, 15],
  [88_000_000, 624_000, 50_000_000, 24],
  [150_000_000, 1_536_000, 88_000_000, 35],
  [300_000_000, 3_706_000, 150_000_000, 38],
  [500_000_000, 9_406_000, 300_000_000, 40],
  [1_000_000_000, 17_406_000, 500_000_000, 42],
  [Infinity, 38_406_000, 1_000_000_000, 45],
];
const T2022: Row[] = [
  [12_000_000, 0, 0, 6],
  [46_000_000, 72_000, 12_000_000, 15],
  [88_000_000, 582_000, 46_000_000, 24],
  [150_000_000, 1_590_000, 88_000_000, 35],
  [300_000_000, 3_760_000, 150_000_000, 38],
  [500_000_000, 9_460_000, 300_000_000, 40],
  [1_000_000_000, 17_460_000, 500_000_000, 42],
  [Infinity, 38_460_000, 1_000_000_000, 45],
];
/** 2020.01.01 시행본 — 10억 초과 구간 없음(5억 초과 전부 42%) */
const T2020: Row[] = [...T2022.slice(0, 6), [Infinity, 17_460_000, 500_000_000, 42]];

function statute(taxBase: number, table: Row[]): number {
  if (taxBase <= 0) return 0;
  const [, base, over, pm] = table.find((r) => taxBase <= r[0])!;
  const tax = base + Math.floor(((taxBase - over) * pm) / 1000);
  return Math.floor(tax / 10) * 10;
}

const GRID = [
  1, 9, 10, 11, 999_999, 12_000_000, 12_000_001, 14_000_000, 14_000_001, 14_000_009, 46_000_000, 46_000_001, 50_000_000, 50_000_001,
  88_000_000, 88_000_001, 150_000_000, 150_000_001, 299_999_999, 300_000_000, 300_000_001, 434_500_000, 434_500_007, 499_999_999,
  500_000_000, 500_000_001, 777_777_777, 1_000_000_000, 1_000_000_001, 2_345_678_901,
];

describe("§92① 표 대조 (격자)", () => {
  it.each([
    ["2026-07-10", T2026],
    ["2022-12-31", T2022],
    ["2020-06-01", T2020],
  ] as const)("양도일 %s seed 구간 → 표와 일치", (iso, table) => {
    const { brackets } = ratesAt(iso);
    for (const tb of GRID) {
      expect(calcForeignRealEstateLocalIncomeTax(tb, brackets), `${iso} 과세표준 ${tb}`).toBe(statute(tb, table));
    }
  });

  it("2023-01-01 경계: 양도 2022-12-31은 구표, 2023-01-01은 신표", () => {
    const old = calcForeignRealEstateLocalIncomeTax(13_000_000, ratesAt("2022-12-31").brackets);
    const next = calcForeignRealEstateLocalIncomeTax(13_000_000, ratesAt("2023-01-01").brackets);
    expect(old).toBe(statute(13_000_000, T2022)); // 12M 초과 구간 15‰
    expect(next).toBe(statute(13_000_000, T2026)); // 14M 이하 6‰
    expect(old).not.toBe(next);
  });
});

describe("10원 미만 절사 (국고금 관리법 §47①)", () => {
  it("1원·9원은 0, 10원은 10", () => {
    const { brackets } = ratesAt("2026-07-10");
    expect(calcForeignRealEstateLocalIncomeTax(1_000, brackets)).toBe(0); // 6원
    expect(calcForeignRealEstateLocalIncomeTax(1_666, brackets)).toBe(0); // 9원
    expect(calcForeignRealEstateLocalIncomeTax(1_667, brackets)).toBe(10); // 10원
  });

  it("국내식(산출세액 × 10% 원 미만)과 갈리는 시료: 과세표준 434,500,300 → 14,786,010 (국내식이면 14,786,012)", () => {
    const { brackets } = ratesAt("2026-07-10");
    expect(calcForeignRealEstateLocalIncomeTax(434_500_300, brackets)).toBe(14_786_010);
    expect(Math.floor((173_800_120 - 25_940_000) * 0.1)).toBe(14_786_012); // 소득세 산출세액 147,860,120의 10%
  });

  it("엔진 결과의 지방소득세는 항상 10원 단위", () => {
    const r = calc(
      k1Input({ assets: [k1Asset({ transfer: usd(900_000, "2026-07-10", 1_100.0003), transferCosts: [usd(30_000, "2026-07-10", 1_099.9999)] })] }),
      ratesAt("2026-07-10"),
    );
    expect(r.localIncomeTax % 10).toBe(0);
    expect(r.localIncomeTax).toBe(statute(r.taxBase, T2026));
  });
});

describe("과세표준 0·구조 오류", () => {
  it("과세표준 0 이하는 0", () => {
    const { brackets } = ratesAt("2026-07-10");
    expect(calcForeignRealEstateLocalIncomeTax(0, brackets)).toBe(0);
    expect(calcForeignRealEstateLocalIncomeTax(-5, brackets)).toBe(0);
  });

  it("1/10로 환원되지 않는 구간(세율 소수 4자리·누진공제 10의 배수 아님)은 근사하지 않고 던진다", () => {
    expect(() => calcForeignRealEstateLocalIncomeTax(1_000_000, [{ max: null, rate: 0.0605, deduction: 0 }])).toThrow(TaxCalculationError);
    expect(() => calcForeignRealEstateLocalIncomeTax(1_000_000, [{ max: null, rate: 0.06, deduction: 1_234_567 }])).toThrow(TaxCalculationError);
  });

  it("거주 5년 미만이면 지방소득세도 0", () => {
    const r = calc(k1Input({ domesticResidenceYears: 3 }), ratesAt("2026-07-10"));
    expect(r.localIncomeTax).toBe(0);
  });
});
