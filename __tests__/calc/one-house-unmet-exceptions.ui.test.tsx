/**
 * @vitest-environment jsdom
 *
 * anchor(⑦) — 판정 결과 화면의 **「선언했으나 적용되지 않은 특례」** 카드.
 *
 * ## 왜 필요한가
 *
 * 엔진 anchor(`merge-unmet-reasons.anchor.test.ts`)는 `judgment.unmetExceptions`가 **채워지는
 * 것**까지만 증명한다. 화면이 그 필드를 **읽는다**는 증명은 아니다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`) — 실제로 이 저장소에는
 * `OneHouseJudgmentResultView`를 렌더하는 테스트가 **한 건도 없었다**(2026-09-22 실측).
 * 카드를 지우거나 조건을 뒤집어도 엔진 테스트는 전건 통과한다.
 *
 * ## 고정하는 것
 *
 * 1. 사유가 있으면 카드가 뜨고 **사유 문장이 그대로** 보인다
 * 2. 빈 배열이면 카드 자체가 **렌더되지 않는다**(「해당 없음」을 나열하지 않는다)
 * 3. 「조건부」(`pending`) 카드와 **다른 카드**다 — 둘이 같은 자리를 다투지 않는다
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

afterEach(cleanup);

const REASON_ACQ =
  "양도 주택을 혼인한 날(2017-03-11) 이후인 2017-08-31에 취득했습니다 — 이 특례는 합가 당시 이미 보유하던 주택에 적용됩니다.";
const REASON_COUNT =
  "세대 주택 수가 3채입니다 — 합가 특례는 일시적 2주택 특례와 겹친 경우에만 3주택까지 적용되는데, ② 보유 주택 목록에서 신규 주택(양도 주택보다 나중에 취득한 주택)이 하나로 특정되지 않습니다.";

const response = (
  unmetExceptions: OneHouseExemptionResponse["judgment"]["unmetExceptions"],
): OneHouseExemptionResponse =>
  ({
    judgment: {
      isExempt: false,
      isPartialExempt: false,
      appliedExceptions: [],
      pending: [],
      undetermined: [],
      unmetExceptions,
      legalBasis: [],
    },
    houseCount: { total: 3, countedForExemption: 3, excluded: [] },
  }) as unknown as OneHouseExemptionResponse;

const MARRIAGE_UNMET = [
  {
    id: "155-5-marriage-merge",
    label: "혼인 합가",
    legalBasis: "소득세법 시행령 §155⑤",
    reasons: [REASON_ACQ, REASON_COUNT],
  },
];

describe("판정 결과 — 선언했으나 적용되지 않은 특례", () => {
  it("UMUI-1 사유가 있으면 카드와 사유 문장을 렌더한다", () => {
    render(<OneHouseJudgmentResultView result={response(MARRIAGE_UNMET)} />);

    expect(screen.getByText("선언했으나 적용되지 않은 특례")).toBeTruthy();
    expect(screen.getByTestId("one-house-unmet-155-5-marriage-merge")).toBeTruthy();
    expect(screen.getByText("혼인 합가 — 요건 미충족")).toBeTruthy();
    // 사유 문장은 엔진이 만든 것을 **그대로** 보여준다(화면이 다시 쓰지 않는다)
    expect(screen.getByText(REASON_ACQ)).toBeTruthy();
    expect(screen.getByText(REASON_COUNT)).toBeTruthy();
  });

  it("UMUI-2 빈 배열이면 카드를 렌더하지 않는다", () => {
    render(<OneHouseJudgmentResultView result={response([])} />);

    expect(screen.queryByText("선언했으나 적용되지 않은 특례")).toBeNull();
    expect(screen.queryByTestId("one-house-unmet-155-5-marriage-merge")).toBeNull();
  });

  it("UMUI-3 「조건부」 카드와 별개다 — 불성립만 있을 때 조건부 카드는 뜨지 않는다", () => {
    render(<OneHouseJudgmentResultView result={response(MARRIAGE_UNMET)} />);

    expect(screen.queryByText("조건부 — 기한 내에 갖추면 비과세")).toBeNull();
    expect(screen.getByText("선언했으나 적용되지 않은 특례")).toBeTruthy();
  });

  it("UMUI-4 동거봉양 축도 제 라벨로 렌더한다", () => {
    render(
      <OneHouseJudgmentResultView
        result={response([
          {
            id: "155-4-parental-care-merge",
            label: "동거봉양 합가",
            legalBasis: "소득세법 시행령 §155④",
            reasons: ["「세대 내 먼저 양도하는 주택」으로 선언하지 않았습니다 — 합가 특례는 합가 후 세대에서 먼저 양도하는 주택에만 적용됩니다."],
          },
        ])}
      />,
    );

    expect(screen.getByTestId("one-house-unmet-155-4-parental-care-merge")).toBeTruthy();
    expect(screen.getByText("동거봉양 합가 — 요건 미충족")).toBeTruthy();
  });
});
