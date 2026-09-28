/**
 * anchor: §39 경로 종가평균 자동조회 — 「상증령」§52의2② 평가기간 단축(#7) + 증여일 시점 안내(#95)
 *
 * ① §52의2② — 평가기준일 전후 2개월 안에 증자·합병 등 사유가 있고 그 평균이 부적당하면 기간을
 *    단축한다(「상증법」§63①1가 괄호의 2단 요건 — 서울고법 2023누64487). 판정기
 *    `resolveOverridePeriod`와 버튼의 override 배관은 상속 상장주식에 이미 있었는데 §39·§39①3호·
 *    §39의3 경로만 전달이 빠져 **항상 전후 2개월 전 구간**으로 조회했다(A-4 실측 +60,000,000·+160,000,000).
 *    ⚠️ 자동 판정 금지 — **사용자가 입력한 사유발생일**로만 단축한다. 비우면 종전대로 전 구간.
 * ② #95 — 증여일(=이익 계산 기준일) 규정의 시점 3구간:
 *    · ~2015-02-02: 구 「상증령」§29④ 단항 — 주식대금 납입일(신주인수권증서 교부일)뿐. 권리락일 없음
 *    · 2015-02-03~2016-02-04: §29④ 각 호(대통령령 제26069호) — 권리락일 분기 신설, 위치만 ④
 *    · 2016-02-05~: 현행 §29① 각 호
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CapitalIncreaseFields } from "@/components/calc/deemed-gift/capital-forms";
import { ConvertibleStockFields } from "@/components/calc/deemed-gift/convertible-stock-form";
import { ContributionFields } from "@/components/calc/deemed-gift/contribution-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

const bodies: Record<string, unknown>[] = [];

beforeEach(() => {
  bodies.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          average: 11_000, tradingDays: 1, sum: 11_000, stockName: "테스트",
          slotDates: ["2025-03-17"], closingPrices: [11_000], weekendLabels: [""],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const form = (over: Partial<DeemedFormState>): DeemedFormState => ({ ...INITIAL_DEEMED, giftDate: "2025-03-15", ...over });

async function clickFetch(nth = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: /키움 자동조회/ })[nth]!);
  await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
  return bodies[0]!;
}

describe("[VW] §52의2② 사유발생일 → 자동조회 기간 단축", () => {
  it("[VW-1] 🔴 §39 단건 — 평가기준일(권리락일)에 증자 사유 → 다음날부터 조회", async () => {
    render(
      <CapitalIncreaseFields
        form={form({ type: "capital_increase", ciIsListed: true, ciStockCode: "005930", ciValuationEventDate: "2025-03-15" })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body.startOverrideDate).toBe("2025-03-16");
    expect(body.endOverrideDate).toBeUndefined();
  });

  it("[VW-2] 긍정 짝 — 사유발생일을 비우면 단축 없이 전후 2개월(자동 판정 금지)", async () => {
    render(
      <CapitalIncreaseFields
        form={form({ type: "capital_increase", ciIsListed: true, ciStockCode: "005930" })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body).not.toHaveProperty("startOverrideDate");
    expect(body).not.toHaveProperty("endOverrideDate");
  });

  it("[VW-3] 🔴 평가기준일 이후 사유 → 그 전일까지", async () => {
    render(
      <CapitalIncreaseFields
        form={form({ type: "capital_increase", ciIsListed: true, ciStockCode: "005930", ciValuationEventDate: "2025-04-10" })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body.endOverrideDate).toBe("2025-04-09");
  });

  it("[VW-4] 🔴 전환주식 발행 시점 — 그 시점 기준일(발행일)과 그 시점 사유발생일로 판정한다", async () => {
    render(
      <ConvertibleStockFields
        form={form({
          type: "convertible_stock", csIssueIsListed: true, csStockCode: "005930",
          csIssuanceDate: "2020-06-01", csIssueValuationEventDate: "2020-05-20",
          // 전환 시점 사유발생일은 다른 값 — 섞이면 이 값이 나온다
          csConvValuationEventDate: "2025-03-01",
        })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body.valuationDate).toBe("2020-06-01");
    expect(body.startOverrideDate).toBe("2020-05-21");
  });

  it("[VW-5] 🔴 전환주식 전환 시점 — 증여일과 전환 시점 사유발생일", async () => {
    render(
      <ConvertibleStockFields
        form={form({
          type: "convertible_stock", csConvIsListed: true, csStockCode: "005930",
          csConvValuationEventDate: "2025-03-01", csIssueValuationEventDate: "2020-05-20",
        })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body.valuationDate).toBe("2025-03-15");
    expect(body.startOverrideDate).toBe("2025-03-02");
  });

  it("[VW-6] 🔴 형제 §39의3 현물출자도 같은 입력으로 단축한다", async () => {
    render(
      <ContributionFields
        form={form({ type: "contribution", conIsListed: true, conStockCode: "005930", conValuationEventDate: "2025-03-15" })}
        set={() => {}}
      />,
    );
    const body = await clickFetch();
    expect(body.startOverrideDate).toBe("2025-03-16");
  });

  it("[VW-7] 사유발생일 입력칸은 선택이며 §52의2②를 고지한다", () => {
    render(
      <CapitalIncreaseFields form={form({ type: "capital_increase", ciIsListed: true })} set={() => {}} />,
    );
    expect(screen.getByTestId("ci-stock-code-event-date")).toBeInTheDocument();
    expect(screen.getAllByText(/§52의2②/).length).toBeGreaterThan(0);
  });
});

describe("[ERA] #95 — §39 증여일(이익 계산 기준일) 규정 시점 3구간", () => {
  const renderAt = (giftDate: string) =>
    render(<CapitalIncreaseFields form={form({ type: "capital_increase", giftDate })} set={() => {}} />);

  it("[ERA-1] 🔴 2015-02-02 → 구 §29④ 단항: 주식대금 납입일 기준(권리락일 없음)", () => {
    renderAt("2015-02-02");
    const n = screen.getByTestId("ci-gift-date-era-notice");
    expect(n).toHaveTextContent("§29④");
    expect(n).toHaveTextContent("주식대금 납입일");
    expect(n).toHaveTextContent("2015.2.3.");
  });

  it("[ERA-2] 🔴 2015-02-03 → 권리락일 분기는 있으나 조문 위치는 §29④ 각 호", () => {
    renderAt("2015-02-03");
    const n = screen.getByTestId("ci-gift-date-era-notice");
    expect(n).toHaveTextContent("§29④ 각 호");
    expect(n).not.toHaveTextContent("권리락일 기준은 이 날 뒤에");
  });

  it("[ERA-3] 2016-02-04 → 아직 §29④ 각 호", () => {
    renderAt("2016-02-04");
    expect(screen.getByTestId("ci-gift-date-era-notice")).toHaveTextContent("§29④ 각 호");
  });

  it("[ERA-4] 긍정 짝 — 2016-02-05부터는 현행 §29①이라 시점 고지 없음", () => {
    renderAt("2016-02-05");
    expect(screen.queryByTestId("ci-gift-date-era-notice")).not.toBeInTheDocument();
  });
});
