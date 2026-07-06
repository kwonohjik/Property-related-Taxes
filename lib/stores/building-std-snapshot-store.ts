/**
 * 건물 기준시가 모달 입력 스냅샷 스토어.
 *
 * "건물 기준시가 계산" 모달(BuildingStdPriceModalButton)이 계산·적용 시점의 폼 입력 전체를
 * snapshotKey로 보관 → 재오픈 시 복원(정정 지원). 결과 총액만 자산에 저장하던 한계 보완.
 *
 * - EstateItem/AssetForm 타입·initial·normalize·Zod에 진입하지 않는 별도 UI 스토어(엔진/API 무관).
 * - key 규약: 상증 `bsp-estate-${item.id}` / 양도 `bsp-${asset.assetId}-{gb|cb}-{acq|transfer}`
 *   · PHD 3시점 계산기: `bsp-${asset.assetId}-phd-{acq|first|transfer}` (split 상가는 `…-commercial` 접미).
 * - sessionStorage persist → 새로고침 후에도 복원(키 = 영속 id 기반).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

interface BuildingStdSnapshotState {
  snapshots: Record<string, BuildingStdPriceFormState>;
  saveSnapshot: (key: string, snapshot: BuildingStdPriceFormState) => void;
}

export const useBuildingStdSnapshotStore = create<BuildingStdSnapshotState>()(
  persist(
    (set) => ({
      snapshots: {},
      saveSnapshot: (key, snapshot) =>
        set((s) => ({ snapshots: { ...s.snapshots, [key]: snapshot } })),
    }),
    {
      name: "building-std-snapshots",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
