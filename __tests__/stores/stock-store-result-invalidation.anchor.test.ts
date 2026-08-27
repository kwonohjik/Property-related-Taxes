/**
 * A-1 anchor — 입력 변경 시 계산 결과 무효화
 *
 * 결함: `updateFormData`가 `result`·`aggregateResult`를 무효화하지 않아, 사용자가 1단계로
 * 돌아가 입력을 고친 뒤 결과 탭으로 돌아오면 **이전 계산 결과가 그대로 표시**됐다.
 * `Step4`는 `result`가 있으면 자동 재계산을 건너뛴다(Step4.tsx:41).
 *
 * 같은 store의 `commitCurrentItem`·`editSavedItem`·`removeSavedItem`은 이미 무효화하고 있었고
 * (「남겨두면 화면이 stale 세액을 보인다」 — store 주석) **입력 변경 경로만 빠져 있었다.**
 *
 * 안전망 실측(P-1): 이 동작을 지키는 기존 테스트는 **0건**이었다(411파일 3,704건 전부 통과).
 * 그래서 이 anchor가 유일한 방어선이다.
 *
 * 계획서: docs/00-pm/stock-transfer-stale-result-and-conversion-display.plan.md §1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 최소 result 스텁 — 무효화 여부만 보므로 필드 정확도는 무관 */
function stubResult(): StockTransferResult {
  return { calculatedTax: 1_186_010, taxCategory: "listed_non_major_in_market" } as StockTransferResult;
}

describe("A-1 — updateFormData가 stale 결과를 무효화한다", () => {
  beforeEach(() => {
    useStockTransferStore.getState().reset();
  });

  it("A-1-1: 입력을 바꾸면 result가 null이 된다", () => {
    const s = useStockTransferStore.getState();
    s.setResult(stubResult());
    expect(useStockTransferStore.getState().result).not.toBeNull();

    useStockTransferStore.getState().updateFormData({ selfShareRatio: "15" });

    expect(useStockTransferStore.getState().result).toBeNull();
  });

  it("A-1-2: aggregateResult도 함께 무효화된다", () => {
    useStockTransferStore.setState({
      aggregateResult: { items: [], totalTax: 0 } as never,
    });
    expect(useStockTransferStore.getState().aggregateResult).not.toBeNull();

    useStockTransferStore.getState().updateFormData({ selfShareRatio: "15" });

    expect(useStockTransferStore.getState().aggregateResult).toBeNull();
  });

  it("A-1-3: 무효화가 폼 값 자체는 보존한다", () => {
    const s = useStockTransferStore.getState();
    s.setResult(stubResult());
    s.updateFormData({ selfShareRatio: "15", marketType: "kosdaq" });

    const next = useStockTransferStore.getState();
    expect(next.formData.selfShareRatio).toBe("15");
    expect(next.formData.marketType).toBe("kosdaq");
    expect(next.result).toBeNull();
  });

  it("A-1-4: 대조군 — commitCurrentItem·removeSavedItem은 종전대로 무효화한다", () => {
    const s = useStockTransferStore.getState();
    s.updateFormData({ securityName: "주성" });
    s.setResult(stubResult());
    s.commitCurrentItem();
    expect(useStockTransferStore.getState().result).toBeNull();

    useStockTransferStore.getState().setResult(stubResult());
    useStockTransferStore.getState().removeSavedItem(0);
    expect(useStockTransferStore.getState().result).toBeNull();
  });
});
