/**
 * anchor — Phase C(토지·건물 별개 취득 결과 표시 정합) · UI Do.
 *
 * 설계: `docs/02-design/features/transfer-split-acq-result-display.ui.design.md` · 계획서 C-통합 결정 1~10.
 * 짝: `split-acq-result-display.c.predo.anchor.test.tsx`(단건 6조합·GB Q-F·카드 H-6 — Pre-Do에서 이어받은 단언).
 *
 * 이 파일이 지키는 것
 *   ① 단건 상세명세서 필요경비 문구 · swap 파트(H-7) — 신고서·명세서·카드가 같은 항등식
 *   ② 집계 소제목(G-4) — echo 3종에서 파생(어댑터 상수 아님) · 어댑터 플래그 파생
 *   ③ 다건·컴패니언(H-5) 신고서·명세서 자산별 행이 엔진 echo(E-U1)를 따라온다
 *   ④ 일괄 실가 안분 산식 분모(Q-F-4) — 취득시 기준시가
 *   ⑤ 결정 8 — 신고서 split-2col 장기보유 보유분·거주분은 엔진 echo(1원 어긋남 샘플)
 *   ⑥ 결정 9 — 4모드 라벨 단일 소스
 *   ⑦ 사이드바 — 분리 자산 취득가액은 엔진 echo
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTaxAggregate, type AggregateTransferInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { buildRows, deriveColumns, splitLtDeduction } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { sepAcqModeLabel } from "@/components/calc/results/mixed-use/mixed-use-separate-acq-text";
import { aggregateAcqModes } from "@/components/calc/results/transfer/split-acq-text";
import { splitAcqModeLabel } from "@/lib/tax-engine/transfer-tax-split-display";
import { createDefaultTransferFormData, useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/types/general-building.types";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { COMBOS, SCN_H, SCN_N, rates, run, toInput, D } from "../tax-engine/transfer/_helpers/split-acq-display-fixture";

afterEach(cleanup);

const FORM = {
  transferDate: "2026-07-01",
  contractTotalPrice: "900000000",
  assets: [{ residencePeriodMonthsAsset: "0" }],
} as unknown as TransferFormData;

/** 렌더 가능한 formula(ReactNode | string) → 텍스트 */
function text(node: unknown): string {
  const { container } = render(createElement("div", null, node as never));
  return container.textContent ?? "";
}

// ───────────────────────────────────────────────────────────────────────────
// ① 단건 — 필요경비 문구 · swap(H-7)
// ───────────────────────────────────────────────────────────────────────────
describe("[단건] 상세명세서 필요경비 문구 — 파트별 개산공제", () => {
  it("실가/환산 — 「건물 개산공제 1,500,000 (취득시 기준시가 50,000,000 × 3%)」이 값을 만든다", () => {
    const r = run(SCN_N, COMBOS.AE);
    const items = buildStatementItems(r, FORM, undefined, undefined, SCN_N.price);
    const exp = items.get("expenses")!;
    expect(exp.value).toBe(1_500_000);
    const t = text(exp.formula);
    expect(t).toContain("건물 개산공제 1,500,000 (취득시 기준시가 50,000,000 × 3%)");
    expect(t).not.toContain("토지 개산공제"); // 실거래가 토지 파트는 개산공제가 없다
  });

  it("환산/환산 — 토지·건물 두 파트의 개산공제가 각각 적힌다", () => {
    const r = run(SCN_N, COMBOS.EE);
    const t = text(buildStatementItems(r, FORM, undefined, undefined, SCN_N.price).get("expenses")!.formula);
    expect(t).toContain("토지 개산공제 4,500,000 (취득시 기준시가 150,000,000 × 3%)");
    expect(t).toContain("건물 개산공제 1,500,000 (취득시 기준시가 50,000,000 × 3%)");
  });

  it("미등기 — 율은 엔진 echo(0.3%)를 읽는다 (폼 3% 하드코딩 아님)", () => {
    const r = run(SCN_N, COMBOS.AE, { isUnregistered: true });
    const t = text(buildStatementItems(r, FORM, undefined, undefined, SCN_N.price).get("expenses")!.formula);
    expect(t).toContain("× 0.3%");
    expect(t).not.toContain("× 3%");
  });

  it("실가/실가(개산공제·swap 파트 없음) — 종전 「양도비」 문구를 그대로 쓴다 (회귀 0)", () => {
    const r = run(SCN_N, COMBOS.AA, { landDirectExpenses: 2_000_000, buildingDirectExpenses: 1_000_000 });
    const exp = buildStatementItems(r, FORM, undefined, undefined, SCN_N.price).get("expenses")!;
    expect(exp.value).toBe(3_000_000);
    expect(text(exp.formula)).toBe("양도비 3,000,000 (중개수수료·법무사 비용 등) — §97① 나목");
  });
});

