/**
 * anchor: 상속 주택 구분 픽커의 패치 내용 (Q17).
 *
 * 이 픽커는 「보충적평가 보조계산」 **토글 내부**에 산다. 종전에는 구분을 고를 때
 * `useSupplementaryHelper: false`를 함께 실어, 고르는 순간 자기가 들어 있던 패널이
 * 통째로 접혔다. 토글을 끄지 않되, 조회 3필드에서 파생된 **신고가액도 함께** 비운다 —
 * 3필드만 비우면 화면은 빈 칸인데 엔진에는 옛 구분의 금액이 간다.
 *
 * ⚠️ E2E `inheritance-asset-kind-demote.spec.ts` D1·D2(「보조계산 OFF → 픽커 없음」)는
 *    의도된 설계다. 픽커를 토글 밖으로 빼는 처방은 그 설계를 깨므로 택하지 않았다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { InheritanceHouseKindPicker } from "../../components/calc/transfer/inheritance/InheritanceHouseKindPicker";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

function baseAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    inheritanceAssetKind: "house_individual" as const,
    supplementaryLandUnitPrice: "1,000,000",
    supplementaryLandArea: "100",
    supplementaryBuildingValue: "300,000,000",
    publishedValueAtInheritance: "300,000,000",
    ...over,
  };
}

function pickApart(asset: ReturnType<typeof baseAsset>) {
  const onChange = vi.fn();
  render(<InheritanceHouseKindPicker asset={asset} onChange={onChange} />);
  fireEvent.click(screen.getByRole("radio", { name: /공동주택/ }));
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as Record<string, unknown>;
}

describe("상속 주택 구분 픽커 — 전환 패치", () => {
  it("🔑 보조계산 토글을 끄지 않는다 (패널이 접히지 않는다)", () => {
    const patch = pickApart(
      baseAsset({ useSupplementaryHelper: true, inheritanceValuationMethod: "supplementary" }),
    );
    expect("useSupplementaryHelper" in patch).toBe(false);
  });

  it("stale 조회값 3필드는 비운다", () => {
    const patch = pickApart(
      baseAsset({ useSupplementaryHelper: true, inheritanceValuationMethod: "supplementary" }),
    );
    expect(patch.supplementaryLandUnitPrice).toBe("");
    expect(patch.supplementaryLandArea).toBe("");
    expect(patch.supplementaryBuildingValue).toBe("");
    expect(patch.inheritanceAssetKind).toBe("house_apart");
  });

  it("🔑 보조계산이 신고가액을 먹이고 있으면 신고가액도 함께 비운다", () => {
    const patch = pickApart(
      baseAsset({ useSupplementaryHelper: true, inheritanceValuationMethod: "supplementary" }),
    );
    expect(patch.publishedValueAtInheritance).toBe("");
  });

  it("보조계산 OFF — 수동 입력 신고가액은 건드리지 않는다", () => {
    const patch = pickApart(
      baseAsset({ useSupplementaryHelper: false, inheritanceValuationMethod: "supplementary" }),
    );
    expect("publishedValueAtInheritance" in patch).toBe(false);
  });

  it("평가방법이 보충적평가가 아니면 신고가액을 건드리지 않는다", () => {
    const patch = pickApart(
      baseAsset({ useSupplementaryHelper: true, inheritanceValuationMethod: "appraisal" }),
    );
    expect("publishedValueAtInheritance" in patch).toBe(false);
  });
});
