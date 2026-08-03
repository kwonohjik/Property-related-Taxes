/**
 * anchor: §104⑤ **크로스 엔진 조정 레이어** — 부동산 ↔ 기타자산
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-2** (v1.1)
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * §104⑤ 본문은 「§94①**1호ㆍ2호 및 제4호**」 자산을 **둘 이상 양도**하면 전부 합쳐 비교하도록
 * 정하는데, 부동산 엔진과 주식 엔진이 분리돼 **교차 조합에 §104⑤이 전혀 적용되지 않았다**.
 * 이 레이어는 두 엔진 결과 **위에 얹혀** 1호·2호를 다시 내고 MAX를 취한다.
 *
 * 🔒 **재계산 범위는 §104①8호·9호뿐**이다(계획서 F-1) — 같은 호라도 세율이 입력에 의존하므로
 *   (§104①2호 「주택 등 60%」·1호 「분양권 60%」·⑦호 후단 MAX) 2호를 전면 재계산할 수 없다.
 *   나머지 호의 세액은 각 엔진이 낸 값을 그대로 받는다(`otherClausesTax`).
 *
 * 🔒 **floor 규약은 9호 방식(통합 표 1회)**이다(계획서 F-5) — 법문 §104①8호·9호가 **동일한
 *   별표**를 쓰고 그 표가 「기저액 + 초과액 × 세율」 단일 산식이기 때문이다. 부동산 8호의
 *   2-floor(누진 floor + 가산 floor)와 **최대 1원 갈린다**(A-5가 그 사실을 고정).
 *
 * ⚠️ **각 엔진의 §104⑤은 건드리지 않았다**(F-2) — 기존 anchor는 전건 불변이다.
 */
