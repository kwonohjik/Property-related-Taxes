/**
 * anchor — 1세대1주택 비과세 **근거 조문 인용**의 안전망 (P0).
 *
 * 계획서: `docs/00-pm/one-house-exemption-automation.plan.md` §2.4 · §3.5 · §8.2 P-1 · §9 P0.
 *
 * ## 왜 필요한가 — P-1 실측이 뒤집은 판정
 *
 * 계획서는 인용 오기를 「세액 영향 없음 → 소규모」로 봤는데, **재발 방지 장치가 전무**했다:
 *
 * - **테스트**가 근거 문자열을 단언하지 않았다 — `MARRIAGE_MERGE_2HOUSE_BASIS`(§155⑤) ·
 *   `EXEMPTION_SOLE_BASIS`(§155②) · `EXEMPTION_CO_INHERITED_BASIS`(§155③)를
 *   `"MUTATED-A/B/C"`로 바꿨는데 **774파일 7,751건이 전부 통과**했다.
 * - **`verify:legal`도 못 잡는다** — 커버리지 비교 단위가 **조(article)** 라
 *   (`coverage.ts` `articleKey`) §155④ ↔ ⑤ ↔ ⑦ **항 번호 오기는 검증 대상이 아니다**.
 *   §154·§155가 조문 전체 단위로 한 건씩만 등록돼 있는 것도 그 때문이다.
 *
 * ⇒ **항 단위 인용 오기는 이 파일 말고는 아무도 잡지 못한다.** 상수화만 하면 그 상수도 똑같이
 *   무방비라, P0은 상수화와 이 anchor를 한 PR에 묶었다.
 *
 * ## 무엇을 지키나
 *
 * 1. 상수가 **어느 조문을 가리키는지** 고정한다(법제처 실독 2026-09-20 — 아래 표).
 * 2. 엔진이 각 분기에서 **그 조문을 실제로 낸다**는 것 — 상수만 맞고 배선이 틀리면 의미가 없다.
 * 3. **서로 바뀌지 않는다** — 동거봉양이 ⑤·⑦이 아니라 ④임을 부정형으로도 건다.
 *
 * | 인용 | 조문 제목(법제처 실독) |
 * |---|---|
 * | 소득세법 §89② | 비과세 양도소득 — 주택+조합원입주권·분양권 보유 중 그 주택 양도 → ①3호 부적용 |
 * | 소득세법 시행령 §152의3 | **1세대의 범위** (§152는 「환지등의 정의」라 오기였다) |
 * | 소득세법 시행령 §155④ | 동거봉양 합가 (60세 이상 직계존속, 합친 날부터 10년) |
 * | 소득세법 시행령 §155⑤ | 혼인 합가 (혼인한 날부터 10년) |
 * | 소득세법 시행령 §155⑥1호 | 지정문화유산·국가등록문화유산·천연기념물등 |
 * | 소득세법 시행령 §155⑦ | **농어촌주택** — 동거봉양이 아니다 |
 * | 소득세법 시행령 §155⑧ | 부득이한 사유로 취득한 수도권 밖 주택 |
 * | 소득세법 시행령 §156의2 | 주택과 조합원입주권을 소유한 경우 1세대1주택의 특례 |
 * | 소득세법 시행령 §156의3 | 주택과 분양권을 소유한 경우 1세대 1주택의 특례 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { TRANSFER, MULTI_HOUSE, INHERITED_HOUSE, shortArticle } from "@/lib/tax-engine/legal-codes";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

describe("P0-1 상수가 가리키는 조문 — 법제처 실독값 고정", () => {
  it("C-1 §89② · §152의3 — 1세대의 범위는 §152(환지등의 정의)가 아니다", () => {
    expect(TRANSFER.RIGHT_HOLDING_EXCLUSION).toBe("소득세법 §89 ②");
    expect(TRANSFER.ONE_HOUSEHOLD_DEF).toBe("소득세법 시행령 §152의3");
    expect(TRANSFER.ONE_HOUSEHOLD_DEF).not.toBe("소득세법 시행령 §152");
  });

  it("C-2 §152의3은 **한 벌**이다 — 중과 축과 비과세 축이 같은 값을 쓴다", () => {
    // 종전에는 두 파일이 각자 §152를 들고 있었고 둘 다 오기였다(인용 드리프트 복제).
    expect(MULTI_HOUSE.ONE_HOUSEHOLD_DEF).toBe(TRANSFER.ONE_HOUSEHOLD_DEF);
  });

  it("C-3 §155 특례 항 번호 — 서로 바뀌지 않는다", () => {
    expect(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT).toBe("소득세법 시행령 §155④");
    expect(TRANSFER.MARRIAGE_MERGE_EXEMPT).toBe("소득세법 시행령 §155⑤");
    expect(TRANSFER.CULTURAL_HERITAGE_HOUSE).toBe("소득세법 시행령 §155⑥1호");
    expect(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL).toBe("소득세법 시행령 §155⑧");
    // §155⑦은 농어촌주택이다 — 합가 상수가 ⑦을 가리키면 안 된다.
    expect(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT).not.toContain("⑦");
    expect(TRANSFER.MARRIAGE_MERGE_EXEMPT).not.toContain("⑦");
  });

  it("C-4 §156의2·§156의3 — 조합원입주권 축과 분양권 축이 뒤바뀌지 않는다", () => {
    expect(TRANSFER.RIGHT_ONE_HOUSE_SPECIAL).toBe("소득세법 시행령 §156의2");
    expect(TRANSFER.PRESALE_ONE_HOUSE_SPECIAL).toBe("소득세법 시행령 §156의3");
  });

  it("C-5 `===` 동치로 묶인 셋 — **항 앞 공백**은 표기가 아니라 비교의 일부다", () => {
    // 생산지(`transfer-tax-89-2-exclusion.ts`)와 소비지(`transfer-tax.ts`)가 문자열 동치로 묶여 있다.
    expect(TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4).toBe("소득세법 시행령 §156의2 ④");
    expect(TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3).toBe("소득세법 시행령 §156의3 ③");
    expect(TRANSFER.REPLACEMENT_HOUSE_156_2_5).toBe("소득세법 시행령 §156의2 ⑤");
  });

  it("★ C-5b P-1이 뚫었던 넷 — 중과·상속 축 근거 문자열", () => {
    /**
     * 🔴 P-1(2026-09-18)은 이 상수들을 `"MUTATED-A/B/C"`로 바꾸고 774파일 7,751건을 돌렸는데
     *    **전부 통과**했다. 값을 못 박는 것만으로 그 뮤테이션이 죽는다.
     *    (중과 축은 §167의10①15호가 §155 의제를 받아 쓰는 구조라 두 조문이 함께 붙는다.)
     */
    expect(MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS).toBe("소득세법 시행령 §167의10①15호·§155④");
    expect(MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS).toBe("소득세법 시행령 §167의10①15호·§155⑤");
    expect(INHERITED_HOUSE.EXEMPTION_SOLE_BASIS).toBe("소득세법 시행령 §155②");
    expect(INHERITED_HOUSE.EXEMPTION_CO_INHERITED_BASIS).toBe("소득세법 시행령 §155③");
    // 비과세 축과 중과 축이 같은 항을 가리킨다 — 한쪽만 고치면 어긋난다.
    expect(MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS).toContain(
      shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT),
    );
    expect(MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS).toContain(
      shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT),
    );
  });

  it("C-6 shortArticle — 라벨 축약이 조문 번호를 보존한다", () => {
    expect(shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT)).toBe("§155④");
    expect(shortArticle(TRANSFER.CULTURAL_HERITAGE_HOUSE)).toBe("§155⑥1호");
    expect(shortArticle(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL)).toBe("§155⑧");
  });
});

