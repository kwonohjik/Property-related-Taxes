/**
 * 상속공제 4,600m 정합 — 6개 수정 anchor (CI-1~9)
 *
 * Plan: docs/00-pm/inheritance-spouse-deduction-consultation-split.plan.md
 * Design: docs/02-design/features/inheritance-spouse-deduction-fix.engine.design.md
 *
 * 버그① 일괄max ② 동거100%+historical+담보 ③ 배우자증여과세표준 / 자동④⑤⑥ / 산식 I-1·I-2
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcCohabitationDeduction } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { autoComputeGiftTaxBase } from "@/lib/calc/prior-gift-auto-tax";
import { suggestSpouseActualAmount } from "@/lib/calc/inheritance-deduction-suggest";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";
import type {
  EstateItem,
  Heir,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

describe("상속공제 4,600m 정합 — 6개 수정 anchor", () => {
  // ── 버그② 동거주택공제 §23의2 (KoreanLaw mst 276123) ──
  describe("CI-2 동거주택공제", () => {
    it("CI-2 100% (deathDate 2024)", () => {
      expect(calcCohabitationDeduction(600_000_000, 0, "2024-06-10").deduction).toBe(600_000_000);
    });
    it("CI-2b 80% (deathDate 2019, 개정 전)", () => {
      expect(calcCohabitationDeduction(600_000_000, 0, "2019-12-31").deduction).toBe(480_000_000);
    });
    it("CI-2c 담보채무 차감 (600−100)×100% = 500", () => {
      expect(calcCohabitationDeduction(600_000_000, 100_000_000, "2024-06-10").deduction).toBe(500_000_000);
    });
    it("CI-2 한도 6억 (800×100% capped)", () => {
      expect(calcCohabitationDeduction(800_000_000, 0, "2024-06-10").deduction).toBe(600_000_000);
    });
    it("CI-2 deathDate 미입력 → 현행 100%", () => {
      expect(calcCohabitationDeduction(600_000_000, 0, undefined).deduction).toBe(600_000_000);
    });
  });

  // ── 버그③ 배우자 사전증여 과세표준 ──
  describe("CI-3 autoComputeGiftTaxBase", () => {
    it("CI-3 배우자 760m → 160m (§53 6억)", () => {
      expect(autoComputeGiftTaxBase(760_000_000, "spouse")).toBe(160_000_000);
    });
    it("CI-3 관계없음(영리법인) → 가액 700m", () => {
      expect(autoComputeGiftTaxBase(700_000_000, undefined)).toBe(700_000_000);
    });
    it("CI-3 직계비속 500m → 450m (§53 5천만)", () => {
      expect(autoComputeGiftTaxBase(500_000_000, "lineal_descendant")).toBe(450_000_000);
    });
  });

  // ── 자동⑥ suggestSpouseActualAmount 채무차감 §19-17-1 ──
  describe("CI-6 suggestSpouseActualAmount 채무차감", () => {
    const spouse: Heir = { id: "h-spouse", relation: "spouse", name: "배우자" };
    const child: Heir = { id: "h-child", relation: "child", name: "자녀" };
    const asset = (amount: number): EstateItem =>
      ({
        id: `a-${amount}`,
        category: "real_estate_land",
        name: "토지",
        heirAllocations: [{ heirId: "h-spouse", amount }],
      }) as EstateItem;
    const debt = (amount: number): DebtItem =>
      ({
        id: `d-${amount}`,
        category: "financial",
        name: "채무",
        amount,
        heirAllocations: [{ heirId: "h-spouse", amount }],
      }) as DebtItem;
    it("CI-6 자산 3,300m − 채무 500m = 2,800m", () => {
      const r = suggestSpouseActualAmount([asset(3_300_000_000)], [spouse, child], [debt(500_000_000)]);
      expect(r.value).toBe(2_800_000_000);
    });
    it("CI-6 채무 없으면 자산만 3,300m", () => {
      const r = suggestSpouseActualAmount([asset(3_300_000_000)], [spouse, child], []);
      expect(r.value).toBe(3_300_000_000);
    });
  });

  // ── CI-8 회귀 + 버그③ 엔진 ──
  describe("CI-8 회귀 EXAMPLE → 4,600m", () => {
    it("CI-8 EXAMPLE 명시 입력 → 4,600m (불변)", () => {
      expect(calcInheritanceTax(EXAMPLE_INPUT).totalDeduction).toBe(4_600_000_000);
    });
    it("CI-8b 배우자 사전증여 giftTaxBase undefined + doneeRelation spouse → 4,600m (엔진 resolveGiftTaxBase 자동 160m)", () => {
      // 사용자 케이스(이미지34): 수증자 지정 → doneeRelation="spouse" 설정, giftTaxBase 미입력.
      // 엔진 resolveGiftTaxBase가 760m − 600m(§53) = 160m 자동 도출 → 법정상속분 3,092m → 배우자공제 2,800m.
      const gifts = (EXAMPLE_INPUT.preGiftsWithin10Years ?? []).map((g) =>
        g.beneficiaryType === "heir" && g.giftAmount < 1_000_000_000
          ? { ...g, giftTaxBase: undefined, doneeRelation: "spouse" as const }
          : g,
      );
      expect(
        calcInheritanceTax({ ...EXAMPLE_INPUT, preGiftsWithin10Years: gifts }).totalDeduction,
      ).toBe(4_600_000_000);
    });
  });
});
