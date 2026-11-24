/**
 * anchor U-6 (재개) — 비사업용 토지 판정 이력 재개는 폼만 복원하고 결과는 되살리지 않는다 (계획서 `nbl-judgment-menu.ui.plan.md` §8).
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resumeCalculationRecord } from "@/lib/calc/history-resume-entry";
import { useNblJudgmentStore } from "@/lib/stores/nbl-judgment-store";
import { createInitialNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { CalculationRecord } from "@/lib/storage/types";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";

const push = vi.fn();
beforeEach(() => useNblJudgmentStore.getState().reset());
afterEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

const record = (inputData: Record<string, unknown>): CalculationRecord =>
  ({
    id: "r1", userId: "u", taxType: "non_business_land_judgment", title: "t",
    inputData, resultData: { judgment: { isNonBusinessLand: true } },
    taxLawVersion: "2026-06-01", linkedCalculationId: null, clientId: null,
    createdAt: "2026-11-25T00:00:00Z", updatedAt: "2026-11-25T00:00:00Z",
  }) as unknown as CalculationRecord;

describe("비사업용 토지 판정 이력 재개", () => {
  it("[NR-1] 폼을 정규화해 복원하고 메뉴 경로로 이동한다 — 결과·오류·로딩은 비운다", async () => {
    // 이전에 열려 있던 판정이 남아 있어도 재개가 비운다
    useNblJudgmentStore.setState({ result: { judgment: {} } as unknown as NonBusinessLandJudgmentResponse, resultClientId: "x", error: "e", isLoading: true, currentStep: 3 });
    const saved = { ...createInitialNblJudgmentForm(), transferDate: "2026-06-01", assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테헤란로 1", nblUseDetailedJudgment: false, assetKind: "housing" }] };
    const blocked = await resumeCalculationRecord(record(saved as unknown as Record<string, unknown>), { push } as never);
    expect(blocked).toBeNull();
    expect(push).toHaveBeenCalledWith("/calc/non-business-land");
    const s = useNblJudgmentStore.getState();
    expect(s.currentStep).toBe(0);
    expect(s.result).toBeNull();
    expect(s.resultClientId).toBeNull();
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
    expect(s.formData.transferDate).toBe("2026-06-01");
    expect(s.formData.assets[0].addressJibun).toBe("서울 강남구 테헤란로 1");
    // 저장 당시 정밀 판정이 꺼져 있어도 복원 뒤에는 켜져 있다(세 플래그 강제)
    expect(s.formData.assets[0]).toMatchObject({ assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: true });
  });

  it("[NR-2] 자산 2건 record → 첫 건만", async () => {
    const saved = { ...createInitialNblJudgmentForm(), assets: [{ ...makeDefaultAsset(1), addressJibun: "A" }, { ...makeDefaultAsset(2), addressJibun: "B" }] };
    await resumeCalculationRecord(record(saved as unknown as Record<string, unknown>), { push } as never);
    expect(useNblJudgmentStore.getState().formData.assets).toHaveLength(1);
    expect(useNblJudgmentStore.getState().formData.assets[0].addressJibun).toBe("A");
  });
});
