/**
 * anchor — 토지·건물 별개 취득 **결과 표시 정합** 엔진 echo (Phase C · 표시 전용, 세액 불변)
 *
 * 설계: `docs/02-design/features/transfer-split-acq-result-display.engine.design.md` §4
 * 짝: `split-acq-result-display.c.predo.anchor.test.ts` (steps 문구·금액 회귀선·F-1)
 *
 *   T-1  `SplitPartResult` 보유·거주 율·공제액 echo 4필드 (E-1)
 *   T-2  `summarizeSplitGain` 정본 합 (E-2)
 *   T-3  문구 후퇴 가드 — 파트 echo가 없거나 합이 총액과 어긋나면 종전 문구
 *   T-4  12억 안분 1원 경계 — 문구가 「합 = 전체 과세 양도차익」을 단정하지 않는다
 *   T-5  겸용 `MixedUseStep`은 어떤 결과뷰도 렌더하지 않는다(정적 확인)
 *   E-U1 다건·컴패니언 집계의 분리 자산 `acquisitionPrice`·`necessaryExpense`
 *   E-U2 일반건물 카드 `actualSource`
 *   E-U3 `SplitPartResult.lumpDeductionRate`
 *
 * 기대값은 `_helpers/split-acq-display-fixture.ts`의 독립 산식(BigInt 정수 나눗셈)이다 — 엔진 출력 복사가 아니다.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildGainFormula } from "@/lib/tax-engine/transfer-tax-taxable-gain";
import { pushLongTermHoldingSteps } from "@/lib/tax-engine/transfer-tax-lthd-steps";
import {
  summarizeSplitGain,
  buildSplitGainFormula,
  buildSplitLthdFormula,
  buildSplitLthdSubFormulas,
  splitAcqModeLabel,
} from "@/lib/tax-engine/transfer-tax-split-display";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { CalculationStep, TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { D, won, mulDiv, rates, SCN_N, SCN_H, COMBOS, model, run, step, toInput } from "./_helpers/split-acq-display-fixture";

const ALL = Object.entries(COMBOS);

// ═══════════════════════════════════════════════════════════════════════
// T-1 · E-1 — 보유·거주 분해 echo
// ═══════════════════════════════════════════════════════════════════════
describe("T-1 SplitPartResult 보유·거주 분해 echo (E-1)", () => {
  for (const [scnKey, scn] of [["N", SCN_N], ["H", SCN_H]] as const) {
    for (const [key, combo] of ALL) {
      it(`${scnKey}:${key} 파트 율·금액 = 독립 산식 · 보유분 + 거주분 = 파트 공제액`, () => {
        const m = model(scn, combo);
        const sd = run(scn, combo).splitDetail!;
        for (const part of ["land", "building"] as const) {
          const p = sd[part];
          const e = m[part];
          expect(p.holdingDeductionRate, `${part} 보유분 율`).toBe(e.holdPct / 100);
          expect(p.residenceDeductionRate, `${part} 거주분 율`).toBe(e.resPct / 100);
          expect(p.holdingDeductionAmount, `${part} 보유분`).toBe(e.holdAmt);
          expect(p.residenceDeductionAmount, `${part} 거주분`).toBe(e.resAmt);
          expect(p.holdingDeductionAmount! + p.residenceDeductionAmount!).toBe(p.longTermDeduction);
          // 분수 율 = 정수 % ÷ 100 — `0.68 − 0.4` 같은 double 뺄셈이 아니다
          expect(p.residenceDeductionRate).toBe(Math.round(p.longTermRate * 100 - p.holdingDeductionRate! * 100) / 100);
        }
      });
    }
  }

  it("표1(N)은 거주분이 0이고 보유분이 총율이다", () => {
    const sd = run(SCN_N, COMBOS.AE).splitDetail!;
    expect(sd.land.residenceDeductionRate).toBe(0);
    expect(sd.land.residenceDeductionAmount).toBe(0);
    expect(sd.land.holdingDeductionRate).toBe(sd.land.longTermRate);
    expect(sd.land.holdingDeductionAmount).toBe(sd.land.longTermDeduction);
  });

  it("소유자 분리(land_only) — 비소유 파트(건물)는 echo가 없다(undefined)", () => {
    const sd = run(SCN_H, COMBOS.AE, { selfOwns: "land_only" }).splitDetail!;
    expect(sd.land.holdingDeductionAmount).toBeDefined();
    expect(sd.building.holdingDeductionRate).toBeUndefined();
    expect(sd.building.residenceDeductionAmount).toBeUndefined();
  });

  it("보유 3년 미만 파트 — 율 0 · 금액 0", () => {
    const sd = run(SCN_N, COMBOS.AE, { acquisitionDate: D("2024-08-01") }).splitDetail!;
    expect(sd.building.holdingDeductionRate).toBe(0);
    expect(sd.building.residenceDeductionRate).toBe(0);
    expect(sd.building.holdingDeductionAmount).toBe(0);
    expect(sd.building.residenceDeductionAmount).toBe(0);
  });

  it("거주분 금액은 floor(공제액 × 거주% ÷ 총%)이고 보유분이 잔액을 흡수한다 — 1원 경계 (R-10 fixture)", () => {
    const P = 1_500_000_001;
    const landT = mulDiv(P, 450_000_000, 600_000_000);
    const landTaxable = mulDiv(landT - 200_000_001, P - 1_200_000_000, P);
    const ld = mulDiv(landTaxable, 68, 100);
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: P, transferDate: D("2026-07-01"),
        acquisitionDate: D("2019-06-01"), landAcquisitionDate: D("2011-06-01"), acquisitionPrice: 0,
        isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 84,
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: 200_000_001, buildingAcquisitionPrice: 150_000_003,
        landStandardPriceAtTransfer: 450_000_000, buildingStandardPriceAtTransfer: 150_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    const land = r.splitDetail!.land;
    expect(land.longTermDeduction).toBe(ld);
    expect(land.residenceDeductionAmount).toBe(mulDiv(ld, 28, 68));
    expect(land.holdingDeductionAmount).toBe(ld - mulDiv(ld, 28, 68));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-2 · E-2 — summarizeSplitGain
// ═══════════════════════════════════════════════════════════════════════
describe("T-2 summarizeSplitGain — 취득가·필요경비·양도차익 정본 합", () => {
  for (const [key, combo] of ALL) {
    it(`N:${key} 취득가 합(차감분) · 필요경비 합(직접경비 + 개산공제) · 양도차익 합이 독립 산식`, () => {
      const m = model(SCN_N, combo);
      const s = summarizeSplitGain(run(SCN_N, combo).splitDetail!);
      expect(s.transferPrice).toBe(SCN_N.price);
      expect(s.acquisitionDeducted).toBe(m.land.acquisition + m.building.acquisition);
      expect(s.necessaryExpense).toBe(m.land.deduction + m.building.deduction);
      expect(s.gain).toBe(m.transferGain);
      expect(s.transferPrice - s.acquisitionDeducted - s.necessaryExpense).toBe(s.gain);
      expect(s.parts.map((p) => p.key)).toEqual(["land", "building"]);
      expect(s.parts.map((p) => p.mode)).toEqual([combo.land, combo.building]);
    });
  }

  it("§97②2호 단서(swap) 파트는 취득가를 차감하지 않고 필요경비는 직접경비다", () => {
    const r = run(SCN_N, COMBOS.AE, { buildingDirectExpenses: 150_000_000 });
    const s = summarizeSplitGain(r.splitDetail!);
    const b = s.parts[1];
    expect(b.swapApplied).toBe(true);
    expect(b.acquisitionPrice).toBe(112_500_000); // 환산취득가액(입력·산정값)
    expect(b.acquisitionDeducted).toBe(0);
    expect(s.acquisitionDeducted).toBe(200_000_000);
    expect(s.necessaryExpense).toBe(150_000_000);
    expect(s.gain).toBe(550_000_000);
    expect(s.gain).toBe(r.transferGain);
  });

  it("소유자 분리 — 소유 파트만 센다", () => {
    const r = run(SCN_N, COMBOS.AE, { selfOwns: "land_only" });
    const s = summarizeSplitGain(r.splitDetail!);
    expect(s.parts.map((p) => p.key)).toEqual(["land"]);
    expect(s.transferPrice).toBe(675_000_000);
    expect(s.gain).toBe(475_000_000);
    expect(s.gain).toBe(r.transferGain);
    const b = summarizeSplitGain(run(SCN_N, COMBOS.AE, { selfOwns: "building_only" }).splitDetail!);
    expect(b.parts.map((p) => p.key)).toEqual(["building"]);
    expect(b.gain).toBe(111_000_000);
  });

  it("라벨 어휘 — 입력 화면 라디오와 같다 (결정 9)", () => {
    expect(["actual", "estimated", "appraisal", "salesCase"].map((m) => splitAcqModeLabel(m as never))).toEqual([
      "실거래가", "환산취득가", "감정가액", "매매사례가액",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-3 — 문구 후퇴 가드
// ═══════════════════════════════════════════════════════════════════════
describe("T-3 문구 후퇴 가드 — 거짓말보다 종전 문구가 낫다", () => {
  const lthdArgs = (over: { deduction?: number } = {}) => {
    const r = run(SCN_H, COMBOS.AE);
    const steps: CalculationStep[] = [];
    pushLongTermHoldingSteps({
      steps,
      taxableGain: r.taxableGain,
      holdingPeriod: { years: 7, months: 1 },
      longTermHoldingRate: 0,
      longTermHoldingDeduction: over.deduction ?? r.longTermHoldingDeduction,
      residenceYearsForStep: 7,
      table2ResidenceYearsForStep: 7,
      meetsTable2Residence: true,
      isOneHousehold: true,
      householdHousingCount: 1,
      lthd982Applied: false,
      lthdExclusionReason: undefined,
      transferDate: D("2026-07-01"),
      splitDetail: r.splitDetail,
    });
    return { r, steps };
  };

  it("가드 통과 — 파트별 문구와 파트 합 sub-step", () => {
    const { r, steps } = lthdArgs();
    const f = steps.find((s) => s.label === "장기보유특별공제")!.formula;
    expect(f).toContain("토지분");
    expect(f).toContain("건물분");
    expect(steps.find((s) => s.label === "보유 기간분 장특")!.amount).toBe(model(SCN_H, COMBOS.AE).holdTotal);
    expect(r.longTermHoldingDeduction).toBe(model(SCN_H, COMBOS.AE).ltd);
  });

  it("Σ 파트 공제액 ≠ 확정 총액(§98의2 특칙 재할당 등) → 종전 문구·종전 sub-step 산식으로 후퇴", () => {
    const { r, steps } = lthdArgs({ deduction: 153_632_001 }); // 실제 153,632,000 + 1
    expect(r.longTermHoldingDeduction).toBe(153_632_000);
    const main = steps.find((s) => s.label === "장기보유특별공제")!;
    expect(main.formula).not.toContain("토지분");
    expect(main.formula).toContain("보유기간 7년 1개월"); // 종전 형식 꼬리
    const hold = steps.find((s) => s.label === "보유 기간분 장특")!;
    expect(hold.formula, "종전 sub-step은 총액 × 보유% / 총% 형식").toContain(" / ");
    expect(hold.formula).not.toContain("토지분");
  });

  it("파트 echo가 없으면(구 resultData·소유 파트 누락) 두 leaf 모두 null", () => {
    const r = run(SCN_H, COMBOS.AE);
    const base = { longTermHoldingDeduction: r.longTermHoldingDeduction, isTable2: true, singleAxis: false, residenceYears: 7 };
    // 4필드 각각이 빠져도 후퇴한다 — 한 필드만 보는 가드는 나머지 셋의 누락을 놓친다
    for (const field of ["holdingDeductionRate", "residenceDeductionRate", "holdingDeductionAmount", "residenceDeductionAmount"] as const) {
      for (const part of ["land", "building"] as const) {
        const sd = structuredClone(r.splitDetail!);
        delete sd[part][field];
        expect(buildSplitLthdFormula({ ...base, sd }), `${part}.${field} 누락`).toBeNull();
        expect(buildSplitLthdSubFormulas({ ...base, sd }), `${part}.${field} 누락`).toBeNull();
      }
    }
    // 정상이면 둘 다 값이 있다
    const ok = { ...base, sd: r.splitDetail! };
    expect(buildSplitLthdFormula(ok)).not.toBeNull();
    expect(buildSplitLthdSubFormulas(ok)).not.toBeNull();
  });

  it("양도차익 문구 — 파트 모드가 없으면(구 결과) null이라 buildGainFormula가 종전 분기로 후퇴한다", () => {
    const r = run(SCN_N, COMBOS.AE);
    const sd = structuredClone(r.splitDetail!);
    delete sd.land.acqMode;
    expect(buildSplitGainFormula(sd)).toBeNull();
    const f = buildGainFormula({
      swapApplied: false, useEstimatedAcquisition: false, transferPrice: SCN_N.price,
      acquisitionPrice: 0, estimatedBase: 0, appliedExpenses: 0, splitDetail: sd,
    });
    expect(f).toBe(`양도가(${won(SCN_N.price)}) - 취득가(0) - 경비(0)`);
  });

  it("양도차익 문구 — 항등식이 깨진 파트 값(합 불일치)이면 null", () => {
    const r = run(SCN_N, COMBOS.AE);
    const sd = structuredClone(r.splitDetail!);
    sd.land.gain += 1;
    expect(buildSplitGainFormula(sd)).toBeNull();
  });

  it("비-split 단건은 종전 문구가 한 글자도 바뀌지 않는다", () => {
    const f = buildGainFormula({
      swapApplied: false, useEstimatedAcquisition: false, transferPrice: 900_000_000,
      acquisitionPrice: 500_000_000, estimatedBase: 0, appliedExpenses: 3_000_000,
    });
    expect(f).toBe("양도가(900,000,000) - 취득가(500,000,000) - 경비(3,000,000)");
    const est = buildGainFormula({
      swapApplied: false, useEstimatedAcquisition: true, transferPrice: 900_000_000,
      acquisitionPrice: 0, estimatedBase: 400_000_000, appliedExpenses: 3_000_000,
    });
    expect(est).toBe("양도가(900,000,000) - 취득가(환산 400,000,000) - 경비(개산공제 3,000,000)");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-4 — 12억 안분 1원 경계
// ═══════════════════════════════════════════════════════════════════════
describe("T-4 문구는 「파트 합 = 전체 과세 양도차익」을 단정하지 않는다 (R-10 fixture)", () => {
  it("파트별 `과세 양도차익 × 공제율 = 공제액`만 적고, 합계 등식·전체 taxableGain을 적지 않는다", () => {
    const P = 1_500_000_001;
    const landT = mulDiv(P, 450_000_000, 600_000_000);
    const bldT = P - landT;
    const landTaxable = mulDiv(landT - 200_000_001, P - 1_200_000_000, P);
    const bldTaxable = mulDiv(bldT - 150_000_003, P - 1_200_000_000, P);
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: P, transferDate: D("2026-07-01"),
        acquisitionDate: D("2019-06-01"), landAcquisitionDate: D("2011-06-01"), acquisitionPrice: 0,
        isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 84,
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: 200_000_001, buildingAcquisitionPrice: 150_000_003,
        landStandardPriceAtTransfer: 450_000_000, buildingStandardPriceAtTransfer: 150_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(landTaxable + bldTaxable).toBe(229_999_999); // 전체 taxableGain 230,000,000과 1원 다르다
    expect(r.taxableGain).toBe(230_000_000);
    const f = step(r, "장기보유특별공제")!.formula;
    expect(f).toBe(
      `토지분 ${won(landTaxable)} × 68% = ${won(mulDiv(landTaxable, 68, 100))} (보유 15년×4%=40% + 거주 7년×4%=28%)`
        + ` + 건물분 ${won(bldTaxable)} × 56% = ${won(mulDiv(bldTaxable, 56, 100))} (보유 7년×4%=28% + 거주 7년×4%=28%)`,
    );
    expect(f).not.toContain(won(r.taxableGain));
    expect(f).not.toContain(won(landTaxable + bldTaxable));
    expect(step(r, "장기보유특별공제")!.amount).toBe(r.longTermHoldingDeduction);
  });
});

describe("T-4b 새 문구는 `/`·`÷`를 쓰지 않는다 — FormulaText가 `숫자 / 숫자`를 분수로 치환한다", () => {
  for (const [scnKey, scn] of [["N", SCN_N], ["H", SCN_H]] as const) {
    for (const [key, combo] of ALL) {
      it(`${scnKey}:${key} 양도차익·장특·보유분·거주분 문구`, () => {
        const r = run(scn, combo);
        for (const label of ["양도차익 계산", "장기보유특별공제", "보유 기간분 장특", "거주 기간분 장특"]) {
          const st = step(r, label);
          if (!st) continue; // 표1은 sub-step이 없다
          expect(st.formula, `${label} 문구`).not.toMatch(/[/÷]/);
        }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// T-5 — 겸용 MixedUseStep 미렌더(정적 확인)
// ═══════════════════════════════════════════════════════════════════════
describe("T-5 겸용 MixedUseStep은 어떤 결과뷰도 렌더하지 않는다 (Q-C6 — 보류의 전제)", () => {
  it("어댑터가 steps: []를 내려 보낸다 — 렌더하기 시작하면 라벨·율 문구를 같은 규격으로 정정해야 한다", () => {
    const src = readFileSync("components/calc/results/mixed-use/MixedUseResultCardAdapter.ts", "utf8");
    expect(src).toMatch(/^\s*steps:\s*\[\],/m);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E-U1 — 다건·컴패니언 집계의 분리 자산 취득가액·필요경비
// ═══════════════════════════════════════════════════════════════════════
describe("E-U1 집계 echo — 분리 자산 acquisitionPrice = 소유 파트의 차감 취득가 합, necessaryExpense = 직접경비 + 개산공제", () => {
  const plainLand = (id: string): TransferTaxItemInput =>
    ({
      ...(baseTransferInput() as unknown as TransferTaxItemInput),
      propertyId: id, propertyLabel: id,
      propertyType: "land",
      transferPrice: 300_000_000, acquisitionPrice: 100_000_000,
      transferDate: D("2026-07-01"), acquisitionDate: D("2015-01-01"),
      isOneHousehold: false, householdHousingCount: 2,
    }) as TransferTaxItemInput;
  const splitItem = (s: typeof SCN_N, c: (typeof COMBOS)[string], over: Partial<TransferTaxInput> = {}) =>
    ({ ...(toInput(s, c, over) as unknown as TransferTaxItemInput), propertyId: "S", propertyLabel: "S" }) as TransferTaxItemInput;
  const aggregate = (items: TransferTaxItemInput[]) =>
    calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: items }, rates);

  for (const [key, combo] of ALL) {
    it(`N:${key} 취득 = 파트 합 · 필요경비 = 개산공제 합 · 양도가 − 취득 − 필요경비 = 양도차익`, () => {
      const m = model(SCN_N, combo);
      const agg = aggregate([splitItem(SCN_N, combo), plainLand("P")]);
      const p = agg.properties.find((x) => x.propertyId === "S")!;
      expect(p.acquisitionPrice).toBe(m.land.acquisition + m.building.acquisition);
      expect(p.necessaryExpense).toBe(m.land.deduction + m.building.deduction);
      expect(p.transferGain).toBe(m.transferGain);
      expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
      // 평범한 자산은 종전 축 그대로
      const plain = agg.properties.find((x) => x.propertyId === "P")!;
      expect(plain.acquisitionPrice).toBe(100_000_000);
      expect(plain.transferPrice - plain.acquisitionPrice - plain.necessaryExpense).toBe(plain.transferGain);
    });
  }

  it("실가/실가 + 자본적지출 — 필요경비는 직접경비다(취득가가 섞이지 않는다)", () => {
    const agg = aggregate([splitItem(SCN_N, COMBOS.AA, { landDirectExpenses: 5_000_000, buildingDirectExpenses: 2_000_000 })]);
    const p = agg.properties[0];
    expect(p.acquisitionPrice).toBe(350_000_000);
    expect(p.necessaryExpense).toBe(7_000_000);
    expect(p.transferGain).toBe(900_000_000 - 350_000_000 - 7_000_000);
  });

  it("§97②2호 단서(swap) — 취득가액 0 + 필요경비 = 직접경비 (swap 파트는 취득가 불차감)", () => {
    const agg = aggregate([splitItem(SCN_N, COMBOS.AE, { buildingDirectExpenses: 150_000_000 })]);
    const p = agg.properties[0];
    expect(p.acquisitionPrice, "토지 실거래가만 — 건물 swap 파트 환산취득가액은 차감되지 않는다").toBe(200_000_000);
    expect(p.necessaryExpense).toBe(150_000_000);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
    expect(p.transferGain).toBe(550_000_000);
  });

  it("swap 파트만 있는 분리 — 두 파트 모두 swap이면 취득가액 0", () => {
    const agg = aggregate([
      splitItem(SCN_N, COMBOS.EE, { landDirectExpenses: 400_000_000, buildingDirectExpenses: 150_000_000 }),
    ]);
    const p = agg.properties[0];
    expect(p.acquisitionPrice).toBe(0);
    expect(p.necessaryExpense).toBe(550_000_000);
    expect(p.transferGain).toBe(350_000_000);
  });

  it("소유자 분리(land_only) — 본인 파트만: 취득 200,000,000 · 필요경비 0 (비소유 파트 양도가가 섞이지 않는다)", () => {
    const agg = aggregate([splitItem(SCN_N, COMBOS.AE, { selfOwns: "land_only" })]);
    const p = agg.properties[0];
    expect(p.acquisitionPrice).toBe(200_000_000);
    expect(p.necessaryExpense).toBe(0);
    expect(p.transferGain).toBe(475_000_000);
  });

  it("세액 불변 — 집계 echo 정정이 과세표준·세액에 닿지 않는다(단건 엔진 양도차익·장특과 일치)", () => {
    const combo = COMBOS.EE;
    const single = run(SCN_N, combo);
    const agg = aggregate([splitItem(SCN_N, combo)]);
    const p = agg.properties[0];
    expect(p.transferGain).toBe(single.transferGain);
    expect(p.longTermHoldingDeduction).toBe(single.longTermHoldingDeduction);
    expect(p.splitDetail).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E-U2 — 일반건물 카드 actualSource
// ═══════════════════════════════════════════════════════════════════════
describe("E-U2 일반건물 assetCards[].actualSource — 파트 직접 입력 vs 일괄 총액 안분", () => {
  function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
    return {
      ...makeDefaultAsset(1),
      assetKind: "general_building",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      landAcquisitionDate: "2005-06-01",
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      gbLandArea: "85",
      gbBuildingArea: "180.96",
      gbBuildingFootprintArea: "180.96",
      gbTransferLandPricePerSqm: "10830000",
      gbTransferBuildingValue: "20629440",
      gbAcqLandPricePerSqm: "2800000",
      gbAcqBuildingValue: "28144700",
      gbZoneType: "commercial",
      actualSalePrice: "2000000000",
      ...over,
    } as AssetForm;
  }
  function cards(asset: AssetForm, bundledAcq: number) {
    const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
    const result = dispatchGeneralBuilding(
      payload, 2_000_000_000, new Date("2026-02-16"), new Date(asset.acquisitionDate),
      bundledAcq, 0, 2026, undefined, [], rates, undefined, undefined, undefined,
    );
    const detail = result.aggregated.generalBuildingValuationDetail as unknown as {
      assetCards: Array<{ propertyId: string; acquisitionMode?: string; actualSource?: string; acquisitionPrice: number }>;
    };
    return Object.fromEntries(detail.assetCards.map((c) => [c.propertyId, c]));
  }

  const both = gbAsset({ landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "100000000" } as Partial<AssetForm>);

  it("실거래가/실거래가 — 파트 직접 입력(part_input)", () => {
    const c = cards(both, 0);
    expect(c.land.acquisitionMode).toBe("actual");
    expect(c.land.actualSource).toBe("part_input");
    expect(c.building.actualSource).toBe("part_input");
  });

  it("실거래가/실거래가 + 숨은 자산 단위 총액(stale 999,999,999) — 여전히 part_input (bundledActualAcquisitionPrice로 가르면 틀린다)", () => {
    const c = cards(both, 999_999_999);
    expect(c.land.actualSource).toBe("part_input");
    expect(c.land.acquisitionPrice).toBe(300_000_000);
    expect(c.building.actualSource).toBe("part_input");
  });

  it("같은 취득일 일괄 실거래가 총액 안분(사례 35) — bundled_apportion", () => {
    const bundled = gbAsset({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
    } as Partial<AssetForm>);
    const c = cards(bundled, 700_000_000);
    expect(c.land.acquisitionMode).toBe("actual");
    expect(c.land.actualSource).toBe("bundled_apportion");
    expect(c.building.actualSource).toBe("bundled_apportion");
  });

  it("실거래가/환산 혼합(환산 경로) — 실가 파트만 part_input, 환산 파트는 없다", () => {
    const mixed = gbAsset({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "300000000",
    } as Partial<AssetForm>);
    const c = cards(mixed, 0);
    expect(c.land.acquisitionMode).toBe("actual");
    expect(c.land.actualSource).toBe("part_input");
    expect(c.building.acquisitionMode).toBe("estimated");
    expect(c.building.actualSource).toBeUndefined();
  });

  it("환산/실거래가 혼합(환산 경로) — 건물 카드가 part_input, 환산 토지는 없다", () => {
    const mixed = gbAsset({
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
      buildingAcquisitionPrice: "100000000",
    } as Partial<AssetForm>);
    const c = cards(mixed, 0);
    expect(c.land.acquisitionMode).toBe("estimated");
    expect(c.land.actualSource).toBeUndefined();
    expect(c.building.acquisitionMode).toBe("actual");
    expect(c.building.actualSource).toBe("part_input");
  });

  it("비사업용 초과로 토지 카드가 둘로 갈려도(사업용·초과분) 실가 파트 echo가 양쪽에 실린다", () => {
    const split = gbAsset({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "300000000",
      gbBuildingFootprintArea: "20",
    } as Partial<AssetForm>);
    const c = cards(split, 0);
    expect(Object.keys(c).sort()).toEqual(["building", "land_business", "land_nbl"]);
    expect(c.land_business.actualSource).toBe("part_input");
    expect(c.land_nbl.actualSource).toBe("part_input");
  });

  it("무허가 건축물 — 토지 전체가 비사업용(카드 1장)이어도 실가 파트 echo가 실린다", () => {
    const whole = gbAsset({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "300000000",
      gbUnapprovedBuilding: true,
    } as Partial<AssetForm>);
    const c = cards(whole, 0);
    expect(Object.keys(c).sort()).toEqual(["building", "land_nbl"]);
    expect(c.land_nbl.actualSource).toBe("part_input");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E-U3 — 개산공제 적용률 echo
// ═══════════════════════════════════════════════════════════════════════
describe("E-U3 SplitPartResult.lumpDeductionRate — 개산공제에 실제 적용한 율", () => {
  it("일반 등기 자산 — 환산 파트 3% · 실거래가 파트는 없다", () => {
    const sd = run(SCN_N, COMBOS.AE).splitDetail!;
    expect(sd.land.lumpDeductionRate).toBeUndefined(); // 실거래가 파트 — 개산공제 base도 없다
    expect(sd.building.lumpDeductionRate).toBe(0.03);
    expect(sd.building.appraisalDeduction).toBe(mulDiv(SCN_N.stdA[1], 3, 100));
  });

  it("미등기양도 — 0.3%(3/1000) · 표시된 개산공제를 그 율로 만든다", () => {
    const r = run(SCN_N, COMBOS.AE, { isUnregistered: true });
    const b = r.splitDetail!.building;
    expect(b.lumpDeductionRate).toBe(0.003);
    expect(b.lumpDeductionBase).toBe(SCN_N.stdA[1]);
    expect(b.appraisalDeduction).toBe(mulDiv(SCN_N.stdA[1], 3, 1000)); // 150,000 — 「× 3%」면 1,500,000
  });

  it("감정·매매사례 파트도 개산공제 파트다", () => {
    const sd = run(SCN_N, COMBOS.PA).splitDetail!; // 토지 감정 · 건물 실가
    expect(sd.land.lumpDeductionRate).toBe(0.03);
    expect(sd.building.lumpDeductionRate).toBeUndefined();
  });
});
