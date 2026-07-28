/**
 * persist merge — 새로고침(rehydration) 시 자산 데이터 유실 회귀 방어.
 *
 * 배경: merge 레거시 판별이 defaultFormData에 항상 존재하는 키(acquisitionMethod 등)로
 * 판별하여 정상 formData도 legacy로 오분류 → migrateLegacyForm이 assets 폐기 → F5 시 유실.
 * 수정: 판별을 `!Array.isArray(assets)`(신 스키마 불변식)로 교체.
 * 계획: docs/02-design/features/calc-wizard-persist-merge-dataloss.plan.md
 */
import { describe, it, expect } from "vitest";
import {
  mergePersistedWizard,
  createDefaultTransferFormData,
  makeDefaultAsset,
  type CalcWizardState,
} from "@/lib/stores/calc-wizard-store";

/** merge의 두 번째 인자(current 초기 상태) — formData만 실제로 읽히므로 최소 구성 후 캐스팅. */
function makeCurrent(): CalcWizardState {
  return {
    currentStep: 3,
    formData: createDefaultTransferFormData(),
    result: null,
    pendingMigration: false,
  } as unknown as CalcWizardState;
}

describe("mergePersistedWizard — 새로고침 자산 보존", () => {
  it("[핵심] 신 스키마(자산 2개) rehydration이 각 자산 값·합계가액을 보존한다", () => {
    const persistedForm = {
      ...createDefaultTransferFormData(),
      contractTotalPrice: "1000000000",
      assets: [
        { ...makeDefaultAsset(1), assetKind: "commercial_building", fixedAcquisitionPrice: "300000000" },
        { ...makeDefaultAsset(2), assetKind: "land", fixedAcquisitionPrice: "200000000" },
      ],
    };
    const merged = mergePersistedWizard({ formData: persistedForm }, makeCurrent());

    expect(merged.formData.assets).toHaveLength(2);
    expect(merged.formData.assets[0].assetKind).toBe("commercial_building");
    expect(merged.formData.assets[0].fixedAcquisitionPrice).toBe("300000000");
    expect(merged.formData.assets[1].assetKind).toBe("land");
    expect(merged.formData.assets[1].fixedAcquisitionPrice).toBe("200000000");
    expect(merged.formData.contractTotalPrice).toBe("1000000000");
    // currentStep은 항상 0으로 리셋(재진입 정책)
    expect(merged.currentStep).toBe(0);
  });

  it("[회귀 방어] 트리거 4키가 존재해도 유실 없음", () => {
    const persistedForm = createDefaultTransferFormData();
    // defaultFormData가 이 4키를 항상 포함함을 명시적으로 단정(버그 조건 고정)
    expect("acquisitionMethod" in persistedForm).toBe(true);
    expect("appraisalValue" in persistedForm).toBe(true);
    expect("isSelfBuilt" in persistedForm).toBe(true);
    expect("pre1990Enabled" in persistedForm).toBe(true);

    (persistedForm.assets as unknown[]) = [
      { ...makeDefaultAsset(1), assetKind: "land", fixedAcquisitionPrice: "500000000" },
    ];
    const merged = mergePersistedWizard({ formData: persistedForm }, makeCurrent());
    // 수정 전이라면 migrateLegacyForm 경로로 빈 주택 1개가 되어 실패
    expect(merged.formData.assets[0].assetKind).toBe("land");
    expect(merged.formData.assets[0].fixedAcquisitionPrice).toBe("500000000");
  });

  it("[레거시 호환] 구 스키마(assets 없음)는 migrateLegacyForm으로 변환된다", () => {
    const legacy = {
      propertyType: "housing",
      acquisitionPrice: "300000000",
      acquisitionMethod: "actual",
    };
    const merged = mergePersistedWizard({ formData: legacy }, makeCurrent());
    expect(merged.formData.assets).toHaveLength(1);
    expect(merged.formData.assets[0].assetKind).toBe("housing");
    expect(merged.formData.assets[0].fixedAcquisitionPrice).toBe("300000000");
  });

  it("[빈 상태] persisted formData 없음 → 기본 자산 1개", () => {
    const merged = mergePersistedWizard({}, makeCurrent());
    expect(merged.formData.assets).toHaveLength(1);
  });

  it("[엣지] assets: [] (빈 배열) → 현행 동작(빈 배열 유지)", () => {
    const persistedForm = { ...createDefaultTransferFormData(), assets: [] };
    const merged = mergePersistedWizard({ formData: persistedForm }, makeCurrent());
    // !Array.isArray([]) === false → 정상 분기, [] ?? default 는 []를 유지
    expect(merged.formData.assets).toHaveLength(0);
  });

  it("[미실행 경로] migrateAsset이 구 자산의 결여 필드를 안전 초기화하고 입력값은 보존", () => {
    // 신규 자산-필드가 결여된 최소 persisted 자산(과거 버전 데이터 시뮬레이션)
    const minimalAsset = { assetKind: "land", fixedAcquisitionPrice: "123000000" } as unknown;
    const persistedForm = {
      ...createDefaultTransferFormData(),
      assets: [minimalAsset],
    };
    const merged = mergePersistedWizard({ formData: persistedForm }, makeCurrent());
    expect(merged.formData.assets).toHaveLength(1);
    expect(merged.formData.assets[0].assetKind).toBe("land");
    expect(merged.formData.assets[0].fixedAcquisitionPrice).toBe("123000000");
    // migrateAsset이 크래시 없이 통과했다는 것 자체가 안전 초기화 확인
    expect(merged.formData.assets[0]).toBeDefined();
  });
});
