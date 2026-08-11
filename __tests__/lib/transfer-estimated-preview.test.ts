/**
 * 일반건물·상가 **환산취득가액 계산 전 프리뷰** — 사이드바 통합 anchor.
 *
 * 두 자산 종류는 전용 환산 산식을 써서 공통 §176의2② 식으로 미리 계산할 수 없었고, 그래서
 * 계산 전에는 «계산 후 표시»에 머물렀다. `lib/calc/transfer-estimated-preview.ts`가 route와
 * **같은 엔진 함수**를 불러 그 값을 미리 산출한다.
 *
 * ⚠️ 여기의 기대값은 **엔진 산출값**이다 — 손으로 계산해 넣은 값이 아니다. 값이 바뀌면 엔진이
 *    바뀐 것이므로, 기대값을 고쳐 맞추기 전에 **엔진 변경이 의도된 것인지** 먼저 확인할 것.
 *    「계산 전 = 계산 후」 동일성은 E2E(`transfer-sidebar-estimated-preview.spec.ts`)가 지킨다.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function compute() {
  const { formData, result } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, result).rows[0];
}

/** 일반건물 환산 시드 (사례 31 — `general-building-97-2-swap.spec.ts`와 같은 물건). */
function seedGb(extra: Partial<AssetForm> = {}) {
  useCalcWizardStore.setState((st) => ({
    formData: {
      ...st.formData,
      transferDate: "2023-02-19",
      contractTotalPrice: "925000000",
      assets: [{
        ...makeDefaultAsset(1),
        assetKind: "general_building",
        acquisitionCause: "purchase",
        acquisitionDate: "1999-05-24",
        useEstimatedAcquisition: true,
        gbLandArea: "85",
        gbBuildingArea: "180.96",
        gbBuildingFootprintArea: "90.48",
        gbTransferLandPricePerSqm: "10830000",
        gbTransferBuildingValue: "20629440",
        gbAcqLandPricePerSqm: "2800000",
        gbAcqBuildingValue: "28144700",
        gbBuildingAcquisitionCause: "purchase",
        gbZoneType: "commercial",
        gbIsMetropolitan: true,
        actualSalePrice: "925000000",
        ...extra,
      }],
    },
  }));
}

/** 상가 환산 시드 (호별고시 후 취득 — §176의2②2호 경로). */
function seedCb(extra: Partial<AssetForm> = {}) {
  useCalcWizardStore.setState((st) => ({
    formData: {
      ...st.formData,
      transferDate: "2023-02-19",
      contractTotalPrice: "925000000",
      assets: [{
        ...makeDefaultAsset(1),
        assetKind: "commercial_building",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-05-24",
        useEstimatedAcquisition: true,
        actualSalePrice: "925000000",
        cbExclusiveArea: "100",
        cbSharedArea: "50",
        cbLandArea: "30",
        cbUnitPriceAtTransfer: "3000000",
        cbUnitPriceAtFirstOrAcq: "1200000",
        cbLandPricePerSqmAtTransfer: "5000000",
        cbLandPricePerSqmAtAcq: "2000000",
        ...extra,
      }],
    },
  }));
}

beforeEach(() => {
  useCalcWizardStore.getState().reset();
});

