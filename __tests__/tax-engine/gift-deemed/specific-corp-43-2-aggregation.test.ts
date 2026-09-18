/**
 * anchor: §43②·영 §32의4 11호 — 소급 1년 이내 «같은 호» 거래 합산 + §69 공제율 단일 소스
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * ① 엔진이 `transactionBenefit` 단일 스칼라로 **건별** 판정만 했고 `SpecificCorpInput`에
 *    거래일 필드가 하나도 없어 1년 소급 윈도를 표현할 방법 자체가 없었다.
 *    ⇒ 앱이 §43² 합산을 계산하지도 안내하지도 않아, 자연스러운 건별 입력이 조용히
 *      과소과세로 귀결됐다(쪼갠 거래가 각각 영 §34의5⑤ 1억원 미만 → 전부 비과세).
 *    형제 §41의4는 같은 영 §32의4의 **9호**인데 전용 유형으로 완비돼 있었다 — 11호만 비어 있었다.
 * ② §69 신고세액공제 3%가 엔진 상수 + 결과뷰 라벨 문자열 두 곳에 박혀 있어, 연도별 단일 소스
 *    `resolveFilingCreditRate`를 우회했다.
 *
 * ── 법령 (verbatim, KoreanLaw MCP) ──────────────────────────────────────
 * 법 §43②(MST 280353): 「제31조제1항제2호, 제35조, 제37조부터 제39조까지, 제39조의2, 제39조의3,
 *   제40조, 제41조의2, 제41조의4, 제42조 및 **제45조의5**에 따른 이익을 계산할 때 그 증여일부터
 *   소급하여 1년 이내에 동일한 거래 등이 있는 경우에는 각각의 거래 등에 따른 이익(시가와 대가의
 *   차액을 말한다)을 해당 이익별로 합산하여 계산한다.」
 * 영 §32의4(MST 288887): 「법 제43조제2항에 따라 다음 각 호의 어느 하나에 해당하는 이익을 계산할
 *   때에는 해당 이익별로 합산하여 각각의 금액기준을 계산한다. … **11. 법 제45조의5제1항의
 *   특정법인과의 거래를 통한 이익(같은 항 각 호의 거래에 따른 이익별로 구분된 이익을 말한다)**」
 *
 * ⚠️ 법 §43② 본문 괄호 「(시가와 대가의 차액을 말한다)」를 «다목 거래만 합산»으로 읽으면 안 된다
 *    — 같은 항이 §37·§41의2·§41의4도 열거하는데 그것들은 시가−대가 차액이 아니다.
 *    §45의5의 이익 범위는 위임을 받은 영 §32의4 11호가 「각 호의 거래에 따른 이익」으로 정한다.
 */
import { describe, it, expect } from "vitest";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/** 1인 주주·지분 100% · 법인세 0(이월결손금) — 임계 판정만 남긴다 */
const ONE = {
  type: "specific_corp",
  counterparty: "ruling_shareholder",
  transactionType: "gratuitous",
  corporateTax: 0,
  annualIncome: 0,
  ownershipRatio: { numer: 1, denom: 1 },
  controllingGroupRatio: { numer: 1, denom: 1 },
  transactionDate: "2026-03-02",
} as unknown as SpecificCorpInput;

