/**
 * 간주취득 × 골프장 — 「지방세법」 §13⑤ 후단 적용 범위 안내 anchor [AT-GOLF-NOTE]
 *
 * 엔진은 사용자가 고른 구분만 따른다(계획서 `acquisition-deemed-15-2-proviso.plan.md` U-2).
 * 과점주주 간주취득이 후단 네 경우 중 어디에 해당하는지 해석례가 없다는 사실을
 * 화면이 알려야 한다 — 골프장을 고른 바로 그 자리에서.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedMajorAssetBuckets } from "@/components/calc/acquisition/deemed/DeemedMajorAssetBuckets";
import {
  DeemedProvisoCard,
  type DeemedProvisoContext,
} from "@/components/calc/acquisition/deemed/DeemedProvisoCard";
import type { DeemedAssetBucketRow, FormState } from "@/components/calc/acquisition/shared";

afterEach(cleanup);

const NOTE = "deemed-golf-scope-note";
const MS_NOTE = "deemed-golf-scope-major-shareholder";

function renderCard(context: DeemedProvisoContext, luxuryType: string) {
  const form = { isLuxuryProperty: true, luxuryType } as unknown as FormState;
  return render(<DeemedProvisoCard form={form} set={() => {}} context={context} />);
}

function renderBuckets(rows: DeemedAssetBucketRow[]) {
  return render(<DeemedMajorAssetBuckets rows={rows} taxableRatio={1} onChange={() => {}} />);
}

const GOLF_ROW: DeemedAssetBucketRow = {
  id: "g",
  label: "",
  bookValue: "3000000000",
  proviso: "luxury",
  luxuryType: "golf_course",
};

describe("[AT-GOLF-NOTE] 단일 물건 카드", () => {
  it("[01] 과점주주 × 골프장 → 후단 네 경우 + U-2 고지", () => {
    renderCard("major_shareholder", "golf_course");
    const note = screen.getByTestId(NOTE);
    expect(note.querySelectorAll("li")).toHaveLength(4);
    expect(note.textContent).toContain("등록된 골프장업을 승계취득하는 경우");
    expect(note.textContent).toContain("사실상 사용하는 그 골프장을 승계취득하는 경우");
    expect(screen.getByTestId(MS_NOTE).textContent).toContain("조심 1998-0634");
  });

  it("[02] 〔역방향〕 지목변경 × 골프장 → 네 경우만, 과점주주 고지 없음", () => {
    renderCard("land_category", "golf_course");
    expect(screen.getByTestId(NOTE)).toBeTruthy();
    expect(screen.queryByTestId(MS_NOTE)).toBeNull();
  });

  it("[03] 〔역방향〕 골프장이 아니면 안내 없음", () => {
    renderCard("major_shareholder", "luxury_housing");
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });
});

describe("[AT-GOLF-NOTE] 물건별 구분 카드", () => {
  it("[10] 골프장 행 → 안내 + U-2 고지", () => {
    renderBuckets([GOLF_ROW]);
    expect(screen.getByTestId(NOTE)).toBeTruthy();
    expect(screen.getByTestId(MS_NOTE)).toBeTruthy();
  });

  it("[11] 〔역방향〕 다른 사치성 유형·일반 행 → 안내 없음", () => {
    renderBuckets([
      { ...GOLF_ROW, id: "h", luxuryType: "luxury_housing" },
      { ...GOLF_ROW, id: "n", proviso: "none", luxuryType: "" },
    ]);
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it("[12] 선택지 라벨이 단일 카드처럼 회원제 구분등록 대상으로 좁혀져 있다", () => {
    renderBuckets([GOLF_ROW]);
    expect(screen.getByText("골프장 (회원제 구분등록 대상)")).toBeTruthy();
  });
});
