/** anchor — 입력 반영 현황 문구: applied·not_declared는 줄이 없고, 나머지 두 상태만 한국어로 푼다. */
import { describe, it, expect } from "vitest";
import { nblInputEffectLines } from "@/lib/calc/nbl-judgment-input-effects-text";
import type { NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";

const fx = (o: Partial<NblInputEffects>): NblInputEffects => ({ gracePeriods: "not_declared", deemedTransfer: "not_declared", urbanIncorporation: "not_declared", ...o });

describe("nblInputEffectLines", () => {
  it("applied · not_declared · 없음 → 줄 0건(카드를 숨긴다)", () => {
    expect(nblInputEffectLines(fx({}))).toEqual([]);
    expect(nblInputEffectLines(fx({ gracePeriods: "applied", deemedTransfer: "applied", urbanIncorporation: "applied" }))).toEqual([]);
    expect(nblInputEffectLines(undefined)).toEqual([]);
    expect(nblInputEffectLines(null)).toEqual([]);
  });

  it("ignored_by_category — 확인 필요 · 조사는 받침으로", () => {
    const lines = nblInputEffectLines(fx({ gracePeriods: "ignored_by_category", urbanIncorporation: "ignored_by_category", deemedTransfer: "ignored_by_category" }));
    expect(lines.map((l) => l.text)).toEqual([
      "부득이한 사유는 입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요",
      "양도일 의제는 입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요",
      "도시편입일은 입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요",
    ]);
  });

  it("overridden_by_unconditional — 의제가 성립해 쓰이지 않았다", () => {
    const lines = nblInputEffectLines(fx({ deemedTransfer: "overridden_by_unconditional" }));
    expect(lines).toEqual([{ field: "deemedTransfer", effect: "overridden_by_unconditional", text: "양도일 의제는 입력했지만 무조건 사업용 의제가 성립해 판정에 쓰이지 않았습니다" }]);
  });
});
