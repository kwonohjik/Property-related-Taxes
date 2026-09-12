/**
 * 과점주주 §13① 버킷 — ⑤ 화면 anchor [AT-HQ-UI]
 *
 * 배선이 다 돼 있어도 **화면에 고를 칸이 없으면 결함은 닫히지 않는다**
 * (§15② 작업의 원래 결함이 정확히 그것이었다 — 엔진은 10%를 낼 수 있는데 켤 칸이 없었다).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { DeemedMajorAssetBuckets } from "@/components/calc/acquisition/deemed/DeemedMajorAssetBuckets";
import type { DeemedAssetBucketRow } from "@/components/calc/acquisition/shared";

afterEach(cleanup);

const ROWS: DeemedAssetBucketRow[] = [
  { id: "a", label: "본점 사옥", bookValue: "300000000", proviso: "hq_factory", luxuryType: "" },
];

function renderBuckets(rows: DeemedAssetBucketRow[], taxableRatio = 1) {
  return render(
    <DeemedMajorAssetBuckets rows={rows} taxableRatio={taxableRatio} onChange={() => {}} />,
  );
}

/**
 * 라디오의 **`value`** 를 본다.
 *
 * 🔴 라벨 텍스트만 단언하면 구별력이 0이다 — 뮤테이션으로 실측했다. 옵션의 `value`를
 *    엉뚱한 문자열로 바꿔도 **라벨은 그대로 렌더되므로** 전건 통과한다. 화면에 글자가
 *    보인다는 것과 그 칸을 고르면 `hq_factory`가 들어간다는 것은 다른 명제다.
 */
function provisoValues(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="radio"][name^="deemedBucketProviso-"]'),
  ).map((el) => el.value);
}

describe("[AT-HQ-UI] ⑤ §13① 선택지가 화면에 있다", () => {
  it("[AT-HQ-UI-01] 구분 라디오가 hq_factory 값을 **실제로** 제공한다", () => {
    const { container } = renderBuckets(ROWS);
    expect(provisoValues(container)).toContain("hq_factory");
    expect(screen.getByText(/본점·공장\(§13①\) — 6%/)).toBeTruthy();
  });

  it("[AT-HQ-UI-02] 〔역방향〕 기존 두 값도 그대로다", () => {
    const { container } = renderBuckets(ROWS);
    expect(provisoValues(container)).toEqual(["none", "hq_factory", "luxury"]);
    expect(screen.getByText(/일반 — 2%/)).toBeTruthy();
    expect(screen.getByText(/사치성\(§13⑤\) — 10%/)).toBeTruthy();
  });

  it("[AT-HQ-UI-03] §13① 행에는 사치성 유형 라디오가 뜨지 않는다", () => {
    renderBuckets(ROWS);
    expect(screen.queryByText("사치성 유형 (§13⑤)")).toBeNull();
  });

  it("[AT-HQ-UI-04] 〔역방향〕 사치성 행에는 유형 라디오가 뜬다", () => {
    renderBuckets([{ ...ROWS[0], proviso: "luxury" }]);
    expect(screen.getByText("사치성 유형 (§13⑤)")).toBeTruthy();
  });
});

describe("[AT-HQ-UI] ⑤ 미리보기·합계가 6%를 쓴다", () => {
  it("[AT-HQ-UI-10] 행 미리보기 — 3억 × 100% × 6% = 1,800만", () => {
    renderBuckets(ROWS);
    const rows = screen.getByTestId("deemed-bucket-rows");
    expect(within(rows).getByText(/× 6% = 18,000,000/)).toBeTruthy();
  });

  it("[AT-HQ-UI-11] 합계가 6% 반영분을 담는다", () => {
    renderBuckets([
      ROWS[0],
      { id: "b", label: "임대용", bookValue: "700000000", proviso: "none", luxuryType: "" },
    ]);
    // 1,800만 + 1,400만 = 3,200만 — 「전부 2%」(2,000만)도 「전부 6%」(6,000만)도 아니다
    expect(screen.getByText("32,000,000")).toBeTruthy();
  });
});
