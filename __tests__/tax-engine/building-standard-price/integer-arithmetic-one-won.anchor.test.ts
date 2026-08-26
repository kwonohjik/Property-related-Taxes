/**
 * F-31 · F-32 · F-33 Pre-Do anchor — 남은 raw float 곱 후 `Math.floor` 3지점의 1원 과소.
 *
 * 이 엔진에서 같은 실패모드를 이미 네 번 정정했다(F-04 ㎡당 절사 · F-08 가중평균 ·
 * F-06 반올림 tie · F-41 조정률 곱). 남은 세 지점이 이 anchor 의 대상이다.
 *
 * ── F-31 `stdPriceFromPerM2` — `Math.floor(pricePerM2 * floorArea)`
 *    `pricePerM2` 는 1,000원 절사를 거쳐 **항상 1,000의 배수**다. 연면적이 소수 2자리면
 *    정확값은 언제나 정수이므로 `floor` 는 no-op 이어야 하고, 깎이는 1원은 순수 표현손실이다.
 *    실측: 단가 100,000~2,000,000 × 면적 50.00~300.00 격자 347,883셀 중 **17,620건(5.06%)**.
 *      예) 100,000원/㎡ × 65.07㎡ → 6,506,999 (정확 6,507,000)
 *    이 함수는 `calcPointBreakdown`·§164⑧ 제2산식·※표 total2001 이 공유하는 단일 출처다.
 *
 * ── F-32 `calcMechBreakdown` — `Math.floor(safeMultiply(unitPrice, count) * residualRate)`
 *    앞의 정수곱만 보호되고 잔가율 float 곱에는 같은 보호가 없다. 잔가율은
 *    `calcResidualRateByDurable` 이 소수 4자리로 양자화하므로 정수 분수로 되돌릴 수 있다.
 *    일반 경로와 달리 이 경로에는 1,000원 절사가 없어 오차가 그대로 최종 기준시가에 남는다.
 *    실측: 2004~2026 × 경과연수 × 주차대수 1~30 격자 17,790셀 중 **377건(2.12%)**.
 *      예) 2004년 단가 5,000,000 × 5대 × 잔가율 0.145 → 3,624,999 (정확 3,625,000)
 *
 * ── F-33 `calcAcqBaseBreakdown` — `Math.floor(pricePerM2 * floorArea * acqBaseRate)`
 *    3항 raw float 곱. 산정기준율(소득세법 시행령 §164⑤)은 소수 3자리다.
 *    실측: 단가 × 면적 격자 34,349셀 중 **112건(0.33%)**.
 *      예) 100,000원/㎡ × 77.99㎡ × 1.016 → 7,923,783 (정확 7,923,784)
 *
 * 세 건 모두 오차 방향이 **1원 과소 한 방향**이다(과대 0건).
 *
 * 법령: 「소득세법」 제99조 제1항 제1호 나목 · 「소득세법 시행령」 제164조(⑤ 산정기준율) ·
 *   「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 고시 제2025-39호.
 *   금액은 원 단위 정수라는 것은 고시 해석과 무관하게 성립한다(CLAUDE.md 정수 연산 규칙).
 *
 * ⚠️ §1~§3 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import {
  stdPriceFromPerM2,
  calcMechBreakdown,
} from "@/lib/tax-engine/building-standard-price-helpers";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import {
  resolveMechParkingFormula,
  calcResidualRateByDurable,
} from "@/lib/tax-engine/data/building-standard-price";

describe("F-31 ㎡당 금액 × 연면적 — §1 정확 정수 (수정 전 실패)", () => {
  it.each([
    [100_000, 65.07, 6_507_000],
    [100_000, 132.2, 13_220_000],
    [100_000, 140.42, 14_042_000],
    [717_000, 64.07, 45_938_190],
  ])("㎡당 %s × %s㎡ = %s", (perM2, area, want) => {
    expect(stdPriceFromPerM2(perM2, area).standardPrice).toBe(want);
  });

  it("전수 격자에서 정확값과 일치 — 현재 347,883셀 중 17,620건(5.06%) 1원 과소", () => {
    const diverged: string[] = [];
    let cells = 0;
    for (let p = 100_000; p <= 2_000_000; p += 1000) {
      for (let a = 5000; a <= 30000; a += 137) {
        cells += 1;
        const got = stdPriceFromPerM2(p, a / 100).standardPrice;
        const want = Number((BigInt(p) * BigInt(a)) / 100n); // 단가가 1,000의 배수라 정확값은 정수
        if (got !== want && diverged.length < 5) diverged.push(`${p} × ${a / 100} → ${got} ≠ ${want}`);
      }
    }
    expect(cells).toBe(347_883); // 격자 축소 방지 가드
    expect(diverged).toEqual([]);
  });

  it("정수 면적은 종전과 동일 (역방향 가드)", () => {
    expect(stdPriceFromPerM2(232_000, 500).standardPrice).toBe(116_000_000);
    expect(stdPriceFromPerM2(1_008_000, 1000).standardPrice).toBe(1_008_000_000);
  });
});

describe("F-32 기계식주차 특수산식 — §2 정확 정수 (수정 전 실패)", () => {
  it("2004년 단가 5,000,000 × 5대 × 잔가율 0.145 = 3,625,000", () => {
    // 2004 내용연수 버킷 기준 경과연수를 역산해 잔가율 0.145 를 만든다
    const f = resolveMechParkingFormula(2004)!;
    const built = Array.from({ length: 40 }, (_, i) => 2004 - i).find(
      (b) => calcResidualRateByDurable(f.durableYears, 2004 - b, 2004) === 0.145,
    )!;
    expect(calcMechBreakdown(2004, 5, built).standardPrice).toBe(3_625_000);
  });

  it("전수 격자에서 정확값과 일치 — 현재 17,790셀 중 377건(2.12%) 1원 과소", () => {
    const diverged: string[] = [];
    let cells = 0;
    for (let year = 2004; year <= 2026; year += 1) {
      const f = resolveMechParkingFormula(year);
      if (!f) continue;
      for (let built = year - f.durableYears; built <= year; built += 1) {
        for (let n = 1; n <= 30; n += 1) {
          cells += 1;
          const got = calcMechBreakdown(year, n, built).standardPrice;
          const rr = calcResidualRateByDurable(f.durableYears, year - built, year);
          const want = Number(
            (BigInt(f.unitPrice) * BigInt(n) * BigInt(Math.round(rr * 10000))) / 10000n,
          );
          if (got !== want && diverged.length < 5) {
            diverged.push(`${year} ${n}대 신축${built} → ${got} ≠ ${want}`);
          }
        }
      }
    }
    expect(cells).toBe(17_790); // 격자 축소 방지 가드
    expect(diverged).toEqual([]);
  });

  it("잔가율 1.0(신축 당해)은 단가 × 대수 그대로 (역방향 가드)", () => {
    const f = resolveMechParkingFormula(2026)!;
    expect(calcMechBreakdown(2026, 3, 2026).standardPrice).toBe(f.unitPrice * 3);
  });
});

describe("F-33 산정기준율(§164⑤) — §3 정확 정수 (수정 전 실패)", () => {
  /** 취득 ≤2000 · 양도 2시점 경로 — `acquisition.standardPrice` 가 산정기준율 적용값이다 */
  const acqBase = (acquisitionYear: number, floorArea: number) =>
    calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea,
      builtYear: 1990,
      acquisitionYear,
      transferYear: 2024,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_000_000 },
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_000_000 },
    }).acquisition!;

  it("취득 2000 · ㎡당 327,000 × 50㎡ × 산정기준율 1.019 = 16,660,650 (현재 16,660,649)", () => {
    const bd = acqBase(2000, 50);
    expect(bd.pricePerM2).toBe(327_000);
    expect(bd.acqBaseRate).toBe(1.019);
    expect(bd.standardPrice).toBe(16_660_650);
  });

  it("엔진 격자에서 3항 곱이 정확 정수 — 현재 464셀 중 1건 1원 과소", () => {
    const diverged: string[] = [];
    let cells = 0;
    for (const acquisitionYear of [1995, 1997, 1999, 2000]) {
      for (let a = 5000; a <= 25000; a += 173) {
        cells += 1;
        const bd = acqBase(acquisitionYear, a / 100);
        // 정확값 — 2001 지수표 ㎡당 금액(1,000의 배수) × 면적(centi) × 산정기준율(밀리)
        const want = Number(
          (BigInt(bd.pricePerM2!) * BigInt(a) * BigInt(Math.round(bd.acqBaseRate! * 1000))) /
            100_000n,
        );
        if (bd.standardPrice !== want && diverged.length < 5) {
          diverged.push(`취득${acquisitionYear} ${a / 100}㎡ → ${bd.standardPrice} ≠ ${want}`);
        }
      }
    }
    expect(cells).toBe(464); // 격자 축소 방지 가드
    expect(diverged).toEqual([]);
  });
});