describe("[단건] swap 파트(H-7) — 취득가액 0 · 필요경비 = 직접경비 · 안내, 신고서·명세서·카드가 같은 항등식", () => {
  const r = run(SCN_N, COMBOS.AE, { buildingDirectExpenses: 150_000_000 });
  const gain = r.transferGain; // 550,000,000

  it("엔진 정의 확인 — 건물 swap, 환산취득가액 112,500,000은 차감되지 않는다", () => {
    expect(r.splitDetail!.building.swapApplied).toBe(true);
    expect(r.splitDetail!.building.acquisitionPrice).toBe(112_500_000);
    expect(gain).toBe(550_000_000);
  });

  it("신고서 합계 열 — 취득 200,000,000(토지) · 필요경비 150,000,000 · 양도가 − 취득 − 경비 = 양도차익", () => {
    const rows = buildRows(r, deriveColumns(r).mode, FORM, undefined, SCN_N.price);
    const v = (label: string) => rows.find((x) => x.label === label)!;
    expect(v("취득가액").values.total).toBe(200_000_000);
    expect(v("필요경비").values.total).toBe(150_000_000);
    expect(SCN_N.price - 200_000_000 - 150_000_000).toBe(gain);
    // 열별 — 건물 열 취득가액 0 + rose 안내
    expect(Number(v("취득가액").values.building ?? 0)).toBe(0);
    expect(v("취득가액").values.land).toBe(200_000_000);
    expect(v("취득가액").roseNotes?.building).toContain("§97②2호 단서");
    expect(v("취득가액").roseNotes?.building).toContain("112,500,000");
    // 열별 항등식 — 건물: 양도가 − 0 − 150,000,000 = 양도차익
    const bt = Number(v("양도가액").values.building);
    expect(bt - Number(v("취득가액").values.building ?? 0) - Number(v("필요경비").values.building)).toBe(Number(v("전체 양도차익").values.building));
  });

  it("상세명세서 — 취득가액 200,000,000 · 필요경비 150,000,000 + 문구에 swap 안내", () => {
    const items = buildStatementItems(r, FORM, undefined, undefined, SCN_N.price);
    expect(items.get("acquisitionPrice")!.value).toBe(200_000_000);
    expect(items.get("expenses")!.value).toBe(150_000_000);
    const acq = text(items.get("acquisitionPrice")!.formula);
    expect(acq).toContain("건물(환산취득가) 0");
    expect(acq).toContain("취득가액 112,500,000");
    expect(acq).toContain("§97②2호 단서");
    const exp = text(items.get("expenses")!.formula);
    expect(exp).toContain("건물 자본적지출·양도비 150,000,000");
  });

  it("결과 카드 — 건물 취득가액 셀에 「차감 안 됨」 고지 (기존 계약 유지)", () => {
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: r.splitDetail! }));
    expect(container.querySelector('[data-testid="split-card-acq-building"]')!.textContent).toContain("차감 안 됨");
    expect(container.querySelector('[data-testid="split-card-acq-land"]')!.textContent).not.toContain("차감 안 됨");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ②③ 집계 — 소제목(G-4) · 다건 echo(H-5) 추종
// ───────────────────────────────────────────────────────────────────────────
function plainLand(over: Record<string, unknown> = {}) {
  return {
    ...(baseTransferInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      transferDate: D("2026-03-01"),
      acquisitionPrice: 100_000_000,
      acquisitionDate: D("2015-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      ...over,
    } as never) as never as Record<string, unknown>),
    propertyId: "np2",
    propertyLabel: "건2",
  };
}
function splitItem(land: keyof typeof COMBOS, over: Record<string, unknown> = {}) {
  return { ...(toInput(SCN_N, COMBOS[land], over as never) as never as Record<string, unknown>), propertyId: "np1", propertyLabel: "건1" };
}
function aggOf(items: Record<string, unknown>[]) {
  return calculateTransferTaxAggregate(
    { taxYear: 2026, properties: items, annualBasicDeductionUsed: 0 } as unknown as AggregateTransferInput,
    rates,
  );
}
function formOf(): TransferFormData {
  return { ...createDefaultTransferFormData(), transferDate: "2026-07-01", contractTotalPrice: "900000000", assets: [makeDefaultAsset(1)] };
}
function metaOf(a: ReturnType<typeof aggOf>) {
  const props = a.properties.map((p) => ({ propertyId: p.propertyId, form: formOf() }));
  return buildAggregateMeta(a, props as never);
}
function headings(a: ReturnType<typeof aggOf>) {
  const items = buildStatementItems(aggregateToFilingResult(a), formOf(), formOf().assets[0], metaOf(a) as never, undefined);
  return { acq: text(items.get("acquisitionPrice")!.formula), exp: text(items.get("expenses")!.formula), items };
}

