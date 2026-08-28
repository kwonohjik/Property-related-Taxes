/**
 * SecurityMetadataBlock — 종목명/종목코드 배치 + 키움 호출 실패 표시 anchor.
 *
 * Plan: docs/00-pm/stock-security-field-swap-kiwoom-name-lookup.plan.md §6 (T-1~T-6)
 *
 * 배경(실측): 순서 교체 뮤테이션에 대해 기존 __tests__/components/ 230파일 1852테스트가
 * 전부 통과했다 — 안전망 0건. T-1이 그 사각지대를 덮는다.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { SecurityMetadataBlock } from "@/components/calc/stock-transfer/SecurityMetadataBlock";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

vi.mock("@/lib/storage/use-user-profile", () => ({
  useUserProfile: () => ({
    profile: { displayName: "홍길동", birthDate: "1966-05-05" },
    mode: "taxpayer",
    loading: false,
  }),
}));

vi.mock("@/lib/stores/professional-store", () => ({
  useProfessionalStore: () => ({ activeClientId: null }),
}));

vi.mock("@/lib/storage/user-repository", () => ({
  userRepository: { upsertProfile: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/storage/client-repository", () => ({
  clientRepository: {
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

/**
 * securityName·securityCode는 controlled다 — onChange가 실제로 상태를 갱신하지 않으면
 * value가 그대로여서 자동완성 debounce effect가 아예 돌지 않는다(하네스 함정).
 * 실제 앱의 store 갱신을 stateful wrapper로 재현한다.
 */
function Harness({
  marketType = "kospi",
  initialName = "",
}: {
  marketType?: StockTransferFormData["marketType"];
  initialName?: string;
}) {
  const [form, setForm] = React.useState({
    securityName: initialName,
    securityCode: "",
    marketType,
  });
  return (
    <SecurityMetadataBlock
      securityName={form.securityName}
      securityCode={form.securityCode}
      brokerage=""
      accountNumberMasked=""
      marketType={form.marketType}
      onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
    />
  );
}

function renderBlock(overrides?: {
  marketType?: StockTransferFormData["marketType"];
  securityName?: string;
}) {
  render(
    <Harness marketType={overrides?.marketType} initialName={overrides?.securityName} />,
  );
}

/** 실패 응답 1종을 만든다 — search / search-by-name 공용. */
function mockFetchError(status: number, body: { error: string; message: string }) {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("T-1 — 종목명(좌) → 종목코드(우) 배치", () => {
  it("DOM 순서상 종목명 input이 종목코드 input보다 앞에 온다", () => {
    renderBlock();
    const nameInput = screen.getByPlaceholderText("종목명을 입력하세요");
    const codeInput = screen.getByPlaceholderText("6자리 숫자");

    // compareDocumentPosition: FOLLOWING(4) = codeInput이 nameInput 뒤에 있다
    const pos = nameInput.compareDocumentPosition(codeInput);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("T-2 — 종목명 자동완성 실패가 화면에 드러난다", () => {
  it("search-by-name이 502(auth_failed) → 인증 실패 배지가 나타난다", async () => {
    mockFetchError(502, { error: "auth_failed", message: "키움 인증 실패" });
    renderBlock();

    fireEvent.change(screen.getByPlaceholderText("종목명을 입력하세요"), {
      target: { value: "삼성" },
    });

    // 배지는 짧은 신호("인증 실패")만 — 길면 FieldCard trailing이 입력창 폭을 잠식한다
    await waitFor(
      () => expect(screen.getByRole("status").textContent).toContain("인증 실패"),
      { timeout: 2000 },
    );
    expect(screen.getByRole("status").textContent!.length).toBeLessThanOrEqual(12);
    // 조치 안내는 폭 여유가 있는 hint 줄이 맡는다
    expect(screen.getByText(/키움 인증 실패 — .*KIWOOM_APP_KEY/)).toBeTruthy();
  });

  it("503(missing_env) → 자격증명 미설정 문구가 나타난다", async () => {
    mockFetchError(503, { error: "missing_env", message: "자격증명 미설정" });
    renderBlock();

    fireEvent.change(screen.getByPlaceholderText("종목명을 입력하세요"), {
      target: { value: "삼성" },
    });

    await waitFor(
      () => expect(screen.getByText(/자격증명/)).toBeTruthy(),
      { timeout: 2000 },
    );
  });
});

describe("T-3 — 종목코드 blur 조회 실패가 화면에 드러난다", () => {
  it("search가 502 → 인증 실패 배지가 나타난다", async () => {
    mockFetchError(502, { error: "auth_failed", message: "키움 인증 실패" });
    renderBlock();

    const codeInput = screen.getByPlaceholderText("6자리 숫자");
    fireEvent.change(codeInput, { target: { value: "005930" } });
    fireEvent.blur(codeInput, { target: { value: "005930" } });

    await waitFor(
      () => expect(screen.getByText(/키움 인증 실패/)).toBeTruthy(),
      { timeout: 2000 },
    );
  });
});

describe("T-4 — 비상장은 자동완성이 무의미함을 안내한다", () => {
  it("marketType='unlisted' → 키움 마스터 미수록 안내가 나온다", () => {
    renderBlock({ marketType: "unlisted" });
    expect(screen.getByText(/비상장 종목은/)).toBeTruthy();
  });

  it("marketType='kospi' → 비상장 안내는 나오지 않는다", () => {
    renderBlock({ marketType: "kospi" });
    expect(screen.queryByText(/비상장 종목은/)).toBeNull();
  });
});

describe("T-6 — 「결과 없음」과 「호출 실패」의 구별력", () => {
  it("200 + matches:[] → 오류 배지가 표시되지 않는다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matches: [] }),
    } as Response);
    renderBlock();

    fireEvent.change(screen.getByPlaceholderText("종목명을 입력하세요"), {
      target: { value: "존재하지않는종목" },
    });

    // debounce(300ms) + 응답 처리를 넘기고도 오류 문구가 없어야 한다
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByText(/인증 실패|자격증명|한도 초과/)).toBeNull();
  });
});

describe("T-5 — 선택 직후 재요청하지 않는다 (sibling C14 가드 이식)", () => {
  it("dropdown 후보를 선택해도 같은 질의로 fetch가 다시 나가지 않는다", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        matches: [
          {
            stockCode: "005930",
            stockName: "삼성전자",
            marketCode: "0",
            marketName: "코스피",
            marketTypeStore: "kospi",
            tradingHalt: false,
            adminIssue: false,
          },
        ],
      }),
    } as Response);

    renderBlock();
    // 실제 흐름: 부분 입력("삼성") → 전체 종목명("삼성전자") 선택 → value가 실제로 바뀐다.
    // 입력과 선택값이 같으면 value 무변화로 effect가 재실행되지 않아 가드 유무를 구별하지 못한다.
    fireEvent.change(screen.getByPlaceholderText("종목명을 입력하세요"), {
      target: { value: "삼성" },
    });

    const option = await screen.findByText("삼성전자", {}, { timeout: 2000 });
    const callsBeforeSelect = spy.mock.calls.length;
    expect(callsBeforeSelect).toBeGreaterThan(0);

    fireEvent.mouseDown(option);

    // 선택으로 securityName이 "삼성전자"로 갱신된다 → 가드가 없으면 debounce가 재요청한다
    await new Promise((r) => setTimeout(r, 600));
    expect(spy.mock.calls.length).toBe(callsBeforeSelect);
  });
});
