/**
 * 일반건물 부담부증여 K-5·K-7 × 당초 증여자 신축·증축 §114조의2 — 카드 신호 leaf 와 입력 방어선 (PR-5c · K-7 은 PR-2 `gb-bg-carryover-presumed-scenario-b.plan.md` · 엔진 직접 호출)
 *
 * ⑫(route 입구)가 먼저 막는 조합도 엔진 직접 호출(다른 라우트·테스트·후속 배선)에서는 도달할 수 있다 — 받아 놓고 무시(침묵 소실)하지 않도록 엔진도 던진다.
 * 수치는 route anchor(`transfer.route.gb-bg-carryover-donor-built.anchor.test.ts`)와 같은 픽스처: 건물 양도가(채무비율 안분 후) 2.5억 · 양도시 건물 기준시가 2억.
 */
import { describe, it, expect } from "vitest";
import { assertGbBgDonorBuiltInput, gbBurdenedGiftDonorBuiltPenaltySignal } from "@/lib/tax-engine/general-building-bg-penalty-signal";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-carryover";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { DonorBuiltInput } from "@/lib/tax-engine/types/transfer-carryover.types";

const d = (s: string) => new Date(s);
const INFO = (over: Partial<BurdenedGiftInfo> = {}) =>
  ({ valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", buildingStdPriceAtTransfer: 200_000_000, ...over }) as BurdenedGiftInfo;
const BREAKDOWN = (over: Partial<TransferBurdenedGiftBreakdown> = {}, buildingAcq = 50_000_000) =>
  ({ acquisitionMethodUsed: "converted", perAsset: { building: { transferPrice: 250_000_000, acquisitionPrice: buildingAcq } }, ...over }) as unknown as TransferBurdenedGiftBreakdown;
const NEW: DonorBuiltInput = { buildingType: "new", constructionDate: d("2022-01-10") };
const CT = { donorAcquisitionDate: d("2015-01-01"), giftRegistryDate: d("2024-05-01") };
const TD = d("2026-03-01");

describe("신호 leaf — gbBurdenedGiftDonorBuiltPenaltySignal", () => {
  it("신축: base = 안분 후 건물분 환산취득가 · donor 표지 · 증여자 신축일", () => {
    const s = gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), NEW, TD)!;
    expect(s.axis).toEqual({ acquisitionMethod: "estimated", base: 50_000_000, donor: true });
    expect(s.constructionDate).toEqual(d("2022-01-10"));
    expect(s.buildingType).toBe("new");
  });
  it("신축: swap(W-6) 이면 building.acquisitionPrice 는 0 이지만 base 는 swap 前 값", () => {
    const s = gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN({ convertedAcquisitionBeforeSwap: { land: 0, building: 50_000_000 } } as never, 0), NEW, TD)!;
    expect(s.axis.base).toBe(50_000_000);
  });
  it("증축: base = 건물분 양도가 × 증축 부분 기준시가 ÷ 양도시 건물 기준시가 · 85㎡ 초과만", () => {
    const ext = (area: number): DonorBuiltInput => ({ buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: area, extensionStdPriceAtAcquisition: 20_000_000 });
    const s = gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), ext(90), TD)!;
    expect(s.axis.base).toBe(25_000_000);
    expect(s.buildingType).toBe("extension");
    expect(s.extensionFloorArea).toBe(90);
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), ext(85), TD)).toBeUndefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), ext(85.01), TD)).toBeDefined();
  });
  it("증축인데 증축 부분 기준시가가 없거나 양도시 건물 기준시가가 0 이면 신호 없음(기준액 0)", () => {
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), { buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: 90 }, TD)).toBeUndefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ buildingStdPriceAtTransfer: 0 }), BREAKDOWN(), { buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: 90, extensionStdPriceAtAcquisition: 20_000_000 }, TD)).toBeUndefined();
  });
  it("환산이 실제로 쓰이지 않았으면(담보평가 승 → 기준시가 강제) 신호 없음 · 환산·감정이 아니면(K-4 실지) 신호 없음", () => {
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN({ acquisitionMethodUsed: "standard" } as never), NEW, TD)).toBeUndefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ acquisitionMethod: "actual" }), BREAKDOWN({ acquisitionMethodUsed: "actual" } as never), NEW, TD)).toBeUndefined();
  });
  it("K-7 신축(PR-2): base = 안분 후 건물 감정가액 · 축 appraisal", () => {
    const s = gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ acquisitionMethod: "appraisal" }), BREAKDOWN({ acquisitionMethodUsed: "appraisal" } as never, 100_000_000), NEW, TD)!;
    expect(s.axis).toEqual({ acquisitionMethod: "appraisal", base: 100_000_000, donor: true });
  });
  it("K-7 증축(PR-2): base = 증축한 부분의 감정가액 × 채무비율(채무 5억 ÷ 평가액 10억) — 건물 전체 감정가액이 아니다", () => {
    const k7 = BREAKDOWN({ acquisitionMethodUsed: "appraisal", assumedDebtAmount: 500_000_000, sangjeungbeopValuation: { max: 1_000_000_000 } } as never, 100_000_000);
    const ext: DonorBuiltInput = { buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: 90 };
    const s = gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ acquisitionMethod: "appraisal", presumedExtensionAppraisalValue: 60_000_000 }), k7, ext, TD)!;
    expect(s.axis).toEqual({ acquisitionMethod: "appraisal", base: 30_000_000, donor: true });
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ acquisitionMethod: "appraisal" }), k7, ext, TD)).toBeUndefined(); // 증축 감정가액 없음 → 기준액 0
  });
  it("K-7 게이트는 감정가액 시행일(2020-01-01) — 같은 날짜라도 환산은 붙고 감정은 안 붙는다", () => {
    const early = { ...NEW, constructionDate: d("2017-06-01") };
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), early, d("2019-06-01"))).toBeDefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO({ acquisitionMethod: "appraisal" }), BREAKDOWN({ acquisitionMethodUsed: "appraisal" } as never, 100_000_000), early, d("2019-06-01"))).toBeUndefined();
  });
  it("기준액 0 이면 신호 없음 · 게이트: 5년 당일 포함 / 하루 지나면 없음 / 환산 시행일 2018-01-01 전 양도 없음", () => {
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN({}, 0), NEW, TD)).toBeUndefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), { ...NEW, constructionDate: d("2021-03-01") }, TD)).toBeDefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), { ...NEW, constructionDate: d("2021-02-28") }, TD)).toBeUndefined();
    expect(gbBurdenedGiftDonorBuiltPenaltySignal(INFO(), BREAKDOWN(), { ...NEW, constructionDate: d("2016-01-10") }, d("2017-12-31"))).toBeUndefined();
  });
});

