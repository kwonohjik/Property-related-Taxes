import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";

/**
 * HorizontalScrollContainer anchor — 가짜 스크롤바 / 화살표 / 트랙 클릭 / print:hidden
 *
 * jsdom은 scrollWidth/clientWidth를 0으로 보고하므로 Object.defineProperty로 mock.
 * ResizeObserver는 setup.ts에서 글로벌 mock 가정. 없으면 본 파일에서 stub.
 */

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (global as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setScrollGeometry(
  el: HTMLElement,
  opts: { scrollWidth: number; clientWidth: number; scrollLeft?: number },
) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: opts.scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: opts.clientWidth });
  if (opts.scrollLeft !== undefined) {
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      writable: true,
      value: opts.scrollLeft,
    });
  }
  const scrollByMock = vi.fn((options?: ScrollToOptions) => {
    const cur = (el as unknown as { scrollLeft: number }).scrollLeft ?? 0;
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      value: cur + (options?.left ?? 0),
    });
    el.dispatchEvent(new Event("scroll"));
  });
  const scrollToMock = vi.fn((options?: ScrollToOptions | number) => {
    const left =
      typeof options === "object" && options !== null ? (options.left ?? 0) : 0;
    Object.defineProperty(el, "scrollLeft", { configurable: true, value: left });
    el.dispatchEvent(new Event("scroll"));
  });
  (el as unknown as { scrollBy: typeof scrollByMock }).scrollBy = scrollByMock;
  (el as unknown as { scrollTo: typeof scrollToMock }).scrollTo = scrollToMock;
}

describe("HorizontalScrollContainer — 가짜 스크롤바", () => {
  it("초기 렌더 시 thumb·track·hint 모두 존재 (가짜 스크롤바 항상 표시)", () => {
    render(
      <HorizontalScrollContainer hint="좌우 스크롤">
        <div style={{ width: 1000 }}>wide content</div>
      </HorizontalScrollContainer>,
    );
    expect(screen.getByTestId("hsc-thumb")).toBeTruthy();
    expect(screen.getByTestId("hsc-fake-scrollbar")).toBeTruthy();
    expect(screen.getByText("좌우 스크롤")).toBeTruthy();
  });

  it("hint=null 명시 시 안내 텍스트 미렌더", () => {
    render(
      <HorizontalScrollContainer hint={null}>
        <div>x</div>
      </HorizontalScrollContainer>,
    );
    expect(screen.queryByText(/좌우 스크롤/)).toBeNull();
  });

  it("스크롤 가능(scrollWidth > clientWidth) 시 우측 화살표 노출", () => {
    const { container } = render(
      <HorizontalScrollContainer>
        <div>wide</div>
      </HorizontalScrollContainer>,
    );
    const scrollEl = screen.getByTestId("hsc-scroll");
    setScrollGeometry(scrollEl, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.queryByTestId("hsc-arrow-right")).toBeTruthy();
    // 좌측 끝이므로 좌측 화살표는 없음
    expect(screen.queryByTestId("hsc-arrow-left")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("우측 화살표 클릭 시 scrollBy(+320) 호출", () => {
    render(
      <HorizontalScrollContainer>
        <div>wide</div>
      </HorizontalScrollContainer>,
    );
    const scrollEl = screen.getByTestId("hsc-scroll");
    setScrollGeometry(scrollEl, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    const rightArrow = screen.getByTestId("hsc-arrow-right");
    act(() => {
      fireEvent.click(rightArrow);
    });
    expect((scrollEl.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      left: 320,
      behavior: "smooth",
    });
  });

  it("스크롤 끝 도달 시 우측 화살표 사라지고 좌측 화살표 노출", () => {
    render(
      <HorizontalScrollContainer>
        <div>wide</div>
      </HorizontalScrollContainer>,
    );
    const scrollEl = screen.getByTestId("hsc-scroll");
    setScrollGeometry(scrollEl, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 600 }); // 끝
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.queryByTestId("hsc-arrow-right")).toBeNull();
    expect(screen.queryByTestId("hsc-arrow-left")).toBeTruthy();
  });

  it("thumb width%는 clientWidth/scrollWidth 비율 (40%)", () => {
    render(
      <HorizontalScrollContainer>
        <div>wide</div>
      </HorizontalScrollContainer>,
    );
    const scrollEl = screen.getByTestId("hsc-scroll");
    setScrollGeometry(scrollEl, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    const thumb = screen.getByTestId("hsc-thumb");
    expect(thumb.style.width).toBe("40%");
    expect(thumb.style.left).toBe("0%");
  });

  it("인쇄 시 보조 UI에 print:hidden 클래스 적용", () => {
    render(
      <HorizontalScrollContainer>
        <div>x</div>
      </HorizontalScrollContainer>,
    );
    expect(screen.getByTestId("hsc-fake-scrollbar").className).toContain("print:hidden");
  });
});
