/**
 * Pre-Do anchor — 상속인별 상속세부담액 집계 표 (이미지 8)
 *
 * Plan: docs/01-plan/heir-allocation-summary-table.plan.md
 * Design: docs/02-design/features/heir-allocation-summary-table.engine.design.md
 * UI Design: docs/02-design/features/heir-allocation-summary-table.ui.design.md
 *
 * 정책: [[pre-do-anchor-verification]] — 디자인 환류 기회를 위해 Do 진입 전 anchor 우선 실행.
 * RED 9건(Phase B echo 미구현) + PASS 8건(기존 산식 회귀 보호 — comprehensive-case-pdf.test.ts와 중복 회귀)
 *
 * Anchor 17건 (계획서 §0.8 + Phase A):
 *   AN-1: result.taxableEstateValue                                  [PASS — comprehensive 기존]
 *   AN-2: result.taxBase                                              [PASS]
 *   AN-3: result.computedTax                                          [PASS]
 *   AN-4: result.generationSkipSurcharge                              [PASS? 검증 필요]
 *   AN-5: result.summaryTable.distributableTaxBase           (*1)     [RED — Phase B5]
 *   AN-6: result.summaryTable.surchargeTargetTaxableValue    (*2)     [RED — Phase B5]
 *   AN-7: result.summaryTable.distributableTaxBaseAfterGifts (*3·*5)  [RED — Phase B5]
 *   AN-8: result.summaryTable.corporateExemptionLimitDisplay (⑩b합)   [RED — Phase B5]
 *   AN-9: perHeir[corp].priorGiftCreditLimit                 (⑩b)     [RED — Phase B4·D-6]
 *   AN-10: perHeir[spouse].priorGiftCreditLimit              (⑫b)     [RED — Phase B4]
 *   AN-11: perHeir[child1].priorGiftCreditLimit              (⑫b)     [RED — Phase B4]
 *   AN-12: perHeir[spouse].finalTax                                   [PASS — 1원 toleranc]
 *   AN-13: perHeir[child1].finalTax                                   [PASS]
 *   AN-14: perHeir[child2].finalTax                                   [PASS]
 *   AN-15: perHeir[corp_M].finalTax                                   [PASS? 검증 필요]
 *   AN-16: perHeir[grand].finalTax                                    [PASS]
 *   AN-17: Σ finalTax                                                  [PASS — Σ 검증]
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  buildSummaryTable,
  fmt,
} from "@/lib/calc/heir-allocation-summary";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";

describe("Pre-Do — 상속인별 상속세부담액 집계 표 (이미지 8)", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);
  const perHeir = result.heirAllocationResult?.perHeir ?? {};

  // ────────────────────────────────────────
  // PASS 블록 — 기존 엔진 산식 회귀 보호
  // (comprehensive-case-pdf.test.ts와 의도적 중복 — Phase B 구현 시 회귀 0 검증)
  // ────────────────────────────────────────
  describe("[PASS] 기존 산식 회귀 (Phase B에서 영향 0 검증)", () => {
    it("AN-1: ④ 과세가액 8,775M", () => {
      expect(result.taxableEstateValue).toBe(8_775_000_000);
    });

    it("AN-2: 과세표준 4,175M", () => {
      expect(result.taxBase).toBe(4_175_000_000);
    });

    it("AN-3: 산출세액 1,627.5M", () => {
      expect(result.computedTax).toBe(1_627_500_000);
    });

    it("AN-4: 세대생략가산 30,232,198", () => {
      expect(result.generationSkipSurcharge).toBe(30_232_198);
    });

    it("AN-12: ⑮ 배우자 432,871,250 (1원 toleranc)", () => {
      const v = perHeir[HEIR_ID.spouse]?.finalTax ?? 0;
      expect(Math.abs(v - 432_871_250)).toBeLessThanOrEqual(1);
    });

    it("AN-13: ⑮ 장남 276,593,380 (T10 잔액 흡수 absorber +1원, PDF 276,593,379 보존 trade-off)", () => {
      expect(perHeir[HEIR_ID.son]?.finalTax).toBe(276_593_380);
    });

    it("AN-14: ⑮ 차남 228,833,517", () => {
      expect(perHeir[HEIR_ID.son2]?.finalTax).toBe(228_833_517);
    });

    it("AN-15: ⑮ 영리법인 0", () => {
      expect(perHeir[HEIR_ID.corporate]?.finalTax).toBe(0);
    });

    it("AN-16: ⑮ 손녀 95,462,086", () => {
      expect(perHeir[HEIR_ID.granddaughter]?.finalTax).toBe(95_462_086);
    });

    it("AN-17: Σ ⑮ 1,033,760,232 (1원 toleranc)", () => {
      const sum = Object.values(perHeir).reduce(
        (s, h) => s + (h?.finalTax ?? 0),
        0,
      );
      expect(Math.abs(sum - 1_033_760_232)).toBeLessThanOrEqual(5);
    });
  });

  // ────────────────────────────────────────
  // RED 블록 — Phase B echo 필드 미구현 (디자인 환류 신호)
  // 현 상태에서 모두 FAIL — Phase B 구현 후 PASS 전환
  // ────────────────────────────────────────
  describe("[RED] Phase B echo 필드 (현재 미구현)", () => {
    it("AN-5: *1 distributableTaxBase 5,815M", () => {
      // PDF 이미지 15: 과세가액 8,775M − Σ가산 증여재산(760+1,500+700) = 5,815M
      expect(result.summaryTable?.distributableTaxBase).toBe(5_815_000_000);
    });

    it("AN-6: *2 surchargeTargetTaxableValue 8,075M", () => {
      // PDF 이미지 16: 과세가액 8,775M − 영리법인 사전증여 700M = 8,075M
      expect(result.summaryTable?.surchargeTargetTaxableValue).toBe(
        8_075_000_000,
      );
    });

    it("AN-7: *3·*5 분모 distributableTaxBaseAfterGifts 3,475M", () => {
      // PDF 이미지 16: 과세표준 4,175M − 영리법인 사전증여 과세표준 700M = 3,475M
      expect(result.summaryTable?.distributableTaxBaseAfterGifts).toBe(
        3_475_000_000,
      );
    });

    it("AN-8: ⑩b 합계행 corporateExemptionLimitDisplay 277,943,123", () => {
      // PDF 표8 ⑩b 합계: ⑨ 산출세액 소계(1,657,732,198) × 700M / 4,175M (할증 포함)
      expect(result.summaryTable?.corporateExemptionLimitDisplay).toBe(
        277_943_123,
      );
    });

    it("AN-9: ⑩b 영리법인 priorGiftCreditLimit 272,874,251", () => {
      // PDF 표8 영리법인 행: ⑦ 산출세액(1,627.5M) × 700M / 4,175M (할증 미포함)
      // 현재 엔진 inheritance-corporate-exemption.ts:101 limit과 동일
      // perHeir[corp] 분기(line 323-343)에서 priorGiftCreditLimit echo 누락 — Phase B4·D-6
      expect(perHeir[HEIR_ID.corporate]?.priorGiftCreditLimit).toBe(
        272_874_251,
      );
    });

    it("AN-10: ⑫b 배우자 priorGiftCreditLimit 68,028,777 (1원 toleranc)", () => {
      // PDF 표8: ⑪(468,259,021) × 직접배부(160M) / 과세표준상당액(1,101,319,862)
      // PDF 책 안분 round 비일관 → BigInt round-half-up 사용, 1원 toleranc
      const v = perHeir[HEIR_ID.spouse]?.priorGiftCreditLimit ?? 0;
      expect(Math.abs(v - 68_028_777)).toBeLessThanOrEqual(1);
    });

    it("AN-11: ⑫b 장남 priorGiftCreditLimit 616,510,791 (1원 toleranc)", () => {
      const v = perHeir[HEIR_ID.son]?.priorGiftCreditLimit ?? 0;
      expect(Math.abs(v - 616_510_791)).toBeLessThanOrEqual(1);
    });
  });

  // ────────────────────────────────────────
  // 보조 anchor — categoryBreakdown 4분류 (echo 누락 검증)
  // ────────────────────────────────────────
  describe("[RED] 자산 4분류 echo (Phase B1·B4)", () => {
    it("배우자 categoryBreakdown — 금융 1,140·부동산 1,650·주식 150·기타 360", () => {
      // PDF 표8 명시값(금융 1,100·기타 400)과 +40M·-40M 차이 — fixture의 M사 대여금
      // category="financial"이 PDF 분류상 "기타재산"에 해당. fixture 정합 우선 (현행 anchor).
      expect(perHeir[HEIR_ID.spouse]?.categoryBreakdown).toEqual({
        financial: 1_140_000_000, // 예금 2,100M 중 배우자분 1,100 + 대여금 30 + 채권10
        realEstate: 1_650_000_000,
        stock: 150_000_000,
        other: 360_000_000,
      });
    });

    it("영리법인 categoryBreakdown — 모두 0 (사전증여만)", () => {
      expect(perHeir[HEIR_ID.corporate]?.categoryBreakdown).toEqual({
        financial: 0,
        realEstate: 0,
        stock: 0,
        other: 0,
      });
    });

    it("summaryTable.categoryTotals — 금융 2,140·부동산 3,530·주식 650·기타 360", () => {
      // 동일 — fixture의 financial 마킹 vs PDF 분류 차이 (대여금·채권 40M)
      expect(result.summaryTable?.categoryTotals).toEqual({
        financial: 2_140_000_000,
        realEstate: 3_530_000_000,
        stock: 650_000_000,
        other: 360_000_000,
      });
    });
  });

  // ────────────────────────────────────────
  // UI 가독성 수정 (2026-06-01) — 그룹 헤더 행 / rowNo 단축 / fmt 빈칸
  // Plan: docs/00-pm/inheritance-heir-allocation-summary-table-ui-fix.plan.md
  // ────────────────────────────────────────
  describe("[UI-FIX] 그룹 헤더 행 삽입 (이슈1)", () => {
    const table = buildSummaryTable(result, EXAMPLE_HEIRS);
    const byId = (id: string) => table.rows.find((r) => r.rowId === id);

    it("UF-1: ⑥ 과세표준 그룹 헤더 행 존재 — 값 칸 공란(null)", () => {
      const g = byId("row-6-group");
      expect(g).toBeDefined();
      expect(g?.isGroupHeader).toBe(true);
      expect(g?.rowNo).toBe("⑥");
      expect(g?.label).toBe("과세표준");
      expect(g?.total).toBeNull();
    });

    it("UF-2: ⑩ 상속인(수유자)외 증여세액공제 그룹 헤더 행 존재", () => {
      const g = byId("row-10-group");
      expect(g?.isGroupHeader).toBe(true);
      expect(g?.rowNo).toBe("⑩");
      expect(g?.label).toBe("상속인(수유자)외 증여세액공제");
    });

    it("UF-3: ⑫ 상속인등의 증여세액공제 그룹 헤더 행 존재", () => {
      const g = byId("row-12-group");
      expect(g?.isGroupHeader).toBe(true);
      expect(g?.rowNo).toBe("⑫");
      expect(g?.label).toBe("상속인등의 증여세액공제");
    });

    it("UF-4: 세부행 rowNo 단축 + isGroupChild (㉠/a 등, rowId 불변)", () => {
      expect(byId("row-6a-direct")?.rowNo).toBe("㉠");
      expect(byId("row-6a-direct")?.isGroupChild).toBe(true);
      expect(byId("row-6b-indirect")?.rowNo).toBe("㉡");
      expect(byId("row-6c-total")?.rowNo).toBe("㉢");
      expect(byId("row-10a-corpGiftTax")?.rowNo).toBe("a");
      expect(byId("row-10a-corpGiftTax")?.isGroupChild).toBe(true);
      expect(byId("row-10c-corpCredit")?.label).toBe(
        "공제할 증여세액 = Min(a, b)",
      );
      expect(byId("row-12a-priorGiftTax")?.rowNo).toBe("a");
      expect(byId("row-12c-credit")?.label).toBe(
        "사전증여세액공제 = Min(a, b)",
      );
    });

    it("UF-5: 그룹 헤더 행이 세부행 바로 앞에 위치 (순서)", () => {
      const ids = table.rows.map((r) => r.rowId);
      expect(ids.indexOf("row-6-group")).toBe(
        ids.indexOf("row-6a-direct") - 1,
      );
      expect(ids.indexOf("row-10-group")).toBe(
        ids.indexOf("row-10a-corpGiftTax") - 1,
      );
      expect(ids.indexOf("row-12-group")).toBe(
        ids.indexOf("row-12a-priorGiftTax") - 1,
      );
    });
  });

  describe("[UI-FIX] fmt — 값0만 '0', 미배부는 빈칸 (이슈3)", () => {
    it("UF-6: fmt(null)='', fmt(undefined)='', fmt(0)='0'", () => {
      expect(fmt(null)).toBe("");
      expect(fmt(undefined)).toBe("");
      expect(fmt(0)).toBe("0");
    });

    it("UF-7: fmt(정수)=천단위 콤마, 대시(—) 미사용", () => {
      expect(fmt(150_000_000)).toBe("150,000,000");
      expect(fmt(null)).not.toBe("—");
    });
  });

  // ────────────────────────────────────────
  // 부담비율 echo (*5)
  // ────────────────────────────────────────
  describe("[RED] *5 부담비율 echo (Phase B4)", () => {
    // PDF 표8 *5: 배우자 0.3169 · 장남 0.4772 · 차남 0.1596 · 손녀 0.0461
    // 산식: ⑥㉢ / (taxBase − corporateGiftTaxBase) = ⑥㉢ / 3,475M (4자리 round)
    it("배우자 burdenRatio === 0.3169", () => {
      expect(perHeir[HEIR_ID.spouse]?.burdenRatio).toBeCloseTo(0.3169, 4);
    });

    it("장남 burdenRatio === 0.4772", () => {
      expect(perHeir[HEIR_ID.son]?.burdenRatio).toBeCloseTo(0.4772, 4);
    });

    it("차남 burdenRatio === 0.1596", () => {
      expect(perHeir[HEIR_ID.son2]?.burdenRatio).toBeCloseTo(0.1596, 4);
    });

    it("손녀 burdenRatio === 0.0461", () => {
      expect(perHeir[HEIR_ID.granddaughter]?.burdenRatio).toBeCloseTo(
        0.0461,
        4,
      );
    });
  });
});
