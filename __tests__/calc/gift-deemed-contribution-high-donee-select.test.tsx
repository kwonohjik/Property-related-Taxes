/**
 * anchor: §39의3 고가인수 결과뷰 — **과세 수증자 선택 select** (Phase B ⑦)
 *
 * 선택 UI가 없으면 `conSelectedDoneeIndex`가 항상 0에 묶여 2번째 이후 수증자를
 * 증여세 마법사로 이관할 경로가 사라진다(prefill 앵커 PB-2와 짝).
 * 목록 기준은 prefill과 동일하게 **과세 행(value > 0)만** — 인덱스 축이 어긋나면
 * 화면에서 고른 수증자와 실제 이관 대상이 달라진다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeemedGiftResultView } from "../../components/calc/results/DeemedGiftResultView";
import { calcContributionGift } from "../../lib/tax-engine/gift-deemed/contribution-in-kind";
import type { ContributionInput } from "../../lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

/** 30% 게이트 통과 — B 175,000,000 · C 50,000,000 둘 다 과세 (TBC-2 동일 입력) */
const CASE2: ContributionInput = {
  caseType: "high",
  preContribPrice: 5_000,
  preContribShares: 100_000,
  newSharePrice: 20_000,
  contributedShares: 50_000,
  allocatedShares: 50_000,
  parties: [
    { name: "B", preShares: 35_000 },
    { name: "C", preShares: 10_000 },
  ],
};

describe("§39의3 고가 — 수증자 선택 UI", () => {
  it("PB-U1: 과세 수증자 2명 → select 노출 + onSelectDonee 전달", () => {
    const onSelect = vi.fn();
    render(
      <DeemedGiftResultView
        result={calcContributionGift(CASE2)}
        onToGiftTax={() => {}}
        selectedDoneeIndex={0}
        onSelectDonee={onSelect}
      />,
    );

    const sel = screen.getByTestId("con-high-donee-selector") as HTMLSelectElement;
    expect(sel.options).toHaveLength(2);
    expect(sel.options[0].textContent).toContain("B");
    expect(sel.options[1].textContent).toContain("C");

    fireEvent.change(sel, { target: { value: "1" } });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("PB-U2: 과세 수증자 1명뿐이면 select 미노출 (선택할 것이 없다)", () => {
    // 30% 게이트 미달 + 3억 게이트로 P만 과세 (prefill 앵커 PB-3과 동일 입력)
    const result = calcContributionGift({
      caseType: "high",
      preContribPrice: 10_000,
      preContribShares: 1_000_000,
      newSharePrice: 11_000,
      contributedShares: 1_000_000,
      allocatedShares: 1_000_000,
      parties: [
        { name: "Q", preShares: 100_000 },
        { name: "P", preShares: 700_000 },
      ],
    });
    render(<DeemedGiftResultView result={result} onToGiftTax={() => {}} />);

    // 안분 명세 표(2행)는 그대로 — 0원 행도 근거로 보여 준다
    expect(screen.getByTestId("deemed-contribution-breakdown")).toBeInTheDocument();
    expect(screen.queryByTestId("con-high-donee-select")).not.toBeInTheDocument();
  });

  it("PB-U3: 저가는 동시증여 일괄 이관 ⇒ 선택 UI 없음", () => {
    const result = calcContributionGift({
      caseType: "low",
      preContribPrice: 20_000,
      preContribShares: 100_000,
      newSharePrice: 10_000,
      contributedShares: 100_000,
      allocatedShares: 100_000,
      parties: [
        { name: "A", preShares: 55_000 },
        { name: "B", preShares: 35_000 },
      ],
    });
    render(<DeemedGiftResultView result={result} onToGiftTax={() => {}} />);
    expect(screen.queryByTestId("con-high-donee-select")).not.toBeInTheDocument();
  });
});
