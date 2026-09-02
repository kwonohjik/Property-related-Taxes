// D10-02 · CB-04 · CB-07 anchor — 다필지(소령 §166) 조기반환 분기의 하류 단계 누락
//
// `transfer-tax.ts`의 다필지 조기 반환은 정상경로 STEP 8.5(§133 5년 누적 한도)·
// STEP 8.8(농어촌특별세)·상세 echo를 **통째로 건너뛰었다**. 조기반환 분기가 하류 단계를
// 건너뛰는 이 저장소의 반복 실패 패턴이다(memory `feedback_early_return_branch_skips_pipeline_stages`).
//
// **CB-04 — §133 5년 누적 한도 (조특법 §133①2호나목 · §133②2호)**
//   evaluator 내부 캡은 **연간 한도뿐**이다(§77 2억 · §69 1억). `applyReductionStatutoryCap`을
//   부르지 않으면 사용자가 입력한 `priorReductionUsage`가 이 경로에서 **구별력 0**이 된다 —
//   같은 입력을 단필지로 넣으면 깎이는데 다필지면 안 깎이는 dual-truth였다.
//   형제 4경로(finalize · redevelopment · rental-housing-step · mixed-use)는 모두 부른다.
//
// **D10-02 — 농어촌특별세 (농어촌특별세법 §5①1호 「감면세액 × 100분의 20」)**
//   `grep -c ruralSurtax` → 0이었다. 비과세는 열거주의이고(농특세령 §4①1호) §69는 무조건
//   비과세, §77은 「직접 경작한 토지」 조건부, 그 밖은 과세다.
//   ⚠️ `TransferTaxResult.ruralSurtax`가 optional이라 타입체크로는 잡히지 않는 침묵 누락이었다.
//
// **CB-07 — 감면 상세 echo**
//   `calcReductions`가 낸 §77의2(대토보상)·§77의3(개발제한구역)·§97 시리즈·하이브리드 상세를
//   결과에 싣지 않아, 세액은 반영되는데 결과 카드의 근거가 사라졌다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 2필지 토지 — 면적 안분(§166). 단필지 대조군은 `parcels`만 뺀다. */
const PARCELS: TransferTaxInput["parcels"] = [
  {
    id: "p1",
    transferArea: 500,
    acquisitionArea: 500,
    acquisitionDate: new Date("2010-01-01"),
    acquisitionMethod: "actual",
    acquisitionPrice: 200_000_000,
    expenses: 0,
  },
  {
    id: "p2",
    transferArea: 500,
    acquisitionArea: 500,
    acquisitionDate: new Date("2010-01-01"),
    acquisitionMethod: "actual",
    acquisitionPrice: 200_000_000,
    expenses: 0,
  },
];

/** §77 공익수용 — 현금보상 전액. 「직접 경작」 미선언이라 농특세 과세 대상이다. */
const EXPROPRIATION = {
  type: "public_expropriation" as const,
  cashCompensation: 1_000_000_000,
  bondCompensation: 0,
  businessApprovalDate: new Date("2018-01-01"),
};

function run(over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2020-06-01"),
      useEstimatedAcquisition: false,
      reductions: [EXPROPRIATION],
      parcels: PARCELS,
      ...over,
    }),
    rates,
  );
}

