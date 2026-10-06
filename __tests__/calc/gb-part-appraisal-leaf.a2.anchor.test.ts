/**
 * A2 — 일반건물 감정가액·매매사례가액 UI leaf · 복원 정규화 · 사이드바 (설계서 §3.5·3.6·3.9·§7.3·§8)
 *
 * 고정 계약:
 *   L-1 `gbPartAllowedModes` — 원인별 선택지 단일 소스(UI 필터 · ⑧ R8 공유)
 *   L-2 `gbPartCauseModePatch` — 허용되지 않는 모드만 명시 actual (비우지 않는다)
 *   L-3 `gbSeparateOnPatch` / `gbSeparateOnRestorePatch` — 레거시 → 명시 승격 · 두 플래그 소거 · 명시 모드 보존
 *   L-4 `gbSeparateOffPartClearPatch` · `gbSeparateOffHasDataToClear` — 소거 대상과 Dialog 게이트
 *   N-1 `migrateAsset` — 분리 ON + 레거시 감정 플래그 stale 복원 정규화(G-3) · **E2E 시드(플래그 없음)는 지우지 않는다**
 *   S-1 사이드바 — 매매사례 파트 합계 · 비-actual 파트 필요경비 pending · 환산 프리뷰를 가로채지 않는다
 */
import { describe, it, expect, beforeEach } from "vitest";
import { gbShowsAcqStdPrice } from "@/lib/calc/transfer-tax-split-acq-mode";
import {
  gbPartAllowedModes,
  gbPartCauseModePatch,
  gbSeparateOnPatch,
  gbSeparateOnRestorePatch,
  gbSeparateOffPartClearPatch,
  gbSeparateOffHasDataToClear,
  gbUnifiedCarryoverClearPatch,
} from "@/lib/calc/transfer-tax-gb-toggle-patches";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

describe("L-1 gbPartAllowedModes — 원인별 선택지", () => {
  it("상속·증여 = 실거래가 1종 · 이월과세 = {실거래가, 환산취득가} · 매매·신축 = 4종", () => {
    expect(gbPartAllowedModes("inheritance")).toEqual(["actual"]);
    expect(gbPartAllowedModes("gift")).toEqual(["actual"]);
    expect(gbPartAllowedModes("carryover_gift")).toEqual(["actual", "estimated"]);
    expect(gbPartAllowedModes("purchase")).toEqual(["actual", "estimated", "appraisal", "salesCase"]);
    expect(gbPartAllowedModes("newConstruction")).toEqual(["actual", "estimated", "appraisal", "salesCase"]);
    expect(gbPartAllowedModes(undefined)).toHaveLength(4);
  });
});

describe("L-2 gbPartCauseModePatch", () => {
  it("허용되지 않는 모드만 명시 actual로 고정한다 — 비우지 않는다", () => {
    expect(gbPartCauseModePatch("land", "inheritance", "appraisal")).toEqual({ landAcqMode: "actual" });
    expect(gbPartCauseModePatch("building", "gift", "estimated")).toEqual({ buildingAcqMode: "actual" });
    expect(gbPartCauseModePatch("land", "carryover_gift", "salesCase")).toEqual({ landAcqMode: "actual" });
  });
  it("(긍정 짝) 허용되는 모드·매매 전환은 patch 없음 — 이월과세의 환산은 현행 경로 유지", () => {
    expect(gbPartCauseModePatch("land", "carryover_gift", "estimated")).toEqual({});
    expect(gbPartCauseModePatch("land", "inheritance", "actual")).toEqual({});
    expect(gbPartCauseModePatch("land", "purchase", "appraisal")).toEqual({});
  });
});

describe("L-3 분리 ON patch", () => {
  it("레거시 파생값(매매사례 > 감정 > 환산 > 실가)을 두 파트에 승격하고 두 플래그를 끈다", () => {
    expect(gbSeparateOnPatch({ isAppraisalAcquisition: true })).toEqual({
      hasSeperateLandAcquisitionDate: true, landAcqMode: "appraisal", buildingAcqMode: "appraisal",
      isAppraisalAcquisition: false, isSalesCaseAcquisition: false,
    });
    expect(gbSeparateOnPatch({ isSalesCaseAcquisition: true, isAppraisalAcquisition: true })).toMatchObject({ landAcqMode: "salesCase" });
    expect(gbSeparateOnPatch({ useEstimatedAcquisition: true })).toMatchObject({ landAcqMode: "estimated" });
    expect(gbSeparateOnPatch({})).toMatchObject({ landAcqMode: "actual", buildingAcqMode: "actual" });
  });

  it("복원 patch — 플래그가 없으면 빈 patch(E2E 시드 보호), 있으면 명시 모드는 보존·빈 파트만 승격", () => {
    expect(gbSeparateOnRestorePatch({ hasSeperateLandAcquisitionDate: true, landAcqMode: "estimated", buildingAcqMode: "estimated" })).toEqual({});
    expect(gbSeparateOnRestorePatch({ hasSeperateLandAcquisitionDate: false, isAppraisalAcquisition: true })).toEqual({});
    expect(
      gbSeparateOnRestorePatch({ hasSeperateLandAcquisitionDate: true, isAppraisalAcquisition: true, landAcqMode: "actual", buildingAcqMode: "" }),
    ).toEqual({ landAcqMode: "actual", buildingAcqMode: "appraisal", isAppraisalAcquisition: false, isSalesCaseAcquisition: false });
  });
});

