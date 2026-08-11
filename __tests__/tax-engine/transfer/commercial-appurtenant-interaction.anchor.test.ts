/**
 * anchor — CB 부수토지 초과분 판정 × 기존 CB 분기 상호작용 (Phase E)
 *
 * 계획서: `docs/02-design/features/commercial-building-appurtenant-land-nbl.plan.md`
 *   케이스 C-12(§97②2호 swap) · C-13(공익수용 §164⑨)
 *
 * ## 왜 별도 anchor가 필요한가
 *
 * 부수토지 판정은 STEP 0.62(`transfer-tax.ts:190`)에서 `isNonBusinessLand`·
 * `nonBusinessLandAreaRatio`를 주입한다. 그런데 CB 환산 STEP 0.35(`:249`)는 **그보다 나중에**
 * 실행되며 `applyCommercialBuildingStep`이 입력을 통째로 재구성한다
 * (`{...input, useEstimatedAcquisition:false, acquisitionPrice, expenses, ...}`).
 *
 * spread가 앞서 주입한 두 값을 보존하지 **않으면** 중과가 조용히 사라진다 —
 * 에러 없이 세액만 낮아지는 실패라 여기서 값으로 고정한다.
 *
 * 두 축은 서로 독립이어야 한다:
 *   · swap·수용 특례 → **양도차익**(필요경비·환산 분모)에 작용
 *   · 부수토지 초과분 → **세율**(+10%p를 초과 비율만큼)에 작용
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 상업지역 3배 · 전체 대지 1,200㎡ · 전체 바닥 200㎡ → 기준면적 600㎡ · 초과비율 1/2. */
const APPURTENANT = {
  totalLandArea: 1200,
  totalBuildingFootprintArea: 200,
  zoneType: "commercial",
};

/**
 * 상가 환산 — 연면적 200㎡, 양도 10억, **2013-06-01** 취득 → 2020-06-01 양도(7년).
 *
 * ⚠️ 취득일이 **2009.3.16~2012.12.31**이면 부칙 §9270호 §14①에 따라 비사업용 +10%p가
 * **배제**된다(`transfer-tax-rate-calc.ts:356` `isCrisisAcqExempt`). 기존 swap·수용 anchor는
 * 2010-06-01 취득을 쓰므로 그대로 가져오면 중과가 걸리지 않아 이 상호작용을 검증할 수 없다.
 * ⇒ 취득일을 배제 구간 밖으로 옮겼다(기존 anchor의 절대 기대값은 재사용하지 않고 상대 비교만 한다).
 */
function cb(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2013-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "general",
    commercialBuildingValuation: {
      isPreDisclosure: false,
      exclusiveArea: 150,
      commonArea: 50,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtAcquisition: 1_000_000,
    },
    ...overrides,
  } as Partial<TransferTaxInput>);
}

const SWAP = { capitalExpenditure: 450_000_000, transferExpense: 10_000_000 };
const EXPROPRIATION = {
  transferCause: "public_expropriation" as const,
  compensationPerSqm: 1_500_000,
  compensationBasisStdPrice: 2_000_000,
};

// ══════════════════════════════════════════════════════════
describe("I-1 (C-12) — §97②2호 swap과 부수토지 중과가 함께 성립한다", () => {
  it("swap 단독: 나목 채택으로 swapApplied — 양도차익 = 양도가 − 나목(환산취득가 미차감)", () => {
    const r = calculateTransferTax(cb(SWAP), rates);
    expect(r.swapApplied).toBe(true);
    expect(r.transferGain).toBe(1_000_000_000 - (450_000_000 + 10_000_000));
  });

  it("swap + 부수토지 초과 → **양도차익은 그대로**, 세액만 오른다 (두 축 독립)", () => {
    const swapOnly = calculateTransferTax(cb(SWAP), rates);
    const both = calculateTransferTax(
      cb({ ...SWAP, commercialAppurtenantLand: APPURTENANT }),
      rates,
    );

    // 부수토지 판정은 세율 축이라 양도차익·swap 판정을 건드리지 않는다.
    expect(both.transferGain).toBe(swapOnly.transferGain);
    expect(both.swapApplied).toBe(true);
    // 초과분 중과가 STEP 0.35 재구성을 넘어 살아남았다.
    expect(both.calculatedTax).toBeGreaterThan(swapOnly.calculatedTax);
  });

  it("기준면적 이내면 swap 단독과 완전히 동일 (회귀 가드)", () => {
    const swapOnly = calculateTransferTax(cb(SWAP), rates);
    const withinLimit = calculateTransferTax(
      cb({
        ...SWAP,
        // 녹지 7배 → 기준면적 1,400㎡ ≥ 대지 1,200㎡ → 초과 0
        commercialAppurtenantLand: { ...APPURTENANT, zoneType: "green" },
      }),
      rates,
    );
    expect(withinLimit.calculatedTax).toBe(swapOnly.calculatedTax);
    expect(withinLimit.transferGain).toBe(swapOnly.transferGain);
  });
});

