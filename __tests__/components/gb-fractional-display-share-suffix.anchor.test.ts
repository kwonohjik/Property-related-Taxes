/**
 * 결과 화면·신고서 표시 계층 × 지분(%) 분할 접미사 — anchor.
 *
 * 대상: `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts`
 *       `components/calc/results/transfer/FilingFormTableHelpers.ts` (`getAcqDateForCard`)
 *
 * ## 무엇을 잡는가
 *
 * PR #1163이 **라우트 표시**(`buildApportionment`)의 접미사 미인식을 고쳤지만, **같은 뿌리가
 * UI 계층에 남아 있었다**. 정확 비교(`propertyId === "land"`)가 `land#0`에서 항상 false라:
 *
 *   · 상세명세서 자산별 산식이 통째로 `undefined` → 화면에 **산식이 안 뜬다**
 *   · `getAcqDateForCard`가 `building2#0`을 default로 흘려 **증축일 대신 원건물 취득일** 표시
 *
 * ## 이 파일의 판정 방식
 *
 * 🔑 **「단건 결과와 문자열이 같은가」** 로 본다. 단건은 이미 검증된 동작이므로, 지분 카드가
 *    같은 산식을 내면 접미사가 무해해진 것이고, `undefined`면 회귀다.
 *    (부정 단언 「undefined가 아니다」만 두면 산식이 **틀려도** 통과한다.)
 */
import { describe, it, expect } from "vitest";
import {
  buildGbTransferFormula,
  buildGbAcquisitionFormula,
  buildGbExpenseFormula,
} from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { getAcqDateForCard } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ── 픽스처 ────────────────────────────────────────────────────────────
const TOTAL_TRANSFER = 1_000_000_000;

const breakdown = (propertyId: string, over: Partial<PerPropertyBreakdown> = {}) =>
  ({
    propertyId,
    propertyLabel: propertyId,
    transferPrice: 300_000_000,
    acquisitionPrice: 150_000_000,
    necessaryExpense: 1_800_000,
    capitalExpenditureForDisplay: 0,
    ...over,
  }) as unknown as PerPropertyBreakdown;

/** 환산 모드(사례 31) 명세 — 증축 없음. */
const gbEstimated = (assetCards: { propertyId: string; acquisitionPrice: number; transferPrice: number }[]) =>
  ({
    landStdTotal: 200_000_000,
    buildingStdTotal: 200_000_000,
    acqLandStdTotal: 100_000_000,
    acqBuilding1StdTotal: 100_000_000,
    estimatedDeduction: { landBase: 60_000_000, buildingBase: 60_000_000 },
    assetCards,
  }) as unknown as GeneralBuildingOutput;

/** 사례 33 일괄+증축(원건물 실가) 명세 — 짝 카드 조회가 걸리는 경로. */
const gbBundledExtension = (
  assetCards: { propertyId: string; acquisitionPrice: number; transferPrice: number }[],
) =>
  ({
    landStdTotal: 200_000_000,
    buildingStdTotal: 200_000_000,
    extensionStdTotal: 50_000_000,
    acqLandStdTotal: 100_000_000,
    acqBuilding1StdTotal: 100_000_000,
    acqExtensionStdTotal: 30_000_000,
    bundledActualAcquisitionPrice: 400_000_000,
    assetCards,
  }) as unknown as GeneralBuildingOutput;

const bundledAsset = {
  assetKind: "general_building",
  gbHasExtension: true,
  useEstimatedAcquisition: false,
  acquisitionDate: "2009-03-01",
  gbExtensionDate: "2012-06-01",
} as unknown as AssetForm;

const estimatedAsset = {
  assetKind: "general_building",
  acquisitionDate: "2009-03-01",
  gbExtensionDate: "2012-06-01",
} as unknown as AssetForm;

