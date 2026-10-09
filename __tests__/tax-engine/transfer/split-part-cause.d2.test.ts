/**
 * D2-1 건물 상속·증여 + 토지 매매 — leaf 직접 · 엔진 직접 · ⑫ 주 자산·컴패니언 경로 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 (D2-Q1·Q3·Q5)
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2.engine.design.md §4
 *
 * route 단 anchor는 `__tests__/api/transfer.route.split-building-cause.d2.predo.anchor.test.ts`.
 * 겹친 방어(엔진 throw · ⑫ refine · ⑧)는 mutation에서 서로를 가리므로 층마다 따로 잠근다.
 */
import { describe, it, expect } from "vitest";
import {
  collectSplitPartCauseIssues,
  BUILDING_CAUSE_BURDENED_GIFT_MESSAGE,
  BUILDING_CAUSE_PHD_MESSAGE,
  BUILDING_CAUSE_FAMILY_BUSINESS_MESSAGE,
  BUILDING_CAUSE_DATE_REQUIRED_MESSAGE,
  BUILDING_CAUSE_ESTIMATION_MESSAGE,
  BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE,
  BUILDING_CAUSE_ASSET_VALUATION_MESSAGE,
  BUILDING_CAUSE_CARRYOVER_BURDENED_MESSAGE,
  BUILDING_CAUSE_BUILDING_PRICE_REQUIRED_MESSAGE,
  BUILDING_CAUSE_LAND_PRICE_REQUIRED_MESSAGE,
  LAND_CAUSE_ABSENT_MESSAGE,
  LAND_CAUSE_BUILDING_CAUSE_MESSAGE,
  LAND_CAUSE_OWNER_SPLIT_MESSAGE,
  isSec163_9BuildingProviso,
  type SplitPartCauseFacts,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

/** 건물 상속(2025-05-01) + 토지 매매 2025-01-10 — 모든 D2 규칙을 통과하는 기준 사실 */
const OK: SplitPartCauseFacts = {
  isSplitable: true,
  hasLandAcquisitionDate: true,
  landAcquisitionCause: "purchase",
  hasLandDecedentAcquisitionDate: false,
  landMode: "actual",
  landAcquisitionDate: "2025-01-10",
  buildingAcquisitionCause: "inheritance",
  buildingAcquisitionDate: "2025-05-01",
  buildingMode: "actual",
  selfOwns: "both",
};
const msgs = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f }).map((i) => i.message);
const first = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f })[0];

