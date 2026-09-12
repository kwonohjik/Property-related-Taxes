/**
 * 지목변경 간주취득 과세표준 — §10의6① 본칙 / §10의6② 보충 anchor — [AT-LC]
 *
 * 「지방세법」 §10의6 (MST 282559, 시행 2026-01-01):
 * > ① 다음 각 호의 경우 취득 당시가액은 그 변경으로 증가한 가액에 해당하는 **사실상취득가격**으로 한다.
 * >   1. 토지의 지목을 사실상 변경한 경우
 * > ② 제1항에도 불구하고 … **사실상취득가격을 확인할 수 없는 경우** 취득당시가액은 제4조에 따른
 * >   시가표준액을 대통령령으로 정하는 방법에 따라 계산한 가액으로 한다.
 * >   1. 제1항제1호에 해당하는 경우
 *
 * 「지방세법 시행령」 §18의6 (MST 287223, 시행 2026-07-01):
 * > 1. 법 제10조의6제1항제1호의 경우: … **가목의 가액에서 나목의 가액을 뺀 가액**
 * >   가. 지목변경 **이후**의 토지에 대한 시가표준액  나. 지목변경 **전**의 토지에 대한 시가표준액
 *
 * ## §1 — 본칙(사실상취득가격) 〔변경 전 red〕
 *
 * 종전 엔진은 시가표준액 차액**만** 계산했다. 즉 보충법을 본칙처럼 쓰고 있었고,
 * 사실상취득가격을 아는 납세자가 본칙대로 신고할 경로가 **없었다**.
 *
 * ## §2 — 보충법은 그대로 (대조군)
 *
 * 현행 동작을 고정한다. §1이 「본칙이 된다」만 말하면 보충법이 조용히 사라져도 모른다.
 *
 * ## §3 — 우선순위·경계
 *
 * §10의6②은 「①에도 **불구하고** … 확인할 수 **없는** 경우」다. 확인된 값이 있으면 ②의
 * 요건 자체가 성립하지 않으므로 **본칙이 이긴다**. 「증가한 가액」이 아니면 과세도 없다.
 *
 * ## §4 — 세율 축과 독립 (역방향 가드)
 *
 * 과세표준 축(§10의6)과 세율 축(§15②)은 다른 조문이다. 본칙을 켜도 사치성 10%는 그대로여야
 * 하고, 이 짝이 없으면 §1이 두 축을 뒤섞어도 red 가 되지 않는다.
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import {
  assessLandCategoryChange,
  landTaxBaseLegalBasis,
} from "@/lib/tax-engine/acquisition-deemed";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

/** 시가표준액 차액 = 1.5억 (본칙 금액과 다른 값이라 어느 쪽이 쓰였는지 구별된다) */
const PREV_SV = 100_000_000;
const NEW_SV = 250_000_000;
const SV_DIFF = NEW_SV - PREV_SV; // 150,000,000
/** 사실상취득가격 = 3억 — 차액과 **다르다** */
const ACTUAL = 300_000_000;

function land(lc: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return calcAcquisitionTax({
    propertyType: "land",
    acquisitionCause: "deemed_land_category",
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput: { landCategory: { prevCategory: "전", newCategory: "대", ...lc } },
    ...extra,
  } as unknown as AcquisitionTaxInput);
}

