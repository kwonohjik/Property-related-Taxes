/**
 * anchor: 세액감면형 감면의 **농어촌특별세가 결과탭에 표시되는가**.
 *
 * 「농어촌특별세법」 §5①1호는 조특법 감면세액 × 20%를 농특세로 정한다. 엔진은 이것을
 * 세 갈래로 산정한다(`transfer-tax-finalize.ts`):
 *   · `ruralSurtax993`     — 소득금액차감형(§99의3·§99·§98의8)
 *   · `ruralSurtaxHybrid`  — 하이브리드(§98의7·§99의2 등)
 *   · `ruralSurtaxCredit`  — **세액감면형(§77·§77의2·§77의3·§97 계열)**
 * 셋을 합한 `ruralSurtaxTotal`이 `totalTax`에 들어간다.
 *
 * 🔴 그런데 `TransferTaxResult`에는 **총액 필드가 없었다**. 앞의 두 갈래만 detail 객체
 *   (`new993Detail.ruralSurtax` 등)를 통해 우회 노출됐고, 세액감면형은 어디에도 실리지 않았다.
 *   표시부는 `incomeDeductionRuralSurtax(result)`로 **소득금액차감형 detail 11종만** 합산하므로
 *   §77 계열 농특세는 구조적으로 0이 됐다 — 신고서 양식·상세명세서·요약카드·PDF 전부.
 *   그러면서 같은 화면의 「총 납부세액」에는 이미 들어 있어, 내역 합과 총액이 어긋났다.
 *   **사용자가 이 신고서대로 신고하면 농특세를 누락한다.**
 *
 * 집계 경로는 `AggregateTransferResult.ruralSurtax`로 정상 노출돼 있었다 — 즉 **같은 감면이
 * 단건이냐 다건이냐에 따라 다른 값**을 보였다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult, BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** §77 공익수용(현금) — 농특세령 §4①1호 열거 밖(직접 경작 토지 아님)이라 **과세**된다. */
const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 2_000_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 2_000_000_000,
    acquisitionPrice: 400_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

/** 안분 표는 이 anchor의 관심사가 아니다 — 렌더가 죽지 않을 최소 형태만 채운다. */
const APPORTIONMENT = {
  apportioned: [],
  totalStandardAtTransfer: 0,
  residualAbsorbedBy: null,
  legalBasis: "소득세법 시행령 §166⑥",
  warnings: [],
};

const single77 = () => calculateTransferTax(land({ reductions: EXPROPRIATION } as never), rates);

/** 농특세 = 총부담세액 − (결정세액 + 가산세 + 지방소득세) — 엔진 관측용 역산. */
const observedSurtax = (r: {
  totalTax: number;
  determinedTax: number;
  penaltyTax: number;
  localIncomeTax: number;
}) => r.totalTax - (r.determinedTax + r.penaltyTax + r.localIncomeTax);

const ROW_RURAL = (rows: { label: string; values: Record<string, number | string | null> }[]) => {
  const r = rows.find((x) => x.label.startsWith("농어촌특별세"));
  expect(r, "「농어촌특별세」 행이 없다").toBeDefined();
  return r!.values.total as number;
};

// ── R-0 엔진 계약 ────────────────────────────────────────────────────
describe("R-0 엔진 — 세액감면형 농특세를 result에 노출한다", () => {
  it("§77 감면 단건: ruralSurtax가 실재하고 totalTax와 정합한다", () => {
    const r = single77();
    expect(r.reductionAmount, "감면이 실제로 걸려야 구별력이 있다").toBeGreaterThan(0);
    expect(observedSurtax(r), "엔진 totalTax에는 농특세가 이미 들어 있다").toBeGreaterThan(0);
    expect(r.ruralSurtax).toBe(observedSurtax(r));
    expect(r.totalTax).toBe(
      r.determinedTax + r.penaltyTax + r.localIncomeTax + (r.ruralSurtax ?? 0),
    );
  });
});

// ── R-1 단건 신고서 양식 ─────────────────────────────────────────────
describe("R-1 단건 신고서 양식 — 농특세 행", () => {
  it("엔진 농특세를 싣는다 (종전 0)", () => {
    const r = single77();
    const rows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    expect(ROW_RURAL(rows)).toBe(r.ruralSurtax);
    expect(ROW_RURAL(rows)).toBeGreaterThan(0);
  });

  it("서식 행 합 = 엔진 totalTax (누락 0 검산)", () => {
    const r = single77();
    const rows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    const total = (label: string) => rows.find((x) => x.label === label)!.values.total as number;
    expect(total("총결정세액") + total("지방세 결정세액") + ROW_RURAL(rows)).toBe(r.totalTax);
  });
});

