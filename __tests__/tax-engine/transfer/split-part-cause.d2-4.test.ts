/**
 * D2-4a 건물 상속·증여(2005.4.30. 전, 영 §163⑨ 단서 2호) + 토지 매매 — leaf 직접 · 해결자 직접 · 엔진 직접 · ⑫ 두 스키마 (2026-10-09)
 *
 * 계획서 §13 · 엔진 설계 `transfer-acq-cause-mixed-d2-4.engine.design.md` §3 · 사용자 결정: 단독·다가구주택만(공동주택·비주택 차단 유지).
 * route 단 anchor는 `__tests__/api/transfer.route.split-building-sec164.d2-4a.anchor.test.ts`.
 * 겹친 방어(엔진 throw · ⑫ refine · 해결자)는 mutation에서 서로를 가리므로 층마다 따로 잠근다.
 */
import { describe, it, expect } from "vitest";
import {
  collectSplitPartCauseIssues,
  isSec163_9BuildingSec164Open,
  BUILDING_CAUSE_APARTMENT_MESSAGE,
  BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE,
  BUILDING_SEC164_PARTIAL_MESSAGE,
  BUILDING_SEC164_REQUIRED_MESSAGE,
  type SplitPartCauseFacts,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { resolveBuildingPartAcquisition } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildingSec164ApportionNotice } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

/** 건물 상속 2003-05-01(경계일 전) + 토지 매매 — 단독·다가구 ② 있음. 모든 D2·D2-4 규칙을 통과하는 기준 사실 */
const OK: SplitPartCauseFacts = {
  isSplitable: true,
  hasLandAcquisitionDate: true,
  landAcquisitionCause: "purchase",
  hasLandDecedentAcquisitionDate: false,
  landMode: "actual",
  landAcquisitionDate: "2020-01-10",
  buildingAcquisitionCause: "inheritance",
  buildingAcquisitionDate: "2003-05-01",
  buildingMode: "actual",
  selfOwns: "both",
  isHousing: true,
  buildingHouseKind: "house_individual",
  buildingSec164Value: 36_000_000,
};
const msgs = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f }).map((i) => i.message);
const first = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f })[0];

