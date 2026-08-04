/**
 * anchor: 상속취득 주택 3-시점 환산(§164⑤) — 건물기준시가 일괄 계산기 배선.
 *
 * HouseValuationSection에 MultiPointBuildingStdPriceModal을 배선한다.
 *  F1. onApply 산출값을 3개 필드에 **단일 onChange patch**로 병합(3연속 호출 아님).
 *  F2. 계산기 버튼은 house_individual(단독)에만 노출, house_apart(공동주택)엔 미노출.
 *
 * 계획서: docs/02-design/features/inheritance-house-valuation-3point-building-std-batch.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseValuationSection } from "../../components/calc/transfer/inheritance/HouseValuationSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

// 실제 모달(구조·용도 select) 대신 stub — onApply 라우팅 + points seed 검증(계산 자체는 phd-3point-batch anchor 커버).
vi.mock("@/components/calc/building-std-price/MultiPointBuildingStdPriceModal", () => ({
  MultiPointBuildingStdPriceModal: (props: {
    points: Array<{ key: string; landPricePerM2: string }>;
    onApply: (v: {
      acquisition?: { housing?: number };
      firstDisclosure?: { housing?: number };
      transfer?: { housing?: number };
    }) => void;
  }) => (
    <button
      data-testid="phd-batch-stub"
      data-acq-land={props.points.find((p) => p.key === "acquisition")?.landPricePerM2 ?? ""}
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

  /**
   * 🔴 F2 회귀 — **미선택 상태**가 기존 케이스에 없어 실결함을 놓쳤다(2026-07-30).
   *
   * `inheritanceAssetKind`는 미선택("land" 초기값)으로 시작하고 픽커는 동·호 유무로 "개별"을
   * **선택된 것처럼 표시**한다. 게이트가 raw 비교였을 때 이 상태에서 버튼이 안 나왔고,
   * 이미 checked인 native radio는 다시 눌러도 change가 나지 않아 사용자가 풀 수 없었다.
   * → 게이트는 픽커와 같은 파생(deriveInheritanceHouseKind)을 써야 한다.
   */
  it("🔴 F2: 미선택 + 동·호 없음 → 계산기 버튼 노출 (픽커 표시와 일치)", () => {
    render(
      <HouseValuationSection
        asset={{ ...baseAsset(), inheritanceAssetKind: "land", addressDong: "", addressHo: "" }}
        transferDate="2025-09-01"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("phd-batch-stub")).not.toBeNull();
  });

  it("F2: 미선택 + 동·호 있음 → 미노출 (공동주택 추정)", () => {
    render(
      <HouseValuationSection
        asset={{ ...baseAsset(), inheritanceAssetKind: "land", addressDong: "101", addressHo: "1502" }}
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

  it("F3: pre-2001 상속취득 → 취득시 공시지가 seed = 빈 값(2001.1.1. 공시지가는 모달 직접 입력)", () => {
    // 국세청 건물기준시가는 2001.1.1. 최초 고시(§164⑤) → pre-2001 취득은 위치지수 공시지가를 2001.1.1.
    // 현재 값으로 모달에서 직접 입력. §164④ 1990.8.30 이전 등급가액 환산값(토지 트랙)을 자동 주입하지 않는다.
    render(
      <HouseValuationSection
        asset={{
          ...makeDefaultAsset(1),
          inheritanceAssetKind: "house_individual",
          inheritanceStartDate: "1983-07-26", // < 1990-08-30
          inhHouseValLandArea: "184.2",
          inhHouseValLandPricePerSqmAtInheritance: "", // 개별공시지가 없음
          pre1990Enabled: true,
          pre1990GradeMode: "number",
          pre1990PricePerSqm_1990: "1100000",
          pre1990Grade_current: "218",
          pre1990Grade_prev: "205",
          pre1990Grade_atAcq: "200",
        }}
        transferDate="2026-05-01"
        onChange={() => {}}
      />,
    );
    const acqLand = screen.getByTestId("phd-batch-stub").getAttribute("data-acq-land");
    expect(acqLand ?? "").toBe("");
  });
});