describe("[집계 소제목] G-4 — 자산별 echo에서 파생한다", () => {
  const estLand = () =>
    plainLand({ useEstimatedAcquisition: true, acquisitionPrice: 0, standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 200_000_000, acquisitionMethod: "estimated" });

  it("분리(실가/환산) + 평범한 실가 토지 — 혼합 소제목 (산정방식 실거래가·환산취득가)", () => {
    const a = aggOf([splitItem("AE"), plainLand()]);
    const h = headings(a);
    expect(h.acq).toContain("산정방식: 실거래가·환산취득가");
    expect(h.acq).not.toContain("자산별 실제 거래가액 합계");
    expect(h.exp).toContain("실거래가 파트는 자본적지출·양도비");
    expect(h.exp).toContain("개산공제");
    expect(h.exp).not.toContain("자산별 양도비 합계");
  });

  it("평범한 환산 토지만 — 「자산별 환산취득가 합계」 (종전: 거짓 「실제 거래가액」)", () => {
    const a = aggOf([estLand()]);
    expect(a.properties[0].filingDisplay?.estimatedBase).toBeDefined();
    const h = headings(a);
    expect(h.acq).toBe("자산별 환산취득가 합계 — 시행령 §163·§176의2②");
    expect(h.exp).toBe("자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥");
  });

  it("전부 실가 — 종전 소제목 그대로 (회귀 0)", () => {
    const a = aggOf([plainLand(), { ...plainLand(), propertyId: "np3", propertyLabel: "건3" }]);
    const h = headings(a);
    expect(h.acq).toBe("자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)");
    expect(h.exp).toBe("자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목");
  });

  it("어댑터 플래그는 상수 false가 아니라 echo 파생 — 전부 환산일 때만 true", () => {
    expect(aggregateToFilingResult(aggOf([estLand()])).usedEstimatedAcquisition).toBe(true);
    expect(aggregateToFilingResult(aggOf([splitItem("EE")])).usedEstimatedAcquisition).toBe(true);
    expect(aggregateToFilingResult(aggOf([splitItem("AE"), plainLand()])).usedEstimatedAcquisition).toBe(false);
    expect(aggregateToFilingResult(aggOf([plainLand()])).usedEstimatedAcquisition).toBe(false);
  });

  it("건별 어댑터도 echo 파생 — 분리 환산/환산 건은 true, 분리 실가/환산 건은 false", () => {
    const a = aggOf([splitItem("EE"), plainLand()]);
    expect(breakdownToFilingResult(a.properties[0]).usedEstimatedAcquisition).toBe(true);
    expect(breakdownToFilingResult(a.properties[1]).usedEstimatedAcquisition).toBe(false);
    expect([...aggregateAcqModes([aggOf([splitItem("AE")]).properties[0]], undefined)].sort()).toEqual(["actual", "estimated"]);
  });
});

