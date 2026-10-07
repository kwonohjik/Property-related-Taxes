/**
 * Pre-Do anchor — Phase C(결과 표시 정합) · UI 측.
 *
 * 설계서: `docs/02-design/features/transfer-split-acq-result-display.ui.design.md`
 * 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.1 H-1 · §2.2 G-4 · §4 Q-F · §6
 *
 * 이 파일은 두 부분이다.
 *
 *  ① **현행 회귀선(활성)** — 2026-10-07 화면 실측(Playwright, E2E_PORT=3134)으로 확인한 현행 동작을 그대로 고정한다.
 *     「결함을 고정한다」는 뜻이다. Do 단계에서 수정이 들어가면 이 블록의 해당 단언이 **의도적으로** 뒤집힌다 —
 *     그때 같은 케이스의 ② 단언(`C_UNSKIP`)이 켜진다. 뒤집지 않고 지우면 형제 안전망이 같이 사라진다
 *     (memory `feedback_shared_assertion_reversal_erases_sibling_net`).
 *  ② **수정 후 기대(skip)** — `redUntilDo`. `C_UNSKIP=1`로 실행하면 현행에서 RED여야 한다(이 작업에서 확인).
 *     Do 단계가 끝나면 `redUntilDo`를 `it`으로 바꾼다.
 *
 * 픽스처 출처: 응답 JSON 값은 실제 `/api/calc/transfer`(single) · `/multi` · bundled 응답을 옮긴 것이다. 손으로 만든 이상적인
 * 값이 아니다(memory `feedback_fixture_default_masks_gate_defect`). GB 픽스처는 응답 `aggregated.generalBuildingValuationDetail`
 * · `aggregated.properties[]`의 해당 필드만 발췌했다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildAcquisitionPriceFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/types/general-building.types";

afterEach(cleanup);

/** 수정 후 기대 — Do 단계에서 `it`으로 교체. `C_UNSKIP=1`이면 현행에서 RED임을 확인하는 데 쓴다. */
const redUntilDo = process.env.C_UNSKIP ? it : it.skip;

const rates = makeMockRates();
type Mode = "actual" | "estimated" | "appraisal" | "salesCase";

/** 화면 실측 시드와 같은 값(주택 · 별개 취득 · 토지 2010-03-15 / 건물 2018-06-01 · 양도 900,000,000). */
function splitInput(land: Mode, building: Mode, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 900_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionPrice: 0,
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2010-03-15"),
    isSeparateAcquisition: true,
    saleSplitMode: "apportioned",
    landAcqMode: land,
    buildingAcqMode: building,
    landAcquisitionPrice: land === "actual" || land === "appraisal" ? 200_000_000 : undefined,
    buildingAcquisitionPrice: building === "actual" || building === "appraisal" ? 150_000_000 : undefined,
    landSalesCaseValue: land === "salesCase" ? 210_000_000 : undefined,
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
    buildingStandardPriceAtAcquisition: 50_000_000,
    landStandardPriceAtTransfer: 300_000_000,
    buildingStandardPriceAtTransfer: 100_000_000,
    isOneHousehold: false,
    householdHousingCount: 2,
    ...over,
  });
}

const FORM = {
  transferDate: "2026-02-16",
  contractTotalPrice: "900000000",
  assets: [{}],
} as unknown as TransferFormData;

type Combo = { name: string; land: Mode; building: Mode; acq: [number, number]; ded: [number, number] };
/**
 * 6조합 — 기대값은 **엔진 `splitDetail`이 낸 값**이다(화면 실측 2026-10-07 응답과 일치: 200M/112.5M 등).
 * `acq`=[토지,건물] 취득가액, `ded`=[토지,건물] 개산공제.
 */
