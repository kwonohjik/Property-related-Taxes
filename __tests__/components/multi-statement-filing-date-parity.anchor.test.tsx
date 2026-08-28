/**
 * anchor: 다건 결과탭의 **신고서 양식과 상세명세서가 같은 자산을 같게 표시한다**
 * (결과탭 코드리뷰 Lane 5 · S1 — #054 · #093).
 *
 * ## 리뷰의 시나리오는 재측정으로 반쯤 뒤집혔다
 *
 * 리뷰는 「명세서의 **취득일자·보유기간·양도일자** 자산별 펼침이 1번 건 값이다」라고 적었다.
 * 그 항목들이 1번 건 값인 것은 맞지만 **화면에는 나오지 않는다** —
 * `DetailedStatementConfig.ts`의 `STATEMENT_GROUPS` 첫 줄이 그것을 명시한다:
 *   「일자·기간 그룹은 신고서 양식 표 헤더에 이미 표시되므로 명세서에서는 생략(사용자 요청 2026-05-12)」
 * 어느 그룹의 `itemKeys`에도 없으므로 렌더러가 통째로 건너뛴다.
 *
 * ## 그러나 뿌리는 **렌더되는 곳**에 살아 있었다
 *
 * 같은 뿌리(자산별 날짜를 `primary` 하나로 조회)가 **장기보유특별공제 보유/거주 분할**에
 * 있었고, 그 행은 실제로 렌더된다. 실측(2019년 취득 고가주택 + 2005년 취득 토지):
 *
 * | 카드 | 토지 보유분 | 토지 거주분 |
 * |---|---|---|
 * | 상세명세서 | 69,230,770 | 80,769,230 |
 * | 신고서 양식 | **88,235,295** | **61,764,705** |
 *
 * 차이 19,004,525. 명세서가 토지의 보유기간을 **아파트의 취득일**로 계산했다.
 *
 * `getAcqDateForCard`는 «일반건물 자산 **안의** 파트 카드»를 가르는 함수이지 property 조회
 * 함수가 아니다 — 일반건물이 아니면 pid를 무시하고 그 자산의 취득일을 그대로 돌려준다.
 * 기존 테스트가 못 본 이유도 그것이다: 「다건 모드」 픽스처가 일반건물 일괄(= 같은 물건의
 * 토지·건물 파트)이라 `general_building` 분기를 타서 통과했다.
 *
 * ⇒ 이 anchor는 **별개 양도건 2건**(취득일·양도일이 모두 다름)으로 잰다.
 *
 * 법령: 소득세법 §95②·별표 표1·표2(보유·거주 분할) · §98(취득·양도시기)
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferResult,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 별개 양도건 2건 — 취득일도 양도일도 서로 다르다. */
const GRID = [
  { id: "p1", label: "아파트A", acq: "2019-04-15", transfer: "2026-02-01" },
  { id: "p2", label: "토지B", acq: "2005-08-20", transfer: "2026-09-01" },
] as const;

function formOf(acq: string, transferDate: string): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate,
    contractTotalPrice: "800000000",
    assets: [{ ...makeDefaultAsset(1), acquisitionDate: acq }],
  };
}

function agg(): AggregateTransferResult {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: GRID.map((g, i) => ({
        ...baseTransferInput({
          propertyType: i === 0 ? "housing" : "land",
          acquisitionDate: D(g.acq),
          transferDate: D(g.transfer),
          transferPrice: 800_000_000,
          acquisitionPrice: 400_000_000,
          expenses: 0,
          isOneHousehold: false,
          householdHousingCount: i === 0 ? 1 : 0,
          annualBasicDeductionUsed: 0,
          isNonBusinessLand: false,
        } as Partial<TransferTaxInput>),
        propertyId: g.id,
        propertyLabel: g.label,
      })) as never,
    } as never,
    rates,
  );
}

const PROPERTIES = GRID.map((g) => ({ propertyId: g.id, form: formOf(g.acq, g.transfer) }));

/** 두 카드가 **같은 leaf**로 조립한 같은 메타를 받는다 — 그것이 이 수정의 본체다. */
function meta(a: AggregateTransferResult) {
  return buildAggregateMeta(a, PROPERTIES as never);
}

function filingCell(a: AggregateTransferResult, label: string, col: string): string {
  const rows = buildAggregateRows(
    aggregateToFilingResult(a),
    meta(a) as never,
    PROPERTIES[0].form,
  ) as never as { label: string; values: Record<string, unknown> }[];
  const row = rows.find((r) => r.label === label);
  expect(row, `신고서에 「${label}」 행이 없다`).toBeDefined();
  return String(row!.values[col] ?? "");
}

