/**
 * 공익법인등 사후관리 **가산세** — 상증법 §48②5호·7호 → §78⑨
 *
 * ## 법령·집행기준 (2026-08-10 실측)
 *
 * · **법 §78⑨** — 「각 호의 구분에 따른 금액의 **100분의 10**(제48조제2항제7호**가목**의
 *   공익법인등이 이 항 **제3호**에 해당하는 경우에는 같은 호에 따른 금액의 **100분의 200**)에
 *   상당하는 금액을 … 가산하여 부과한다. 이 경우 **제1호와 제3호에 동시에 해당하는 경우에는
 *   더 큰 금액으로 한다**」
 *     1호: §48②5호 **운용소득** 기준금액 미달 → 「운용소득 중 사용하지 아니한 금액」
 *     2호: §48②5호 **매각대금** 기준금액 미달 → 「매각대금 중 사용하지 아니한 금액」
 *     3호: §48②7호 해당 → 「기준금액에서 직접 공익목적사업에 사용한 금액을 차감한 금액」
 * · **상증령 §80⑬⑭** — 1호 기준금액 = §38⑤ 사용기준금액 / 2호 기준금액 = §38⑦ 사용기준
 * · **상증령 §38⑤** — 운용소득의 **100분의 80** = 사용기준금액
 * · **상증령 §38⑦** — 매각한 날이 속하는 과세기간 종료일부터 **1년 이내 30%·2년 이내 60%**
 * · **상증령 §38⑱** — §48②7호 「출연받은 재산의 가액」(직전 사업연도 재무상태표 기준)
 * · **법 §48②7호** — 기준금액 = 그 가액 × **1%**(§16②2호가목 공익법인등이 발행주식총수등의
 *   **10% 초과** 보유 시 **3%**)
 *
 * ## 🔑 가산세 base는 「미달사용액」이지 「운용소득·매각대금 전액 − 사용액」이 아니다
 *
 * §78⑨1·2호의 문언(「운용소득/매각대금 **중** 사용하지 아니한 금액」)만 보면 전액 대비
 * 미사용액으로도 읽히지만, **국세청 집행기준 48-38-7**이 표로 못박는다:
 *
 * | 매각대금 사용기간 | 최소사용실적 | 미달시 추징방법 |
 * |---|---|---|
 * | 1년 이내 | 30% | 가산세 부과(**미달사용액**의 10%) |
 * | 2년 이내 | 60% | 가산세 부과(**미달사용액**의 10%) |
 * | 3년 이내 | 90% | 증여세 추징(미달사용액) |
 *
 * 집행기준 48-40-1 ⑨도 「**미달사용금액**에 대한 가산세 추징」이라 쓴다. ⇒ PN-1·PN-2가 이
 * base를 고정한다. 전액 기준이면 세액이 몇 배가 된다.
 *
 * ## ⭐ 200%는 10%의 **20배**다 (PN-4)
 *
 * §48②7호**가목**(주식 5% 초과 보유 공익법인등)이 §78⑨**3호**에 해당하면 10%가 아니라
 * **200%**다. 나목과 뒤바뀌면 세액이 20배 틀린다.
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestPenalty } from "@/lib/tax-engine/deductions/public-interest-penalty";
import type { PublicInterestPenaltyInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const OPERATING: NonNullable<PublicInterestPenaltyInput["operatingIncome"]> = {
  income: 100_000_000,
  usedAmount: 60_000_000,
};

const SALE: NonNullable<PublicInterestPenaltyInput["saleProceeds"]> = {
  proceeds: 1_000_000_000,
  usedWithin1y: 200_000_000,
  usedWithin2y: 500_000_000,
};

const MANDATORY: NonNullable<PublicInterestPenaltyInput["mandatoryDistribution"]> = {
  assetBase: 10_000_000_000,
  exceedsTenPercentHolding: false,
  isClauseGaCorp: false,
  usedAmount: 40_000_000,
};

describe("PN-1 — §78⑨1호: 운용소득 사용기준금액(80%) 미달", () => {
  it("기준금액 = 운용소득 × 80% (상증령 §38⑤)", () => {
    const r = calcPublicInterestPenalty({ operatingIncome: OPERATING });
    expect(r.operatingIncome?.threshold).toBe(80_000_000);
  });

  it("🔑 가산세 base는 **미달사용액**이지 「운용소득 − 사용액」이 아니다 (집행기준 48-38-6·48-40-1)", () => {
    const r = calcPublicInterestPenalty({ operatingIncome: OPERATING });
    // 기준 8천만 − 사용 6천만 = 2천만  (❌ 운용소득 1억 − 6천만 = 4천만이 아니다)
    expect(r.operatingIncome?.shortfall).toBe(20_000_000);
    expect(r.operatingIncome?.shortfall).not.toBe(40_000_000);
    expect(r.operatingIncome?.penalty).toBe(2_000_000); // 2천만 × 10%
  });

  it("기준금액을 채우면 가산세가 없다", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: { income: 100_000_000, usedAmount: 80_000_000 },
    });
    expect(r.operatingIncome?.shortfall).toBe(0);
    expect(r.operatingIncome?.penalty).toBe(0);
    expect(r.totalPenalty).toBe(0);
  });

  it("운용소득이 음수면 0으로 본다 (서면-2021-법규법인-7926)", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: { income: -50_000_000, usedAmount: 0 },
    });
    expect(r.operatingIncome?.threshold).toBe(0);
    expect(r.operatingIncome?.penalty).toBe(0);
  });
});

describe("PN-2 — §78⑨2호: 매각대금 1년 30%·2년 60% (상증령 §38⑦)", () => {
  it("1년·2년 기준금액이 각각 30%·60%다", () => {
    const r = calcPublicInterestPenalty({ saleProceeds: SALE });
    expect(r.saleProceeds?.threshold1y).toBe(300_000_000);
    expect(r.saleProceeds?.threshold2y).toBe(600_000_000);
  });

  it("🔑 연도별로 각각 미달사용액 × 10% (집행기준 48-38-7 표는 행을 나눈다)", () => {
    const r = calcPublicInterestPenalty({ saleProceeds: SALE });
    expect(r.saleProceeds?.shortfall1y).toBe(100_000_000); // 3억 − 2억
    expect(r.saleProceeds?.shortfall2y).toBe(100_000_000); // 6억 − 5억
    expect(r.saleProceeds?.penalty1y).toBe(10_000_000);
    expect(r.saleProceeds?.penalty2y).toBe(10_000_000);
    expect(r.saleProceeds?.penalty).toBe(20_000_000);
  });

  it("⚠️ 부과 시기가 다르다는 안내가 붙는다 (1년차·2년차는 별개 사업연도)", () => {
    const r = calcPublicInterestPenalty({ saleProceeds: SALE });
    expect(r.warnings.some((w) => w.includes("부과 시기"))).toBe(true);
  });

  it("⭐ 3년 90%는 이 엔진이 아니라 §48②4호 **증여세**다 — 안내로 구분한다", () => {
    const r = calcPublicInterestPenalty({ saleProceeds: SALE });
    expect(r.warnings.some((w) => w.includes("4호"))).toBe(true);
  });
});

describe("PN-3 — §78⑨3호: 의무지출 기준금액 1% / 3%", () => {
  it("기본은 1% (법 §48②7호 본문)", () => {
    const r = calcPublicInterestPenalty({ mandatoryDistribution: MANDATORY });
    expect(r.mandatoryDistribution?.rateNumer).toBe(1);
    expect(r.mandatoryDistribution?.threshold).toBe(100_000_000);
    expect(r.mandatoryDistribution?.shortfall).toBe(60_000_000);
  });

  it("§16②2호가목 공익법인등이 발행주식총수등 10% 초과 보유면 3%", () => {
    const r = calcPublicInterestPenalty({
      mandatoryDistribution: { ...MANDATORY, exceedsTenPercentHolding: true },
    });
    expect(r.mandatoryDistribution?.rateNumer).toBe(3);
    expect(r.mandatoryDistribution?.threshold).toBe(300_000_000);
    expect(r.mandatoryDistribution?.shortfall).toBe(260_000_000);
  });
});

describe("PN-4 — ⭐ §48②7호 **가목** 법인의 3호 가산세는 200% (나목의 20배)", () => {
  it("나목: 10%", () => {
    const r = calcPublicInterestPenalty({ mandatoryDistribution: MANDATORY });
    expect(r.mandatoryDistribution?.penaltyRatePercent).toBe(10);
    expect(r.mandatoryDistribution?.penalty).toBe(6_000_000); // 6천만 × 10%
  });

  it("가목: 200%", () => {
    const r = calcPublicInterestPenalty({
      mandatoryDistribution: { ...MANDATORY, isClauseGaCorp: true },
    });
    expect(r.mandatoryDistribution?.penaltyRatePercent).toBe(200);
    expect(r.mandatoryDistribution?.penalty).toBe(120_000_000); // 6천만 × 200%
  });

  it("🔑 200% 특례는 **3호에만** 붙는다 — 가목 법인이어도 1호·2호는 10%", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: OPERATING,
      saleProceeds: SALE,
      mandatoryDistribution: { ...MANDATORY, isClauseGaCorp: true },
    });
    expect(r.operatingIncome?.penalty).toBe(2_000_000); // 10% 그대로
    expect(r.saleProceeds?.penalty).toBe(20_000_000); // 10% 그대로
  });
});

describe("PN-5 — ⭐ §78⑨ 후단: 1호와 3호는 **더 큰 금액**, 2호는 합산", () => {
  it("1호·3호 동시 해당 → 큰 쪽만 (2,000,000 vs 6,000,000 → 6,000,000)", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: OPERATING,
      mandatoryDistribution: MANDATORY,
    });
    expect(r.clause1And3Applied).toBe("clause3");
    expect(r.clause1And3Penalty).toBe(6_000_000);
    // ❌ 합산(8,000,000)이 아니다
    expect(r.totalPenalty).toBe(6_000_000);
  });

  it("1호가 더 크면 1호가 채택된다 (양성 대조군 — 방향이 고정돼 있지 않다)", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: { income: 1_000_000_000, usedAmount: 0 }, // 기준 8억 → 8천만
      mandatoryDistribution: MANDATORY, // 6백만
    });
    expect(r.clause1And3Applied).toBe("clause1");
    expect(r.clause1And3Penalty).toBe(80_000_000);
  });

  it("🔑 2호는 택일 대상이 아니라 **합산**된다 (후단이 1호·3호만 지목)", () => {
    const r = calcPublicInterestPenalty({
      operatingIncome: OPERATING,
      saleProceeds: SALE,
      mandatoryDistribution: MANDATORY,
    });
    // max(2백만, 6백만) + 2천만 = 2,600만
    expect(r.totalPenalty).toBe(26_000_000);
  });

  it("3호만 해당하면 택일이 발생하지 않는다", () => {
    const r = calcPublicInterestPenalty({ mandatoryDistribution: MANDATORY });
    expect(r.clause1And3Applied).toBe("clause3");
    expect(r.totalPenalty).toBe(6_000_000);
  });

  it("미해당 호는 결과에 없고 합계에도 들어가지 않는다", () => {
    const r = calcPublicInterestPenalty({ saleProceeds: SALE });
    expect(r.operatingIncome).toBeUndefined();
    expect(r.mandatoryDistribution).toBeUndefined();
    expect(r.clause1And3Applied).toBe("none");
    expect(r.totalPenalty).toBe(20_000_000);
  });
});

describe("PN-6 — 증여세 규정이 가산세에 섞이지 않는다", () => {
  it("⭐ §55② 과세최저한(50만원)은 **증여세** 규정이라 가산세에는 적용되지 않는다", () => {
    // 미달 30만원 → 가산세 3만원. 증여세였다면 0이 됐을 구간이다.
    const r = calcPublicInterestPenalty({
      operatingIncome: { income: 1_000_000, usedAmount: 500_000 },
    });
    expect(r.operatingIncome?.shortfall).toBe(300_000); // 80만 − 50만
    expect(r.operatingIncome?.penalty).toBe(30_000);
    expect(r.totalPenalty).toBe(30_000);
  });

  it("이자상당액을 가산하지 않는다", () => {
    const r = calcPublicInterestPenalty({ operatingIncome: OPERATING });
    expect(r.totalPenalty).toBe(r.operatingIncome!.penalty);
  });
});

describe("PN-7 — 입력 없음", () => {
  it("아무 호도 해당하지 않으면 0", () => {
    const r = calcPublicInterestPenalty({});
    expect(r.totalPenalty).toBe(0);
    expect(r.clause1And3Applied).toBe("none");
  });
});
