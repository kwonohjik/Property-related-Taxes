/**
 * 조특법 §99·§99의3 리뷰 L18 — 겸용주택 결과의 「전체 엔진 계산 과정」 표(상세명세서 카드 `EngineStepsSubToggle`, 인쇄 시 항상 표시)가
 * 엔진 step을 싣는다. 종전에는 어댑터가 `steps: []`를 넘겨 겸용에서는 표 자체가 없었고, §99·§99의3 주택분 차감 step도 보이지 않았다.
 * 표시 전용 — 세액은 바뀌지 않는다(총 납부세액 고정 + 결과 객체 불변).
 *
 * 시료: `nh33-mixed-use-income-deduction-housing.anchor.test.ts`의 A1(§99의3)·A2(§99). 세율표는 mock이라 세액은 정본이 아니다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import {
  mixedUseStepsToCalculationSteps,
  mixedUseToFilingResult,
} from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const r993 = {
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes" as const,
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};
const r99 = {
  type: "new_99", contractDate99: D("1998-06-01"), acquisitionType99: "from_builder", firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 250_000_000, exclusiveAreaSqm99: 84,
};
const LATE = { buildingAcquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01") };
const EARLY = { buildingAcquisitionDate: D("1999-01-01"), landAcquisitionDate: D("1999-01-01") };
const run = (over: Record<string, unknown>) =>
  calcMixed(
    1_100_000_000, D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false, ...LATE, ...over } as unknown as MixedUseAssetInput,
    makeMockRatesWithHouseEngine(),
  );
type Breakdown = ReturnType<typeof run>;

const DED_ID = "income-deduction-new-housing";
const engineStep = (b: Breakdown, id: string) => b.steps.find((s) => s.id === id)!;

/** 「전체 엔진 계산 과정」 표의 행 — 라벨이 정확히 같은 행의 [산식, 금액] 텍스트 */
function tableRows(container: HTMLElement): { label: string; formula: string; amount: string }[] {
  const section = [...container.querySelectorAll("section")].find((s) => s.textContent?.includes("전체 엔진 계산 과정 ("));
  if (!section) return [];
  return [...section.querySelectorAll("div.py-2\\.5")].map((row) => {
    const ps = row.querySelectorAll("p");
    return { label: ps[0]?.textContent ?? "", formula: ps[1]?.textContent ?? "", amount: ps[ps.length - 1]?.textContent ?? "" };
  });
}
const rowsOf = (b: Breakdown) => tableRows(render(<MixedUseResultCard breakdown={b} />).container);

describe("겸용 「전체 엔진 계산 과정」 표 — §99의3 주택분 차감 step", () => {
  const b = run({ reductions: [r993] });
  const rows = rowsOf(b);
  const ded = engineStep(b, DED_ID);

  it("시료 전제 — 엔진이 차감을 적용했고 총 납부세액은 179,169,333이다(세액 불변 고정)", () => {
    expect(b.total.incomeDeduction?.appliedId).toBe("new_99_3");
    expect(b.total.totalPayable).toBe(179_169_333);
  });

  it("표에 차감 step 행이 엔진 제목·산식·금액 그대로 있다", () => {
    const row = rows.find((r) => r.label === ded.title);
    expect(row, `행: ${rows.map((r) => r.label).join(" | ")}`).toBeTruthy();
    expect(row!.label).toBe("§99의3 신축주택 과세특례 — 양도소득금액 차감 (주택분)");
    expect(row!.formula).toContain("양도소득금액 348,422,915 - 감면 양도소득금액 116,140,971 = 232,281,944");
    expect(row!.amount).toBe("232,281,944");
    expect(row!.amount).toBe((ded.values[0].value as number).toLocaleString());
  });

  it("엔진 logic 순서대로다 — 안분 → 차감 → 합산 세액. 보류 step(주택부분·상가부분·비사업용토지 부분)은 싣지 않는다", () => {
    const labels = rows.map((r) => r.label);
    const at = (t: string) => labels.findIndex((l) => l === t);
    expect(at("양도가액 안분 — 주택 양도가액")).toBeGreaterThanOrEqual(0);
    expect(at("양도가액 안분 — 주택 양도가액")).toBeLessThan(at(ded.title));
    expect(at(ded.title)).toBeLessThan(at("합산 세액"));
    expect(labels).not.toContain("주택부분");
    expect(labels).not.toContain("상가부분");
    expect(labels.some((l) => l.startsWith("비사업용토지 부분"))).toBe(false);
  });

  it("합산 세액 행 금액 = 총 납부세액이고 산식에 합산 양도소득금액·농어촌특별세가 실린다", () => {
    const total = rows.find((r) => r.label === "합산 세액")!;
    expect(total.amount).toBe(b.total.totalPayable.toLocaleString());
    expect(total.formula).toContain("합산 양도소득금액 452,832,192");
    expect(total.formula).toContain("농어촌특별세 (감면세액 × 20%) 9,557,170");
  });

  it("세액 불변 — 어댑터 steps 변환 전후 결과 객체·총세액이 같다", () => {
    const before = JSON.stringify(b);
    const filing = mixedUseToFilingResult(b);
    expect(JSON.stringify(b)).toBe(before);
    expect(filing.totalTax).toBe(b.total.totalPayable);
    expect(filing.steps).toEqual(mixedUseStepsToCalculationSteps(b.steps));
  });

  it("상세명세서 항목(표 이전 부분)은 steps를 비운 때와 같다 — 차감 step이 「양도소득금액」 항목의 산식·근거를 가로채지 않는다", () => {
    const head = (bb: Breakdown) => {
      const c = render(<MixedUseResultCard breakdown={bb} />).container;
      const t = c.querySelector('[data-print-id="detailed-statement"]')?.textContent ?? "";
      cleanup();
      const i = t.indexOf("전체 엔진 계산 과정");
      return i < 0 ? t : t.slice(0, i);
    };
    const emptied = { ...b, steps: [] } as Breakdown;
    expect(head(b)).toBe(head(emptied));
  });
});

