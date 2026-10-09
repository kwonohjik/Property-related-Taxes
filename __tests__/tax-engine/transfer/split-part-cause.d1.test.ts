/**
 * D1-1 토지 파트 취득원인 규칙 — leaf 직접 · 엔진 직접 · ⑫ 컴패니언 경로 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10 (U-1·U-3·U-4·T-2)
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md §3
 *
 * route 단 anchor는 `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts`.
 * 겹친 방어(엔진 throw · ⑫ refine · ⑧)는 mutation에서 서로를 가리므로 층마다 따로 잠근다.
 */
import { describe, it, expect } from "vitest";
import {
  collectSplitPartCauseIssues,
  LAND_CAUSE_BURDENED_GIFT_MESSAGE,
  LAND_CAUSE_PHD_MESSAGE,
  LAND_CAUSE_FAMILY_BUSINESS_MESSAGE,
  LAND_CAUSE_OWNER_SPLIT_MESSAGE,
  LAND_CAUSE_BUILDING_CAUSE_MESSAGE,
  LAND_CAUSE_DATE_REQUIRED_MESSAGE,
  LAND_SEC164_REQUIRED_MESSAGE,
  LAND_SEC164_PARTIAL_MESSAGE,
  isSec163_9LandProviso,
  LAND_DECEDENT_DATE_REQUIRED_MESSAGE,
  type SplitPartCauseFacts,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

/** 토지 상속(2015) + 건물 매매, 실가 — 모든 규칙을 통과하는 기준 사실 */
const OK: SplitPartCauseFacts = {
  isSplitable: true,
  hasLandAcquisitionDate: true,
  landAcquisitionCause: "inheritance",
  hasLandDecedentAcquisitionDate: true,
  landMode: "actual",
  landAcquisitionDate: "2015-03-10",
  buildingAcquisitionCause: "purchase",
  selfOwns: "both",
};
const msgs = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f }).map((i) => i.message);
const first = (f: Partial<SplitPartCauseFacts>) => collectSplitPartCauseIssues({ ...OK, ...f })[0];