describe("P0-2 엔진이 그 조문을 실제로 낸다 — 상수만 맞고 배선이 틀리면 의미가 없다", () => {
  const merge = (over: Partial<TransferTaxInput> = {}) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 2,
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2018-01-01"),
        transferDate: D("2025-06-01"),
        isFirstTransferredInMerge: true,
        ...over,
      }),
      mockRates,
    );

  it("★ E-1 동거봉양 합가 → §155④ (⑤·⑦이 아니다)", () => {
    const r = merge({ parentalCareMerge: { mergeDate: D("2020-01-01") } });
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain(shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT));
    expect(r.exemptReason).not.toContain("§155⑤");
    expect(r.exemptReason).not.toContain("§155⑦");
  });

  it("★ E-2 (긍정 짝) 혼인 합가 → §155⑤ (④가 아니다)", () => {
    const r = merge({ marriageMerge: { marriageDate: D("2020-01-01") } });
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain(shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT));
    expect(r.exemptReason).not.toContain("§155④");
  });

  it("E-3 문화유산 주택 → §155⑥1호", () => {
    const r = merge({ culturalHeritageHouse: true });
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain(shortArticle(TRANSFER.CULTURAL_HERITAGE_HOUSE));
  });

  it("★ E-4 수도권 밖 부득이한 사유 주택 → §155⑧ (§155⑦ 농어촌이 아니다)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2018-01-01"),
        transferDate: D("2026-06-01"),
        householdHousingCount: 2,
        isOneHousehold: true,
        residencePeriodMonths: 36,
        sellingHouseId: "h1",
        houses: [
          makeHouseInfo("h1", { regionCode: "11680", acquisitionDate: D("2018-01-01") }),
          makeHouseInfo("h2", { regionCode: "11680", acquisitionDate: D("2019-01-01") }),
        ],
        unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2025-01-01") },
      }),
      mockRates,
    );
    expect(r.exemptReason).toContain(shortArticle(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL));
    expect(r.exemptReason).not.toContain("§155⑦");
  });

  it("E-5 대체주택 특례 → §156의2⑤ (라벨은 공백 없는 축약)", () => {
    // 대체주택은 **인가일 이후** 취득해야 하고(취득 2018-01-01 > 인가 2017-01-01),
    // 신축주택 완성 후 3년 이내 양도여야 한다(완성 2024-01-01 → 양도 2025-06-01).
    const r = merge({
      householdHousingCount: 2, // 신축주택(완성) + 대체주택
      residencePeriodMonths: 14,
      replacementHouse: {
        businessApprovalDate: D("2017-01-01"),
        completionDate: D("2024-01-01"),
        replacementResidenceMonths: 14,
        willResideNewHouse: true,
      },
    });
    expect(r.exemptReason).toContain("§156의2⑤");
    // 분양권 축(§156의3)과 뒤바뀌지 않는다.
    expect(r.exemptReason).not.toContain("§156의3");
  });
});