describe("[다건·컴패니언] H-5 — 엔진 echo(E-U1)를 신고서·명세서 자산별 행이 따라온다 (실가/환산)", () => {
  const a = aggOf([splitItem("AE"), plainLand()]);

  it("합산 신고서 건1 열 — 취득 312,500,000 · 필요경비 1,500,000", () => {
    const rows = buildAggregateRows(aggregateToFilingResult(a), metaOf(a) as never, formOf()) as unknown as {
      label: string;
      values: Record<string, unknown>;
    }[];
    const row = (l: string) => rows.find((x) => x.label === l)!;
    const col = Object.keys(row("취득가액").values).find((k) => k !== "total" && row("양도가액").values[k] === a.properties[0].transferPrice)!;
    expect(row("취득가액").values[col]).toBe(312_500_000);
    expect(row("필요경비").values[col]).toBe(1_500_000);
  });

  it("상세명세서 — 합계 취득 412,500,000(=312.5M+100M) · 필요경비 1,500,000, 자산별 행은 파트 문구", () => {
    const h = headings(a);
    expect(h.items.get("acquisitionPrice")!.value).toBe(412_500_000);
    expect(h.items.get("expenses")!.value).toBe(1_500_000);
    const per = h.items.get("acquisitionPrice")!.perAsset!;
    const first = per.find((x) => x.label.includes("건1")) ?? per[0];
    expect(text(first.formula)).toContain("토지(실거래가) 200,000,000 + 건물(환산취득가) 112,500,000");
    expect(text(first.formula)).not.toContain("자산별 취득가액 = 0");
    const perExp = h.items.get("expenses")!.perAsset!;
    expect(text((perExp.find((x) => x.label.includes("건1")) ?? perExp[0]).formula)).toContain("건물 개산공제 1,500,000");
  });

  it("건별 상세 신고서(단일 열) — 취득 312,500,000 · 필요경비 1,500,000, 항등식 성립", () => {
    const p = a.properties[0];
    const fr = breakdownToFilingResult(p);
    const rows = buildRows(fr, deriveColumns(fr).mode, FORM, undefined, p.transferPrice);
    const v = (l: string) => Number(rows.find((x) => x.label === l)!.values.total ?? 0);
    expect(v("취득가액")).toBe(312_500_000);
    expect(v("필요경비")).toBe(1_500_000);
    expect(v("양도가액") - v("취득가액") - v("필요경비")).toBe(v("전체 양도차익"));
  });
});

describe("[집계 소제목] 일반건물 카드 echo — acquisitionMode(구 이력은 usedEstimatedAcquisition)에서 파생", () => {
  const gbOf = (cards: Array<Record<string, unknown>>) => ({ assetCards: cards }) as unknown as GeneralBuildingOutput;
  const pr = (id: string) => ({ propertyId: id, propertyLabel: id }) as unknown as PerPropertyBreakdown;

  it("카드 모드 4종이 그대로 집합에 들어간다 (감정·매매사례가 「실거래가」로 읽히지 않는다)", () => {
    const gb = gbOf([
      { propertyId: "land", acquisitionMode: "appraisal" },
      { propertyId: "building", acquisitionMode: "salesCase" },
    ]);
    expect([...aggregateAcqModes([pr("land"), pr("building")], gb)].sort()).toEqual(["appraisal", "salesCase"]);
  });

  it("구 이력(모드 echo 부재) — usedEstimatedAcquisition boolean으로 후퇴", () => {
    const gb = gbOf([
      { propertyId: "land", usedEstimatedAcquisition: true },
      { propertyId: "building", usedEstimatedAcquisition: false },
    ]);
    expect([...aggregateAcqModes([pr("land"), pr("building")], gb)].sort()).toEqual(["actual", "estimated"]);
  });

  it("지분 카드(land#0) — baseCardId로 짝을 찾는다", () => {
    const gb = gbOf([{ propertyId: "land#0", acquisitionMode: "estimated" }]);
    expect([...aggregateAcqModes([pr("land#0")], gb)]).toEqual(["estimated"]);
  });
});

