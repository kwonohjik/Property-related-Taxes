/**
 * anchor — 1세대1주택 장기보유특별공제 **표2(소득세법 §95②) 2021.1.1. 이전 양도분**의 신고서·상세명세 보유분·거주분 + 부표1 ⑯ 코드
 *
 * 결함(2026-11-10 브라우저 실측): 세액(총 장특)은 맞는데 신고서 표·상세명세서가 2021.1.1. 이후 방식(보유 연 4% + 거주 연 4%)으로
 * 총액을 다시 쪼개 「보유 기간분 / 거주 기간분」을 반반으로 적었고, ⑯ 코드도 표1(02)로 나왔다.
 *
 * 법령(KoreanLaw MCP 원문 대조):
 *  - 소득세법 §95② 표2, 2020.1.1. 시행본(MST 212777): 보유기간별 3년 24% … 9년 72% · 10년 이상 100분의 80 — **보유기간 한 열**.
 *  - 2021.1.1. 시행본(MST 224837, 법률 제17477호 개정): 표2가 「보유기간 공제율」(10년 이상 100분의 40) + 「거주기간 공제율」(10년 이상 100분의 40)로 분리.
 *    적용례: 법률 제17477호 부칙 제2조 「이 법 중 양도소득세에 관한 개정규정은 이 법 시행 이후 양도하는 분부터 적용한다」.
 *  ⇒ 2020.12.31. 이전 양도분의 표2에는 거주기간별 공제율이 없다: 보유 기간분 = 총 장특, 거주 기간분 = 0.
 *
 * ── 손계산 (엔진 출력을 보기 전에 적은 값 — 1차 손계산이 고가주택 기준을 12억으로 잘못 잡아 9억 기준(2021.12.7. 이전)을 반영해 정정) ──
 *  양도가 20억 · 취득가 6억 · 필요경비 0 → 양도차익 14억.
 *  1세대1주택 고가주택 과세 양도차익 = 14억 × (양도가 − 고가주택 기준) / 양도가.
 *    · 2021-12-07 이전 양도: 기준 9억 → 14억 × 11억 / 20억 = 770,000,000
 *    · 2021-12-08 이후 양도: 기준 12억 → 14억 × 8억 / 20억 = 560,000,000
 *  · 보유 10년·거주 10년, 2019-06-15 양도(취득 2009-06-15): 표2 연 8% × 10 = 80% → 770,000,000 × 0.8 = 616,000,000
 *      → 보유 기간분 616,000,000 · 거주 기간분 0 · ⑯ 01
 *  · 같은 조건, 2022-06-15 양도(취득 2012-06-15): 보유 40% + 거주 40% = 80% → 560,000,000 × 0.8 = 448,000,000
 *      → 보유 224,000,000 · 거주 224,000,000 · ⑯ 01 (회귀 불변)
 *  · 보유 5년·거주 5년, 2019-06-15(취득 2014-06-15): 연 8% × 5 = 40% → 770,000,000 × 0.4 = 308,000,000 → 보유 308,000,000 · 거주 0
 *  · 보유 5년·거주 5년, 2022-06-15(취득 2017-06-15): 20% + 20% = 40% → 560,000,000 × 0.4 = 224,000,000 → 보유 112,000,000 · 거주 112,000,000
 *  · 경계 2020-12-31 양도(취득 2010-12-31): 10년 · 80% → 616,000,000 = 보유 616,000,000 · 거주 0
 *  · 경계 2021-01-01 양도(취득 2011-01-01): 10년 · 40%+40% → 616,000,000 = 보유 308,000,000 · 거주 308,000,000
 *  · 대조군 2020-01-01 양도 · 거주 0개월(취득 2010-01-01): 2020.1.1.부터 표2 대상에 거주 2년 요건(영 §159의3) → 표2 미적용,
 *      표1 10년 20% → 770,000,000 × 0.2 = 154,000,000 · 거주 기간분 0 · ⑯ 02
 *  · 2019-12-31 양도 · 거주 0개월(취득 2009-12-31): 거주요건 없음 → 표2 80% → 616,000,000 · 보유 616,000,000 · 거주 0 · ⑯ 01
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableColumns";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { FILING_CODE_ROW_LABEL } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import { splitLtDeduction } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { isTable2Applied } from "@/components/calc/results/transfer/lthd-split-display";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const D = (s: string) => new Date(s);
const rates = makeMockRates();
const TRANSFER = 2_000_000_000;
const ACQ = 600_000_000;

function house(acq: string, transfer: string, residenceMonths: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D(acq),
    transferDate: D(transfer),
    transferPrice: TRANSFER,
    acquisitionPrice: ACQ,
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: residenceMonths,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    // 2021-01-01~2022-05-09 양도분의 §154⑤ 단서(최종 1주택 재기산) — 「처분 이력 없음」으로 답해 보유 2년 판정이 막히지 않게 한다.
    finalOneHouseRestart: { hadOtherHouseDisposal: false, disposals: [] },
  } as Partial<TransferTaxInput>);
}

/** 화면이 읽는 폼 — 대표 자산의 취득일·거주 개월(`residencePeriodMonthsAsset`)이 옛 이력 fallback 재안분의 입력이다. */
const formAndAsset = (transfer: string, acq: string, residenceMonths: number) => {
  const asset = { assetId: "primary", assetKind: "housing", acquisitionDate: acq, residenceInputMode: "months", residencePeriods: [], residencePeriodMonthsAsset: String(residenceMonths) } as unknown as AssetForm;
  const form = { ...createDefaultTransferFormData(), contractTotalPrice: String(TRANSFER), transferDate: transfer, assets: [asset] } as unknown as TransferFormData;
  return { asset, form };
};
type Row = { label: string; values: Record<string, number | string | null> };

