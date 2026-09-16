/**
 * Pre-Do anchor — **§102② 통산 축은 「호」가 아니라 「세율」이다** (영 §167의2①1호)
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * 「소득세법 시행령」 §167의2①은 양도차손을 다음 순서로 공제하도록 정한다:
 *   1호 「양도차손이 발생한 자산과 **같은 세율을 적용받는 자산**의 양도소득금액」
 *   2호 「… **다른 세율**을 적용받는 자산 … **각 세율별 양도소득금액의 합계액에서 당해
 *        양도소득금액이 차지하는 비율로 안분**하여 공제」
 *
 * 그런데 `offsetLosses`는 `classifyRateGroup`이 만든 **`RateGroup`**을 그 축으로 썼다.
 * `RateGroup`은 **§104⑤2호(비교과세) 합산 단위**용이고 그 축은 예규가 「제104조 **각 호별**로
 * 합산한 자산」으로 확정한 **「호」**다(기획재정부 재산세제과-536, 2018.6.19. ·
 * 국세청 기준-2018-법령해석재산-0098). **두 축은 직교한다** — 그래서 양방향으로 틀렸다:
 *
 *   🔴 **거짓 분리** — 미등기(§104①10호 70%)와 주택 1년미만(§104①3호 괄호 70%)은
 *      **호는 다르고 세율은 같다**. 1호여야 할 것이 2호 안분으로 갔다. ← 사용자 제보
 *   🔴 **거짓 병합** — §104①2호 40%(토지 1~2년)와 3호 70%(주택 1년미만)가 한 `short_term`
 *      그룹이다. 2호여야 할 것이 1호로 갔다.
 *      §104⑦1호(+20%p)와 3호(+30%p)도 한 `multi_house_surcharge` 그룹이다.
 *
 * 🔑 **코어는 무죄다.** `loss-offset-core.ts`의 배분 순서(1호 → 2호 · pro-rata · floor +
 *    마지막 잔액 흡수)는 정확하다. 고칠 곳은 **`rateKey`를 만드는 축**뿐이다.
 *
 * 🔑 **누진 호는 세율 «값»이 아니라 «표»로 묶는다.** 두 일반누진 자산의 실효세율이 15%·38%로
 *    달라도 「같은 세율(§55① 표)을 적용받는 자산」이다(A-5). 값으로 키를 만들면 일반누진끼리
 *    갈려 1호가 죽는다.
 *
 * 🔑 **차손 자산은 세율 정보를 갖지 않는다** — `buildLossTransferTaxResult`가 `appliedRate: 0`을
 *    싣고 `rateClause`를 **아예 넣지 않는다**(차익 ≤ 0이라 세율 단계에 도달하지 않는다).
 *    그래서 키를 `result.appliedRate`로 만들면 **모든 차손이 `rate:0`이라는 자기만의 그룹에
 *    갇혀 1호가 영구 공전한다**(A-6·A-7·A-8이 그 함정을 고정한다).
 *
 * ── 착수 전 상태(2026-09-16 · 기준 `15aa0d13` 실측) ──────────────────
 *   A-0 ~ A-4 · A-7 : 🔴 **실패해야 한다**
 *   A-5 · A-6 · A-8 · A-9 · A-10 : 🟢 **통과 상태로 시작**한다 — 이 수정이 코어·§104⑤·§103·
 *     「누진은 표로 묶는다」 규약을 건드리지 않음을 고정하는 안전망이다.
 *
 * 계획서: `docs/00-pm/loss-offset-same-rate-axis.plan.md`
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

/**
 * 기본 자산 — 토지 · 취득 2024-01-01 · 양도 2026-06-01(보유 29개월).
 * 보유가 **24개월 이상**이라 단기세율을 타지 않고, **36개월 미만**이라 장기보유특별공제가 0이다
 * (mock `minHoldingYears: 3`). ⇒ **양도차익 = 양도소득금액**이라 통산 수치를 손으로 검산할 수 있다.
 */
function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2024-01-01"),
    acquisitionPrice: 100_000_000,
    transferPrice: 100_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = { taxYear: 2026, annualBasicDeductionUsed: 0, properties };
  return calculateTransferTaxAggregate(input, mockRates);
}

const prop = (r: ReturnType<typeof agg>, id: string) =>
  r.properties.find((p) => p.propertyId === id)!;