describe("leaf — Y4a~d 분기 (단독·다가구만 연다)", () => {
  it("기준(긍정 짝): 주택 ∧ 단독·다가구 ∧ ② 있음 → 이슈 0 (상속·증여 둘 다)", () => {
    expect(msgs({})).toEqual([]);
    expect(msgs({ buildingAcquisitionCause: "gift" })).toEqual([]);
  });

  it("Y4c ② 없음(생략·0) → buildingSec164Value", () => {
    for (const buildingSec164Value of [undefined, 0])
      expect(first({ buildingSec164Value })).toEqual({ field: "buildingSec164Value", message: BUILDING_SEC164_REQUIRED_MESSAGE });
  });

  it("Y4b 일부 양도 → areaScenario (② 입력 여부와 무관 — 입력으로 풀리지 않는 사유가 먼저)", () => {
    expect(first({ isPartialAreaTransfer: true })).toEqual({ field: "areaScenario", message: BUILDING_SEC164_PARTIAL_MESSAGE });
    expect(first({ isPartialAreaTransfer: true, buildingSec164Value: undefined })?.field).toBe("areaScenario");
    expect(msgs({ isPartialAreaTransfer: false })).toEqual([]);
  });

  it("Y4d 단독·다가구가 아니거나 모름 → acquisitionDate (공동주택 · 생략) — ②가 있어도 열리지 않는다", () => {
    expect(first({ buildingHouseKind: "house_apart" })).toEqual({ field: "acquisitionDate", message: BUILDING_CAUSE_APARTMENT_MESSAGE });
    expect(first({ buildingHouseKind: undefined })).toEqual({ field: "acquisitionDate", message: BUILDING_CAUSE_APARTMENT_MESSAGE });
    // 공동주택 + 일부 양도 + ② 없음이어도 Y4d 하나만(단독·다가구 전제가 앞이다)
    expect(msgs({ buildingHouseKind: "house_apart", isPartialAreaTransfer: true, buildingSec164Value: undefined })).toEqual([BUILDING_CAUSE_APARTMENT_MESSAGE]);
  });

  it("Y4a 비주택(isHousing false·생략) → 종전 문구 acquisitionDate — 사실 생략 호출(기존 테스트 헬퍼)도 종전 값 그대로", () => {
    expect(first({ isHousing: false })).toEqual({ field: "acquisitionDate", message: BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE });
    expect(first({ isHousing: undefined })).toEqual({ field: "acquisitionDate", message: BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE });
    // 비주택은 단독·다가구 사실이 와도 열리지 않는다
    expect(msgs({ isHousing: false, buildingHouseKind: "house_individual" })).toEqual([BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE]);
  });

  it("경계: 2005-04-29 → 구간(② 필요) · 2005-04-30 → 구간 밖(② 불요, 구분도 불요) · 시각 꼬리 · 증여도 동일", () => {
    expect(first({ buildingAcquisitionDate: "2005-04-29", buildingSec164Value: undefined })?.field).toBe("buildingSec164Value");
    expect(msgs({ buildingAcquisitionDate: "2005-04-30", buildingSec164Value: undefined, buildingHouseKind: undefined, isHousing: false })).toEqual([]);
    expect(first({ buildingAcquisitionDate: "1984-05-01T00:00:00.000Z", buildingSec164Value: undefined })?.field).toBe("buildingSec164Value");
    expect(first({ buildingAcquisitionCause: "gift", buildingAcquisitionDate: "2003-01-01", buildingSec164Value: undefined })?.field).toBe("buildingSec164Value");
  });

  it("술어 isSec163_9BuildingSec164Open: 주택 ∧ house_individual 둘 다 필요", () => {
    expect(isSec163_9BuildingSec164Open(true, "house_individual")).toBe(true);
    expect(isSec163_9BuildingSec164Open(true, "house_apart")).toBe(false);
    expect(isSec163_9BuildingSec164Open(true, undefined)).toBe(false);
    expect(isSec163_9BuildingSec164Open(false, "house_individual")).toBe(false);
    expect(isSec163_9BuildingSec164Open(undefined, "house_individual")).toBe(false);
  });

  it("순서: 구조(Y1) → Y2 → Y4 → Y3 → Y7 → Y9 — Y4c가 Y3(방식)·Y7(자산 단위)보다 앞, 같은 목록에 함께 나온다", () => {
    const f = { isBurdenedGift: true, buildingSec164Value: undefined, buildingMode: "estimated" as const, hasAssetLevelAcquisitionValuation: true, hasBuildingAcquisitionPrice: false };
    expect(collectSplitPartCauseIssues({ ...OK, ...f }).map((i) => i.field)).toEqual([
      "landAcquisitionCause", "buildingSec164Value", "buildingAcqMode", "inheritedAcquisition", "buildingAcquisitionPrice",
    ]);
  });

  it("D2 밖에서는 사실이 무영향: 건물 매매·신축 + 토지 매매 / overlay 부재", () => {
    for (const buildingAcquisitionCause of ["purchase", "newConstruction"])
      expect(msgs({ buildingAcquisitionCause, buildingSec164Value: undefined, isHousing: false })).toEqual([]);
  });
});