import { describe, it, expect } from "vitest";
import { computeCross1045 } from "@/lib/tax-engine/comparative-104-5-cross";
import {
  BASIC_PROGRESSIVE_BRACKETS,
  NBL_HEAVY_CORP_BRACKETS,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

/** 두 표를 매번 넘기는 대신 고정 — 세율 데이터는 **매개변수 주입**이 원칙이다(두 엔진 미의존) */
const brackets = {
  basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
  nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
  // C-3b에서 §104①1호 버킷 교차 합산이 추가됐다. 이 파일의 케이스는 **8호·9호 의제 전용**이라
  // 1호는 0이고, 따라서 **기존 도출값이 전부 불변**이어야 한다(0을 합쳐도 0).
  realEstateClause1TaxBase: 0,
  otherAssetClause1TaxBase: 0,
};

describe("§104⑤ 크로스 조정 (C-2)", () => {
  it("A-1: 계획서 §3 실측 시나리오 — 8호·9호 합산으로 **246,680,000**", () => {
    // 부동산 비사업용 토지 과세표준 243,500,000 (단독 96,940,000)
    //  + 기타자산 9호 과세표준 300,000,000 (단독 124,060,000) = 현행 단순합 221,000,000
    const r = computeCross1045({
      totalTaxBase: 243_500_000 + 300_000_000,
      clause8TaxBase: 243_500_000,
      clause9TaxBase: 300_000_000,
      otherClausesTax: 0, // 8호·9호 외 자산 없음
      ...brackets,
    });

    // 2호 = f₈₉(543,500,000) = 543,500,000 × 52% − 35,940,000
    expect(r.merged89Tax).toBe(246_680_000);
    expect(r.clause2Tax).toBe(246_680_000);
    // 1호 = f_기본(543,500,000) = 543,500,000 × 42% − 35,940,000
    expect(r.clause1Tax).toBe(192_330_000);
    expect(r.applied).toBe("clause2");
    expect(r.calculatedTax).toBe(246_680_000);

    // 현행(교차 미적용) 대비 조정액 — 계획서 §3의 25,680,000
    expect(r.separate89Tax).toBe(221_000_000); // 96,940,000 + 124,060,000
    expect(r.merged89Tax - r.separate89Tax).toBe(25_680_000);
  });

  it("A-2: 8호·9호 **한 버킷**이다 (§104⑤ 본문 후단 「동일한 자산으로 보고」)", () => {
    // 어느 쪽에 몰려 있든 합계가 같으면 같은 세액이어야 한다.
    const split = computeCross1045({
      totalTaxBase: 400_000_000,
      clause8TaxBase: 250_000_000,
      clause9TaxBase: 150_000_000,
      otherClausesTax: 0,
      ...brackets,
    });
    const lumped = computeCross1045({
      totalTaxBase: 400_000_000,
      clause8TaxBase: 400_000_000,
      clause9TaxBase: 0,
      otherClausesTax: 0,
      ...brackets,
    });
    expect(split.merged89Tax).toBe(lumped.merged89Tax);
    // 400,000,000 × 50% − 25,940,000
    expect(split.merged89Tax).toBe(174_060_000);
  });

  it("A-3: **1호가 이기는 경우** — 8호·9호가 작고 다른 호가 크면 합계액 누진이 앞선다", () => {
    const r = computeCross1045({
      totalTaxBase: 1_000_000_000,
      clause8TaxBase: 10_000_000,
      clause9TaxBase: 0,
      // 나머지 990,000,000이 저율 호(예: 감면·특례)라 2호 기여가 작은 상황
      otherClausesTax: 50_000_000,
      ...brackets,
    });
    // 2호 = 50,000,000 + f₈₉(10,000,000) = 50,000,000 + 1,600,000
    expect(r.clause2Tax).toBe(51_600_000);
    // 1호 = 1,000,000,000 × 42% − 35,940,000 = 384,060,000
    expect(r.clause1Tax).toBe(384_060_000);
    expect(r.applied).toBe("clause1");
    expect(r.calculatedTax).toBe(384_060_000);
  });

  it("A-4: 감면 — **호별 감면세액**으로 비교해야 승자가 바뀐다", () => {
    const base = {
      totalTaxBase: 500_000_000,
      clause8TaxBase: 200_000_000,
      clause9TaxBase: 0,
      otherClausesTax: 100_000_000,
      ...brackets,
    };
    // 감면 없음: 2호 = 100,000,000 + f₈₉(200,000,000) = 100,000,000 + 76,060,000 = 176,060,000
    //            1호 = 500,000,000 × 40% − 25,940,000 = 174,060,000  → 2호 승
    const noReduction = computeCross1045(base);
    expect(noReduction.clause2Tax).toBe(176_060_000);
    expect(noReduction.clause1Tax).toBe(174_060_000);
    expect(noReduction.applied).toBe("clause2");

    // 2호에만 큰 감면이 붙으면 차감 후에는 1호가 커진다 → 법문상 1호를 택한다.
    const withReduction = computeCross1045({
      ...base,
      reduction: { ifClause1: 0, ifClause2: 10_000_000 },
    });
    expect(withReduction.applied).toBe("clause1");
    // 반환은 **산출세액**이다(감면 차감 전) — 법문 「… 차감한 세액이 더 큰 경우의 산출세액」
    expect(withReduction.calculatedTax).toBe(174_060_000);

    // ⚠️ 같은 값을 양쪽에서 빼면 순서가 불변이다 — 단일 값 인터페이스가 왜 틀렸는지 고정한다.
    const sameReduction = computeCross1045({
      ...base,
      reduction: { ifClause1: 10_000_000, ifClause2: 10_000_000 },
    });
    expect(sameReduction.applied).toBe(noReduction.applied);
  });

  it("A-5: floor 규약 — **9호 방식(1회)** 이라 부동산 8호 2-floor와 최대 1원 갈린다", () => {
    // 부동산 8호 구현: floor(base×r) − d + floor(base×0.1)  (2회)
    // 이 레이어:       floor(base×(r+0.1)) − d              (1회)
    const base = 100_000_007;
    const r = computeCross1045({
      totalTaxBase: base,
      clause8TaxBase: base,
      clause9TaxBase: 0,
      otherClausesTax: 0,
      ...brackets,
    });
    // 1회 floor: floor(100,000,007 × 45%) − 15,440,000 = 45,000,003 − 15,440,000
    expect(r.merged89Tax).toBe(29_560_003);
    // 부동산 2-floor 결과는 29,560,002 (실측) — **1원 차이는 의도된 규약 선택**이다.
    expect(r.merged89Tax - 29_560_002).toBe(1);
  });

  it("A-6: 8호·9호가 없으면 재합산할 것이 없다 — 그래도 1호 비교는 유효하다", () => {
    const r = computeCross1045({
      totalTaxBase: 600_000_000,
      clause8TaxBase: 0,
      clause9TaxBase: 0,
      otherClausesTax: 100_000_000,
      ...brackets,
    });
    expect(r.merged89Tax).toBe(0);
    expect(r.separate89Tax).toBe(0);
    expect(r.clause2Tax).toBe(100_000_000);
    // 1호 = 600,000,000 × 42% − 35,940,000 = 216,060,000 → 1호 승
    expect(r.clause1Tax).toBe(216_060_000);
    expect(r.applied).toBe("clause1");
  });

  it("A-7: 불변식 — 채택 세액은 언제나 두 호의 MAX(감면 없을 때)", () => {
    for (const [c8, c9, other, total] of [
      [0, 0, 0, 0],
      [243_500_000, 300_000_000, 0, 543_500_000],
      [10_000_000, 10_000_000, 500_000_000, 900_000_000],
      [1_000_000_000, 500_000_000, 0, 1_500_000_000],
    ] as const) {
      const r = computeCross1045({
        totalTaxBase: total,
        clause8TaxBase: c8,
        clause9TaxBase: c9,
        otherClausesTax: other,
        ...brackets,
      });
      expect(r.calculatedTax).toBe(Math.max(r.clause1Tax, r.clause2Tax));
      // 합산은 분리보다 작을 수 없다(누진의 볼록성)
      expect(r.merged89Tax).toBeGreaterThanOrEqual(r.separate89Tax);
    }
  });
});
