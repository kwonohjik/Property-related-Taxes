/**
 * ④ 「상증법」§4의2①·③ 공통 축 — API 변환 층 (7-12).
 *
 * 🔴 stale 누수가 이 파일의 주된 표적이다 — 폼 상태는 유형을 바꿔도 남는다(`set({ type })`가 머지).
 *    §35 화면에서 켠 뒤 §38로 바꾸면 토글은 숨지만 값은 `true`로 남는다. 그 값이 명부형·§45의2
 *    페이로드에 실리면, 그 유형이 나중에 이 필드를 읽게 되는 순간 **아무도 켠 적 없는 배제**가 된다.
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, DEEMED_TYPE_META, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { commonForProfitDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";

/** `free_loan_aggregated`는 폼 유형이 아니다 — `free_loan` 다건 토글이 만든다([FPA-4]) */
const FORM_TYPES = (Object.keys(DEEMED_TYPE_META) as DeemedFormState["type"][]).filter(
  (t) => t !== "free_loan_aggregated",
);
const GATED = FORM_TYPES.filter((t) => commonForProfitDoneeGateApplies(t as never));
const OTHERS = FORM_TYPES.filter((t) => !commonForProfitDoneeGateApplies(t as never));

const payload = (type: DeemedFormState["type"], on: boolean, extra: Partial<DeemedFormState> = {}) =>
  buildDeemedGiftInput({ ...INITIAL_DEEMED, ...extra, type, doneeIsForProfitCorp: on } as DeemedFormState) as unknown as Record<string, unknown>;

describe("④ API 변환 — 영리법인 수증자 공통 축", () => {
  it("[FPA-0] 모집단: 폼 유형 중 12종이 게이트 대상이다 (+ 다건 합산 페이로드 1종)", () => {
    expect(GATED).toHaveLength(12);
  });

  it.each(GATED)("[FPA-1] %s — 켜면 페이로드에 실린다", (type) => {
    expect(payload(type, true).doneeIsForProfitCorp).toBe(true);
  });

  it.each(GATED)("[FPA-2] 긍정 짝: %s — 끄면 실리지 않는다", (type) => {
    expect(payload(type, false)).not.toHaveProperty("doneeIsForProfitCorp");
  });

  it.each(OTHERS)("[FPA-3] %s — 공통 토글이 stale로 켜져 있어도 실리지 않는다", (type) => {
    // §39 3경로는 자체 축(`ciDoneeIsForProfitCorp`)이 같은 이름으로 싣는다 — 그 값은 꺼 둔다.
    expect(payload(type, true, { ciDoneeIsForProfitCorp: false }).doneeIsForProfitCorp).not.toBe(true);
    expect(JSON.stringify(payload(type, true, { ciDoneeIsForProfitCorp: false }))).not.toMatch(/"doneeIsForProfitCorp":true/);
  });

  it("[FPA-4] free_loan 다건 토글 → free_loan_aggregated 페이로드에도 실린다", () => {
    const p = payload("free_loan", true, { loanLoans: [] });
    expect(p.type).toBe("free_loan_aggregated"); // 분기에 실제로 들어갔다는 전제
    expect(p.doneeIsForProfitCorp).toBe(true);
  });
});
