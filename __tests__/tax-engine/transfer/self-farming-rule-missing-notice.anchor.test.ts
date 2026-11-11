/**
 * 자경농지 감면 — 양도일 기준 규칙 행이 없으면 «경고 없는 0원» 대신 세액 불변 고지 anchor
 *
 * 계획서: docs/00-pm/self-farming-rule-row-missing.plan.md (Q-1 a · Q-2 a, 2026-11-11)
 *
 * ## 결함 (구현 전)
 * `tax_rates`의 `transfer:deduction:self_farming` 행은 운영 DB에도 effective 2023-01-01 한 건뿐이다. 그래서 2023-01-01 전 양도는
 * `selfFarmingRules`가 `undefined`라 `calcReductions`의 자경농지 분기가 통째로 건너뛰어져 **감면 0원·경고 0건**이었다
 * (필수 규칙은 행이 없으면 `TaxRateNotFoundError`를 던지는데 이 규칙만 선택 항목).
 *
 * ## 기대 (구현 후) — 세액 불변
 * 감면이 입력됐는데 규칙 행이 없으면 결과 `warnings`에 고지를 싣는다. 세액·감면액은 그대로(0원).
 * 연혁 행 추가·§133 한도 연혁 정정은 이번 범위가 아니다(계획서 Q-1 b, 부칙 적용례 미확정).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { selfFarmingRuleMissingNotice } from "@/lib/tax-engine/transfer-tax-reductions-calc";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const NOTICE = /자경농지 감면 규칙/;

function farmland(date: string, o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 800_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: new Date("1995-01-01"),
    transferDate: new Date(date),
    residencePeriodMonths: 0,
    reductions: [{ type: "self_farming", farmingYears: 12 }],
    ...o,
  });
}

const run = (input: TransferTaxInput) =>
  calculateTransferTax(input, loadFallbackTransferRates(input.transferDate));

describe("SF-1 규칙 행이 없는 양도일 — 고지가 붙고 세액은 그대로다", () => {
  for (const d of ["2010-06-01", "2015-06-01", "2018-06-01", "2022-12-31"]) {
    it(`SF-1 ${d}: 감면 0원 + 고지 1건`, () => {
      const r = run(farmland(d));
      expect(r.reductionAmount).toBe(0);
      const hits = (r.warnings ?? []).filter((w) => NOTICE.test(w));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("확인 필요");
    });
  }

  it("SF-1-5 고지는 조특법 §69와 감면 종합한도를 법령 상수로 인용한다", () => {
    const w = (run(farmland("2021-06-01")).warnings ?? []).find((x) => NOTICE.test(x)) ?? "";
    expect(w).toContain("조특법 §69");
    expect(w).toContain("조특법 §133");
  });

  it("SF-1-6 세액 불변 — 고지만 더한다(산출세액·감면·결정세액이 종전 측정값 그대로)", () => {
    const r = run(farmland("2022-12-31"));
    expect(r.calculatedTax).toBe(169_600_000);
    expect(r.reductionAmount).toBe(0);
  });
});

describe("SF-2 규칙 행이 있는 양도일 — 고지가 없다(양성 대조군)", () => {
  for (const d of ["2023-01-01", "2024-06-01"]) {
    it(`SF-2 ${d}: 감면 100,000,000원 + 고지 없음`, () => {
      const r = run(farmland(d));
      expect(r.reductionAmount).toBe(100_000_000);
      expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
    });
  }
});

describe("SF-3 고지하지 않는 입력", () => {
  it("SF-3-1 감면을 입력하지 않았으면 규칙이 없어도 고지하지 않는다", () => {
    const r = run(farmland("2021-06-01", { reductions: [] }));
    expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
  });

  it("SF-3-2 자경농지가 아닌 감면만 입력했으면 고지하지 않는다", () => {
    const r = run(farmland("2021-06-01", { reductions: [{ type: "unsold_housing" }] as never }));
    expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
  });

  it("SF-3-3 미등기양도는 감면 전부가 배제된다(§129②) — 그 안내만 싣고 이 고지는 싣지 않는다", () => {
    const r = run(farmland("2021-06-01", { isUnregistered: true }));
    expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
    expect((r.warnings ?? []).some((w) => /미등기양도자산/.test(w))).toBe(true);
  });
});

describe("SF-4 순수 판정 함수", () => {
  const sf = [{ type: "self_farming" }];
  it("SF-4-1 규칙 없음 + 자경농지 감면 → 문구", () => {
    expect(selfFarmingRuleMissingNotice({ reductions: sf, selfFarmingRules: undefined })).toMatch(NOTICE);
  });
  it("SF-4-2 규칙 있음 → undefined", () => {
    expect(selfFarmingRuleMissingNotice({ reductions: sf, selfFarmingRules: {} })).toBeUndefined();
  });
  it("SF-4-3 미등기 → undefined", () => {
    expect(selfFarmingRuleMissingNotice({ isUnregistered: true, reductions: sf })).toBeUndefined();
  });
  it("SF-4-4 감면 목록이 비었거나 없으면 undefined", () => {
    expect(selfFarmingRuleMissingNotice({ reductions: [] })).toBeUndefined();
    expect(selfFarmingRuleMissingNotice({})).toBeUndefined();
  });
});

describe("SF-5 다필지 조기반환 경로도 같은 고지를 싣는다", () => {
  const parcels = (date: string) =>
    farmland(date, {
      transferPrice: 800_000_000,
      parcels: [
        {
          id: "p1",
          acquisitionDate: new Date("1995-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 1000,
          transferArea: 1000,
          acquisitionPrice: 100_000_000,
          expenses: 0,
          isUnregistered: false,
        },
        {
          id: "p2",
          acquisitionDate: new Date("1996-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 500,
          transferArea: 500,
          acquisitionPrice: 50_000_000,
          expenses: 0,
          isUnregistered: false,
        },
      ],
    } as Partial<TransferTaxInput>);

  it("SF-5-1 규칙 행이 없는 양도일 — 고지 1건", () => {
    const r = run(parcels("2021-06-01"));
    expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(1);
  });

  it("SF-5-2 규칙 행이 있는 양도일 — 고지 없음(양성 대조군)", () => {
    const r = run(parcels("2024-06-01"));
    expect((r.warnings ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
  });
});
