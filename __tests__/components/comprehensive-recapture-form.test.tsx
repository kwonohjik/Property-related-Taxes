/**
 * @vitest-environment jsdom
 *
 * 합산배제 추징 계산기 화면 — 입력(사유 전환·연도 표·고지일) → ⑧ 차단 → ⑬ 호출 → 결과 표시
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6
 * 엔진은 실제 `calculateRecapture`를 fetch 응답으로 쓴다(모의 결과를 손으로 만들지 않는다).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { ComprehensiveRecaptureCalculator } from "@/components/calc/comprehensive-recapture/ComprehensiveRecaptureCalculator";
import { RecaptureResultView } from "@/components/calc/comprehensive-recapture/RecaptureResultView";
import { calculateRecapture } from "@/lib/tax-engine/comprehensive-recapture";
import { checkedRadioValue, radioValues } from "./_helpers/radio-values";

// HomeButton이 useRouter를 쓴다 — 라우터 마운트 없이 렌더
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function fillDate(testId: string, y: string, m: string, day: string) {
  const root = screen.getByTestId(testId);
  fireEvent.change(within(root).getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(within(root).getByLabelText("월"), { target: { value: m } });
  fireEvent.change(within(root).getByLabelText("일"), { target: { value: day } });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    const result = calculateRecapture({
      noticeDate: d(b.noticeDate),
      rows: b.rows,
      exemption: b.exemption.reason === "registration_cancelled" ? b.exemption : { reason: "other" },
    });
    return { ok: true, json: async () => ({ data: result }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("① 추징 사유 라디오 — 값 축", () => {
  it("선택지 값 4개 · 기본은 「해당 없음」(other)", () => {
    const { container } = render(<ComprehensiveRecaptureCalculator />);
    expect(radioValues(container, "rc-reason")).toEqual(["other", "rent_over_5pct", "registration_cancelled", "replacement_housing"]);
    expect(checkedRadioValue(container, "rc-reason")).toBe("other");
    expect(screen.queryByTestId("rc-reason-facts")).toBeNull();
  });

  it("1호를 고르면 1호 칸이 열리고 9개 임대 유형 값이 있다", () => {
    const { container } = render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-reason-rent_over_5pct"));
    expect(checkedRadioValue(container, "rc-reason")).toBe("rent_over_5pct");
    expect(radioValues(container, "rc-registration-type")).toEqual([
      "private_construction", "public_construction", "private_purchase_short", "public_purchase", "public_support_construction",
      "private_purchase_long", "public_support_purchase", "private_short_term_6y_construction", "private_short_term_6y_purchase",
    ]);
  });

  it("사유를 바꾸면 다른 호에서 고른 값이 비워진다(onChange) — 1호 유형 선택 → 2호 → 1호 복귀 시 미선택", () => {
    const { container } = render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-reason-rent_over_5pct"));
    fireEvent.click(screen.getByTestId("rc-type-private_construction"));
    expect(checkedRadioValue(container, "rc-registration-type")).toBe("private_construction");
    fireEvent.click(screen.getByTestId("rc-reason-registration_cancelled"));
    expect(screen.queryByTestId("rc-type-private_construction")).toBeNull();
    fireEvent.click(screen.getByTestId("rc-reason-rent_over_5pct"));
    expect(checkedRadioValue(container, "rc-registration-type")).toBeUndefined();
  });

  it("신청일 칸은 장기일반 유형에서만 열린다", () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-reason-rent_over_5pct"));
    fireEvent.click(screen.getByTestId("rc-type-private_construction"));
    expect(screen.queryByTestId("rc-rental-application")).toBeNull();
    fireEvent.click(screen.getByTestId("rc-type-private_purchase_long"));
    expect(screen.getByTestId("rc-rental-application")).toBeTruthy();
  });

  it("3호 가목 — 신청 유형을 고르면 신청일이 열리고 「없음」이면 닫힌다", () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-reason-replacement_housing"));
    expect(screen.queryByTestId("rc-application-date")).toBeNull();
    fireEvent.click(screen.getByTestId("rc-app-short_term"));
    expect(screen.getByTestId("rc-application-date")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rc-app-none"));
    expect(screen.queryByTestId("rc-application-date")).toBeNull();
  });
});

describe("② 연도별 표", () => {
  it("연도 추가·삭제 — 1행은 지울 수 없고 20행에서 추가가 막힌다", () => {
    render(<ComprehensiveRecaptureCalculator />);
    expect((screen.getByTestId("rc-remove-0") as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 19; i++) fireEvent.click(screen.getByTestId("rc-add-row"));
    expect(screen.getByTestId("rc-rows").children).toHaveLength(20);
    expect((screen.getByTestId("rc-add-row") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rc-remove-3"));
    expect(screen.getByTestId("rc-rows").children).toHaveLength(19);
  });
});

describe("⑧ 차단 → ⑬ 호출", () => {
  it("빈 폼: 계산을 누르면 오류 목록이 뜨고 요청은 0건", () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-calc"));
    expect(screen.getByTestId("rc-errors").textContent).toContain("고지일을 입력하세요");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("정상 입력: 요청 body가 ④ 변환 그대로이고 결과가 표시된다", async () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.change(screen.getByTestId("rc-year-0"), { target: { value: "2021" } });
    fireEvent.change(screen.getByTestId("rc-amount-0"), { target: { value: "1000000" } });
    fillDate("rc-notice-date", "2024", "12", "1");
    fireEvent.click(screen.getByTestId("rc-calc"));
    await waitFor(() => expect(screen.getByTestId("rc-result")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/calc/comprehensive-recapture");
    expect(JSON.parse(init.body)).toEqual({
      noticeDate: "2024-12-01",
      rows: [{ taxYear: 2021, amount: 1000000 }],
      exemption: { reason: "other" },
    });
    // 2021년분 100만 · 고지 2024-12-01 = 61일×25 + 1,021일×22 = 239,870 (구간 2개)
    expect(screen.getByTestId("rc-interest").textContent).toBe("239,870");
    expect(screen.getByTestId("rc-total-payable").textContent).toBe("1,239,870");
    expect(screen.getByTestId("rc-seg-2021-0").textContent).toContain("2021.12.16.~2022.2.14.");
    expect(screen.getByTestId("rc-seg-2021-1").textContent).toContain("2022.2.15.~2024.12.1.");
  });

  it("입력을 고치면 이전 결과가 사라진다(화면 값과 결과가 어긋나지 않는다)", async () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.change(screen.getByTestId("rc-year-0"), { target: { value: "2021" } });
    fireEvent.change(screen.getByTestId("rc-amount-0"), { target: { value: "1000000" } });
    fillDate("rc-notice-date", "2024", "12", "1");
    fireEvent.click(screen.getByTestId("rc-calc"));
    await waitFor(() => expect(screen.getByTestId("rc-result")).toBeTruthy());
    fireEvent.change(screen.getByTestId("rc-year-0"), { target: { value: "2022" } });
    expect(screen.queryByTestId("rc-result")).toBeNull();
  });

  it("2호 6⑤ 배제: 「추징하지 않음」 · 금액 0 · 입력 사실 요약", async () => {
    render(<ComprehensiveRecaptureCalculator />);
    fireEvent.click(screen.getByTestId("rc-reason-registration_cancelled"));
    fireEvent.click(screen.getByTestId("rc-cancel-6⑤"));
    fireEvent.change(screen.getByTestId("rc-year-0"), { target: { value: "2023" } });
    fireEvent.change(screen.getByTestId("rc-amount-0"), { target: { value: "1000000" } });
    fillDate("rc-notice-date", "2026", "11", "1");
    fireEvent.click(screen.getByTestId("rc-calc"));
    await waitFor(() => expect(screen.getByTestId("rc-exempt")).toBeTruthy());
    expect(screen.getByTestId("rc-total-tax").textContent).toBe("0");
    expect(screen.getByTestId("rc-interest").textContent).toBe("0");
    expect(screen.getByTestId("rc-exempt").textContent).toContain("시행령 §10③2호");
    expect(screen.getByTestId("rc-facts").textContent).toContain("§6⑤");
    expect(screen.queryByTestId("rc-annual-table")).toBeNull();
    expect(screen.getByTestId("rc-notices").textContent).toContain("확인 필요");
  });
});

describe("결과 표시 — 기산일 이월·구간·배제 카드", () => {
  const rows = [{ taxYear: 2018, amount: 1_000_000 }];
  const notice = "2024-12-01";

  it("2018년분: 기산일 2018.12.18. · 구간 3개 하위 행 · 납부기한 이월 설명을 표 밖에 둔다", () => {
    const result = calculateRecapture({ noticeDate: d(notice), rows, exemption: { reason: "other" } });
    render(<RecaptureResultView result={result} noticeDate={notice} facts={[]} />);
    const tr = screen.getByTestId("rc-annual-2018");
    expect(tr.textContent).toContain("2018.12.18.");
    expect(tr.textContent).toContain("516,170");
    expect(screen.getByTestId("rc-seg-2018-0").textContent).toContain("2018.12.18.~2019.2.11.");
    expect(screen.getByTestId("rc-seg-2018-0").textContent).toContain("56일");
    expect(screen.getByTestId("rc-seg-2018-0").textContent).toContain("1일 10만분의 30");
    expect(screen.getByTestId("rc-seg-2018-2").textContent).toContain("1일 10만분의 22");
    const carry = screen.getByTestId("rc-deadline-carry");
    expect(carry.textContent).toContain("납부기한 2018.12.17.(12.15.이 토요일 · 12.16.이 일요일) 다음 날");
    expect(carry.textContent).toContain("국세기본법 §5①");
    expect(screen.getByTestId("rc-annual-table").contains(carry)).toBe(false);
    // 이월은 확정(V-2 닫음) — 「확인 필요」에는 구간별 절사 안내만 남고 기산일 안내는 없다
    expect(screen.getByTestId("rc-notices").textContent).toContain("확인 필요");
    expect(screen.getByTestId("rc-notices").textContent).not.toContain("기산일");
  });

  it("구간이 하나뿐인 해는 하위 행 없이 율을 한 줄에 쓰고, 12.15.가 평일이면 이월 설명이 없다", () => {
    const result = calculateRecapture({ noticeDate: d("2024-12-01"), rows: [{ taxYear: 2023, amount: 1_000_000 }], exemption: { reason: "other" } });
    render(<RecaptureResultView result={result} noticeDate="2024-12-01" facts={[]} />);
    expect(screen.getByTestId("rc-annual-2023").textContent).toContain("1일 10만분의 22");
    expect(screen.queryByTestId("rc-seg-2023-0")).toBeNull();
    expect(screen.queryByTestId("rc-deadline-carry")).toBeNull();
  });

  it("배제가 아닐 때는 「추징하지 않음」 카드가 없다 · 배제면 emerald 카드와 표가 서로 배타", () => {
    const calc = calculateRecapture({ noticeDate: d(notice), rows, exemption: { reason: "other" } });
    const { unmount } = render(<RecaptureResultView result={calc} noticeDate={notice} facts={[]} />);
    expect(screen.queryByTestId("rc-exempt")).toBeNull();
    expect(screen.getByTestId("rc-annual-table")).toBeTruthy();
    unmount();
    const ex = calculateRecapture({ noticeDate: d(notice), rows, exemption: { reason: "registration_cancelled", cancelClause: "6⑤" } });
    render(<RecaptureResultView result={ex} noticeDate={notice} facts={["말소 근거: 자동말소"]} />);
    expect(screen.getByTestId("rc-exempt")).toBeTruthy();
    expect(screen.queryByTestId("rc-annual-table")).toBeNull();
  });

  it("사유를 골랐지만 배제가 성립하지 않으면 불성립 사유를 보이고 추징을 계산한다", () => {
    const result = calculateRecapture({ noticeDate: d(notice), rows, exemption: { reason: "registration_cancelled", cancelClause: "other" } });
    render(<RecaptureResultView result={result} noticeDate={notice} facts={[]} />);
    expect(screen.getByTestId("rc-not-exempt").textContent).toContain("제6조제1항제11호");
    expect(screen.getByTestId("rc-total-payable").textContent).toBe("1,516,170");
  });

  it("면책 고지와 인쇄 시 확인 필요 박스는 가로 스크롤 영역 밖에 있다", () => {
    const result = calculateRecapture({ noticeDate: d(notice), rows, exemption: { reason: "other" } });
    render(<RecaptureResultView result={result} noticeDate={notice} facts={[]} />);
    expect(screen.getByText(/면책 고지/)).toBeTruthy();
    expect(screen.getByTestId("rc-annual-table").closest(".overflow-x-auto")?.contains(screen.getByTestId("rc-notices"))).toBe(false);
  });
});