function screen(r: ReturnType<typeof calculateTransferTax>, transfer: string, acq: string, residenceMonths: number) {
  const { asset, form } = formAndAsset(transfer, acq, residenceMonths);
  const rows = buildRows(r, "single", form) as never as Row[];
  const get = (label: string) => rows.find((x) => x.label === label)?.values.total;
  const items = buildStatementItems(r, form, asset, undefined, undefined);
  const item = (k: string) => (items.get(k)?.value as number) ?? 0;
  return {
    form: { total: get("장기보유특별공제") as number, holding: get(" 보유 기간분 장특") as number, residence: get(" 거주 기간분 장특") as number },
    code: get(FILING_CODE_ROW_LABEL.lthdCode),
    stmt: { total: item("ltDeduction"), holding: item("ltHoldingPart"), residence: item("ltResidencePart") },
    stmtItems: items,
  };
}

/** 엔진 sub-step이 없는 옛 이력(resultData) — 보유·거주 sub-step을 걷어낸 사본. */
function withoutLthdSubSteps(r: ReturnType<typeof calculateTransferTax>) {
  return { ...r, steps: r.steps.filter((s) => s.label !== "보유 기간분 장특" && s.label !== "거주 기간분 장특") };
}

const CASES: Array<{ name: string; acq: string; tr: string; res: number; total: number; holding: number; residence: number; code: string }> = [
  { name: "보유 10·거주 10, 2019-06-15 (표2 연 8% 한 열)", acq: "2009-06-15", tr: "2019-06-15", res: 120, total: 616_000_000, holding: 616_000_000, residence: 0, code: "01" },
  { name: "보유 10·거주 10, 2022-06-15 (보유 40% + 거주 40% — 회귀 불변)", acq: "2012-06-15", tr: "2022-06-15", res: 120, total: 448_000_000, holding: 224_000_000, residence: 224_000_000, code: "01" },
  { name: "보유 5·거주 5, 2019-06-15", acq: "2014-06-15", tr: "2019-06-15", res: 60, total: 308_000_000, holding: 308_000_000, residence: 0, code: "01" },
  { name: "보유 5·거주 5, 2022-06-15", acq: "2017-06-15", tr: "2022-06-15", res: 60, total: 224_000_000, holding: 112_000_000, residence: 112_000_000, code: "01" },
  { name: "경계 2020-12-31 (마지막 연 8%)", acq: "2010-12-31", tr: "2020-12-31", res: 120, total: 616_000_000, holding: 616_000_000, residence: 0, code: "01" },
  { name: "경계 2021-01-01 (첫 4% + 4%)", acq: "2011-01-01", tr: "2021-01-01", res: 120, total: 616_000_000, holding: 308_000_000, residence: 308_000_000, code: "01" },
  { name: "2019-12-31 · 거주 0개월 (거주요건 없음 — 표2 80%)", acq: "2009-12-31", tr: "2019-12-31", res: 0, total: 616_000_000, holding: 616_000_000, residence: 0, code: "01" },
  { name: "대조군 2020-01-01 · 거주 0개월 (거주 2년 요건 미충족 — 표1 20%)", acq: "2010-01-01", tr: "2020-01-01", res: 0, total: 154_000_000, holding: 154_000_000, residence: 0, code: "02" },
];

