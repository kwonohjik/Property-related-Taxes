/**
 * 상가·오피스텔 호별 기준시가 조회 — 선택 호 스냅샷 스토어.
 *
 * 모달에서 고른 호를 보관해 재오픈 시 복원한다. `building-std-snapshot-store.ts`의 패턴만
 * 차용해 신설했다 — 그 스토어의 값 타입은 `Record<string, BuildingStdPriceFormState>`라
 * 호 선택(키·표시 문자열)을 담을 수 없다.
 *
 * - `AssetForm`·엔진 input·Zod에 진입하지 않는 **UI 전용** 스토어(14 동기화 지점 무관).
 * - key 규약: `cbsp-${assetId}-{cb|cbinh}` — 기존 키가 전부 `bsp-`로 시작하므로 접두를 달리한다.
 * - sessionStorage persist → 새로고침 후에도 복원(키가 영속 assetId 기반).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CommercialStdPriceSelection {
  /** 라우트가 준 물건 키 (모호 물건은 일련번호가 붙어 있다) */
  unitKey: string;
  /** 목록 복원 실패 시 사용자에게 보여줄 표시 문자열 */
  label: string;
}

interface CommercialStdPriceSnapshotState {
  selections: Record<string, CommercialStdPriceSelection>;
  saveSelection: (key: string, selection: CommercialStdPriceSelection) => void;
  clearSelection: (key: string) => void;
}

export const useCommercialStdPriceSnapshotStore = create<CommercialStdPriceSnapshotState>()(
  persist(
    (set) => ({
      selections: {},
      saveSelection: (key, selection) =>
        set((s) => ({ selections: { ...s.selections, [key]: selection } })),
      clearSelection: (key) =>
        set((s) => {
          const next = { ...s.selections };
          delete next[key];
          return { selections: next };
        }),
    }),
    {
      name: "commercial-stdprice-selection",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
