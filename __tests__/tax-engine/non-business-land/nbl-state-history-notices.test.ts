/**
 * NBL-STATE-HISTORY-E1 — 이력 고지 상수(`nbl-confirm-notices.ts`) 고정. E1에서는 어느 판정 경로도 싣지 않는다(도달 불가 가드: `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts`).
 * 이력 없음 경로의 기존 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)는 E0 anchor(`nbl-state-history-notice.anchor.test.ts`)가 지키므로 여기서는 «다른 문구가 따로 있다»만 본다.
 * 새 법령 조문은 인용하지 않는다 — 문구의 `§`는 모두 `NBL` 상수에서 와야 한다(문자열 리터럴 조문 금지 · verify:legal 대상 밖 인용 금지).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import * as notices from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";

const STATE_HISTORY_NOTICES = Object.entries(notices).filter(([k]) => k.startsWith("NBL_STATE_HISTORY_")) as Array<[string, string]>;

const BY_KEY: Record<string, string> = Object.fromEntries(STATE_HISTORY_NOTICES);

/** 확인 필요 표기가 필요한 고지(판정 한계를 알리는 것) — 입력 안내 2종(모름 행·유예 행)은 제외. */
const CONFIRM_REQUIRED = [
  "NBL_STATE_HISTORY_APPLIED_NOTICE",
  "NBL_STATE_HISTORY_UNCHANGED_NOTICE",
  "NBL_STATE_HISTORY_UNKNOWN_NOTICE",
  "NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE",
  "NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE",
  "NBL_STATE_HISTORY_REVENUE_START_NOTICE",
  "NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE", // E3-① — 재산세 과세 구분 변경 사건이 있을 때 APPLIED를 대체
];

describe("NBL-STATE-HISTORY-E1 — 이력 고지 상수", () => {
  it("10종이 있고 서로 다르며 기존 이력 없음 고지와도 다르다(E3-①이 2종 추가 — 기존 8종 문구는 바이트 동일)", () => {
    expect(STATE_HISTORY_NOTICES.map(([k]) => k).sort()).toEqual(
      [
        ...CONFIRM_REQUIRED,
        "NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE",
        "NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE",
        "NBL_STATE_HISTORY_GRACE_ROW_NOTICE",
      ].sort(),
    );
    const texts = STATE_HISTORY_NOTICES.map(([, v]) => v);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).not.toContain(notices.NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it.each(CONFIRM_REQUIRED)("%s — 판정 한계를 알리는 고지는 «확인 필요»로 끝난다(「모름 = 혜택 불성립 + 확인 필요」)", (key) => {
    const text = BY_KEY[key];
    expect(text).toContain("확인 필요");
  });

  it("조문 `§`는 전부 `NBL` 상수에서 온다 — 문자열 리터럴 조문·새 인용 없음", () => {
    const nblValues = (Object.values(NBL) as unknown[]).filter((v): v is string => typeof v === "string").sort((a, b) => b.length - a.length);
    for (const [key, text] of STATE_HISTORY_NOTICES) {
      let rest = text;
      for (const v of nblValues) rest = rest.split(v).join("");
      expect(rest, `${key}에 NBL 상수 밖의 조문 표기가 있다`).not.toMatch(/§\s*\d/);
    }
  });

  it("DM-01 칸 안내는 «이력과 합쳐 판정» — 개시일을 건너뛰지 않는다(Q-15 (가′))", () => {
    expect(notices.NBL_STATE_HISTORY_REVENUE_START_NOTICE).toContain("함께 판정");
    expect(notices.NBL_STATE_HISTORY_REVENUE_START_NOTICE).not.toContain("판정에 쓰이지 않");
  });

  it("모름 행 안내는 «종합합산으로 보아 판정 + 확인 필요 표시» · 납세고지서 확인 경로를 말한다", () => {
    expect(notices.NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE).toContain("종합합산");
    expect(notices.NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE).toContain("납세고지서");
  });

  it("유예 안내는 자동 생성하지 않는다고 말한다(Q-10 (가))", () => {
    expect(notices.NBL_STATE_HISTORY_GRACE_ROW_NOTICE).toContain("자동으로 만들지 않습니다");
  });
});
