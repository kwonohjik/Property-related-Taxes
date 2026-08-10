/**
 * anchor: **부담부증여 × 이월과세(증여)** — 차단의 근거 → **지원 개시**(2026-08-10 D-7)
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-6
 *
 * ## (해소 전) 두 스텝이 함께 돌고, 뒤엣것이 앞엣것을 덮었다
 *
 * STEP 0.475(이월과세 §97의2)가 `workingInput`을 시나리오 결과로 바꾼 뒤,
 * STEP 0.48(부담부증여 §159)이 `transferPrice`·`acquisitionPrice`·`expenses`를 안분값으로
 * **덮어썼다**. ⇒ 이월과세 입력이 세액에 도달하지 않았고, 그것이 ⑧ 차단의 근거였다.
 *
 * ## ✅ 2026-08-10 — 예고대로 뒤집혔다
 *
 * 종전 주석은 「§97의2가 부담부증여에 적용되지 않는다는 판정이 아니다 — 근거가 확인되면
 * 엔진을 먼저 고치고 이 파일과 차단을 함께 손본다」고 적었다. **그대로 됐다**:
 *
 * · 근거 = 국세청 **재산세과-1059**(본문 확인 완료)
 * · **D-7a** — §159 안분 단계에 세 축 배선(취득가액 §97의2①1호 · 증여세 ①3호 · 보유기간 §95④ 단서)
 * · **D-7b** — ⑧ 차단을 **「두 벌 모두 입력」 요구**로 교체
 *
 * ⇒ CO-2·CO-3은 값 맞추기가 아니라 **서술째** 다시 쓰였다. CO-1(일반 양도 대조군)만 그대로다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
};

/** 증여 2023-06-01(10년 룰) · 양도 2026-02-16 → 이월과세 적용기간 안. */
const carryover = (donorAcquisitionPrice: number) => ({
  giftRegistryDate: new Date("2023-06-01"),
  donorAcquisitionDate: new Date("2012-01-01"),
  donorAcquisitionPrice,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
  giftDateValuation: 600_000_000,
});

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "general_building",
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2023-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("CO-1 대조군 — 이월과세 단독은 증여자 취득가액에 크게 반응한다", () => {
  /**
   * 이것이 없으면 CO-2의 「무반응」이 **픽스처가 이월과세 적용기간을 벗어난 탓**인지
   * 구별되지 않는다. 실제로 probe 첫 시도가 그 함정에 빠졌다(증여일 2020 → 5년 룰 초과).
   */
  it("증여자 취득가액 1억 vs 7억 → 204,930,000 vs 93,110,000", () => {
    const low = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(100_000_000),
    } as never);
    const high = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(700_000_000),
    } as never);
    expect(low.calculatedTax).toBe(204_930_000);
    expect(high.calculatedTax).toBe(93_110_000);
  });
});