describe("leaf — D2 규칙별 발동·긍정 짝", () => {
  it("기준 사실은 통과(건물 상속·증여 둘 다)", () => {
    expect(msgs({})).toEqual([]);
    expect(msgs({ buildingAcquisitionCause: "gift" })).toEqual([]);
  });

  it.each([
    ["Y1 부담부증여", { isBurdenedGift: true }, BUILDING_CAUSE_BURDENED_GIFT_MESSAGE],
    ["Y1 PHD", { hasPreHousingDisclosure: true }, BUILDING_CAUSE_PHD_MESSAGE],
    ["Y1 가업상속", { hasFamilyBusinessInheritance: true }, BUILDING_CAUSE_FAMILY_BUSINESS_MESSAGE],
    ["Y1 land_only", { selfOwns: "land_only" }, LAND_CAUSE_OWNER_SPLIT_MESSAGE],
    ["Y1 building_only", { selfOwns: "building_only" }, LAND_CAUSE_OWNER_SPLIT_MESSAGE],
  ] as const)("%s → landAcquisitionCause", (_n, f, message) => {
    expect(first(f)).toEqual({ field: "landAcquisitionCause", message });
  });

  it("Y2 토지 취득일 없음 → landAcquisitionDate (이하 규칙은 보지 않는다)", () => {
    const issues = collectSplitPartCauseIssues({ ...OK, hasLandAcquisitionDate: false, landAcquisitionDate: undefined, buildingMode: "estimated", buildingAcquisitionDate: "2003-01-01" });
    expect(issues).toEqual([{ field: "landAcquisitionDate", message: BUILDING_CAUSE_DATE_REQUIRED_MESSAGE }]);
  });

  it("Y4 경계: 개시 2005-04-29 차단 · 2005-04-30 통과 · 시각 꼬리(ISO) · 증여도 동일", () => {
    expect(first({ buildingAcquisitionDate: "2005-04-29" })).toEqual({ field: "acquisitionDate", message: BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE });
    expect(msgs({ buildingAcquisitionDate: "2005-04-30" })).toEqual([]);
    expect(first({ buildingAcquisitionDate: "1984-05-01T00:00:00.000Z" })?.message).toBe(BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE);
    expect(first({ buildingAcquisitionCause: "gift", buildingAcquisitionDate: "2003-01-01" })?.message).toBe(BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE);
    expect(isSec163_9BuildingProviso("inheritance", "2005-04-29")).toBe(true);
    expect(isSec163_9BuildingProviso("inheritance", "2005-04-30")).toBe(false);
    expect(isSec163_9BuildingProviso("purchase", "2003-01-01")).toBe(false);
    expect(isSec163_9BuildingProviso(undefined, "2003-01-01")).toBe(false);
  });

  it.each(["estimated", "appraisal", "salesCase"] as const)("Y3 건물 %s → buildingAcqMode", (buildingMode) => {
    expect(first({ buildingMode })).toEqual({ field: "buildingAcqMode", message: BUILDING_CAUSE_ESTIMATION_MESSAGE });
  });
  it("Y3 긍정 짝: 건물 방식을 확인하지 않는 호출(생략)은 통과 · 토지 방식은 무관(토지 매매는 환산 가능)", () => {
    expect(msgs({ buildingMode: undefined })).toEqual([]);
    expect(msgs({ landMode: "estimated" })).toEqual([]);
  });

  it("Y7 자산 단위 평가 payload 동봉 → inheritedAcquisition · 없으면 통과", () => {
    expect(first({ hasAssetLevelAcquisitionValuation: true })).toEqual({ field: "inheritedAcquisition", message: BUILDING_CAUSE_ASSET_VALUATION_MESSAGE });
    expect(msgs({ hasAssetLevelAcquisitionValuation: false })).toEqual([]);
  });

  it("Y9 파트 가액 완결(같은 날은 파트 완결 규칙이 꺼져 있다) — 건물 가액 없음 → buildingAcquisitionPrice · 토지 가액 없음(실가·감정) → landAcquisitionPrice · 토지 환산이면 불요 · 생략이면 확인 안 함", () => {
    expect(first({ hasBuildingAcquisitionPrice: false })).toEqual({ field: "buildingAcquisitionPrice", message: BUILDING_CAUSE_BUILDING_PRICE_REQUIRED_MESSAGE });
    expect(first({ hasLandAcquisitionPrice: false })).toEqual({ field: "landAcquisitionPrice", message: BUILDING_CAUSE_LAND_PRICE_REQUIRED_MESSAGE });
    expect(first({ hasLandAcquisitionPrice: false, landMode: "appraisal" })?.field).toBe("landAcquisitionPrice");
    expect(msgs({ hasLandAcquisitionPrice: false, landMode: "estimated" })).toEqual([]);
    expect(msgs({ hasBuildingAcquisitionPrice: true, hasLandAcquisitionPrice: true })).toEqual([]);
    expect(msgs({})).toEqual([]);
    // D2가 아니면(건물 매매) 요구하지 않는다
    expect(msgs({ buildingAcquisitionCause: "purchase", hasBuildingAcquisitionPrice: false, hasLandAcquisitionPrice: false })).toEqual([]);
  });

  it("순서: 구조(Y1) → Y2 → Y4 → Y3 → Y7", () => {
    const f = { isBurdenedGift: true, buildingAcquisitionDate: "2003-01-01", buildingMode: "estimated" as const, hasAssetLevelAcquisitionValuation: true };
    expect(msgs(f)).toEqual([
      BUILDING_CAUSE_BURDENED_GIFT_MESSAGE,
      BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE,
      BUILDING_CAUSE_ESTIMATION_MESSAGE,
      BUILDING_CAUSE_ASSET_VALUATION_MESSAGE,
    ]);
  });

  it("R-X5 개정: 건물 이월과세·부담부증여 + 토지 매매 → 차단 / 건물 상속·증여 + 토지 상속·증여 → 계속 차단(D3) / 건물 매매·신축 + 토지 매매 → 무영향", () => {
    for (const buildingAcquisitionCause of ["carryover_gift", "burdened_gift"])
      expect(first({ buildingAcquisitionCause })).toEqual({ field: "landAcquisitionCause", message: BUILDING_CAUSE_CARRYOVER_BURDENED_MESSAGE });
    for (const landAcquisitionCause of ["inheritance", "gift"])
      expect(msgs({ landAcquisitionCause, hasLandDecedentAcquisitionDate: true })).toContain(LAND_CAUSE_BUILDING_CAUSE_MESSAGE);
    for (const buildingAcquisitionCause of ["purchase", "newConstruction", undefined])
      expect(msgs({ buildingAcquisitionCause, isBurdenedGift: true, hasPreHousingDisclosure: true, hasAssetLevelAcquisitionValuation: true, buildingMode: "estimated" })).toEqual([]);
  });

  it("Y8 overlay 부재 + 건물 상속·증여 + 분리 입력(토지일 ≠ 건물일) → landAcquisitionCause · 긍정 짝들", () => {
    const absent = { landAcquisitionCause: undefined };
    expect(first(absent)).toEqual({ field: "landAcquisitionCause", message: LAND_CAUSE_ABSENT_MESSAGE });
    expect(first({ ...absent, landAcquisitionCause: "" })?.message).toBe(LAND_CAUSE_ABSENT_MESSAGE);
    expect(first({ ...absent, buildingAcquisitionCause: "gift" })?.message).toBe(LAND_CAUSE_ABSENT_MESSAGE);
    // 같은 날(소유자 분리·PHD 후퇴 송신 포함) · 소유자 분리 · 토지일 없음 · 건물일 미공급 · 건물 매매 · 시각 꼬리 같은 날 → 통과
    expect(msgs({ ...absent, landAcquisitionDate: "2025-05-01" })).toEqual([]);
    expect(msgs({ ...absent, landAcquisitionDate: "2025-05-01T00:00:00.000Z", buildingAcquisitionDate: "2025-05-01" })).toEqual([]);
    expect(msgs({ ...absent, selfOwns: "land_only" })).toEqual([]);
    expect(msgs({ ...absent, hasLandAcquisitionDate: false })).toEqual([]);
    expect(msgs({ ...absent, buildingAcquisitionDate: undefined })).toEqual([]);
    expect(msgs({ ...absent, buildingAcquisitionCause: "purchase" })).toEqual([]);
    // 부담부증여(transferType 또는 원인)는 파트 원인을 읽지 않는 기존 경로 — 분리 입력이 있어도 Y8 비해당(burdened-gift-stale-acq-method 케이스 7)
    expect(msgs({ ...absent, isBurdenedGift: true })).toEqual([]);
  });

  it("분리 대상이 아니면(isSplitable false) 아무것도 보지 않는다", () => {
    expect(msgs({ isSplitable: false, selfOwns: "land_only", buildingMode: "estimated", landAcquisitionCause: undefined })).toEqual([]);
  });
});

