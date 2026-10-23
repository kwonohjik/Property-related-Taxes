/**
 * `buildBurdenedGiftBreakdown` × 일반건물 파트별 3자 max (PR-7b-6 · 사용자 결정 Q-28 · `burdened-gift-part-pre-deemed.ts`).
 * route 경로는 `__tests__/api/transfer.route.bg-pre-deemed-gb-market.routes.anchor.test.ts`가 원 단위로 고정한다. 여기서는 분기·슬롯·경계.
 *
 * 시료: 시가 10억 · 채무 5억(β 0.5) · 양도시 토지·건물 기준시가 각 2억 · 취득시(의제취득일) 각 3천만.
 * 파트 증여가액 = 10억 × 2억/4억 = 5억 → ③ = 5억 × 3천만/2억 = 7,500만(파트마다).
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { BG_PART_METHOD_REQUIRED_MESSAGE, type BgPreDeemedParts } from "@/lib/tax-engine/burdened-gift-part-pre-deemed";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const gb: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 0,
  mortgageDebtAmount: 500_000_000,
  annualRentTotal: 0,
  marketValueAtTransfer: 1_000_000_000,
  landStdPriceAtTransfer: 200_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 30_000_000,
  buildingStdPriceAtAcquisition: 30_000_000,
} as BurdenedGiftInfo;

const run = (info: BurdenedGiftInfo, preDeemedParts: BgPreDeemedParts | undefined, extra: Record<string, unknown> = {}) =>
  buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: info.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
    info,
    preDeemedParts,
    ...extra,
  });

/** 계획서 Q-28 차이 시료 — ① 토지 6억·건물 1천만 */
const SAMPLE: BgPreDeemedParts = {
  land: { reported: 600_000_000, sec164: 30_000_000 },
  building: { reported: 10_000_000, sec164: 30_000_000 },
};
const pick = (b: ReturnType<typeof run>) => ({
  land: [b.perAsset.land.acquisitionMethod, b.perAsset.land.acquisitionPrice, b.perAsset.land.estimatedDeduction],
  building: [b.perAsset.building.acquisitionMethod, b.perAsset.building.acquisitionPrice, b.perAsset.building.estimatedDeduction],
});