// ══════════════════════════════════════════════════════════
describe("I-2 (C-13) — 공익수용 §164⑨과 부수토지 중과가 함께 성립한다", () => {
  it("수용 단독: §164⑨ min[] 특례로 환산 분모가 낮아진다", () => {
    const r = calculateTransferTax(cb(EXPROPRIATION), rates);
    // min[호별고시 2,500,000 · 보상 1,500,000 · 보상기초 2,000,000] × 연면적 200㎡
    expect(r.expropriationValuationDetail?.denominator).toBe(300_000_000);
  });

  it("수용 + 부수토지 초과 → 분모·양도차익은 그대로 유지된다 (두 축 독립)", () => {
    const exprOnly = calculateTransferTax(cb(EXPROPRIATION), rates);
    const both = calculateTransferTax(
      cb({ ...EXPROPRIATION, commercialAppurtenantLand: APPURTENANT }),
      rates,
    );

    expect(both.transferGain).toBe(exprOnly.transferGain);
    expect(both.expropriationValuationDetail?.denominator).toBe(
      exprOnly.expropriationValuationDetail?.denominator,
    );
    // 세액은 아래 케이스 참조 — 이 조합에서는 §104⑤ 비교과세가 결과를 가른다.
    expect(both.calculatedTax).toBeGreaterThanOrEqual(exprOnly.calculatedTax);
  });

  it("수용 + 초과비율 1/2에서는 세액이 **같다** — §104⑤ 비교과세로 일반세액 채택", () => {
    // 수용 특례로 환산취득가가 커져 과세표준이 작아진다. 그 구간에서는 그룹별 합산세액이
    // 전체 일반 누진세액을 넘지 못해 §104⑤가 일반세액을 택하고 +10%p 효과가 소멸한다.
    // Phase 0-4 실측(계획서 §3.3a)에서 확인한 것과 같은 현상이며 **법령대로**다.
    const exprOnly = calculateTransferTax(cb(EXPROPRIATION), rates);
    const partial = calculateTransferTax(
      cb({ ...EXPROPRIATION, commercialAppurtenantLand: APPURTENANT }),
      rates,
    );
    expect(partial.calculatedTax).toBe(exprOnly.calculatedTax);
  });

  it("수용 + §101① 단서(전량 비사업용)면 세액이 오른다 — 중과가 살아 있음을 증명", () => {
    const exprOnly = calculateTransferTax(cb(EXPROPRIATION), rates);
    const allNbl = calculateTransferTax(
      cb({
        ...EXPROPRIATION,
        commercialAppurtenantLand: { ...APPURTENANT, unapprovedBuilding: true },
      }),
      rates,
    );
    expect(allNbl.calculatedTax).toBeGreaterThan(exprOnly.calculatedTax);
    expect(allNbl.transferGain).toBe(exprOnly.transferGain);
  });
});

// ══════════════════════════════════════════════════════════
describe("I-3 — §101① 단서(전량 비사업용)도 재구성을 넘어 살아남는다", () => {
  it("swap + 허가·사용승인 미이행 → 전량 중과", () => {
    const partial = calculateTransferTax(
      cb({ ...SWAP, commercialAppurtenantLand: APPURTENANT }),
      rates,
    );
    const allNbl = calculateTransferTax(
      cb({
        ...SWAP,
        commercialAppurtenantLand: { ...APPURTENANT, unapprovedBuilding: true },
      }),
      rates,
    );
    // 초과 1/2 중과 < 전량 중과
    expect(allNbl.calculatedTax).toBeGreaterThan(partial.calculatedTax);
    expect(allNbl.transferGain).toBe(partial.transferGain);
  });
});
