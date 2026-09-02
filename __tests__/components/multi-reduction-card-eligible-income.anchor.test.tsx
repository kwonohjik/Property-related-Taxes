/**
 * anchor: 다건 감면 재계산 카드의 「합산 감면대상소득」 = 신고서 ⑲ (2026-09-03)
 *
 * ── 결함 ①: 화면이 신고서와 다른 숫자를 같은 이름으로 불렀다 ───────
 * 카드는 `ReductionBreakdownEntry.totalReducibleIncome`을 「합산 감면대상소득」으로 그렸는데,
 * 그 필드는 **유형마다 단위가 갈린다** — §97 계열은 감면율 前 소득이지만
 * §77·§77의2·§77의3은 **감면율이 곱해진** 값이다.
 * 실측(§77 공익수용 현금 6억): 화면 **28,800,000** ↔ 같은 결과의 신고서 ⑲ **288,000,000**.
 * ⑲의 단일 소스(`reduction-eligible-income.ts`)는 §77·§77의3을 「양도소득금액 전액」,
 * §77의2를 「대토분 echo」로 이미 갈라 두고 있었다 — 카드만 그 규약 밖에 있었다.
 *
 * ── 결함 ②: 표시 항등식이 깨져 있었다 ─────────────────────────────
 * 카드의 계약은 「산출세액 × 감면대상소득 / 과세표준 × 감면율 = 원시 감면」인데,
 * §90①의 `− C`(양도소득 기본공제)가 도입된 뒤(#1425·#1430) C가 화면에 없어 검산이 안 됐다.
 * §77 현금 6억: 88,550,000 × 28,800,000 / 285,500,000 = 8,932,539 ≠ 원시 감면 **8,855,000**.
 *
 * ── 처방 ───────────────────────────────────────────────────────────
 * 엔진이 §90①의 세 항을 따로 싣는다 — B(`eligibleIncomeBeforeRate`) ·
 * C(`basicDeductionApplied`) · (B − C) × E(`reducibleIncomeAfterBasicDeduction`).
 * `totalReducibleIncome`은 **자산별 배분 분모**로만 남는다(배분은 감면율 반영 소득에
 * 비례하는 것이 옳으므로 건드리지 않는다 — 세액·배분 무변경).
 *
 * ⚠️ 옛 저장 결과(IndexedDB)에는 신규 필드가 없다 — 카드는 종전 값으로 폴백한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const EXPROPRIATION = {
  type: "public_expropriation",
  cashCompensation: 600_000_000,
  bondCompensation: 0,
  businessApprovalDate: D("2013-01-01"),
};

function aggregate(reductions: unknown[], over: Record<string, unknown> = {}, taxYear = 2024) {
  const asset = {
    ...(baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 600_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("2010-01-01"),
      transferDate: D("2024-06-01"),
      reductions,
      ...over,
    } as never) as object),
    propertyId: "A",
    propertyLabel: "A",
  };
  return calculateTransferTaxAggregate(
    { taxYear, annualBasicDeductionUsed: 0, properties: [asset as never] },
    rates,
  );
}

/** 카드의 2열 그리드를 「라벨 → 값」으로 읽는다. */
function readCard(agg: ReturnType<typeof aggregate>) {
  const properties = agg.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
  const { container } = render(
    <MultiTransferTaxResultView result={agg} properties={properties} taxYear={2024} />,
  );
  const section = container.querySelector('[data-print-id="reduction-recalc"]');
  expect(section, "감면 재계산 섹션이 없다").not.toBeNull();
  const grid = section!.querySelector(".grid-cols-2")!;
  const cells = [...grid.querySelectorAll("span")].map((n) => n.textContent?.trim() ?? "");
  const map = new Map<string, string>();
  for (let i = 0; i + 1 < cells.length; i += 2) map.set(cells[i], cells[i + 1]);
  return {
    map,
    rows: [...section!.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""),
    ),
  };
}

