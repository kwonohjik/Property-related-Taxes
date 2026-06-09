/**
 * STEP 10: 영리법인 §3의2② 면제 (Phase B). inheritance-tax.ts에서 800줄 정책 분리 (2026-06-09).
 *
 * §3의2② + 집행기준 28-0-1 — "§13에 따라 가산된" 영리법인 증여재산만 면제 대상.
 * §13 cutoff 도과 행은 priorGiftAggregated에서 제외되므로 면제 발동도 차단해야 함.
 * isWithin13Cutoff 헬퍼로 aggregatePriorGiftsForInheritance와 단일 진실 유지.
 * perCorporateInputs(부표 5) 매핑 — doneeId로 corporate Heir shareholders 조회.
 */

import { calcCorporateExemption } from "./inheritance-corporate-exemption";
import { isWithin13Cutoff } from "./inheritance-gift-common";
import { INH } from "./legal-codes";
import type {
  PriorGift,
  Heir,
  CalculationStep,
} from "./types/inheritance-gift.types";

export interface CorporateExemptionStepResult {
  corporateExemption: ReturnType<typeof calcCorporateExemption> | undefined;
  corporateGiftTaxBase: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

export function computeCorporateExemptionStep(
  preGifts: PriorGift[],
  deathDate: string,
  heirs: Heir[],
  computedTax: number,
  taxBase: number,
): CorporateExemptionStepResult {
  const breakdown: CalculationStep[] = [];
  const appliedLaws: string[] = [];

  const corporateGifts = (preGifts ?? []).filter(
    (g) => g.beneficiaryType === "corporate" && isWithin13Cutoff(g, deathDate),
  );
  const corporateGiftTaxBase = corporateGifts.reduce(
    (s, g) => s + (g.giftTaxBase ?? g.giftAmount),
    0,
  );
  const corporateGiftComputedTax = corporateGifts.reduce(
    (s, g) => s + (g.corporateGiftComputedTax ?? 0),
    0,
  );

  let corporateExemption:
    | ReturnType<typeof calcCorporateExemption>
    | undefined;
  if (corporateGifts.length > 0 && corporateGiftComputedTax > 0) {
    // PR 2 (2026-05-22) — 영리법인 별 분배 명세 (부표 5) 매핑.
    // doneeId 로 corporate Heir 의 shareholders 조회. doneeId 누락 시 빈 주주 배열.
    const perCorporateInputs = (() => {
      // doneeId 별 corporate 사전증여 합산
      const byCorporateId = new Map<
        string,
        { inheritedAmount: number; taxBase: number; computedTax: number }
      >();
      let unassignedAmount = 0;
      let unassignedBase = 0;
      let unassignedTax = 0;
      for (const g of corporateGifts) {
        const base = g.giftTaxBase ?? g.giftAmount;
        const tax = g.corporateGiftComputedTax ?? 0;
        if (g.doneeId) {
          const prev = byCorporateId.get(g.doneeId) ?? {
            inheritedAmount: 0,
            taxBase: 0,
            computedTax: 0,
          };
          byCorporateId.set(g.doneeId, {
            inheritedAmount: prev.inheritedAmount + g.giftAmount,
            taxBase: prev.taxBase + base,
            computedTax: prev.computedTax + tax,
          });
        } else {
          unassignedAmount += g.giftAmount;
          unassignedBase += base;
          unassignedTax += tax;
        }
      }
      const items: Parameters<typeof calcCorporateExemption>[1] = {
        perCorporateInputs: [],
      };
      for (const [corporateId, agg] of byCorporateId.entries()) {
        const corporateHeir = heirs.find(
          (h) => h.id === corporateId && h.relation === "corporate",
        );
        items.perCorporateInputs!.push({
          corporateId,
          inheritedAmount: agg.inheritedAmount,
          taxBase: agg.taxBase,
          computedTax: agg.computedTax,
          shareholders: corporateHeir?.shareholders ?? [],
        });
      }
      // doneeId 미설정 사전증여 — 부표 5 행 미생성 (Heir 매핑 없으면 표시 불가).
      // 합계는 corporateGiftTaxBase·corporateGiftComputedTax 에 이미 포함되어 기본 면제 발동.
      void unassignedAmount;
      void unassignedBase;
      void unassignedTax;
      return items.perCorporateInputs!.length > 0 ? items : {};
    })();

    corporateExemption = calcCorporateExemption(
      {
        corporateGiftComputedTax,
        corporateGiftTaxBase,
        totalComputedTax: computedTax, // 할증 미포함 — PDF 책 1866
        totalTaxBase: taxBase,
      },
      perCorporateInputs,
    );
    breakdown.push(...corporateExemption.breakdown);
    appliedLaws.push(INH.TAXPAYER);
  }

  return { corporateExemption, corporateGiftTaxBase, breakdown, appliedLaws };
}
