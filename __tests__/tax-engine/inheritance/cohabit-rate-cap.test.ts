/**
 * 동거주택 상속공제(§23의2) 시기구분 정밀화 — anchor
 *
 * 법령: 상증법 §23의2① + 개정연혁 (PDF 상속증여세 2026 p.351 "Min(㉮율, ㉯한도)")
 *   ~2008.12.31:          제도 부재 (0)  — 2009.1.1. 최초 상속분부터 적용
 *   2009.1.1.~2015.12.31:  40% / 5억
 *   2016.1.1.~2019.12.31:  80% / 5억
 *   2020.1.1.~:           100% / 6억
 *
 * 설계: docs/02-design/features/inheritance-cohabit-deduction.engine.design.md
 * 계획: docs/00-pm/inheritance-cohabit-deduction-gap-plan.md (Phase 1 = G1)
 *
 * ★ Pre-Do anchor (2026-06-07): 현행 엔진은 율 2단계(80%/100%) + 한도 6억 고정 →
 *   CH-RATE-1·2·4·6·8 은 "실패 확보(RED)"가 목적. ([[feedback_pre_anchor_verification]])
 *   CH-RATE-3·5·7 및 회귀 R1·R2 는 현행과 일치(GREEN 유지 확인용).
 */
import { describe, it, expect } from "vitest";
import {
  calcCohabitationDeduction,
  calcInheritanceDeductions,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("CH-RATE 동거주택공제 시기구분 (§23의2 개정연혁)", () => {
  // ── 일반 경로: calcCohabitationDeduction(stdPrice, securedDebt, deathDate) ──
  describe("일반 경로 — calcCohabitationDeduction", () => {
    it("CH-RATE-1 2014 상속, 10억 → 40% = 4억 (한도 5억 내) ★현행 RED", () => {
      expect(calcCohabitationDeduction(1_000_000_000, 0, "2014-06-01").deduction).toBe(
        400_000_000,
      );
    });

    it("CH-RATE-2 2014 상속, 20억 → 40%=8억 → 한도 5억 ★현행 RED", () => {
      expect(calcCohabitationDeduction(2_000_000_000, 0, "2014-06-01").deduction).toBe(
        500_000_000,
      );
    });

    it("CH-RATE-3 2018 상속, 5억 → 80% = 4억 (한도 5억 내) — 현행 일치 GREEN", () => {
      expect(calcCohabitationDeduction(500_000_000, 0, "2018-06-01").deduction).toBe(
        400_000_000,
      );
    });

    it("CH-RATE-4 2018 상속, 8억 → 80%=6.4억 → 한도 5억 ★현행 RED(6억 반환)", () => {
      expect(calcCohabitationDeduction(800_000_000, 0, "2018-06-01").deduction).toBe(
        500_000_000,
      );
    });

    it("CH-RATE-5 2021 상속, 8억 → 100% → 한도 6억 — 현행 일치 GREEN(회귀)", () => {
      expect(calcCohabitationDeduction(800_000_000, 0, "2021-06-01").deduction).toBe(
        600_000_000,
      );
    });

    it("CH-RATE-6 2008-12-31 상속, 5억 → 제도 부재 = 0 ★현행 RED", () => {
      expect(calcCohabitationDeduction(500_000_000, 0, "2008-12-31").deduction).toBe(0);
    });
  });

  // ── 담보채무 차감 2017.1.1. 부칙 (법14388, KoreanLaw time_travel 검증) ──
  describe("담보채무 차감 시기 게이트 (§23의2① 2017.1.1. 부칙)", () => {
    it("CH-RATE-7a 2016 상속, 5억+저당1억 → 차감 비적용 → 5억×80%=4억 ★현행 RED(3.2억)", () => {
      // 2016.1.1.~2016.12.31. 상속분: 담보채무 차감 개정(2017.1.1.) 적용 전 → 차감 안 함
      expect(calcCohabitationDeduction(500_000_000, 100_000_000, "2016-06-01").deduction).toBe(
        400_000_000,
      );
    });

    it("CH-RATE-7b 2017 상속, 5억+저당1억 → 차감 적용 → (5−1)억×80%=3.2억 (회귀)", () => {
      expect(calcCohabitationDeduction(500_000_000, 100_000_000, "2017-06-01").deduction).toBe(
        320_000_000,
      );
    });

    it("CH-RATE-7경계 2017-01-01 정확 → 차감 적용 → 3.2억", () => {
      expect(calcCohabitationDeduction(500_000_000, 100_000_000, "2017-01-01").deduction).toBe(
        320_000_000,
      );
    });

    it("CH-RATE-7경계b 2016-12-31 정확 → 차감 비적용 → 4억", () => {
      expect(calcCohabitationDeduction(500_000_000, 100_000_000, "2016-12-31").deduction).toBe(
        400_000_000,
      );
    });
  });

  // ── Phase E directAmount 경로: calcInheritanceDeductions(input).cohabitationDeduction ──
  describe("Phase E directAmount 경로 — calcInheritanceDeductions", () => {
    const child: Heir = { id: "c1", relation: "child", name: "자녀", isCohabitant: true };
    const HUGE = 10_000_000_000; // §24 종합한도 회피용 큰 과세가액

    it("CH-RATE-8 directAmount 2018, 7억 입력 → 한도 5억 → 5억 ★현행 RED(6억)", () => {
      const r = calcInheritanceDeductions(
        { heirs: [child], deathDate: "2018-06-01", cohabitDirectAmount: 700_000_000 },
        HUGE,
        0,
      );
      expect(r.cohabitationDeduction).toBe(500_000_000);
      expect(r.cohabitDeductionDetail?.cap).toBe(500_000_000);
    });

    it("CH-RATE-8b directAmount 2024, 7억 입력 → 한도 6억 → 6억 (회귀 GREEN)", () => {
      const r = calcInheritanceDeductions(
        { heirs: [child], deathDate: "2024-06-10", cohabitDirectAmount: 700_000_000 },
        HUGE,
        0,
      );
      expect(r.cohabitationDeduction).toBe(600_000_000);
    });
  });

  // ── 회귀 보존 (R1·R2 — 현행 GREEN 유지 확인) ──
  describe("회귀 보존", () => {
    it("R1-D18 deathDate 미지정, 5억 → 100%/6억 → 5억", () => {
      expect(calcCohabitationDeduction(500_000_000).deduction).toBe(500_000_000);
    });
    it("R1-D19 deathDate 미지정, 8억 → 100% → 한도 6억", () => {
      expect(calcCohabitationDeduction(800_000_000).deduction).toBe(600_000_000);
    });
    it("R2-CI-2b 2019-12-31, 6억 → 80%=4.8억 (한도 5억 내, 불변)", () => {
      expect(calcCohabitationDeduction(600_000_000, 0, "2019-12-31").deduction).toBe(
        480_000_000,
      );
    });
    it("R2-CI-2c 2024, (6억−1억)×100% = 5억", () => {
      expect(
        calcCohabitationDeduction(600_000_000, 100_000_000, "2024-06-10").deduction,
      ).toBe(500_000_000);
    });
  });
});
