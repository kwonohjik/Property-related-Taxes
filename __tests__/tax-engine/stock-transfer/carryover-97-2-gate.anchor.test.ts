/**
 * anchor: 주식 이월과세 §97의2① **게이트** (계획서 §5.1 G-1~G-6)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * §97의2①이 「해당하는 자산」인지를 가르는 축은 **넷**이고, 하나라도 못 넘으면
 * 취득가액 승계(①1호)도 세율 통산(§104②2호)도 **둘 다** 일어나지 않는다:
 *
 *   ⓐ 증여일 ≥ 2025-01-01        — 부칙 제20615호 §8 「시행 이후 **증여받는 자산**부터」
 *   ⓑ 양도일 − 증여일 ≤ **1년**   — §97의2① 괄호(주식은 10년이 아니다)
 *   ⓒ 배우자: **사별이 아닐 것**   — ① 괄호 「사망으로 혼인관계가 소멸된 경우는 제외」
 *   ⓓ 직계존비속: **양도 당시 생존** — ① 괄호(2025.1.1. 이후 증여분)
 *
 * ⓒⓓ는 부동산이 쓰는 무의존 leaf `carryover-donor-death.ts`를 **재사용**한다
 * (인자가 사실만 받으므로 자산 종류와 무관하다 — 게이트 기준일은 **증여일**).
 *
 * ── 실행 상태 (Pre-Do 2026-08-11) ─────────────────────────────────────
 * 실패 **6건** — G-2 · G-3 · G-5 · G-5b · G-6 · G-7 / 통과 3건 — G-1 · G-4 · G-6b
 *
 * 🔴 **예측은 「G-2·G-3만 실패」였다.** 취득가액 축만 미구현이라고 봤기 때문이다.
 *    G-5·G-5b·G-6·G-7이 함께 실패한 것을 따라가 보니 **세율 축에도 갭**이 있었다 —
 *    `calcHoldingPeriod`가 관계 요건(ⓒⓓ + 「배우자·직계존비속이 아님」)을 **판정하지 않는다**.
 *    입력 필드(`donorRelation`·`donorDeceased`)조차 없어 **무조건 통산**된다.
 *    ⇒ 계획서 **P-6**으로 등록(과소과세 19,750,000). Phase 2에서 함께 닫는다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { D, carryover, SHARE_COUNT } from "./carryover-97-2-fixtures";

/** 증여 당시 평가액 총액 (승계 실패 시 취득가액) */
const GIFT_VALUATION_TOTAL = 80_000 * SHARE_COUNT; // 800,000,000
/** 증여자 취득가액 총액 (승계 성공 시 취득가액) */
const DONOR_BASIS_TOTAL = 30_000 * SHARE_COUNT; // 300,000,000

describe("G. §97의2① 게이트 — 넘으면 취득가액·세율이 함께 움직인다", () => {
  it("G-1 증여일 2024-12-31 → 부칙 §8 미충족 ⇒ 승계 없음 · 수증일 기산(단기 30%)", () => {
    const r = calculateStockTransferTax(
      carryover({ acquisitionDate: D("2024-12-31"), transferDate: D("2025-06-30") }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.isShortTermHolding).toBe(true);
    expect(r.appliedRate).toBe(0.3);
  });

  it("G-2 증여일 2025-01-01 · 6개월 → 게이트 통과 ⇒ 승계 O · 증여자 기산(누진)", () => {
    const r = calculateStockTransferTax(
      carryover({ acquisitionDate: D("2025-01-01"), transferDate: D("2025-07-01") }),
    );
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL); // ← 미구현이라 실패해야 한다
    expect(r.isShortTermHolding).toBe(false);
    expect(r.appliedRate).not.toBe(0.3);
  });

  it("G-3 경계 — 양도일이 증여 후 **정확히 1년** ⇒ 포함(승계 O)", () => {
    const r = calculateStockTransferTax(
      carryover({ acquisitionDate: D("2025-01-01"), transferDate: D("2026-01-01") }),
    );
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL); // ← 미구현이라 실패해야 한다
    expect(r.isShortTermHolding).toBe(false);
  });

  it("G-4 경계 — 증여 후 **1년 + 1일** ⇒ 미해당(승계 X · 수증일 기산)", () => {
    const r = calculateStockTransferTax(
      carryover({ acquisitionDate: D("2025-01-01"), transferDate: D("2026-01-02") }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    // 수증일 기산이어도 1년을 넘겼으므로 단기 30%는 아니다 — 기산일 자체를 단언한다.
    expect(r.holdingPeriodDays).toBe(366);
  });

  it("G-5 배우자 **사별** — ① 괄호로 미해당(승계 X · 수증일 기산 → 단기 30%)", () => {
    const r = calculateStockTransferTax(
      carryover({ donorRelation: "spouse", donorDeceased: true }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.isShortTermHolding).toBe(true); // ← 미구현이라 실패해야 한다
    expect(r.appliedRate).toBe(0.3);
  });

  it("G-5b 배우자 **이혼**(사별 아님) — 「포함하되」라 여전히 해당(승계 O)", () => {
    const r = calculateStockTransferTax(
      carryover({ donorRelation: "spouse", donorDeceased: false }),
    );
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL); // ← 미구현이라 실패해야 한다
    expect(r.isShortTermHolding).toBe(false);
  });

  it("G-6 직계존속 **양도 당시 사망** — ① 괄호로 미해당(승계 X · 수증일 기산)", () => {
    const r = calculateStockTransferTax(
      carryover({ donorRelation: "lineal", donorDeceased: true }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.isShortTermHolding).toBe(true); // ← 미구현이라 실패해야 한다
  });

  it("G-6b 직계존속 사망 + 증여일이 **2025.1.1. 前** — 괄호 자체가 적용 안 됨", () => {
    // 부칙 §8 때문에 ⓐ에서 이미 걸린다. 세율은 수증일 기산으로 같지만,
    // **배제 사유가 다르다**는 것을 취득가액이 아니라 게이트로 구분할 수는 없으므로
    // 여기서는 「어느 쪽이든 미해당」만 고정한다(과잉 단언 금지).
    const r = calculateStockTransferTax(
      carryover({
        donorRelation: "lineal",
        donorDeceased: true,
        acquisitionDate: D("2024-06-01"),
        transferDate: D("2024-12-01"),
        priorYearEndDate: D("2023-12-31"),
      }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
  });

  it("G-7 관계가 **배우자·직계존비속이 아님** — ① 본문 요건 불충족(승계 X)", () => {
    const r = calculateStockTransferTax(carryover({ donorRelation: "other" }));
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.isShortTermHolding).toBe(true); // ← 미구현이라 실패해야 한다
  });
});
