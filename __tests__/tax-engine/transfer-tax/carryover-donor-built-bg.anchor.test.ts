/**
 * 부담부증여 × 이월과세 × 증여자 신축·증축 「소득세법」 §114조의2 가산세 anchor (PR-4, 2026-10-22)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §3.3 · §10 PR-4 · M7·M8
 *
 * ## 두 축을 구분한다 (이중 부과·혼동 없음)
 *  · 「양도인 본인 신축」(`isSelfBuilt` — K-5/K-7 기존 가산세): 양도인이 **매매로 취득해 신축**한 건물. 이월과세 취득원인에서는 화면이 보내지 않는다(`selfBuiltActive`는 매매 취득만).
 *  · 「증여자 신축」(`burdenedGiftInfo.carryoverDonorBasis.donorBuilt`): **당초 증여자**(양도인에게 자산을 증여한 사람)가 신축·증축한 건물. A 채택(이월과세 적용)일 때만.
 *  두 입력을 함께 보내면 거부한다. 본인 신축 플래그만 오면 종전 그대로(감정가액 차단 G-4·G-4b, K-5는 종전 거동).
 *
 * ## 픽스처 산수 (housing — 건물 통째, 양도일 2026-02-16)
 *   시가 C=800M · 채무 B=500M → 채무비율 0.625 · 양도가 500M · 양도시 건물 기준시가 800M
 *   K-7 — 당초 증여자 감정가액 200M → A 취득가액 125M (= 가산세 base, 채무비율 **안분 후** 건물분)
 *   K-5 — 당초 증여자 취득시 기준시가 건물 150M → 환산취득가 = 500M × 150M ÷ 800M = 93,750,000 (= base)
 *   가산세 = base × 5% (K-7 6,250,000 · K-5 4,687,500) · 지방소득세 10%
 * 증여자 신축일 2022-01-10 → 5년 되는 날 2027-01-10 (양도일 2026-02-16 안).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

type Method = "appraisal" | "converted";
interface DB { buildingType: "new" | "extension"; constructionDate: Date; extensionFloorArea?: number; extensionStdPriceAtAcquisition?: number }
const NEW_DB: DB = { buildingType: "new", constructionDate: D("2022-01-10") };

function info(method: Method, over: Partial<BurdenedGiftInfo> = {}, donorBuilt?: DB, donorBasis: Record<string, unknown> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 800_000_000,
    acquisitionMethod: method,
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 800_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 400_000_000,
    actualAcquisitionTotal: 600_000_000, // 양도인 증여일 평가액 — 시나리오 B (K-7)
    carryoverDonorBasis: {
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 150_000_000,
      ...(method === "appraisal" ? { presumedBuildingAcquisitionPrice: 200_000_000, presumedLandAcquisitionPrice: 0 } : {}),
      ...donorBasis,
      ...(donorBuilt ? { donorBuilt } : {}),
    },
    ...over,
  } as BurdenedGiftInfo;
}

function run(i: BurdenedGiftInfo, extra: Partial<TransferTaxInput> = {}, ct: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferType: "burdened_gift",
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: D("2023-06-01"),
        donorAcquisitionDate: D("2000-06-01"),
        donorAcquisitionPrice: 100_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 600_000_000,
        ...ct,
      },
      burdenedGiftInfo: i,
      transferDate: D("2026-02-16"),
      acquisitionDate: D("2023-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      ...extra,
    } as Partial<TransferTaxInput>),
    rates,
  );
}
const echoOf = (r: ReturnType<typeof run>) => r.carryoverTaxationDetail!.donorBuiltPenalty;

describe("A 채택 — 채무비율 안분 후 건물분 환산취득가액·감정가액의 5%", () => {
  it("K-7 감정가액: base 125,000,000 · 가산세 6,250,000 · 총납부 85,923,062 → 92,798,062", () => {
    const off = run(info("appraisal"));
    const on = run(info("appraisal", {}, NEW_DB));
    expect(off.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(off.totalTax).toBe(85_923_062);
    expect(on.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(on.penaltyBase).toBe(125_000_000);
    expect(on.penaltyTax).toBe(6_250_000);
    expect(on.totalTax).toBe(92_798_062);
    expect(on.determinedTax).toBe(off.determinedTax); // ②3호 비교는 가산세 前 결정세액 — 불변
    expect(echoOf(on)).toMatchObject({ applied: true, base: 125_000_000, penalty: 6_250_000, buildingType: "new", constructionDate: "2022-01-10", fifthAnniversary: "2027-01-10", burdenedGift: { method: "appraisal" } });
  });

  it("K-5 환산: base 93,750,000 · 가산세 4,687,500 · 총납부 95,066,812 → 100,223,062", () => {
    const off = run(info("converted"));
    const on = run(info("converted", {}, NEW_DB));
    expect(off.totalTax).toBe(95_066_812);
    expect(on.penaltyBase).toBe(93_750_000);
    expect(on.penaltyTax).toBe(4_687_500);
    expect(on.totalTax).toBe(100_223_062);
    expect(echoOf(on)).toMatchObject({ applied: true, base: 93_750_000, penalty: 4_687_500, burdenedGift: { method: "estimated" } });
  });

  it("경고(warnings)에 「적용했다 + 정면 해석례 미확보 — 확인 필요」 고지가 실린다", () => {
    expect(run(info("appraisal", {}, NEW_DB)).warnings!.join("\n")).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });

  it("증축 K-5: 증축 부분 환산취득가액(채무안분 건물양도가 500M × 증축 취득 기준시가 40M ÷ 양도시 건물 기준시가 800M = 25M)의 5%", () => {
    const ext = (area: number): DB => ({ buildingType: "extension", constructionDate: D("2022-01-10"), extensionFloorArea: area, extensionStdPriceAtAcquisition: 40_000_000 });
    expect(run(info("converted", {}, ext(85))).penaltyTax).toBe(0);
    const on = run(info("converted", {}, ext(85.01)));
    expect(on.penaltyBase).toBe(25_000_000);
    expect(on.penaltyTax).toBe(1_250_000);
  });

  it("증축 K-7: 증축 부분 감정가액 80M(물건 전체 기준) × 채무비율 0.625 = 50M 의 5% = 2,500,000", () => {
    const ext = (area: number): DB => ({ buildingType: "extension", constructionDate: D("2022-01-10"), extensionFloorArea: area });
    const on = run(info("appraisal", { presumedExtensionAppraisalValue: 80_000_000 }, ext(90)));
    expect(on.penaltyBase).toBe(50_000_000);
    expect(on.penaltyTax).toBe(2_500_000);
    expect(run(info("appraisal", { presumedExtensionAppraisalValue: 80_000_000 }, ext(85))).penaltyTax).toBe(0);
  });

  it("증축 K-7 인데 증축 부분 감정가액이 없으면 건물 전체로 대신하지 않고 거부한다", () => {
    expect(() => run(info("appraisal", {}, { buildingType: "extension", constructionDate: D("2022-01-10"), extensionFloorArea: 90 }))).toThrow(/증축한 부분의 감정가액/);
  });

  it("양도차손(결정세액 0)에도 가산세가 붙는다 — 법 §114조의2②", () => {
    const loss = { actualAcquisitionTotal: 2_000_000_000 };
    const basis = { presumedBuildingAcquisitionPrice: 2_000_000_000 };
    const off = run(info("appraisal", loss, undefined, basis));
    const on = run(info("appraisal", loss, NEW_DB, basis));
    expect(off.determinedTax).toBe(0);
    expect(on.determinedTax).toBe(0);
    expect(on.penaltyTax).toBeGreaterThan(0);
    expect(on.penaltyBase).toBe(1_250_000_000);
    expect(on.penaltyTax).toBe(62_500_000);
  });
});

describe("가산세가 붙지 않는 경우 — echo 로 이유를 말한다 (R2)", () => {
  it("②3호 B 채택: 가산세 0 · 총납부 변화 0 · scenario_b", () => {
    const basis = { presumedBuildingAcquisitionPrice: 790_000_000 };
    const off = run(info("appraisal", {}, undefined, basis));
    const on = run(info("appraisal", {}, NEW_DB, basis));
    expect(off.carryoverTaxationDetail!.adoptedScenario).toBe("B");
    expect(on.penaltyTax).toBe(0);
    expect(on.totalTax).toBe(off.totalTax);
    expect(echoOf(on)).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("가산세 기준액(채무비율 안분 후 건물분)이 0원이면 zero_base — 당초 증여자 건물 기준시가가 0", () => {
    const r = run(info("converted", {}, NEW_DB, { landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 0 }));
    expect(r.penaltyTax).toBe(0);
    expect(echoOf(r)).toMatchObject({ applied: false, notAppliedReason: "zero_base", fifthAnniversary: "2027-01-10" });
  });

  it("5년 경과: 양도일이 신축일+5년 +1일이면 outside_penalty_window · 당일이면 발동", () => {
    const late = run(info("converted", {}, { buildingType: "new", constructionDate: D("2021-02-15") }));
    expect(late.penaltyTax).toBe(0);
    expect(echoOf(late)).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window", fifthAnniversary: "2026-02-15" });
    expect(run(info("converted", {}, { buildingType: "new", constructionDate: D("2021-02-16") })).penaltyTax).toBe(4_687_500);
  });

  it("이월과세 자체 배제(관계 «그 외»): carryover_excluded", () => {
    const r = run(info("appraisal", {}, NEW_DB), {}, { donorRelation: "other" });
    expect(r.penaltyTax).toBe(0);
    expect(echoOf(r)).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
  });
});

describe("입력 거부 — 조용히 무시하지 않는다", () => {
  it("실지취득가액(K-4)·기준시가(K-1~K-3) 모드는 가산세 대상이 아니다", () => {
    expect(() => run(info("converted", { acquisitionMethod: "actual" }, NEW_DB, { actualLandAcquisitionPrice: 0, actualBuildingAcquisitionPrice: 100_000_000 }))).toThrow(/환산취득가액|감정가액/);
    expect(() => run(info("converted", { valuationMode: "sangjeungbeop_standard", acquisitionMethod: undefined }, NEW_DB))).toThrow(/환산취득가액|감정가액/);
  });
  it("본인 신축 플래그와 증여자 신축은 함께 쓸 수 없다 (두 축 혼동 차단)", () => {
    expect(() => run(info("converted", {}, NEW_DB), { isSelfBuilt: true, buildingType: "new", constructionDate: D("2024-01-01") })).toThrow(/본인|양도인/);
  });
  it("신축일이 증여자 취득일 전 / 증여 등기접수일 후 → 거부", () => {
    expect(() => run(info("converted", {}, { buildingType: "new", constructionDate: D("2000-05-31") }))).toThrow(/신축·증축일/);
    expect(() => run(info("converted", {}, { buildingType: "new", constructionDate: D("2023-06-02") }))).toThrow(/신축·증축일/);
  });
  it("증축 K-5 인데 바닥면적·증축 부분 기준시가 누락 → 거부", () => {
    expect(() => run(info("converted", {}, { buildingType: "extension", constructionDate: D("2022-01-10"), extensionStdPriceAtAcquisition: 40_000_000 }))).toThrow(/바닥면적/);
    expect(() => run(info("converted", {}, { buildingType: "extension", constructionDate: D("2022-01-10"), extensionFloorArea: 90 }))).toThrow(/증축 부분/);
  });
  it("이월과세 서브객체(carryoverTaxation.donorBuilt)로 보내면 거부 — 부담부증여는 burdenedGiftInfo.carryoverDonorBasis.donorBuilt", () => {
    expect(() => run(info("converted"), {}, { donorBuilt: NEW_DB })).toThrow(/carryoverDonorBasis|부담부증여/);
  });
});

describe("두 축 분리 — 본인 신축 플래그만 오면 종전 그대로 (회귀 0)", () => {
  const own = { isSelfBuilt: true, buildingType: "new" as const, constructionDate: D("2024-01-01") };
  it("[G-4] 감정가액 × 본인 신축 플래그 × 이월과세는 종전처럼 차단", () => {
    expect(() => run(info("appraisal"), own)).toThrow(/제114조의2/);
  });
  it("K-5 × 본인 신축 플래그(API 직접 호출)는 종전 거동 — A 채택 환산 base 93,750,000 에 가산세 4,687,500 (화면은 이월과세에서 이 플래그를 보내지 않는다)", () => {
    const r = run(info("converted"), own);
    expect(r.penaltyTax).toBe(4_687_500);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
  });
  it("donorBuilt 부재: echo 없음 · 가산세 0 · 총납부 현행", () => {
    const r = run(info("appraisal"));
    expect(r.penaltyTax).toBe(0);
    expect(echoOf(r)).toBeUndefined();
    expect(r.totalTax).toBe(85_923_062);
  });
});