describe("§159①1호 A — 일반건물 의제취득일 전 파트별 3자 max", () => {
  it("P-1 계획서 시료 — 토지 ① 6억(실지) · 건물 ③ 7,500만(환산) → 파트별 6.75억 × β (자산 합계였다면 6.1억)", () => {
    const b = run(gb, SAMPLE);
    expect(pick(b)).toEqual({ land: ["actual", 300_000_000, 0], building: ["converted", 37_500_000, 450_000] });
    expect(b.perAsset.land.actualAcquisition).toBe(600_000_000);
    expect(b.perAsset.land.estimatedDeductionRate).toBeUndefined();
    expect(b.perAsset.building.estimatedDeductionRate).toBe(0.03);
    expect(b.acquisitionMethodUsed).toBe("converted"); // 다르면 건물 파트(§114조의2 신호 축)
    expect(b.preDeemed).toEqual({
      basis: "three_way_parts",
      stdAtDeemed: 60_000_000,
      parts: {
        land: { stdAtDeemed: 30_000_000, reported: 600_000_000, sec164: 30_000_000, converted: 75_000_000, selected: "reported", wholeAcquisition: 600_000_000 },
        building: { stdAtDeemed: 30_000_000, reported: 10_000_000, sec164: 30_000_000, converted: 75_000_000, selected: "converted", wholeAcquisition: 75_000_000 },
      },
    });
  });

  it("P-2 두 파트 모두 ③ — 종전 환산(K-5) 자산 단위와 같다(실비 단서 비교도 자산 단위)", () => {
    const parts = { land: { reported: 0, sec164: 30_000_000 }, building: { reported: 0, sec164: 30_000_000 } };
    const k5 = { ...gb, acquisitionMethod: "converted" } as BurdenedGiftInfo;
    for (const extra of [{}, { capitalExpenditure: 400_000_000 }, { capitalExpenditure: 10_000_000, transferExpense: 5_000_000 }]) {
      const b = run(gb, parts, extra);
      const w = run(k5, undefined, extra);
      expect(b.perAsset).toEqual(w.perAsset);
      expect(b.necessaryExpenseSwap).toEqual(w.necessaryExpenseSwap);
      expect(b.convertedAcquisitionBeforeSwap).toEqual(w.convertedAcquisitionBeforeSwap);
      expect(b.acquisitionMethodUsed).toBe("converted");
    }
  });

  it("P-3 두 파트 모두 ① — 종전 실지(K-4) 자산 단위와 같다(실비 성질별 시점 비율)", () => {
    const parts = { land: { reported: 600_000_000, sec164: 30_000_000 }, building: { reported: 200_000_000, sec164: 30_000_000 } };
    const k4 = { ...gb, acquisitionMethod: "actual", actualLandAcquisitionPrice: 600_000_000, actualBuildingAcquisitionPrice: 200_000_000 } as BurdenedGiftInfo;
    const extra = { capitalExpenditure: 30_000_000, transferExpense: 7_000_000 };
    expect(run(gb, parts, extra).perAsset).toEqual(run(k4, undefined, extra).perAsset);
  });

  it("P-4 동점(① = ③)은 ① — 실지 경로(Q-5)", () => {
    const b = run(gb, { land: { reported: 75_000_000, sec164: 30_000_000 }, building: SAMPLE.building });
    expect(b.preDeemed?.parts?.land?.selected).toBe("reported");
    expect(pick(b).land).toEqual(["actual", 37_500_000, 0]);
  });

  it("P-5 ② > ① 이고 ② ≥ ③ — ② 채택(§164④·⑤)", () => {
    const b = run(gb, { land: { reported: 10_000_000, sec164: 80_000_000 }, building: SAMPLE.building });
    expect(b.preDeemed?.parts?.land).toMatchObject({ selected: "sec164", wholeAcquisition: 80_000_000 });
    expect(pick(b).land).toEqual(["actual", 40_000_000, 0]);
    // ① = ②면 ①(근거 표기만 갈린다)
    expect(run(gb, { land: { reported: 80_000_000, sec164: 80_000_000 }, building: SAMPLE.building }).preDeemed?.parts?.land?.selected).toBe("reported");
  });

  it("P-6 한 파트만 환산 · 실비 단서 — 환산 파트의 가목과 그 파트 실비 몫을 겨룬다(실지 파트는 제 몫)", () => {
    // 자본적지출 4억 × β = 2억 → 취득시 기준시가 비율(1:1)로 1억씩
    const b = run(gb, SAMPLE, { capitalExpenditure: 400_000_000 });
    expect(pick(b)).toEqual({ land: ["actual", 300_000_000, 100_000_000], building: ["converted", 0, 100_000_000] });
    expect(b.necessaryExpenseSwap).toEqual({ estimatedSide: 37_950_000, directSide: 100_000_000, chosen: "direct" });
    expect(b.convertedAcquisitionBeforeSwap).toEqual({ land: 300_000_000, building: 37_500_000 });
  });

  it("P-7 한 파트만 환산 · 실비가 작으면 가목 유지", () => {
    const b = run(gb, SAMPLE, { capitalExpenditure: 10_000_000 });
    expect(pick(b)).toEqual({ land: ["actual", 300_000_000, 2_500_000], building: ["converted", 37_500_000, 450_000] });
    expect(b.necessaryExpenseSwap).toEqual({ estimatedSide: 37_950_000, directSide: 2_500_000, chosen: "estimated" });
    expect(b.convertedAcquisitionBeforeSwap).toBeUndefined();
  });

  it("P-8 한 파트만 의제취득일 전인데 산정방식 없음 → 400(다른 파트의 취득가액이 0으로 떨어지지 않게)", () => {
    expect(() => run(gb, { land: SAMPLE.land })).toThrow(BG_PART_METHOD_REQUIRED_MESSAGE);
  });

  it("P-9 토지만 의제취득일 전 · 건물은 고른 실지(K-4) — 건물 = 실지 4천만 × β", () => {
    const info = { ...gb, acquisitionMethod: "actual", actualBuildingAcquisitionPrice: 40_000_000 } as BurdenedGiftInfo;
    const b = run(info, { land: SAMPLE.land }, { capitalExpenditure: 10_000_000 });
    expect(pick(b)).toEqual({ land: ["actual", 300_000_000, 2_500_000], building: ["actual", 20_000_000, 2_500_000] });
    expect(b.perAsset.building.actualAcquisition).toBe(40_000_000);
    expect(b.preDeemed?.parts).toEqual({ land: expect.objectContaining({ selected: "reported" }) });
  });

  it("P-10 건물만 의제취득일 전(③) · 토지는 고른 감정가액(K-7) — 토지 개산공제 · 감정가액 × β", () => {
    const info = { ...gb, acquisitionMethod: "appraisal", presumedLandAcquisitionPrice: 50_000_000, presumedBuildingAcquisitionPrice: 0 } as BurdenedGiftInfo;
    const b = run(info, { building: { reported: 0, sec164: 30_000_000 } }, { capitalExpenditure: 400_000_000 });
    // 감정가액 파트는 실비 단서가 없다 · 건물 환산 파트는 제 실비 몫(1억)과 겨룬다
    expect(pick(b)).toEqual({ land: ["appraisal", 25_000_000, 450_000], building: ["converted", 0, 100_000_000] });
    expect(b.perAsset.land.presumedAcquisition).toBe(50_000_000);
    expect(b.acquisitionMethodUsed).toBe("converted");
  });

  it("P-11 기준시가 평가 · 시가 평가 담보 승 — 파트 ①②는 쓰지 않는다(취득시 기준시가 칸 = 의제취득일 기준시가 × β · Q-25)", () => {
    for (const info of [
      { ...gb, valuationMode: "sangjeungbeop_standard" },
      { ...gb, marketValueAtTransfer: 400_000_000 },
    ] as BurdenedGiftInfo[]) {
      const b = run(info, SAMPLE);
      expect(b.acquisitionMethodUsed).toBe("standard_price");
      expect(b.preDeemed).toBeUndefined();
      expect(b).toEqual(run(info, undefined));
    }
  });

  it("P-13 ①② 없고 ③도 0(양도시 기준시가 0)이면 환산 쪽 — 실지 0원으로 실비를 쓰지 않는다(개산공제 · 비부담부증여 `adoptedOf`와 같다)", () => {
    const b = run({ ...gb, buildingStdPriceAtTransfer: 0 }, { land: SAMPLE.land, building: { reported: 0, sec164: 0 } }, { capitalExpenditure: 10_000_000 });
    expect(b.preDeemed?.parts?.building).toMatchObject({ converted: 0, selected: "converted", wholeAcquisition: 0 });
    expect(b.perAsset.building.acquisitionMethod).toBe("converted");
  });

  it("P-12 지분(축 B) — 지분율로 줄인 info·①②(채무는 ④가 지분율로 안분)면 물건 전체의 지분 몫", () => {
    const whole = run(gb, SAMPLE);
    const share = run({ ...gb, mortgageDebtAmount: 300_000_000 }, { land: { reported: 360_000_000, sec164: 18_000_000 }, building: { reported: 6_000_000, sec164: 18_000_000 } }, { ownershipRatio: 0.6 });
    expect(share.preDeemed?.parts?.building).toMatchObject({ stdAtDeemed: 18_000_000, converted: 45_000_000, selected: "converted" });
    expect(pick(share)).toEqual({ land: ["actual", 180_000_000, 0], building: ["converted", 22_500_000, 270_000] });
    expect(share.perAsset.land.acquisitionPrice + share.perAsset.building.acquisitionPrice).toBe(
      ((whole.perAsset.land.acquisitionPrice + whole.perAsset.building.acquisitionPrice) * 6) / 10,
    );
  });
});
