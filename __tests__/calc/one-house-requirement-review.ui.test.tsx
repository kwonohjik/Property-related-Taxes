/**
 * @vitest-environment jsdom
 *
 * anchor(⑦) — 판정 결과 화면의 **비과세 요건 순차 검토** 카드 · 판정 기준일 · 배지(Q-1=B) (2026-09-29)
 *
 * 엔진 anchor는 `requirementReview`가 **채워지는 것**까지만 증명한다. 화면이 그것을 읽고
 * 순서대로 그리는지는 렌더로만 증명된다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 * 그래서 가짜 응답이 아니라 **실제 엔진 출력**을 렌더한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);

/** 제보 입력 — 기한 2026-07-01 · 양도 예정 2026-10-22 · 24억. */
const REPORTED = baseTransferInput({
  acquisitionDate: D("2018-07-06"),
  transferDate: D("2026-10-22"),
  transferPrice: 2_400_000_000,
  householdHousingCount: 2,
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 26,
  temporaryTwoHouse: {
    previousAcquisitionDate: D("2018-07-06"),
    newAcquisitionDate: D("2023-07-01"),
  } as TransferTaxInput["temporaryTwoHouse"],
}) as OneHouseJudgeInput;

/** JSON 경유(Date → string)까지 실제 응답과 같게 만든다. */
function responseAt(baseDate: string): OneHouseExemptionResponse {
  const judgment = checkExemption(REPORTED, rules, D("2021-01-01"), { judgmentBaseDate: D(baseDate) });
  return JSON.parse(
    JSON.stringify({
      judgment,
      judgmentBaseDate: baseDate,
      houseCount: { total: 2, countedForExemption: 2, excluded: [] },
    }),
  );
}

describe("판정 결과 — 제보 사례(기한이 판정 기준일 전에 지남)", () => {
  it("RVUI-1 배지는 「과세」, 이룰 수 없는 기한 안내 카드는 없고 판정 기준일을 보여 준다", () => {
    render(<OneHouseJudgmentResultView result={responseAt("2026-09-29")} transferDate="2026-10-22" />);

    expect(screen.getByTestId("one-house-verdict").textContent).toBe("과세");
    expect(screen.queryByText("양도일을 조정하면 요건을 갖출 수 있습니다")).toBeNull();
    expect(screen.queryByTestId("one-house-pending-155-1-disposal-deadline")).toBeNull();
    expect(screen.getByTestId("one-house-judgment-base-date").textContent).toContain("2026-09-29");
  });

  it("RVUI-2 요건 행을 법정 순서대로 그리고 각 행의 결과·사실·안내를 엔진 값 그대로 보여 준다", () => {
    render(<OneHouseJudgmentResultView result={responseAt("2026-09-29")} />);

    const list = screen.getByTestId("one-house-requirement-review");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => [r.getAttribute("data-testid"), r.getAttribute("data-status")])).toEqual([
      ["one-house-requirement-one-year", "met"],
      ["one-house-requirement-disposal-deadline", "unmet"],
      ["one-house-requirement-holding", "met"],
      ["one-house-requirement-residence", "met"],
      ["one-house-requirement-high-value", "partial"],
    ]);
    const deadline = screen.getByTestId("one-house-requirement-disposal-deadline");
    expect(deadline.textContent).toContain("미충족");
    expect(deadline.textContent).toContain("신규주택 취득일부터 3년 이내 종전주택 양도");
    expect(deadline.textContent).toContain("2026-07-01");
    expect(deadline.textContent).toContain("2026-10-22");
    expect(deadline.textContent).toContain("판정 기준일(2026-09-29) 전에 지나");
    expect(screen.getByTestId("one-house-requirement-one-year").textContent).toContain("2019-07-07");
    expect(screen.getByTestId("one-house-requirement-residence").textContent).toContain("26개월");
  });

  /**
   * 🔴 고가주택 행 제목이 판정과 **반대로** 읽히면 안 된다(2026-09-29 제보). 종전 제목은
   *    「양도가액 12억원 이하(고가주택이 아님)」 고정이라, 24억 사례에서 「초과분 과세」 배지 옆에
   *    「고가주택이 아님」이 그려졌다.
   */
  it("RVUI-2b 24억 → 고가주택 행 제목이 「고가주택 … 초과분 과세」이고 「고가주택 아님」이 없다", () => {
    render(<OneHouseJudgmentResultView result={responseAt("2026-09-29")} />);
    const row = screen.getByTestId("one-house-requirement-high-value");
    expect(row.getAttribute("data-status")).toBe("partial");
    expect(row.textContent).toContain("고가주택(양도가액 12억원 초과) — 12억원 초과분 과세");
    expect(row.textContent).not.toContain("고가주택 아님");
    expect(row.textContent).not.toContain("고가주택이 아님");
  });

  it("RVUI-3 요건 카드는 「주택 수 산정」 바로 다음이다(로직 순서 = 표시 순서)", () => {
    render(<OneHouseJudgmentResultView result={responseAt("2026-09-29")} />);

    const houseCount = screen.getByText("주택 수 산정");
    const review = screen.getByText("일시적 2주택 비과세 요건 검토");
    expect(houseCount.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 섹션 번호: 1 주택 수 산정 → 2 요건 검토
    expect(review.parentElement?.textContent).toContain("2");
  });
});

describe("판정 결과 — 기한이 아직 남은 경우(Q-1=B)", () => {
  it("RVUI-4 배지는 여전히 「과세」(입력일 기준)이고, 기한은 「양도일 조정」 안내로만 뜬다", () => {
    render(<OneHouseJudgmentResultView result={responseAt("2026-05-01")} />);

    expect(screen.getByTestId("one-house-verdict").textContent).toBe("과세");
    expect(screen.getByText("양도일을 조정하면 요건을 갖출 수 있습니다")).toBeTruthy();
    const p = screen.getByTestId("one-house-pending-155-1-disposal-deadline");
    expect(p.textContent).toContain("2026-07-01");
    // Q-3 — 24억이라 기한을 지켜도 전액 비과세가 아니다
    expect(p.textContent).toContain("부분 비과세");
  });
});

describe("구 이력 — 필드가 없는 응답", () => {
  it("RVUI-5 `requirementReview`·`judgmentBaseDate`가 없으면 카드·기준일을 그리지 않는다", () => {
    const old = responseAt("2026-09-29");
    delete (old.judgment as { requirementReview?: unknown }).requirementReview;
    delete (old as { judgmentBaseDate?: string }).judgmentBaseDate;
    render(<OneHouseJudgmentResultView result={old} />);

    expect(screen.queryByTestId("one-house-requirement-review")).toBeNull();
    expect(screen.queryByTestId("one-house-judgment-base-date")).toBeNull();
  });

  it("RVUI-6 구 이력의 pending(옛 「조건부」 기록)도 배지는 「과세」로 읽는다 — 이력 카드와 같은 술어", () => {
    const v = oneHouseVerdictOf({ isExempt: false, isPartialExempt: false, pending: [{}] });
    expect(v.label).toBe("과세");
    expect(v.tone).toBe("rose");
  });
});