const COMBOS: Combo[] = [
  { name: "실가/실가", land: "actual", building: "actual", acq: [200_000_000, 150_000_000], ded: [0, 0] },
  { name: "실가/환산", land: "actual", building: "estimated", acq: [200_000_000, 112_500_000], ded: [0, 1_500_000] },
  { name: "환산/실가", land: "estimated", building: "actual", acq: [225_000_000, 150_000_000], ded: [3_000_000, 0] },
  { name: "환산/환산", land: "estimated", building: "estimated", acq: [225_000_000, 112_500_000], ded: [3_000_000, 1_500_000] },
  { name: "실가/감정", land: "actual", building: "appraisal", acq: [200_000_000, 150_000_000], ded: [0, 1_500_000] },
  { name: "매매사례/실가", land: "salesCase", building: "actual", acq: [210_000_000, 150_000_000], ded: [3_000_000, 0] },
];

const sum = (a: [number, number]) => a[0] + a[1];

// ───────────────────────────────────────────────────────────────────────────
// ① 현행 — 단건(single) 경로: 응답 플래그 · 상세명세서 · 신고서 표
// ───────────────────────────────────────────────────────────────────────────
describe.each(COMBOS)("[단건] $name — 현행 회귀선", (c) => {
  const result = calculateTransferTax(splitInput(c.land, c.building), rates);

  it("엔진 정본: splitDetail 파트 값 = 기대(화면 실측과 일치)", () => {
    const sp = result.splitDetail!;
    expect(sp.land.acqMode).toBe(c.land);
    expect(sp.building.acqMode).toBe(c.building);
    expect([sp.land.acquisitionPrice, sp.building.acquisitionPrice]).toEqual(c.acq);
    expect([sp.land.appraisalDeduction, sp.building.appraisalDeduction]).toEqual(c.ded);
  });

  it("분기 플래그 후보 실측 — usedEstimatedAcquisition은 항상 false·estimatedBase 부재(G-4의 출처)", () => {
    // 응답에 **실재하지 않는** 신호다. 이 플래그로 분기하면 어떤 조합에서도 환산이 잡히지 않는다.
    expect(result.usedEstimatedAcquisition).toBe(false);
    expect(result.estimatedBase).toBeUndefined();
    // 엔진 result.expenses는 개산공제를 싣지 않는다(직접경비 합만) — 상세명세서 역산이 이것을 읽어서 어긋난다.
    expect(result.expenses).toBe(0);
  });

  it("신고서 표(정본 경로): 합계 취득가액·필요경비 = 파트 합 (`FilingFormTableHelpers.ts` split-2col)", () => {
    const { mode } = deriveColumns(result);
    expect(mode).toBe("split-2col");
    const rows = buildRows(result, mode, FORM, undefined, 900_000_000);
    const val = (label: string) => rows.find((r) => r.label === label)!.values.total;
    expect(val("취득가액")).toBe(sum(c.acq));
    // 필요경비 합계 = 개산공제 합(직접경비 0). 0은 null로 표시될 수 있다.
    expect(Number(val("필요경비") ?? 0)).toBe(sum(c.ded));
  });

  it("상세명세서(현행): 취득가액은 양도가액−양도차익−result.expenses 역산 — 개산공제가 취득가액에 섞인다(H-1)", () => {
    const items = buildStatementItems(result, FORM, undefined, undefined, 900_000_000);
    const acq = items.get("acquisitionPrice")!;
    const exp = items.get("expenses")!;
    // 현행 결함 고정: 취득가액 칸 = 파트 취득가액 합 + 개산공제 합, 필요경비 칸 = 0
    expect(acq.value).toBe(sum(c.acq) + sum(c.ded));
    expect(exp.value).toBe(0);
    // 소제목은 항상 「(실제 거래가액)」 — 환산/감정/매매사례 파트가 있어도
    const { container } = render(createElement("div", null, acq.formula));
    expect(container.textContent).toContain("(실제 거래가액)");
  });

  redUntilDo("상세명세서(수정 후): 취득가액 = 파트 합 · 필요경비 = 개산공제 합 — 신고서 표와 같은 값", () => {
    const items = buildStatementItems(result, FORM, undefined, undefined, 900_000_000);
    expect(items.get("acquisitionPrice")!.value).toBe(sum(c.acq));
    expect(items.get("expenses")!.value).toBe(sum(c.ded));
  });

  redUntilDo("상세명세서(수정 후): 취득가액 산식이 「토지 ○(산정방식) + 건물 ○(산정방식)」 — 「(실제 거래가액)」 거짓 라벨 없음", () => {
    const items = buildStatementItems(result, FORM, undefined, undefined, 900_000_000);
    const { container } = render(createElement("div", null, items.get("acquisitionPrice")!.formula));
    const t = container.textContent ?? "";
    const label: Record<Mode, string> = { actual: "실거래가", estimated: "환산취득가", appraisal: "감정가액", salesCase: "매매사례가액" };
    expect(t).toContain(`토지(${label[c.land]}) ${c.acq[0].toLocaleString()}`);
    expect(t).toContain(`건물(${label[c.building]}) ${c.acq[1].toLocaleString()}`);
    if (c.land !== "actual" || c.building !== "actual") expect(t).not.toContain("(실제 거래가액)");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ① 현행 — 다건·컴패니언(aggregate) 경로: 엔진 echo 자체가 어긋난다
// ───────────────────────────────────────────────────────────────────────────
describe("[다건·컴패니언] 현행 회귀선 — PerPropertyBreakdown echo", () => {
  function aggregate(land: Mode, building: Mode) {
    const item = {
      ...(splitInput(land, building) as unknown as TransferTaxItemInput),
      propertyId: "np1",
      propertyLabel: "건1",
    };
    const plain = {
      ...(baseTransferInput({
        propertyType: "land",
        transferPrice: 300_000_000,
        transferDate: new Date("2026-03-01"),
        acquisitionPrice: 100_000_000,
        acquisitionDate: new Date("2015-01-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
      }) as unknown as TransferTaxItemInput),
      propertyId: "np2",
      propertyLabel: "건2",
    };
    const input = { taxYear: 2026, properties: [item, plain], annualBasicDeductionUsed: 0 } as unknown as AggregateTransferInput;
    return calculateTransferTaxAggregate(input, rates);
  }

  it.each(COMBOS)("$name — 분리 자산의 취득가액=0 · 필요경비=취득가액 합+개산공제 (신고서·명세서 합계가 따라 틀린다)", (c) => {
    const p = aggregate(c.land, c.building).properties[0];
    expect(p.splitDetail).toBeDefined(); // 정본은 echo에 실재한다 — 소비층이 안 읽을 뿐
    // 현행 결함 고정 (실측: 실가/실가도 취득가액 0 · 필요경비 350,000,000)
    expect(p.acquisitionPrice).toBe(0);
    expect(p.necessaryExpense).toBe(sum(c.acq) + sum(c.ded));
  });

  redUntilDo.each(COMBOS)("$name (수정 후) — 취득가액 = 파트 합 · 필요경비 = 개산공제 합 (엔진 echo 정합)", (c) => {
    const p = aggregate(c.land, c.building).properties[0];
    expect(p.acquisitionPrice).toBe(sum(c.acq));
    expect(p.necessaryExpense).toBe(sum(c.ded));
    // 항등식: 양도가액 − 취득가액 − 필요경비 = 양도차익
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ① 현행 — 집계 소제목(G-4): 어댑터가 usedEstimatedAcquisition을 false로 고정한다
// ───────────────────────────────────────────────────────────────────────────
describe("[집계 소제목] G-4 — aggregate 분기는 환산을 못 본다", () => {
  /** `aggregateToFilingResult`(BundledAllocationCard.tsx:68-70)·`breakdownToFilingResult`(MultiTransferPropertyBreakdown.tsx:88)와 같은 상수. */
  const adapterLike = { usedEstimatedAcquisition: false } as never;

  it("현행: 환산 자산이 섞여 있어도 「자산별 실제 거래가액 합계」", () => {
    const heading = buildAcquisitionPriceFormula(adapterLike, true, 0, 0, 0);
    expect(heading).toBe("자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ① 현행 — 일반건물(bundled) 경로: Q-F 거짓 등식 (실응답 발췌 픽스처)
// ───────────────────────────────────────────────────────────────────────────
describe("[일반건물] Q-F — 실가 파트에 환산/안분 산식이 붙는다 (실응답 발췌)", () => {
  /** `aggregated.generalBuildingValuationDetail` 발췌 — 토지 실가 300,000,000 + 건물 환산(응답 2026-10-07). */
  const gbActEst = {
    assetCards: [
      { propertyId: "land", acquisitionPrice: 300_000_000, usedEstimatedAcquisition: false, acquisitionMode: "actual" },
      { propertyId: "building", acquisitionPrice: 5_980_729, usedEstimatedAcquisition: true, acquisitionMode: "estimated" },
    ],
    landStdTotal: 920_550_000,
    buildingStdTotal: 20_629_440,
    acqLandStdTotal: 238_000_000,
    acqBuilding1StdTotal: 2_814_470,
  } as unknown as GeneralBuildingOutput;
  /** 토지 환산 + 건물 실가 400,000,000 */
  const gbEstAct = {
    ...gbActEst,
    assetCards: [
      { propertyId: "land", acquisitionPrice: 505_748_404, usedEstimatedAcquisition: true, acquisitionMode: "estimated" },
      { propertyId: "building", acquisitionPrice: 400_000_000, usedEstimatedAcquisition: false, acquisitionMode: "actual" },
    ],
  } as unknown as GeneralBuildingOutput;
  /** 양쪽 실가 — 응답 `bundledActualAcquisitionPrice: 0`(파트 직접 입력이라 일괄 총액이 없다). */
  const gbActAct = {
    ...gbActEst,
    assetCards: [
      { propertyId: "land", acquisitionPrice: 300_000_000, usedEstimatedAcquisition: false, acquisitionMode: "actual" },
      { propertyId: "building", acquisitionPrice: 400_000_000, usedEstimatedAcquisition: false, acquisitionMode: "actual" },
    ],
    bundledActualAcquisitionPrice: 0,
    bundledActualExpenses: 0,
  } as unknown as GeneralBuildingOutput;
  /** 같은 실가/실가인데 숨은 자산 단위 총액(stale)이 echo에 999,000,000으로 실린 응답 — 「>0이면 안분」 가드는 불충분함을 보인다. */
  const gbActActStale = { ...gbActAct, bundledActualAcquisitionPrice: 999_000_000 } as GeneralBuildingOutput;

  const prop = (id: string, acq: number): PerPropertyBreakdown =>
    ({ propertyId: id, propertyLabel: id, transferPrice: 0, acquisitionPrice: acq, necessaryExpense: 0, capitalExpenditureForDisplay: 0 }) as unknown as PerPropertyBreakdown;
  const withTransfer = (p: PerPropertyBreakdown, t: number) => ({ ...p, transferPrice: t }) as PerPropertyBreakdown;

  it("현행: 실가 토지 300,000,000 옆에 「양도가액 × 취득시 기준시가 ÷ 양도시 기준시가 = 300,000,000」 — 좌변은 505,748,404", () => {
    const f = buildGbAcquisitionFormula(withTransfer(prop("land", 300_000_000), 1_956_162_578), gbActEst, undefined)!;
    expect(f).toContain("1,956,162,578");
    expect(f).toContain("238,000,000");
    expect(f).toContain("= 300,000,000");
    // 산술: 1,956,162,578 × 238,000,000 ÷ 920,550,000 (floor) = 505,748,404 ≠ 300,000,000
    expect(Math.floor((1_956_162_578 * 238_000_000) / 920_550_000)).toBe(505_748_404);
  });

  it("현행: 실가 건물 400,000,000에 환산 산식이 붙는다", () => {
    const f = buildGbAcquisitionFormula(withTransfer(prop("building", 400_000_000), 43_837_422), gbEstAct, undefined)!;
    expect(f).toContain("43,837,422");
    expect(f).toContain("= 400,000,000");
  });

  it("현행: 실가/실가인데 「0 × …」 · 「잔액 보정」 산식(bundledActual 0)", () => {
    const f = buildGbAcquisitionFormula(withTransfer(prop("land", 300_000_000), 1_956_162_578), gbActAct, undefined)!;
    expect(f).toContain("0 ×");
    const fb = buildGbAcquisitionFormula(withTransfer(prop("building", 400_000_000), 43_837_422), gbActAct, undefined)!;
    expect(fb).toContain("잔액 보정");
  });

  it("현행: 숨은 총액(stale 999,000,000)이 echo에 있으면 그 총액으로 안분 산식을 그린다 — echo>0 가드가 불충분한 근거", () => {
    const f = buildGbAcquisitionFormula(withTransfer(prop("land", 300_000_000), 1_956_162_578), gbActActStale, undefined)!;
    expect(f).toContain("999,000,000");
    expect(f).toContain("= 300,000,000");
  });

  redUntilDo("(수정 후) 실가 파트는 환산·안분 산식을 그리지 않고 입력값을 그대로 적는다 — 실가/환산 · 환산/실가", () => {
    const land = buildGbAcquisitionFormula(withTransfer(prop("land", 300_000_000), 1_956_162_578), gbActEst, undefined)!;
    expect(land).toContain("300,000,000");
    expect(land).not.toContain("×");
    expect(land).toContain("실거래가");
    const bld = buildGbAcquisitionFormula(withTransfer(prop("building", 400_000_000), 43_837_422), gbEstAct, undefined)!;
    expect(bld).not.toContain("×");
    expect(bld).toContain("실거래가");
  });

  redUntilDo("(수정 후) 실가/실가 — 「0 ×」·「잔액 보정」 없음", () => {
    const f = buildGbAcquisitionFormula(withTransfer(prop("land", 300_000_000), 1_956_162_578), gbActAct, undefined)!;
    expect(f).not.toContain("0 ×");
    const fb = buildGbAcquisitionFormula(withTransfer(prop("building", 400_000_000), 43_837_422), gbActAct, undefined)!;
    expect(fb).not.toContain("잔액 보정");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ① 현행 — 결과 카드(SplitGainDetailSection): 미등기 개산공제율 하드코딩 (H-6)
// ───────────────────────────────────────────────────────────────────────────
describe("[결과 카드] H-6 — 미등기 split의 개산공제 산식 「× 3%」", () => {
  const result = calculateTransferTax(
    splitInput("actual", "estimated", { isUnregistered: true, landAcquisitionPrice: 200_000_000 }),
    rates,
  );

  it("엔진: 미등기는 개산공제율 0.3% → 건물 개산공제 150,000 (3%라면 1,500,000)", () => {
    expect(result.splitDetail!.building.appraisalDeduction).toBe(150_000);
    expect(result.splitDetail!.building.lumpDeductionBase).toBe(50_000_000);
  });

  it("현행: 카드는 「취득시 기준시가 50,000,000 × 3%」라 적고 값은 150,000 — 산식이 값을 못 만든다", () => {
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: result.splitDetail! }));
    const t = container.textContent ?? "";
    expect(t).toContain("취득시 기준시가 50,000,000 × 3%");
    expect(t).toContain("150,000");
  });

  redUntilDo("(수정 후) 카드의 율 표기가 엔진이 적용한 율(0.3%)이다", () => {
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: result.splitDetail! }));
    const t = container.textContent ?? "";
    expect(t).toContain("취득시 기준시가 50,000,000 × 0.3%");
    expect(t).not.toContain("× 3%");
  });
});