/** id → id 로 흐른 통산 1건 */
const row = (r: ReturnType<typeof agg>, from: string, to: string) =>
  r.lossOffsetTable.find((x) => x.fromPropertyId === from && x.toPropertyId === to);

// ════════════════════════════════════════════════════════════════════
// 시나리오 A — 거짓 분리 (사용자 제보 유형)
//   토지 60,000,000(누진) · **미등기 차손 −20,000,000(70%)** ·
//   **주택 1년미만 19,000,000(70%)** · 토지 140,000,000(누진)
//
//   법정: 같은 70%인 주택에 19,000,000을 **먼저** 공제(1호) →
//         잔액 1,000,000을 60:140으로 안분(2호) = 300,000 / 700,000
//   현행: 전액 2호 안분 5,479,452 / 1,735,159 / 12,785,389 (실측)
// ════════════════════════════════════════════════════════════════════
const scenarioA = () =>
  agg([
    item("A1", { transferPrice: 160_000_000 }),
    item("A2", { transferPrice: 80_000_000, isUnregistered: true }),
    item("A3", {
      propertyType: "housing",
      transferPrice: 119_000_000,
      acquisitionDate: D("2025-10-01"),
    }),
    item("A4", { transferPrice: 240_000_000 }),
  ]);

// ════════════════════════════════════════════════════════════════════
// 시나리오 B — 거짓 병합 (A의 거울상)
//   **토지 1~2년 차손 −20,000,000(§104①2호 40%)** · 주택 1년미만 19,000,000(3호 70%) ·
//   토지 60,000,000(누진) · 토지 140,000,000(누진)
//
//   법정: 세율이 다르므로 **1호 없음** → 전액 2호 안분
//   현행: 둘 다 `short_term` 그룹이라 19,000,000이 1호로 전액 흡수 (실측)
// ════════════════════════════════════════════════════════════════════
const scenarioB = () =>
  agg([
    item("B1", { transferPrice: 80_000_000, acquisitionDate: D("2025-01-01") }),
    item("B2", {
      propertyType: "housing",
      transferPrice: 119_000_000,
      acquisitionDate: D("2025-10-01"),
    }),
    item("B3", { transferPrice: 160_000_000 }),
    item("B4", { transferPrice: 240_000_000 }),
  ]);

