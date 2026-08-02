/**
 * anchor: §39 cap-table — **신주인수권 포기 ↔ 실권주 재배정 수령은 병존 불가**
 *
 * 도메인 사실(사용자 확인, 2026-08-02): **한 번 포기하면 그 증자에서 더는 인수할 수 없다.**
 * 자기 배정분도 다 청약하지 않은 주주가 남의 실권주를 재배정받는 일은 실무에서 성립하지 않는다
 * (초과청약도 자기 배정분을 **전량** 청약한 주주만 할 수 있다).
 *
 * ── 왜 anchor가 필요한가 ────────────────────────────────────────────────
 * `CapShareholder`는 `entitledShares`·`subscribedShares`·`reallocatedShares`를 **독립 입력**으로
 * 받아서, 「당초배정분 인수(= subscribed − realloc) < entitled」이면서 `realloc > 0`인
 * **불가능한 조합**을 만들 수 있었다. 그 입력으로는 엔진이 의미 없는 답을 내고
 * (equity-delta는 상계해 「증여자」로, 법정 산식은 「수증자」로 갈린다) 그 차이를 두고
 * **있지도 않은 결함을 쫓게 된다** — 실제로 그런 조사가 한 차례 있었다(계획서 v1.5 §11).
 *
 * ⇒ 엔진을 고치는 대신 **입력 단계에서 차단**한다. 차단하면 남는 입력에서는
 *   포기자 = 증여자(delta < 0) · 재배정 수령자 = 수증자(delta > 0)로 깔끔히 갈려
 *   cap-table의 delta 부호 판정이 법정 구분과 어긋나지 않는다.
 *
 * ⑧ `gift-deemed-validate.ts` ↔ ⑬ `gift-deemed-input.ts` superRefine **동일 규칙**(3중 일치).
 */
import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

type Row = DeemedFormState["ciAllocRows"][number];
const row = (o: Partial<Row> & { id: string; name: string }): Row => ({
  preShares: "", entitledShares: "", subscribedShares: "", reallocatedShares: "", relatedTo: [], ...o,
});

function allocForm(rows: Row[]): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "capital_increase_allocation",
    giftDate: "2026-03-02",
    ciAllocPrePrice: "20,000",
    ciAllocNewPrice: "10,000",
    ciAllocRows: rows,
  };
}

/** 정상 — A는 전량 포기(재배정 0) · B는 자기분 전량 인수 + 재배정 수령 */
const VALID: Row[] = [
  row({ id: "sh-1", name: "A", preShares: "60,000", entitledShares: "60,000", subscribedShares: "0", reallocatedShares: "", relatedTo: ["sh-2"] }),
  row({ id: "sh-2", name: "B", preShares: "40,000", entitledShares: "40,000", subscribedShares: "100,000", reallocatedShares: "60,000", relatedTo: ["sh-1"] }),
];

/** 불가능 — A가 40,000 포기(자기분 20,000만 인수)했는데 재배정 10,000을 받음 */
const IMPOSSIBLE: Row[] = [
  row({ id: "sh-1", name: "A", preShares: "60,000", entitledShares: "60,000", subscribedShares: "30,000", reallocatedShares: "10,000", relatedTo: ["sh-2"] }),
  row({ id: "sh-2", name: "B", preShares: "40,000", entitledShares: "40,000", subscribedShares: "70,000", reallocatedShares: "30,000", relatedTo: ["sh-1"] }),
];

describe("포기 ↔ 재배정 병존 차단 — ⑧ client validate", () => {
  it("FR-1: 정상 입력은 통과한다", () => {
    expect(validateDeemedInput(allocForm(VALID))).toBeNull();
  });

  it("FR-2 ⭐: 포기한 주주가 재배정을 받는 입력은 **차단**된다", () => {
    const msg = validateDeemedInput(allocForm(IMPOSSIBLE));
    expect(msg).toContain("포기한 주주는 실권주를 재배정받을 수 없습니다");
    expect(msg).toContain("A"); // 어느 주주인지 지목한다
  });

  it("FR-3: 자기분 **전량** 인수 + 초과청약은 포기가 아니므로 통과", () => {
    // C: 배정 30,000 전량 인수 + 재배정 20,000 ⇒ ownSubscribed 30,000 == entitled
    const rows = [
      ...VALID,
      row({ id: "sh-3", name: "C", preShares: "30,000", entitledShares: "30,000", subscribedShares: "50,000", reallocatedShares: "20,000", relatedTo: [] }),
    ];
    expect(validateDeemedInput(allocForm(rows))).toBeNull();
  });
});

describe("포기 ↔ 재배정 병존 차단 — ⑬ Zod (⑧과 동일 규칙)", () => {
  const toInput = (rows: Row[]) => ({
    type: "capital_increase_allocation" as const,
    direction: "low" as const,
    preIssuePrice: 20_000,
    newSharePrice: 10_000,
    shareholders: rows.map((r) => ({
      id: r.id,
      name: r.name,
      preShares: Number(r.preShares.replace(/,/g, "") || 0),
      entitledShares: Number(r.entitledShares.replace(/,/g, "") || 0),
      subscribedShares: Number(r.subscribedShares.replace(/,/g, "") || 0),
      reallocatedShares: Number(r.reallocatedShares.replace(/,/g, "") || 0),
      relatedTo: r.relatedTo,
    })),
  });

  it("FR-4: 정상 입력은 통과", () => {
    expect(deemedGiftInputSchema.safeParse(toInput(VALID)).success).toBe(true);
  });

  it("FR-5 ⭐: 불가능 조합은 Zod에서도 막힌다 (UI 통과 ↔ 서버 통과 모순 0)", () => {
    const parsed = deemedGiftInputSchema.safeParse(toInput(IMPOSSIBLE));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message.includes("재배정받을 수 없습니다"))).toBe(true);
    }
  });
});
