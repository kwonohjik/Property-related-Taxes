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
 * ✅ **고시 본문 확보(2026-08-26) — 국세청 고시 제2025-39호(2025.12.31. 고시, 2026-01-01 시행)**
 *    제10조② 각주가 리모델링 잔가율을 **명문 산식**으로 규정한다:
 *
 *      Rn(잔존가치율) = 1 − (1−R) × (n − 0.3ⓝ) / N
 *        R = 최종잔존가치율   N = 대상건물의 내용연수   n = 대상건물의 경과연수
 *        ⓝ = 리모델링시점의 경과연수. **다만 ⓝ은 항상 N보다 작거나 같고, n − 0.3ⓝ > N 이면 Rn = R**
 *
 *    ⇒ 하한(R)은 **합친 값에** 걸린다. 종전 구현은 `max(1 − n·step, R)` 로 **기저에 먼저** 하한을 건 뒤
 *      할증을 더해, 노후 건물에서 R 이어야 할 구간이 크게 부풀었다.
 *    산식 독해는 국세청 공식 계산사례로 검증했다 — 통나무조(I·N=50·R=0.10) 신축1996·대수선2008·상속2026
 *      → 1 − 0.9 × (30 − 0.3×12)/50 = **0.5248**, 저장소 anchor 값과 정확히 일치.
 *    리모델링 각주는 제10조②**1호(상증)** 표에만 달려 있고 2호(양도) 표에는 없다 ⇒ `isInheritanceGift` 게이트가 맞다.
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

describe("F-06 대수선 잔가율 — §4 고시 명문 산식 (수정 전 실패)", () => {
  /**
   * 고시 제10조② 각주를 그대로 옮긴 참조 구현. 코드가 이것과 일치해야 한다.
   * (테스트 안에 두어 「무엇이 정답인지」가 anchor 자체로 읽히게 한다.)
   */
  function gosiRn(N: number, R: number, builtYear: number, remodelYear: number, valuationYear: number) {
    const n = valuationYear - builtYear;
    const nTilde = Math.min(remodelYear - builtYear, N); // ⓝ은 항상 N보다 작거나 같고
    // ⚠️ **정수 산술**. `n − 0.3ⓝ` 는 0.1 단위라 Rn×10000 이 정확히 `.5` tie 인 조합이 많고,
    //    float 로 쓰면 곱셈 결합 순서에 따라 반올림이 임의로 갈린다(유리수 검산으로 확인).
    //    참조 구현도 정확 산술이어야 anchor 가 정답을 말할 수 있다.
    const scaledN = 10 * n - 3 * nTilde; // (n − 0.3ⓝ) × 10
    const scaledD = 10 * N;
    if (scaledN > scaledD) return R; // n − 0.3ⓝ > N 이면 Rn = R
    const oneMinusR = 10000 - Math.round(R * 10000);
    const numer = 10000 * scaledD - oneMinusR * scaledN;
    return Math.floor((2 * numer + scaledD) / (2 * scaledD)) / 10000; // round-half-up
  }

  it("국세청 공식 계산사례 재현 — 통나무조 신축1996·대수선2008·평가2026 → 0.5248 (수정 후에도 불변)", () => {
    expect(gosiRn(50, 0.1, 1996, 2008, 2026)).toBe(0.5248);
    expect(calcEffectiveResidualRate("I", 1996, 2026, { isInheritanceGift: true, remodelYear: 2008 })).toBe(
      0.5248,
    );
  });

  it("n − 0.3ⓝ > N 이면 Rn = R — IV그룹 신축1960·대수선2026·평가2026 → 0.1 (현재 0.991)", () => {
    expect(
      calcEffectiveResidualRate("IV", 1960, 2026, { isInheritanceGift: true, remodelYear: 2026 }),
    ).toBe(0.1);
  });

  it("n − 0.3ⓝ > N 이면 Rn = R — IV그룹 신축1980·대수선2026·평가2026 → 0.1 (현재 0.721)", () => {
    expect(
      calcEffectiveResidualRate("IV", 1980, 2026, { isInheritanceGift: true, remodelYear: 2026 }),
    ).toBe(0.1);
  });

  it("ⓝ ≤ N clamp — 리모델링 경과연수가 내용연수를 넘어도 N 으로 잘린다", () => {
    // IV(N=20) 신축1930·대수선1997 → ⓝ=67 이지만 N=20 으로 clamp, n=96, adj=96−6=90 > 20 ⇒ R
    expect(
      calcEffectiveResidualRate("IV", 1930, 2026, { isInheritanceGift: true, remodelYear: 1997 }),
    ).toBe(0.1);
  });

  it("2026 전수 격자에서 코드 === 고시 산식 (현재 15,979건 괴리 · 최대 10배)", () => {
    const diverged: string[] = [];
    let cells = 0;
    for (const [g, N] of [["I", 50], ["II", 40], ["III", 30], ["IV", 20]] as const) {
      for (let built = 1930; built <= 2026; built += 1) {
        for (let remodel = built; remodel <= 2026; remodel += 1) {
          cells += 1;
          const got = calcEffectiveResidualRate(g, built, 2026, {
            isInheritanceGift: true,
            remodelYear: remodel,
          });
          const want = gosiRn(N, 0.1, built, remodel, 2026); // 2026 최종잔존가치율 = 전 그룹 10%
          if (Math.abs(got - want) > 1e-9 && diverged.length < 5) {
            diverged.push(`${g} 신축${built}/대수선${remodel}: ${got} ≠ ${want}`);
          }
        }
      }
    }
    expect(cells).toBe(19012); // 격자 축소 방지 가드
    expect(diverged).toEqual([]);
  });
});
