/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·⑦) — OH-22 §154⑤ 단서 처분 이력 위젯을 **실제 Step4**로 렌더해 노출 범위·입력·미리보기를 본다.
 *
 * - 2021-01-01~2022-05-09 양도 · 1세대 1주택에서만 열린다(④·⑧과 같은 술어 `calcFinalHouseRestartInScope`).
 * - 「있음」을 고르면 빈 행 하나가 열리고, 유형·처분일(DateInput)·일시적 2주택 관계를 받는다.
 * - 「그 밖(멸실 등)」이면 일시적 2주택 질문이 사라지고, 미리보기는 엔진 leaf 문장 그대로다.
 * - 판정 메뉴 결과 카드는 엔진 echo를 그대로 보여 준다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

function initial(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-03-01" } : a,
    ),
    transferDate: "2022-03-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    ...overrides,
  };
}

let latest: TransferFormData | undefined;
function Harness({ start }: { start: TransferFormData }) {
  const [form, setForm] = useState(start);
  return (
    <Step4
      form={form}
      onChange={(p) =>
        setForm((f) => {
          latest = { ...f, ...p };
          return latest;
        })
      }
    />
  );
}

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const has = (testId: string) => screen.queryByTestId(testId) !== null;

function typeDate(container: HTMLElement, ymd: string) {
  const [y, m, d] = ymd.split("-");
  fireEvent.change(within(container).getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(within(container).getByLabelText("월"), { target: { value: m } });
  fireEvent.change(within(container).getByLabelText("일"), { target: { value: d } });
}

describe("OH-22 ⑤ — 노출 범위", () => {
  it("★ 양도 2022-03-01 · 1주택이면 열린다", () => {
    render(<Harness start={initial()} />);
    expect(has("final-house-restart-section")).toBe(true);
  });
  it("양도 2022-05-10(단서 삭제)·2020-12-31(시행 전)이면 없다", () => {
    render(<Harness start={initial({ transferDate: "2022-05-10" })} />);
    expect(has("final-house-restart-section")).toBe(false);
    cleanup();
    render(<Harness start={initial({ transferDate: "2020-12-31" })} />);
    expect(has("final-house-restart-section")).toBe(false);
  });
  it("2주택이면 없다(범위: 양도일 현재 1주택)", () => {
    render(<Harness start={initial({ householdHousingCount: "2" })} />);
    expect(has("final-house-restart-section")).toBe(false);
  });
});

describe("OH-22 ⑤ — 입력과 미리보기(엔진 leaf 문장)", () => {
  it("★ 있음 → 빈 행 → 양도·2021-06-01·일시적 2주택 아님 → 폼 값 + 재기산 미리보기", () => {
    render(<Harness start={initial()} />);
    click("final-house-history-yes");
    expect(has("final-house-row-0")).toBe(true);
    click("final-house-kind-transfer");
    typeDate(screen.getByTestId("final-house-date-0"), "2021-06-01");
    click("final-house-temp-0-no");
    expect(latest?.finalHouseRestartHistory).toBe("yes");
    expect(latest?.finalHouseRestartDisposals).toMatchObject([
      { kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" },
    ]);
    expect(screen.getByTestId("final-house-restart-preview").textContent).toContain("2021-06-01부터 다시 셉니다");
    expect((screen.getByTestId("final-house-kind-transfer") as HTMLInputElement).checked).toBe(true);
  });
  it("일시적 2주택 관계 「예」면 재기산일이 되지 않는다는 미리보기", () => {
    render(
      <Harness
        start={initial({
          finalHouseRestartHistory: "yes",
          finalHouseRestartDisposals: [{ id: "a", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "yes" }],
        })}
      />,
    );
    expect(screen.getByTestId("final-house-restart-preview").textContent).toContain("재기산일이 되지 않습니다");
  });
  it("그 밖(멸실 등) → 일시적 2주택 질문이 사라지고 값도 비운다", () => {
    render(
      <Harness
        start={initial({
          finalHouseRestartHistory: "yes",
          finalHouseRestartDisposals: [{ id: "a", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" }],
        })}
      />,
    );
    expect(has("final-house-temp-0-yes")).toBe(true);
    click("final-house-kind-other");
    expect(has("final-house-temp-0-yes")).toBe(false);
    expect(latest?.finalHouseRestartDisposals[0]).toMatchObject({ kind: "other", temporaryTwoHouse: "" });
  });
  it("2020-12-31 처분 → 재기산 없음(재산세제과-1132) 미리보기", () => {
    render(
      <Harness
        start={initial({
          finalHouseRestartHistory: "yes",
          finalHouseRestartDisposals: [{ id: "a", kind: "transfer", date: "2020-12-31", temporaryTwoHouse: "no" }],
        })}
      />,
    );
    expect(screen.getByTestId("final-house-restart-preview").textContent).toContain("재산세제과-1132");
  });
  it("구 기록(필드 없음·모양 다름)도 화면이 죽지 않고 미답으로 읽는다", () => {
    const stale = initial() as unknown as Record<string, unknown>;
    delete stale.finalHouseRestartHistory;
    stale.finalHouseRestartDisposals = "broken";
    render(<Harness start={stale as unknown as TransferFormData} />);
    expect(has("final-house-restart-section")).toBe(true);
    expect((screen.getByTestId("final-house-history-yes") as HTMLInputElement).checked).toBe(false);
  });
});

describe("OH-22 ⑦ — 판정 메뉴 결과 카드는 엔진 echo 그대로", () => {
  it("재기산 적용 문장을 보여 준다", () => {
    const result = {
      judgment: {
        isExempt: false,
        isPartialExempt: false,
        appliedExceptions: [],
        pending: [],
        undetermined: [],
        unmetExceptions: [],
        legalBasis: [],
        finalOneHouseRestart: {
          applied: true,
          restartDate: "2021-06-01T00:00:00.000Z",
          description: "… 보유기간을 2021-06-01부터 다시 셉니다 …",
          legalBasis: "소득세법 시행령 §154⑤",
        },
      },
      houseCount: { total: 1, countedForExemption: 1, excluded: [] },
    } as unknown as OneHouseExemptionResponse;
    render(<OneHouseJudgmentResultView result={result} transferDate="2022-03-01" />);
    expect(screen.getByTestId("one-house-final-house-restart").textContent).toContain("2021-06-01부터 다시 셉니다");
  });
});