describe("표2 시행 구분별 보유 기간분·거주 기간분·⑯ — 엔진 sub-step 경로", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = calculateTransferTax(house(c.acq, c.tr, c.res), rates);
      expect(r.longTermHoldingDeduction, "총 장특(세액 축)").toBe(c.total);
      const s = screen(r, c.tr, c.acq, c.res);
      expect(s.form, "신고서 표").toEqual({ total: c.total, holding: c.holding, residence: c.residence });
      expect(s.stmt, "상세명세서").toEqual({ total: c.total, holding: c.holding, residence: c.residence });
      expect(s.code, "부표1 ⑯").toBe(c.code);
    });
  }

  it("2020.12.31. 이전 표2: 엔진이 보유 sub-step(전액·표지)과 거주 sub-step(0)을 낸다 — 산식 문구가 서로 모순되지 않는다", () => {
    const r = calculateTransferTax(house("2009-06-15", "2019-06-15", 120), rates);
    const h = r.steps.find((s) => s.label === "보유 기간분 장특");
    const res = r.steps.find((s) => s.label === "거주 기간분 장특");
    expect(h?.amount).toBe(616_000_000);
    expect(h?.lthdTable2HoldingOnly).toBe(true);
    expect(res?.amount).toBe(0);
    expect(res?.formula).toContain("거주기간별 공제율이 없음");
    expect(r.steps.find((s) => s.label === "장기보유특별공제")?.formula).toContain("×8%");
    // 명세서 거주분 줄이 「거주 10년 직접 산정」이라 적던 모순 — 이제 「공제 대상 아님」
    expect(screen(r, "2019-06-15", "2009-06-15", 120).stmtItems.get("ltResidencePart")?.formula).not.toContain("직접 산정");
  });

  it("2021 이후 양도의 sub-step에는 표지가 없다(회귀 불변)", () => {
    const r = calculateTransferTax(house("2012-06-15", "2022-06-15", 120), rates);
    expect(r.steps.find((s) => s.label === "보유 기간분 장특")?.lthdTable2HoldingOnly).toBeUndefined();
  });

  it("표1 대조군은 sub-step이 없다 — 표지가 표1을 표2로 만들지 않는다", () => {
    const r = calculateTransferTax(house("2010-01-01", "2020-01-01", 0), rates);
    expect(r.steps.some((s) => s.label === "보유 기간분 장특")).toBe(false);
    expect(isTable2Applied(r.steps, false)).toBe(false);
  });
});

describe("옛 이력(sub-step 없는 resultData) fallback — 양도일 시행 구분", () => {
  it("2019-06-15 양도: 보유분 전액·거주분 0 (신고서·명세서)", () => {
    const r = withoutLthdSubSteps(calculateTransferTax(house("2009-06-15", "2019-06-15", 120), rates));
    const s = screen(r as never, "2019-06-15", "2009-06-15", 120);
    expect(s.form).toEqual({ total: 616_000_000, holding: 616_000_000, residence: 0 });
    expect(s.stmt).toEqual({ total: 616_000_000, holding: 616_000_000, residence: 0 });
    // 옛 이력은 ⑯을 알 수 없다 — 종전과 같이 표1 코드(02)로 둔다(확인 필요: 양도일 도출 경로가 없다).
    expect(s.code).toBe("02");
    // 명세서 거주분 산식이 보유분과 모순되지 않는다
    expect(s.stmtItems.get("ltResidencePart")?.formula).toContain("2020.12.31. 이전");
    expect(s.stmtItems.get("ltHoldingPart")?.formula).toContain("2020.12.31. 이전");
  });

  it("2022-06-15 양도: 종전 그대로 224,000,000 / 224,000,000", () => {
    const r = withoutLthdSubSteps(calculateTransferTax(house("2012-06-15", "2022-06-15", 120), rates));
    const s = screen(r as never, "2022-06-15", "2012-06-15", 120);
    expect(s.form).toEqual({ total: 448_000_000, holding: 224_000_000, residence: 224_000_000 });
    expect(s.stmt).toEqual({ total: 448_000_000, holding: 224_000_000, residence: 224_000_000 });
  });

  it("splitLtDeduction 직접: 경계 2020-12-31 / 2021-01-01, 날짜 미제공은 종전 식", () => {
    expect(splitLtDeduction(448_000_000, 120, 120, true, "2020-12-31")).toEqual({ holdingAmount: 448_000_000, residenceAmount: 0 });
    expect(splitLtDeduction(448_000_000, 120, 120, true, "2021-01-01")).toEqual({ holdingAmount: 224_000_000, residenceAmount: 224_000_000 });
    expect(splitLtDeduction(448_000_000, 120, 120, true, D("2019-06-15"))).toEqual({ holdingAmount: 448_000_000, residenceAmount: 0 });
    expect(splitLtDeduction(448_000_000, 120, 120, true)).toEqual({ holdingAmount: 224_000_000, residenceAmount: 224_000_000 });
    expect(splitLtDeduction(448_000_000, 120, 120, true, "")).toEqual({ holdingAmount: 224_000_000, residenceAmount: 224_000_000 });
  });
});

