/**
 * 조특법 §99·§99의3 리뷰 후속 — 겸용 결과 「합산 세액」 섹션이 주택부분 양도소득금액 차감 행과 농어촌특별세 base를 싣는다
 * (브라우저 확인 e2e/nh99-browser-verify-result.spec.ts S2-B·S2-C가 찾은 표시 결함 — 세액은 맞고 표시만 틀렸다).
 *
 * 시료: `nh33-mixed-use-income-deduction-housing.anchor.test.ts`의 A1(§99의3 · 계약 2002.3.1. · 취득 2003.9.1. · 양도 2026.6.1.).
 * 세율표는 mock이라 세액은 정본이 아니다 — 자기일관(표시 항의 합 = 표시 결과)을 본다.
 *  · 합산 양도소득금액 = 주택부분 + 상가부분 − 차감 (표시된 항들로 맞는다)
 *  · 농어촌특별세 = (차감 전 양도소득세 − 차감 후 양도소득세) × 20% (표시된 항들로 맞는다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MixedUseTotalTaxSection } from "@/components/calc/results/mixed-use/MixedUseTotalTaxSection";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const r993 = {
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes" as const,
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};
const run = (reductions: unknown[]) =>
  calcMixed(
    1_100_000_000, D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false, buildingAcquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01"), reductions } as unknown as MixedUseAssetInput,
    makeMockRatesWithHouseEngine(),
  );

afterEach(cleanup);

const num = (s: string) => Number(s.replace(/,/g, ""));
/** 라벨이 정확히 같은 Row의 [값, 산식] 텍스트 */
function rowOf(container: HTMLElement, label: string): { value: string; formula: string } | undefined {
  const span = [...container.querySelectorAll("span")].find((e) => e.textContent === label);
  const wrap = span?.closest("div.space-y-0\\.5") as HTMLElement | null;
  if (!wrap) return undefined;
  const spans = wrap.querySelectorAll("span");
  return { value: spans[1]?.textContent ?? "", formula: wrap.textContent?.replace(label, "").replace(spans[1]?.textContent ?? "", "") ?? "" };
}

describe("겸용 합산 세액 — §99의3 주택부분 차감 행 · 농특세 base (자기일관)", () => {
  const r = run([r993]);
  const ded = r.total.incomeDeduction!;

  it("시료 전제 — 엔진이 차감을 적용했고 세액감면은 0이다", () => {
    expect(ded.appliedId).toBe("new_99_3");
    expect(ded.reducibleIncome).toBeGreaterThan(0);
    expect(r.total.reductionAmount).toBe(0);
    expect(r.total.ruralSurtax).toBe(ded.ruralSurtax);
  });

  it("차감 행이 엔진 값 그대로 있고, 합산 양도소득금액 산식의 항들이 값과 맞는다", () => {
    const { container } = render(<MixedUseTotalTaxSection breakdown={r} open onToggle={() => {}} />);
    const d = rowOf(container, "양도소득금액 차감 (주택부분)");
    expect(d?.value).toBe(`△ ${ded.reducibleIncome.toLocaleString()}`);
    expect(d?.formula).toContain("조세특례제한법 §99의3");
    const agg = rowOf(container, "합산 양도소득금액")!;
    expect(num(agg.value)).toBe(r.total.aggregateIncome);
    const m = agg.formula.match(/주택부분 ([\d,]+) \+ 상가부분 ([\d,]+) - 양도소득금액 차감 ([\d,]+)/);
    expect(m, `산식: ${agg.formula}`).toBeTruthy();
    expect(num(m![1]) + num(m![2]) - num(m![3])).toBe(r.total.aggregateIncome);
  });

  it("농어촌특별세 산식 = (차감 전 − 차감 후 양도소득세) × 20% 이고 값과 맞는다 — 「감면세액 0」이 아니다", () => {
    const { container } = render(<MixedUseTotalTaxSection breakdown={r} open onToggle={() => {}} />);
    const row = rowOf(container, "농어촌특별세")!;
    expect(row.value).toBe(r.total.ruralSurtax.toLocaleString());
    expect(row.formula).not.toContain("감면세액 0");
    const m = row.formula.match(/차감 전 양도소득세 ([\d,]+) - 차감 후 양도소득세 ([\d,]+)\) × 20%/);
    expect(m, `산식: ${row.formula}`).toBeTruthy();
    expect(num(m![2])).toBe(r.total.transferTax); // 차감 후 값 = 같은 섹션 「양도소득세」 행
    expect(Math.floor((num(m![1]) - num(m![2])) * 0.2)).toBe(r.total.ruralSurtax);
  });

  it("차감이 없는 겸용(감면 미선택)은 차감 행이 없고 합산 산식에 「차감」 항이 없다", () => {
    const ctl = run([]);
    const { container } = render(<MixedUseTotalTaxSection breakdown={ctl} open onToggle={() => {}} />);
    expect(rowOf(container, "양도소득금액 차감 (주택부분)")).toBeUndefined();
    expect(rowOf(container, "합산 양도소득금액")!.formula).not.toContain("양도소득금액 차감");
    expect(rowOf(container, "농어촌특별세")).toBeUndefined();
  });
});