describe("엔진 직접 — calcSplitGain이 같은 leaf로 던진다", () => {
  const D = (s: string) => new Date(s);
  const asset = (o: Partial<TransferTaxInput>): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2025-05-01"),
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: D("2000-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 500_000_000,
      landStandardPriceAtTransfer: 700_000_000,
      buildingStandardPriceAtTransfer: 500_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 400_000_000,
      landAcquisitionDate: D("2025-01-10"),
      landAcquisitionCause: "purchase",
      ...o,
    });
  const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(asset(o), makeMockRates());

  it("기준(긍정 짝)은 계산된다 — S3d 258,060,000", () => {
    expect(run({}).determinedTax).toBe(258_060_000);
  });
  it("Y2 토지 취득일 없음 → throw (종전: 분리 계산이 빠지고 472,935,000)", () => {
    expect(() => run({ landAcquisitionDate: undefined })).toThrow("토지 취득일이 필요합니다");
  });
  it("Y3 건물 환산 → throw", () => {
    expect(() => run({ buildingAcqMode: "estimated", buildingStandardPriceAtAcquisition: 300_000_000 })).toThrow("상속·증여로 취득한 건물은 취득가액을");
  });
  it("Y4 경계: 개시 2005-04-29 → throw · 2005-04-30 → 계산", () => {
    expect(() => run({ acquisitionDate: D("2005-04-29"), landAcquisitionDate: D("2005-01-10") })).toThrow("기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전");
    expect(() => run({ acquisitionDate: D("2005-04-30"), landAcquisitionDate: D("2005-01-10") })).not.toThrow();
  });
  it("Y1 소유자 분리·부담부증여(transferType)·가업상속 → throw", () => {
    expect(() => run({ selfOwns: "land_only" })).toThrow("한쪽만 소유한 자산");
    expect(() => run({ transferType: "burdened_gift" })).toThrow("부담부증여로 양도하는 자산");
  });
  it("Y7 자산 단위 inheritedAcquisition 동봉 → throw (호출 시점 입력 — STEP 0.45 이후에도 필드가 남는다)", () => {
    expect(() =>
      run({
        inheritedAcquisition: { mode: "post-deemed", inheritanceDate: D("2025-05-01"), assetKind: "house_individual", reportedValue: 450_000_000, reportedMethod: "supplementary", useSupplementaryHelper: false } as never,
      }),
    ).toThrow("자산 단위 상속 취득가액 의제");
  });
  it("Y9 같은 날 + 파트 가액 없음 → throw(종전 취득가액 0) · 가액이 있으면 계산", () => {
    expect(() => run({ landAcquisitionDate: D("2025-05-01"), buildingAcquisitionPrice: undefined })).toThrow("건물 취득가액");
    expect(() => run({ landAcquisitionDate: D("2025-05-01"), landAcquisitionPrice: undefined })).toThrow("토지 취득가액");
    expect(() => run({ landAcquisitionDate: D("2025-05-01") })).not.toThrow();
    // isSeparateAcquisition false(같은 날의 실제 ④ 값)에서는 엔진의 파트 완결 규칙도 꺼져 있다 — 이 leaf 규칙만이 막는다
    expect(() => run({ landAcquisitionDate: D("2025-05-01"), isSeparateAcquisition: false, buildingAcquisitionPrice: undefined })).toThrow("건물 취득가액");
    expect(() => run({ landAcquisitionDate: D("2025-05-01"), isSeparateAcquisition: false, landAcquisitionPrice: undefined })).toThrow("토지 취득가액");
  });
  it("Y8 overlay 부재 → throw · 같은 날은 통과", () => {
    expect(() => run({ landAcquisitionCause: undefined })).toThrow("토지 취득원인이 없습니다");
    expect(() => run({ landAcquisitionCause: undefined, landAcquisitionDate: D("2025-05-01") })).not.toThrow();
  });
  it("R-X5: 건물 상속 + 토지 상속 → throw(D3) · 건물 증여 + 토지 매매 → 계산", () => {
    expect(() => run({ landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: D("1995-01-01") })).toThrow("건물을 상속·증여");
    expect(() => run({ acquisitionCause: "gift", decedentAcquisitionDate: undefined, donorAcquisitionDate: D("2000-01-01") })).not.toThrow();
  });
  it("회귀 0: 건물 매매·신축 + 토지 매매 overlay는 원인 없음과 같은 값(no-op)", () => {
    const plain = { acquisitionCause: "purchase" as const, decedentAcquisitionDate: undefined, acquisitionDate: D("2018-03-02") };
    for (const acquisitionCause of ["purchase", "newConstruction"] as const) {
      const a = run({ ...plain, acquisitionCause, landAcquisitionCause: "purchase" }).determinedTax;
      const b = run({ ...plain, acquisitionCause, landAcquisitionCause: undefined }).determinedTax;
      expect(a).toBe(b);
    }
  });
});