describe("환산 프리뷰 — 일반건물 (§176의2② · §163⑥ · §104의3)", () => {
  // C-1: 종전에는 취득가액·필요경비 둘 다 «계산 후 표시»였다.
  it("C-1 계산 전 취득가액·필요경비 산출 (pending 해소)", () => {
    seedGb();
    const r = compute();
    expect(r.acqPrice).toBe(261_569_512);
    expect(r.expense).toBe(7_984_341);
    expect(r.acqPending).toBe(false);
    expect(r.expensePending).toBe(false);
  });

  /**
   * C-2: §97②2호 단서 swap — 나목(자본적지출+양도비)이 가목(환산취득가+개산공제)보다 크면
   * 나목을 필요경비 전체로 채택하고 환산취득가액은 차감하지 않는다. 프리뷰도 그 판정을
   * 재사용하므로(`resolveGeneralBuildingSwap`) 취득가액이 0으로 떨어진다.
   */
  it("C-2 swap 발동 — 취득가액 0 · 필요경비 = 나목 전액", () => {
    seedGb({ capitalExpenditure: "800000000", transferExpense: "10000000" });
    const r = compute();
    expect(r.acqPrice).toBe(0);
    expect(r.expense).toBe(810_000_000);
  });

  // C-3: 입력이 덜 찼으면 반쪽 값을 보여주지 않는다 — «계산 후 표시» 유지.
  it("C-3 취득시 기준시가 미입력 — pending 유지 (부분 입력 프리뷰 금지)", () => {
    seedGb({ gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
    const r = compute();
    expect(r.acqPrice).toBe(0);
    expect(r.acqPending).toBe(true);
  });

  /**
   * C-4: 환산 모드에서는 자산 전체 실가 칸이 UI에서 숨겨지지만 폼 값은 보존된다(토글 복원용).
   * 그 stale 값이 표시되면 **계산에 쓰이지 않는 금액**을 보여주는 것이라, 환산값이 우선한다.
   */
  it("C-4 stale 실가 취득가액이 남아 있어도 환산값이 우선", () => {
    seedGb({ fixedAcquisitionPrice: "500000000" });
    expect(compute().acqPrice).toBe(261_569_512);
  });
});

describe("환산 프리뷰 — 상가·오피스텔 (§164⑥·§164⑧)", () => {
  // C-5: STEP 0.35가 되돌리는 플래그 탓에 계산 후에도 못 읽던 값을, 계산 전에 산출한다.
  it("C-5 계산 전 취득가액·필요경비 산출", () => {
    seedCb();
    const r = compute();
    expect(r.acqPrice).toBe(370_000_000);
    expect(r.expense).toBe(5_400_000);
    expect(r.acqPending).toBe(false);
  });

  // C-6: 취득시 개별공시지가 미입력 → payload 미완성 → pending 유지.
  it("C-6 취득시 개별공시지가 미입력 — pending 유지", () => {
    seedCb({ cbLandPricePerSqmAtAcq: "" });
    const r = compute();
    expect(r.acqPrice).toBe(0);
    expect(r.acqPending).toBe(true);
  });

  /**
   * C-7: 상속 취득 상가는 환산이 아니라 상속개시일 평가액이 취득가액이다(§163⑨).
   * `applyCommercialBuildingStep`이 그 경로를 건너뛰므로 프리뷰도 나오지 않아야 한다 —
   * 환산값을 보여주면 실제로 쓰이지 않는 금액이다.
   */
  it("C-7 상속 취득 — 환산 프리뷰 미적용 (§163⑨ 평가액 경로)", () => {
    seedCb({ acquisitionCause: "inheritance" });
    expect(compute().acqPrice).not.toBe(370_000_000);
  });
});

describe("환산 프리뷰 — 적용 범위 가드", () => {
  // C-8: 부담부증여는 §159가 취득가액을 따로 정한다 — 환산 프리뷰 대상이 아니다.
  it("C-8 부담부증여 — 프리뷰 미적용", () => {
    seedGb({ transferType: "burdened_gift" });
    expect(compute().acqPrice).not.toBe(261_569_512);
  });

  /**
   * C-9: 멀티 자산은 양도가액이 안분으로 갈리고 그 안분값이 환산 분자에 들어간다.
   * 자산 하나만 떼어 계산하면 실제와 다른 값이 나오므로 프리뷰하지 않는다.
   */
  it("C-9 멀티 자산 — 프리뷰 미적용", () => {
    seedGb();
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [...st.formData.assets, { ...makeDefaultAsset(2), assetKind: "housing" }],
      },
    }));
    expect(compute().acqPrice).not.toBe(261_569_512);
  });

  // C-10: 실가 모드는 프리뷰 대상이 아니다 — 폼 값이 그대로 취득가액이다(직전 작업 경로).
  it("C-10 실가 모드 — 폼 값 그대로", () => {
    seedGb({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000" });
    expect(compute().acqPrice).toBe(500_000_000);
  });
});
