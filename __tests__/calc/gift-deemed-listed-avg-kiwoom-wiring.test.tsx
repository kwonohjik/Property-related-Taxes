/**
 * anchor: §63①1가 종가평균 **키움 자동조회 배선** (Phase D-2)
 *
 * 상장 단서(§29②1가·3나)가 쓰는 「전후 각 2개월 종가평균」은 기존 `/api/kiwoom/valuation-2month`
 * (상속·증여 상장주식 평가용)이 그대로 계산해 준다. 여기서 고정하는 것은 **배선**이다:
 *   ⓐ 상장 토글 ON일 때만 조회 UI가 열린다(비상장은 단서 자체가 없다)
 *   ⓑ 평가기준일이 세목별로 **다른 날**을 가리킨다
 *        현물출자 = 증여일(현물출자 납입일 · 법 §39의3① 본문)
 *        전환주식 발행 시점 = 「발행 당시」(상증령 §29②6나) — 증여일이 아니므로 **별도 입력**
 * ⓑ를 틀리면 조회는 성공하는데 **다른 날짜의 평균**이 들어와 조용히 오세액이 된다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ContributionFields } from "../../components/calc/deemed-gift/contribution-form";
import { ConvertibleStockFields } from "../../components/calc/deemed-gift/convertible-stock-form";
import { INITIAL_DEEMED, type DeemedFormState } from "../../components/calc/deemed-gift/shared";

afterEach(cleanup);

const GIFT_DATE = "2026-03-02";

function contributionForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  return { ...INITIAL_DEEMED, type: "contribution", giftDate: GIFT_DATE, ...over };
}

describe("현물출자 §39의3 — 종가평균 자동조회 배선", () => {
  it("K-1: 상장 OFF면 조회 UI가 없다 (비상장은 단서 미적용)", () => {
    render(<ContributionFields form={contributionForm()} set={() => {}} />);
    expect(screen.queryByTestId("con-stock-code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /키움 자동조회/ })).not.toBeInTheDocument();
  });

  it("K-2: 상장 ON → 종목코드 입력 + 자동조회 버튼 노출", () => {
    render(<ContributionFields form={contributionForm({ conIsListed: true })} set={() => {}} />);
    expect(screen.getByTestId("con-stock-code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /키움 자동조회/ })).toBeInTheDocument();
  });

  it("K-3 ⭐: 평가기준일로 **증여일(현물출자 납입일)**을 쓴다고 화면에 명시", () => {
    render(<ContributionFields form={contributionForm({ conIsListed: true })} set={() => {}} />);
    expect(screen.getByText(/증여일\(현물출자 납입일\)/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(GIFT_DATE))).toBeInTheDocument();
  });
});

describe("전환주식 §39①3호 — 시점별 평가기준일 분리", () => {
  function csForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
    return { ...INITIAL_DEEMED, type: "convertible_stock", giftDate: GIFT_DATE, ...over };
  }

  it("K-4 ⭐: 전환 시점은 **증여일(전환한 날)**, 발행 시점은 **별도 기준일 입력**", () => {
    render(
      <ConvertibleStockFields
        form={csForm({ csConvIsListed: true, csIssueIsListed: true })}
        set={() => {}}
      />,
    );
    // 전환 시점 — 증여일 고정(§29①2호) ⇒ 읽기 전용 안내
    expect(screen.getByText(/증여일 = 전환한 날/)).toBeInTheDocument();
    // 발행 시점 — 「발행 당시」(§29②6나)라 증여일과 다르다
    expect(screen.getAllByText(/전환주식 발행 당시/).length).toBeGreaterThan(0);
    // ⭐ 날짜 입력은 **발행 시점에만** 1개 — 전환 시점에도 생기면 증여일과 어긋날 수 있다
    expect(screen.getAllByLabelText("연도")).toHaveLength(1);
  });

  it("K-5: 종목코드는 같은 법인이므로 두 시점이 한 값을 공유한다", () => {
    render(
      <ConvertibleStockFields
        form={csForm({ csConvIsListed: true, csIssueIsListed: true, csStockCode: "005930" })}
        set={() => {}}
      />,
    );
    const conv = screen.getByTestId("cs-stock-code") as HTMLInputElement;
    const issue = screen.getByTestId("cs-issue-stock-code") as HTMLInputElement;
    expect(conv.value).toBe("005930");
    expect(issue.value).toBe("005930"); // 같은 csStockCode를 양방향 read/write
  });

  it("K-6: 시점별 토글은 독립 — 전환만 상장이면 발행 시점 조회 UI는 없다", () => {
    render(<ConvertibleStockFields form={csForm({ csConvIsListed: true })} set={() => {}} />);
    expect(screen.getByTestId("cs-stock-code")).toBeInTheDocument();
    expect(screen.queryByTestId("cs-issue-stock-code")).not.toBeInTheDocument();
  });
});

describe("증자 §39 — 자동조회 배선", () => {
  it("K-7: 상장 ON → 종목코드 + 증여일 기준 안내", async () => {
    const { CapitalIncreaseFields } = await import(
      "../../components/calc/deemed-gift/capital-forms"
    );
    render(
      <CapitalIncreaseFields
        form={{ ...INITIAL_DEEMED, type: "capital_increase", giftDate: GIFT_DATE, ciIsListed: true }}
        set={() => {}}
      />,
    );
    const block = screen.getByTestId("ci-stock-code").closest("div") as HTMLElement;
    expect(within(block).getByText(/권리락일/)).toBeInTheDocument();
  });
});
