/**
 * besshi-buppyo-2-data anchor — 별지 제9호서식 부표 2 데이터 어댑터
 *
 * 종합사례 fixture(comprehensive-case-pdf)로 calcInheritanceTax 실행 → 실제 결과로 검증.
 * Plan §5 (AN-1·AN-2·AN-3) · Design 케이스 인벤토리 C-1~C-5.
 * Pre-Do anchor: 자기일관(AN-1) · 나 필터(AN-2) · 코드 단일출처(AN-3).
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { computeLegalShares } from "@/lib/tax-engine/inheritance-legal-share";
import { buildBuppyo2Data } from "@/lib/calc/besshi-buppyo-2-data";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
  EXAMPLE_ESTATE_ITEMS,
  EXAMPLE_PRIOR_GIFTS,
  HEIR_ID,
} from "../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

const OFFICIAL_METHOD_CODES = ["01", "02", "03", "04", "05", "06", "07", "08"];

describe("부표 2 데이터 어댑터 (besshi-buppyo-2)", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);
  const data = buildBuppyo2Data(
    result,
    EXAMPLE_HEIRS,
    EXAMPLE_ESTATE_ITEMS,
    EXAMPLE_PRIOR_GIFTS,
  );
  const byId = (id: string) => data.find((d) => d.heirId === id)!;
  const perHeir = result.heirAllocationResult!.perHeir;

  // ── N장 ── (상속인만 — 비상속인 수유자·영리법인 제외)
  it("B2-1: N장 = 상속인 수 (3장: 배우자·자2). 비상속인 손녀(legatee)·법인(corporate) 제외", () => {
    expect(data.length).toBe(3);
    expect(data.length).toBeLessThan(EXAMPLE_HEIRS.length); // 5인 중 2인 비상속인
  });
  it("NH-1: 비상속인(수유자·영리법인) 시트 미생성", () => {
    expect(data.find((d) => d.heirId === HEIR_ID.granddaughter)).toBeUndefined();
    expect(data.find((d) => d.heirId === HEIR_ID.corporate)).toBeUndefined();
  });
  it("NH-2: 상속인 시트 보존 (배우자·son·son2)", () => {
    expect(data.find((d) => d.heirId === HEIR_ID.spouse)).toBeDefined();
    expect(data.find((d) => d.heirId === HEIR_ID.son)).toBeDefined();
    expect(data.find((d) => d.heirId === HEIR_ID.son2)).toBeDefined();
  });
  it("NH-3: ⑦ 실제상속지분율 분모 = 상속인만 (Σ⑦=1)", () => {
    const sum = data.reduce((s, d) => s + d.sectionA.actualShareRatio, 0);
    expect(sum).toBeCloseTo(1, 6);
    // 배우자 = grossInheritance ÷ Σ상속인 gross (손녀·법인 제외 → 분모↓)
    const spouseGross = perHeir[HEIR_ID.spouse]?.grossInheritance ?? 0;
    const heirGrossSum = data.reduce(
      (s, d) => s + (perHeir[d.heirId]?.grossInheritance ?? 0),
      0,
    );
    expect(byId(HEIR_ID.spouse).sectionA.actualShareRatio).toBeCloseTo(
      spouseGross / heirGrossSum,
      6,
    );
  });

  // ── AN-1 자기일관 ──
  it("B2-2: 계 grossEstateValue === perHeir.grossInheritance (본래상속 자기일관)", () => {
    for (const d of data) {
      const gross = perHeir[d.heirId]?.grossInheritance ?? 0;
      expect(d.sectionTotal.grossEstateValue).toBe(gross);
    }
  });
  it("B2-3: ㉘ 합계 = ⑰+⑱+㉕ = ⑧ 실제상속재산가액 (채무 미차감)", () => {
    for (const d of data) {
      const expected =
        d.sectionTotal.grossEstateValue +
        d.sectionTotal.presumedAmount +
        d.sectionTotal.priorGift13;
      expect(d.sectionTotal.total).toBe(expected);
      expect(d.sectionTotal.total).toBe(d.sectionA.actualShareAmount);
    }
  });
  it("B2-4: 실제상속지분율 = grossInheritance ÷ Σgross (합 ≈ 1)", () => {
    const sum = data.reduce((s, d) => s + d.sectionA.actualShareRatio, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  // ── AN-1 R-1: 법정상속재산가액 = floor(과세가액 × 법정지분) ──
  it("B2-5: 법정상속분 도출 — 배우자 legalShareLabel·금액 = computeLegalShares 정합", () => {
    const legal = computeLegalShares(EXAMPLE_HEIRS);
    const spouseShare = legal.shares.find((s) => s.heirId === HEIR_ID.spouse)!;
    const sp = byId(HEIR_ID.spouse).sectionA;
    expect(sp.legalShareLabel).toBe(
      `${spouseShare.numerator}/${legal.denominator}`,
    );
    // B1: base = 엔진 §19 echo(legalShareTable.numerator), taxableEstateValue 아님
    const base =
      result.deductionDetail?.spouseDeductionDetail?.legalShareTable?.numerator ??
      0;
    expect(base).toBe(7_590_000_000);
    expect(sp.legalShareAmount).toBe(
      Math.floor((base * spouseShare.numerator) / legal.denominator),
    );
    expect(sp.legalShareAmount).toBe(3_252_857_142);
  });
  it("B2-6: 생성된 시트는 모두 상속인 (수유자·영리법인 relation 부재)", () => {
    const relById = new Map(EXAMPLE_HEIRS.map((h) => [h.id, h.relation]));
    for (const d of data) {
      const rel = relById.get(d.heirId);
      expect(rel).not.toBe("legatee");
      expect(rel).not.toBe("corporate");
    }
  });

  // ── AN-2 나 섹션 필터 ──
  it("B2-7: 본래상속 행 = heirAllocations heirId 매칭분만 (배우자)", () => {
    // 본래상속만 = A11/A12 exact (A13 추정·A2x 사전증여 제외 — enum substring 금지)
    const spouseEstateRows = byId(HEIR_ID.spouse).itemRows.filter((r) =>
      ["A11", "A12"].includes(r.kindCode),
    );
    const expected = EXAMPLE_ESTATE_ITEMS.filter((it) =>
      (it.heirAllocations ?? []).some((a) => a.heirId === HEIR_ID.spouse),
    ).length;
    expect(spouseEstateRows.length).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
  it("B2-8: 본래상속 재산구분코드 — 배우자=A11", () => {
    const rows = byId(HEIR_ID.spouse).itemRows.filter((r) =>
      ["A11", "A12"].includes(r.kindCode),
    );
    for (const r of rows) expect(r.kindCode).toBe("A11");
  });

  // ── AN-2 나 사전증여 행 (doneeId 매칭) ──
  it("B2-9: 나 사전증여 행 — 상속인 donee = A21 (배우자)", () => {
    const spouseGiftRows = byId(HEIR_ID.spouse).itemRows.filter(
      (r) => r.kindCode === "A21",
    );
    expect(spouseGiftRows.length).toBeGreaterThan(0); // 배우자 사전증여 존재
  });

  // ── P2-1 나↔계 가산증여 동일 소스 자기일관 ──
  it("B2-10: 계 가산증여 §13 = Σ(나 사전증여 행) = Σ priorGifts(donee) (단일 소스)", () => {
    for (const d of data) {
      const giftRowSum = d.itemRows
        .filter((r) => ["A21", "A22", "A23", "A24"].includes(r.kindCode))
        .reduce((s, r) => s + r.valuatedAmount, 0);
      const fixtureSum = EXAMPLE_PRIOR_GIFTS.filter(
        (g) => g.doneeId === d.heirId,
      ).reduce((s, g) => s + g.giftAmount, 0);
      expect(d.sectionTotal.priorGift13).toBe(giftRowSum);
      expect(d.sectionTotal.priorGift13).toBe(fixtureSum);
      expect(d.sectionTotal.priorGift30_5).toBe(0); // PriorGift 경로 없음
      expect(d.sectionTotal.priorGift30_6).toBe(0);
    }
  });

  // ── AN-3 코드 단일출처 ──
  it("B2-11: 평가기준코드 — 전부 공식 8종 {01..08}", () => {
    for (const d of data) {
      for (const r of d.itemRows) {
        expect(OFFICIAL_METHOD_CODES).toContain(r.valuationMethodCode);
      }
    }
  });
  it("B2-12: 현금 자산 평가기준코드 = 06 (현금 등 가액)", () => {
    // estate_cash → 배우자 배분. 배우자 나 행 중 현금(typeCode 01) → method 06
    const cashRow = byId(HEIR_ID.spouse).itemRows.find(
      (r) => r.typeCode === "01",
    );
    expect(cashRow).toBeDefined();
    expect(cashRow!.valuationMethodCode).toBe("06");
  });

  // ── 비과세·과세불산입 세부 3종 공란 (D-4) ──
  it("B2-13: 비과세·과세가액불산입 세부 = null(공란)", () => {
    for (const d of data) {
      expect(d.sectionTotal.nonTaxableTotal).toBeNull();
      expect(d.sectionTotal.exclusionTotal).toBeNull();
    }
  });

  // ── 내부 id 비노출 ──
  it("B2-14: 나 행 locationOrName 에 내부 id(estate_·heir_) 미노출", () => {
    for (const d of data) {
      for (const r of d.itemRows) {
        expect(r.locationOrName).not.toMatch(/estate_|heir_|legatee_|corporate_/);
      }
    }
  });

  // ── 2쪽 「상속인별 상속재산명세」 계 행 (itemRowsTotal = Σ ⑮평가가액) ──
  it("B2-15: itemRowsTotal = Σ itemRows.valuatedAmount (2쪽 계 행 ⑮합계)", () => {
    for (const d of data) {
      const sum = d.itemRows.reduce((s, r) => s + r.valuatedAmount, 0);
      expect(d.itemRowsTotal).toBe(sum);
    }
  });

  // ── 4버그 수정 anchor (inheritance-buppyo-2-4bug-amount-fix) ──
  it("A-B1: ⑥ 법정상속재산가액 — 배우자 = base × 3/7 = 3,252,857,142", () => {
    expect(byId(HEIR_ID.spouse).sectionA.legalShareAmount).toBe(3_252_857_142);
  });
  it("A-B1c: ⑥ base는 heir-독립 — 자녀(son) = floor(base × 2/7)", () => {
    const legal = computeLegalShares(EXAMPLE_HEIRS);
    const base =
      result.deductionDetail?.spouseDeductionDetail?.legalShareTable?.numerator ??
      0;
    const sonShare = legal.shares.find((s) => s.heirId === HEIR_ID.son)!;
    expect(byId(HEIR_ID.son).sectionA.legalShareAmount).toBe(
      Math.floor((base * sonShare.numerator) / legal.denominator),
    );
  });
  it("A-B2: ⑧ 실제상속재산가액 — 배우자 = 4,210,000,000 (본래3,300+추정150+증여760)", () => {
    expect(byId(HEIR_ID.spouse).sectionA.actualShareAmount).toBe(4_210_000_000);
  });
  it("A-B3: 명세 계(itemRowsTotal) — 배우자 = 4,210,000,000", () => {
    expect(byId(HEIR_ID.spouse).itemRowsTotal).toBe(4_210_000_000);
  });
  it("A-C1: ㉘ 합계 — 배우자 = 4,210,000,000 (⑰3,300+⑱150+㉕760, 채무 미차감)", () => {
    expect(byId(HEIR_ID.spouse).sectionTotal.total).toBe(4_210_000_000);
  });
  it("A-B4: 추정상속재산 행 — 배우자 A13 150,000,000 단일 행", () => {
    const presumedRows = byId(HEIR_ID.spouse).itemRows.filter(
      (r) => r.kindCode === "A13",
    );
    expect(presumedRows.length).toBe(1);
    expect(presumedRows[0].valuatedAmount).toBe(150_000_000);
    expect(presumedRows[0].locationOrName).toBe("추정상속재산");
  });
  it("A-INV: ⑧ = 명세합계 불변식 (완전입력 — 전 상속인)", () => {
    for (const d of data) {
      expect(d.sectionA.actualShareAmount).toBe(d.itemRowsTotal);
    }
  });
  it("A-CORP: legatee·corporate는 부표2 미생성 (상속인 아님)", () => {
    expect(data.some((d) => d.heirId === HEIR_ID.granddaughter)).toBe(false);
    expect(data.some((d) => d.heirId === HEIR_ID.corporate)).toBe(false);
  });
});
