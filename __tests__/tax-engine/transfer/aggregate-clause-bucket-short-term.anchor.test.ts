/**
 * anchor: `short_term` 그룹도 **「해당 호 후보 집합」별 버킷 합산**이다 (Q2 — E-1 해소)
 *
 * 계획서: docs/02-design/features/transfer-rate-clause-candidates.plan.md §3(E-1) · §6 Q2
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * `rateClauseKeyOf`(구 `transfer-tax-aggregate-helpers.ts:427`)는 **단기 밴드 + 다주택 밴드**만
 * 봤다 — **§104①8호(비사업용 토지) 축이 통째로 없었다.** `classifyRateGroup`이 2년 미만을 전부
 * `short_term`으로 보내므로 **비사업용 토지**가 **사업용 토지**와 같은 키가 되어 합산 1회로
 * 떨어졌고, 그 합산은 **입력 목록 첫 자산**의 세율 규칙을 썼다 ⇒ **입력 순서에 따라 세액이 달라졌다.**
 *
 * 누수 경로는 **둘**이었다(둘 다 실측):
 *   ⓐ `sameRateClause` — 비사토 축 누락 (E-1 본체)
 *   ⓑ `uniformRate`    — 비사토가 §104① 후단에서 **단기세율로 이겨** 적용세율이 40%가 되면
 *                        사업용 토지(40%)와 **세율이 같아져** 후보 집합이 달라도 합쳐졌다
 *
 * ── 도출 근거 ───────────────────────────────────────────────────────────
 * §104⑤2호 **본문**의 「자산별」은 예규가 **「제104조 각 호별로 합산한 자산」**으로 확정했다
 * (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」
 * [법령해석과-1715] 2018.6.21.). ⇒ **합산 단위는 「호」다.** 해당 호가 다르면 합치지 않고,
 * 같으면 **무조건** 합친다(단서가 아니라 본문).
 *
 * 누진 호 분기는 P12가 이미 이 규약(호별 버킷)으로 옮겼다 — 이 파일은 `short_term`을 같은
 * 규약으로 통일한 것을 고정한다(memory `feedback_sibling_path_already_implements_rule`).
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/** 토지 · 2025-01-01 취득 → 2026-06-01 양도 = **17개월**(§104①2호 구간) · 장특 0 */
function land(id: string, gross: number, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2025-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    ...o,
  };
}
const nbl = (id: string, gross: number, o: Partial<TransferTaxItemInput> = {}) =>
  land(id, gross, { isNonBusinessLand: true, ...o });

