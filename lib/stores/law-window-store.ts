/**
 * 법령 리서치 조문 플로팅 창 전역 스토어 (zustand).
 *
 * 단일 백드롭 모달(바깥 클릭 소멸·1개 한정)을 대체 — 여러 조문 창을 동시에 띄우고
 * 닫을 때까지 항상 위에 유지하며 상호 참조 검토를 지원한다.
 *
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.2
 * - dedup 키 = `${lawName}:${articleNo}` — 같은 조문 중복 창 방지(있으면 focus).
 *   id에 Date.now/Math.random 미사용(안정 키).
 * - 개수 상한 MAX_WINDOWS 초과 시 **생성 순서상 가장 오래된 창(windows[0])** 자동 닫힘.
 *   focus는 z만 바꾸고 배열 순서를 보존하므로 windows[0]이 항상 최초 생성 창.
 * - 클램프는 순수 함수(clampToViewport)로 분리 → useDragResize와 단위 테스트 공용.
 *
 * selector 무한 루프 주의(memory feedback_zustand_selector): 소비 컴포넌트는
 * atomic selector / useShallow / 액션 분리 구독을 쓸 것. 새 객체 반환 selector 금지.
 */
import { create } from "zustand";

/** 동시 표시 최대 창 수. 초과 시 가장 오래된 창 자동 닫힘. */
export const MAX_WINDOWS = 8;
/** 창 최소 크기(px) — resize 하한 clamp. */
export const MIN_W = 280;
export const MIN_H = 160;
/** 새 창 기본 크기(px). 현 모달 max-w-2xl(672)보다 약간 작게 — 다중 배치 고려. */
export const DEFAULT_W = 640;
export const DEFAULT_H = 560;
/** cascade 오프셋(px) — 새 창마다 우향 누적. */
const CASCADE = 28;
/** 카스케이드 wrap 주기(주기마다 시작점으로 되돌림). */
const CASCADE_WRAP = 6;
/** z-index 베이스 — 앱 헤더 sticky z-50(app/layout.tsx) 위로 충분히. */
const BASE_Z = 1000;
/**
 * 새 창 상단 시작 y(px). /law 상단의 제목·설명·통합검색 바(실측 하단 ~264) 아래에 배치해
 * 검색창을 가리지 않게 함 — 창을 띄운 채 추가 검색이 핵심 유스케이스. 레이아웃 의존 상수.
 */
const TOP_OFFSET = 280;
/** 새 창 좌측 시작 x(px). */
const LEFT_OFFSET = 40;
/** 뷰포트 가장자리 여백(px). */
const EDGE = 16;

export interface LawWindow {
  /** dedup 키 `${lawName}:${articleNo}` — 안정적(Math.random/Date.now 미사용). */
  id: string;
  lawName: string;
  articleNo: string;
  /** 라우팅(impact_map)으로 열렸을 때 영향 분석 자동 실행 신호. */
  autoImpact: boolean;
  /** 좌상단 위치(px). */
  x: number;
  y: number;
  /** 크기(px). */
  w: number;
  h: number;
  /** 스택 순서(클릭 시 최대+1). */
  z: number;
  /** 제자리 접기(헤더만 표시) 여부. */
  minimized: boolean;
}

export interface OpenLawWindowParams {
  lawName: string;
  articleNo: string;
  autoImpact?: boolean;
}

interface LawWindowState {
  windows: LawWindow[];
  topZ: number;
  /** dedup → 있으면 focus(+autoImpact 재신호), 없으면 cascade 위치로 추가(MAX 초과 시 oldest 제거). */
  open: (p: OpenLawWindowParams) => void;
  close: (id: string) => void;
  closeAll: () => void;
  /** z = ++topZ (맨 앞으로). 배열 순서는 보존. */
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  /** w/h를 MIN_W/MIN_H로 하한 clamp 후 저장. */
  resize: (id: string, w: number, h: number) => void;
  toggleMinimize: (id: string) => void;
}

/** dedup 키 생성. */
export function windowId(lawName: string, articleNo: string): string {
  return `${lawName}:${articleNo}`;
}

/**
 * 뷰포트 밖 완전 이탈 방지 — 창의 헤더 일부가 항상 화면에 남도록 (x, y)를 clamp.
 * 순수 함수(window 미참조) — useDragResize가 실제 뷰포트 크기로 호출, 테스트도 직접 검증.
 */
export function clampToViewport(
  x: number,
  y: number,
  w: number,
  _h: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  /** 화면에 항상 남겨둘 최소 노출 폭/높이(px). */
  const MIN_VISIBLE = 120;
  const HEADER = 40;
  const maxX = vw - MIN_VISIBLE;
  const minX = -(w - MIN_VISIBLE);
  const maxY = vh - HEADER;
  const minY = 0;
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

export const useLawWindowStore = create<LawWindowState>((set) => ({
  windows: [],
  topZ: BASE_Z,

  open: (p) =>
    set((s) => {
      const id = windowId(p.lawName, p.articleNo);
      const nextZ = s.topZ + 1;
      const existing = s.windows.find((w) => w.id === id);
      if (existing) {
        // dedup: 새 창을 만들지 않고 focus(맨 앞) + 펼침.
        // get_law_text(autoImpact=false)로 연 창을 impact_map(true)으로 재오픈 시 영향분석 재신호.
        return {
          topZ: nextZ,
          windows: s.windows.map((w) =>
            w.id === id
              ? {
                  ...w,
                  z: nextZ,
                  minimized: false,
                  autoImpact: w.autoImpact || Boolean(p.autoImpact),
                }
              : w,
          ),
        };
      }
      const idx = s.windows.length;
      const off = (idx % CASCADE_WRAP) * CASCADE;
      // 뷰포트에 맞춰 초기 위치·크기 산정(SSR 가드). 상단 검색 UI 가림 방지 + 화면 밖 이탈 방지.
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const w = Math.min(DEFAULT_W, vw - EDGE * 2);
      const h = Math.min(DEFAULT_H, Math.max(vh - TOP_OFFSET - EDGE, MIN_H));
      const x = Math.min(LEFT_OFFSET + off, Math.max(vw - w - EDGE, EDGE));
      const y = Math.min(TOP_OFFSET + off, Math.max(vh - h - EDGE, TOP_OFFSET));
      const win: LawWindow = {
        id,
        lawName: p.lawName,
        articleNo: p.articleNo,
        autoImpact: Boolean(p.autoImpact),
        x,
        y,
        w,
        h,
        z: nextZ,
        minimized: false,
      };
      let windows = [...s.windows, win];
      // 개수 상한 — 초과 시 생성 순서상 가장 오래된 창(선두) 제거.
      if (windows.length > MAX_WINDOWS) {
        windows = windows.slice(windows.length - MAX_WINDOWS);
      }
      return { windows, topZ: nextZ };
    }),

  close: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  closeAll: () => set({ windows: [] }),

  focus: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s;
      const nextZ = s.topZ + 1;
      return {
        topZ: nextZ,
        windows: s.windows.map((w) => (w.id === id ? { ...w, z: nextZ } : w)),
      };
    }),

  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  resize: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id ? { ...win, w: Math.max(w, MIN_W), h: Math.max(h, MIN_H) } : win,
      ),
    })),

  toggleMinimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)),
    })),
}));
