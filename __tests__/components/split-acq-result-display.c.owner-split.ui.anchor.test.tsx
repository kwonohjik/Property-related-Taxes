/**
 * anchor — Phase C Check 지적 수정 · 소유자 분리(selfOwns ≠ both) 결과뷰 항등식 + F1·F2·F6 (표시 전용, 세액 불변)
 *
 * 설계: `docs/02-design/features/transfer-split-acq-result-display.ui.design.md` · 계획서 C-통합 결정 3·4·8.
 * 짝: `split-acq-result-display.c.ui.anchor.test.tsx` · 엔진 `…c.owner-split.anchor.test.ts`
 *
 *   OV-1  단건 — 신고서 합계 열·상세명세서가 같은 소유 파트 값 (selfOwns 3종 × 과세·전액 비과세 × 조합)
 *   OV-2  다건 — 합산 신고서(건·합계 열) · 합산 요약 카드 · 합산 명세서 · 건별 신고서 모두 `양도가 − 취득 − 필요경비 = 양도차익`
 *   OV-3  F1 — 합산 명세서 자산별·합계 보유분·거주분은 엔진 echo(1원 재안분 아님) · 구 이력은 종전
 *   OV-4  F2 — 합산 신고서: 분리 자산은 stale 환산 플래그(`filingDisplay.estimatedBase`)보다 파트 echo가 우선
 *   OV-5  F6 — 비과세 분리 카드의 장특 행 설명(단건 카드 · 다건 `ValuationDetailCards` 배선)
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTaxAggregate, type AggregateTransferInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns, splitLtDeduction } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { breakdownToFilingResult, filingTransferPriceOverride } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { MultiTransferTaxSummaryCard } from "@/components/calc/results/MultiTransferTaxSummaryCard";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { COMBOS, SCN_H, SCN_N, SCN_X, ownedModel, model, rates, run, toInput, D, type Scn } from "../tax-engine/transfer/_helpers/split-acq-display-fixture";

afterEach(cleanup);

const OWNS = ["both", "land_only", "building_only"] as const;
const SCN_PAIRS = [["N 과세", SCN_N], ["X 전액 비과세", SCN_X]] as const;
const COMBO_KEYS = ["AE", "EE", "PA"] as const;

const formFor = (scn: Scn) =>
  ({ transferDate: "2026-07-01", contractTotalPrice: String(scn.price), assets: [{ residencePeriodMonthsAsset: String(scn.residenceMonths) }] }) as unknown as TransferFormData;

function plainLand() {
  return {
    ...(baseTransferInput({
      propertyType: "land", transferPrice: 300_000_000, transferDate: D("2026-03-01"), acquisitionPrice: 100_000_000,
      acquisitionDate: D("2015-01-01"), isOneHousehold: false, householdHousingCount: 2,
    } as never) as never as Record<string, unknown>),
    propertyId: "np2",
    propertyLabel: "건2",
  };
}
const splitItem = (scn: Scn, combo: keyof typeof COMBOS, over: Record<string, unknown> = {}) => ({
  ...(toInput(scn, COMBOS[combo], over as never) as never as Record<string, unknown>),
  propertyId: "np1",
  propertyLabel: "건1",
});
const aggOf = (items: Record<string, unknown>[]) =>
  calculateTransferTaxAggregate({ taxYear: 2026, properties: items, annualBasicDeductionUsed: 0 } as unknown as AggregateTransferInput, rates);
const formOf = (): TransferFormData => ({
  ...createDefaultTransferFormData(), transferDate: "2026-07-01", contractTotalPrice: "900000000", assets: [makeDefaultAsset(1)],
});
const metaOf = (a: ReturnType<typeof aggOf>) =>
  buildAggregateMeta(a, a.properties.map((p) => ({ propertyId: p.propertyId, form: formOf() })) as never);

/** 신고서 표에서 한 행의 한 열 값 */
function cellOf(rows: { label: string; values: Record<string, unknown> }[], label: string, col: string): number {
  const row = rows.find((x) => x.label === label);
  if (!row) throw new Error(`행 없음: ${label}`);
  return Number(row.values[col] ?? 0);
}