describe("D10-02 다필지 — 농어촌특별세 (감면세액 × 20%)", () => {
  it("D10-02-1: 감면이 있으면 농특세가 계산된다", () => {
    const r = run();
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.ruralSurtax).toBe(Math.floor(r.reductionAmount * 0.2));
  });

  it("D10-02-2: totalTax에 농특세가 더해진다", () => {
    const r = run();
    expect(r.totalTax).toBe(
      r.determinedTax + r.penaltyTax + r.localIncomeTax + (r.ruralSurtax ?? 0),
    );
  });

  it("D10-02-3: 단필지·다필지 모두 「감면세액 × 20%」 규칙을 따른다 (dual-truth 해소)", () => {
    // ⚠️ 두 경로의 «금액»은 같지 않다 — §166 다필지는 필지별 안분·장특공제를 따로 계산해
    //   양도차익 자체가 다르다. 같아야 하는 것은 **규칙**이다(종전에는 다필지만 0이었다).
    const single = run({ parcels: undefined });
    const multi = run();
    expect(single.ruralSurtax).toBe(Math.floor(single.reductionAmount * 0.2));
    expect(multi.ruralSurtax).toBe(Math.floor(multi.reductionAmount * 0.2));
    expect(multi.ruralSurtax).toBeGreaterThan(0);
  });

  it("D10-02-4: 「직접 경작한 토지」면 농특세 0 (농특세령 §4①1호 괄호)", () => {
    const r = run({ isSelfCultivatedExpropriatedLand: true });
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.ruralSurtax ?? 0).toBe(0);
  });

  it("D10-02-5: step에 농특세 근거가 남는다", () => {
    const r = run();
    expect(r.steps.some((s) => s.label.includes("농어촌특별세"))).toBe(true);
  });
});

describe("CB-04 다필지 — §133 5년 누적 한도", () => {
  /** 과거 4개 과세연도에 §77 감면 3억을 이미 받았다 → §133②2호(5년 3억) 소진 */
  const PRIOR = [
    { year: 2016, type: "public_expropriation", amount: 100_000_000 },
    { year: 2017, type: "public_expropriation", amount: 100_000_000 },
    { year: 2018, type: "public_expropriation", amount: 100_000_000 },
  ];

  it("CB-04-1: 5년 한도가 소진되면 감면이 0으로 깎인다", () => {
    const r = run({ priorReductionUsage: PRIOR });
    expect(r.reductionAmount).toBe(0);
  });

  it("CB-04-2: 이력이 없으면 감면이 그대로 남는다 (구별력)", () => {
    const withHistory = run({ priorReductionUsage: PRIOR });
    const without = run();
    expect(without.reductionAmount).toBeGreaterThan(0);
    expect(withHistory.reductionAmount).toBeLessThan(without.reductionAmount);
    expect(withHistory.determinedTax).toBeGreaterThan(without.determinedTax);
  });

  it("CB-04-3: 단필지와 다필지의 감면세액이 같다 (필지 분리로 세액이 갈리지 않는다)", () => {
    const single = run({ parcels: undefined, priorReductionUsage: PRIOR });
    const multi = run({ priorReductionUsage: PRIOR });
    expect(multi.reductionAmount).toBe(single.reductionAmount);
  });

  it("CB-04-4: 캡이 걸리면 결정세액도 그 값으로 계산된다 (표시만 바뀌는 게 아니다)", () => {
    const r = run({ priorReductionUsage: PRIOR });
    expect(r.determinedTax).toBe(r.calculatedTax);
  });
});

describe("CB-07 다필지 — 감면 상세 echo", () => {
  it("CB-07-1: §77의3(개발제한구역) 상세가 결과에 실린다", () => {
    const r = run({
      reductions: [
        {
          type: "gb_designated_land",
          gbBranch: "in_zone",
          designationDate: new Date("2005-06-01"),
          triggerDate: new Date("2020-05-01"),
          residedFromAcqToTrigger: true,
        },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(r.gbDesignatedLandDetail).toBeDefined();
  });

  it("CB-07-2: §77의2(대토보상) 상세가 결과에 실린다", () => {
    const r = run({
      reductions: [
        {
          type: "replacement_land_comp",
          cashCompensation: 0,
          replacementLandComp: 1_000_000_000,
          businessApprovalDate: new Date("2018-01-01"),
        },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(r.replacementLandDetail).toBeDefined();
  });

  it("CB-07-3: §77 상세는 종전에도 실렸다 (회귀 방지)", () => {
    expect(run().publicExpropriationDetail).toBeDefined();
  });
});