describe("다건 감면 카드 — 「합산 감면대상소득」은 §90①의 B다", () => {
  it("E1: §77 공익수용 — 카드 B가 신고서 ⑲와 같다 (종전 28,800,000)", () => {
    const agg = aggregate([EXPROPRIATION]);
    const entry = agg.reductionBreakdown[0];
    const nineteen = agg.properties.reduce(
      (s, p) =>
        s +
        reductionEligibleIncome(
          p.reductionType,
          p.income,
          p.reducibleIncome ?? 0,
          p.replacementLandDetail?.eligibleTransferIncome,
        ),
      0,
    );
    expect(entry.eligibleIncomeBeforeRate).toBe(288_000_000);
    expect(entry.eligibleIncomeBeforeRate).toBe(nineteen);
    // 배분 분모는 종전 값 그대로여야 한다 — 세액·배분 무변경.
    expect(entry.totalReducibleIncome).toBe(28_800_000);

    const { map } = readCard(agg);
    expect(map.get("합산 감면대상소득 (감면율 前)")).toBe("288,000,000");
  });

  it("E2: 표시 항등식이 정확히 성립한다 — 산출세액 × (기본공제 차감·감면율 반영) / 과세표준", () => {
    const agg = aggregate([EXPROPRIATION]);
    const e = agg.reductionBreakdown[0];
    expect(e.basicDeductionApplied).toBe(2_500_000);
    expect(e.reducibleIncomeAfterBasicDeduction).toBe(28_550_000);
    expect(
      Math.floor(
        (e.aggregateCalculatedTax * e.reducibleIncomeAfterBasicDeduction) / e.aggregateTaxBase,
      ),
    ).toBe(e.rawAggregateReduction);
    // 종전 화면 값으로는 검산이 어긋난다 — 그 어긋남이 이 anchor의 존재 이유다.
    expect(
      Math.floor((e.aggregateCalculatedTax * e.totalReducibleIncome) / e.aggregateTaxBase),
    ).not.toBe(e.rawAggregateReduction);

    const { map } = readCard(agg);
    expect(map.get("양도소득 기본공제")).toBe("−2,500,000");
    expect(map.get("감면대상소득 (기본공제 차감·감면율 반영)")).toBe("28,550,000");
    expect(map.get("재계산 원시 감면")).toBe("8,855,000");
  });

  it("E3: 건별 배분 표의 「감면대상소득」 열도 ⑲ 단일 소스를 쓴다", () => {
    const agg = aggregate([EXPROPRIATION]);
    const { rows } = readCard(agg);
    // [자산, 건별 산출세액, 건별 단독감면, 감면대상소득, 배분 감면]
    const rowA = rows.find((r) => r[0] === "A")!;
    expect(rowA[3]).toBe("288,000,000"); // 종전 28,800,000
  });

  it("E4: §77의2 대토보상 — 현금분은 감면대상이 아니므로 B에서 빠진다", () => {
    const agg = aggregate([
      {
        type: "replacement_land_comp",
        cashCompensation: 200_000_000,
        replacementLandComp: 400_000_000,
        businessApprovalDate: D("2013-01-01"),
      },
    ]);
    const e = agg.reductionBreakdown[0];
    expect(e.eligibleIncomeBeforeRate).toBe(192_000_000); // 양도소득금액 288,000,000의 대토분
    // 현금분(비감면소득)이 기본공제를 먼저 흡수한다(§103②) ⇒ C = 0.
    expect(e.basicDeductionApplied).toBe(0);
    const { map } = readCard(agg);
    expect(map.get("합산 감면대상소득 (감면율 前)")).toBe("192,000,000");
    expect(map.has("양도소득 기본공제"), "C = 0이면 행을 띄우지 않는다").toBe(false);
  });

  it("E5: §97① 본문(50%) — 감면율이 별도 칸이라 B는 종전과 같고 항등식만 보강된다", () => {
    const agg = aggregate(
      [
        {
          type: "rental_97_main",
          rentalStartDate: D("1996-01-01"),
          constructionYear: 1993,
          isNationalHousing: true,
          hasMin5RentalUnits: true,
          rentalPeriodYears: 6,
        },
      ],
      {
        propertyType: "housing",
        householdHousingCount: 2,
        transferPrice: 900_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("1995-03-01"),
        transferDate: D("2005-06-01"),
      },
      2005,
    );
    const e = agg.reductionBreakdown[0];
    expect(e.eligibleIncomeBeforeRate).toBe(e.totalReducibleIncome); // §97은 종전에도 감면율 前
    expect(e.appliedReductionRate).toBe(0.5);
    expect(e.basicDeductionApplied).toBe(2_500_000);
    // (B − C) × 50%
    expect(e.reducibleIncomeAfterBasicDeduction).toBe(
      Math.floor((e.eligibleIncomeBeforeRate - e.basicDeductionApplied) * 0.5),
    );
  });

  it("E6: 옛 저장 결과(신규 필드 없음)에서도 죽지 않고 종전 값으로 폴백한다", () => {
    const agg = aggregate([EXPROPRIATION]);
    const stale = {
      ...agg,
      reductionBreakdown: agg.reductionBreakdown.map((e) => {
        const rest = { ...e } as Partial<typeof e>;
        delete rest.eligibleIncomeBeforeRate;
        delete rest.basicDeductionApplied;
        delete rest.reducibleIncomeAfterBasicDeduction;
        return rest as typeof e;
      }),
    };
    const { map } = readCard(stale);
    expect(map.get("합산 감면대상소득 (감면율 前)")).toBe("28,800,000"); // 종전 필드로 폴백
    expect(map.has("양도소득 기본공제")).toBe(false);
  });
});