describe("고지 — 건물 상속·증여 전에 취득한 토지의 세율 기산(D2-Q1 A안·Q-D2-2, 세액 불변)", () => {
  const D = (s: string) => new Date(s);
  const run = (o: Partial<TransferTaxInput>) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D("2026-06-30"), acquisitionDate: D("2025-05-01"),
        acquisitionCause: "inheritance", decedentAcquisitionDate: D("2000-01-01"), isOneHousehold: false, householdHousingCount: 2,
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000,
        landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000,
        landAcquisitionDate: D("2025-01-10"), landAcquisitionCause: "purchase", ...o,
      }),
      makeMockRates(),
    );
  const GIFT = { acquisitionCause: "gift" as const, decedentAcquisitionDate: undefined, donorAcquisitionDate: D("2000-01-01") };
  const notes = (o: Partial<TransferTaxInput>) => (run(o).warnings ?? []).filter((w) => /받기 전/.test(w));

  // 양도 2026-06-30, 건물 취득일 2025-05-01(1년 1개월 → 1~2년 구간). 토지 자기 구간과 다를 때만.
  const GRID: [string, boolean][] = [
    ["2018-03-02", true], ["2020-01-10", true], ["2024-01-10", true], ["2024-07-01", true], // 2년 이상(초일 산입으로 2026-06-30까지 딱 2년) ≠ 1~2년
    ["2024-07-02", false], ["2025-01-10", false], ["2025-04-30", false], // 같은 1~2년 구간(또는 개시일 직전)
    ["2025-05-01", false], ["2025-09-01", false], ["2026-01-01", false], // 같은 날·개시 후 — 토지 기산은 자기 취득일(앵커 비해당)
  ];
  it.each(["inheritance", "gift"] as const)("%s: 토지 취득일 11시드 — 구간이 갈릴 때만 1줄 · 세액은 고지 유무와 무관", (cause) => {
    for (const [land, expected] of GRID) {
      const r = run({ ...(cause === "gift" ? GIFT : {}), landAcquisitionDate: D(land) });
      const n = (r.warnings ?? []).filter((w) => /받기 전/.test(w));
      expect(n.length, `${cause} ${land}`).toBe(expected ? 1 : 0);
    }
  });
  it("문구: 상속은 「상속받기 전·상속개시일」, 증여는 「증여받기 전·증여일」", () => {
    expect(notes({ landAcquisitionDate: D("2020-01-10") })[0]).toContain("상속개시일(2025-05-01)부터");
    expect(notes({ ...GIFT, landAcquisitionDate: D("2020-01-10") })[0]).toContain("건물을 증여받기 전(2020-01-10)에 취득한 토지는 증여일(2025-05-01)부터");
  });
  it("건물 매매·신축·소유자 분리(파트 세율 미판정)에서는 안 낸다", () => {
    expect(notes({ acquisitionCause: "purchase", decedentAcquisitionDate: undefined, landAcquisitionDate: D("2020-01-10") })).toHaveLength(0);
    expect(notes({ acquisitionCause: "newConstruction", decedentAcquisitionDate: undefined, landAcquisitionDate: D("2020-01-10") })).toHaveLength(0);
  });
  it("세액 불변 — 고지는 값을 바꾸지 않는다(상속 2020-01-10 229,260,000 · 증여 269,700,000)", () => {
    expect(run({ landAcquisitionDate: D("2020-01-10") }).determinedTax).toBe(229_260_000);
    expect(run({ ...GIFT, landAcquisitionDate: D("2020-01-10") }).determinedTax).toBe(269_700_000);
  });
});

