/**
 * anchor: §43① 중복적용 배제 공통 고지 — 결과뷰(단건·cap-table) (#112)
 * 표지(`dupExclusionApplies`)가 true일 때만 뜬다. §45의2 명의신탁은 열거 밖이라 뜨면 거짓 고지다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedGiftResultView } from "@/components/calc/results/DeemedGiftResultView";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";

afterEach(cleanup);
const noop = () => {};

describe("[DXV] §43① 공통 고지", () => {
  it("[DXV-1] 🔴 §39 단건 결과에 고지", () => {
    const r = calcDeemedGift({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 50_000, forfeitedShares: 10_000,
    });
    render(<DeemedGiftResultView result={r} onToGiftTax={noop} />);
    const n = screen.getByTestId("deemed-dup-exclusion-note");
    expect(n).toHaveTextContent("§43①");
    expect(n).toHaveTextContent("가장 많게");
  });

  it("[DXV-2] 긍정 짝 — §45의2 명의신탁은 고지 없음", () => {
    const r = calcDeemedGift({ type: "nominee_trust", hasTaxAvoidancePurpose: true });
    render(<DeemedGiftResultView result={r} onToGiftTax={noop} />);
    expect(screen.queryByTestId("deemed-dup-exclusion-note")).not.toBeInTheDocument();
  });

  it("[DXV-3] 🔴 cap-table 결과에도 고지", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low", preIssuePrice: 20_000, newSharePrice: 10_000,
      shareholders: [
        { id: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
        { id: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 100_000, reallocatedShares: 60_000, relatedTo: ["A"] },
      ],
    });
    render(<DeemedGiftResultView result={r} onToGiftTax={noop} />);
    expect(screen.getByTestId("deemed-dup-exclusion-note")).toHaveTextContent("§43①");
  });
});
