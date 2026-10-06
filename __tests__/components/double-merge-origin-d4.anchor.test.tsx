/**
 * @vitest-environment jsdom
 *
 * D4 — 혼인 후 동거봉양 합가 — 클라이언트 층. 엔진 조건은 `one-house-double-merge-d4.anchor.test.ts`, route 결론은
 * 해석례 평가셋 `E128-*`이 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | C-1 | 합가 맥락 | 혼인 ≤ 동거봉양이면 `secondMergeDate` · 역순·단일이면 없다 |
 * | C-2 | 쪽 분류 | 이중 합가면 합가 후 취득 기준일은 동거봉양 합가일 · `second_merge_side`는 단일 합가에서 「미선택」 |
 * | W-1 | ⑤ 편집 창 | 이중 합가에서만 「동거봉양으로 합친 가족 쪽」 선택지 · 고르면 그 값으로 올라간다 |
 * | V-1 | ⑧ 경고 | 혼인이 먼저면 두 합가일 경고 없음 · 역순이면 경고(짝) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { mergeContextOf, mergeHouseSideOf } from "@/lib/calc/merge-house-origin";
import { HouseEntryMergeOriginBlock } from "@/components/calc/transfer/HouseEntryMergeOriginBlock";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

const DOUBLE = { marriageDate: "2019-03-01", parentalCareMergeDate: "2020-01-15" };
const row = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "parents",
    region: "capital",
    acquisitionDate: "2005-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

describe("C 합가 맥락·쪽 분류", () => {
  it("C-1 혼인 ≤ 동거봉양이면 이중 합가", () => {
    expect(mergeContextOf(DOUBLE)).toEqual({ kind: "marriage", mergeDate: "2019-03-01", secondMergeDate: "2020-01-15" });
    expect(mergeContextOf({ marriageDate: "2019-03-01", parentalCareMergeDate: "2018-01-01" })).toEqual({
      kind: "marriage",
      mergeDate: "2019-03-01",
    });
    expect(mergeContextOf({ marriageDate: "2019-03-01" })).not.toHaveProperty("secondMergeDate");
  });
  it("C-2 합가 후 취득 기준일·단일 합가의 second_merge_side", () => {
    const double = mergeContextOf(DOUBLE)!;
    // 혼인(2019-03) 후 · 동거봉양(2020-01) 전 취득 — 이중 합가에선 합가 전 행이다
    expect(mergeHouseSideOf(row({ acquisitionDate: "2019-06-01", mergeOrigin: "second_merge_side" }), double)).toBe(
      "second_merge_side",
    );
    expect(mergeHouseSideOf(row({ acquisitionDate: "2020-03-01", mergeOrigin: "second_merge_side" }), double)).toBe(
      "after_merge",
    );
    const single = mergeContextOf({ marriageDate: "2019-03-01" })!;
    expect(mergeHouseSideOf(row({ mergeOrigin: "second_merge_side" }), single)).toBeUndefined();
  });
});

describe("W-1 ⑤ 편집 창", () => {
  it("이중 합가에서만 세 번째 선택지 · 고르면 그 값", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryMergeOriginBlock house={row()} onUpdate={onUpdate} context={mergeContextOf(DOUBLE)!} />);
    fireEvent.click(screen.getByTestId("merge-origin-second"));
    expect(onUpdate).toHaveBeenCalledWith({ mergeOrigin: "second_merge_side" });
    cleanup();
    render(<HouseEntryMergeOriginBlock house={row()} onUpdate={onUpdate} context={mergeContextOf({ marriageDate: "2019-03-01" })!} />);
    expect(screen.queryByTestId("merge-origin-second")).toBeNull();
  });
});

describe("V-1 ⑧ 두 합가일 경고", () => {
  const warnings = (dates: { marriageDate: string; parentalCareMergeDate: string }) => {
    const f = createInitialOneHouseJudgmentForm();
    Object.assign(f, dates, { isOneHousehold: true });
    f.houses = [row({ mergeOrigin: "counterpart_side" })];
    return validateStep2(f).filter((e) => e.field === "marriageDate" && e.severity === "warning");
  };
  it("혼인이 먼저면 경고 없음 · 역순이면 경고", () => {
    expect(warnings(DOUBLE)).toHaveLength(0);
    expect(warnings({ marriageDate: "2019-03-01", parentalCareMergeDate: "2018-01-01" })).toHaveLength(1);
  });
});
