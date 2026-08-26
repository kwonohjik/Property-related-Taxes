/**
 * F-06 Pre-Do anchor — 대수선 잔가율 할증에 상한이 없고 대수선연도에 범위 검증이 없다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price-helpers.ts:89-101` `calcEffectiveResidualRate`
 *   const elapsedToRemodel = Math.max(0, remodel.remodelYear - builtYear);   // 하한만 있다
 *   const surcharge = residualStepForGroup(group, valuationYear) * elapsedToRemodel * 0.3;
 *   return Math.round((baseResid + surcharge) * 10000) / 10000;              // Math.min 이 없다
 *
 *   같은 파일이 `builtYear` 는 1900~MAX_YEAR 로 검증하는데 `remodelYear` 는 어디서도 검증하지 않는다
 *   (`validateBuildingStdPriceForm` 에도 없다 — `f.remodelYear` 는 intOrUndef 로 읽기만 한다).
 *
 * 잔가율은 **신축가격 대비 잔존 가치의 비율**이므로 정의상 1을 넘을 수 없다.
 * 이 단언은 고시 문언과 무관하게 성립한다.
 *
 * 🟡 **미결(고시 필요)** — 「잔존율 하한에 도달한 뒤에도 할증을 계속 가산하는가」,
 *    즉 할증 배제 규정이 명문으로 있는지는 국세청 「건물 기준시가 계산방법」 고시 본문이 있어야 판정된다.
 *    **고시 본문 미확인** ⇒ 이번 수정은 ① 정의상 상한(≤1) clamp 와 ② 대수선연도 범위 검증까지만 한다.
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 고시(잔가율·대수선 할증).
 *
 * 실측(2026-08-26 · 상증 · 경량철골조 · 용도2 · 300㎡ · 신축 1940 · 평가 2015 · 공시지가 3,000,000):
 *   대수선 없음        잔가율 0.1    기준시가  15,900,000
 *   대수선 2010(유효)  잔가율 1.045  기준시가 168,300,000   ← **10.6배**
 *   대수선 2020(미래)  잔가율 1.18   기준시가 189,900,000   ← 평가연도(2015) 초과인데 통과
 *   대수선 1930(신축전) 잔가율 0.1   기준시가  15,900,000   ← 모순 입력이 조용히 무시됨
 *   대수선 3000        잔가율 14.41  기준시가 2,320,800,000 ← **146배**
 *   전 경우 validate 는 null(통과)이었다.
 *   유효 입력만으로도 잔가율 1 초과 조합이 925건 존재한다(최대 1.3825 — IV·신축1930·대수선2025·평가2025).
 *
 * ⚠️ §1·§2 는 **F-06 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { calcEffectiveResidualRate } from "@/lib/tax-engine/building-standard-price-helpers";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const BASE: BuildingStandardPriceInput = {
  taxType: "inheritance_gift",
  floorArea: 300,
  builtYear: 1940,
  valuationYear: 2015,
  valuation: { structureKey: "light_steel_frame", usageNo: 2, landPricePerM2: 3_000_000 },
};

describe("F-06 대수선 잔가율 — §1 잔가율은 1을 넘을 수 없다 (수정 전 실패)", () => {
  it("유효 입력(신축1940·대수선2010·평가2015)에서도 잔가율이 1 이하여야 한다 — 현재 1.045", () => {
    const r = calcBuildingStandardPrice({ ...BASE, remodelYear: 2010 });
    expect(r.valuation?.residualRate).toBeLessThanOrEqual(1);
  });

  it("헬퍼 직접 — IV 그룹 신축1930·대수선2025·평가2025 잔가율이 1 이하여야 한다 (현재 1.3825)", () => {
    expect(
      calcEffectiveResidualRate("IV", 1930, 2025, { isInheritanceGift: true, remodelYear: 2025 }),
    ).toBeLessThanOrEqual(1);
  });

  it("유효 입력 전수 격자에서 잔가율 1 초과가 0건이어야 한다 — 현재 925건", () => {
    const over: string[] = [];
    for (const g of ["I", "II", "III", "IV"] as const) {
      for (let built = 1930; built <= 2026; built += 1) {
        for (let remodel = built; remodel <= 2026; remodel += 1) {
          for (const vy of [2015, 2020, 2025]) {
            if (remodel > vy || built > vy) continue;
            const rr = calcEffectiveResidualRate(g, built, vy, {
              isInheritanceGift: true,
              remodelYear: remodel,
            });
            if (rr > 1) over.push(`${g} 신축${built} 대수선${remodel} 평가${vy} → ${rr}`);
          }
        }
      }
    }
    expect(over.slice(0, 5)).toEqual([]);
    expect(over.length).toBe(0);
  });
});

describe("F-06 대수선연도 범위 — §2 모순·범위 밖 입력 차단 (수정 전 실패)", () => {
  it("대수선연도가 평가연도보다 뒤면 차단된다 — 현재 잔가율 1.18 로 통과", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE, remodelYear: 2020 })).toThrow(/대수선/);
  });

  it("대수선연도 3000 은 차단된다 — 현재 잔가율 14.41 · 기준시가 2,320,800,000", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE, remodelYear: 3000 })).toThrow(/대수선/);
  });

  it("대수선연도가 신축연도보다 앞서면 차단된다 — 현재 조용히 무시된다", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE, remodelYear: 1930 })).toThrow(/대수선/);
  });
});

describe("F-06 — §3 역방향 가드 (수정 후에도 불변)", () => {
  it("대수선 미입력이면 신축연도 잔가율 그대로 — 0.1 · 15,900,000", () => {
    const r = calcBuildingStandardPrice({ ...BASE });
    expect(r.valuation?.residualRate).toBe(0.1);
    expect(r.valuation?.standardPrice).toBe(15_900_000);
  });

  it("대수선연도 = 신축연도(할증 0)는 허용된다", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE, remodelYear: 1940 })).not.toThrow();
  });

  it("대수선연도 = 평가연도(경계)는 허용된다", () => {
    expect(() => calcBuildingStandardPrice({ ...BASE, remodelYear: 2015 })).not.toThrow();
  });

  it("양도세는 대수선 할증을 적용하지 않는다 — 범위 검증도 영향이 없어야 한다", () => {
    // 양도 경로는 remodel.isInheritanceGift 게이트로 할증 자체가 꺼진다.
    const withRemodel = calcEffectiveResidualRate("I", 1940, 2015, {
      isInheritanceGift: false,
      remodelYear: 2010,
    });
    expect(withRemodel).toBe(0.2); // I그룹·평가2015 하한 잔존율
    expect(withRemodel).toBe(calcEffectiveResidualRate("I", 1940, 2015));
  });
});
