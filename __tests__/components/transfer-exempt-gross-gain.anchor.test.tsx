/**
 * anchor: **비과세 자산의 gross 양도차익**이 결과탭 전 경로에서 같은 값이다
 * (결과탭 코드리뷰 Lane 3 · V1 — #011 #012 #020 #084 #094 #102).
 *
 * ## 축
 *
 * 전액 비과세 자산은 엔진 `transferGain`이 **0**이다(과세 대상이 없으므로). 그래서 화면이
 * 그 필드를 그대로 쓰면 「취득가액 = 양도가액」·「양도차익 0」이 되어 사용자가 입력한 값과
 * 무관한 숫자가 나온다. 엔진은 그 대비로 **`exemptGrossGain` echo**를 싣는다.
 *
 * 정본은 신고서 양식에 이미 있었다:
 *   `const effGainForAcq = result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain;`
 *   (`FilingFormTableHelpers.ts:625`)
 *   `p.isExempt ? (p.exemptGrossGain ?? 0) : p.transferGain` (`FilingFormTableAggregateHelpers.ts:170`)
 *
 * 그런데 **세 곳이 그 규칙을 쓰지 않았다**:
 *   · `DetailedStatementHelpers` — 취득가액 역산·전체 양도차익 (같은 화면 신고서와 정면 충돌)
 *   · `MultiTransferPropertyBreakdown`의 어댑터 — `exemptGrossGain`을 아예 넘기지 않는다
 *   · `MultiTransferTaxSummaryCard` — 합산 「양도차익」이 위 세 행과 검산이 안 맞는다
 *
 * ⇒ 여기서는 **뷰가 아니라 항등식**을 고정한다. 「양도가액 − 취득가액 − 필요경비 = 양도차익」이
 *   성립하면 어느 경로로 계산했든 같은 축에 있다는 뜻이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 🔴 표시부의 양도가액은 **폼**에서 온다(`formData.contractTotalPrice`
 * → `resolveReceiveOnlyDisplay`). 기본 폼을 그대로 넘기면 양도가액이 0이 되어
 * 신고서는 `null`, 명세서는 0을 그리고 **anchor가 결함이 아니라 빈 격자를 잰다**
 * (memory `feedback_anchor_observes_wrong_stage`).
 */
function formDataWithPrice(price: number) {
  return { ...createDefaultTransferFormData(), contractTotalPrice: String(price) };
}
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const TRANSFER = 1_000_000_000;
const ACQ = 400_000_000;
const EXPENSES = 20_000_000;