describe("L-4 분리 OFF 소거", () => {
  it("소거 patch는 파트 모드·금액 6칸을 모두 비운다", () => {
    expect(gbSeparateOffPartClearPatch()).toEqual({
      landAcqMode: "", buildingAcqMode: "",
      landAcquisitionPrice: "", buildingAcquisitionPrice: "",
      landSalesCaseValue: "", buildingSalesCaseValue: "",
      landDirectExpenses: "", buildingDirectExpenses: "",
    });
  });

  it("지울 값이 있으면 true — 파트 금액 6칸 중 하나라도 양수 / 레거시 파생값과 다른 명시 모드", () => {
    for (const k of ["landAcquisitionPrice", "buildingAcquisitionPrice", "landSalesCaseValue", "buildingSalesCaseValue", "landDirectExpenses", "buildingDirectExpenses"]) {
      expect(gbSeparateOffHasDataToClear({ [k]: "1,000" })).toBe(true);
    }
    expect(gbSeparateOffHasDataToClear({ landAcqMode: "appraisal" })).toBe(true); // 레거시 파생값은 actual
    expect(gbSeparateOffHasDataToClear({ isAppraisalAcquisition: true, landAcqMode: "estimated" })).toBe(true);
  });

  it("그 취득원인에서 허용되지 않는 stale 명시 모드는 지울 값으로 세지 않는다 (상속 토지의 환산 시드 — Dialog 없이 OFF)", () => {
    expect(gbSeparateOffHasDataToClear({ acquisitionCause: "inheritance", landAcqMode: "estimated" })).toBe(false);
    expect(gbSeparateOffHasDataToClear({ acquisitionCause: "purchase", landAcqMode: "estimated" })).toBe(true);
    expect(gbSeparateOffHasDataToClear({ gbBuildingAcquisitionCause: "gift", buildingAcqMode: "appraisal" })).toBe(false);
  });

  it("(긍정 짝) 비었거나 0 / 모드가 레거시 파생값과 같으면 false — Dialog 없이 즉시", () => {
    expect(gbSeparateOffHasDataToClear({})).toBe(false);
    expect(gbSeparateOffHasDataToClear({ landAcquisitionPrice: "0", buildingDirectExpenses: "" })).toBe(false);
    expect(gbSeparateOffHasDataToClear({ landAcqMode: "actual", buildingAcqMode: "actual" })).toBe(false);
    expect(gbSeparateOffHasDataToClear({ isAppraisalAcquisition: true, landAcqMode: "appraisal", buildingAcqMode: "appraisal" })).toBe(false);
  });

  it("이월과세 OFF 정리 patch — 감정·매매사례만 끄고 환산은 건드리지 않는다", () => {
    expect(gbUnifiedCarryoverClearPatch("carryover_gift")).toEqual({ isAppraisalAcquisition: false, isSalesCaseAcquisition: false });
    expect(gbUnifiedCarryoverClearPatch("purchase")).toEqual({});
  });
});

