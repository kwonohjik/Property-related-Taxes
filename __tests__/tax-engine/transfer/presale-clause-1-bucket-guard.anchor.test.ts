/**
 * anchor(가드): **분양권 60%는 §104①1호인데 누진이 아니다** — `clauseBucketKey`가 구분하지 못한다.
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * §104①**1호**는 「제55조제1항에 따른 세율(**분양권의 경우에는 양도소득 과세표준의 100분의 60**)」이다.
 * 즉 분양권 2년 이상은 **호는 1호인데 세율은 단일 60%**다(`transfer-tax-rate-calc.ts:440·452`).
 *
 * `clauseBucketKey`는 「누진 호가 하나라도 포함되면 **세율을 키에 넣지 않는다**」는 규약을 쓰고,
 * `PROGRESSIVE_RATE_CLAUSES`에 `"104-1-1"`이 들어 있다(`transfer-tax-rate-clause.ts:34·91`).
 * 그 규약 자체는 옳다 — 합산액에 각 해당 호별 세율을 다시 적용해 MAX를 취하는 것이 §104⑤2호
 * 단서이므로 개별 자산의 **승자 세율**은 묶음 판정에 무의미하다(교재 사례2 = D-11).
 * **그런데 분양권의 60%는 승자 세율이 아니라 법이 1호 안에 박아 둔 단일세율이다.**
 *
 * ⇒ 결과적으로 분양권 2년+와 사업용 토지 2년+가 **같은 버킷 키**를 낸다(G-1이 고정).
 *   두 자산이 같은 `rateGroup`에 들어오는 순간 `calcTax(합산 과세표준, 대표.rateInput)`이
 *   대표의 규칙을 전체에 적용해 **순서 의존 + 대형 오차**가 된다.
 *
 * 지금 그 일이 벌어지지 않는 **유일한 이유**는 `classifyRateGroup`이 분양권을 보유기간과 무관하게
 * `short_term`으로 보내 누진 자산과 그룹을 분리해 두기 때문이다
 * (`transfer-tax-aggregate-helpers.ts:91` — 2026-07-29 #591 감사 R7 정정. 종전에 분양권이
 *  `progressive`로 새어 그룹 대표세율 60%가 합산 과세표준 전체에 적용돼 **63,940,000 과세 초과**였다).
 *
 * ⚠️ **이 파일은 그 방어선을 불변식으로 고정한다.** 분양권의 그룹 분류를 바꾸려는 변경은
 *   여기서 먼저 빨개져야 한다 — R7이 고친 결함이 조용히 재발하는 것을 막는 것이 목적이다.
 *
 * ❌ **`clauseBucketKey`를 「1호를 누진/단일로 쪼개는」 방향으로 고치기 전에는 법령 검토가 선행이다.**
 *   예규(「"자산별" = 제104조 **각 호별로 합산한 자산**」 — 기획재정부 재산세제과-536 ·
 *   국세청 기준-2018-법령해석재산-0098)를 문언 그대로 적용하면 분양권과 사업용 토지는 **둘 다 1호라
 *   합산 대상**인데, 1호의 세율이 자산마다 다르므로(§55① 누진 vs 60%) 합산액에 무엇을 적용할지가
 *   문언만으로 결정되지 않는다. 근거 없이 키 규약을 바꾸면 세액 판정을 해석으로 가르는 것이다
 *   (memory `feedback_unverified_authority_blocks_tax_change`).
 *   ⇒ 현재 세액 영향은 **0**이므로 엔진은 건드리지 않는다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { clauseBucketKey, PROGRESSIVE_RATE_CLAUSES } from "@/lib/tax-engine/transfer-tax-rate-clause";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const mockRates = makeMockRates();
const parsedRates = parseRatesFromMap(mockRates);
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-01-01"), // 11년 보유 → 단기 구간 밖
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

const presale = (id: string, gross: number) =>
  item(id, { propertyType: "presale_right", transferPrice: gross });
const plainLand = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: false });

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}
const groupOf = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g);

describe("§104①1호 괄호 — 분양권 60%와 누진 자산의 버킷 키 충돌 가드", () => {
  it("G-1: 분양권 2년+와 사업용 토지 2년+가 **같은 버킷 키**를 낸다 (위험의 근원)", () => {
    const asInput = (o: Partial<TransferTaxInput>) =>
      ({ ...baseTransferInput(), acquisitionDate: D("2015-01-01"), transferDate: D("2026-06-01"), ...o }) as TransferTaxInput;

    const p = calcTax(300_000_000, parsedRates, asInput({ propertyType: "presale_right" }));
    const l = calcTax(200_000_000, parsedRates, asInput({ propertyType: "land" }));

    // 분양권은 2년 이상이어도 60% 단일세율이고, 그 호는 §104①**1호**다.
    expect(p.appliedRate).toBe(0.60);
    expect(p.candidateClauses).toEqual(["104-1-1"]);
    // 사업용 토지는 같은 1호이지만 누진세율이다.
    expect(l.candidateClauses).toEqual(["104-1-1"]);
    expect(l.appliedRate).not.toBe(0.60);

    // `"104-1-1"`이 누진 호로 등록돼 있어 **세율이 키에서 빠진다** → 두 키가 같아진다.
    expect(PROGRESSIVE_RATE_CLAUSES.has("104-1-1")).toBe(true);
    expect(clauseBucketKey(p.candidateClauses, p.appliedRate, "P")).toBe("104-1-1");
    expect(clauseBucketKey(l.candidateClauses, l.appliedRate, "L")).toBe("104-1-1");
  });

  it("G-2: **방어선** — `classifyRateGroup`이 두 자산을 다른 그룹으로 분리한다", () => {
    const r = agg([presale("P", 300_000_000), plainLand("L", 200_000_000)]);

    // 분양권은 보유기간과 무관하게 `short_term`(§104①1호 괄호 60% = 누진이 아니므로).
    expect(groupOf(r, "short_term")).toBeDefined();
    expect(groupOf(r, "short_term")!.assetIds).toEqual(["P"]);
    // 사업용 토지는 `progressive`.
    expect(groupOf(r, "progressive")).toBeDefined();
    expect(groupOf(r, "progressive")!.assetIds).toEqual(["L"]);

    // 분류 함수를 직접 호출해도 같은 결론이다(집계 경로에 의존하지 않는 고정).
    expect(groupOf(r, "short_term")!.assetIds).not.toContain("L");
  });

  it("G-3: 그룹이 분리돼 있어 분양권 과세표준에 **정확히 60%**만 적용된다", () => {
    const r = agg([presale("P", 300_000_000), plainLand("L", 200_000_000)]);
    const st = groupOf(r, "short_term")!;
    const pg = groupOf(r, "progressive")!;

    // 분양권은 §95② 장기보유특별공제 대상이 아니다 → 과세표준 = 양도차익.
    expect(st.groupTaxBase).toBe(300_000_000);
    expect(st.groupCalculatedTax).toBe(180_000_000); // 300,000,000 × 60%

    // 두 그룹의 과세표준이 **합쳐지지 않았다**는 것이 이 가드의 핵심이다.
    expect(pg.groupTaxBase).toBe(156_000_000); // 200,000,000 − LTHD 22%(11년)
    expect(st.groupTaxBase + pg.groupTaxBase).toBe(456_000_000);

    // 156,000,000 × 38% − 19,940,000 = 39,340,000
    expect(pg.groupCalculatedTax).toBe(39_340_000);
    expect(r.calculatedTaxByGroups).toBe(219_340_000); // 180,000,000 + 39,340,000

    // ❌ 만약 두 자산이 한 그룹에 들어와 같은 버킷으로 묶였다면 대표가 분양권일 때
    //    456,000,000 × 60% = 273,600,000이 되어 **54,260,000 과대**(대표가 토지면 반대로 과소).
    //    R7이 고친 63,940,000급 결함의 재현이다.
    expect(r.calculatedTaxByGroups).not.toBe(273_600_000);
  });

  it("G-4: 분양권끼리는 종전대로 합산 1회 — 60% 선형이라 자산별 합과 같다", () => {
    const r = agg([presale("P1", 300_000_000), presale("P2", 200_000_000)]);
    const st = groupOf(r, "short_term")!;
    expect(st.groupTaxBase).toBe(500_000_000);
    expect(st.groupCalculatedTax).toBe(300_000_000); // 500,000,000 × 60%
  });
});