/** 1세대1주택 12억 이하 — **전액 비과세**. 엔진 `transferGain`은 0이 된다. */
function exemptHouse(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: TRANSFER,
    acquisitionPrice: ACQ,
    expenses: EXPENSES,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 120,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

type Row = { label: string; values: Record<string, number | string | null> };
const rowsOf = (r: ReturnType<typeof calculateTransferTax>) =>
  buildRows(r, "single", formDataWithPrice(TRANSFER)) as never as Row[];
const total = (rows: Row[], label: string) => {
  const row = rows.find((x) => x.label === label);
  expect(row, `행 「${label}」이 없다`).toBeDefined();
  return row!.values.total as number;
};

// ── EG-0 격자 구별력 ─────────────────────────────────────────────────
describe("EG-0 격자 — 전액 비과세라 `transferGain`이 0이다", () => {
  it("엔진이 비과세로 판정하고 gross echo를 싣는다", () => {
    const r = calculateTransferTax(exemptHouse(), rates);
    expect(r.isExempt, "비과세가 아니면 이 anchor는 아무것도 구별하지 못한다").toBe(true);
    expect(r.transferGain, "과세 차익이 0이어야 축이 갈린다").toBe(0);
    expect(r.exemptGrossGain, "gross echo가 없으면 표시부가 복원할 수단이 없다").toBeGreaterThan(0);
    // gross = 양도 − 취득 − 경비
    expect(r.exemptGrossGain).toBe(TRANSFER - ACQ - EXPENSES);
  });
});

// ── EG-1 단건: 신고서 ↔ 상세명세서 (#011 #084 #094) ────────────────────
describe("EG-1 단건 — 같은 화면의 두 카드가 같은 값을 말한다", () => {
  it("신고서 항등식: 양도가액 − 취득가액 − 필요경비 = 전체 양도차익", () => {
    const rows = rowsOf(calculateTransferTax(exemptHouse(), rates));
    expect(
      total(rows, "양도가액") - total(rows, "취득가액") - total(rows, "필요경비"),
    ).toBe(total(rows, "전체 양도차익"));
  });

  it("🔴 상세명세서도 같은 항등식을 만족한다", () => {
    const r = calculateTransferTax(exemptHouse(), rates);
    const items = buildStatementItems(r, formDataWithPrice(TRANSFER), undefined, undefined, undefined);
    const v = (k: string) => {
      const it = items.get(k);
      expect(it, `항목 「${k}」이 없다`).toBeDefined();
      return it!.value as number;
    };
    expect(v("transferPrice") - v("acquisitionPrice") - v("expenses")).toBe(v("transferGain"));
  });

  it("🔴 두 카드의 취득가액·양도차익이 서로 같다", () => {
    const r = calculateTransferTax(exemptHouse(), rates);
    const rows = rowsOf(r);
    const items = buildStatementItems(r, formDataWithPrice(TRANSFER), undefined, undefined, undefined);

    expect(items.get("acquisitionPrice")!.value).toBe(total(rows, "취득가액"));
    expect(items.get("transferGain")!.value).toBe(total(rows, "전체 양도차익"));
  });

  it("🔴 취득가액이 사용자가 입력한 값이다 (양도가액 전액이 아니다)", () => {
    const r = calculateTransferTax(exemptHouse(), rates);
    const items = buildStatementItems(r, formDataWithPrice(TRANSFER), undefined, undefined, undefined);
    expect(items.get("acquisitionPrice")!.value).toBe(ACQ);
    expect(items.get("acquisitionPrice")!.value).not.toBe(TRANSFER);
  });
});

// ── EG-2 다건: 합산 카드 항등식 (#102) ────────────────────────────────
describe("EG-2 다건 — 합산 카드의 세 행과 「양도차익」이 검산된다", () => {
  function aggWithExempt() {
    return calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 0,
        properties: [
          { ...exemptHouse(), propertyId: "p1", propertyLabel: "비과세 주택" } as never,
          {
            ...baseTransferInput({
              propertyType: "land",
              acquisitionDate: D("2015-06-01"),
              transferDate: D("2026-03-01"),
              transferPrice: 800_000_000,
              acquisitionPrice: 300_000_000,
              expenses: 10_000_000,
              isOneHousehold: false,
              householdHousingCount: 0,
              annualBasicDeductionUsed: 0,
              isNonBusinessLand: false,
            } as Partial<TransferTaxInput>),
            propertyId: "p2",
            propertyLabel: "과세 토지",
          } as never,
        ],
      },
      rates,
    );
  }

  function summaryRows(container: Element): Map<string, number> {
    const m = new Map<string, number>();
    for (const div of container.querySelectorAll("div")) {
      const spans = [...div.children].filter((c) => c.tagName === "SPAN");
      if (spans.length !== 2) continue;
      const label = spans[0].textContent?.trim() ?? "";
      const raw = spans[1].textContent?.trim() ?? "";
      if (!label || !/^-?[\d,]+$/.test(raw)) continue;
      m.set(label, Number(raw.replace(/,/g, "")));
    }
    return m;
  }

  it("격자에 비과세 자산이 실제로 섞여 있다", () => {
    const a = aggWithExempt();
    const exempt = a.properties.find((p) => p.isExempt);
    expect(exempt, "비과세 자산이 없으면 구별력이 없다").toBeDefined();
    expect(exempt!.transferGain).toBe(0);
    expect(exempt!.exemptGrossGain ?? 0).toBeGreaterThan(0);
  });

  it("🔴 합산 카드 항등식: 전체 양도가액 − 취득가액 − 필요경비 = 양도차익", () => {
    const a = aggWithExempt();
    const properties = a.properties.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
    })) as unknown as PropertyItem[];
    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={properties} taxYear={2026} />,
    );
    const rows = summaryRows(container.querySelector('[data-print-id="summary"]')!);
    const g = (k: string) => {
      expect(rows.has(k), `행 「${k}」이 없다`).toBe(true);
      return rows.get(k)!;
    };
    // 취득가액·필요경비 행은 음수로 표시된다.
    expect(g("전체 양도가액") + g("전체 취득가액") + g("전체 필요경비")).toBe(g("양도차익"));
  });
});
