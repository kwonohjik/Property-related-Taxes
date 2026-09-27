/**
 * ⑤ 명부형 행별 축 — 행 편집기의 영리법인 토글 (7-13).
 *
 * 토글은 **수증자 행에만** 있어야 한다. 증여자 행에 두면 사용자가 켜도 엔진이 무시한다 —
 * 켠 것이 반영되지 않는 토글은 거짓 입력 경로다.
 *   §38   과대평가(이익측) 행에만 · 과소평가(증여자측) 행에는 없음
 *   §39의2 모든 행 — 저가/고가를 엔진이 자동 판정해 **같은 행이 역할을 바꾼다**. 제목이 그 조건을 말한다
 *   §39의3 고가(수증자 명부)에서만 · 저가(증여자 명부)에서는 없음
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MergerFields, ContributionFields } from "@/components/calc/deemed-gift/capital-forms";
import { CapitalDecreaseShareholderTable } from "@/components/calc/deemed-gift/CapitalDecreaseShareholderTable";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

const form = (f: Partial<DeemedFormState>) => ({ ...INITIAL_DEEMED, ...f }) as DeemedFormState;
const toggle = (testId: string) => screen.getByTestId(testId).querySelector("[role=switch]") ?? screen.getByTestId(testId);

describe("⑤ §38 합병 매트릭스 — 과대평가(수증자) 행", () => {
  const f = form({
    type: "merger",
    mrgUseShareholders: true,
    mrgOverShareholders: [{ name: "갑", shares: "140000" }],
    mrgUnderShareholders: [{ name: "을", shares: "100000" }],
  });

  it("[RFU-1] 과대평가 행에 토글이 있고, 켜면 그 행에 표지가 선다", () => {
    const set = vi.fn();
    render(<MergerFields form={f} set={set} />);
    fireEvent.click(toggle("mrg-over-corp-0"));
    expect(set).toHaveBeenCalledWith({ mrgOverShareholders: [{ name: "갑", shares: "140000", isForProfitCorp: true }] });
  });

  it("[RFU-2] 긍정 짝: 과소평가(증여자) 행에는 토글이 없다", () => {
    render(<MergerFields form={f} set={vi.fn()} />);
    expect(screen.queryByTestId("mrg-under-corp-0")).toBeNull();
  });
});

describe("⑤ §39의2 감자 멀티 — 주주 행", () => {
  const rows = [
    { id: "a", name: "갑", preShares: "100000", redeemedShares: "100000", redemptionPrice: "10000", relationGroup: "A" },
    { id: "b", name: "병", preShares: "60000", redeemedShares: "0", redemptionPrice: "", relationGroup: "A" },
  ];

  it("[RFU-3] 감자주주·잔존주주 **모든 행**에 토글이 있다 — 역할은 저가/고가 판정이 정한다", () => {
    render(<CapitalDecreaseShareholderTable shareholders={rows} onChange={vi.fn()} />);
    expect(screen.getByTestId("cd-sh-corp-0")).toBeTruthy();
    expect(screen.getByTestId("cd-sh-corp-1")).toBeTruthy();
    expect(screen.getByTestId("cd-sh-corp-0").textContent).toContain("수증자");
  });

  it("[RFU-4] 켜면 그 행에만 표지가 선다", () => {
    const onChange = vi.fn();
    render(<CapitalDecreaseShareholderTable shareholders={rows} onChange={onChange} />);
    fireEvent.click(toggle("cd-sh-corp-1"));
    expect(onChange).toHaveBeenCalledWith([rows[0], { ...rows[1], isForProfitCorp: true }]);
  });
});

describe("⑤ §39의3 현물출자 명부", () => {
  const parties = [{ name: "을", shares: "10000", relation: "" as const }];

  it("[RFU-5] 고가(수증자 명부) — 토글이 있고, 켜면 그 행에 표지가 선다", () => {
    const set = vi.fn();
    render(<ContributionFields form={form({ type: "contribution", conCaseType: "high", conParties: parties })} set={set} />);
    fireEvent.click(toggle("con-party-corp-0"));
    expect(set).toHaveBeenCalledWith({ conParties: [{ ...parties[0], isForProfitCorp: true }] });
  });

  it("[RFU-6] 긍정 짝: 저가(증여자 명부) — 토글이 없다", () => {
    render(<ContributionFields form={form({ type: "contribution", conCaseType: "low", conParties: parties })} set={vi.fn()} />);
    expect(screen.queryByTestId("con-party-corp-0")).toBeNull();
  });
});
