/**
 * anchor: 증여시기(행위시법 축)가 §45의3·§45의5 엔진 input·result에 도달한다 (W1 / ERA-1·ERA-5)
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * 폼은 증여일을 **필수**로 받는데(`gift-deemed-validate.ts:46`), ④ 변환이 그 값을 두 조문의
 * 엔진 input에 넣지 않았다. `SpecificCorpInput`·`RelatedCorpInput` 어느 쪽에도 날짜 필드가
 * 0건이었고 ⑫ Zod도 마찬가지라, 날짜 유입 경로가 **구조적으로 부존재**했다
 * (④는 명시 object literal이라 form spread로 새어 들어올 여지도 없다).
 *
 * 같은 파일군의 §41의4는 `resolveFreeLoanRate(form.giftDate)`로 연도 분기를 실제로 한다 —
 * 저장소에 관례가 있는데 이 두 조문만 빠져 있었다. 결과 `appliedLawDate`(양도·취득·종부·증여
 * 본세 4개 엔진이 이미 쓰는 축)도 증여의제에만 없었다.
 *
 * ── 법령 (verbatim, KoreanLaw MCP) ──────────────────────────────────────
 * 법 §45의3③: 「증여의제이익의 계산은 수혜법인의 **사업연도 단위**로 하고, 수혜법인의 해당
 *   **사업연도 종료일을 증여시기**로 본다.」
 * 법 §45의5①: 「… 거래를 하는 경우에는 **거래한 날을 증여일로 하여** …」
 * ⇒ 두 조문의 증여시기는 «서로 다른 것»이다. 종전 UI는 둘 다 「증여일」로만 물었다(ERA-5).
 *
 * ⚠️ W12에서 §45의3에도 구간 분기가 들어왔다 — 구법(~2017-12-31) 사업연도는 **차단**된다.
 *    그 전까지 [E-4]는 「날짜가 달라도 값이 같다」를 명시적으로 고정해 두었고, 예정대로
 *    W12에서 먼저 빨개져 갱신됐다. §45의5는 W7에서 이미 구간 분기가 있다.
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

const RC_FORM = {
  ...INITIAL_DEEMED,
  type: "related_corp",
  giftDate: "2025-12-31",
  rcEnterpriseSize: "large",
  rcTotalSalesStr: "20000000000",
  rcPreTaxAdjOperatingIncomeStr: "2500000000",
  rcTaxableIncomeStr: "1800000000",
  rcCorporateTaxNetStr: "340000000",
  rcShareholders: [
    { id: "gap", name: "갑", relation: "self", directRatioPctStr: "50", isCorporate: false },
  ],
  rcIntermediaryCorps: [],
  rcSalesPartners: [
    { id: "sD", name: "D법인", salesAmountStr: "14000000000", isRelated: true, exclusionType: "", rulingStakes: [] },
  ],
} as unknown as DeemedFormState;

const SC_FORM = {
  ...INITIAL_DEEMED,
  type: "specific_corp",
  giftDate: "2026-03-02",
  scMode: "single",
  scCorporateTaxMode: "direct",
  scCounterparty: "ruling_shareholder",
  scTransactionType: "gratuitous",
  scTransactionBenefit: "1000000000",
  scCorporateTax: "0",
  scRatioPct: "100",
  scGroupRatioPct: "100",
} as unknown as DeemedFormState;

/** ④ → JSON(⑬ body) → ⑫ Zod → ⑭ 엔진. 실제 요청 경로와 같은 순서다. */
function throughPipeline(form: DeemedFormState) {
  const input = buildDeemedGiftInput(form);
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
  if (!parsed.success) throw new Error(`⑫ Zod 거부: ${parsed.error.issues[0]?.message}`);
  return {
    data: parsed.data as unknown as Record<string, unknown>,
    result: calcDeemedGift(parsed.data as never),
  };
}

