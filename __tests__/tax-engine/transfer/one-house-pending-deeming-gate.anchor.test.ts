/**
 * anchor — OH-23: pending 합가·귀농 축은 **의제 성립 요건이 기한 외에 모두 충족**일 때만 낸다.
 *
 * `docs/reviews/one-house-exemption-review-2026-09.md` OH-23 · `lib/tax-engine/one-house/pending.ts`.
 *
 * ## 계약 (pending.ts 머리 주석)
 *
 * 「이 날짜까지 ~하면 비과세」는 **기한이 남은 그 요건 하나만 미충족일 때만** 참이다.
 * 종전 합가 축은 합가일·「먼저 양도」·기한 도과·§154①만 보고, 귀농 축은 kind·취득일·2주택·기한·§154①만
 * 봤다. 그래서 기한 안에 양도했어도 과세였을 세대에 「조건부」 배지와 기한이 붙었다.
 *
 * 법문(「소득세법 시행령」 §155, KoreanLaw MST 286211 실독 2026-09-26):
 *  - ④ 「…동거봉양하기 위하여 세대를 **합침으로써 1세대가 2주택을 보유하게 되는 경우** 합친 날부터
 *    10년 이내에 먼저 양도하는 주택」
 *  - ⑤ 「1주택을 보유하는 자가 1주택을 보유하는 자와 **혼인함으로써 1세대가 2주택을 보유하게 되는
 *    경우** … 혼인한 날부터 10년 이내에 먼저 양도하는 주택」 ⇒ 양도 주택은 합가(혼인) **전** 보유분
 *  - ⑦ 「…**수도권 밖의 지역 중 읍지역(도시지역안의 지역을 제외한다) 또는 면지역**에 소재하는 주택」
 *  - ⑩ 귀농주택 요건: 2호 「취득 당시에 … 고가주택에 해당하지 아니할 것」 · 3호 「대지면적이
 *    660제곱미터이내일 것」 · 5호 「세대전원이 이사 … 하여 거주할 것」
 *
 * 모든 부정형 단언에 긍정 짝을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, D("2021-01-01"));

/** 거주요건이 걸리지 않는 시료(취득 당시 비조정) — 보유요건만 남긴다. */
const RESIDENCE_FREE = { wasRegulatedAtAcquisition: false, residencePeriodMonths: 0 } as const;

/**
 * 혼인 2010-01-01 · 양도 주택 2005-01-01 취득(혼인 전) · 양도 2024-06-01.
 * 2024-11-12 전 양도라 혼인 합가 기한은 5년(대통령령 제34990호 부칙 제2조) ⇒ 기한 2015-01-01.
 */
const MARRIAGE: Partial<TransferTaxInput> = {
  acquisitionDate: D("2005-01-01"),
  marriageMerge: { marriageDate: D("2010-01-01") },
  isFirstTransferredInMerge: true,
  ...RESIDENCE_FREE,
};

describe("OH-23 합가 축 — 주택 수 요건", () => {
  it("[C2-23a] 세대 4주택이면 기한 안에 양도했어도 §155⑤ 의제가 서지 않는다 → pending 없음", () => {
    const r = judge({ ...MARRIAGE, householdHousingCount: 4 });
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).not.toContain("155-5-marriage-merge");
    // 기한 안이라고 가정해도 과세다 — 같은 술어의 대조(양도일만 기한 안으로)
    expect(judge({ ...MARRIAGE, householdHousingCount: 4, transferDate: D("2014-06-01") }).isExempt).toBe(false);
  });

  it("[C2-23a+] 긍정 짝 — 2주택이면 기한(2015-01-01)을 낸다 · 기한 안이면 실제로 비과세다", () => {
    const r = judge({ ...MARRIAGE, householdHousingCount: 2 });
    expect(r.pending.map((p) => p.id)).toEqual(["155-5-marriage-merge"]);
    expect(iso(r.pending[0].deadline)).toBe("2015-01-01");
    expect(judge({ ...MARRIAGE, householdHousingCount: 2, transferDate: D("2014-06-01") }).isExempt).toBe(true);
  });

  /**
   * 3주택 = §155①과 §155⑤가 겹친 경우(F-1 · `resolveMergeOverlapDeeming`). §155① 처분기한이
   * 지켜지는 세대만 합가 기한이 유일한 장애물이다.
   */
  const OVERLAP = (newAcq: string): Partial<TransferTaxInput> => ({
    ...MARRIAGE,
    householdHousingCount: 3,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2005-01-01"),
      newAcquisitionDate: D(newAcq),
    } as TransferTaxInput["temporaryTwoHouse"],
  });

  it("[C2-23c3+] 긍정 짝 — 3주택 중첩 · §155① 기한 안 → 합가 기한을 낸다", () => {
    const r = judge(OVERLAP("2023-01-01"));
    expect(r.pending.map((p) => p.id)).toEqual(["155-5-marriage-merge"]);
  });

  it("[C2-23c3] 3주택 중첩이라도 §155① 처분기한마저 지났으면 합가 기한 하나로는 비과세가 되지 않는다", () => {
    const r = judge(OVERLAP("2020-01-01"));
    expect(r.pending.map((p) => p.id)).not.toContain("155-5-marriage-merge");
  });
});