describe("해결자 resolveBuildingPartAcquisition — max · 동점 · 적용 조건", () => {
  const D = (s: string) => new Date(s);
  const IN = {
    buildingAcquisitionPrice: 30_000_000,
    buildingSec164Value: 36_000_000,
    buildingHouseKind: "house_individual" as const,
    landAcquisitionCause: "purchase" as const,
    acquisitionCause: "inheritance" as const,
    acquisitionDate: D("2003-05-01"),
    propertyType: "housing" as const,
    isSeparateAcquisition: true,
  };

  it("② > ① → ② 채택 · ② < ① → ① 채택 · 동점 → ①(reported)", () => {
    expect(resolveBuildingPartAcquisition(IN)).toEqual({
      price: 36_000_000, basis: { rule: "sec163_9_2", reported: 30_000_000, sec164: 36_000_000, adopted: "sec164" },
    });
    expect(resolveBuildingPartAcquisition({ ...IN, buildingAcquisitionPrice: 40_000_000 })).toEqual({
      price: 40_000_000, basis: { rule: "sec163_9_2", reported: 40_000_000, sec164: 36_000_000, adopted: "reported" },
    });
    expect(resolveBuildingPartAcquisition({ ...IN, buildingAcquisitionPrice: 36_000_000 }).basis?.adopted).toBe("reported");
  });

  it("날짜는 Date·문자열(시각 꼬리 포함) 모두 같은 판정 · 경계 2005-04-29 비교 / 2005-04-30 비교 없음", () => {
    expect(resolveBuildingPartAcquisition({ ...IN, acquisitionDate: "2003-05-01" as never }).basis?.rule).toBe("sec163_9_2");
    expect(resolveBuildingPartAcquisition({ ...IN, acquisitionDate: "2005-04-29T00:00:00.000Z" as never }).basis?.rule).toBe("sec163_9_2");
    expect(resolveBuildingPartAcquisition({ ...IN, acquisitionDate: D("2005-04-29") }).basis).toBeDefined();
    expect(resolveBuildingPartAcquisition({ ...IN, acquisitionDate: D("2005-04-30") })).toEqual({ price: 30_000_000 });
  });

  it.each([
    ["① 없음 — ②만으로 채우지 않는다", { buildingAcquisitionPrice: undefined }, undefined],
    ["② 없음·0", { buildingSec164Value: undefined }, 30_000_000],
    ["② 0", { buildingSec164Value: 0 }, 30_000_000],
    ["별개 취득 아님(총액 안분 모델) — 비교·echo 없음", { isSeparateAcquisition: false }, 30_000_000],
    ["별개 취득 미지정", { isSeparateAcquisition: undefined }, 30_000_000],
    ["overlay 부재 — 자산 단위 §163⑨ 2호 경로와 겹치지 않는다", { landAcquisitionCause: undefined }, 30_000_000],
    ["overlay가 매매가 아님(토지 상속 D1)", { landAcquisitionCause: "inheritance" as never }, 30_000_000],
    ["비주택 building", { propertyType: "building" as never }, 30_000_000],
    ["공동주택", { buildingHouseKind: "house_apart" as const }, 30_000_000],
    ["주택 구분 사실 없음(모름)", { buildingHouseKind: undefined }, 30_000_000],
    ["건물 원인 매매", { acquisitionCause: "purchase" as never }, 30_000_000],
    ["건물 원인 신축", { acquisitionCause: "newConstruction" as never }, 30_000_000],
  ])("비교 안 함: %s → ① 그대로 · echo 없음", (_n, over, price) => {
    const r = resolveBuildingPartAcquisition({ ...IN, ...over });
    expect(r.price).toBe(price);
    expect(r.basis).toBeUndefined();
  });

  it("증여 건물도 비교한다(cause gift)", () => {
    expect(resolveBuildingPartAcquisition({ ...IN, acquisitionCause: "gift" }).basis?.rule).toBe("sec163_9_2");
  });
});

