/**
 * 건물 기준시가 모달 입력 스냅샷 스토어.
 *
 * "건물 기준시가 계산" 모달(BuildingStdPriceModalButton)이 계산·적용 시점의 폼 입력 전체를
 * snapshotKey로 보관 → 재오픈 시 복원(정정 지원). 결과 총액만 자산에 저장하던 한계 보완.
 *
 * - EstateItem/AssetForm 타입·initial·normalize·Zod에 진입하지 않는 별도 UI 스토어(엔진/API 무관).
 * - key 규약: 상증 `bsp-estate-${item.id}` / 양도 `bsp-${asset.assetId}-{gb|cb}-{acq|transfer}`
 *   (규약 유틸·환원 정규식은 `lib/calc/building-std-snapshot-keys.ts` 단일 소스)
 *   · PHD 3시점 계산기: `bsp-${asset.assetId}-phd-{acq|first|transfer}` (split 상가는 `…-commercial` 접미).
 * - sessionStorage persist → 새로고침 후에도 복원(키 = 영속 id 기반).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

interface BuildingStdSnapshotState {
  snapshots: Record<string, BuildingStdPriceFormState>;
  saveSnapshot: (key: string, snapshot: BuildingStdPriceFormState) => void;
  /**
   * 지정한 **키 집합**을 제거한 뒤 새 스냅샷을 설정 — 원자적.
   * PHD 일괄 계산 재적용 시 부분 제거·시점 축소로 생긴 stale 계산서를 막는 것이 목적이다.
   *
   * 🪤 종전에는 `replaceSnapshotsByPrefix(prefix, …)`로 **접두 매칭 삭제**를 했는데
   *    `bsp-a1-gb-ext-acq`(증축분·건물2)가 `bsp-a1-gb-`로 시작하는 바람에 GB 본체 배치가
   *    **증축분 스냅샷을 함께 지웠다**(2026-08-24 probe 실측). 삭제 대상을 접두가 아니라
   *    **배치가 만들 수 있는 키 집합**(`batchSnapshotKeys` 단일 소스)으로 받아 겹침을 없앤다.
   */
  replaceBatchSnapshots: (
    removeKeys: readonly string[],
    snapshots: Record<string, BuildingStdPriceFormState>,
  ) => void;
}

export const useBuildingStdSnapshotStore = create<BuildingStdSnapshotState>()(
  persist(
    (set) => ({
      snapshots: {},
      saveSnapshot: (key, snapshot) =>
        set((s) => ({ snapshots: { ...s.snapshots, [key]: snapshot } })),
      replaceBatchSnapshots: (removeKeys, snapshots) =>
        set((s) => {
          const remove = new Set(removeKeys);
          const kept = Object.fromEntries(
            Object.entries(s.snapshots).filter(([k]) => !remove.has(k)),
          );
          return { snapshots: { ...kept, ...snapshots } };
        }),
    }),
    {
      name: "building-std-snapshots",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