function statementPerAsset(a: AggregateTransferResult, key: string) {
  const item = buildStatementItems(
    aggregateToFilingResult(a),
    PROPERTIES[0].form,
    PROPERTIES[0].form.assets[0],
    meta(a) as never,
    undefined,
  ).get(key);
  expect(item, `명세서에 「${key}」 항목이 없다`).toBeDefined();
  return (item!.perAsset ?? []) as { label: string; value: string | number }[];
}

// ── D-0 구별력 ──────────────────────────────────────────────────────
describe("D-0 격자 — 두 양도건의 취득일·양도일이 실제로 다르다", () => {
  it("픽스처가 자산 축을 가른다 (같으면 이 anchor는 아무것도 구별하지 못한다)", () => {
    expect(GRID[0].acq).not.toBe(GRID[1].acq);
    expect(GRID[0].transfer).not.toBe(GRID[1].transfer);
    // 일반건물이 아니어야 `getAcqDateForCard`의 파트 분기로 도망가지 않는다.
    for (const p of PROPERTIES) {
      expect(p.form.assets[0].assetKind).not.toBe("general_building");
    }
    expect(meta(agg()).propertyFormMap?.size).toBe(2);
  });
});

// ── D-1 취득일자 ────────────────────────────────────────────────────
describe("D-1 명세서 자산별 취득일자 = 신고서 자산 열 (#054·#093)", () => {
  it("🔴 각 자산이 자기 취득일을 갖는다", () => {
    const rows = statementPerAsset(agg(), "acquisitionDate");
    expect(rows.map((r) => String(r.value))).toEqual(["2019-04-15", "2005-08-20"]);
  });

  it("🔴 두 카드가 같은 값을 낸다", () => {
    const a = agg();
    for (const [i, g] of GRID.entries()) {
      expect(
        String(statementPerAsset(a, "acquisitionDate")[i].value),
        `${g.label}: 명세서와 신고서의 취득일자가 다르다`,
      ).toBe(filingCell(a, "취득일자", g.id));
    }
  });
});

// ── D-2 양도일자 ────────────────────────────────────────────────────
describe("D-2 명세서에 자산별 양도일자가 있다 (#054)", () => {
  it("🔴 양도일 축이 존재하고 두 카드가 일치한다", () => {
    const a = agg();
    const rows = statementPerAsset(a, "transferDate");
    expect(rows.length, "양도일자에 자산별 펼침이 없다").toBe(2);
    expect(rows.map((r) => String(r.value))).toEqual(["2026-02-01", "2026-09-01"]);
    for (const [i, g] of GRID.entries()) {
      expect(String(rows[i].value)).toBe(filingCell(a, "양도일자", g.id));
    }
  });
});

// ── D-3 보유기간 ────────────────────────────────────────────────────
describe("D-3 보유기간이 자기 취득일·양도일로 산출된다 (#054)", () => {
  it("🔴 두 자산의 보유기간이 다르고 신고서와 일치한다", () => {
    const a = agg();
    const rows = statementPerAsset(a, "holdingPeriod");
    expect(String(rows[0].value)).not.toBe(String(rows[1].value));
    for (const [i, g] of GRID.entries()) {
      expect(
        String(rows[i].value),
        `${g.label}: 명세서와 신고서의 보유기간이 다르다`,
      ).toBe(filingCell(a, "보유기간", g.id));
    }
  });
});

// ── D-4 메타 단일 소스 ──────────────────────────────────────────────
describe("D-4 두 카드가 같은 메타 leaf를 쓴다 (#093)", () => {
  it("propertyFormMap이 빠지면 명세서가 1번 건 값으로 붕괴한다", () => {
    const a = agg();
    // 종전 조립(= propertyFormMap 없음)을 재현해 붕괴를 실증한다.
    const legacy = { properties: a.properties, aggregated: a } as never;
    const item = buildStatementItems(
      aggregateToFilingResult(a),
      PROPERTIES[0].form,
      PROPERTIES[0].form.assets[0],
      legacy,
      undefined,
    ).get("acquisitionDate");
    const legacyRows = (item!.perAsset ?? []) as { value: string }[];
    expect(legacyRows[0].value).toBe(legacyRows[1].value); // 둘 다 1번 건
    // 공용 leaf를 쓰면 갈린다.
    const fixed = statementPerAsset(a, "acquisitionDate");
    expect(String(fixed[0].value)).not.toBe(String(fixed[1].value));
  });
});


// ════════════════════════════════════════════════════════════════════
// 장특 분할 격자 — 표2(고가주택 1세대1주택 + 거주)가 걸려야 보유/거주가 갈린다
// ════════════════════════════════════════════════════════════════════

const LTHD_GRID = [
  { id: "q1", label: "고가주택A", acq: "2019-04-15", transfer: "2026-02-01" },
  { id: "q2", label: "토지B", acq: "2005-08-20", transfer: "2026-09-01" },
] as const;

