/**
 * anchor: §45의5 행위시법 — 거래일 시점의 법령으로 계산한다 (W7 / ERA-2·ERA-3)
 *
 * §45의5①은 「**거래한 날**을 증여일로 하여」로 증여시기를 명문으로 고정한다. 그 날 시행 중이던
 * 법령이 적용되는데, 엔진은 거래일을 받지 못해(W1 이전) 1996년이든 2035년이든 **현행 산식으로
 * 조용히 계산**했다.
 *
 * ── 확정된 시점 지도 (전건 KoreanLaw MCP 원문 확인) ───────────────────
 * | 거래일                | 법 §45의5                  | 영 §34의5⑨ ㉠ base      | 앱      |
 * |---------------------|---------------------------|----------------------|--------|
 * | ~2019-12-31         | 구 체계(3분류) · ②에 한도 없음 | (⑨ 없음)              | 차단    |
 * | 2020-01-01~02-10    | 현행 ①② 시행               | 위임 시행령 미시행       | 차단    |
 * | 2020-02-11~2022-02-14 | 현행 ①②                 | **net**(증여의제이익)    | 분기    |
 * | 2022-02-15~         | 현행 ①②                   | **gross**(④1호×비율)   | 현행    |
 *
 * 구 체계(법률 제16102호, 시행 2019.1.1) §45의5 verbatim — ①은 「1. 결손금이 있는 법인 /
 * 2. 휴업 또는 폐업 상태인 법인 / 3. … 지배주주와 그 친족의 주식보유비율이 **100분의 50 이상**인
 * 법인」이고 ②는 「제1항에 따른 **거래는** 다음 각 호의 어느 하나에 해당하는 것으로 한다」 —
 * 한도가 아니라 거래 유형 조항이다. 한도(②)는 법률 제16846호(2020-01-01)에서 신설됐다.
 *
 * ⇒ 현행 30% 요건으로 그 구간을 계산하면 구법상 비대상 법인에 «없는 세금»을 만든다.
 *   「법 근거 없이 불리하게 적용하지 않는다」 ⇒ 계산하지 않고 차단한다.
 */
import { describe, it, expect } from "vitest";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import {
  resolveScEraExclusion,
  resolveScLimitBasis,
  SC_DECREE_EFFECTIVE_FROM,
  SC_LIMIT_GROSS_FROM,
} from "@/lib/tax-engine/gift-deemed/specific-corp-era";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/** ERA-2 probe와 같은 입력 — 거래이익 30억·소득 50억·산출세액 5억·갑 30%·을 20% */
const ROSTER = (date?: string) =>
  ({
    type: "specific_corp",
    counterparty: "ruling_shareholder",
    transactionType: "gratuitous",
    ...(date ? { transactionDate: date } : {}),
    transactionBenefit: 3_000_000_000,
    annualIncome: 5_000_000_000,
    corporateTaxComputed: 500_000_000,
    giftDeduction: 0,
    shareholders: [
      { id: "gap", name: "갑", relation: "lineal_descendant", shares: 3_000, totalShares: 10_000, isDonor: false, isRelated: true },
      { id: "eul", name: "을", relation: "lineal_descendant", shares: 2_000, totalShares: 10_000, isDonor: false, isRelated: true },
      { id: "x", name: "기타", relation: "other", shares: 5_000, totalShares: 10_000, isDonor: false, isRelated: false },
    ],
  }) as unknown as SpecificCorpInput;

const limits = (date?: string) =>
  (calcSpecificCorpGiftMulti(ROSTER(date)).specificCorpMulti?.donees ?? [])
    .filter((d) => d.isTaxable)
    .map((d) => [d.name, d.limitCalc?.limitBasis, d.limitCalc?.finalTax] as const);

describe("영 §34의5⑨ — 증여세 상당액(㉠)의 base가 2022-02-15에 바뀌었다", () => {
  it("[R-0] 경계 상수가 확인된 시행일과 같다", () => {
    expect(SC_LIMIT_GROSS_FROM).toBe("2022-02-15"); // 대통령령 제32414호
    expect(SC_DECREE_EFFECTIVE_FROM).toBe("2020-02-11"); // 대통령령 제30391호
  });

  it("[R-1] 2022-02-15 이후는 gross — 갑 120,000,000 / 을 60,000,000 (현행 유지)", () => {
    expect(limits("2025-12-31")).toEqual([
      ["갑", "gross", 120_000_000],
      ["을", "gross", 60_000_000],
    ]);
  });

  it("[R-2] 2022-02-14 이전은 net — 갑 93,000,000 / 을 42,000,000 (합계 45,000,000원 과대였다)", () => {
    expect(limits("2021-06-01")).toEqual([
      ["갑", "net", 93_000_000],
      ["을", "net", 42_000_000],
    ]);
    const gross = limits("2025-12-31").reduce((a, r) => a + (r[2] ?? 0), 0);
    const net = limits("2021-06-01").reduce((a, r) => a + (r[2] ?? 0), 0);
    expect(gross - net).toBe(45_000_000);
  });

  it("[R-3] 경계 ±1일 — 2022-02-14는 net, 2022-02-15는 gross", () => {
    expect(resolveScLimitBasis("2022-02-14")).toBe("net");
    expect(resolveScLimitBasis("2022-02-15")).toBe("gross");
    expect(limits("2022-02-14")[0]?.[1]).toBe("net");
    expect(limits("2022-02-15")[0]?.[1]).toBe("gross");
  });

  it("[R-4] 거래일 미전달은 현행(gross) — 무회귀 안전판", () => {
    expect(resolveScLimitBasis(undefined)).toBe("gross");
    expect(limits(undefined)).toEqual(limits("2025-12-31"));
  });

  it("[R-5] net 구간에서는 ㉠가 ㉮와 같아져 법인세 상당액이 0이 아니면 항상 한도가 걸린다", () => {
    const d = calcSpecificCorpGiftMulti(ROSTER("2021-06-01")).specificCorpMulti?.donees.find((x) => x.name === "갑");
    const lc = d?.limitCalc;
    expect(lc?.directGiftTax).toBe(lc?.computedTax); // base가 같아진다
    expect(lc?.finalTax).toBe((lc?.computedTax ?? 0) - (lc?.corpTaxShare ?? 0));
    expect(lc?.corpTaxShare).toBeGreaterThan(0);
  });

  it("[R-6] single 경로도 같은 시점 기준을 쓴다 (모드 parity)", () => {
    const single = (date: string) =>
      calcSpecificCorpGift({
        ...ROSTER(date),
        shareholders: undefined,
        ownershipRatio: { numer: 3_000, denom: 10_000 },
        controllingGroupRatio: { numer: 5_000, denom: 10_000 },
      } as unknown as SpecificCorpInput).specificCorpLimit;
    expect(single("2021-06-01")?.limitBasis).toBe("net");
    expect(single("2021-06-01")?.finalTax).toBe(93_000_000);
    expect(single("2025-12-31")?.limitBasis).toBe("gross");
    expect(single("2025-12-31")?.finalTax).toBe(120_000_000);
  });
});

