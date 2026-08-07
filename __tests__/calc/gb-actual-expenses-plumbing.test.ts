/**
 * anchor — 일반건물 **실가 경로** 필요경비 배관 (P-3 Phase 1 · ④⑫)
 *
 * 계획서: `docs/02-design/features/gb-actual-path-sale-split-noop.plan.md` §2 · §6.1
 *
 * ## 무엇을 잡는가
 *
 * 엔진 anchor(`general-building-actual-expenses-reach.anchor.test.ts`)는 payload를 **직접 만들어**
 * 넣는다. 그래서 **폼에서 그 payload까지 값이 도달하는지**는 검증하지 못한다 — 이번 결함(P-3)이
 * 정확히 그 구간이었다: 엔진은 받을 준비가 돼 있는데(`landDirectExpenses` 경로는 동작했다)
 * **API 변환이 필드를 싣지 않아** 값이 사라졌다.
 *
 * ⇒ 폼 → **④ `buildGeneralBuildingValuation`(실가 분기)** → **⑫ Zod** 까지 통과시킨다.
 *
 * ⚠️ 환산 분기는 종전부터 실었으므로(`transfer-tax-api-gb.ts:279-289`) **두 분기를 대조**한다 —
 *    「경로에 따라 다르다」가 이 계열 결함의 공통 모양이다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    fixedAcquisitionPrice: "500,000,000",
    gbLandArea: "200",
    gbBuildingFootprintArea: "100",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "3,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    // 현행 UI 입력 칸 — `AssetSectionExpense.tsx:58·80`
    capitalExpenditure: "30,000,000",
    transferExpense: "10,000,000",
    ...over,
  } as AssetForm;
}

function payload(over: Partial<AssetForm> = {}) {
  return buildGeneralBuildingValuation(asset(over)) as Record<string, unknown>;
}

describe("④ 실가 경로 payload가 자본적지출·양도비를 싣는다 (P-3)", () => {
  it("기본 상태는 실가 경로다 — 전제 확인", () => {
    expect(payload().actualPriceMode).toBe(true);
  });

  it("🔴 자본적지출·양도비가 payload에 있다", () => {
    const p = payload();
    expect(p.capitalExpenditure).toBe(30_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });

  it("미입력이면 키 자체가 없다 (0을 싣지 않는다 — legacy 후퇴가 가능해야 한다)", () => {
    const p = payload({ capitalExpenditure: "", transferExpense: "" } as Partial<AssetForm>);
    expect(p.capitalExpenditure).toBeUndefined();
    expect(p.transferExpense).toBeUndefined();
  });
});

describe("⑫ Zod가 두 필드를 통과시킨다 (침묵 strip 금지)", () => {
  it("파싱 후에도 값이 남는다", () => {
    const parsed = generalBuildingValuationSchema.parse(payload());
    expect((parsed as Record<string, unknown>).capitalExpenditure).toBe(30_000_000);
    expect((parsed as Record<string, unknown>).transferExpense).toBe(10_000_000);
  });
});

/**
 * ⑧ V-5b — 실가 경로의 취득시 기준시가 필수 판정 (P-2 Phase 2)
 *
 * 🔑 **엔진 `requireAcqStd`와 같은 조건이어야 한다.** 어긋나면 「validate 통과 → 엔진 throw」
 *    또는 그 반대가 된다(메모리 `feedback_validation_sync_8th_point`).
 *    엔진 쪽 계약은 `__tests__/tax-engine/transfer/general-building-actual-acq-basis.anchor.test.ts`
 *    A-10이 같은 케이스로 잡는다.
 */
describe("⑧ V-5b — 실가 경로 취득시 기준시가 (P-2)", () => {
  const noAcqStd = { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" } as Partial<AssetForm>;

  it("일괄 취득가액이 있으면 요구한다", () => {
    const err = validateGeneralBuildingAsset(
      asset({ ...noAcqStd, fixedAcquisitionPrice: "500,000,000" }), "자산",
    );
    expect(err).toContain("취득시 토지 공시지가");
  });

  it("자본적지출이 있으면 요구한다", () => {
    const err = validateGeneralBuildingAsset(
      asset({ ...noAcqStd, fixedAcquisitionPrice: "", capitalExpenditure: "30,000,000" }), "자산",
    );
    expect(err).toContain("취득시 토지 공시지가");
  });

  it("🔴 거짓 차단 금지 — 파트별 실지취득가액이 둘 다 있으면 요구하지 않는다", () => {
    const err = validateGeneralBuildingAsset(
      asset({
        ...noAcqStd,
        fixedAcquisitionPrice: "500,000,000",
        capitalExpenditure: "",
        transferExpense: "",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "200,000,000",
      }),
      "자산",
    );
    // null(전건 통과)이면 당연히 통과 — 무관한 다른 오류가 나와도 「취득시」만 아니면 된다.
    expect(err ?? "").not.toContain("취득시");
  });

  it("🔴 거짓 차단 금지 — 취득 축 안분이 없으면(취득가액·자본적지출 모두 없음) 요구하지 않는다", () => {
    const err = validateGeneralBuildingAsset(
      asset({
        ...noAcqStd,
        fixedAcquisitionPrice: "",
        capitalExpenditure: "",
        transferExpense: "10,000,000",
      }),
      "자산",
    );
    // null(전건 통과)이면 당연히 통과 — 무관한 다른 오류가 나와도 「취득시」만 아니면 된다.
    expect(err ?? "").not.toContain("취득시");
  });
});

describe("🔑 경로 대조 — 환산 분기도 같이 싣는다", () => {
  it("환산 경로 payload에도 두 필드가 있다", () => {
    const p = payload({
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
    } as Partial<AssetForm>);
    expect(p.actualPriceMode).toBeUndefined(); // 환산 분기
    expect(p.capitalExpenditure).toBe(30_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });
});
