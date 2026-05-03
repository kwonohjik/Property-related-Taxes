"use client";

import { create } from "zustand";

interface ProfessionalState {
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  clearActiveClient: () => void;
}

/**
 * 세무사 모드 전용 — 현재 계산 중인 의뢰인 ID 임시 보관.
 * 마법사 진입 시 Step 0에서 선택, 결과 저장 시 clientId로 기록.
 * persist 없이 메모리만 — 매번 마법사에서 새로 선택하는 정책.
 */
export const useProfessionalStore = create<ProfessionalState>((set) => ({
  activeClientId: null,
  setActiveClientId: (id) => set({ activeClientId: id }),
  clearActiveClient: () => set({ activeClientId: null }),
}));