describe("OH-23 합가 축 — 합가(혼인) 전 취득 요건", () => {
  it("[C2-23b] 혼인 **후** 취득한 주택은 기한 안이어도 의제 대상이 아니다 → pending 없음", () => {
    const f = { ...MARRIAGE, householdHousingCount: 2, acquisitionDate: D("2012-01-01") };
    expect(judge(f).pending.map((p) => p.id)).not.toContain("155-5-marriage-merge");
    expect(judge({ ...f, transferDate: D("2014-06-01") }).isExempt).toBe(false);
  });

  it("[C2-23b+] 긍정 짝 — 혼인 **당일** 취득분은 의제 대상이다(부동산거래관리과-410) → 기한을 낸다", () => {
    const f = { ...MARRIAGE, householdHousingCount: 2, acquisitionDate: D("2010-01-01") };
    expect(judge(f).pending.map((p) => p.id)).toEqual(["155-5-marriage-merge"]);
  });

  it("[C2-23b2] 혼인·동거봉양이 둘 다 입력되면 엔진은 혼인 축만 판정한다 — 동거봉양 기한을 따로 내지 않는다", () => {
    const r = judge({
      ...MARRIAGE,
      householdHousingCount: 2,
      parentalCareMerge: { mergeDate: D("2012-03-15") },
    });
    expect(r.pending.map((p) => p.id)).toEqual(["155-5-marriage-merge"]);
  });
});

describe("OH-23 귀농 3호 축 — ⑦ 소재 · ⑩2·3·5호", () => {
  const RURAL = (over: Record<string, unknown> = {}) =>
    ({
      kind: "return_to_farm",
      isOutsideCapitalEupMyeon: true,
      acquisitionDate: D("2015-01-01"),
      isHighPriceAtAcquisition: false,
      landAreaSqm: 300,
      wholeHouseholdMoved: true,
      ...over,
    }) as TransferTaxInput["ruralHouse"];

  const ids = (over: Record<string, unknown>) =>
    judge({ householdHousingCount: 2, ruralHouse: RURAL(over), ...RESIDENCE_FREE }).pending.map((p) => p.id);

  it("[C2-23c+] 긍정 짝 — 요건을 모두 갖춘 귀농주택은 5년 기한(2020-01-01)을 낸다", () => {
    const r = judge({ householdHousingCount: 2, ruralHouse: RURAL(), ...RESIDENCE_FREE });
    expect(r.pending.map((p) => p.id)).toEqual(["155-7-3ho-return-to-farm"]);
    expect(iso(r.pending[0].deadline)).toBe("2020-01-01");
  });

  it("[C2-23c] 대지 800㎡(⑩3호 660㎡ 초과) → 기한 안이어도 과세 → pending 없음", () => {
    expect(ids({ landAreaSqm: 800 })).toEqual([]);
    expect(
      judge({
        householdHousingCount: 2,
        ruralHouse: RURAL({ landAreaSqm: 800 }),
        transferDate: D("2019-06-01"),
        ...RESIDENCE_FREE,
      }).isExempt,
    ).toBe(false);
  });

  it("[C2-23c-2] 읍·면 소재 아님(⑦) → pending 없음", () => {
    expect(ids({ isOutsideCapitalEupMyeon: false })).toEqual([]);
  });

  it("[C2-23c-3] 취득 당시 고가주택(⑩2호) → pending 없음", () => {
    expect(ids({ isHighPriceAtAcquisition: true })).toEqual([]);
  });

  it("[C2-23c-4] 세대전원 이사 아님(⑩5호) → pending 없음", () => {
    expect(ids({ wholeHouseholdMoved: false })).toEqual([]);
  });
});