function run(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

// ── 자산 단독 세액(§104① 후단까지 반영) ─────────────────────────────────
//  N  비사토 3억 : 누진 94,060,000 + 10% 30,000,000 = 124,060,000 > 40% 120,000,000 → **①8호 승**
//  N2 비사토 2억 : 누진 56,060,000 + 10% 20,000,000 =  76,060,000 <  40%  80,000,000 → **①2호 승**
//  P  사업용 2억 : 40% = 80,000,000
const N = nbl("N", 300_000_000);
const N2 = nbl("N2", 200_000_000);
const P = land("P", 200_000_000);
const P3 = land("P3", 200_000_000);

describe("Q2 — E-1 본체: 비사업용 + 사업용은 **해당 호가 달라** 합치지 않는다", () => {
  /**
   * N의 해당 호 = {①8호, ①2호} · P = {①2호}. **공유 호가 ①2호뿐**이라 합산하면 어느 쪽이든
   * 법문에 어긋난다 — ①8호로 묶으면 P에 없는 비사업용 가산이 붙고(과대), ①2호로 묶으면
   * N의 가산이 사라진다(과소). ⇒ 「동일한 호의 세율이 적용되고」 불충족 → **2호 본문(자산별 합)**.
   */
  it("Q-1: `[N, P]` = 124,060,000 + 80,000,000", () => {
    expect(run([N, P]).calculatedTax).toBe(204_060_000);
  });

  it("Q-2: **순서 반전** `[P, N]` — 같은 값 (성공 기준)", () => {
    expect(run([P, N]).calculatedTax).toBe(204_060_000);
  });
});

describe("Q2 — 누수 ⓑ: 적용세율이 같아도 **해당 호가 다르면** 합치지 않는다", () => {
  /**
   * N2는 §104① 후단에서 **단기세율(40%)이 이겼다** — `appliedRate`가 P와 같아진다.
   * 종전 `uniformRate`는 그 세율 동일성만 보고 합쳤다(순서 의존 174,060,000 ↔ 160,000,000).
   * 「해당」 호는 여전히 {①8호, ①2호} ≠ {①2호}다.
   */
  it("Q-6: `[N2, P]` = 80,000,000 + 80,000,000", () => {
    expect(run([N2, P]).calculatedTax).toBe(160_000_000);
  });

  it("Q-6b: **순서 반전** `[P, N2]` — 같은 값", () => {
    expect(run([P, N2]).calculatedTax).toBe(160_000_000);
  });
});

describe("Q2 — 같은 호는 **버킷 단위로** 합산한다 (그룹 전체 붕괴 금지)", () => {
  /**
   * N·N2는 해당 호 집합이 **같다**({①8호, ①2호}) — 승자가 갈렸을 뿐이다.
   * 예규 본문대로 **합산 1회**: 5억 → 누진 174,060,000 + 10% 50,000,000 = 224,060,000
   * (> 40% 200,000,000). P3는 호가 달라 **자기 버킷**에 남는다.
   *
   * 종전에는 「하나라도 키가 다르면 그룹 전체가 자산별 합」이라 N·N2 합산까지 끊겼다
   * — 누진 호 분기의 D-12(P12가 해소)와 같은 성질이다.
   */
  it("Q-7: `[N, N2, P3]` = 합산(N+N2) 224,060,000 + P3 80,000,000", () => {
    expect(run([N, N2, P3]).calculatedTax).toBe(304_060_000);
  });

  it("Q-7b: **순서 반전** `[P3, N2, N]` — 같은 값", () => {
    expect(run([P3, N2, N]).calculatedTax).toBe(304_060_000);
  });

  it("Q-3 회귀: 비사토 2건만 — 합산 유지 (승자가 갈려도 같은 호)", () => {
    expect(run([N, N2]).calculatedTax).toBe(224_060_000);
    expect(run([N2, N]).calculatedTax).toBe(224_060_000);
  });

  it("Q-4 회귀: 사업용 2건만 — 단일세율 호 `②|40%` 합산 1회 (불변)", () => {
    expect(run([P, P3]).calculatedTax).toBe(160_000_000);
  });
});

describe("Q2 — 위기취득 비사업용 토지는 **§104①1호**다 (계획서 §9 등록 갭)", () => {
  /**
   * 「소득세법」 부칙(제9270호) §14①은 2009.3.16~2012.12.31 취득 자산의 **중과세율을 배제**한다
   * — 정본 `legal-codes/surcharge-transition.ts:42`가 「→**§104①1호 기본세율**, 보유 2년 미만이면
   * §104①2·3호 단기」로 확정해 둔 해석이다(「기획재정부 재산세제과-1422」 2023.12.26. ·
   * 서울행정법원 2024구단72950).
   *
   * 그런데 호 표기는 `"104-1-8"` 그대로여서 **가산이 0인 자산이 일반 비사업용 토지와 같은 버킷**에
   * 들어갔다 → 합산 대표가 위기취득이면 가산이 통째로 사라지고, 아니면 위기취득분에까지 가산이 붙었다.
   *
   * 실측(둘 다 2년 이상 → `non_business_land` 그룹 · 수정 전 ↔ 수정 후):
   *   `[CB, CnB]` 186,660,000 ↔ `[CnB, CB]` 239,660,000 — **53,000,000 순서 의존** → 202,620,000 고정
   *
   * ⚠️ 그룹 세액이 곧 결정세액이 아니다 — 그 위에 **§104⑤ MAX(1호 합산누진, 2호 호별 합)**가
   *   한 번 더 걸린다. 아래 CB/CnB는 **2호가 이기는** 조합이라 버킷 분리가 그대로 드러난다.
   */
  /** 2010-06-01 취득(위기취득 윈도우) · 16년 보유 → 장특 30% · 가산 0 → 단독 33,560,000 */
  const CB = nbl("CB", 200_000_000, { acquisitionDate: D("2010-06-01") });
  /** 2015-01-01 취득 · 11년 보유 → 장특 22% · 가산 10%p → 단독 169,060,000 */
  const CnB = nbl("CnB", 500_000_000, { acquisitionDate: D("2015-01-01") });

  it("Q-8: `[CB, CnB]` = 33,560,000 + 169,060,000 (호가 달라 각자 계산)", () => {
    // 1호(합산누진 530,000,000) = 186,660,000 < 2호 202,620,000 → 2호 채택
    expect(run([CB, CnB]).calculatedTax).toBe(202_620_000);
  });

  it("Q-8b: **순서 반전** `[CnB, CB]` — 같은 값 (종전 239,660,000)", () => {
    expect(run([CnB, CB]).calculatedTax).toBe(202_620_000);
  });

  it("Q-8c: 위기취득끼리는 §104①1호로 합산된다", () => {
    const C2 = nbl("C2", 300_000_000, { acquisitionDate: D("2010-06-01") });
    const C3 = nbl("C3", 200_000_000, { acquisitionDate: D("2010-06-01") });
    // 장특 30% → 소득금액 210,000,000 + 140,000,000 = 350,000,000
    // 누진(350,000,000) = 350,000,000 × 40% − 25,940,000 = 114,060,000
    expect(run([C2, C3]).calculatedTax).toBe(114_060_000);
    expect(run([C3, C2]).calculatedTax).toBe(114_060_000);
  });

  it("Q-8d: 1호가 이기면 세액은 같지만 **순서 의존은 사라진다** (종전 120,460,000 ↔ 157,060,000)", () => {
    const C2 = nbl("C2", 300_000_000, { acquisitionDate: D("2010-06-01") });
    const Cn2 = nbl("Cn2", 200_000_000, { acquisitionDate: D("2015-01-01") });
    // 2호 = 59,860,000 + 54,940,000 = 114,800,000 < 1호(합산누진 366,000,000) 120,460,000
    expect(run([C2, Cn2]).calculatedTax).toBe(120_460_000);
    expect(run([Cn2, C2]).calculatedTax).toBe(120_460_000);
  });
});
