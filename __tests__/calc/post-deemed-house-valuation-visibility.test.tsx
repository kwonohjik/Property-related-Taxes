/**
 * anchor: post-deemed 상속주택 §164⑦ 환산 진입(P2) + 신고가액 단일필드(P3).
 *
 * 소령 §163⑨2호: 개별주택가격 미공시(< 2005-04-30) 상속주택 취득가액 = max(상증법 평가액, §164⑦).
 *  P2. 평가방법(supplementary) 선택 여부와 무관하게 post-deemed 주택 미공시면 환산 위젯 노출.
 *  P3. 하단 "상속세 신고가액"은 엔진 실경로 publishedValueAtInheritance에 바인딩(dead inheritanceReportedValue 아님).
 *
 * 계획서: docs/02-design/features/inheritance-post-deemed-house-164-7-max.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

// 실제 3시점 환산 위젯(구조·용도 select) 대신 계산 자체는 별도 anchor 커버 — 여기선 노출/바인딩만.
afterEach(cleanup);

const NOTICE = /개별주택가격 미공시/;

function postDeemedHouse(overrides = {}) {
  return {
    ...makeDefaultAsset(1),
    inheritanceStartDate: "1995-07-01", // ≥ 1985(post-deemed) & < 2005(미공시)
    inheritanceAssetKind: "house_individual" as const,
    ...overrides,
  };
}

describe("post-deemed 상속주택 §164⑦ 환산 진입(P2) + 신고가액 단일필드(P3)", () => {
  it("P2: post-deemed 주택 미공시 → 평가방법 미선택이어도 §164⑦ 환산 안내 노출", () => {
    render(
      <PostDeemedInputs
        asset={postDeemedHouse({ inheritanceValuationMethod: "" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });

  it("P2 neg: 상속개시일 ≥ 2005-04-30(공시 이후) → 환산 안내 미노출", () => {
    render(
      <PostDeemedInputs
        asset={postDeemedHouse({ inheritanceStartDate: "2010-05-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("P2 neg: 토지 자산 → 환산 안내 미노출", () => {
    render(
      <PostDeemedInputs
        asset={postDeemedHouse({ inheritanceAssetKind: "land" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("P3: 하단 '상속세 신고가액' 입력 → publishedValueAtInheritance 패치(dead inheritanceReportedValue 아님)", () => {
    const onChange = vi.fn();
    render(
      <PostDeemedInputs
        asset={postDeemedHouse({ inheritanceValuationMethod: "supplementary" })}
        onChange={onChange}
        transferDate="2024-01-01"
      />,
    );
    // method 선택 상태이므로 신고가액 필드 노출
    const input = screen.getByPlaceholderText("신고가액 입력 (원)");
    fireEvent.change(input, { target: { value: "300000000" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ publishedValueAtInheritance: expect.any(String) }),
    );
    // dead 필드로 패치되지 않음
    const calledWithReported = onChange.mock.calls.some(
      ([patch]) => patch && "inheritanceReportedValue" in patch,
    );
    expect(calledWithReported).toBe(false);
  });
});