describe("다건 합산 — 자산별 행", () => {
  const land = (id: string, tr: string) =>
    ({
      ...baseTransferInput({
        propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 150_000_000, acquisitionDate: D("2005-01-01"),
        transferDate: D(tr), householdHousingCount: 0,
      } as never),
      propertyId: id, propertyLabel: id,
    }) as never;
  const agg = (tr: string, acq: string, res: number): Any =>
    calculateTransferTaxAggregate(
      {
        taxYear: Number(tr.slice(0, 4)),
        annualBasicDeductionUsed: 0,
        properties: [{ ...house(acq, tr, res), propertyId: "H1", propertyLabel: "H1" }, land("L1", tr)],
      } as never,
      rates,
    );
  const cells = (a: Any, form?: TransferFormData) => {
    const adapted = aggregateToFilingResult(a);
    const aggregate = { properties: a.properties, aggregated: a };
    const { mode } = deriveColumns(adapted, aggregate);
    const rows = buildRows(adapted, mode, form, undefined, undefined, undefined, undefined, aggregate) as never as Row[];
    const at = (label: string, col: string) => rows.find((r) => r.label === label)?.values[col];
    return { holding: at(" 보유 기간분 장특", "H1"), residence: at(" 거주 기간분 장특", "H1"), code: at(FILING_CODE_ROW_LABEL.lthdCode, "H1") };
  };

  it("2019 양도 H1: 보유분 전액·거주분 0·⑯ 01 (엔진 echo 경로)", () => {
    const a = agg("2019-06-15", "2009-06-15", 120);
    expect(a.properties[0].longTermHoldingDeduction).toBe(616_000_000);
    expect(cells(a)).toEqual({ holding: 616_000_000, residence: 0, code: "01" });
  });

  it("2022 양도 H1: 224,000,000 / 224,000,000 (회귀 불변)", () => {
    const a = agg("2022-06-15", "2012-06-15", 120);
    expect(cells(a)).toMatchObject({ holding: 224_000_000, residence: 224_000_000, code: "01" });
  });

  /** 엔진 echo(`filingDisplay.lthd*Part`)가 없는 옛 이력 — 자산별 행이 거주 개월(폼)로 재안분하는 경로(`FilingFormTableAggregateHelpers`). */
  const stripEcho = (a: Any) => {
    for (const p of a.properties) {
      if (p.filingDisplay) { delete p.filingDisplay.lthdHoldingPart; delete p.filingDisplay.lthdResidencePart; }
    }
    return a;
  };
  const oldForm = (tr: string, acq: string): TransferFormData => {
    const asset = { assetId: "H1", assetKind: "housing", acquisitionDate: acq, residenceInputMode: "months", residencePeriods: [], residencePeriodMonthsAsset: "120" };
    return { ...createDefaultTransferFormData(), transferDate: tr, assets: [asset] } as unknown as TransferFormData;
  };

  it("옛 이력(echo 없음) 2019 양도 H1: 보유분 전액·거주분 0 — 2021 이후 방식(반반)으로 쪼개지 않는다", () => {
    const a = stripEcho(agg("2019-06-15", "2009-06-15", 120));
    expect(a.properties[0].filingDisplay?.lthdHoldingPart).toBeUndefined();
    expect(cells(a, oldForm("2019-06-15", "2009-06-15"))).toMatchObject({ holding: 616_000_000, residence: 0 });
  });

  it("옛 이력(echo 없음) 2022 양도 H1: 종전 그대로 224,000,000 / 224,000,000", () => {
    const a = stripEcho(agg("2022-06-15", "2012-06-15", 120));
    expect(cells(a, oldForm("2022-06-15", "2012-06-15"))).toMatchObject({ holding: 224_000_000, residence: 224_000_000 });
  });
});