describe("표시 계층 × 지분 접미사", () => {
  // ══════════════════════════════════════════════════════════════════
  // 상세명세서 산식 — 단건과 같은 문자열이 나와야 한다
  // ══════════════════════════════════════════════════════════════════
  describe("DetailedStatementFormulaBuilders — 지분 카드도 산식을 만든다", () => {
    const cardsSingle = [
      { propertyId: "land", acquisitionPrice: 150_000_000, transferPrice: 300_000_000 },
      { propertyId: "building", acquisitionPrice: 150_000_000, transferPrice: 300_000_000 },
    ];
    const cardsShared = [
      { propertyId: "land#0", acquisitionPrice: 150_000_000, transferPrice: 300_000_000 },
      { propertyId: "building#0", acquisitionPrice: 150_000_000, transferPrice: 300_000_000 },
    ];

    it.each(["land", "land_business", "land_nbl", "building"])(
      "%s#0 산식 === 접미사 없는 단건 산식",
      (baseId) => {
        const single = buildGbTransferFormula(
          breakdown(baseId),
          gbEstimated(cardsSingle),
          TOTAL_TRANSFER,
        );
        const shared = buildGbTransferFormula(
          breakdown(`${baseId}#0`),
          gbEstimated(cardsShared),
          TOTAL_TRANSFER,
        );
        // 양성 대조군 — 단건이 §166⑥ 안분 산식을 실제로 만든다(fallback 문자열이 아니다)
        expect(single).toContain("×");
        expect(shared).toBe(single);
      },
    );

    it("취득가액 산식(환산 §176의2②)도 접미사와 무관하다", () => {
      const single = buildGbAcquisitionFormula(
        breakdown("land"),
        gbEstimated(cardsSingle),
        estimatedAsset,
      );
      const shared = buildGbAcquisitionFormula(
        breakdown("land#1"),
        gbEstimated(cardsShared),
        estimatedAsset,
      );
      expect(single).toContain("×");
      expect(shared).toBe(single);
    });

    it("필요경비 산식(개산공제 §163⑥)도 접미사와 무관하다", () => {
      const single = buildGbExpenseFormula(breakdown("land"), gbEstimated(cardsSingle));
      const shared = buildGbExpenseFormula(breakdown("land#2"), gbEstimated(cardsShared));
      expect(single).toContain("3%");
      expect(shared).toBe(single);
    });

    it("증축분(building2) 산식도 접미사와 무관하다", () => {
      const p = { transferPrice: 100_000_000, acquisitionPrice: 60_000_000 };
      const single = buildGbAcquisitionFormula(
        breakdown("building2", p),
        gbEstimated(cardsSingle),
        estimatedAsset,
      );
      const shared = buildGbAcquisitionFormula(
        breakdown("building2#0", p),
        gbEstimated(cardsShared),
        estimatedAsset,
      );
      expect(single).toBeDefined();
      expect(shared).toBe(single);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 🔑 짝 카드는 **같은 지분**에서 찾는다 — base id만 보면 값이 섞인다
  // ══════════════════════════════════════════════════════════════════
  describe("일괄 실가 취득가 안분 — 지분 간 값이 섞이지 않는다", () => {
    /**
     * 지분마다 `bundledAcquisitionPrice`가 다르다(④ 변환이 × 지분율 한다).
     * 토지 산식의 분자는 「그 지분의 토지 + 그 지분의 building1」이어야 한다.
     *
     * 지분 0: 토지 240,000,000 + 건물1 160,000,000 = 400,000,000
     * 지분 1: 토지 120,000,000 + 건물1  80,000,000 = 200,000,000
     *
     * base id만 보고 `find`하면 **지분 1의 토지 산식이 지분 0의 건물 카드**를 집어
     * 400,000,000 대신 240,000,000 + 160,000,000이 되어 조용히 틀린다.
     */
    const cards = [
      { propertyId: "land#0", acquisitionPrice: 240_000_000, transferPrice: 300_000_000 },
      { propertyId: "building1#0", acquisitionPrice: 160_000_000, transferPrice: 300_000_000 },
      { propertyId: "building2#0", acquisitionPrice: 40_000_000, transferPrice: 60_000_000 },
      { propertyId: "land#1", acquisitionPrice: 120_000_000, transferPrice: 200_000_000 },
      { propertyId: "building1#1", acquisitionPrice: 80_000_000, transferPrice: 200_000_000 },
      { propertyId: "building2#1", acquisitionPrice: 20_000_000, transferPrice: 40_000_000 },
    ];

    it("지분 0 토지 — 일괄 취득가 400,000,000", () => {
      const f = buildGbAcquisitionFormula(
        breakdown("land#0", { acquisitionPrice: 240_000_000 }),
        gbBundledExtension(cards),
        bundledAsset,
      );
      expect(f).toContain("400,000,000");
    });

    it("🔑 지분 1 토지 — 일괄 취득가 200,000,000 (지분 0의 160,000,000을 집지 않는다)", () => {
      const f = buildGbAcquisitionFormula(
        breakdown("land#1", { acquisitionPrice: 120_000_000 }),
        gbBundledExtension(cards),
        bundledAsset,
      );
      expect(f).toContain("200,000,000");
      expect(f).not.toContain("400,000,000");
    });

    it("🔑 지분 1 building1 — 잔액 산식의 토지가 지분 1의 120,000,000", () => {
      const f = buildGbAcquisitionFormula(
        breakdown("building1#1", { acquisitionPrice: 80_000_000 }),
        gbBundledExtension(cards),
        bundledAsset,
      );
      expect(f).toContain("토지 120,000,000");
      expect(f).not.toContain("토지 240,000,000");
    });

    it("🔑 지분 1 building2 — 자기 지분의 양도가액 40,000,000을 분자로 쓴다", () => {
      const f = buildGbAcquisitionFormula(
        breakdown("building2#1", { acquisitionPrice: 20_000_000, transferPrice: 40_000_000 }),
        gbBundledExtension(cards),
        bundledAsset,
      );
      // buildAllocationFormula(b2Transfer, acqExtStd, [extStd], acq)
      expect(f).toContain("40,000,000 × 30,000,000");
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 신고서 취득일 — 증축분 카드가 증축일을 쓴다
  // ══════════════════════════════════════════════════════════════════
  describe("getAcqDateForCard — 카드별 취득일", () => {
    it("대조군(단건) — building2는 증축일", () => {
      expect(getAcqDateForCard(estimatedAsset, "building2")).toBe("2012-06-01");
      expect(getAcqDateForCard(estimatedAsset, "building")).toBe("2009-03-01");
      expect(getAcqDateForCard(estimatedAsset, "land")).toBe("2009-03-01");
    });

    it("🔑 지분 카드도 같다 — 접미사가 증축일 분기를 삼키지 않는다", () => {
      expect(getAcqDateForCard(estimatedAsset, "building2#0")).toBe("2012-06-01");
      expect(getAcqDateForCard(estimatedAsset, "building2#3")).toBe("2012-06-01");
      expect(getAcqDateForCard(estimatedAsset, "building1#1")).toBe("2009-03-01");
      expect(getAcqDateForCard(estimatedAsset, "land_nbl#1")).toBe("2009-03-01");
    });
  });
});
