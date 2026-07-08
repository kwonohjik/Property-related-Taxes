/**
 * anchor: post-deemed 보충적평가 보조계산 자산구분별 가변화 + 공시가격 조회 배선.
 *
 * 상증법 §61①: 토지=개별공시지가(×면적) / 주택=고시주택가격 단일(부수토지 일체, 토지 별도가산 금지).
 * 소령 §163⑨1·2호: 미공시(토지 <1990.8.30 / 주택 <2005.4.30)는 보조계산 불가 → 신고가액 직접입력 대칭.
 *
 *  A1. 자산구분별 필드: 토지→개별공시지가+면적 / 개별주택→개별주택가격 단일 / 공동주택→공동주택가격 단일.
 *  A2. reportedPatch(합산 site) 자산구분 인지: 토지=단가×면적, 주택=고시주택가격 단독(토지 미가산·이중계상 금지).
 *  A3. 미공시 대칭 hide+안내: 토지<1990.8.30 / 주택<2005.4.30 → 보조계산 토글 숨김.
 *
 * 계획서: docs/02-design/features/inheritance-supplementary-valuation-asset-adaptive.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const TOGGLE = /보충적평가 보조계산 사용/;

function asset(overrides = {}) {
  return {
    ...makeDefaultAsset(1),
    inheritanceValuationMethod: "supplementary" as const,
    useSupplementaryHelper: true,
    ...overrides,
  };
}

describe("A1: 보충적평가 보조계산 자산구분별 필드", () => {
  it("토지(공시 ≥1990.8.30) → 개별공시지가+면적, 주택가격 필드 없음", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "land", inheritanceStartDate: "2000-01-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(/개별공시지가/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/개별주택가격/)).toBeNull();
    expect(screen.queryByText(/공동주택가격/)).toBeNull();
  });

  it("개별주택(공시 ≥2005.4.30) → 개별주택가격 단일, 개별공시지가 라인 없음", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "house_individual", inheritanceStartDate: "2010-05-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(/개별주택가격/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/개별공시지가/)).toBeNull();
  });

  it("공동주택(공시 ≥2005.4.30) → 공동주택가격 단일, 개별공시지가 라인 없음", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "house_apart", inheritanceStartDate: "2010-05-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(/공동주택가격/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/개별공시지가/)).toBeNull();
  });
});

describe("A2: reportedPatch 자산구분 인지 (합산 site)", () => {
  it("토지 토글 ON → publishedValueAtInheritance = 단가 × 면적", () => {
    const onChange = vi.fn();
    render(
      <PostDeemedInputs
        asset={asset({
          inheritanceAssetKind: "land",
          inheritanceStartDate: "2000-01-01",
          useSupplementaryHelper: false, // 토글 OFF에서 클릭 → onCheckedChange(true)
          supplementaryLandUnitPrice: "10000",
          supplementaryLandArea: "100",
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ publishedValueAtInheritance: "1,000,000" }),
    );
  });

  it("주택 토글 ON → publishedValueAtInheritance = 고시주택가격 단독(stale 토지값 미가산·이중계상 금지)", () => {
    const onChange = vi.fn();
    render(
      <PostDeemedInputs
        asset={asset({
          inheritanceAssetKind: "house_individual",
          inheritanceStartDate: "2010-05-01",
          useSupplementaryHelper: false,
          supplementaryBuildingValue: "500000000",
          // stale 토지값 — 버그면 501,000,000로 이중계상됨
          supplementaryLandUnitPrice: "10000",
          supplementaryLandArea: "100",
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ publishedValueAtInheritance: "500,000,000" }),
    );
  });
});

describe("A3: 미공시 대칭 hide + 안내", () => {
  it("미공시 주택(1995) → 보조계산 토글 숨김", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "house_individual", inheritanceStartDate: "1995-07-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("미공시 토지(1988) → 보조계산 토글 숨김", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "land", inheritanceStartDate: "1988-07-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("공시 토지(2000) → 보조계산 토글 노출", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "land", inheritanceStartDate: "2000-01-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("공시 주택(2010) → 보조계산 토글 노출", () => {
    render(
      <PostDeemedInputs
        asset={asset({ inheritanceAssetKind: "house_individual", inheritanceStartDate: "2010-05-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });
});