// ───────────────────────────────────────────────────────────────────────────
// OV-1 · 단건
// ───────────────────────────────────────────────────────────────────────────
describe("OV-1 단건 — 소유자 분리: 신고서 합계 열 · 상세명세서가 같은 소유 파트 값이고 항등식이 성립한다", () => {
  for (const [sk, scn] of SCN_PAIRS) {
    for (const ck of COMBO_KEYS) {
      for (const own of OWNS) {
        it(`${sk} · ${ck} · ${own}`, () => {
          const e = ownedModel(scn, COMBOS[ck], own);
          const r = run(scn, COMBOS[ck], { selfOwns: own });
          const form = formFor(scn);

          // 상세명세서
          const items = buildStatementItems(r, form, undefined, undefined, scn.price);
          const st = {
            price: items.get("transferPrice")!.value as number,
            acq: items.get("acquisitionPrice")!.value as number,
            exp: items.get("expenses")!.value as number,
            gain: items.get("transferGain")!.value as number,
          };
          // 신고서 합계 열
          const rows = buildRows(r, deriveColumns(r).mode, form, undefined, scn.price) as unknown as { label: string; values: Record<string, unknown> }[];
          const fr = {
            price: cellOf(rows, "양도가액", "total"),
            acq: cellOf(rows, "취득가액", "total"),
            exp: cellOf(rows, "필요경비", "total"),
            gain: cellOf(rows, "전체 양도차익", "total"),
          };
          // 양도가액: both면 폼 값(일괄 총액 = 두 파트 합), 분리면 소유 파트 합
          expect(st, "상세명세서").toEqual({ price: e.price, acq: e.acq, exp: e.exp, gain: e.gain });
          expect(fr, "신고서").toEqual({ price: e.price, acq: e.acq, exp: e.exp, gain: e.gain });
          expect(st.price - st.acq - st.exp).toBe(st.gain);
          expect(fr.price - fr.acq - fr.exp).toBe(fr.gain);
          expect(r.isExempt).toBe(sk.startsWith("X"));
        });
      }
    }
  }

  it("명세서 양도가액 산식은 일괄 총액 중 소유 파트임을 밝힌다 · both는 종전 문구", () => {
    const land = run(SCN_N, COMBOS.AE, { selfOwns: "land_only" });
    const f = buildStatementItems(land, formFor(SCN_N), undefined, undefined, SCN_N.price).get("transferPrice")!.formula as string;
    expect(f).toBe("본인 소유 파트 양도가 — 토지 675,000,000 (일괄양도가액 900,000,000 중 · 소령 §166⑥·§168②)");
    const both = run(SCN_N, COMBOS.AE, { selfOwns: "both" });
    expect(buildStatementItems(both, formFor(SCN_N), undefined, undefined, SCN_N.price).get("transferPrice")!.formula).toBe(
      "사용자 입력 (실제 매매계약서상 거래금액)",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// OV-2 · 다건
// ───────────────────────────────────────────────────────────────────────────
describe("OV-2 다건 — 소유자 분리: 합산 신고서 · 요약 카드 · 합산 명세서 · 건별 신고서가 모두 항등식을 이룬다", () => {
  for (const [sk, scn] of SCN_PAIRS) {
    for (const ck of COMBO_KEYS) {
      for (const own of OWNS) {
        it(`${sk} · ${ck} · ${own}`, () => {
          const e = ownedModel(scn, COMBOS[ck], own);
          const a = aggOf([splitItem(scn, ck, { selfOwns: own }), plainLand()]);
          const p = a.properties[0];
          const plainGain = 300_000_000 - 100_000_000;

          // ① 합산 신고서 — 건1 열 · 건2 열 · 합계 열
          const rows = buildAggregateRows(aggregateToFilingResult(a), metaOf(a) as never, formOf()) as unknown as {
            label: string;
            values: Record<string, unknown>;
          }[];
          const cols = Object.keys(rows.find((x) => x.label === "취득가액")!.values).filter((k) => k !== "total");
          expect(cols.length).toBe(2);
          for (const col of [...cols, "total"]) {
            expect(
              cellOf(rows, "양도가액", col) - cellOf(rows, "취득가액", col) - cellOf(rows, "필요경비", col),
              `합산 신고서 ${col} 열`,
            ).toBe(cellOf(rows, "전체 양도차익", col));
          }
          const c1 = cols.find((k) => cellOf(rows, "양도가액", k) === e.price && cellOf(rows, "취득가액", k) === e.acq)!;
          expect(c1, "건1 열 값이 소유 파트 값").toBeDefined();
          expect(cellOf(rows, "양도가액", "total")).toBe(e.price + 300_000_000);
          expect(cellOf(rows, "전체 양도차익", "total")).toBe(e.gain + plainGain);

          // ② 합산 요약 카드
          const { container } = render(createElement(MultiTransferTaxSummaryCard, { result: a, properties: [], taxYear: 2026 }));
          const sRow = (label: string): number => {
            for (const d of Array.from(container.querySelectorAll("div.flex"))) {
              const sp = d.querySelectorAll(":scope > span");
              if (sp.length === 2 && (sp[0].textContent ?? "").trim() === label) return Number((sp[1].textContent ?? "").replace(/,/g, ""));
            }
            throw new Error(`요약 카드 행 없음: ${label}`);
          };
          expect(sRow("전체 양도가액")).toBe(e.price + 300_000_000);
          // 취득가액·필요경비는 음수 표기
          expect(sRow("전체 양도가액") + sRow("전체 취득가액") + sRow("전체 필요경비")).toBe(sRow("양도차익"));

          // ③ 합산 명세서 합계
          const items = buildStatementItems(aggregateToFilingResult(a), formOf(), formOf().assets[0], metaOf(a) as never, undefined);
          const st = (k: string) => items.get(k)!.value as number;
          expect(st("transferPrice")).toBe(e.price + 300_000_000);
          expect(st("transferPrice") - st("acquisitionPrice") - st("expenses")).toBe(st("transferGain"));

          // ④ 건별 상세 신고서(단일 열) — 어댑터 + 컴포넌트가 쓰는 같은 override leaf
          const fr = breakdownToFilingResult(p);
          const per = buildRows(fr, deriveColumns(fr).mode, formFor(scn), undefined, filingTransferPriceOverride(p)) as unknown as {
            label: string;
            values: Record<string, unknown>;
          }[];
          expect(cellOf(per, "양도가액", "total")).toBe(e.price);
          expect(cellOf(per, "취득가액", "total")).toBe(e.acq);
          expect(cellOf(per, "필요경비", "total")).toBe(e.exp);
          expect(cellOf(per, "양도가액", "total") - cellOf(per, "취득가액", "total") - cellOf(per, "필요경비", "total")).toBe(
            cellOf(per, "전체 양도차익", "total"),
          );
          expect(sk.startsWith("X")).toBe(p.isExempt);
        });
      }
    }
  }

  it("건별 신고서 양도가액 override — 소유자 분리만 소유 파트 합, 그 외(both·평범한 자산)는 undefined(종전 경로)", () => {
    const a = aggOf([splitItem(SCN_N, "AE", { selfOwns: "land_only" }), plainLand()]);
    expect(filingTransferPriceOverride(a.properties[0])).toBe(675_000_000);
    expect(filingTransferPriceOverride(a.properties[1])).toBeUndefined();
    const both = aggOf([splitItem(SCN_N, "AE"), plainLand()]);
    expect(filingTransferPriceOverride(both.properties[0])).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// OV-3 · F1 — 합산 명세서 보유분·거주분은 엔진 echo
// ───────────────────────────────────────────────────────────────────────────
describe("OV-3 F1 — 합산 명세서 장특 보유분·거주분(자산별·합계)은 엔진 echo를 소비한다", () => {
  // H(1.5B 1세대1주택 표2) · 실가/환산: 토지 보유 74,000,000 + 건물 13,916,000 = 87,916,000 / 거주 51,800,000 + 13,916,000 = 65,716,000
  const a = aggOf([splitItem(SCN_H, "AE"), plainLand()]);
  const lt = (items: ReturnType<typeof buildStatementItems>, key: string) => items.get(key)!;
  const itemsOf = (agg: ReturnType<typeof aggOf>) =>
    buildStatementItems(aggregateToFilingResult(agg), formOf(), formOf().assets[0], metaOf(agg) as never, undefined);

  it("독립 산식 확인 — 보유 87,916,000 · 거주 65,716,000", () => {
    const m = model(SCN_H, COMBOS.AE);
    expect(m.land.holdAmt + m.building.holdAmt).toBe(87_916_000);
    expect(m.land.resAmt + m.building.resAmt).toBe(65_716_000);
  });

  it("자산별 행 = echo 합(신고서 filingDisplay.lthd*와 같은 값) · 평범한 자산은 종전 재안분", () => {
    const items = itemsOf(a);
    const hold = lt(items, "ltHoldingPart").perAsset!.map((x) => x.value);
    const res = lt(items, "ltResidencePart").perAsset!.map((x) => x.value);
    expect(hold[0]).toBe(87_916_000);
    expect(res[0]).toBe(65_716_000);
    expect(hold[0]).toBe(a.properties[0].filingDisplay!.lthdHoldingPart);
    expect(res[0]).toBe(a.properties[0].filingDisplay!.lthdResidencePart);
    // 건2(평범한 토지): 폼 거주 0개월 → 보유분 전액
    expect([hold[1], res[1]]).toEqual([a.properties[1].longTermHoldingDeduction, 0]);
  });

  it("합계 행 = 자산별 합 · 보유 + 거주 = 합계 장특공제", () => {
    const items = itemsOf(a);
    const holdTotal = lt(items, "ltHoldingPart").value as number;
    const resTotal = lt(items, "ltResidencePart").value as number;
    expect(holdTotal).toBe(lt(items, "ltHoldingPart").perAsset!.reduce((s, x) => s + Number(x.value), 0));
    expect(resTotal).toBe(lt(items, "ltResidencePart").perAsset!.reduce((s, x) => s + Number(x.value), 0));
    expect(holdTotal + resTotal).toBe(a.totalLongTermHoldingDeduction);
    expect(resTotal).toBe(65_716_000);
  });

  it("구 이력(파트 echo 부재) — 종전 재안분 그대로(폼 거주 0개월 → 보유분 전액)", () => {
    const old = structuredClone(a);
    for (const part of [old.properties[0].splitDetail!.land, old.properties[0].splitDetail!.building]) {
      delete part.holdingDeductionRate;
      delete part.residenceDeductionRate;
      delete part.holdingDeductionAmount;
      delete part.residenceDeductionAmount;
    }
    const items = itemsOf(old);
    const legacy = splitLtDeduction(old.properties[0].longTermHoldingDeduction, 0, 0, false);
    expect(lt(items, "ltHoldingPart").perAsset![0].value).toBe(legacy.holdingAmount);
    expect(lt(items, "ltResidencePart").perAsset![0].value).toBe(legacy.residenceAmount);
    expect(lt(items, "ltResidencePart").value).toBe(0);
  });

  it("분리 자산이 없는 집계는 종전 합계 경로 그대로(회귀 0)", () => {
    const plain = aggOf([plainLand(), { ...plainLand(), propertyId: "np3", propertyLabel: "건3" }]);
    const items = itemsOf(plain);
    const total = plain.totalLongTermHoldingDeduction;
    expect(lt(items, "ltHoldingPart").value).toBe(total);
    expect(lt(items, "ltHoldingPart").formula).not.toContain("자산별 합계");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// OV-4 · F2 — stale 환산 플래그가 파트 echo를 덮지 않는다
// ───────────────────────────────────────────────────────────────────────────
describe("OV-4 F2 — 합산 신고서: 분리 자산은 `filingDisplay.estimatedBase`(레거시 환산 플래그 파생)보다 파트 echo가 우선한다", () => {
  // 별개 취득 ON 전에 고른 자산 단위 환산 플래그가 남은 입력(요청 body에 useEstimatedAcquisition: true가 실제로 도달한다 — 브라우저 확인)
  // AE land_only = 실제 API 변환이 보내는 형태(비소유 건물 파트가 환산 — 취득가액 입력은 비워지지만 엔진은 환산액을 계산한다) · AA는 합성 입력
  for (const [ck, own] of [["AE", "land_only"], ["AA", "land_only"], ["AA", "both"]] as const) {
    it(`${ck} + stale useEstimatedAcquisition · ${own}`, () => {
      const e = ownedModel(SCN_N, COMBOS[ck], own);
      const a = aggOf([splitItem(SCN_N, ck, { selfOwns: own, useEstimatedAcquisition: true }), plainLand()]);
      const p = a.properties[0];
      // 전제 — stale 플래그가 실제로 echo에 도달해 있고, land_only에서는 파트 echo와 값이 다르다
      expect(p.filingDisplay?.estimatedBase).toBeDefined();
      if (own === "land_only") expect(p.filingDisplay!.estimatedBase).not.toBe(p.acquisitionPrice);
      expect(p.splitDetail).toBeDefined();

      const rows = buildAggregateRows(aggregateToFilingResult(a), metaOf(a) as never, formOf()) as unknown as {
        label: string;
        values: Record<string, unknown>;
      }[];
      const cols = Object.keys(rows.find((x) => x.label === "취득가액")!.values).filter((k) => k !== "total");
      const c1 = cols.find((k) => cellOf(rows, "양도가액", k) === e.price)!;
      expect(cellOf(rows, "취득가액", c1), "취득가액 = 소유 파트 echo").toBe(e.acq);
      expect(cellOf(rows, "필요경비", c1)).toBe(e.exp);
      expect(cellOf(rows, "양도가액", c1) - cellOf(rows, "취득가액", c1) - cellOf(rows, "필요경비", c1)).toBe(
        cellOf(rows, "전체 양도차익", c1),
      );
    });
  }

  it("평범한 환산 자산(분리 아님)은 종전대로 estimatedBase를 읽는다 (회귀 0)", () => {
    const est = {
      ...plainLand(),
      useEstimatedAcquisition: true, acquisitionPrice: 0, standardPriceAtAcquisition: 100_000_000,
      standardPriceAtTransfer: 200_000_000, acquisitionMethod: "estimated",
    };
    const a = aggOf([est]);
    expect(a.properties[0].splitDetail).toBeUndefined();
    const rows = buildAggregateRows(aggregateToFilingResult(a), metaOf(a) as never, formOf()) as unknown as {
      label: string;
      values: Record<string, unknown>;
    }[];
    expect(cellOf(rows, "취득가액", "total")).toBe(a.properties[0].filingDisplay!.estimatedBase);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// OV-5 · F6 — 비과세 분리 카드 장특 행 설명
// ───────────────────────────────────────────────────────────────────────────
describe("OV-5 F6 — 비과세 분리 카드의 장특 행에 설명이 붙는다", () => {
  const exempt = run(SCN_X, COMBOS.AE);
  const taxable = run(SCN_N, COMBOS.AE);
  const NOTE = '[data-testid="split-card-exempt-lthd-note"]';

  it("단건 카드 — isExempt면 「비과세 — 장기보유특별공제 없음」, 아니면 없다", () => {
    expect(exempt.isExempt).toBe(true);
    const on = render(createElement(SplitGainDetailSection, { splitDetail: exempt.splitDetail!, isExempt: true }));
    expect(on.container.querySelector(NOTE)!.textContent).toBe("비과세 — 장기보유특별공제 없음");
    cleanup();
    const off = render(createElement(SplitGainDetailSection, { splitDetail: taxable.splitDetail!, isExempt: false }));
    expect(off.container.querySelector(NOTE)).toBeNull();
    cleanup();
    const unset = render(createElement(SplitGainDetailSection, { splitDetail: exempt.splitDetail! }));
    expect(unset.container.querySelector(NOTE), "prop 미전달(구 호출부)은 종전 렌더").toBeNull();
  });

  it("다건 ValuationDetailCards — 건별 isExempt가 카드까지 전달된다", () => {
    const a = aggOf([splitItem(SCN_X, "AE"), plainLand()]);
    const p = a.properties[0];
    expect(p.isExempt).toBe(true);
    const on = render(createElement(ValuationDetailCards, { result: p, transferPrice: p.transferPrice, isExempt: p.isExempt }));
    expect(on.container.querySelector(NOTE)).not.toBeNull();
    cleanup();
    const off = render(createElement(ValuationDetailCards, { result: p, transferPrice: p.transferPrice, isExempt: false }));
    expect(off.container.querySelector(NOTE)).toBeNull();
  });
});