function lthdForm(acq: string, transferDate: string): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate,
    contractTotalPrice: "2000000000",
    assets: [
      {
        ...makeDefaultAsset(1),
        acquisitionDate: acq,
        residenceInputMode: "direct" as const,
        residencePeriodMonthsAsset: "84",
      },
    ],
  };
}

const LTHD_PROPERTIES = LTHD_GRID.map((g) => ({
  propertyId: g.id,
  form: lthdForm(g.acq, g.transfer),
}));

function lthdGrid(): AggregateTransferResult {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "housing",
            acquisitionDate: D(LTHD_GRID[0].acq),
            transferDate: D(LTHD_GRID[0].transfer),
            transferPrice: 2_000_000_000,
            acquisitionPrice: 600_000_000,
            expenses: 0,
            isOneHousehold: true,
            householdHousingCount: 1,
            residencePeriodMonths: 84,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
          } as Partial<TransferTaxInput>),
          propertyId: LTHD_GRID[0].id,
          propertyLabel: LTHD_GRID[0].label,
        } as never,
        {
          ...baseTransferInput({
            propertyType: "land",
            acquisitionDate: D(LTHD_GRID[1].acq),
            transferDate: D(LTHD_GRID[1].transfer),
            transferPrice: 800_000_000,
            acquisitionPrice: 300_000_000,
            expenses: 0,
            isOneHousehold: false,
            householdHousingCount: 0,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
          } as Partial<TransferTaxInput>),
          propertyId: LTHD_GRID[1].id,
          propertyLabel: LTHD_GRID[1].label,
        } as never,
      ],
    } as never,
    rates,
  );
}

function lthdMeta(a: AggregateTransferResult) {
  return buildAggregateMeta(a, LTHD_PROPERTIES as never);
}

function lthdPerAsset(a: AggregateTransferResult, key: string) {
  const item = buildStatementItems(
    aggregateToFilingResult(a),
    LTHD_PROPERTIES[0].form,
    LTHD_PROPERTIES[0].form.assets[0],
    lthdMeta(a) as never,
    undefined,
  ).get(key);
  expect(item, `명세서에 「${key}」 항목이 없다`).toBeDefined();
  return (item!.perAsset ?? []) as { label: string; value: string | number }[];
}

function lthdFilingCell(a: AggregateTransferResult, label: string, col: string) {
  const rows = buildAggregateRows(
    aggregateToFilingResult(a),
    lthdMeta(a) as never,
    LTHD_PROPERTIES[0].form,
  ) as never as { label: string; values: Record<string, unknown> }[];
  const row = rows.find((r) => r.label === label);
  expect(row, `신고서에 「${label}」 행이 없다`).toBeDefined();
  return row!.values[col];
}

// ── D-5 장기보유특별공제 보유/거주 분할 (렌더되는 갈래) ────────────
describe("D-5 명세서 장특 보유/거주 분할 = 신고서 자산 열 (#054·#093)", () => {
  /**
   * 이 행은 `STATEMENT_GROUPS`의 「2단계 — 장기보유특별공제」에 들어 있어 **실제로 렌더된다**.
   * 날짜 행(D-1~D-3)과 달리 사용자가 화면에서 볼 수 있는 갈래다.
   */
  const grid = () => lthdGrid();

  it("격자 — 표2가 적용돼 보유분·거주분이 실제로 갈린다 (표1이면 구별력 0)", () => {
    const rows = lthdPerAsset(grid(), "ltResidencePart");
    expect(
      rows.some((r) => Number(r.value) > 0),
      "거주분이 전부 0이면 분할 축이 없어 이 anchor는 아무것도 재지 못한다",
    ).toBe(true);
  });

  it("🔴 두 카드가 같은 자산에 같은 보유분·거주분을 표시한다", () => {
    const a = grid();
    for (const [key, label] of [
      ["ltHoldingPart", " 보유 기간분 장특"],
      ["ltResidencePart", " 거주 기간분 장특"],
    ] as [string, string][]) {
      const stmt = lthdPerAsset(a, key);
      for (const [i, g] of LTHD_GRID.entries()) {
        expect(
          Number(stmt[i].value),
          `${g.label} ${label}: 명세서와 신고서가 다르다`,
        ).toBe(Number(lthdFilingCell(a, label, g.id)));
      }
    }
  });

  it("🔴 뒤 자산의 보유분이 1번 건 취득일로 계산되지 않는다", () => {
    const stmt = lthdPerAsset(grid(), "ltHoldingPart");
    // 2005년 취득 토지는 2019년 취득 아파트보다 보유가 훨씬 길다 —
    // primary(아파트) 취득일로 계산하면 보유분이 과소해진다.
    expect(Number(stmt[1].value)).toBeGreaterThan(69_230_770);
  });
});