describe("CO-2 ✅ 해소 — 이월과세가 세액에 도달한다 (2026-08-10 D-7a)", () => {
  /**
   * 종전 CO-2는 「증여자 취득가액을 흔들어도 부담부증여 단독과 같다(71,260,000)」를 고정했다.
   * 그것이 ⑧ 차단의 근거였다. D-7a가 세 축을 배선하면서 **정반대로 다시 쓰였다**.
   */
  const bg = {
    transferType: "burdened_gift",
    burdenedGiftInfo: {
      ...burdenedGiftInfo,
      carryoverDonorBasis: {
        landStdPriceAtAcquisition: 100_000_000,
        buildingStdPriceAtAcquisition: 50_000_000,
      },
    },
  } as Partial<TransferTaxInput>;

  /** 당초 증여자 기준 취득값을 바꾸는 헬퍼 — §159가 읽는 것은 **이쪽**이다. */
  const withDonorStd = (land: number, building: number) =>
    ({
      ...bg,
      burdenedGiftInfo: {
        ...(bg.burdenedGiftInfo as object),
        carryoverDonorBasis: {
          landStdPriceAtAcquisition: land,
          buildingStdPriceAtAcquisition: building,
        },
      },
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(100_000_000),
    }) as never;

  it("당초 증여자 취득 기준시가를 흔들면 **세액이 반응한다**", () => {
    const alone = run(bg);
    const low = run(withDonorStd(100_000_000, 50_000_000));
    const high = run(withDonorStd(400_000_000, 200_000_000));

    // 부담부증여 단독은 종전과 같다 — 이월과세를 켜지 않으면 아무것도 바뀌지 않는다(회귀 0).
    expect(alone.calculatedTax).toBe(71_260_000);

    // 🔑 이월과세를 켜면 단독과 **다르고**, 당초 증여자 취득가액에 따라 서로도 **다르다**.
    expect(low.calculatedTax).not.toBe(alone.calculatedTax);
    expect(high.calculatedTax).not.toBe(low.calculatedTax);
    // 취득가액이 크면 양도차익이 작아 세액이 낮다.
    expect(high.calculatedTax).toBeLessThan(low.calculatedTax);
  });

  it("✅ 취득원인 네 가지 중 **이월과세만 다른 값**을 낸다", () => {
    /**
     * 매매·상속·증여 셋이 같은 것은 §159가 취득가액을 정하므로 **옳다**.
     * 그러나 이월과세는 달라야 한다 — 국세청 **재산세과-1059**(2009.12.18.):
     *
     * > 「**시행령 §159 제1호에 따른 취득가액 산정 시** §97①1호에 따른 가액에
     * >   **이월과세 규정이 적용되는 것임**」
     *
     * ⇒ §159①1호 A의 기준 시점이 「당초 증여자의 취득 당시」로 옮겨진다.
     *   종전에는 네 값이 **전부 같아** 그 해석이 반영되지 않았다.
     */
    const sameByDesign = [
      run(bg).calculatedTax,
      run({ ...bg, acquisitionCause: "gift", acquisitionPrice: 400_000_000 } as never).calculatedTax,
      run({ ...bg, acquisitionCause: "inheritance", acquisitionPrice: 400_000_000 } as never).calculatedTax,
    ];
    expect(new Set(sameByDesign).size).toBe(1);
    expect(sameByDesign[0]).toBe(71_260_000);

    // 🔑 네 번째만 다르다.
    const carryoverTax = run(withDonorStd(100_000_000, 50_000_000)).calculatedTax;
    expect(carryoverTax).not.toBe(71_260_000);
  });
});

describe("CO-3 ✅ ⑧ validate — 차단 대신 **「두 벌 모두 입력」**을 요구한다 (D-7b)", () => {
  const base = {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "300000000",
    bgMortgageDebtAmount: "200000000",
    bgDonorRelation: "lineal_descendant",
    // (5-b) 일반건물 부담부증여는 §159①1호 환산용 취득시 기준시가를 요구한다.
    gbAcqLandPricePerSqm: "2130000",
    gbAcqBuildingValue: "424472064",
    gbLandArea: "1279",
  };

  it("이월과세 + 「당초 증여자」 미입력 → **차단**(fallback 금지)", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, acquisitionCause: "carryover_gift" } as never,
      "자산1",
    );
    /**
     * 종전에는 「아직 지원하지 않습니다」였다. 이제는 **지원하되 값을 요구**한다 —
     * 양도인 값으로 대신하면 시나리오 A = B가 되어 §97의2가 조용히 무력화되기 때문이다.
     */
    expect(v).not.toMatch(/아직 지원하지 않습니다/);
    expect(v).toMatch(/당초 증여자/);
    expect(v).toMatch(/기준시가/);
    // ❌ 「세액은 동일합니다」 안내를 되살리지 말 것(재산세과-1059에 정면 배치).
    expect(v).not.toMatch(/세액은 동일/);
  });

  it("이월과세 + 「당초 증여자」 기준시가 두 칸 입력 → **통과**", () => {
    const v = validateBurdenedGiftAsset(
      {
        ...base,
        acquisitionCause: "carryover_gift",
        bgCoDonorLandStdPriceAtAcq: "150000000",
        bgCoDonorBuildingStdPriceAtAcq: "50000000",
      } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });

  it("⭐ 건물 기준시가 **0**은 유효한 입력이다 (0 ≠ 미입력)", () => {
    /**
     * 토지만 있는 자산은 건물 기준시가가 0이다. 판정을 `parseAmount(v) > 0`으로 쓰면
     * 사용자가 명시한 0이 **미입력으로 둔갑**해 영원히 통과하지 못한다.
     */
    const v = validateBurdenedGiftAsset(
      {
        ...base,
        acquisitionCause: "carryover_gift",
        bgCoDonorLandStdPriceAtAcq: "150000000",
        bgCoDonorBuildingStdPriceAtAcq: "0",
      } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });

  it("증여 → 통과 (부담부증여 자체는 증여 취득원인과 병용 가능하다)", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, acquisitionCause: "gift" } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });

  it("부담부증여가 아니면 이월과세를 막지 않는다 (회귀 0)", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, transferType: "regular", acquisitionCause: "carryover_gift" } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });
});