describe("§43² 1년 합산 — 쪼갠 거래가 조용히 비과세로 빠지던 것", () => {
  it("[A-0] 종전 동작(합산 없음): 5천만 + 7천만이 각각 1억 미만 → 둘 다 0원", () => {
    expect(calcSpecificCorpGift({ ...ONE, transactionBenefit: 50_000_000 }).deemedGiftValue).toBe(0);
    const r = calcSpecificCorpGift({ ...ONE, transactionBenefit: 70_000_000 });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("1억원 미만");
  });

  it("[A-1] 6개월 전 5천만을 합산하면 1.2억 → 과세된다", () => {
    const r = calcSpecificCorpGift({
      ...ONE,
      transactionBenefit: 70_000_000,
      priorTransactions: [{ date: "2025-09-02", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(120_000_000);
    expect(r.specificCorpTransaction?.aggregation).toMatchObject({
      currentBenefit: 70_000_000,
      priorTotal: 50_000_000,
      windowFrom: "2025-03-02",
      excludedCount: 0,
    });
  });

  it("[A-2] 1년 윈도 경계 — 당일(2025-03-02)은 합산, 하루 전(2025-03-01)은 제외", () => {
    const at = calcSpecificCorpGift({
      ...ONE,
      transactionBenefit: 70_000_000,
      priorTransactions: [{ date: "2025-03-02", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(at.deemedGiftValue).toBe(120_000_000);

    const before = calcSpecificCorpGift({
      ...ONE,
      transactionBenefit: 70_000_000,
      priorTransactions: [{ date: "2025-03-01", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(before.applied).toBe(false);
    expect(before.specificCorpTransaction?.aggregation?.excludedCount).toBe(1);
    expect(before.specificCorpTransaction?.aggregation?.priorTotal).toBe(0);
  });

  it("[A-2b] 증여일보다 «뒤»의 거래는 합산하지 않는다 — 법문은 「소급하여 1년 이내」다", () => {
    // ⑧이 제품 경로에서 이 입력을 막지만([A-12]), 엔진 leaf는 API로 직접 호출될 수 있다.
    const r = calcSpecificCorpGift({
      ...ONE,
      transactionBenefit: 70_000_000,
      priorTransactions: [{ date: "2026-06-01", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(r.applied).toBe(false);
    expect(r.specificCorpTransaction?.aggregation?.priorTotal).toBe(0);
    expect(r.specificCorpTransaction?.aggregation?.excludedCount).toBe(1);
  });

  it("[A-3] 거래일이 없으면 윈도를 정할 수 없어 합산하지 않는다 (⑧이 이 상태를 차단한다)", () => {
    const r = calcSpecificCorpGift({
      ...ONE,
      transactionDate: undefined,
      transactionBenefit: 70_000_000,
      priorTransactions: [{ date: "2025-09-02", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(r.applied).toBe(false);
    expect(r.specificCorpTransaction?.aggregation).toBeUndefined();
  });

  it("[A-4] 2·3호 — 현저성은 «건별 요건»이고, 요건을 넘은 이익이 합산된다 (영 §34의5⑦)", () => {
    // 시가 10억 · 대가 6억 → 차액 4억 ≥ 시가의 30%(3억) ⇒ 요건 충족. 선행 5천만 합산.
    const ok = calcSpecificCorpGift({
      ...ONE,
      transactionType: "low_price",
      transactionBenefit: 0,
      marketValue: 1_000_000_000,
      consideration: 600_000_000,
      priorTransactions: [{ date: "2025-09-02", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(ok.deemedGiftValue).toBe(450_000_000);

    // 시가 10억 · 대가 8억 → 차액 2억: 30%(3억)·3억 모두 미달 ⇒ 2호 거래가 아니다.
    // 요건 미충족이면 합산할 이익 자체가 없다(선행거래가 있어도 0).
    const no = calcSpecificCorpGift({
      ...ONE,
      transactionType: "low_price",
      transactionBenefit: 0,
      marketValue: 1_000_000_000,
      consideration: 800_000_000,
      priorTransactions: [{ date: "2025-09-02", benefit: 50_000_000 }],
    } as unknown as SpecificCorpInput);
    expect(no.deemedGiftValue).toBe(0);
    expect(no.exclusionReason).toContain("상증령 §34의5⑦");
  });

  it("[A-5] roster도 같은 게이트를 쓴다 — 합산이 법인세 안분 분자에도 반영된다", () => {
    const roster = (priors?: unknown[]) =>
      calcSpecificCorpGiftMulti({
        type: "specific_corp",
        counterparty: "ruling_shareholder",
        transactionType: "gratuitous",
        transactionDate: "2026-03-02",
        transactionBenefit: 70_000_000,
        annualIncome: 1_000_000_000,
        corporateTaxComputed: 200_000_000,
        ...(priors ? { priorTransactions: priors } : {}),
        shareholders: [
          { id: "a", name: "갑", relation: "lineal_descendant", shares: 100, totalShares: 100, isDonor: false, isRelated: true },
        ],
      } as unknown as SpecificCorpInput);
    // 합산 전: 거래이익 7천만 − 안분 14,000,000 = 56,000,000 → 1억 미만 → 0
    expect(roster().deemedGiftValue).toBe(0);
    // 합산 후: 1.2억 − 안분 24,000,000 = 96,000,000 → 여전히 1억 미만 → 0 (합산이 분자를 키운다)
    expect(roster([{ date: "2025-09-02", benefit: 50_000_000 }]).specificCorpMulti?.corpTaxApportioned)
      .toBe(24_000_000);
    // 선행 1억을 더하면 1.7억 − 34,000,000 = 136,000,000 → 과세
    expect(roster([{ date: "2025-09-02", benefit: 100_000_000 }]).deemedGiftValue).toBe(136_000_000);
  });

  it("[A-6] 여러 건이 날짜순으로 쌓이고 윈도 밖은 건수로 고지된다", () => {
    const r = calcSpecificCorpGift({
      ...ONE,
      transactionBenefit: 30_000_000,
      priorTransactions: [
        { date: "2025-12-01", benefit: 40_000_000, label: "2차" },
        { date: "2025-06-01", benefit: 40_000_000, label: "1차" },
        { date: "2024-01-01", benefit: 900_000_000, label: "윈도 밖" },
      ],
    } as unknown as SpecificCorpInput);
    expect(r.deemedGiftValue).toBe(110_000_000);
    const agg = r.specificCorpTransaction?.aggregation;
    expect(agg?.items.map((t) => t.label)).toEqual(["1차", "2차"]);
    expect(agg?.excludedCount).toBe(1);
  });
});

describe("§69 신고세액공제율 — 연도별 단일 소스 (상수 하드코딩 제거)", () => {
  const rate = (date: string | undefined) =>
    calcSpecificCorpGift({
      ...ONE,
      transactionDate: date,
      transactionBenefit: 1_000_000_000,
    } as unknown as SpecificCorpInput).specificCorpLimit;

  it("[A-7] 거래일이 2019-01-01 이후면 3%", () => {
    const l = rate("2026-03-02");
    expect(l?.filingCreditRate).toBe(0.03);
    expect(l?.filingCredit).toBe(Math.floor((l!.finalTax * 3) / 100));
  });

  it("[A-8] 2018년 거래는 5%, 2017년은 7% — 종전에는 전부 3%였다", () => {
    expect(rate("2018-06-01")?.filingCreditRate).toBe(0.05);
    expect(rate("2017-06-01")?.filingCreditRate).toBe(0.07);
    expect(rate("2016-12-31")?.filingCreditRate).toBe(0.1);
    // 5%면 공제액도 달라진다(구별력)
    expect(rate("2018-06-01")!.filingCredit).toBeGreaterThan(rate("2026-03-02")!.filingCredit);
  });

  it("[A-9] 거래일 미전달은 현행 3% — 무회귀 안전판", () => {
    expect(rate(undefined)?.filingCreditRate).toBe(0.03);
  });
});

// ── ④API변환 → ⑬body → ⑫Zod → ⑭엔진 관통 ──
const FORM: DeemedFormState = {
  ...INITIAL_DEEMED,
  type: "specific_corp",
  giftDate: "2026-03-02",
  scMode: "single",
  scCorporateTaxMode: "direct",
  scCounterparty: "ruling_shareholder",
  scTransactionType: "gratuitous",
  scTransactionBenefit: "70000000",
  scCorporateTax: "0",
  scRatioPct: "100",
  scGroupRatioPct: "100",
  scPriorTransactions: [{ id: "p1", date: "2025-09-02", benefit: "50000000", label: "1차 무상제공" }],
} as unknown as DeemedFormState;

function throughPipeline(form: DeemedFormState) {
  const input = buildDeemedGiftInput(form);
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
  if (!parsed.success) throw new Error(`⑫ Zod 거부: ${parsed.error.issues[0]?.message}`);
  const data = parsed.data as Record<string, unknown>;
  return {
    reachedDate: "transactionDate" in data,
    reachedPriors: "priorTransactions" in data,
    result: calcDeemedGift(parsed.data as never),
  };
}

describe("14지점 관통 — transactionDate · priorTransactions", () => {
  it("[A-10] ⑫Zod가 두 필드를 stripping하지 않고 엔진까지 도달한다", () => {
    const { reachedDate, reachedPriors, result } = throughPipeline(FORM);
    expect([reachedDate, reachedPriors]).toEqual([true, true]);
    expect(result.deemedGiftValue).toBe(120_000_000);
    // 선행거래 행을 비우면 종전값 — 이 축이 차이를 만든다
    expect(throughPipeline({ ...FORM, scPriorTransactions: [] } as DeemedFormState).result.deemedGiftValue).toBe(0);
  });

  it("[A-11] ⑧validate — 증여일이 없으면 «조용한 미합산»이 아니라 차단이다", () => {
    expect(validateDeemedInput(FORM)).toBeNull();
    // 엔진은 거래일이 없으면 합산을 건너뛴다([A-3]). 그 상태로 계산이 되면 과소과세가 되는데,
    // 공통 가드(gift-deemed-validate.ts:46)가 이미 그보다 앞에서 막는다.
    const noDate = { ...FORM, giftDate: "" } as DeemedFormState;
    expect(validateDeemedInput(noDate)).toBe("증여일을 입력하세요");
  });

  it("[A-11b] ④ 변환이 빈 행을 «보내지 않는다» — ⑧과 어긋나면 Zod 400으로 계산이 막힌다", () => {
    // 저장소의 알려진 함정(RC-G): 언마운트된 빈 행을 ④가 보내고 ⑧이 건너뛰면 ⑫가 400을 낸다.
    // ⑫는 `date: z.string().min(1)`이라 빈 날짜를 거부하므로, 필터가 없으면 여기서 throw한다.
    const withEmpty = {
      ...FORM,
      scPriorTransactions: [
        { id: "p1", date: "2025-09-02", benefit: "50000000", label: "" },
        { id: "p2", date: "", benefit: "", label: "" },
      ],
    } as unknown as DeemedFormState;
    const sent = (buildDeemedGiftInput(withEmpty) as unknown as Record<string, unknown>)
      .priorTransactions as unknown[];
    expect(sent).toHaveLength(1);
    expect(() => throughPipeline(withEmpty)).not.toThrow();
    expect(throughPipeline(withEmpty).result.deemedGiftValue).toBe(120_000_000);
  });

  it("[A-12] ⑧validate — 빈 행·증여일보다 뒤인 거래일을 차단한다", () => {
    const empty = {
      ...FORM,
      scPriorTransactions: [{ id: "p1", date: "", benefit: "", label: "" }],
    } as unknown as DeemedFormState;
    expect(validateDeemedInput(empty)).toMatch(/선행거래 1의 거래일/);

    const future = {
      ...FORM,
      scPriorTransactions: [{ id: "p1", date: "2026-06-01", benefit: "50000000", label: "" }],
    } as unknown as DeemedFormState;
    expect(validateDeemedInput(future)).toMatch(/증여일보다 뒤입니다/);

    const noBenefit = {
      ...FORM,
      scPriorTransactions: [{ id: "p1", date: "2025-09-02", benefit: "0", label: "" }],
    } as unknown as DeemedFormState;
    expect(validateDeemedInput(noBenefit)).toMatch(/선행거래 1의 이익/);
  });
});
