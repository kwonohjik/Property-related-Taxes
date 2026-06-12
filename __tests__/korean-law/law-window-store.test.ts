/**
 * law-window-store 단위 테스트 (Pre-Do anchor + FR-8a).
 *
 * 핵심 분기 실측: open/dedup/cascade/MAX oldest-evict/focus z/close/closeAll/
 * move/resize 하한 clamp/toggleMinimize, clampToViewport 경계.
 *
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.2, §7
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  useLawWindowStore,
  clampToViewport,
  windowId,
  MAX_WINDOWS,
  MIN_W,
  MIN_H,
  DEFAULT_W,
  DEFAULT_H,
} from "@/lib/stores/law-window-store";

const store = useLawWindowStore;
const reset = () => store.setState({ windows: [], topZ: 1000 });

describe("law-window-store", () => {
  beforeEach(reset);

  it("open — 새 창 1개 추가(id·크기·z 증가)", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    const { windows, topZ } = store.getState();
    expect(windows).toHaveLength(1);
    expect(windows[0].id).toBe("소득세법:제55조");
    // 크기는 뷰포트에 맞춰 기본값 이하로 clamp될 수 있음(상단 검색 UI 회피).
    expect(windows[0].w).toBeLessThanOrEqual(DEFAULT_W);
    expect(windows[0].w).toBeGreaterThanOrEqual(MIN_W);
    expect(windows[0].h).toBeLessThanOrEqual(DEFAULT_H);
    expect(windows[0].h).toBeGreaterThanOrEqual(MIN_H);
    // 상단 검색 영역 아래에 배치(검색창 가림 방지).
    expect(windows[0].y).toBeGreaterThanOrEqual(120);
    expect(windows[0].autoImpact).toBe(false);
    expect(windows[0].z).toBe(topZ);
    expect(topZ).toBe(1001);
  });

  it("dedup — 같은 조문 재오픈 시 창 추가 없이 focus(z만 증가)", () => {
    const open = () => store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    open();
    const z1 = store.getState().windows[0].z;
    open();
    const { windows } = store.getState();
    expect(windows).toHaveLength(1);
    expect(windows[0].z).toBeGreaterThan(z1);
  });

  it("dedup + autoImpact 재신호 — get_law_text로 연 창을 impact_map으로 재오픈하면 autoImpact=true", () => {
    store.getState().open({ lawName: "법인세법", articleNo: "제55조", autoImpact: false });
    expect(store.getState().windows[0].autoImpact).toBe(false);
    store.getState().open({ lawName: "법인세법", articleNo: "제55조", autoImpact: true });
    const { windows } = store.getState();
    expect(windows).toHaveLength(1);
    expect(windows[0].autoImpact).toBe(true);
  });

  it("dedup — 최소화된 창 재오픈 시 펼침(minimized=false)", () => {
    store.getState().open({ lawName: "민법", articleNo: "제750조" });
    const id = windowId("민법", "제750조");
    store.getState().toggleMinimize(id);
    expect(store.getState().windows[0].minimized).toBe(true);
    store.getState().open({ lawName: "민법", articleNo: "제750조" });
    expect(store.getState().windows[0].minimized).toBe(false);
  });

  it("cascade — 연속 생성 시 위치가 달라짐(겹침 회피)", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    store.getState().open({ lawName: "소득세법", articleNo: "제13조" });
    const [a, b] = store.getState().windows;
    // 우향 cascade — x는 증가. y는 뷰포트 높이에 따라 clamp되어 같을 수 있음.
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x !== a.x || b.y !== a.y).toBe(true);
  });

  it("MAX oldest-evict — 상한 초과 시 생성 순서상 가장 오래된 창(windows[0]) 자동 닫힘", () => {
    for (let i = 0; i < MAX_WINDOWS + 1; i++) {
      store.getState().open({ lawName: "소득세법", articleNo: `제${i}조` });
    }
    const { windows } = store.getState();
    expect(windows).toHaveLength(MAX_WINDOWS);
    // 첫 번째로 연 "제0조"가 제거되고 "제1조"가 선두여야 함.
    expect(windows[0].articleNo).toBe("제1조");
    expect(windows.some((w) => w.articleNo === "제0조")).toBe(false);
  });

  it("focus — z=++topZ, 배열 순서는 보존(oldest-evict 기준 안정)", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    store.getState().open({ lawName: "소득세법", articleNo: "제13조" });
    const firstId = store.getState().windows[0].id;
    store.getState().focus(firstId);
    const { windows, topZ } = store.getState();
    // 배열 순서 보존 — windows[0]은 여전히 최초 생성 창.
    expect(windows[0].id).toBe(firstId);
    // 포커스된 창이 최상단 z.
    expect(windows[0].z).toBe(topZ);
    expect(windows[0].z).toBeGreaterThan(windows[1].z);
  });

  it("focus — 존재하지 않는 id는 무변경", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    const before = store.getState();
    store.getState().focus("없는:조문");
    expect(store.getState().windows).toEqual(before.windows);
  });

  it("close / closeAll", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    store.getState().open({ lawName: "소득세법", articleNo: "제13조" });
    store.getState().close(windowId("소득세법", "제55조"));
    expect(store.getState().windows).toHaveLength(1);
    expect(store.getState().windows[0].articleNo).toBe("제13조");
    store.getState().closeAll();
    expect(store.getState().windows).toHaveLength(0);
  });

  it("move — x/y 갱신", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    const id = windowId("소득세법", "제55조");
    store.getState().move(id, 300, 200);
    expect(store.getState().windows[0]).toMatchObject({ x: 300, y: 200 });
  });

  it("resize — MIN 하한 clamp", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    const id = windowId("소득세법", "제55조");
    store.getState().resize(id, 100, 50); // MIN 미만
    expect(store.getState().windows[0].w).toBe(MIN_W);
    expect(store.getState().windows[0].h).toBe(MIN_H);
    store.getState().resize(id, 900, 700); // MIN 이상은 그대로
    expect(store.getState().windows[0]).toMatchObject({ w: 900, h: 700 });
  });

  it("toggleMinimize — 토글", () => {
    store.getState().open({ lawName: "소득세법", articleNo: "제55조" });
    const id = windowId("소득세법", "제55조");
    store.getState().toggleMinimize(id);
    expect(store.getState().windows[0].minimized).toBe(true);
    store.getState().toggleMinimize(id);
    expect(store.getState().windows[0].minimized).toBe(false);
  });
});

describe("clampToViewport", () => {
  const VW = 1000;
  const VH = 800;
  const W = 640;
  const H = 560;

  it("경계 내부 좌표는 그대로", () => {
    expect(clampToViewport(100, 100, W, H, VW, VH)).toEqual({ x: 100, y: 100 });
  });

  it("우측 한계 — 창 최소 노출(120px) 유지", () => {
    const { x } = clampToViewport(5000, 100, W, H, VW, VH);
    expect(x).toBe(VW - 120);
  });

  it("좌측 한계 — 창이 대부분 나가도 120px 남김", () => {
    const { x } = clampToViewport(-5000, 100, W, H, VW, VH);
    expect(x).toBe(-(W - 120));
  });

  it("상단 한계 — y는 0 이상(헤더 안 잘림)", () => {
    const { y } = clampToViewport(100, -500, W, H, VW, VH);
    expect(y).toBe(0);
  });

  it("하단 한계 — 헤더(40px)는 화면에 남김", () => {
    const { y } = clampToViewport(100, 5000, W, H, VW, VH);
    expect(y).toBe(VH - 40);
  });
});
