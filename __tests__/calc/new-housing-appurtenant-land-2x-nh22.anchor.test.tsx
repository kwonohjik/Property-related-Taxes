/**
 * anchor — 리뷰 NH-22: 딸린 토지 «건물 연면적의 2배 이내» 확인용 입력·판정 (계획서 Q-2 a · Q-4 a, 계산 불변).
 * - 판정 leaf(`judgeAppurtenantLand2x`·`appurtenantLand2xNotice`·`separateLandCardReductionNotice`)
 * - §99의3 폼: 종전 고급주택 구간 밖에서는 선택 입력(`new993-appurtenant-land-fields`), 구간 안에서는 고급주택 블록(`new993-luxury-fields`)이 같은 키를 쓴다.
 */
import { render, cleanup, screen } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import {
  judgeAppurtenantLand2x,
  appurtenantLand2xNotice,
  separateLandCardReductionNotice,
} from "@/lib/tax-engine/transfer-reductions/new-housing-appurtenant-land-2x";

afterEach(cleanup);

describe("judgeAppurtenantLand2x", () => {
  it.each([
    [{ grossFloorAreaSqm: 100, attachedLandAreaSqm: 200 }, "within"], // 경계 포함
    [{ grossFloorAreaSqm: 100, attachedLandAreaSqm: 200.01 }, "exceeded"],
    [{ grossFloorAreaSqm: 100, attachedLandAreaSqm: 200.004 }, "within"], // round2
    [{ grossFloorAreaSqm: 100, attachedLandAreaSqm: 400, houseType: "detached" }, "exceeded"],
    [{ grossFloorAreaSqm: 100, attachedLandAreaSqm: 400, houseType: "apartment" }, "unknown"], // 공동주택은 판정하지 않는다(V-2)
    [{ attachedLandAreaSqm: 400 }, "unknown"],
    [{ grossFloorAreaSqm: 100 }, "unknown"],
    [{ grossFloorAreaSqm: 0, attachedLandAreaSqm: 400 }, "unknown"],
  ] as const)("%j → %s", (facts, expected) => {
    expect(judgeAppurtenantLand2x(facts)).toBe(expected);
  });
});

describe("appurtenantLand2xNotice", () => {
  const r993 = { type: "new_99_3", grossFloorAreaSqm993: 100, attachedLandAreaSqm993: 400 };
  const r99 = { type: "new_99", grossFloorAreaSqm99: 100, attachedLandAreaSqm99: 400, houseType99: "detached" };
  it("적용된 §99의3 → 조특법 §99의3① 인용 + 계산 미반영 문구", () => {
    const n = appurtenantLand2xNotice([r993], "new_99_3");
    expect(n).toContain("조특법 §99의3①");
    expect(n).toContain("400㎡가 건물 연면적 100㎡의 2배(200㎡)를 넘습니다");
    expect(n).toContain("계산에는 반영하지 않았습니다");
  });
  it("적용된 §99 → 조특법 §99① 인용", () => {
    expect(appurtenantLand2xNotice([r99], "new_99")).toContain("조특법 §99①");
  });
  it("적용되지 않았거나(appliedId 없음/다른 조문) 선언이 없으면 고지 없음", () => {
    expect(appurtenantLand2xNotice([r993], undefined)).toBeUndefined();
    expect(appurtenantLand2xNotice([r993], "unsold_98_8")).toBeUndefined();
    expect(appurtenantLand2xNotice([], "new_99_3")).toBeUndefined();
    expect(appurtenantLand2xNotice(undefined, "new_99_3")).toBeUndefined();
  });
});

describe("separateLandCardReductionNotice", () => {
  it("토지 카드 + 차감 카드 → 고지", () => {
    expect(separateLandCardReductionNotice([{ propertyType: "housing" }, { propertyType: "land" }], [23_333_333, 0])).toContain("별도 토지 카드가 있습니다");
  });
  it.each([
    ["토지 카드 없음", [{ propertyType: "housing" }], [23_333_333]],
    ["차감 없음(감면 미선택·불성립)", [{ propertyType: "housing" }, { propertyType: "land" }], [0, 0]],
  ] as const)("%s → 없음", (_n, items, reducibles) => {
    expect(separateLandCardReductionNotice(items, reducibles)).toBeUndefined();
  });
});

describe("§99의3 폼 — 딸린 토지 선택 입력 노출", () => {
  const view = (o: Record<string, unknown>) =>
    render(<New993InputForm value={{ ...getReductionDefault("new_99_3"), acquisitionType993: "from_builder", ...o } as never} onUpdate={vi.fn()} onUpdateMany={vi.fn()} />);

  it("구간 밖(2003 계약) → 선택 입력 + 안내(고급주택 블록 없음)", () => {
    view({ contractDate993: "2003-03-01" });
    expect(screen.getByTestId("new993-appurtenant-land-fields")).toBeTruthy();
    expect(screen.getByTestId("new993-appurtenant-land-hint").textContent).toContain("계산에는 반영하지 않습니다");
    expect(screen.queryByTestId("new993-luxury-fields")).toBeNull();
  });
  it("구간 안(2002 계약) → 고급주택 블록(같은 키) · 선택 입력은 숨김", () => {
    view({ contractDate993: "2002-03-01" });
    expect(screen.getByTestId("new993-luxury-fields")).toBeTruthy();
    expect(screen.queryByTestId("new993-appurtenant-land-fields")).toBeNull();
  });
});
