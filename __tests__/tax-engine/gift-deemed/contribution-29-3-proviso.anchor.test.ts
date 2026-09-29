/**
 * 「상증령」§29의3① 단서 — 「현물출자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다」
 * + 같은 ⑧ 블록의 공란 검사 누락 4건(사용자 결정: 함께 처리).
 *
 * 착수 전 실측(2026-09-29 · 정상 입력: 전 10,000 × 100,000주 · 인수가 5,000(저가)/20,000(고가) · 출자 50,000 · 배정 50,000):
 *   · 단서 — §39 증자(PR #1855)와 같다. 보충적평가 1주당 가액은 음수가 되지 않아(「상증령」§55①·§56①)
 *     성립 영역은 **정확히 0**이다. 그런데 ⑧이 현물출자 전 가액 0을 「미입력」으로 막았다.
 *     결손법인 고가 현물출자(전 0 · 인수가 20,000 · 비율 100%)는 엔진에서 666,700,000인데 화면에서 넣을 수 없었다.
 *   · 공란 → 0이 조용히 엔진에 닿았다(⑧ 통과):
 *       저가 인수가 공란 333,300,000(정상 166,650,000 · 과다) · 저가 출자신주수 공란 250,000,000(과다) ·
 *       고가 출자신주수 공란 500,000,000(정상 333,350,000 · 과다) · 배정/인수 신주수·인수가(고가)·지분비율 공란 →
 *       0 + 「인수가 이하」·「기준금액 미만」 **거짓 사유**(과소). §39의 3-A·IG-016과 같은 형태다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

const PROVISO = /「상증령」§29의3① 단서/;
const PARTIES = [{ name: "갑", preShares: 60_000, relation: "father" }, { name: "을", preShares: 40_000, relation: "mother" }];

const con = (caseType: "low" | "high", pre: number, nw: number, extra: Record<string, unknown> = {}) =>
  calcDeemedGift({
    type: "contribution", caseType, preContribPrice: pre, preContribShares: 100_000, newSharePrice: nw,
    contributedShares: 50_000, allocatedShares: 50_000,
    ...(caseType === "high" ? { relatedRatio: { numer: 1, denom: 1 } } : {}),
    ...extra,
  } as DeemedGiftInput);

describe("엔진 — 단서 영역(현물출자 전 0 · 후 0): 반환 경로 4개 전부", () => {
  for (const [label, c, extra] of [
    ["저가 · 명부 없음", "low", {}], ["저가 · 증여자 명부", "low", { parties: PARTIES }],
    ["고가 · 명부 없음", "high", {}], ["고가 · 수증자 명부", "high", { parties: PARTIES }],
  ] as const) {
    it(`[C293-1] ${label} — 이익 없음, 사유는 §29의3① 단서`, () => {
      const r = con(c, 0, 0, extra);
      expect(r.applied).toBe(false);
      expect(r.deemedGiftValue).toBe(0);
      expect(r.exclusionReason).toMatch(PROVISO);
    });
  }

  it("[C293-1+] 짝 — 전 0이어도 인수가 20,000이면 후 6,666 > 0 ⇒ 단서 밖, 고가 666,700,000 과세", () => {
    const r = con("high", 0, 20_000);
    expect(r.deemedGiftValue).toBe(666_700_000);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });

  it("[C293-2] 짝 — 단서는 상장 단서 적용 **후** 가액으로 본다: 고가 Max(0, 종가평균 5,000) > 0 ⇒ 단서 밖", () => {
    const r = con("high", 0, 0, { isListed: true, listedMarketAvg: 5_000 });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });

  it("[C293-2b] 경계 짝 — 전 **1원**·인수가 0이면 후가 floor로 0이 되지만 전이 양수라 단서 밖(「모두」 — ±1 동등성)", () => {
    // (1 × 100,000 + 0 × 50,000) ÷ 150,000 = 0.66… → floor 0. 값은 어차피 0이고 사유만 다르다.
    const r = con("low", 1, 0);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });

  it("[C293-2+] 짝 — 전 양수(10,000)면 인수가 0이어도 단서 밖(후 > 0) — 저가 과세", () => {
    const r = con("low", 10_000, 0);
    expect(r.applied).toBe(true);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });
});

describe("⑧ — 0은 허용(정당한 평가액·무상 배정·특수관계 주주 없음), 공란만 막는다", () => {
  const LOW: DeemedFormState = {
    ...INITIAL_DEEMED, type: "contribution", giftDate: "2026-03-02", conCaseType: "low",
    conPrePrice: "10,000", conPreShares: "100,000", conNewPrice: "5,000", conContributedShares: "50,000", conAllocatedShares: "50,000",
  };
  const HIGH: DeemedFormState = { ...LOW, conCaseType: "high", conNewPrice: "20,000", conRelatedRatioPct: "100" };

  it("[C293-3] 현물출자 전 가액 — \"0\" 통과 · 공란 차단", () => {
    expect(validateDeemedInput({ ...LOW, conPrePrice: "0" })).toBeNull();
    expect(validateDeemedInput({ ...LOW, conPrePrice: "" })).toBe("현물출자 전 1주당 평가가액을 입력하세요");
  });

  it("[C293-4] 신주 인수가액 — 공란 차단(저가 333,300,000 과다 · 고가 0 과소) · \"0\" 통과", () => {
    expect(validateDeemedInput({ ...LOW, conNewPrice: "" })).toBe("신주 1주당 인수가액을 입력하세요");
    expect(validateDeemedInput({ ...HIGH, conNewPrice: "" })).toBe("신주 1주당 인수가액을 입력하세요");
    expect(validateDeemedInput({ ...LOW, conNewPrice: "0" })).toBeNull();
  });

  it("[C293-5] 현물출자 주식수 — 공란·0 차단(산식 분자·분모 — 비면 과다) · 짝: 정상 통과", () => {
    expect(validateDeemedInput({ ...LOW, conContributedShares: "" })).toBe("현물출자 주식수를 입력하세요");
    expect(validateDeemedInput({ ...HIGH, conContributedShares: "0" })).toBe("현물출자 주식수를 입력하세요");
    expect(validateDeemedInput(LOW)).toBeNull();
    expect(validateDeemedInput(HIGH)).toBeNull();
  });

  it("[C293-6] 배정(저가)·인수(고가) 신주수 — 유일한 곱셈 수량이라 공란·0 차단, 라벨은 화면과 같다", () => {
    expect(validateDeemedInput({ ...LOW, conAllocatedShares: "" })).toBe("배정받은 신주수를 입력하세요");
    expect(validateDeemedInput({ ...HIGH, conAllocatedShares: "0" })).toBe("인수 신주수를 입력하세요");
  });

  it("[C293-7] 고가 · 명부 없음 지분비율 — 공란 차단 · \"0\" 통과 · 짝: 명부를 켜면 묻지 않는다(④·⑤와 같은 술어)", () => {
    expect(validateDeemedInput({ ...HIGH, conRelatedRatioPct: "" })).toBe("현물출자자 특수관계인 주주등 지분비율을 입력하세요");
    expect(validateDeemedInput({ ...HIGH, conRelatedRatioPct: "0" })).toBeNull();
    expect(validateDeemedInput({ ...HIGH, conRelatedRatioPct: "", conParties: [{ name: "갑", shares: "60,000", relation: "father" }] })).toBeNull();
    expect(validateDeemedInput({ ...LOW, conRelatedRatioPct: "" })).toBeNull(); // 저가에는 비율 축이 없다
  });

  it("[C293-8] 왕복 — 결손법인 고가 현물출자(0 · 20,000 · 100%)가 ⑧ → ④ → ⑫ → 엔진을 지나 666,700,000", () => {
    const f: DeemedFormState = { ...HIGH, conPrePrice: "0" };
    expect(validateDeemedInput(f)).toBeNull();
    const p = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(f))));
    expect(p.success).toBe(true);
    expect(calcDeemedGift(p.success ? (p.data as DeemedGiftInput) : ({} as DeemedGiftInput)).deemedGiftValue).toBe(666_700_000);
  });
});
