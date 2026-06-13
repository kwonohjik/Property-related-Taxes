/**
 * @vitest-environment jsdom
 *
 * PriorGiftTableView — 사전증여(§13)·동일인 합산(§47) 요약 테이블 anchor
 *
 * Plan: docs/02-design/features/prior-gift-table-view.plan.md §3·§7.
 *
 * resolvePriorGiftBadges 순수 함수(배지 8케이스) + 테이블 렌더(수증자 5케이스) 검증.
 *  배지 P-1~P-8 / 수증자 D-1~D-5 / 렌더 R-1~R-2.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PriorGiftTableView } from "@/components/calc/prior-gift/PriorGiftTableView";
import { resolvePriorGiftBadges } from "@/components/calc/prior-gift/prior-gift-badges";
import type { PriorGift, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIR_CHILD: Heir = { id: "h-child", relation: "child", name: "김자녀" };
const HEIR_CORP: Heir = {
  id: "h-corp",
  relation: "corporate",
  name: "(주)가업",
  isForProfit: true,
};
const HEIRS: Heir[] = [HEIR_CHILD, HEIR_CORP];

function makeGift(overrides: Partial<PriorGift> = {}): PriorGift {
  return {
    giftDate: "2020-01-01",
    isHeir: true,
    giftAmount: 250_000_000,
    giftTaxPaid: 0,
    ...overrides,
  };
}

afterEach(cleanup);

// ============================================================
// 배지 derive — 실제 입력된 비기본 값만
// ============================================================
describe("resolvePriorGiftBadges — 배지 케이스", () => {
  it("P-1 기본 gift(특이값 없음) → 배지 없음", () => {
    expect(resolvePriorGiftBadges(makeGift(), "inheritance")).toEqual([]);
  });

  it("P-2 이력 기반(sourceCalculationId) → violet '📋 이력 기반'", () => {
    const b = resolvePriorGiftBadges(
      makeGift({ sourceCalculationId: "calc-1" }),
      "inheritance",
    );
    expect(b).toEqual([{ key: "history", label: "📋 이력 기반", tone: "violet" }]);
  });

  it("P-3 영리법인 → violet '🏢 영리법인'", () => {
    const b = resolvePriorGiftBadges(
      makeGift({ beneficiaryType: "corporate" }),
      "inheritance",
    );
    expect(b.some((x) => x.key === "corporate")).toBe(true);
  });

  it("P-4 §30의5 창업자금 → emerald", () => {
    const b = resolvePriorGiftBadges(
      makeGift({ specialTreatmentType: "startup" }),
      "inheritance",
    );
    expect(b).toContainEqual({ key: "startup", label: "창업자금 §30의5", tone: "emerald" });
  });

  it("P-5 §30의6 가업승계 → emerald", () => {
    const b = resolvePriorGiftBadges(
      makeGift({ specialTreatmentType: "family_business" }),
      "inheritance",
    );
    expect(b).toContainEqual({ key: "family_business", label: "가업승계 §30의6", tone: "emerald" });
  });

  it("P-6 과세표준 직접입력(manual) → amber (상속세 모드만)", () => {
    expect(
      resolvePriorGiftBadges(
        makeGift({ priorGiftTaxBaseInputMode: "manual" }),
        "inheritance",
      ).some((x) => x.key === "manualBase"),
    ).toBe(true);
    // 증여세 모드는 직접입력 배지 미노출
    expect(
      resolvePriorGiftBadges(
        makeGift({ priorGiftTaxBaseInputMode: "manual" }),
        "gift",
      ).some((x) => x.key === "manualBase"),
    ).toBe(false);
  });

  it("P-7 §53의2(상속세) / 세대생략 §57(증여세) → 모드별 분기", () => {
    expect(
      resolvePriorGiftBadges(
        makeGift({ marriageBirthDeduction: 100_000_000 }),
        "inheritance",
      ).some((x) => x.key === "marriageBirth"),
    ).toBe(true);
    expect(
      resolvePriorGiftBadges(
        makeGift({ wasGenerationSkip: true }),
        "gift",
      ).some((x) => x.key === "genSkip"),
    ).toBe(true);
    // 교차 모드는 미노출
    expect(
      resolvePriorGiftBadges(
        makeGift({ wasGenerationSkip: true }),
        "inheritance",
      ).some((x) => x.key === "genSkip"),
    ).toBe(false);
  });

  it("P-8 부수토지(03) 토글 → sky", () => {
    const b = resolvePriorGiftBadges(
      makeGift({ propertyCategory: "real_estate_land", isAttachedLandToBuilding: true }),
      "inheritance",
    );
    expect(b.some((x) => x.key === "attachedLand")).toBe(true);
  });
});

// ============================================================
// 테이블 렌더 + 수증자 라벨
// ============================================================
describe("PriorGiftTableView — 렌더·수증자 라벨", () => {
  it("R-1 빈 gifts → 테이블 미렌더(null)", () => {
    const { container } = render(
      <PriorGiftTableView gifts={[]} selectedIndex={null} onSelect={() => {}} mode="inheritance" />,
    );
    expect(container.querySelector("table")).toBeNull();
  });

  it("R-2 3행 렌더 + 행 클릭 시 onSelect(index)", () => {
    const selected: number[] = [];
    render(
      <PriorGiftTableView
        gifts={[makeGift(), makeGift({ giftDate: "2021-06-01" }), makeGift()]}
        selectedIndex={null}
        onSelect={(i) => selected.push(i)}
        mode="inheritance"
        heirs={HEIRS}
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(3);
    fireEvent.click(rows[1]);
    expect(selected).toEqual([1]);
  });

  it("D-1 상속세 doneeId 매칭 → '자녀 (김자녀)' + 상속인 라벨", () => {
    render(
      <PriorGiftTableView
        gifts={[makeGift({ doneeId: "h-child", beneficiaryType: "heir" })]}
        selectedIndex={null}
        onSelect={() => {}}
        mode="inheritance"
        heirs={HEIRS}
      />,
    );
    expect(screen.getByText("자녀 (김자녀)")).toBeTruthy();
    expect(screen.getByText("상속인 · 10년 합산")).toBeTruthy();
  });

  it("D-2 상속세 orphan(doneeId 매칭 실패) → '수증자 삭제됨' amber", () => {
    render(
      <PriorGiftTableView
        gifts={[makeGift({ doneeId: "h-deleted" })]}
        selectedIndex={null}
        onSelect={() => {}}
        mode="inheritance"
        heirs={HEIRS}
      />,
    );
    expect(screen.getByText("수증자 삭제됨")).toBeTruthy();
  });

  it("D-3 상속세 수동경로(미지정·비상속인) → '비상속인 증여'", () => {
    render(
      <PriorGiftTableView
        gifts={[makeGift({ isHeir: false, doneeRelation: "other_relative" })]}
        selectedIndex={null}
        onSelect={() => {}}
        mode="inheritance"
        heirs={HEIRS}
      />,
    );
    expect(screen.getByText("비상속인 증여")).toBeTruthy();
    expect(screen.getByText("기타 친족")).toBeTruthy();
  });

  it("D-4 증여세 모드(heirs 없음) → doneeRelation 라벨만", () => {
    render(
      <PriorGiftTableView
        gifts={[makeGift({ doneeRelation: "lineal_descendant" })]}
        selectedIndex={null}
        onSelect={() => {}}
        mode="gift"
      />,
    );
    expect(screen.getByText("직계비속")).toBeTruthy();
  });

  it("D-5 증여세 모드 관계 미지정 → '수증인 미지정'", () => {
    render(
      <PriorGiftTableView
        gifts={[makeGift({ doneeRelation: undefined })]}
        selectedIndex={null}
        onSelect={() => {}}
        mode="gift"
      />,
    );
    expect(screen.getByText("수증인 미지정")).toBeTruthy();
  });
});
