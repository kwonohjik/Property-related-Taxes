/**
 * 「상증법」§39①1호 다목 괄호 · 「상증령」§29④ — 인수인 경유 인수·취득의 「신주 1주당 인수가액」.
 *
 * 사용자 결정(2026-09-29): 인수인에게서 산 가격을 인수가액으로 보되, **이익 차감항(「상증령」§29②1호 나목)에만**
 * 쓰고 증자 후 1주당 가액(㉯ — 1호 가목 산식의 유입액)은 회사에 실제 들어온 **발행가**로 계산한다.
 *   실측 산정(증자 전 10,000 × 100,000주 · 발행가 5,000 · 신주 50,000 · 인수인 매입가 6,000):
 *     ㉯ = (10,000×100,000 + 5,000×50,000) ÷ 150,000 = 8,333
 *     종전(매입가 입력 경로 없음 — 발행가로 차감) 166,650,000 / 차감만 매입가 116,650,000 /
 *     두 곳 모두 매입가였다면 133,300,000(㉯ 8,666) — 사용자가 앞의 둘 중 「차감만」을 택했다.
 *   · 적용 범위는 **저가 다목**뿐이다. 고가 다목(§29②5호)의 이익은 기존 주주가 얻는 것이고 그 원천은 회사 유입액
 *     (발행가)이라, 제3자가 인수인에게 더 낸 몫은 주주에게 가지 않는다 ⇒ 고가에는 쓰지 않는다.
 *   · 전환주식(§39①3호)은 두 시점 중 어느 leg에 붙는지 별도 판단이 필요해 이번 범위 밖이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { CapitalIncreaseFields } from "@/components/calc/deemed-gift/capital-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const ci = (extra: Record<string, unknown> = {}) =>
  calcDeemedGift({
    type: "capital_increase", direction: "low", subType: "third_party",
    preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 50_000,
    ...extra,
  } as DeemedGiftInput);

describe("엔진 — 저가 다목 차감항만 인수인 매입가", () => {
  it("[UW-1] 매입가 6,000 → (8,333 − 6,000) × 50,000 = 116,650,000 · ㉯는 발행가 기준 8,333 그대로", () => {
    const r = ci({ underwriterAcquisitionPrice: 6_000 });
    expect(r.deemedGiftValue).toBe(116_650_000);
    expect(r.breakdown.find((s) => s.label === "증자 후 1주당 가액")?.amount).toBe(8_333);
    expect(r.breakdown.find((s) => s.label === "인수인으로부터 취득한 1주당 가액")?.amount).toBe(6_000);
  });

  it("[UW-1+] 짝 — 미입력이면 종전 그대로 (8,333 − 5,000) × 50,000 = 166,650,000, 매입가 행 없음", () => {
    const r = ci();
    expect(r.deemedGiftValue).toBe(166_650_000);
    expect(r.breakdown.some((s) => s.label === "인수인으로부터 취득한 1주당 가액")).toBe(false);
  });

  it("[UW-2] 매입가가 ㉯ 이상이면 이익 없음(차감항이 매입가라서)", () => {
    expect(ci({ underwriterAcquisitionPrice: 8_333 }).deemedGiftValue).toBe(0);
  });

  it("[UW-3] 짝 — 다목이 아니면(가목) 매입가를 무시한다", () => {
    expect(ci({ subType: "forfeited_realloc", underwriterAcquisitionPrice: 6_000 }).deemedGiftValue).toBe(166_650_000);
  });
});

const FORM: DeemedFormState = {
  ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02", ciDirection: "low", ciSubType: "third_party",
  ciPrePrice: "10,000", ciPreShares: "100,000", ciNewPrice: "5,000", ciIssuedShares: "50,000", ciForfeitedShares: "50,000",
};
const through = (f: DeemedFormState) => {
  expect(validateDeemedInput(f)).toBeNull();
  const p = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(f))));
  expect(p.success).toBe(true);
  return calcDeemedGift(p.success ? (p.data as DeemedGiftInput) : ({} as DeemedGiftInput)).deemedGiftValue;
};

describe("⑧ → ④ → ⑫ → 엔진 왕복", () => {
  it("[UW-4] 폼 매입가 \"6,000\" → 116,650,000", () => {
    expect(through({ ...FORM, ciUnderwriterPrice: "6,000" })).toBe(116_650_000);
  });

  it("[UW-4+] 짝 — 비우면 166,650,000(선택 칸 · 차단 없음)", () => {
    expect(through({ ...FORM, ciUnderwriterPrice: "" })).toBe(166_650_000);
  });

  it("[UW-5] 잔존값 — 목을 가목으로 바꾸거나 고가로 바꾸면 ④가 매입가를 보내지 않는다", () => {
    expect(buildDeemedGiftInput({ ...FORM, ciUnderwriterPrice: "6,000", ciSubType: "forfeited_realloc" })).not.toHaveProperty("underwriterAcquisitionPrice", 6_000);
    expect(buildDeemedGiftInput({ ...FORM, ciUnderwriterPrice: "6,000", ciDirection: "high" })).not.toHaveProperty("underwriterAcquisitionPrice", 6_000);
  });
});

describe("⑤ — 저가 다목에서만 칸이 보인다", () => {
  it("[UW-6] 저가 다목 → 보임 / 저가 가목·고가 다목 → 안 보임", () => {
    const { rerender } = render(<CapitalIncreaseFields form={FORM} set={() => {}} />);
    expect(screen.getByLabelText("인수인으로부터 취득한 1주당 가액")).toBeInTheDocument();
    rerender(<CapitalIncreaseFields form={{ ...FORM, ciSubType: "forfeited_realloc" }} set={() => {}} />);
    expect(screen.queryByLabelText("인수인으로부터 취득한 1주당 가액")).toBeNull();
    rerender(<CapitalIncreaseFields form={{ ...FORM, ciDirection: "high" }} set={() => {}} />);
    expect(screen.queryByLabelText("인수인으로부터 취득한 1주당 가액")).toBeNull();
  });
});
