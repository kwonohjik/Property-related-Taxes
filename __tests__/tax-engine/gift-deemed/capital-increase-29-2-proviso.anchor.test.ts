/**
 * 「상증령」§29② 본문 단서 — 「증자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다」.
 *
 * 착수 전 실측(2026-09-29):
 *   · 보충적평가 1주당 가액은 **음수가 될 수 없다** — 순자산가액 0원 이하 → 0원(「상증령」§55①),
 *     순손익액 가중평균 음수 → 영(「상증령」§56①). ⇒ 단서의 「영 이하」가 실제로 성립하는 것은 **정확히 0**이다
 *     (결손법인). 리뷰 표의 「순자산 음수 법인을 지원하면」은 전제가 틀렸다.
 *   · 그런데 ⑧이 증자 전 1주당 가액 **0을 「미입력」으로 차단**했다(단건·cap-table·전환주식 2시점).
 *     결손법인 고가증자(증자 전 0 · 인수가 90,000)는 엔진이 1,800,000,000으로 정상 계산하는데 화면에서 넣을 수 없었다.
 *   · 단서 영역(증자 전 0 · 인수가 0)에서 엔진 값은 이미 0이었으나 사유가 「기준금액 미만」·「인수가 이하」로 떴다 —
 *     근거가 단서가 아니었다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import { makeCapTableRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import type { CapitalIncreaseAllocationInput, DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

const PROVISO = /「상증령」§29② 단서/;

const ci = (direction: "low" | "high", subType: "forfeited_realloc" | "no_realloc", pre: number, nw: number, extra = {}) =>
  calcDeemedGift({
    type: "capital_increase", direction, subType,
    preIssuePrice: pre, preIssueShares: 1_000_000, newSharePrice: nw, issuedShares: 200_000, forfeitedShares: 24_000,
    relatedAcquiredShares: 24_000, ratioDenomShares: 24_000,
    ...extra,
  } as DeemedGiftInput);

describe("엔진 — 단서 영역(증자 전 0 · 증자 후 0)", () => {
  for (const [dir, sub] of [["low", "forfeited_realloc"], ["low", "no_realloc"], ["high", "forfeited_realloc"], ["high", "no_realloc"]] as const) {
    it(`[P292-1] ${dir}/${sub} — 이익 없음, 사유는 §29② 단서`, () => {
      const r = ci(dir, sub, 0, 0);
      expect(r.applied).toBe(false);
      expect(r.deemedGiftValue).toBe(0);
      expect(r.exclusionReason).toMatch(PROVISO);
    });
  }

  it("[P292-1+] 짝 — 증자 전 0이어도 인수가 90,000이면 증자 후 15,000 > 0 ⇒ 단서 밖, 고가 가목 1,800,000,000 과세", () => {
    const r = ci("high", "forfeited_realloc", 0, 90_000);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(1_800_000_000);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });

  it("[P292-2] 짝 — 단서는 **상장 단서 적용 후** 증자 후 가액으로 본다: 고가 Max(0, 종가평균 5,000) > 0 ⇒ 단서 밖", () => {
    const r = ci("high", "forfeited_realloc", 0, 0, { isListed: true, listedMarketAvg: 5_000 });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });

  it("[P292-2+] 짝 — 증자 전 양수(100,000)면 인수가 0이어도 단서 밖(증자 후 > 0)", () => {
    const r = ci("low", "forfeited_realloc", 100_000, 0);
    expect(r.applied).toBe(true);
    expect(r.exclusionReason ?? "").not.toMatch(PROVISO);
  });
});

describe("⑧ — 증자 전 1주당 가액 0은 정당한 평가액(「상증령」§55①·§56① 하한)이다: 공란만 막는다", () => {
  const LOW: DeemedFormState = {
    ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02", ciDirection: "low", ciSubType: "forfeited_realloc",
    ciPrePrice: "100,000", ciPreShares: "1,000,000", ciNewPrice: "90,000", ciIssuedShares: "200,000", ciForfeitedShares: "24,000",
  };
  it("[P292-3] 단건 — \"0\"은 통과, 공란은 차단(짝)", () => {
    expect(validateDeemedInput({ ...LOW, ciPrePrice: "0" })).toBeNull();
    expect(validateDeemedInput({ ...LOW, ciPrePrice: "" })).toBe("증자 전 1주당 평가가액을 입력하세요");
  });

  const rows = () => [
    { ...makeCapTableRow("A"), name: "A", preShares: "900,000", entitledShares: "180,000", subscribedShares: "0" },
    { ...makeCapTableRow("B"), name: "B", preShares: "100,000", entitledShares: "20,000", subscribedShares: "200,000", relatedTo: ["A"] },
  ];
  const CT: DeemedFormState = {
    ...INITIAL_DEEMED, type: "capital_increase_allocation", giftDate: "2026-03-02",
    ciAllocPrePrice: "100,000", ciAllocNewPrice: "90,000", ciAllocRows: rows(),
  };
  it("[P292-4] cap-table — 증자 전 가액·인수가 \"0\"은 통과, 공란은 차단(짝)", () => {
    expect(validateDeemedInput({ ...CT, ciAllocPrePrice: "0" })).toBeNull();
    expect(validateDeemedInput({ ...CT, ciAllocPrePrice: "0", ciAllocNewPrice: "0" })).toBeNull();
    expect(validateDeemedInput({ ...CT, ciAllocPrePrice: "" })).toBe("증자 전 1주당 평가가액을 입력하세요");
    expect(validateDeemedInput({ ...CT, ciAllocNewPrice: "" })).toBe("신주 1주당 인수가액을 입력하세요");
  });

  const CS: DeemedFormState = {
    ...INITIAL_DEEMED, type: "convertible_stock", giftDate: "2025-03-15",
    csConvPrePrice: "10000", csConvPreShares: "100000", csConvNewPrice: "5000", csConvIssuedShares: "50000", csConvForfeitedShares: "10000",
    csIssuePrePrice: "10000", csIssuePreShares: "100000", csIssueNewPrice: "7000", csIssueIssuedShares: "50000", csIssueForfeitedShares: "10000",
    csIssuanceDate: "2017-03-02",
  };
  it("[P292-5] 전환주식 — 두 시점 증자 전 가액 \"0\"은 통과, 공란은 차단(짝)", () => {
    expect(validateDeemedInput({ ...CS, csConvPrePrice: "0", csIssuePrePrice: "0" })).toBeNull();
    expect(validateDeemedInput({ ...CS, csConvPrePrice: "" })).toBe("전환 시점 증자 전 1주당 평가가액을 입력하세요");
    expect(validateDeemedInput({ ...CS, csIssuePrePrice: "" })).toBe("발행 시점 증자 전 1주당 평가가액을 입력하세요");
  });

  it("[P292-6] 왕복 — 단건 결손법인 고가증자(0 · 90,000)가 ⑧ → ④ → ⑫ → 엔진을 지나 1,800,000,000", () => {
    // 고가 가목 비율(§29②3호 다목) = 특수관계인이 인수한 실권주수 ÷ 실권주 총수 = 24,000/24,000 — 이익 불변
    const f: DeemedFormState = { ...LOW, ciDirection: "high", ciPrePrice: "0", ciRelatedAcquiredShares: "24,000", ciRatioDenomShares: "24,000" };
    expect(validateDeemedInput(f)).toBeNull();
    const p = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(f))));
    expect(p.success).toBe(true);
    expect(calcDeemedGift(p.success ? (p.data as DeemedGiftInput) : ({} as DeemedGiftInput)).deemedGiftValue).toBe(1_800_000_000);
  });

  it("[P292-7] cap-table 엔진 — 단서 영역(0 · 0)은 명부 전원의 증자 전·후 평가가 0이라 수증자 없음 / 짝: 0 · 90,000은 A 13,500,000,000", () => {
    const run = (pre: string, nw: string) => {
      const p = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput({ ...CT, ciAllocPrePrice: pre, ciAllocNewPrice: nw }))));
      if (!p.success) throw new Error(p.error.message);
      return calcCapitalIncreaseAllocation(p.data as unknown as CapitalIncreaseAllocationInput);
    };
    const zero = run("0", "0");
    expect(zero.perBeneficiary).toEqual([]);
    expect(zero.byShareholder.every((s) => s.preValuation === 0 && s.postValuation === 0)).toBe(true);
    expect(run("0", "90,000").perBeneficiary.find((b) => b.beneficiaryId === "A")?.total).toBe(13_500_000_000);
  });
});
