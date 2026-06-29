/**
 * 마법사 재진입 시 첫 스텝부터 시작 — currentStep 미persist anchor
 *
 * 계획서: docs/00-pm/wizard-step-reset-on-reentry.plan.md §7-1
 * 버그: store가 currentStep을 sessionStorage에 저장·복원 → 홈 재진입 시 이전 스텝(예: 양도세 "감면·공제")이 열림.
 * 수정: 양도세=merge에서 currentStep:0 명시 / 주식·종부세=onRehydrateStorage에서 currentStep=0.
 *
 * 핵심: sessionStorage에 구 코드가 기록했을 currentStep:2(잔존값)를 주입하고 rehydrate해도
 *       currentStep===0이어야 한다. formData는 보존. (zustand v5 기본 merge가 잔존값을 복원하던 함정 차단)
 */
import { beforeEach, describe, expect, it } from "vitest";

import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";

beforeEach(() => {
  sessionStorage.clear();
});

describe("재진입 시 currentStep 0 강제 (잔존값 무시)", () => {
  it("S1: 양도세 — sessionStorage currentStep:2 주입 후 rehydrate → 0, formData 보존", async () => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({
        state: {
          currentStep: 2,
          formData: { transferDate: "2021-06-01" },
          pendingMigration: false,
        },
        version: 0,
      }),
    );
    await useCalcWizardStore.persist.rehydrate();
    expect(useCalcWizardStore.getState().currentStep).toBe(0);
    expect(useCalcWizardStore.getState().formData.transferDate).toBe("2021-06-01");
  });

  it("S2: 주식양도세 — currentStep:2 주입 후 rehydrate → 0 (onRehydrate 강제)", async () => {
    sessionStorage.setItem(
      "stock-transfer-tax-wizard",
      JSON.stringify({
        state: { currentStep: 2, formData: {} },
        version: 0,
      }),
    );
    await useStockTransferStore.persist.rehydrate();
    expect(useStockTransferStore.getState().currentStep).toBe(0);
  });

  it("S3: 종부세 — currentStep:2 주입 후 rehydrate → 0 (onRehydrate 강제)", async () => {
    sessionStorage.setItem(
      "comprehensive-tax-wizard",
      JSON.stringify({
        state: { currentStep: 2, formData: {} },
        version: 0,
      }),
    );
    await useComprehensiveWizardStore.persist.rehydrate();
    expect(useComprehensiveWizardStore.getState().currentStep).toBe(0);
  });

  it("S4: 양도세 — 구버전 formData(legacy 마이그레이션 트리거) + currentStep:3 → 마이그레이션 + step 0", async () => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({
        state: {
          currentStep: 3,
          // propertyType: legacy 단일 자산 폼 → migrateLegacyForm 트리거
          formData: { propertyType: "apartment", transferDate: "2020-01-01" },
          pendingMigration: false,
        },
        version: 0,
      }),
    );
    await useCalcWizardStore.persist.rehydrate();
    const state = useCalcWizardStore.getState();
    expect(state.currentStep).toBe(0);
    // 마이그레이션 후 assets 배열이 생성됨 (legacy 단일 폼 → assets[0])
    expect(Array.isArray(state.formData.assets)).toBe(true);
    expect(state.formData.assets.length).toBeGreaterThanOrEqual(1);
  });
});