describe("계산할 수 없는 시점은 «조용히 현행 산식으로» 계산하지 않고 차단한다", () => {
  it("[R-7] 2019-12-31 이전 — 구 체계(3분류·한도 없음)는 미구현", () => {
    const r = calcSpecificCorpGiftMulti(ROSTER("2019-06-30"));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("구 §45의5");
    expect(r.exclusionReason).toContain("결손법인");
    // 한도표를 그리지 않는다 — 존재하지 않는 조문의 계산 과정을 화면에 그리면 표시층 모순이다
    expect(r.specificCorpMulti?.donees.every((d) => !d.limitCalc)).toBe(true);
  });

  it("[R-8] 2020-01-01~02-10 — 법은 시행이나 위임 시행령이 없던 구간도 차단", () => {
    const r = calcSpecificCorpGiftMulti(ROSTER("2020-01-15"));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("상증령 §34의5");
    expect(r.exclusionReason).toContain("2020-02-11");
  });

  it("[R-9] 경계 ±1일 — 2020-02-10은 차단, 2020-02-11은 계산된다", () => {
    expect(resolveScEraExclusion("2020-02-10")).toBeDefined();
    expect(resolveScEraExclusion("2020-02-11")).toBeUndefined();
    expect(calcSpecificCorpGiftMulti(ROSTER("2020-02-10")).applied).toBe(false);
    const ok = calcSpecificCorpGiftMulti(ROSTER("2020-02-11"));
    expect(ok.applied).toBe(true);
    expect(ok.specificCorpMulti?.donees.find((d) => d.name === "갑")?.limitCalc?.limitBasis).toBe("net");
  });

  it("[R-10] 2019-12-31 / 2020-01-01 경계 — 사유 문구가 갈린다", () => {
    expect(resolveScEraExclusion("2019-12-31")).toContain("구 §45의5");
    expect(resolveScEraExclusion("2020-01-01")).toContain("상증령 §34의5");
  });

  it("[R-11] 거래일 미전달이면 차단하지 않는다 — 종전 동작 유지", () => {
    expect(resolveScEraExclusion(undefined)).toBeUndefined();
    expect(calcSpecificCorpGiftMulti(ROSTER(undefined)).applied).toBe(true);
  });
});

// ── ⑧validate · ④→⑫→⑭ 관통 ──
const FORM: DeemedFormState = {
  ...INITIAL_DEEMED,
  type: "specific_corp",
  giftDate: "2021-06-01",
  scMode: "single",
  scCorporateTaxMode: "auto",
  scCounterparty: "ruling_shareholder",
  scTransactionType: "gratuitous",
  scTransactionBenefit: "3000000000",
  scCorpTaxAssessed: "500000000",
  scCorpIncome: "5000000000",
  scRatioPct: "30",
  scGroupRatioPct: "50",
} as unknown as DeemedFormState;

describe("14지점 관통 — 거래일이 시점 분기까지 이어진다", () => {
  it("[R-12] ④→⑫→⑭로 net 기준이 적용된다", () => {
    const input = buildDeemedGiftInput(FORM);
    const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
    expect(parsed.success).toBe(true);
    const r = calcDeemedGift((parsed as { data: unknown }).data as never);
    expect(r.specificCorpLimit?.limitBasis).toBe("net");
    expect(r.specificCorpLimit?.finalTax).toBe(93_000_000);
  });

  it("[R-13] ⑧validate가 범위 밖 거래일을 먼저 막는다 (「계산됐는데 0원」 방지)", () => {
    expect(validateDeemedInput(FORM)).toBeNull();
    const old = { ...FORM, giftDate: "2019-06-30" } as DeemedFormState;
    expect(validateDeemedInput(old)).toContain("구 §45의5");
    const gap = { ...FORM, giftDate: "2020-01-15" } as DeemedFormState;
    expect(validateDeemedInput(gap)).toContain("상증령 §34의5");
  });
});