describe("[비과세] 전액 비과세 split도 파트 정본(splitDetail)을 싣는다 — 엔진 보고 #1 (표시 전용, 세액 불변)", () => {
  const exempt = run(SCN_N, COMBOS.AE, { isOneHousehold: true, householdHousingCount: 1 });

  it("조기반환 결과가 splitDetail을 싣고, 세액은 0 그대로다", () => {
    expect(exempt.isExempt).toBe(true);
    expect(exempt.splitDetail).toBeDefined();
    expect(exempt.determinedTax).toBe(0);
    expect(exempt.totalTax).toBe(0);
    expect(exempt.exemptGrossGain).toBe(586_000_000);
  });

  it("단건 명세서 — 취득 312,500,000 · 필요경비 1,500,000 (종전: 314,000,000 / 0 — 개산공제가 취득가액에 섞임)", () => {
    const items = buildStatementItems(exempt, FORM, undefined, undefined, SCN_N.price);
    expect(items.get("acquisitionPrice")!.value).toBe(312_500_000);
    expect(items.get("expenses")!.value).toBe(1_500_000);
    expect(SCN_N.price - 312_500_000 - 1_500_000).toBe(exempt.exemptGrossGain);
  });

  it("신고서 split-2col — 비과세 양도차익 = 파트 양도차익 합, 과세대상 0", () => {
    const rows = buildRows(exempt, deriveColumns(exempt).mode, FORM, undefined, SCN_N.price);
    expect(deriveColumns(exempt).mode).toBe("split-2col");
    const g = (l: string, c: string) => Number(rows.find((x) => x.label === l)!.values[c] ?? 0);
    expect(g("취득가액", "total")).toBe(312_500_000);
    expect(g("필요경비", "total")).toBe(1_500_000);
    expect(g("비과세 양도차익", "total")).toBe(586_000_000);
    expect(g("과세대상 양도차익", "total")).toBe(0);
  });

  it("다건 집계 — 비과세 분리 자산의 취득가액·필요경비도 정정(종전: 취득 0 · 필요경비 314,000,000)", () => {
    const a = aggOf([splitItem("AE", { isOneHousehold: true, householdHousingCount: 1 }), plainLand()]);
    const p = a.properties[0];
    expect(p.isExempt).toBe(true);
    expect(p.acquisitionPrice).toBe(312_500_000);
    expect(p.necessaryExpense).toBe(1_500_000);
    expect(p.determinedTax).toBe(0); // 세액은 비과세 건 0 그대로 (표시 echo만 정정)
    expect(p.transferGain).toBe(0);
    expect(p.exemptGrossGain).toBe(586_000_000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ④ 일괄 실가 안분 산식 — 분모는 취득시 기준시가 (Q-F-4, 실응답 G-bundled-actual 발췌)
// ───────────────────────────────────────────────────────────────────────────
describe("[일반건물] Q-F-4 — 일괄 실가 안분 산식의 분모", () => {
  const card = (id: string, acq: number, transfer: number, source?: "bundled_apportion") => ({
    propertyId: id,
    acquisitionPrice: acq,
    transferPrice: transfer,
    usedEstimatedAcquisition: false,
    acquisitionMode: "actual",
    ...(source ? { actualSource: source } : {}),
  });
  const gb = (source?: "bundled_apportion") =>
    ({
      assetCards: [card("land", 691_818_892, 1_956_162_578, source), card("building", 8_181_108, 43_837_422, source)],
      landStdTotal: 920_550_000,
      buildingStdTotal: 20_629_440,
      acqLandStdTotal: 238_000_000,
      acqBuilding1StdTotal: 2_814_470,
      bundledActualAcquisitionPrice: 700_000_000,
    }) as unknown as GeneralBuildingOutput;
  const prop = (id: string, acq: number, transfer: number) =>
    ({ propertyId: id, propertyLabel: id, transferPrice: transfer, acquisitionPrice: acq, necessaryExpense: 0, capitalExpenditureForDisplay: 0 }) as unknown as PerPropertyBreakdown;

  it("산술: 700,000,000 × 238,000,000 ÷ (238,000,000 + 2,814,470) = 691,818,892 (양도시 분모면 684,656,902)", () => {
    expect(Math.floor((700_000_000 * 238_000_000) / 240_814_470)).toBe(691_818_892);
    expect(Math.floor((700_000_000 * 920_550_000) / 941_179_440)).toBe(684_656_902);
  });

  it("bundled_apportion echo — 토지 산식이 취득시 기준시가로 값을 만든다", () => {
    const f = buildGbAcquisitionFormula(prop("land", 691_818_892, 1_956_162_578), gb("bundled_apportion"), undefined)!;
    expect(f).toBe("700,000,000 × 238,000,000 / (238,000,000+2,814,470) = 691,818,892");
  });

  it("건물분은 잔액 보정 그대로", () => {
    const f = buildGbAcquisitionFormula(prop("building", 8_181_108, 43_837_422), gb("bundled_apportion"), undefined)!;
    expect(f).toBe("700,000,000 - 토지 691,818,892 = 8,181,108 (잔액 보정)");
  });

  it("구 이력(actualSource 부재) — 종전 양도시 분모 산식 유지", () => {
    const f = buildGbAcquisitionFormula(prop("land", 691_818_892, 1_956_162_578), gb(undefined), undefined)!;
    expect(f).toBe("700,000,000 × 920,550,000 / (920,550,000+20,629,440) = 691,818,892");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⑤ 결정 8 — 신고서 split-2col 장기보유 보유분·거주분 = 엔진 echo
// ───────────────────────────────────────────────────────────────────────────
describe("[신고서] 결정 8 — split-2col 장기보유 보유분·거주분은 엔진 echo를 소비한다", () => {
  // 1원 어긋남 샘플(탐침): 1.5B · 실가/환산 · 거주 60개월 — 토지 공제 111,000,000.
  // echo 보유 74,000,000 · 거주 37,000,000 / 종전 부동소수 재안분 74,000,001 · 36,999,999.
  const scn = { ...SCN_H, stdT: [Math.floor(1_500_000_000 * 0.3), Math.floor(1_500_000_000 * 0.1)] as [number, number], residenceMonths: 60 };
  const r = run(scn, COMBOS.AE);
  const form = { ...FORM, transferDate: "2026-07-01", contractTotalPrice: String(scn.price), assets: [{ residencePeriodMonthsAsset: "60" }] } as unknown as TransferFormData;
  const lthd = (res: TransferTaxResult) => {
    const rows = buildRows(res, deriveColumns(res).mode, form, undefined, scn.price);
    const g = (l: string, c: string) => Number(rows.find((x) => x.label.trim() === l)!.values[c] ?? 0);
    return {
      holdLand: g("보유 기간분 장특", "land"),
      resLand: g("거주 기간분 장특", "land"),
      holdBld: g("보유 기간분 장특", "building"),
      resBld: g("거주 기간분 장특", "building"),
      holdTotal: g("보유 기간분 장특", "total"),
      resTotal: g("거주 기간분 장특", "total"),
    };
  };

  it("표본 확인 — 종전 재안분과 echo가 1원 다르다(이 샘플이 소비 여부를 가른다)", () => {
    const land = r.splitDetail!.land;
    expect(land.longTermDeduction).toBe(111_000_000);
    expect([land.holdingDeductionAmount, land.residenceDeductionAmount]).toEqual([74_000_000, 37_000_000]);
    const old = splitLtDeduction(land.longTermDeduction, Math.round(land.holdingYears * 12), 60, true);
    expect([old.holdingAmount, old.residenceAmount]).toEqual([74_000_001, 36_999_999]);
  });

  it("echo 있음 — 신고서 열 값 = echo (토지 보유 74,000,000 · 거주 37,000,000), 열 합 = 합계 열", () => {
    const v = lthd(r);
    expect([v.holdLand, v.resLand]).toEqual([74_000_000, 37_000_000]);
    const sd = r.splitDetail!;
    expect([v.holdBld, v.resBld]).toEqual([sd.building.holdingDeductionAmount, sd.building.residenceDeductionAmount]);
    expect(v.holdTotal).toBe(v.holdLand + v.holdBld);
    expect(v.resTotal).toBe(v.resLand + v.resBld);
    expect(v.holdTotal + v.resTotal).toBe(r.longTermHoldingDeduction);
  });

  it("구 이력(echo 부재) — 종전 재안분 그대로 (74,000,001 · 36,999,999)", () => {
    const old = structuredClone(r);
    for (const part of [old.splitDetail!.land, old.splitDetail!.building]) {
      delete part.holdingDeductionRate;
      delete part.residenceDeductionRate;
      delete part.holdingDeductionAmount;
      delete part.residenceDeductionAmount;
    }
    const v = lthd(old);
    expect([v.holdLand, v.resLand]).toEqual([74_000_001, 36_999_999]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⑥ 결정 9 — 라벨 단일 소스
// ───────────────────────────────────────────────────────────────────────────
describe("[라벨] 결정 9 — 4모드 라벨은 한 어휘", () => {
  const MODES = ["actual", "estimated", "appraisal", "salesCase"] as const;
  const WORDS = { actual: "실거래가", estimated: "환산취득가", appraisal: "감정가액", salesCase: "매매사례가액" };

  it.each(MODES)("%s — 엔진 leaf = 겸용 라벨 = 정본 어휘", (m) => {
    expect(splitAcqModeLabel(m)).toBe(WORDS[m]);
    expect(sepAcqModeLabel(m)).toBe(WORDS[m]);
  });

  it("결과 카드 — 파트별 라벨이 정본 어휘이고 「실지취득가액」이 없다", () => {
    const r = run(SCN_N, { land: "actual", building: "appraisal", landValue: 200_000_000, buildingValue: 150_000_000 });
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: r.splitDetail! }));
    expect(container.querySelector('[data-testid="split-card-acq-mode-land"]')!.textContent).toBe("실거래가");
    expect(container.querySelector('[data-testid="split-card-acq-mode-building"]')!.textContent).toBe("감정가액");
    expect(container.textContent).not.toContain("실지취득가액");
  });

  it("구 이력(모드 echo 부재) — 카드는 실거래가로 읽는다", () => {
    const r = run(SCN_N, COMBOS.AA);
    const old = structuredClone(r.splitDetail!);
    delete old.land.acqMode;
    delete old.building.acqMode;
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: old }));
    expect(container.querySelector('[data-testid="split-card-acq-mode-land"]')!.textContent).toBe("실거래가");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⑦ 사이드바 — 분리 자산 취득가액 = 엔진 echo (엔진 보고 #2)
// ───────────────────────────────────────────────────────────────────────────
describe("[사이드바] 컴패니언 분리 자산 — 취득가액·필요경비가 같은 축(엔진 echo)", () => {
  beforeEach(() => useCalcWizardStore.getState().reset());

  const a = aggOf([splitItem("AE"), plainLand()]);
  const stateWith = (props: PerPropertyBreakdown[]) => {
    const second = makeDefaultAsset(2);
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "1200000000",
        bundledSaleMode: "actual",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", actualSalePrice: "900000000", hasSeperateLandAcquisitionDate: true },
          { ...second, assetKind: "land", actualSalePrice: "300000000" },
        ],
      },
      result: {
        mode: "bundled",
        apportionment: {
          apportioned: [
            // 별개 취득은 자산 단위 취득가액 칸이 숨어 안분 프리뷰 취득가액은 0이다.
            { assetId: "primary", allocatedSalePrice: 900_000_000, allocatedAcquisitionPrice: 0, allocatedExpenses: 0, saleMode: "actual" },
            { assetId: second.assetId, allocatedSalePrice: 300_000_000, allocatedAcquisitionPrice: 100_000_000, allocatedExpenses: 0, saleMode: "actual" },
          ],
        },
        aggregated: { properties: props.map((p, i) => ({ ...p, propertyId: i === 0 ? "primary" : second.assetId })) },
      } as never,
    }));
    const { formData, result } = useCalcWizardStore.getState();
    return computeTransferPerAssetSummary(formData, result);
  };

  it("분리 자산 — 취득가액은 엔진 echo(312,500,000), 필요경비는 1,500,000: 같은 축", () => {
    const s = stateWith(a.properties);
    expect(s.rows[0].acqPrice).toBe(312_500_000);
    expect(s.rows[0].expense).toBe(1_500_000);
    expect(s.rows[0].salePrice - s.rows[0].acqPrice - s.rows[0].expense).toBe(a.properties[0].transferGain);
  });

  it("평범한 자산 — 종전대로 안분 프리뷰 취득가액(100,000,000)", () => {
    const s = stateWith(a.properties);
    expect(s.rows[1].acqPrice).toBe(100_000_000);
  });

  it("splitDetail 없는 집계 속성이면 분리 자산이라도 종전(안분 프리뷰) — echo 부재 안전", () => {
    const stripped = a.properties.map((p) => {
      const { splitDetail: _s, ...rest } = p;
      void _s;
      return rest as PerPropertyBreakdown;
    });
    const s = stateWith(stripped);
    expect(s.rows[0].acqPrice).toBe(0);
  });
});