describe("§45의3 — 증여시기는 「수혜법인의 사업연도 종료일」이다 (§45의3③)", () => {
  it("[E-1] ④가 fiscalYearEndDate를 싣고 ⑫Zod가 stripping하지 않는다", () => {
    const { data } = throughPipeline(RC_FORM);
    expect(data.fiscalYearEndDate).toBe("2025-12-31");
  });

  it("[E-2] 엔진이 appliedLawDate로 그 날짜를 되돌려준다 (4개 엔진의 확립된 축)", () => {
    const { result } = throughPipeline(RC_FORM);
    expect(result.appliedLawDate).toBe("2025-12-31");
    expect(result.type).toBe("related_corp");
  });

  it("[E-3] 날짜가 없으면 필드를 만들지 않는다 — 빈 문자열을 기준일로 쓰지 않는다", () => {
    const noDate = { ...RC_FORM, giftDate: "" } as DeemedFormState;
    const input = buildDeemedGiftInput(noDate) as unknown as Record<string, unknown>;
    expect("fiscalYearEndDate" in input).toBe(false);
  });

  it("[E-4] 축이 이제 세액을 바꾼다 — 구법 사업연도는 차단된다 (W12에서 갱신)", () => {
    // 종전 이 anchor는 「giftDate가 달라도 값이 같다」를 **명시적으로** 고정해 두었다
    // (「축이 생겼다」 ≠ 「행위시법이 구현됐다」). W12에서 구간 분기가 들어오면 여기가
    // 먼저 빨개지도록 의도된 것이고, 실제로 그렇게 됐다.
    const a = throughPipeline(RC_FORM).result;
    expect(a.applied).toBe(true);
    expect(a.deemedGiftValue).toBeGreaterThan(0);

    const old = throughPipeline({ ...RC_FORM, giftDate: "2016-12-31" } as DeemedFormState).result;
    expect(old.applied).toBe(false);
    expect(old.deemedGiftValue).toBe(0);
    expect(old.exclusionReason).toContain("법률 제15224호");
    expect(old.appliedLawDate).toBe("2016-12-31"); // 날짜는 여전히 그대로 도달한다
  });
});

describe("§45의5 — 증여시기는 「거래한 날」이다 (§45의5①)", () => {
  it("[E-5] single·roster 모두 appliedLawDate를 내보낸다", () => {
    expect(throughPipeline(SC_FORM).result.appliedLawDate).toBe("2026-03-02");
    const roster = {
      ...SC_FORM,
      scMode: "roster",
      scTotalShares: "100000",
      scShareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: "100000", isDonor: false },
      ],
    } as unknown as DeemedFormState;
    const r = throughPipeline(roster).result;
    expect(r.appliedLawDate).toBe("2026-03-02");
    expect(r.specificCorpMulti).toBeDefined();
  });

  it("[E-6] 두 조문의 기준일은 서로 다른 필드로 들어간다 — 섞이지 않는다", () => {
    const sc = throughPipeline(SC_FORM).data;
    const rc = throughPipeline(RC_FORM).data;
    expect(sc.transactionDate).toBe("2026-03-02");
    expect("fiscalYearEndDate" in sc).toBe(false);
    expect(rc.fiscalYearEndDate).toBe("2025-12-31");
    expect("transactionDate" in rc).toBe(false);
  });
});

describe("⑧ validate가 구법 사업연도를 계산 전에 막는다 (엔진 가드와 같은 술어)", () => {
  it("[E-7] 2017-12-31 종료 사업연도는 차단 — 사유에 조문·시행일이 있다", () => {
    const msg = validateDeemedInput({ ...RC_FORM, giftDate: "2017-12-31" } as DeemedFormState);
    expect(msg).toContain("법률 제15224호");
    expect(msg).toContain("2018-01-01");
  });

  it("[E-8] 긍정 짝 — 2018-01-01은 R-0을 통과해 다음 검증으로 넘어간다 (경계 ±1 동등성)", () => {
    // RC_FORM은 주주 roster가 비어 있어 뒤쪽 검증에 걸린다 — 「걸리는 지점이 달라진 것」이
    // R-0을 지났다는 증거다. null 단언은 여기서 성립하지 않는다.
    const msg = validateDeemedInput({ ...RC_FORM, giftDate: "2018-01-01" } as DeemedFormState);
    expect(msg).not.toContain("법률 제15224호");
    expect(msg).toBe("주주를 2명 이상 입력하세요");
  });
});
