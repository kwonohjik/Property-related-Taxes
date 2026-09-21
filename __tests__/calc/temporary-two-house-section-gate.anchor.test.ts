/**
 * anchor: ③ 특례 섹션 — **계산기 ⑤ 렌더 게이트** 술어.
 *
 * ## 🔄 ⑧은 이 술어를 더 이상 쓰지 않는다 (P6-b)
 *
 * 종전 이 파일은 「⑤ 렌더 = ⑧ 검증 **같은 술어**」를 고정했다. P6-b가 §155①⑥⑦⑯·§156의2⑤·
 * §154① 단서의 입력과 검증을 **판정 메뉴로 옮기면서** 계산기 ⑧에서 그 블록이 사라졌다.
 * 옮겨간 쪽의 게이트↔검증 짝은 `temp-two-house-sections-moved.anchor.test.ts`가 고정한다
 * (계산기 미차단 = 부정, 판정 메뉴 차단 = **긍정 짝** — `feedback_negative_anchor_needs_positive_twin`).
 *
 * 여기 남는 것은 **술어 자체**다. 계산기 ⑤는 여전히 이것으로 `mode="calc"` 섹션
 * (§155⑧ + 합가)을 열고 닫는다.
 *
 * ⚠️ 종전 헤더가 기록하던 「양방향 어긋남」 전례는 술어를 만든 이유이므로 남긴다:
 *
 * | 방향 | 조합 | 당시 실측 |
 * |---|---|---|
 * | 화면엔 없는데 ⑧이 요구 | 2채 → 1채 정정 후 `replacementHouseSpecial` 잔존 | 차단 메시지 **4건** — 채울 칸도, 토글을 끌 컨트롤도 없다 |
 * | 화면엔 있는데 ⑧이 안 봄 | 입주권 2채 + 일시적 2주택 ON + 신규 취득일 미입력 | 메시지 **0건** — ④가 키를 안 만들어 §155①이 조용히 누락 |
 */
import { describe, it, expect } from "vitest";
import { temporaryTwoHouseSectionVisible } from "@/lib/calc/temporary-two-house-section-scope";

describe("③ 특례 섹션 — 계산기 ⑤ 렌더 게이트 술어", () => {
  it("T-1: 술어 — 주택 계열 4종 × 2채 이상에서만 참", () => {
    const v = (kind: string, n: string | undefined) =>
      temporaryTwoHouseSectionVisible({ primaryAssetKind: kind, householdHousingCount: n });
    expect(v("housing", "2")).toBe(true);
    expect(v("right_to_move_in", "2")).toBe(true);
    expect(v("presale_right", "3")).toBe(true);
    expect(v("redevelopment_apt", "2")).toBe(true);
    // 1채·비주택·미입력은 섹션이 없다.
    expect(v("housing", "1")).toBe(false);
    expect(v("land", "2")).toBe(false);
    expect(v("commercial_building", "3")).toBe(false);
    expect(v("housing", undefined)).toBe(false);
  });
});