describe("엔진 직접 — calcSplitGain이 같은 leaf로 던지고, 해결자 결과가 세액·echo로 간다", () => {
  const D = (s: string) => new Date(s);
  const asset = (o: Partial<TransferTaxInput>): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2003-05-01"),
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: D("1990-01-01"),
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
      buildingAcquisitionPrice: 30_000_000,
      buildingSec164Value: 36_000_000,
      buildingHouseKind: "house_individual",
      landAcquisitionDate: D("2020-01-10"),
      landAcquisitionCause: "purchase",
      ...o,
    });
  const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(asset(o), makeMockRates());

  it("② 채택: 247,266,000 · 건물 취득가 36M · echo · 고지 1줄 — Date 입력", () => {
    const r = run({});
    expect(r.determinedTax).toBe(247_266_000);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(36_000_000);
    expect(r.splitDetail?.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 30_000_000, sec164: 36_000_000, adopted: "sec164" });
    expect((r.warnings ?? []).filter((w) => w.includes("확인 필요") && w.includes("제164조 제7항 가액"))).toHaveLength(1);
  });
  it("① 채택: 246,090,000 · 고지는 채택 방향과 무관하게 1줄", () => {
    const r = run({ buildingAcquisitionPrice: 40_000_000 });
    expect(r.determinedTax).toBe(246_090_000);
    expect(r.splitDetail?.building.acquisitionBasis?.adopted).toBe("reported");
    expect((r.warnings ?? []).filter((w) => w.includes("제164조 제7항 가액"))).toHaveLength(1);
  });
  it("Y4c ② 없음 → throw · Y4d 구분 없음/공동주택 → throw · 비주택 → throw(종전 문구) · 일부 양도 → throw", () => {
    expect(() => run({ buildingSec164Value: undefined })).toThrow("그 건물 몫(buildingSec164Value)이 필요합니다");
    expect(() => run({ buildingHouseKind: undefined })).toThrow("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect(() => run({ buildingHouseKind: "house_apart" })).toThrow("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect(() => run({ propertyType: "building" })).toThrow("기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전");
    expect(() => run({ isPartialAreaTransfer: true })).toThrow("일부 양도");
  });
  it("경계 당일 2005-04-30 → 비교 없음 · echo 없음 · 고지 없음 (부정형 짝)", () => {
    const r = run({ acquisitionDate: D("2005-04-30"), landAcquisitionDate: D("2005-01-10"), buildingSec164Value: undefined, buildingHouseKind: undefined });
    expect(r.splitDetail?.building.acquisitionBasis).toBeUndefined();
    expect((r.warnings ?? []).some((w) => w.includes("제164조 제7항 가액"))).toBe(false);
  });
  it("건물 매매·신축에서 buildingSec164Value·buildingHouseKind가 와도 무시(회귀 0) — 세액 동일", () => {
    const plain = { acquisitionCause: "purchase" as const, decedentAcquisitionDate: undefined, acquisitionDate: D("2018-03-02"), buildingAcquisitionPrice: 400_000_000 };
    const a = run({ ...plain, buildingSec164Value: 99_000_000 });
    const b = run({ ...plain, buildingSec164Value: undefined, buildingHouseKind: undefined });
    expect(a.determinedTax).toBe(b.determinedTax);
    expect(a.splitDetail?.building.acquisitionBasis).toBeUndefined();
  });
  it("고지 빌더: echo rule이 sec163_9_2일 때만 — 토지 echo(sec163_9_1)나 echo 없음은 null", () => {
    expect(buildingSec164ApportionNotice(undefined)).toBeNull();
    const r = run({});
    expect(buildingSec164ApportionNotice(r.splitDetail)).toContain("확인 필요");
    const noEcho = run({ acquisitionDate: D("2005-04-30"), landAcquisitionDate: D("2005-01-10") });
    expect(buildingSec164ApportionNotice(noEcho.splitDetail)).toBeNull();
  });
});