describe("입력 방어선 — assertGbBgDonorBuiltInput (엔진 직접 호출)", () => {
  const field = (fn: () => void) => {
    try { fn(); } catch (e) { return e as TaxCalculationError; }
    return undefined;
  };
  it("정상 입력은 던지지 않는다", () => {
    expect(() => assertGbBgDonorBuiltInput(INFO(), CT, NEW, false, TD)).not.toThrow();
  });
  it("환산(K-5)·감정(K-7)이 아니거나 시가 모드가 아니면 던진다 — 감정(K-7) 신축은 받는다(PR-2)", () => {
    expect(() => assertGbBgDonorBuiltInput(INFO({ acquisitionMethod: "appraisal" }), CT, NEW, false, TD)).not.toThrow();
    expect(field(() => assertGbBgDonorBuiltInput(INFO({ acquisitionMethod: "actual" }), CT, NEW, false, TD))).toBeInstanceOf(TaxCalculationError);
    expect(field(() => assertGbBgDonorBuiltInput(INFO({ valuationMode: "sangjeungbeop_standard" }), CT, NEW, false, TD))).toBeInstanceOf(TaxCalculationError);
  });
  it("K-7 증축: 증축 부분 기준시가는 요구하지 않고, 게이트가 열리면 증축한 부분의 감정가액(> 0 · 당초 증여자 건물 감정가액 이하)을 요구한다", () => {
    const ext: DonorBuiltInput = { buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: 90 };
    const k7 = (v?: number) => INFO({ acquisitionMethod: "appraisal", presumedExtensionAppraisalValue: v, carryoverDonorBasis: { presumedBuildingAcquisitionPrice: 200_000_000 } } as never);
    expect(() => assertGbBgDonorBuiltInput(k7(60_000_000), CT, ext, false, TD)).not.toThrow();
    expect(field(() => assertGbBgDonorBuiltInput(k7(undefined), CT, ext, false, TD))?.message).toContain("증축한 부분의 감정가액");
    expect(field(() => assertGbBgDonorBuiltInput(k7(200_000_001), CT, ext, false, TD))?.message).toContain("클 수 없습니다");
    expect(() => assertGbBgDonorBuiltInput(k7(undefined), CT, { ...ext, extensionFloorArea: 80 }, false, TD)).not.toThrow(); // 85㎡ 이하 — 게이트 닫힘
  });
  it("건물 취득원인이 양도인 본인 신축이면 던진다(두 축 혼동 차단)", () => {
    expect(field(() => assertGbBgDonorBuiltInput(INFO(), CT, NEW, true, TD))?.message).toContain("다른 축");
  });
  it("신축일이 증여자 취득일 전 / 증여 등기접수일 후 · 증축 필수 칸 누락이면 던진다", () => {
    expect(field(() => assertGbBgDonorBuiltInput(INFO(), CT, { ...NEW, constructionDate: d("2014-12-31") }, false, TD))).toBeInstanceOf(TaxCalculationError);
    expect(field(() => assertGbBgDonorBuiltInput(INFO(), CT, { ...NEW, constructionDate: d("2024-05-02") }, false, TD))).toBeInstanceOf(TaxCalculationError);
    expect(field(() => assertGbBgDonorBuiltInput(INFO(), CT, { buildingType: "extension", constructionDate: d("2022-01-10"), extensionStdPriceAtAcquisition: 1 }, false, TD))).toBeInstanceOf(TaxCalculationError);
    expect(field(() => assertGbBgDonorBuiltInput(INFO(), CT, { buildingType: "extension", constructionDate: d("2022-01-10"), extensionFloorArea: 90 }, false, TD))).toBeInstanceOf(TaxCalculationError);
  });
  it("F27 진입점: 이월과세 적격 + donorBuilt 가 잘못된 조합이면 두 시나리오 계산 前에 던진다(⑫ 를 우회한 직접 호출) — 본인 신축 · 신축일 범위", () => {
    const ctIn = { giftRegistryDate: d("2024-05-01"), donorAcquisitionDate: d("2015-01-01"), donorAcquisitionPrice: 0, useEstimatedAcquisition: false, giftTaxAmount: 0, giftDateValuation: 1_000_000_000, donorRelation: "lineal" };
    const info = (db: DonorBuiltInput) => ({ ...INFO(), carryoverDonorBasis: { landStdPriceAtAcquisition: 10_000_000, buildingStdPriceAtAcquisition: 40_000_000, donorBuilt: db } });
    const call = (db: DonorBuiltInput, cause: string) =>
      field(() => calculateGeneralBuildingActualTransfer(
        { burdenedGiftInfo: info(db), transferDate: TD, buildingAcquisitionCause: cause } as never, 2026, 0, [], makeMockRates() as never, { carryoverTaxation: ctIn } as never));
    expect(call(NEW, "newConstruction")?.message).toContain("다른 축");
    expect(call({ ...NEW, constructionDate: d("2014-12-31") }, "purchase")?.message).toContain("신축·증축일은 증여자 취득일 이후");
  });
  it("F27 진입점: donorBuilt 가 있는데 이월과세 입력(ct)이 없으면 던진다(받아 놓고 무시 금지)", () => {
    const payload = { burdenedGiftInfo: { ...INFO(), carryoverDonorBasis: { donorBuilt: NEW } }, transferDate: TD } as never;
    expect(field(() => calculateGeneralBuildingActualTransfer(payload, 2026, 0, [], makeMockRates() as never, undefined))?.message).toContain("이월과세");
  });
});
