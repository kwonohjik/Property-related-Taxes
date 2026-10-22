/**
 * ⑤ — 의제취득일(1985.1.1.) 전 상속 ③ 후보면 환산 토글이 없어도 §164⑨ 보상액 칸을 연다(Q-10 A).
 * ⑧(`exprFactsFromAsset`)과 같은 함수(`preDeemedExprFacts`)로 판정한다. 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §14.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ExpropriationBlock } from "@/components/calc/transfer/ExpropriationBlock";
import { AuctionBlock } from "@/components/calc/transfer/AuctionBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 토지 · 1980 상속 · 환산 토글 OFF(화면 기본값) · ③ 분자·분모 입력 */
const land = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1980-03-01",
    decedentAcquisitionDate: "1970-01-01", inheritanceAssetKind: "land", useEstimatedAcquisition: false,
    standardPriceAtAcq: "10,000,000", standardPriceAtTransfer: "200,000,000", transferCause: "public_expropriation", ...over,
  }) as AssetForm;
const mountExpr = (a: AssetForm) => render(<ExpropriationBlock asset={a} onChange={() => {}} transferDate="2024-03-01" />);

describe("수용 블록 — 의제취득일 전 상속 ③ 후보", () => {
  it("1980 상속 + ③ 분자 → ② 보상가액(원/㎡) 칸이 보인다 (종전: 환산 토글이 없어 숨음)", () => {
    mountExpr(land());
    expect(screen.queryByText("② 보상가액")).not.toBeNull();
  });
  it("③ 후보면 ① 양도시 ㎡당 공시지가를 이 블록에서 입력받는다(상속 자산에는 다른 칸이 없다 · 면적 칸은 두지 않는다) / 매매 환산은 읽기 전용 ①", () => {
    const { unmount } = mountExpr(land());
    expect(screen.getByTestId("expr-pre-deemed-std-persqm")).toBeTruthy();
    expect(screen.queryByText("① 공시지가 (양도시 기준시가)")).toBeNull();
    unmount();
    mountExpr(land({ acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: true }));
    expect(screen.queryByTestId("expr-pre-deemed-std-persqm")).toBeNull();
    expect(screen.queryByText("① 공시지가 (양도시 기준시가)")).not.toBeNull();
  });
  it("1990 상속(③ 없음) → 숨김", () => {
    mountExpr(land({ acquisitionDate: "1990-03-01" }));
    expect(screen.queryByText("② 보상가액")).toBeNull();
  });
  it("환산 플래그가 남은 상속 자산도 ③ 후보면 ㎡당 칸이 열린다(매매 블록이 뜨지 않는다)", () => {
    mountExpr(land({ useEstimatedAcquisition: true }));
    expect(screen.getByTestId("expr-pre-deemed-std-persqm")).toBeTruthy();
  });
  it("㎡당 공시지가를 넣으면 ③ 분모 총액도 같은 값(㎡당 × 기본정보 면적)으로 함께 쓴다", () => {
    const onChange = vi.fn();
    render(<ExpropriationBlock asset={land({ transferArea: "200" })} onChange={onChange} transferDate="2024-03-01" />);
    fireEvent.change(screen.getByTestId("expr-pre-deemed-std-persqm"), { target: { value: "1,000,000" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ standardPricePerSqmAtTransfer: expect.any(String), standardPriceAtTransfer: "200000000" }));
  });
  it("③ 분자 없음(① 평가액만) → 숨김", () => {
    mountExpr(land({ standardPriceAtAcq: "", publishedValueAtInheritance: "50,000,000" }));
    expect(screen.queryByText("② 보상가액")).toBeNull();
  });
});

describe("공매·경락 블록 — 같은 사실", () => {
  it("1980 상속 + ③ 분자 → 공매·경락 토글 노출 / 1990 → 숨김", () => {
    const { unmount } = render(<AuctionBlock asset={land({ transferCause: "" as AssetForm["transferCause"] })} onChange={() => {}} transferDate="2024-03-01" />);
    expect(screen.queryByText(/공매·경락으로 양도했나요/)).not.toBeNull();
    unmount();
    render(<AuctionBlock asset={land({ transferCause: "" as AssetForm["transferCause"], acquisitionDate: "1990-03-01" })} onChange={() => {}} transferDate="2024-03-01" />);
    expect(screen.queryByText(/공매·경락으로 양도했나요/)).toBeNull();
  });
});