describe("겸용 「전체 엔진 계산 과정」 표 — §99 · 짝", () => {
  it("§99(1998 계약 · 1999 취득): 차감 step 행 금액이 엔진 값과 같다", () => {
    const b = run({ ...EARLY, reductions: [r99] });
    const ded = engineStep(b, DED_ID);
    const row = rowsOf(b).find((r) => r.label === ded.title);
    expect(ded.title).toContain("§99 ");
    expect(row?.amount).toBe((ded.values[0].value as number).toLocaleString());
    expect(row?.amount).not.toBe("0");
  });

  it("감면 미선택: 차감 step 행이 없다(표의 나머지 step은 있다)", () => {
    const b = run({});
    const labels = rowsOf(b).map((r) => r.label);
    expect(labels).toContain("양도가액 안분 — 주택 양도가액");
    expect(labels).toContain("합산 세액");
    expect(labels.some((l) => l.includes("양도소득금액 차감"))).toBe(false);
  });

  it("적용 불가(계약일이 §99의3 기간 밖): 「적용 불가」 사유 행은 금액 0이고 총세액은 감면 미선택과 같다", () => {
    const control = run({});
    const b = run({ reductions: [{ ...r993, contractDate993: D("2005-03-01") }] });
    const row = rowsOf(b).find((r) => r.label.includes("적용 불가"));
    expect(row, "적용 불가 행").toBeTruthy();
    expect(row!.amount).toBe("0");
    expect(row!.formula.length).toBeGreaterThan(0);
    expect(b.total.totalPayable).toBe(control.total.totalPayable);
  });
});

describe("mixedUseStepsToCalculationSteps — amount 규칙(단건 관례)", () => {
  it("결과 행이 둘이면(양도가액 안분) 결과 행마다 step이 나뉜다 — 입력 산식은 첫 step에만", () => {
    const b = run({});
    const out = mixedUseStepsToCalculationSteps(b.steps).filter((s) => s.label.startsWith("양도가액 안분"));
    expect(out.map((s) => s.label)).toEqual(["양도가액 안분 — 주택 양도가액", "양도가액 안분 — 상가 양도가액"]);
    expect(out[0].amount).toBe(b.apportionment.housingTransferPrice);
    expect(out[1].amount).toBe(b.apportionment.commercialTransferPrice);
    expect(out[0].formula).toContain("주택비율");
    expect(out[1].formula).toBe("");
  });

  it("문자열 결과(중과 배제)는 amount 0 + 라벨이 산식 — 단건 buildSurchargeExclusionStep과 같다", () => {
    const out = mixedUseStepsToCalculationSteps([
      { id: "surcharge-exclusion-by-reduction", title: "감면주택 다주택 중과 배제", legalBasis: "근거", values: [{ label: "설명 문장", value: "중과 배제", isResult: true }] },
    ]);
    expect(out).toEqual([{ label: "감면주택 다주택 중과 배제", formula: "설명 문장", amount: 0, legalBasis: "근거" }]);
  });
});