describe("N-1 복원 정규화 (migrateAsset)", () => {
  const gb = (over: Record<string, unknown>) => ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "1999-05-24",
    ...over,
  });

  it("G-3 — 분리 ON + 숨은 감정 플래그 stale → 명시 파트 모드 승격 + 플래그 소거", () => {
    const a = migrateAsset(gb({ hasSeperateLandAcquisitionDate: true, isAppraisalAcquisition: true, landAcqMode: "", buildingAcqMode: "" }));
    expect(a.isAppraisalAcquisition).toBe(false);
    expect(a.landAcqMode).toBe("appraisal");
    expect(a.buildingAcqMode).toBe("appraisal");
  });

  it("사용자가 명시한 파트 모드는 승격으로 덮지 않는다", () => {
    const a = migrateAsset(gb({ hasSeperateLandAcquisitionDate: true, isAppraisalAcquisition: true, landAcqMode: "actual", buildingAcqMode: "" }));
    expect(a.landAcqMode).toBe("actual");
    expect(a.buildingAcqMode).toBe("appraisal");
  });

  it("🔑 E2E 시드 보호 — 분리 ON + 명시 모드 + 플래그 없음은 그대로 둔다 (이월과세 stale 감정 시드도 지우지 않는다)", () => {
    const a = migrateAsset(gb({ hasSeperateLandAcquisitionDate: true, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", landAcqMode: "appraisal", buildingAcqMode: "salesCase" }));
    expect(a.landAcqMode).toBe("appraisal");
    expect(a.buildingAcqMode).toBe("salesCase");
  });

  it("분리 OFF 이월과세 + 감정·매매사례 플래그 → 비운다(R8의 짝) · 환산은 유지", () => {
    const a = migrateAsset(gb({ hasSeperateLandAcquisitionDate: false, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", isAppraisalAcquisition: true, useEstimatedAcquisition: true }));
    expect(a.isAppraisalAcquisition).toBe(false);
    expect(a.useEstimatedAcquisition).toBe(true);
  });

  it("(긍정 짝) 일반건물이 아니면 건드리지 않는다", () => {
    const a = migrateAsset({ ...gb({ hasSeperateLandAcquisitionDate: true, isAppraisalAcquisition: true }), assetKind: "housing" });
    expect(a.isAppraisalAcquisition).toBe(true);
  });
});

describe("S-1 사이드바 (computeTransferPerAssetSummary)", () => {
  beforeEach(() => useCalcWizardStore.getState().reset());
  const rowOf = (over: Record<string, unknown>) => {
    const fd = useCalcWizardStore.getState().formData;
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "general_building",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      actualSalePrice: "2,000,000,000",
      ...over,
    } as unknown as AssetForm;
    return computeTransferPerAssetSummary({ ...fd, assets: [asset] }, null).rows[0];
  };
  const SEP = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1999-05-24", acquisitionDate: "2015-03-01" };

  it("별개 취득 매매사례 파트 — 취득가액 = 토지 매매사례가액 + 건물 실가 (확정값)", () => {
    const r = rowOf({ ...SEP, landAcqMode: "salesCase", landSalesCaseValue: "310,000,000", buildingAcqMode: "actual", buildingAcquisitionPrice: "100,000,000" });
    expect(r.acqPrice).toBe(410_000_000);
    expect(r.acqPending).toBe(false);
  });

  it("매매사례 파트 값이 비면 pending — 부분합을 총액으로 보이지 않는다", () => {
    const r = rowOf({ ...SEP, landAcqMode: "salesCase", landSalesCaseValue: "", buildingAcqMode: "actual", buildingAcquisitionPrice: "100,000,000" });
    expect(r.acqPending).toBe(true);
    expect(r.acqPrice).toBe(0);
  });

  it("분리 ON + 같은 취득일(isSeparateAcquisition 거짓) — 매매사례 파트 값을 놓치지 않는다 (§8.1 ⑤ 보정)", () => {
    const r = rowOf({
      hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-03-01", acquisitionDate: "2015-03-01",
      landAcqMode: "salesCase", landSalesCaseValue: "310,000,000", buildingAcqMode: "salesCase", buildingSalesCaseValue: "100,000,000",
    });
    expect(r.acqPrice).toBe(410_000_000);
  });

  it("감정 파트 + 파트 자본적지출 입력 — 계산에 쓰이지 않으므로 필요경비는 0 · 계산 후 표시", () => {
    const r = rowOf({ ...SEP, landAcqMode: "appraisal", landAcquisitionPrice: "300,000,000", buildingAcqMode: "actual", buildingAcquisitionPrice: "100,000,000", landDirectExpenses: "7,000,000", buildingDirectExpenses: "3,000,000" });
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });

  it("(긍정 짝) 두 파트 실가면 파트 자본적지출이 필요경비로 합산된다 — 종전 그대로", () => {
    const r = rowOf({ ...SEP, landAcqMode: "actual", landAcquisitionPrice: "300,000,000", buildingAcqMode: "actual", buildingAcquisitionPrice: "100,000,000", landDirectExpenses: "7,000,000", buildingDirectExpenses: "3,000,000" });
    expect(r.expense).toBe(10_000_000);
    expect(r.expensePending).toBe(false);
  });

  it("분리 OFF 자산 단위 감정(레거시 플래그) — 자본적지출 입력과 무관하게 pending", () => {
    const r = rowOf({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "410,000,000", capitalExpenditure: "5,000,000" });
    expect(r.acqPrice).toBe(410_000_000);
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });

  it("분리 OFF stale 파트 모드(explicit)는 사이드바 갈래를 만들지 않는다 (`gbPartModes` 공유)", () => {
    const r = rowOf({ landAcqMode: "appraisal", buildingAcqMode: "appraisal", fixedAcquisitionPrice: "410,000,000", capitalExpenditure: "5,000,000" });
    expect(r.expense).toBe(5_000_000);
    expect(r.expensePending).toBe(false);
  });
});

describe("U — 분리 OFF stale 파트 모드에서 기준시가 칸 노출 (`gbPartModes` 교체 효과)", () => {
  it("stale explicit estimated + 레거시 플래그 없음 → 칸이 닫힌다(종전에는 열렸다)", () => {
    expect(gbShowsAcqStdPrice({ hasSeperateLandAcquisitionDate: false, landAcqMode: "estimated", buildingAcqMode: "estimated" })).toBe(false);
  });
  it("레거시 감정 → 열린다 / 분리 ON explicit 감정 → 열린다 / 실가 일괄(안분 비필요) → 닫힌다", () => {
    expect(gbShowsAcqStdPrice({ isAppraisalAcquisition: true })).toBe(true);
    expect(gbShowsAcqStdPrice({ hasSeperateLandAcquisitionDate: true, landAcqMode: "appraisal", buildingAcqMode: "actual" })).toBe(true);
    expect(gbShowsAcqStdPrice({})).toBe(false);
  });
});