// ── R-2 단건 상세명세서 ─────────────────────────────────────────────
describe("R-2 단건 상세명세서 — 신고서와 같은 값", () => {
  it("농특세 항목이 엔진 값과 같다", () => {
    const r = single77();
    const items = buildStatementItems(
      r,
      createDefaultTransferFormData(),
      undefined,
      undefined,
      undefined,
    );
    expect(items.get("ruralSurtax")?.value).toBe(r.ruralSurtax);
  });
});

// ── R-3 일괄(bundled) 「합산 과세 내역」 자기일관성 ────────────────────
function bundled77() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land({ reductions: EXPROPRIATION } as never), propertyId: "primary", propertyLabel: "primary" } as never,
      ],
    },
    rates,
  );
}

describe("R-3 일괄 결과뷰 — 국세 + 지방세 + 농특세 = 총납부세액", () => {
  it("농특세 행이 있고 세 행의 합이 총납부세액이다", () => {
    const agg = bundled77();
    expect(agg.ruralSurtax, "집계 농특세가 실재해야 구별력이 있다").toBeGreaterThan(0);

    const { container } = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={agg}
        formData={createDefaultTransferFormData()}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
    // 「합산 과세 내역」 표만 본다 — 신고서·명세서 섹션의 농특세 행과 섞이면 구별력을 잃는다.
    const table = [...container.querySelectorAll("table")].find((t) =>
      (t.textContent ?? "").includes("총납부세액"),
    );
    expect(table, "「총납부세액」이 있는 합산 과세 내역 표가 없다").toBeDefined();
    const rows = [...table!.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""),
    );
    const cell = (needle: string) => {
      const row = rows.find((r) => r[0]?.includes(needle));
      expect(row, `행 「${needle}」이 없다`).toBeDefined();
      return Number((row![1] ?? "").replace(/[^\d-]/g, ""));
    };
    expect(cell("국세 납부세액") + cell("지방세 납부세액") + cell("농어촌특별세")).toBe(
      cell("총납부세액"),
    );
    expect(cell("농어촌특별세")).toBe(agg.ruralSurtax);
  });
});

// ── R-4 다건 합산 결과 카드 ──────────────────────────────────────────
describe("R-4 다건 합산 결과 — 「납부할 세액」이 농특세를 포함한다", () => {
  it("농특세 행이 있고 최종 합계가 그것을 포함한다", () => {
    const agg = bundled77();
    const properties = agg.properties.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
    })) as unknown as PropertyItem[];
    const { container } = render(
      <MultiTransferTaxResultView result={agg} properties={properties} taxYear={2026} />,
    );
    const summary = container.querySelector('[data-print-id="summary"]');
    expect(summary, "합산 결과 섹션이 없다").not.toBeNull();
    const text = summary!.textContent ?? "";
    expect(text, "합산 결과 카드에 농어촌특별세 행이 없다").toContain("농어촌특별세");
    expect(text).toContain(agg.ruralSurtax.toLocaleString());
    // 「납부할 세액」은 국세·지방세·농특세를 모두 포함해야 한다.
    const expectedDue = agg.settlementTotalDue + agg.ruralSurtax;
    expect(text).toContain(expectedDue.toLocaleString());
    expect(expectedDue).not.toBe(agg.settlementTotalDue); // 구별력 가드
  });
});

// ── R-5 집계 신고서 ↔ 단건 신고서 정합 (같은 감면, 다른 경로) ──────────
describe("R-5 같은 §77 감면이 경로에 따라 다른 값을 보이지 않는다", () => {
  /**
   * 단건과 집계는 §133 합산 재계산 때문에 감면세액 자체가 달라질 수 있다(실측 13,540,050 vs
   * 13,569,497). 따라서 두 경로의 **값이 같아야 한다**고 단언하면 안 된다 — 단언할 것은
   * 「각 경로가 자기 엔진 값을 그대로 싣는가」다.
   */
  it("각 경로가 자기 엔진 농특세를 그대로 싣는다", () => {
    const r = single77();
    const agg = bundled77();
    const singleRows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    expect(ROW_RURAL(singleRows)).toBe(r.ruralSurtax);
    expect(aggregateToFilingResult(agg).ruralSurtax).toBe(agg.ruralSurtax);
    expect(r.ruralSurtax).toBeGreaterThan(0);
    expect(agg.ruralSurtax).toBeGreaterThan(0);
  });
});