describe("⑫ 주 자산·컴패니언 — 두 스키마가 필드를 strip하지 않고 같은 leaf를 거친다", () => {
  const MAIN = {
    propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, transferDate: "2026-06-30",
    acquisitionDate: "2003-05-01", landAcquisitionDate: "2020-01-10", acquisitionPrice: 0, expenses: 0, isOneHousehold: false,
    householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    residencePeriodMonths: 0, annualBasicDeductionUsed: 0, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    saleSplitMode: "actual", landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 500_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 30_000_000,
    acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01", landAcquisitionCause: "purchase",
    buildingSec164Value: 36_000_000, buildingHouseKind: "house_individual",
  };
  const parsed = (b: Record<string, unknown>) => propertySchema.safeParse(b);
  const paths = (b: Record<string, unknown>) => {
    const r = parsed(b);
    return r.success ? [] : [...new Set(r.error.issues.map((i) => i.path.join(".")))];
  };

  it("주 자산: 두 필드가 파싱 결과에 남는다(침묵 strip 방지) · issue 0", () => {
    const r = parsed(MAIN);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.buildingSec164Value).toBe(36_000_000);
      expect(r.data.buildingHouseKind).toBe("house_individual");
    }
  });
  it.each([
    ["Y4c ② 없음", { buildingSec164Value: undefined }, "buildingSec164Value"],
    ["Y4d 공동주택", { buildingHouseKind: "house_apart" }, "acquisitionDate"],
    ["Y4d 구분 없음", { buildingHouseKind: undefined }, "acquisitionDate"],
    ["Y4a 비주택 building", { propertyType: "building" }, "acquisitionDate"],
    ["Y4b 일부 양도", { isPartialAreaTransfer: true }, "isPartialAreaTransfer"],
    ["Y9 ① 없음", { buildingAcquisitionPrice: undefined }, "buildingAcquisitionPrice"],
  ] as const)("%s → 주 자산 %s", (_n, over, path) => {
    expect(paths({ ...MAIN, ...over })).toContain(path);
  });
  it("② 0·음수·소수·문자열은 ⑫ 400(positive int)", () => {
    for (const buildingSec164Value of [0, -1, 1.5, "36000000"]) expect(parsed({ ...MAIN, buildingSec164Value }).success, String(buildingSec164Value)).toBe(false);
  });

  const companion = (over: Partial<AssetForm> = {}) =>
    buildAssetPayload(
      {
        ...makeDefaultAsset(2), assetId: "c1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01",
        inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01", decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance",
        landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual",
        buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "30000000", standardPriceAtTransfer: "1200000000",
        landStandardPriceAtTransfer: "700000000", buildingStandardPriceAtTransfer: "500000000", inheritanceAssetKind: "house_individual",
        acquisitionArea: "200", inhHouseValHousePriceAtFirst: "300000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
        inhHouseValBuildingStdPriceAtFirst: "50000000", inhHouseValBuildingStdPriceAtInheritance: "30000000", ...over,
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
  const cparsed = (c: Record<string, unknown>) => propertySchema.safeParse(body(c));
  const cpaths = (c: Record<string, unknown>) => {
    const r = cparsed(c);
    return r.success ? [] : [...new Set(r.error.issues.map((i) => i.path.join(".")))].filter((p) => p.startsWith("companionAssets.0"));
  };

  it("컴패니언: ④ payload가 ②·구분을 싣고 ⑫ 컴패니언 스키마가 strip하지 않는다 · issue 0", () => {
    const c = companion();
    expect(c.buildingSec164Value).toBe(36_000_000);
    expect(c.buildingHouseKind).toBe("house_individual");
    expect(cpaths(c)).toEqual([]);
    const r = cparsed(c);
    expect(r.success).toBe(true);
    if (r.success) {
      const out = r.data.companionAssets?.[0];
      expect(out?.buildingSec164Value).toBe(36_000_000);
      expect(out?.buildingHouseKind).toBe("house_individual");
    }
  });
  it.each([
    ["Y4c ② 없음", { buildingSec164Value: undefined }, "companionAssets.0.buildingSec164Value"],
    ["Y4d 공동주택", { buildingHouseKind: "house_apart" }, "companionAssets.0.acquisitionDate"],
    ["Y4d 구분 없음", { buildingHouseKind: undefined }, "companionAssets.0.acquisitionDate"],
    ["Y4a 비주택 assetKind building", { assetKind: "building" }, "companionAssets.0.acquisitionDate"],
    ["Y4b 일부 양도", { isPartialAreaTransfer: true }, "companionAssets.0.isPartialAreaTransfer"],
  ] as const)("%s → 컴패니언 %s", (_n, over, path) => {
    expect(cpaths({ ...companion(), ...over })).toContain(path);
  });
});