describe("leaf — D1 규칙별 발동·긍정 짝", () => {
  it("기준 사실은 통과(상속·증여 둘 다)", () => {
    expect(msgs({})).toEqual([]);
    expect(msgs({ landAcquisitionCause: "gift", hasLandDecedentAcquisitionDate: false })).toEqual([]);
  });

  it.each([
    ["R-X1 부담부증여", { isBurdenedGift: true }, LAND_CAUSE_BURDENED_GIFT_MESSAGE],
    ["R-X2 PHD", { hasPreHousingDisclosure: true }, LAND_CAUSE_PHD_MESSAGE],
    ["R-X3 가업상속", { hasFamilyBusinessInheritance: true }, LAND_CAUSE_FAMILY_BUSINESS_MESSAGE],
    ["R-X4 land_only", { selfOwns: "land_only" }, LAND_CAUSE_OWNER_SPLIT_MESSAGE],
    ["R-X4 building_only", { selfOwns: "building_only" }, LAND_CAUSE_OWNER_SPLIT_MESSAGE],
    ["R-X5 건물 상속", { buildingAcquisitionCause: "inheritance" }, LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
    ["R-X5 건물 증여", { buildingAcquisitionCause: "gift" }, LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
    ["R-X5 건물 이월과세", { buildingAcquisitionCause: "carryover_gift" }, LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
    ["R-X5 건물 부담부증여", { buildingAcquisitionCause: "burdened_gift" }, LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
  ] as const)("%s → landAcquisitionCause", (_n, f, message) => {
    expect(first(f)).toEqual({ field: "landAcquisitionCause", message });
  });

  it("R-X4·R-X5 긍정 짝: selfOwns 미지정·both, 건물 매매·신축·미지정은 통과", () => {
    expect(msgs({ selfOwns: undefined })).toEqual([]);
    expect(msgs({ buildingAcquisitionCause: "newConstruction" })).toEqual([]);
    expect(msgs({ buildingAcquisitionCause: undefined })).toEqual([]);
  });

  it("G-12 토지 취득일 없음 → landAcquisitionDate (그리고 D0 규칙은 보지 않는다)", () => {
    const issues = collectSplitPartCauseIssues({ ...OK, hasLandAcquisitionDate: false, landAcquisitionDate: undefined, hasLandDecedentAcquisitionDate: false });
    expect(issues).toEqual([{ field: "landAcquisitionDate", message: LAND_CAUSE_DATE_REQUIRED_MESSAGE }]);
  });

  // D1-4 — Q-7은 「무조건 차단」에서 「② 미입력 차단」으로 바뀌었다. 법령 정합: 영 §163⑨ 단서 1호는 평가액과 §164④ 가액 중
  // 많은 금액을 취득가액으로 하므로(계산 가능), 비교할 ②가 없을 때만 막는다.
  it("Q-7 경계(② 없음): 1990-08-29 차단 · 1990-08-30 통과 · 시각 꼬리(ISO)도 날짜로 비교", () => {
    expect(first({ landAcquisitionDate: "1990-08-29" })).toEqual({ field: "landSec164Value", message: LAND_SEC164_REQUIRED_MESSAGE });
    expect(msgs({ landAcquisitionDate: "1990-08-30" })).toEqual([]);
    expect(first({ landAcquisitionDate: "1984-05-01T00:00:00.000Z" })?.message).toBe(LAND_SEC164_REQUIRED_MESSAGE);
    expect(first({ landAcquisitionCause: "gift", hasLandDecedentAcquisitionDate: false, landAcquisitionDate: "1984-05-01" })?.message).toBe(
      LAND_SEC164_REQUIRED_MESSAGE,
    );
  });

  it("Q-7 ② 있음이면 통과(상속·증여·1985 전 포함) — ② 0·음수·undefined는 없음", () => {
    for (const d of ["1984-05-01", "1988-05-01", "1990-08-29"]) {
      expect(msgs({ landAcquisitionDate: d, landSec164Value: 350_000_000 })).toEqual([]);
      expect(msgs({ landAcquisitionCause: "gift", hasLandDecedentAcquisitionDate: false, landAcquisitionDate: d, landSec164Value: 1 })).toEqual([]);
    }
    for (const v of [0, -1, undefined]) expect(first({ landAcquisitionDate: "1988-05-01", landSec164Value: v })?.field).toBe("landSec164Value");
  });

  it("Q-7 단서 밖에서는 ②가 와도 무시(차단·검사 모두 없음) — 1990-08-30·1991", () => {
    expect(msgs({ landAcquisitionDate: "1991-05-01", landSec164Value: 5 })).toEqual([]);
    expect(isSec163_9LandProviso("inheritance", "1990-08-30")).toBe(false);
    expect(isSec163_9LandProviso("inheritance", "1990-08-29")).toBe(true);
    expect(isSec163_9LandProviso("purchase", "1984-05-01")).toBe(false);
    expect(isSec163_9LandProviso(undefined, "1984-05-01")).toBe(false);
  });

  it("D14-5 일부 양도: 단서 구간에서만 차단, ②를 줘도 풀리지 않는다(field areaScenario) · 구간 밖은 무영향", () => {
    const part = { isPartialAreaTransfer: true };
    expect(first({ ...part, landAcquisitionDate: "1988-05-01", landSec164Value: 350_000_000 })).toEqual({ field: "areaScenario", message: LAND_SEC164_PARTIAL_MESSAGE });
    expect(msgs({ ...part, landAcquisitionDate: "1988-05-01" })).toEqual([LAND_SEC164_PARTIAL_MESSAGE]); // ② 필수 메시지는 겹치지 않는다
    expect(msgs({ ...part, landAcquisitionDate: "1990-08-30" })).toEqual([]);
    expect(msgs({ ...part, landAcquisitionDate: "2015-03-10" })).toEqual([]);
    expect(msgs({ ...part, landAcquisitionCause: "purchase", landAcquisitionDate: "1984-05-01" })).toEqual([]);
  });

  it("원인이 없거나 매매면 D1 규칙은 하나도 발동하지 않는다(회귀 0)", () => {
    const hostile: Partial<SplitPartCauseFacts> = {
      isBurdenedGift: true, hasPreHousingDisclosure: true, hasFamilyBusinessInheritance: true,
      selfOwns: "land_only", buildingAcquisitionCause: "inheritance", landAcquisitionDate: "1984-05-01",
    };
    for (const landAcquisitionCause of [undefined, "", "purchase"]) {
      expect(msgs({ ...hostile, landAcquisitionCause })).toEqual([]);
      expect(msgs({ ...hostile, landAcquisitionCause, hasLandAcquisitionDate: false })).toEqual([]);
    }
  });

  it("분리 대상이 아니면(isSplitable false) 아무것도 보지 않는다", () => {
    expect(msgs({ isSplitable: false, selfOwns: "land_only", hasLandAcquisitionDate: false })).toEqual([]);
  });

  it("순서: 구조 규칙이 Q-7·G-3보다 먼저(첫 항목 = 엔진 throw·⑧ 표시)", () => {
    const f = { hasPreHousingDisclosure: true, landAcquisitionDate: "1984-05-01", hasLandDecedentAcquisitionDate: false };
    expect(msgs(f)).toEqual([LAND_CAUSE_PHD_MESSAGE, LAND_SEC164_REQUIRED_MESSAGE, LAND_DECEDENT_DATE_REQUIRED_MESSAGE]);
  });
});

describe("엔진 직접 — calcSplitGain이 같은 leaf로 던진다", () => {
  const D = (s: string) => new Date(s);
  const asset = (o: Partial<TransferTaxInput>): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2018-03-02"),
      acquisitionCause: "purchase",
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
      landAcquisitionDate: D("2015-03-10"),
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("2000-01-01"),
      ...o,
    });
  const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(asset(o), makeMockRates());

  it("기준(긍정 짝)은 계산된다", () => {
    expect(() => run({})).not.toThrow();
  });
  it("G-12 토지 취득일 없음 → throw (종전: 토지 파트 침묵 탈락)", () => {
    expect(() => run({ landAcquisitionDate: undefined })).toThrow("토지 상속개시일(증여일)이 필요합니다");
  });
  it("Q-7 1984 상속(② 없음) → throw · 1990-08-30 당일은 계산", () => {
    expect(() => run({ landAcquisitionDate: D("1984-05-01"), landDecedentAcquisitionDate: D("1960-01-01") })).toThrow("landSec164Value");
    expect(() => run({ landAcquisitionDate: D("1990-08-30"), landDecedentAcquisitionDate: D("1960-01-01") })).not.toThrow();
  });
  it("D1-4 ② 있음 → 계산하고 max(①,②)를 echo한다 (영 §163⑨ 단서 1호) — ②>① sec164 / ①>② reported / 동점 reported", () => {
    const at = (reported: number, sec164: number) =>
      run({
        landAcquisitionDate: D("1984-05-01"),
        landDecedentAcquisitionDate: D("1960-01-01"),
        landAcquisitionPrice: reported,
        landSec164Value: sec164,
      }).splitDetail!.land;
    expect(at(300_000_000, 350_000_000)).toMatchObject({
      acquisitionPrice: 350_000_000,
      acquisitionBasis: { rule: "sec163_9_1", reported: 300_000_000, sec164: 350_000_000, adopted: "sec164" },
    });
    expect(at(400_000_000, 350_000_000)).toMatchObject({
      acquisitionPrice: 400_000_000,
      acquisitionBasis: { reported: 400_000_000, sec164: 350_000_000, adopted: "reported" },
    });
    expect(at(350_000_000, 350_000_000).acquisitionBasis?.adopted).toBe("reported");
    expect(at(300_000_000, 350_000_000).appraisalDeduction).toBe(0);
  });
  it("D1-4 단서 밖(1991·1990-08-30)에서는 ②가 와도 비교하지 않고 echo도 없다", () => {
    for (const d of ["1990-08-30", "1991-05-01"]) {
      const land = run({
        landAcquisitionDate: D(d),
        landDecedentAcquisitionDate: D("1960-01-01"),
        landAcquisitionPrice: 300_000_000,
        landSec164Value: 900_000_000,
      }).splitDetail!.land;
      expect(land.acquisitionPrice).toBe(300_000_000);
      expect(land.acquisitionBasis).toBeUndefined();
    }
  });
  it("D1-4 증여도 같은 단서 · 1984 이전과 1985~1990 사이가 같은 값(의제취득일 조건 없음)", () => {
    const at = (d: string, cause: "gift" | "inheritance") =>
      run({
        landAcquisitionDate: D(d),
        landAcquisitionCause: cause,
        landDecedentAcquisitionDate: cause === "inheritance" ? D("1960-01-01") : undefined,
        landAcquisitionPrice: 300_000_000,
        landSec164Value: 350_000_000,
      }).determinedTax;
    expect(at("1984-05-01", "gift")).toBe(at("1988-05-01", "gift"));
    expect(at("1984-05-01", "inheritance")).toBe(at("1988-05-01", "inheritance"));
    expect(at("1984-05-01", "gift")).toBe(at("1984-05-01", "inheritance"));
  });
  it("D1-4 ① 평가액 없음 + ② 있음 → ②로 채우지 않는다(① 미입력 차단 경로를 건너뛰지 않음 — ②만 있는 것과 ① 없음이 같은 결과)", () => {
    const pre = { landAcquisitionDate: D("1984-05-01"), landDecedentAcquisitionDate: D("1960-01-01"), landAcquisitionPrice: undefined };
    const outcome = (o: Partial<TransferTaxInput>) => {
      try {
        return { land: run(o).splitDetail?.land?.acquisitionPrice };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    const withSec164 = outcome({ ...pre, landSec164Value: 350_000_000 });
    expect(withSec164).not.toEqual({ land: 350_000_000 });
    expect(withSec164).toEqual(outcome({ ...pre, landAcquisitionDate: D("1991-05-01") }));
  });
  it("D1-4 별개 취득이 아니면(총액 안분) 비교·echo 없음 — echo만 「② 채택」이라 말하는 거짓 표시 방지", () => {
    const at = (sec164?: number) =>
      run({
        isSeparateAcquisition: false,
        acquisitionPrice: 700_000_000,
        landAcquisitionDate: D("1988-05-01"),
        landDecedentAcquisitionDate: D("1960-01-01"),
        landAcquisitionPrice: 100_000_000,
        landSec164Value: sec164,
      });
    const r = at(130_000_000);
    expect(r.splitDetail?.land?.acquisitionBasis).toBeUndefined();
    expect(r.determinedTax).toBe(at(1).determinedTax);
  });
  it("D14-5 일부 양도 + 단서 구간 → throw(② 있어도)", () => {
    expect(() =>
      run({ landAcquisitionDate: D("1984-05-01"), landDecedentAcquisitionDate: D("1960-01-01"), landSec164Value: 350_000_000, isPartialAreaTransfer: true }),
    ).toThrow("일부만 양도");
  });
  it("R-X4 소유자 분리 → throw", () => {
    expect(() => run({ selfOwns: "land_only" })).toThrow("한쪽만 소유한 자산");
  });
  it("R-X5 건물 상속 → throw", () => {
    expect(() => run({ acquisitionCause: "inheritance", decedentAcquisitionDate: D("1990-01-01") })).toThrow("건물을 상속·증여");
  });
  it("R-X1 부담부증여(transferType) → throw", () => {
    expect(() => run({ transferType: "burdened_gift" })).toThrow("부담부증여로 양도하는 자산");
  });
});

describe("⑫ 컴패니언 경로 — companionAssets[i]에 같은 규칙", () => {
  const companion = buildAssetPayload(
    {
      ...makeDefaultAsset(2),
      assetId: "c1",
      assetKind: "housing",
      acquisitionCause: "newConstruction",
      acquisitionDate: "2020-06-01",
      fixedAcquisitionPrice: "400000000",
      landAcquisitionCause: "inheritance",
      landCauseHost: "newConstruction", // 토글 ON이 함께 쓰는 호스트(D1-2)
      landAcquisitionDate: "2015-03-10",
      landDecedentAcquisitionDate: "1995-01-01",
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: "300000000",
      standardPriceAtTransfer: "400000000",
      landStandardPriceAtTransfer: "250000000",
      buildingStandardPriceAtTransfer: "150000000",
    } as AssetForm,
    "apportioned",
    "2026-06-30",
  ) as Record<string, unknown>;
  const body = (c: Record<string, unknown>) => ({
    propertyType: "land",
    transferDate: "2026-06-30",
    transferPrice: 600_000_000,
    acquisitionDate: "2010-01-01",
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000,
    totalSalePrice: 1_000_000_000,
    companionAssets: [c],
  });
  const landIssues = (c: Record<string, unknown>) => {
    const r = propertySchema.safeParse(body(c));
    return r.success ? [] : r.error.issues.map((i) => i.path.join(".")).filter((p) => p.startsWith("companionAssets.0.land") || p === "companionAssets.0.isPartialAreaTransfer");
  };

  it("기준(긍정 짝)은 원인 관련 issue 0", () => {
    expect(landIssues(companion)).toEqual([]);
  });
  it("Q-7 긍정 짝: 1984 + ② 있음은 issue 0 · 1990-08-30 당일은 ② 없이 0", () => {
    expect(landIssues({ ...companion, landAcquisitionDate: "1984-05-01", landSec164Value: 350_000_000 })).toEqual([]);
    expect(landIssues({ ...companion, landAcquisitionDate: "1990-08-30" })).toEqual([]);
  });
  it.each([
    ["R-X4 소유자 분리", { selfOwns: "land_only" }, "companionAssets.0.landAcquisitionCause"],
    ["R-X5 건물 상속", { acquisitionCause: "inheritance" }, "companionAssets.0.landAcquisitionCause"],
    ["R-X1 부담부증여", { transferType: "burdened_gift" }, "companionAssets.0.landAcquisitionCause"],
    ["Q-7 1984 (② 없음 → landSec164Value)", { landAcquisitionDate: "1984-05-01" }, "companionAssets.0.landSec164Value"],
    ["D14-5 1984 일부 양도 → ⑫ 경로는 isPartialAreaTransfer", { landAcquisitionDate: "1984-05-01", landSec164Value: 350_000_000, isPartialAreaTransfer: true }, "companionAssets.0.isPartialAreaTransfer"],
    ["G-12 토지일 없음", { landAcquisitionDate: undefined }, "companionAssets.0.landAcquisitionDate"],
  ] as const)("%s", (_n, over, path) => {
    expect(landIssues({ ...companion, ...over })).toContain(path);
  });
});