describe("⑫ 주 자산·컴패니언 — 같은 규칙", () => {
  const MAIN = {
    propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, transferDate: "2026-06-30",
    acquisitionDate: "2025-05-01", landAcquisitionDate: "2025-01-10", acquisitionPrice: 0, expenses: 0, isOneHousehold: false,
    householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    residencePeriodMonths: 0, annualBasicDeductionUsed: 0, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    saleSplitMode: "actual", landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 500_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000,
    acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", landAcquisitionCause: "purchase",
  };
  const paths = (b: Record<string, unknown>) => {
    const r = propertySchema.safeParse(b);
    return r.success ? [] : [...new Set(r.error.issues.map((i) => i.path.join(".")))];
  };

  it("주 자산 기준은 issue 0", () => {
    expect(paths(MAIN)).toEqual([]);
  });
  it.each([
    ["Y1 소유자 분리", { selfOwns: "land_only" }, "landAcquisitionCause"],
    ["Y1 부담부증여", { transferType: "burdened_gift" }, "landAcquisitionCause"],
    ["Y2 토지일 없음", { landAcquisitionDate: undefined }, "landAcquisitionDate"],
    ["Y3 건물 환산", { buildingAcqMode: "estimated", buildingStandardPriceAtAcquisition: 300_000_000 }, "buildingAcqMode"],
    ["Y3 건물 감정", { buildingAcqMode: "appraisal" }, "buildingAcqMode"],
    ["Y4 경계일 전", { acquisitionDate: "2003-05-01", landAcquisitionDate: "2003-01-10", decedentAcquisitionDate: "1990-01-01" }, "acquisitionDate"],
    ["Y7 자산 단위 의제 동봉", { inheritedAcquisition: { mode: "post-deemed", inheritanceStartDate: "2025-05-01", assetKind: "house_individual", reportedValue: 450_000_000, reportedMethod: "supplementary" } }, "inheritedAcquisition"],
    ["Y8 overlay 부재", { landAcquisitionCause: undefined }, "landAcquisitionCause"],
    ["R-X5 건물 상속 + 토지 상속", { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1995-01-01" }, "landAcquisitionCause"],
  ] as const)("%s → 주 자산 %s", (_n, over, path) => {
    expect(paths({ ...MAIN, ...over })).toContain(path);
  });
  it("긍정 짝: 건물 증여 · 같은 날 · overlay 없음 + 같은 날 · 경계일 당일", () => {
    expect(paths({ ...MAIN, acquisitionCause: "gift", decedentAcquisitionDate: undefined })).toEqual([]);
    expect(paths({ ...MAIN, landAcquisitionDate: "2025-05-01" })).toEqual([]);
    expect(paths({ ...MAIN, landAcquisitionDate: "2025-05-01", landAcquisitionCause: undefined })).toEqual([]);
    expect(paths({ ...MAIN, acquisitionDate: "2005-04-30", landAcquisitionDate: "2005-01-10", decedentAcquisitionDate: "1990-01-01" })).toEqual([]);
  });

  const companion = (over: Partial<AssetForm> = {}) =>
    buildAssetPayload(
      {
        ...makeDefaultAsset(2), assetId: "c1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2025-05-01",
        decedentAcquisitionDate: "2000-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2025-01-10",
        hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000",
        buildingAcquisitionPrice: "400000000", standardPriceAtTransfer: "1200000000", landStandardPriceAtTransfer: "700000000",
        buildingStandardPriceAtTransfer: "500000000", ...over,
      } as unknown as AssetForm,
      "apportioned",
      "2026-06-30",
    ) as Record<string, unknown>;
  const body = (c: Record<string, unknown>) => ({
    propertyType: "land", transferDate: "2026-06-30", transferPrice: 300_000_000, acquisitionDate: "2015-01-01", acquisitionPrice: 100_000_000,
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000, totalSalePrice: 1_500_000_000, companionAssets: [c],
  });
  const cpaths = (c: Record<string, unknown>) => paths(body(c)).filter((p) => p.startsWith("companionAssets.0"));

  it("컴패니언: ④ payload는 overlay `purchase`를 싣고 자산 단위 평가 payload를 싣지 않는다 → CP-1 면제로 issue 0", () => {
    const c = companion();
    expect(c.landAcquisitionCause).toBe("purchase");
    expect(c.inheritanceValuation).toBeUndefined();
    expect(c.inheritedAcquisition).toBeUndefined();
    expect(cpaths(c)).toEqual([]);
  });
  it("컴패니언 CP-1 긍정 짝: overlay 없는 컴패니언 상속(분리 입력 없음)은 종전대로 ①② 필수 → 400", () => {
    const plain = companion({ landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "" });
    expect(cpaths(plain)).toContain("companionAssets.0.inheritanceValuation");
  });
  it.each([
    ["Y1 소유자 분리", { selfOwns: "land_only" }, "companionAssets.0.landAcquisitionCause"],
    ["Y1 부담부증여", { transferType: "burdened_gift" }, "companionAssets.0.landAcquisitionCause"],
    ["Y2 토지일 없음", { landAcquisitionDate: undefined }, "companionAssets.0.landAcquisitionDate"],
    ["Y3 건물 환산", { buildingAcqMode: "estimated" }, "companionAssets.0.buildingAcqMode"],
    ["Y4 경계일 전", { acquisitionDate: "2003-05-01", landAcquisitionDate: "2003-01-10", decedentAcquisitionDate: "1990-01-01" }, "companionAssets.0.acquisitionDate"],
    ["Y7 컴패니언 inheritanceValuation 동봉", { inheritanceValuation: { inheritanceDate: "2025-05-01", assetKind: "house_individual", publishedValueAtInheritance: 450_000_000 } }, "companionAssets.0.inheritedAcquisition"],
    ["Y8 overlay 부재", { landAcquisitionCause: undefined }, "companionAssets.0.landAcquisitionCause"],
  ] as const)("%s", (_n, over, path) => {
    expect(cpaths({ ...companion(), ...over })).toContain(path);
  });
});
