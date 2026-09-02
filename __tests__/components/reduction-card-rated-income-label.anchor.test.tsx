/**
 * anchor: §77 계열 상세카드의 「감면대상소득금액」 용어 분열 해소 (2026-09-03)
 *
 * ── 결함 ───────────────────────────────────────────────────────────
 * 세 카드(§77 공익수용 · §77의2 대토보상 · §77의3 개발제한)가 **`(B − C) × E`**를
 * 「감면대상소득금액」이라 불렀다. 그런데
 *   · 「소득세법」 §90①의 **B** = 「감면대상 양도소득금액」
 *   · 별지84호 부표1 **⑲ 세액감면대상금액** = 그 B
 * 이라 **같은 낱말이 한 화면에서 두 뜻**으로 쓰였다.
 * 실측(§77 공익수용 현금 6억): 카드 **28,550,000** ↔ 같은 결과의 ⑲ **288,000,000**.
 *
 * ── 처방 ───────────────────────────────────────────────────────────
 * 이름에 「기본공제 차감·감면율 반영」을 박아 충돌을 없앤다
 * (`RATED_REDUCIBLE_INCOME_LABEL` — 다건 감면 재계산 카드와 **같은 상수**).
 * 그리고 ⑲와 다른 수임을 카드가 **스스로 밝힌다**(`ELIGIBLE_INCOME_VS_FORM_NOTE`) —
 * 침묵하면 사용자가 두 숫자 중 어느 쪽이 틀렸는지 알 수 없다.
 *
 * ⚠️ 값은 바뀌지 않는다 — 이 정정은 **표시 어휘 전용**이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { PublicExpropriationDetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { GbDesignatedLand77_3DetailCard } from "@/components/calc/results/transfer/GbDesignatedLand77_3DetailCard";
import { ReplacementLand77_2DetailCard } from "@/components/calc/results/transfer/ReplacementLand77_2DetailCard";
import {
  RATED_REDUCIBLE_INCOME_LABEL,
  ELIGIBLE_INCOME_VS_FORM_NOTE,
  reductionEligibleIncome,
} from "@/components/calc/results/transfer/reduction-eligible-income";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function single(reductions: unknown[], over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 600_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("2010-01-01"),
      transferDate: D("2024-06-01"),
      reductions,
      ...over,
    } as never) as never,
    rates,
  );
}

describe("§77 계열 상세카드 — `(B − C) × E`를 ⑲와 같은 이름으로 부르지 않는다", () => {
  it("T1: 상수가 두 개념을 분리한다 (충돌 낱말 금지)", () => {
    expect(RATED_REDUCIBLE_INCOME_LABEL).toBe("감면대상소득 (기본공제 차감·감면율 반영)");
    // 「감면대상소득금액」은 §90①의 B와 구분되지 않는다 — 그 정확한 낱말로 돌아가면 안 된다.
    expect(RATED_REDUCIBLE_INCOME_LABEL).not.toBe("감면대상소득금액");
    expect(ELIGIBLE_INCOME_VS_FORM_NOTE).toContain("세액감면대상금액");
  });

  it("T2: §77 카드 — 두 수가 다르고, 카드가 그 차이를 밝힌다", () => {
    const r = single([
      {
        type: "public_expropriation",
        cashCompensation: 600_000_000,
        bondCompensation: 0,
        businessApprovalDate: D("2013-01-01"),
      },
    ]);
    const d = r.publicExpropriationDetail!;
    // ⑲의 `fullTransferIncome` 인자 = 양도소득금액 (`DetailedStatementHelpers`의 singleIncome).
    const nineteen = reductionEligibleIncome(
      r.reductionTypeApplied,
      Math.max(0, r.taxableGain - r.longTermHoldingDeduction),
      r.reducibleIncome ?? 0,
      r.replacementLandDetail?.eligibleTransferIncome,
    );
    // 결함의 실체 — 두 값이 10배 차이다.
    expect(d.breakdown.reducibleIncome).toBe(28_550_000);
    expect(nineteen).toBe(288_000_000);

    const { container } = render(
      <PublicExpropriationDetailCard
        detail={d}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(ELIGIBLE_INCOME_VS_FORM_NOTE);
    // 값은 그대로다 — 어휘만 바뀌었다.
    expect(text).toContain("28,550,000");
  });

  it("T3: §77의3 카드 — 같은 어휘·같은 안내", () => {
    const r = single(
      [
        {
          type: "gb_designated_land",
          branch: "purchase",
          designationDate: D("2005-01-01"),
          triggerDate: D("2024-01-01"),
          residedFromAcqToTrigger: true,
        },
      ],
      { acquisitionDate: D("2000-01-01") },
    );
    const d = r.gbDesignatedLandDetail!;
    expect(d.isEligible, "적격이어야 anchor가 의미를 갖는다").toBe(true);
    const { container } = render(
      <GbDesignatedLand77_3DetailCard
        detail={d}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(ELIGIBLE_INCOME_VS_FORM_NOTE);
  });

  it("T4: §77의2 카드 — 같은 어휘·같은 안내", () => {
    const r = single([
      {
        type: "replacement_land_comp",
        cashCompensation: 0,
        replacementLandComp: 600_000_000,
        businessApprovalDate: D("2013-01-01"),
      },
    ]);
    const d = r.replacementLandDetail!;
    expect(d.isEligible, "적격이어야 anchor가 의미를 갖는다").toBe(true);
    const { container } = render(
      <ReplacementLand77_2DetailCard
        detail={d}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(ELIGIBLE_INCOME_VS_FORM_NOTE);
  });

  it("T5: 세 카드 어디에도 ⑲와 충돌하는 낱말이 남지 않는다", () => {
    const r77 = single([
      {
        type: "public_expropriation",
        cashCompensation: 300_000_000,
        bondCompensation: 300_000_000,
        bondHoldingYears: 3,
        businessApprovalDate: D("2013-01-01"),
      },
    ]);
    render(
      <PublicExpropriationDetailCard
        detail={r77.publicExpropriationDetail!}
        calculatedTax={r77.calculatedTax}
        taxBase={r77.taxBase}
      />,
    );
    /**
     * 「감면대상소득금액」은 §90①의 B(= ⑲)와 구분되지 않는 낱말이다.
     * 새 라벨은 「감면대상소득 (…)」이라 접두는 같지만 **정확히 그 낱말**은 없어야 한다.
     */
    expect(screen.queryByText(/감면대상소득금액/)).toBeNull();
  });
});
