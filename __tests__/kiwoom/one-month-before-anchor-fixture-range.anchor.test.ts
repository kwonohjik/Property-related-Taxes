/**
 * P-0 안전망 — 「양도일·취득일 **이전** 1개월」 anchor 시프트의 fixture 경계
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 0)
 *
 * ## 무엇을 고정하는가
 *
 * 소득세법 §99①3은 「평가기준일 이전ㆍ이후 각 2개월」을 「**양도일ㆍ취득일 이전 1개월**」로
 * 본다고 하고, 상증법 §63①1가목 괄호는 기준일이 **매매가 없는 날**이면 **그 전일**을 기준으로
 * 하라고 한다. `buildOneMonthBeforeSlots`가 그 시프트를 수행한다.
 *
 * 🔑 그런데 휴장일 fixture는 **2020~2026**뿐이다(`KRX_HOLIDAY_FIXTURE_RANGE`).
 *    범위 **밖**의 평일 공휴일은 `isKrxTradingDay`가 거래일로 보므로 시프트가 **일어나지 않는다**.
 *    이것은 이 순수 함수의 «의도된 한계»이고, 보정은 상위(route)가 키움 응답의 실제 거래일로
 *    수행한다(계획서 B′안). ⇒ **여기서 고치려 들면 안 된다.**
 *
 * P-0a 실측(2026-08-31): `resolveValuationAnchor` 호출을 제거하면 `calendar.test.ts`의
 * 2건(K-LEAP-01 · 토요일 시프트)이 실패한다. 둘 다 **fixture 안** 날짜라
 * **범위 밖 케이스는 안전망이 0건**이었다 — 이 파일이 그 공백을 메운다.
 */

import { describe, it, expect } from "vitest";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
import { KRX_HOLIDAY_FIXTURE_RANGE } from "@/lib/kiwoom/data/krx-holidays-2020-2026";

describe("FR — 이전 1개월 anchor 시프트의 fixture 경계", () => {
  it("FR-1: fixture 범위는 2020~2026이다 (넓히면 아래 기대값이 바뀐다)", () => {
    expect(KRX_HOLIDAY_FIXTURE_RANGE.startYear).toBe(2020);
    expect(KRX_HOLIDAY_FIXTURE_RANGE.endYear).toBe(2026);
  });

  it("FR-2: fixture 안 평일 공휴일은 시프트한다 — 2024-03-01(삼일절, 금) → anchor 2024-02-29", () => {
    const slots = buildOneMonthBeforeSlots("2024-03-01");
    expect(slots[slots.length - 1]).toBe("2024-02-29");
  });

  it("FR-3: 주말은 범위와 무관하게 시프트한다 — 2015-02-21(토) → anchor 2015-02-20(금)", () => {
    const slots = buildOneMonthBeforeSlots("2015-02-21");
    expect(slots[slots.length - 1]).toBe("2015-02-20");
  });

  /**
   * 🔴 **이것은 「옳은 동작」이 아니라 「현재 동작」이다.**
   *
   * 2015-02-19는 설날(목)이라 KRX가 열지 않았다. 법령상 anchor는 직전 거래일 2015-02-17이고
   * 창은 [2015-01-18 ~ 2015-02-17]이어야 한다. fixture가 2015를 모르기 때문에 그렇게 되지 않는다.
   *
   * 실측 차이(005930, 키움 실 API 2026-08-31):
   *   현재    [2015-01-20 ~ 2015-02-19] · 거래일 21 · 평균 1,372,857
   *   법령상  [2015-01-18 ~ 2015-02-17] · 거래일 22 · 평균 1,371,500   (차이 1,357원/주)
   *
   * ⇒ 이 단언이 실패하면 누군가 이 순수 함수를 고친 것이다. **그 방향이 아니다** —
   *    보정은 route가 키움 응답의 실제 거래일로 해야 한다(계획서 B′안). 이 파일과 계획서를
   *    함께 갱신할 것.
   */
  it("FR-4: fixture 밖 평일 공휴일은 시프트하지 않는다 — 2015-02-19(설날)이 anchor로 남는다", () => {
    const slots = buildOneMonthBeforeSlots("2015-02-19");
    expect(slots[slots.length - 1]).toBe("2015-02-19");
    expect(slots[0]).toBe("2015-01-19");
    expect(slots.length).toBe(32);
  });
});
