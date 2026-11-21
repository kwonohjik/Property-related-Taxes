/**
 * anchor — R-c02-01: 미등기 겸용주택의 결과 카드·신고서·상세명세서 **산출세액**은 엔진이 채택한 70% 세액이다.
 *
 * 종전 결함: `adoptedCalculatedTax`가 `rateBasis === "clause2"`만 `transferTax`를 쓰고 나머지는 전부
 * `taxByBasicRate`(합산 누진 — 미등기에서는 **채택되지 않은 값**)를 돌려줬다. 엔진은 미등기면
 * `transferTax = 과세표준 × 70%`(소득세법 §104①10호)로 두지만 누진공제 echo는 0으로 바꾸지 않는다.
 * 그래서 산출세액 칸이 기본세율 세액으로 찍혀 결정세액보다 작았고, 산식에는 쓰이지 않은 누진공제가 들어갔다.
 *
 * 시료: 리뷰 probe와 같다 — CASE14(23억 · 2022-02-16 양도) + `isUnregistered: true` · mock 세율.
 * 리뷰 실측: transferTax 1,207,672,225 · taxByBasicRate 710,420,716 · 종전 표시 710,420,716.
 * 단언은 하드코딩 대신 엔진 값과의 일치로 둔다(픽스처가 바뀌어도 결함이 가려지지 않게 시료 전제를 먼저 확인).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { MixedUseTotalTaxSection } from "@/components/calc/results/mixed-use/MixedUseTotalTaxSection";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const run = (isUnregistered: boolean): MixedUseGainBreakdown =>
  calc(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, { ...mixedUseCase14(), isUnregistered } as MixedUseAssetInput, makeMockRates());

function formData() {
  const fd = createDefaultTransferFormData();
  return { ...fd, contractTotalPrice: String(CASE14_TRANSFER_PRICE), transferDate: "2022-02-16" };
}

function filingCalculatedTax(b: MixedUseGainBreakdown): number | null {
  const result = mixedUseToFilingResult(b);
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, formData(), undefined, CASE14_TRANSFER_PRICE);
  const row = rows.find((x) => x.label.trim() === "산출세액");
  if (!row) throw new Error("산출세액 행 없음");
  const v = row.values.total;
  return typeof v === "number" ? v : null;
}

const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
function rowOf(container: HTMLElement, label: string): { value: string; formula: string } | undefined {
  const span = [...container.querySelectorAll("span")].find((e) => e.textContent === label);
  const wrap = span?.closest("div.space-y-0\\.5") as HTMLElement | null;
  if (!wrap) return undefined;
  const spans = wrap.querySelectorAll("span");
  return { value: spans[1]?.textContent ?? "", formula: wrap.textContent?.replace(label, "").replace(spans[1]?.textContent ?? "", "") ?? "" };
}

describe("R-c02-01 미등기 겸용 — 산출세액은 70% 세액", () => {
  const b = run(true);
  const t = b.total;

  it("시료 전제 — 엔진은 70% 단일세율을 채택했고 그 값은 기본세율 세액과 다르다", () => {
    expect(t.rateBasis).toBe("unregistered");
    expect(t.appliedRate).toBe(0.7);
    expect(t.transferTax).toBe(Math.floor(t.taxBase * 0.7));
    expect(t.transferTax).not.toBe(t.taxByBasicRate);
    expect(t.nonBusinessSurcharge).toBe(0);
  });

  it("어댑터 — 산출세액 = 엔진 transferTax, 누진공제 = 0, 산출세액 − 감면세액 = 결정세액", () => {
    const r = mixedUseToFilingResult(b);
    expect(r.calculatedTax).toBe(t.transferTax);
    expect(r.progressiveDeduction).toBe(0);
    expect(r.calculatedTax - r.reductionAmount).toBe(r.determinedTax);
  });

  it("신고서(별지 제84호) 산출세액 칸 = 엔진 transferTax", () => {
    expect(filingCalculatedTax(b)).toBe(t.transferTax);
  });

  it("상세명세서 산출세액 — 값은 엔진 세액이고 산식에 쓰이지 않은 누진공제가 없다", () => {
    const fd = formData();
    const items = buildStatementItems(mixedUseToFilingResult(b), fd, fd.assets[0], undefined, undefined);
    const item = items.get("calculatedTax")!;
    expect(item.value).toBe(t.transferTax);
    expect(item.formula).toContain("누진공제 0");
    expect(item.formula).not.toContain(t.progressiveDeduction.toLocaleString());
  });

  it("결과 카드 「합산 세액」 — 미등기 70% 라벨·산식, 양도소득세 산식과 자기일관", () => {
    const { container } = render(<MixedUseTotalTaxSection breakdown={b} open onToggle={() => {}} />);
    expect(rowOf(container, "산출세액 (기본세율)")).toBeUndefined();
    const calcRow = rowOf(container, "산출세액 (미등기 70%)");
    expect(calcRow, "미등기 라벨 행 없음").toBeDefined();
    expect(num(calcRow!.value)).toBe(t.transferTax);
    expect(calcRow!.formula).toContain(`과세표준 ${t.taxBase.toLocaleString()} × 70%`);
    expect(calcRow!.formula).toContain("소득세법 §104 ①10호");
    expect(calcRow!.formula).not.toContain(t.progressiveDeduction.toLocaleString());
    const taxRow = rowOf(container, "양도소득세")!;
    expect(num(taxRow.value)).toBe(t.transferTax);
    expect(taxRow.formula).toBe(`산출세액 ${t.transferTax.toLocaleString()}`);
  });
});

describe("R-c02-01 대조군 — 등기 겸용은 종전 그대로(합산 누진 1호)", () => {
  const b = run(false);
  const t = b.total;

  it("rateBasis progressive · 산출세액 = taxByBasicRate · 누진공제 echo 유지 · 신고서 칸 일치", () => {
    expect(t.rateBasis).toBe("progressive");
    const r = mixedUseToFilingResult(b);
    expect(r.calculatedTax).toBe(t.taxByBasicRate);
    expect(r.progressiveDeduction).toBe(t.progressiveDeduction);
    expect(filingCalculatedTax(b)).toBe(t.taxByBasicRate);
    const { container } = render(<MixedUseTotalTaxSection breakdown={b} open onToggle={() => {}} />);
    expect(rowOf(container, "산출세액 (기본세율)")).toBeDefined();
  });
});
