/**
 * 이월과세 소유자 분리 — 「취득시 기준시가」 칸은 증여자 취득 당시 값이다(계획서 `carryover-estimated-owner-split.plan.md` Q-2).
 * 시나리오 A의 파트 환산 분자·안분 비율이 이 칸에서 나온다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NonPurchaseSplitInputsBlock } from "@/components/calc/transfer/NonPurchaseSplitInputsBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>) =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2023-03-01", addressJibun: "서울특별시 강남구 삼성동 100", selfOwns: "building_only", ...over }) as AssetForm;

describe("소유자 분리 블록 — 취득시 기준시가 칸 이름", () => {
  it("이월과세 → 「증여자 취득 당시 기준시가」·「증여자 취득 당시 토지 공시지가」", () => {
    const a = asset({ acquisitionCause: "carryover_gift" });
    render(<NonPurchaseSplitInputsBlock asset={{ ...a, carryover: { ...a.carryover, donorAcquisitionDate: "2015-06-01" } } as AssetForm} onChange={() => {}} transferDate="2025-06-30" />);
    expect(screen.getByText(/증여자 취득 당시 기준시가/)).toBeTruthy();
    expect(screen.getAllByText(/증여자 취득 당시 토지 공시지가/).length).toBeGreaterThan(0);
  });

  it("상속 → 종전 「취득시 기준시가」", () => {
    render(<NonPurchaseSplitInputsBlock asset={asset({ acquisitionCause: "inheritance" })} onChange={() => {}} transferDate="2025-06-30" />);
    expect(screen.getByText(/^취득시 기준시가/)).toBeTruthy();
    expect(screen.queryByText(/증여자 취득 당시/)).toBeNull();
  });
});

describe("개별주택가격 총액 칸 — 이월과세 환산이면 이월과세 블록 값을 쓴다", () => {
  const carry = (c: Record<string, unknown>) => {
    const a = asset({ acquisitionCause: "carryover_gift" });
    return { ...a, carryover: { ...a.carryover, donorAcquisitionDate: "2015-06-01", ...c } } as AssetForm;
  };
  it("증여자 취득가액 모름(일반 환산) → 총액 칸 대신 안내", () => {
    render(<NonPurchaseSplitInputsBlock asset={carry({ useEstimatedAcquisition: true, estimationMode: "general" })} onChange={() => {}} transferDate="2025-06-30" />);
    expect(screen.getByTestId("owner-split-donor-total-note")).toBeTruthy();
  });
  it("증여자 취득가액 앎 → 종전 총액 칸", () => {
    render(<NonPurchaseSplitInputsBlock asset={carry({ useEstimatedAcquisition: false })} onChange={() => {}} transferDate="2025-06-30" />);
    expect(screen.queryByTestId("owner-split-donor-total-note")).toBeNull();
  });
});