describe("§102② 통산 축 — 「세율」(영 §167의2①1호)", () => {
  // ── 🔴 A-0 ────────────────────────────────────────────────────────
  it("A-0: 미등기 차손(§104①10호 70%)은 주택 1년미만(3호 70%)에 **먼저** 공제된다", () => {
    const r = scenarioA();
    const a3 = prop(r, "A3");
    expect(a3.lossOffsetFromSameGroup, "같은 70%이므로 §167의2①1호").toBe(19_000_000);
    expect(a3.lossOffsetFromOtherGroup).toBe(0);
    expect(a3.incomeAfterOffset).toBe(0);
    expect(row(r, "A2", "A3")?.scope).toBe("same_group");
  });

  // ── 🔴 A-1 ────────────────────────────────────────────────────────
  it("A-1: 잔액 1,000,000이 60,000,000:140,000,000 비율로 안분된다 (2호)", () => {
    const r = scenarioA();
    expect(prop(r, "A1").lossOffsetFromOtherGroup).toBe(300_000);
    expect(prop(r, "A4").lossOffsetFromOtherGroup).toBe(700_000);
    expect(prop(r, "A1").lossOffsetFromSameGroup).toBe(0);
    expect(prop(r, "A4").lossOffsetFromSameGroup).toBe(0);
    expect(row(r, "A2", "A1")?.scope).toBe("other_group");
    expect(row(r, "A2", "A4")?.scope).toBe("other_group");
    expect(r.unusedLoss).toBe(0);
  });

  // ── 🔴 A-2 — **세액이 바뀐다** ────────────────────────────────────
  it("A-2: 시나리오 A 총 납부세액 = 60,203,000 (현행 65,400,222 — 5,197,222 과대)", () => {
    const r = scenarioA();
    expect(r.taxBase, "과세표준 합계는 통산 축과 무관하게 동일하다").toBe(196_500_000);
    expect(r.totalTax).toBe(60_203_000);
  });

  // ── 🔴 A-3 ────────────────────────────────────────────────────────
  it("A-3: 40%(§104①2호) 차손은 70%(3호) 차익과 **같은 세율이 아니다** — 1호 없음", () => {
    const r = scenarioB();
    expect(prop(r, "B2").lossOffsetFromSameGroup, "종전 19,000,000 전액 흡수").toBe(0);
    expect(r.lossOffsetTable.every((x) => x.scope === "other_group")).toBe(true);
    // 전액 2호 안분 — 19,000,000 : 60,000,000 : 140,000,000
    expect(prop(r, "B2").lossOffsetFromOtherGroup).toBe(1_735_159);
    expect(prop(r, "B3").lossOffsetFromOtherGroup).toBe(5_479_452);
    expect(prop(r, "B4").lossOffsetFromOtherGroup).toBe(12_785_389);
  });

  // ── 🔴 A-4 — **세액이 바뀐다**(A와 정확히 반대 부호) ──────────────
  it("A-4: 시나리오 B 총 납부세액 = 65,400,222 (현행 60,203,000 — 5,197,222 과소)", () => {
    const r = scenarioB();
    expect(r.taxBase).toBe(196_500_000);
    expect(r.totalTax).toBe(65_400_222);
  });

  // ── 🔴 A-7 ────────────────────────────────────────────────────────
  it("A-7: §104⑦1호(+20%p)와 3호(+30%p)는 **다른 세율**이다 — 한 그룹으로 묶이면 안 된다", () => {
    const r = agg([
      // 조정지역 2주택 차손 −20,000,000
      item("C1", {
        propertyType: "housing",
        transferPrice: 80_000_000,
        isRegulatedArea: true,
        householdHousingCount: 2,
      }),
      // 조정지역 3주택 차익 200,000,000
      item("C2", {
        propertyType: "housing",
        transferPrice: 300_000_000,
        isRegulatedArea: true,
        householdHousingCount: 3,
      }),
      // 일반 누진 60,000,000 — 2호 안분 상대가 있어야 배분이 관측된다
      item("C3", { transferPrice: 160_000_000 }),
    ]);
    expect(row(r, "C1", "C2")?.scope, "종전 same_group 20,000,000").toBe("other_group");
    // 2호 안분 — 200,000,000 : 60,000,000 (합 260,000,000), pool 20,000,000
    expect(prop(r, "C2").lossOffsetFromOtherGroup).toBe(15_384_615);
    expect(prop(r, "C3").lossOffsetFromOtherGroup).toBe(4_615_385);
    expect(prop(r, "C2").lossOffsetFromSameGroup).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════
  // 🟢 감시 — **통과 상태로 시작**한다. 수정이 이 규약들을 깨지 않음을 고정한다.
  // ══════════════════════════════════════════════════════════════════

  it("A-5 🟢: 누진은 «표»로 묶는다 — 실효세율 15%·38%인 두 §55① 자산은 같은 세율이다", () => {
    const r = agg([
      item("D1", { transferPrice: 90_000_000 }),   // −10,000,000 누진 차손
      item("D2", { transferPrice: 130_000_000 }),  // 30,000,000 (15% 구간)
      item("D3", { transferPrice: 400_000_000 }),  // 300,000,000 (38% 구간)
    ]);
    expect(prop(r, "D2").appliedRate).not.toBe(prop(r, "D3").appliedRate); // 실효세율이 다르다
    expect(r.lossOffsetTable.every((x) => x.scope === "same_group"), "그래도 §55① 한 표다").toBe(true);
    expect(prop(r, "D2").lossOffsetFromSameGroup).toBe(909_090);
    expect(prop(r, "D3").lossOffsetFromSameGroup).toBe(9_090_910);
  });

  it("A-6 🟢: 차손 자산도 세율 키를 갖는다 — 미등기 차손 ↔ 미등기 차익은 1호다", () => {
    const r = agg([
      item("E1", { transferPrice: 80_000_000, isUnregistered: true }),   // −20,000,000
      item("E2", { transferPrice: 150_000_000, isUnregistered: true }),  // 50,000,000
      item("E3", { transferPrice: 160_000_000 }),                        // 60,000,000 누진
    ]);
    // `rate:0` 같은 자기만의 키에 갇히면 이 단언이 깨진다.
    expect(row(r, "E1", "E2")?.scope).toBe("same_group");
    expect(prop(r, "E2").lossOffsetFromSameGroup).toBe(20_000_000);
    expect(prop(r, "E3").lossOffsetFromOtherGroup).toBe(0);
  });

  it("A-8 🟢: 미등기 70% 차손은 토지 1년미만 50% 차익과 **다른 세율**이다", () => {
    const r = agg([
      item("F1", { transferPrice: 80_000_000, isUnregistered: true }),                 // −20,000,000
      item("F2", { transferPrice: 150_000_000, acquisitionDate: D("2025-10-01") }),    // 50,000,000 @50%
      item("F3", { transferPrice: 160_000_000 }),                                      // 60,000,000 누진
    ]);
    expect(r.lossOffsetTable.every((x) => x.scope === "other_group")).toBe(true);
    expect(prop(r, "F2").lossOffsetFromOtherGroup).toBe(9_090_909);
    expect(prop(r, "F3").lossOffsetFromOtherGroup).toBe(10_909_091);
  });

  it("A-9 🟢: 비사업용 토지(§104①8호)끼리는 1호다 — 사업용 누진과는 2호다", () => {
    const r = agg([
      item("G1", { transferPrice: 80_000_000, isNonBusinessLand: true }),   // −20,000,000
      item("G2", { transferPrice: 160_000_000 }),                           // 60,000,000 누진
      item("G3", { transferPrice: 240_000_000, isNonBusinessLand: true }),  // 140,000,000 §104①8호
    ]);
    expect(row(r, "G1", "G3")?.scope).toBe("same_group");
    expect(prop(r, "G3").lossOffsetFromSameGroup).toBe(20_000_000);
    expect(prop(r, "G2").lossOffsetFromSameGroup + prop(r, "G2").lossOffsetFromOtherGroup).toBe(0);
  });

  it("A-11 🟢: 분양권은 **호가 1호여도 누진표가 아니다** (§104①1호 괄호 단일 60%)", () => {
    const r = agg([
      item("P1", { transferPrice: 80_000_000 }),                                  // −20,000,000 §55① 누진 차손
      item("P2", { propertyType: "presale_right", transferPrice: 250_000_000 }),   // 150,000,000 @60%
      item("P3", { transferPrice: 160_000_000 }),                                  // 60,000,000 §55① 누진
    ]);
    // 🔴 키를 「호」로만 만들면 분양권과 일반 누진이 **둘 다 `104-1-1`**이라 1호로 통산된다.
    //    같은 함정이 `clauseBucketKey`에도 있고 거기서는 `classifyRateGroup`이 분양권을
    //    `short_term`으로 빼 막는다(`presale-clause-1-bucket-guard.anchor.test.ts`).
    expect(prop(r, "P2").appliedRate, "분양권은 단일 60%").toBe(0.6);
    expect(row(r, "P1", "P2"), "분양권은 §55① 표가 아니다 — 1호가 성립하지 않는다").toBeUndefined();
    expect(prop(r, "P3").lossOffsetFromSameGroup, "누진끼리만 1호").toBe(20_000_000);
    expect(prop(r, "P2").lossOffsetFromSameGroup + prop(r, "P2").lossOffsetFromOtherGroup).toBe(0);
  });

  it("A-10 🟢: 차손이 없으면 §104⑤·§103 결과가 한 글자도 바뀌지 않는다", () => {
    const r = agg([
      item("H1", { transferPrice: 160_000_000 }),                                   // 60,000,000 누진
      item("H2", { propertyType: "housing", transferPrice: 119_000_000, acquisitionDate: D("2025-10-01") }), // 19,000,000 @70%
      item("H3", { transferPrice: 240_000_000, isNonBusinessLand: true }),          // 140,000,000 §104①8호
    ]);
    expect(r.lossOffsetTable).toHaveLength(0);
    expect(r.basicDeduction).toBe(2_500_000);
    // 기본공제는 최고세율 자산(70% 주택)에 전액 귀속된다 (MAX_BENEFIT)
    expect(prop(r, "H2").allocatedBasicDeduction).toBe(2_500_000);
    expect(r.groupTaxes.map((g) => g.group).sort()).toEqual(
      ["non_business_land", "progressive", "short_term"],
    );
    expect(r.taxBase).toBe(216_500_000);
    expect(r.totalTax).toBe(74_525_000);
  });
});
