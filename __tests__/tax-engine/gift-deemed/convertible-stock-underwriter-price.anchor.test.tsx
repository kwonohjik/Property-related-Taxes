/**
 * §39①3호 전환주식 · 저가 다목 인수인 경유(「상증령」§29④) — 인수인 매입가는 **발행 시점 leg에만** 쓴다
 * (사용자 결정 2026-09-29: 고가 다목 제외 유지 · 전환주식은 발행 시점 적용).
 *
 * 규칙은 단건 증자(PR #1863)와 같다 — 매입가는 이익 차감항(「상증령」§29②1호 나목)에만, ㉯는 발행가.
 * 전환주식 이익 = 전환 시점 이익 − 발행 시점 이익(「상증령」§29②6호)이므로 발행 시점 차감항이 커지면
 * 발행 시점 이익이 줄고 최종 이익은 늘어난다.
 *   실측 산정 — 전환: 증자 전 10,000×100,000 · 전환가액 5,000 · 50,000주 → (8,333 − 5,000) × 50,000 = 166,650,000
 *              발행: 증자 전 10,000×100,000 · 발행가 7,000 · 50,000주 → ㉯ 9,000
 *                    매입가 없음 (9,000 − 7,000) × 50,000 = 100,000,000 → 최종 66,650,000(종전)
 *                    매입가 8,000 (9,000 − 8,000) × 50,000 =  50,000,000 → 최종 116,650,000
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { ConvertibleStockFields } from "@/components/calc/deemed-gift/convertible-stock-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const leg = (newSharePrice: number, extra: Record<string, unknown> = {}) => ({
  direction: "low", subType: "third_party",
  preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice, issuedShares: 50_000, forfeitedShares: 50_000,
  ...extra,
});
const cs = (conv: Record<string, unknown> = {}, issue: Record<string, unknown> = {}) =>
  calcDeemedGift({
    type: "convertible_stock",
    atConversion: { ...leg(5_000, conv), giftDate: new Date("2025-03-15") },
    atIssuance: { ...leg(7_000, issue), giftDate: new Date("2017-03-02") },
  } as DeemedGiftInput);

describe("엔진 — 발행 시점 leg만 매입가를 쓴다", () => {
  it("[CSU-1] 발행 시점 매입가 8,000 → 166,650,000 − 50,000,000 = 116,650,000", () => {
    expect(cs({}, { underwriterAcquisitionPrice: 8_000 }).deemedGiftValue).toBe(116_650_000);
  });

  it("[CSU-1+] 짝 — 매입가가 없으면 종전 66,650,000", () => {
    expect(cs().deemedGiftValue).toBe(66_650_000);
  });

  it("[CSU-2] 전환 시점 leg에 매입가가 실려 와도 무시한다(발행 시점 적용 결정) — 66,650,000", () => {
    expect(cs({ underwriterAcquisitionPrice: 8_000 }).deemedGiftValue).toBe(66_650_000);
  });
});

const FORM: DeemedFormState = {
  ...INITIAL_DEEMED, type: "convertible_stock", giftDate: "2025-03-15", csIssuanceDate: "2017-03-02",
  csDirection: "low", csSubType: "third_party",
  csConvPrePrice: "10000", csConvPreShares: "100000", csConvNewPrice: "5000", csConvIssuedShares: "50000", csConvForfeitedShares: "50000",
  csIssuePrePrice: "10000", csIssuePreShares: "100000", csIssueNewPrice: "7000", csIssueIssuedShares: "50000", csIssueForfeitedShares: "50000",
};

describe("⑧ → ④ → ⑫ → 엔진", () => {
  it("[CSU-3] 폼 발행 시점 매입가 \"8,000\" → 116,650,000 · 공란이면 66,650,000(선택 칸)", () => {
    const through = (f: DeemedFormState) => {
      expect(validateDeemedInput(f)).toBeNull();
      const p = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(f))));
      expect(p.success).toBe(true);
      return calcDeemedGift(p.success ? (p.data as DeemedGiftInput) : ({} as DeemedGiftInput)).deemedGiftValue;
    };
    expect(through({ ...FORM, csIssueUnderwriterPrice: "8,000" })).toBe(116_650_000);
    expect(through({ ...FORM, csIssueUnderwriterPrice: "" })).toBe(66_650_000);
  });

  it("[CSU-4] ④ — 발행 시점 leg에만 싣고, 고가·다목 아님이면 싣지 않는다(잔존값 차단)", () => {
    const get = (f: DeemedFormState) => buildDeemedGiftInput(f) as unknown as { atConversion: object; atIssuance: object };
    const low = get({ ...FORM, csIssueUnderwriterPrice: "8,000" });
    expect(low.atIssuance).toHaveProperty("underwriterAcquisitionPrice", 8_000);
    expect(low.atConversion).not.toHaveProperty("underwriterAcquisitionPrice", 8_000);
    expect(get({ ...FORM, csIssueUnderwriterPrice: "8,000", csDirection: "high" }).atIssuance).not.toHaveProperty("underwriterAcquisitionPrice", 8_000);
    expect(get({ ...FORM, csIssueUnderwriterPrice: "8,000", csSubType: "forfeited_realloc" }).atIssuance).not.toHaveProperty("underwriterAcquisitionPrice", 8_000);
  });
});

describe("⑤ — 저가 다목에서 발행 시점 섹션에만 칸이 하나 보인다", () => {
  it("[CSU-5] 저가 다목 → 1개 / 고가 다목·저가 가목 → 0개", () => {
    const { rerender } = render(<ConvertibleStockFields form={FORM} set={() => {}} />);
    expect(screen.getAllByLabelText("인수인으로부터 취득한 1주당 가액")).toHaveLength(1);
    rerender(<ConvertibleStockFields form={{ ...FORM, csDirection: "high" }} set={() => {}} />);
    expect(screen.queryAllByLabelText("인수인으로부터 취득한 1주당 가액")).toHaveLength(0);
    rerender(<ConvertibleStockFields form={{ ...FORM, csSubType: "forfeited_realloc" }} set={() => {}} />);
    expect(screen.queryAllByLabelText("인수인으로부터 취득한 1주당 가액")).toHaveLength(0);
  });
});
