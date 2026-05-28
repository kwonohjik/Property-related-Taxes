/**
 * @vitest-environment jsdom
 *
 * InheritanceStockNameAutocomplete anchor (T-01~T-15).
 *
 * Plan: docs/00-pm/listed-stock-name-autocomplete.plan.md
 * Design: docs/02-design/features/listed-stock-name-typeahead.design.md §7
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { InheritanceStockNameAutocomplete } from "@/components/calc/inheritance/listed-stock/InheritanceStockNameAutocomplete";

const SAMSUNG_MATCHES = [
  {
    stockCode: "005930",
    stockName: "삼성전자",
    marketCode: "0",
    marketName: "KOSPI",
    marketTypeStore: "kospi",
    tradingHalt: false,
    adminIssue: false,
  },
  {
    stockCode: "006400",
    stockName: "삼성SDI",
    marketCode: "0",
    marketName: "KOSPI",
    marketTypeStore: "kospi",
    tradingHalt: false,
    adminIssue: false,
  },
  {
    stockCode: "068290",
    stockName: "삼성출판사",
    marketCode: "10",
    marketName: "KOSDAQ",
    marketTypeStore: "kosdaq",
    tradingHalt: true,
    adminIssue: false,
  },
];

const KONEX_MATCH = {
  stockCode: "0070X0",
  stockName: "테스트코넥스",
  marketCode: "50",
  marketName: "KONEX",
  marketTypeStore: "konex",
  tradingHalt: false,
  adminIssue: false,
};

function mockFetchOnce(matches: unknown[]) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ matches }),
  }) as unknown as typeof fetch;
}

function mockFetchReject() {
  globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("network")) as unknown as typeof fetch;
}

function Harness(initial: { value?: string } = {}) {
  const [name, setName] = useState(initial.value ?? "");
  const [code, setCode] = useState("");
  return (
    <div>
      <InheritanceStockNameAutocomplete
        value={name}
        onSelect={(m) => {
          setName(m.stockName);
          setCode(m.stockCode);
        }}
        onNameChange={(v) => setName(v)}
        testId="ls-security-info-name"
      />
      <span data-testid="code-mirror">{code}</span>
      <button data-testid="external-set" onClick={() => setName("삼성전자")}>
        external
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe("InheritanceStockNameAutocomplete", () => {
  it("T-01 매치 선택 시 name+code 동시 mirror", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const option = screen.getByText("삼성전자");
    fireEvent.mouseDown(option);
    expect(screen.getByTestId("code-mirror").textContent).toBe("005930");
    expect((input as HTMLInputElement).value).toBe("삼성전자");
  });

  it("T-02 직접 텍스트 입력 시 name만 변경, code 유지", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "임의" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect((input as HTMLInputElement).value).toBe("임의");
    expect(screen.getByTestId("code-mirror").textContent).toBe("");
  });

  it("T-05 네트워크 실패 시 silent (dropdown 미표시)", async () => {
    mockFetchReject();
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("T-06 KONEX 영문 종목코드 보존", async () => {
    mockFetchOnce([KONEX_MATCH]);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "테스트" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const option = screen.getByText("테스트코넥스");
    fireEvent.mouseDown(option);
    expect(screen.getByTestId("code-mirror").textContent).toBe("0070X0");
  });

  it("T-07 ArrowDown + Enter 키보드 선택", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByText("삼성전자");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("code-mirror").textContent).toBe("005930");
  });

  it("T-08 Escape 시 dropdown 닫힘", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByRole("listbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("T-09 거래정지 종목 rose 배지 노출", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("거래정지")).toBeTruthy();
  });

  it("T-10 외부 mousedown 시 dropdown 닫힘", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(
      <div>
        <Harness />
        <button data-testid="outside">outside</button>
      </div>,
    );
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByRole("listbox");
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("T-11 debounce — 연속 입력 시 마지막만 fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ matches: SAMSUNG_MATCHES }) });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(input, { target: { value: "삼성" } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(input, { target: { value: "삼성전" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toBe("삼성전");
  });

  it("T-13 외부 value 변경(자동조회 시뮬) 시 동일 query 재fetch skip", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ matches: SAMSUNG_MATCHES }) });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    fireEvent.change(input, { target: { value: "삼성전자" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 매치 선택으로 lastFetchedQRef 세팅 효과 시뮬: 외부 setName 으로 동일 값 set
    fireEvent.click(screen.getByTestId("external-set"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // 동일 query — fetch 추가 호출 없어야 함
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("T-15 a11y role + aria-expanded + aria-activedescendant", async () => {
    mockFetchOnce(SAMSUNG_MATCHES);
    render(<Harness />);
    const input = screen.getByTestId("ls-security-info-name-input");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(input, { target: { value: "삼" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByRole("listbox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-0$/);
  });
});
