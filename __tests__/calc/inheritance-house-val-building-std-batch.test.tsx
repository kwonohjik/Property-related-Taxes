/**
 * anchor: 상속취득 주택 3-시점 환산(§164⑤) — 건물기준시가 일괄 계산기 배선.
 *
 * HouseValuationSection에 PhdBuildingStdPriceModalButton을 배선한다.
 *  F1. onApply 산출값을 3개 필드에 **단일 onChange patch**로 병합(3연속 호출 아님).
 *  F2. 계산기 버튼은 house_individual(단독)에만 노출, house_apart(공동주택)엔 미노출.
 *
 * 계획서: docs/02-design/features/inheritance-house-valuation-3point-building-std-batch.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseValuationSection } from "../../components/calc/transfer/inheritance/HouseValuationSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

// 실제 모달(구조·용도 select) 대신 stub — onApply 라우팅만 검증(계산 자체는 phd-3point-batch anchor 커버).
vi.mock("@/components/calc/building-std-price/PhdBuildingStdPriceModalButton", () => ({
  PhdBuildingStdPriceModalButton: (props: {
    onApply: (v: {
      acquisition?: { housing?: number };
      firstDisclosure?: { housing?: number };
      transfer?: { housing?: number };
    }) => void;
  }) => (
    <button
      data-testid="phd-batch-stub"
      onClick={() =>
        props.onApply({
          transfer: { housing: 111 },
          firstDisclosure: { housing: 222 },
          acquisition: { housing: 333 },
        })
      }
    >
      stub
    </button>
  ),
}));

afterEach(cleanup);

const baseAsset = () => ({
  ...makeDefaultAsset(1),
  inheritanceStartDate: "2003-05-01", // < 2005-04-30, > 1990-08-30 (일반 경로)
});

describe("상속취득 주택 3시점 — 건물기준시가 일괄 계산기 배선", () => {
  it("F2: house_individual → 계산기 버튼 노출", () => {
    render(
      <HouseValuationSection
        asset={{ ...baseAsset(), inheritanceAssetKind: "house_individual" }}
        transferDate="2025-09-01"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("phd-batch-stub")).not.toBeNull();
  });

  it("F2: house_apart(공동주택) → 계산기 버튼 미노출", () => {
    render(
      <HouseValuationSection
        asset={{ ...baseAsset(), inheritanceAssetKind: "house_apart" }}
        transferDate="2025-09-01"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("phd-batch-stub")).toBeNull();
  });

  it("F1: '모두 적용' → 3필드가 단일 onChange patch로 병합 갱신", () => {
    const onChange = vi.fn();
    render(
      <HouseValuationSection
        asset={{ ...baseAsset(), inheritanceAssetKind: "house_individual" }}
        transferDate="2025-09-01"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("phd-batch-stub"));

    // 단일 호출로 3필드 병합 (3연속 아님 — stale-clobber 원천 차단)
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      inhHouseValBuildingStdPriceAtTransfer: "111",
      inhHouseValBuildingStdPriceAtFirst: "222",
      inhHouseValBuildingStdPriceAtInheritance: "333",
    });
  });
});
