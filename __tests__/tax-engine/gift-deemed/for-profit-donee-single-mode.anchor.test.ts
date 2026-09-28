/**
 * 「상증법」§2 9호·§4의2①·③ — 명부형 3종의 **단일(명부 없는) 모드**에 공통 토글을 건다 (7-15).
 *
 * 7-12 공통 게이트는 **유형 단위**(13종)라 §38·§39의2·§39의3은 통째로 빠졌다. 그런데 이 세 유형은 모드에
 * 따라 수증자가 1인(또는 한 묶음)이다 — 그때는 계산 단위 토글이 맞다. 명부 모드는 행별 축(7-13)이다.
 *
 * 🔑 긍정 짝:
 *   - 명부 모드에 공통 토글을 켜도 무변화 — 행별 축과 겹치면 「한 행만 영리법인」을 표현할 수 없게 된다.
 *   - §39의3 **저가 명부**는 증여자 명부라 수증자(현물출자자)는 여전히 1인 — 여기는 공통 토글이 **걸린다**.
 *     「명부가 있으면 뺀다」로 단순화하면 이 경우를 놓친다.
 *   - 유형 단위 표(7-12, 13종)는 그대로다 — 모드 판정은 그 위에 얹는다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { commonForProfitDoneeGateApplies, forProfitDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { SINGLE_MODE, ROSTER_MODE } from "./for-profit-donee-single-mode.fixture";
import { FOR_PROFIT_DONEE_APPLIED } from "./for-profit-donee-applied.fixture";

const on = (i: DeemedGiftInput) => ({ ...i, doneeIsForProfitCorp: true }) as DeemedGiftInput;
const DEFINED_TERM = /증여재산가액|증여추정가액/;

describe("§4의2①·③ 단일 모드 — 판정", () => {
  it.each(Object.keys(SINGLE_MODE))("[SFP-0] %s — 게이트가 걸린다", (k) => {
    expect(forProfitDoneeGateApplies(SINGLE_MODE[k])).toBe(true);
  });

  it.each(Object.keys(ROSTER_MODE))("[SFP-0b] 긍정 짝: %s(명부) — 게이트가 걸리지 않는다", (k) => {
    expect(forProfitDoneeGateApplies(ROSTER_MODE[k])).toBe(false);
  });

  it("[SFP-0c] 유형 단위 13종은 모드와 무관하게 그대로 걸린다 — 7-12 표 불변", () => {
    for (const i of Object.values(FOR_PROFIT_DONEE_APPLIED)) expect(forProfitDoneeGateApplies(i)).toBe(true);
    expect(commonForProfitDoneeGateApplies("merger")).toBe(false); // 유형 단위로는 여전히 아니다
  });

  it("[SFP-0d] 긍정 짝: §41의2·§45의2·§45의3·§45의5·§39 자체 경로는 여전히 밖이다", () => {
    for (const type of ["excess_dividend", "nominee_trust", "related_corp", "specific_corp", "capital_increase", "convertible_stock"])
      expect(forProfitDoneeGateApplies({ type } as DeemedGiftInput)).toBe(false);
  });
});

describe("§4의2①·③ 단일 모드 — 결과", () => {
  it.each(Object.keys(SINGLE_MODE))("[SFP-1] %s — 켜면 과세 제외, 금액은 「제외 전」으로 보존", (k) => {
    const base = calcDeemedGift(SINGLE_MODE[k]);
    expect(base.applied).toBe(true); // 전제
    const r = calcDeemedGift(on(SINGLE_MODE[k]));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toMatch(/영리법인 수증자/);
    expect(r.breakdown.some((b) => DEFINED_TERM.test(b.label))).toBe(false);
    expect(r.breakdown.filter((b) => b.label.includes("제외 전")).some((b) => b.amount === base.deemedGiftValue)).toBe(true);
  });

  it.each(Object.keys(SINGLE_MODE))("[SFP-2] 긍정 짝: %s — 끄면 종전 그대로", (k) => {
    const base = calcDeemedGift(SINGLE_MODE[k]);
    const off = calcDeemedGift({ ...SINGLE_MODE[k], doneeIsForProfitCorp: false } as DeemedGiftInput);
    expect(off.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(off.applied).toBe(true);
  });

  it.each(Object.keys(ROSTER_MODE))("[SFP-3] 긍정 짝: %s(명부) — 공통 토글이 켜져도 무변화(행별 축의 몫)", (k) => {
    const base = calcDeemedGift(ROSTER_MODE[k]);
    expect(base.applied).toBe(true);
    expect(calcDeemedGift(on(ROSTER_MODE[k])).deemedGiftValue).toBe(base.deemedGiftValue);
  });
});
