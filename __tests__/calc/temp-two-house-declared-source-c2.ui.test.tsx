/**
 * UI anchor — 판정 메뉴 §155① 신규 주택 취득일이 **직접 선언**(옛 기록·AI 추출)에서 왔으면 그 출처를 말하고 지울 수 있다
 * (2026-11-12 리뷰 C-2).
 *
 * 종전: `source: "declared"`인데 「보유 주택 목록에서 … 자동으로 찾아 반영」이라고 쓰고, 선언을 끄거나 고칠 칸이 없었다 —
 * 판정 카드는 「요건 충족」, ④는 `temporaryTwoHouse`를 실어 비과세가 났다.
 *
 * 시료: 명부 1채(2010-01-01 — 양도 주택보다 먼저라 신규 주택으로 도출되지 않음) · 양도 주택 2015-01-01 · 선언 신규 2021-01-01.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

function form(over: Partial<TransferFormData> = {}): OneHouseJudgmentFormData {
  const base = { ...createDefaultTransferFormData(), ...createInitialOneHouseJudgmentForm() };
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-01-01" } : a,
    ),
    transferDate: "2023-06-01",
    isOneHousehold: true,
    houses: [
      { id: "h1", region: "capital" as const, acquisitionDate: "2010-01-01", officialPrice: "300000000", isInherited: false },
    ] as TransferFormData["houses"],
    ...over,
  };
}

const DECLARED = { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2021-01-01" } satisfies Partial<TransferFormData>;

describe("C-2 — 직접 선언 신규 주택 취득일의 출처와 해제", () => {
  it("선언 경로면 「직접 선언」이라고 말하고 「목록에서 자동 반영」 문구를 쓰지 않는다", () => {
    render(<Step2 form={form(DECLARED)} onChange={() => {}} />);
    expect(screen.getByTestId("temp-two-house-declared-source").textContent).toContain("직접 선언된");
    expect(screen.queryAllByText(/자동으로 찾아 반영합니다/)).toHaveLength(0);
  });

  it("「직접 선언 지우기」가 선언과 그 경위 답을 함께 지운다", () => {
    const onChange = vi.fn();
    render(<Step2 form={form({ ...DECLARED, newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2019-01-01" })} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("temp-two-house-declared-clear"));
    expect(onChange).toHaveBeenCalledWith({
      temporaryTwoHouseSpecial: false,
      newHouseAcquisitionDate: "",
      newHouseOriginKind: "",
      newHouseRightAcquisitionDate: "",
      newHouseRightApprovalDate: "",
    });
  });

  it("대조: 명부에서 도출되면(신규 주택 행 2019-01-01) 종전 문구 그대로 · 해제 버튼 없음", () => {
    render(
      <Step2
        form={form({
          houses: [
            { id: "h1", region: "capital" as const, acquisitionDate: "2019-01-01", officialPrice: "300000000", isInherited: false },
          ] as TransferFormData["houses"],
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(/자동으로 찾아 반영합니다/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("temp-two-house-declared-clear")).toBeNull();
  });
});
