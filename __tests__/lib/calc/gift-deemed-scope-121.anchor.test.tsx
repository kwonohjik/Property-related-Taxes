/**
 * #121 — `/calc/gift-deemed` 소개 문구(메타·OG·본문·홈 카드)가 계산기 제공 범위를 말한다.
 *
 * 종전 문구는 §34·§35·§36·§37·§41의4 다섯 조문만 열거해 §39 증자를 포함한 17종이 빠졌고,
 * 그 다섯을 「증여의제」로 불렀다(현행 표제상 「증여 의제」는 §45의2~§45의5). 리뷰:
 * `docs/review/gift-39/J-safety-net.md` J-14.
 *
 * 목록은 stale된다(`feedback_capability_notice_list_goes_stale`) — 그래서 문구를 고정하지 않고
 * **유형 전수가 문구에 들어 있는지**를 관측한다. 아래 표가 `satisfies Record<DeemedGiftType, …>`라
 * 유형이 추가되면 키워드를 채우기 전까지 tsc가 실패한다.
 */
import { describe, it, expect } from "vitest";
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";
import {
  DEEMED_TYPE_META,
  GIFT_DEEMED_SCOPE,
  GIFT_DEEMED_SCOPE_LAW,
} from "@/lib/calc/gift-deemed-type-meta";
import { metadata } from "@/app/calc/gift-deemed/page";

/** 유형 → 소개 문구에 있어야 할 낱말 */
const SCOPE_KEYWORD = {
  trust_benefit: "신탁이익",
  insurance: "보험금",
  bargain_transfer: "저가양수",
  debt_forgiveness: "채무면제",
  free_realestate: "무상사용",
  free_loan: "무상대출",
  free_loan_aggregated: "무상대출",
  merger: "합병",
  capital_increase: "증자",
  capital_increase_allocation: "증자",
  capital_decrease: "감자",
  contribution: "현물출자",
  convertible_stock: "전환주식",
  convertible_bond: "전환사채",
  acquisition_fund_presumption: "재산취득자금",
  nominee_trust: "명의신탁",
  excess_dividend: "초과배당",
  listing_gain: "상장",
  property_service_use: "용역제공",
  org_change: "조직변경",
  value_increase: "가치증가",
  specific_corp: "특정법인",
  related_corp: "특수관계법인",
} satisfies Record<DeemedGiftType, string>;

/** "§45의5" → [45, 5] · "§33" → [33, 0] */
function articleKey(s: string): [number, number] | null {
  const m = /§(\d+)(?:의(\d+))?/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}
const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

/** 「상증법 §33~§45의5」 범위 안인가 */
function inScopeRange(law: string, range: string): boolean {
  const [lo, hi] = range.split("~").map(articleKey);
  const k = articleKey(law);
  if (!lo || !hi || !k) return false;
  return cmp(k, lo) >= 0 && cmp(k, hi) <= 0;
}

const STALE_FIVE = "§34·§35·§36·§37·§41의4";

describe("#121 증여이익 계산기 소개 문구", () => {
  it("[SC-1] 모든 유형의 낱말이 소개 문구에 있다 — §39 증자 포함", () => {
    const missing = (Object.keys(SCOPE_KEYWORD) as DeemedGiftType[]).filter(
      (t) => !GIFT_DEEMED_SCOPE.includes(SCOPE_KEYWORD[t]),
    );
    expect(missing).toEqual([]);
    expect(GIFT_DEEMED_SCOPE).toContain("증자");
  });

  it("[SC-2] 모든 유형의 근거 조문이 문구의 조문 범위 안이다", () => {
    const out = Object.entries(DEEMED_TYPE_META)
      .filter(([, m]) => !inScopeRange(m.law, GIFT_DEEMED_SCOPE_LAW))
      .map(([t, m]) => `${t}:${m.law}`);
    expect(out).toEqual([]);
  });

  it("[SC-2+] 범위 판정은 밖의 조문을 거른다 (긍정 짝)", () => {
    expect(inScopeRange("상증법 §33", GIFT_DEEMED_SCOPE_LAW)).toBe(true);
    expect(inScopeRange("상증법 §45의5", GIFT_DEEMED_SCOPE_LAW)).toBe(true);
    expect(inScopeRange("상증법 §32", GIFT_DEEMED_SCOPE_LAW)).toBe(false);
    expect(inScopeRange("상증법 §45의6", GIFT_DEEMED_SCOPE_LAW)).toBe(false);
    expect(inScopeRange("상증법 §46", GIFT_DEEMED_SCOPE_LAW)).toBe(false);
  });

  it("[SC-3] 페이지 description·OG가 소개 문구와 조문 범위를 싣고, 다섯 조문 열거는 없다", () => {
    const og = metadata.openGraph as { description?: string };
    for (const d of [metadata.description, og.description]) {
      expect(d).toContain(GIFT_DEEMED_SCOPE);
      expect(d).toContain(GIFT_DEEMED_SCOPE_LAW);
      expect(d).not.toContain(STALE_FIVE);
    }
  });

  it("[SC-4] §33~§44의 「…의 증여」 유형을 「증여의제」로 부르지 않는다", () => {
    // 「증여 의제」는 명의신탁·특수관계법인·특정법인(§45의2~§45의5) 자리에만 온다
    const og = metadata.openGraph as { description?: string };
    for (const d of [GIFT_DEEMED_SCOPE, metadata.description, og.description]) {
      expect(d).not.toMatch(/무상대출\s*(등\s*)?증여의제/);
    }
    expect(GIFT_DEEMED_SCOPE).toMatch(/명의신탁.*증여 의제/);
  });
});
