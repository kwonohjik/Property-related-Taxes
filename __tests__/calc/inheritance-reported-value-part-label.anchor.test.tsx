/**
 * anchor: 상속 「상속세 신고가액」 칸의 **파트 표기** (2026-08-09).
 *
 * 일반건물만 건물분 전용 칸(`gbBuildingInheritedValue`)이 따로 있어, 이 칸은 **토지분**이다.
 * 나머지 자산종류는 이 칸 하나가 자산 전체 평가액이므로 파트 표기를 붙이면 **거짓말이 된다**.
 *
 * 세액 근거(63,840,000원 과소)는
 * `__tests__/tax-engine/transfer-tax/gb-inheritance-reported-value-land-only.anchor.test.ts`.
 *
 * ⚠️ 부정 단언(C-2·C-4)은 **같은 spec 안의 양성 대조군**(C-1·C-3)과 짝을 이룬다 —
 *    컴포넌트가 다른 이유로 안 그려져도 통과하는 「0 vs 0」을 막는다
 *    (memory `feedback_negative_assertion_needs_mutation_probe`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { PreDeemedInputs } from "../../components/calc/transfer/inheritance/PreDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 파트 표기 — 라벨에 붙는다 */
const PART_TAG = /토지분/;
/** 건물분을 어디에 넣는지 알려주는 안내 */
const BUILDING_GUIDE = /건물분은.*건물 신고가액/;

function postDeemed(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    inheritanceStartDate: "2010-05-01", // ≥ 1985 → post-deemed
    inheritanceValuationMethod: "supplementary",
    ...over,
  } as AssetForm;
}

function preDeemed(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    inheritanceStartDate: "1980-05-01", // < 1985 → pre-deemed
    ...over,
  } as AssetForm;
}

describe("C-1 — 일반건물(post-deemed): 신고가액 칸은 「토지분」이라고 말한다", () => {
  it("라벨에 파트 표기가 붙는다", () => {
    render(
      <PostDeemedInputs
        asset={postDeemed({ assetKind: "general_building" })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(PART_TAG).length).toBeGreaterThan(0);
  });

  it("건물분을 어디에 넣는지 안내한다 — 합산 금지", () => {
    render(
      <PostDeemedInputs
        asset={postDeemed({ assetKind: "general_building" })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(BUILDING_GUIDE).length).toBeGreaterThan(0);
  });
});

describe("C-2 — 그 밖의 자산종류: 파트 표기를 붙이지 않는다 (칸이 하나뿐)", () => {
  it.each(["land", "housing", "commercial_building"] as const)("%s → 「토지분」 미노출", (assetKind) => {
    render(
      <PostDeemedInputs
        asset={postDeemed({ assetKind: assetKind as AssetForm["assetKind"] })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(PART_TAG)).toHaveLength(0);
    expect(screen.queryAllByText(BUILDING_GUIDE)).toHaveLength(0);
  });

  it("양성 대조군 — 같은 렌더에서 신고가액 칸 자체는 존재한다", () => {
    render(
      <PostDeemedInputs
        asset={postDeemed({ assetKind: "land" })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(/상속세 신고가액/).length).toBeGreaterThan(0);
  });
});

describe("C-3 — pre-deemed도 같은 규칙이다 (같은 필드·같은 오독)", () => {
  it("일반건물 → 「토지분」 노출", () => {
    render(
      <PreDeemedInputs
        asset={preDeemed({ assetKind: "general_building" })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(PART_TAG).length).toBeGreaterThan(0);
  });

  it("토지 → 미노출 (양성 대조군은 위 C-3 첫 케이스)", () => {
    render(
      <PreDeemedInputs
        asset={preDeemed({ assetKind: "land" })}
        onChange={() => {}}
        transferDate="2023-02-19"
      />,
    );
    expect(screen.queryAllByText(PART_TAG)).toHaveLength(0);
  });
});