describe("[AT-LC] §1 본칙 — §10의6①1호 사실상취득가격", () => {
  it("[AT-LC-01] 사실상취득가격만 주면 그 금액이 과세표준이다", () => {
    const r = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      actualPrice: ACTUAL,
    });
    expect(r.isSubjectToTax).toBe(true);
    expect(r.deemedTaxBase).toBe(ACTUAL);
    expect(r.basis).toBe("actual_price");
  });

  it("[AT-LC-02] 세액까지 — 3억 × 2%(§15② 본문) = 600만", () => {
    const r = land({ actualPrice: ACTUAL });
    expect(r.taxBase).toBe(ACTUAL);
    expect(r.acquisitionTax).toBe(6_000_000);
  });

  it("[AT-LC-03] 근거는 §10의6①1호 — 보충법 조문이 아니다", () => {
    expect(landTaxBaseLegalBasis("actual_price")).toContain("§10의6①");
    expect(landTaxBaseLegalBasis("actual_price")).not.toContain("§18의6");
  });

  it("[AT-LC-04] 시가표준액을 함께 줘도 본칙이 이긴다 (§10의6② 「①에도 불구하고 … 확인할 수 없는 경우」)", () => {
    const r = land({
      actualPrice: ACTUAL,
      prevStandardValue: PREV_SV,
      newStandardValue: NEW_SV,
    });
    // 차액 1.5억이 아니라 본칙 3억이어야 한다 — 두 값이 달라 구별된다
    expect(r.taxBase).toBe(ACTUAL);
    expect(r.taxBase).not.toBe(SV_DIFF);
  });
});

describe("[AT-LC] §2 보충 — §10의6②1호·시행령 §18의6 1호 (현행 동작 고정)", () => {
  it("[AT-LC-10] 시가표준액만 주면 「후 − 전」 차액이 과세표준이다", () => {
    const r = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      prevStandardValue: PREV_SV,
      newStandardValue: NEW_SV,
    });
    expect(r.isSubjectToTax).toBe(true);
    expect(r.deemedTaxBase).toBe(SV_DIFF);
    expect(r.basis).toBe("standard_value");
  });

  it("[AT-LC-11] 세액까지 — 1.5억 × 2% = 300만 (종전과 동일)", () => {
    const r = land({ prevStandardValue: PREV_SV, newStandardValue: NEW_SV });
    expect(r.taxBase).toBe(SV_DIFF);
    expect(r.acquisitionTax).toBe(3_000_000);
  });

  it("[AT-LC-12] 근거는 시행령 §18의6까지 명시한다", () => {
    const b = landTaxBaseLegalBasis("standard_value");
    expect(b).toContain("§10의6②");
    expect(b).toContain("지방세법 시행령 §18의6");
  });
});

describe("[AT-LC] §3 경계 — 「증가한 가액」", () => {
  it("[AT-LC-20] 사실상취득가격 0 → 과세 없음", () => {
    const r = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      actualPrice: 0,
    });
    expect(r.isSubjectToTax).toBe(false);
    expect(r.deemedTaxBase).toBe(0);
  });

  it("[AT-LC-21] 시가표준액이 줄면 과세 없음 (보충법 — 종전 동작)", () => {
    const r = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      prevStandardValue: NEW_SV,
      newStandardValue: PREV_SV,
    });
    expect(r.isSubjectToTax).toBe(false);
    expect(r.deemedTaxBase).toBe(0);
  });

  it("[AT-LC-22] 둘 다 없으면 과세 없음 — 조용히 0원 과세하지 않는다", () => {
    const r = assessLandCategoryChange({ prevCategory: "전", newCategory: "대" });
    expect(r.isSubjectToTax).toBe(false);
  });
});

describe("[AT-LC] §4 세율 축(§15②)과 독립", () => {
  it("[AT-LC-30] 본칙 + 사치성(§13⑤) → 3억 × 10% = 3,000만", () => {
    const r = land(
      { actualPrice: ACTUAL },
      { isLuxuryProperty: true, luxuryType: "golf_course" },
    );
    expect(r.taxBase).toBe(ACTUAL);
    expect(r.acquisitionTax).toBe(30_000_000);
  });

  it("[AT-LC-31] 보충 + 사치성 → 1.5억 × 10% = 1,500만 (과세표준만 갈린다)", () => {
    const r = land(
      { prevStandardValue: PREV_SV, newStandardValue: NEW_SV },
      { isLuxuryProperty: true, luxuryType: "golf_course" },
    );
    expect(r.taxBase).toBe(SV_DIFF);
    expect(r.acquisitionTax).toBe(15_000_000);
  });
});
