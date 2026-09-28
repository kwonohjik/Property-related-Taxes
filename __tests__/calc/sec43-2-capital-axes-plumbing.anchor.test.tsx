/**
 * §43② 자본거래 4축 배관 — 선행 이익 입력이 폼 → ④ → ⑫ → 엔진에 닿는가, ⑤·④·⑧이 같은 조건을 쓰는가.
 * 엔진 규칙은 `__tests__/tax-engine/gift-deemed/sec43-2-capital-axes.anchor.test.ts`. 설계 `docs/00-pm/gift43-2-capital-axes.plan.md`.
 * 모든 픽스처는 ⑧·⑫를 통과하고, 선행 이익이 없으면 기준금액 바로 아래라 미적용이다(실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { ScPriorTxRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import { MergerFields } from "@/components/calc/deemed-gift/merger-form";
import { ContributionFields } from "@/components/calc/deemed-gift/contribution-form";
import { CapitalDecreaseFields, ConvertibleBondFields } from "@/components/calc/deemed-gift/capital-forms";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const row = (benefit: string, date = "2025-09-01"): ScPriorTxRow[] => [{ id: "p1", date, benefit, label: "" }];
const B: DeemedFormState = { ...INITIAL_DEEMED, giftDate: "2026-03-02" };

/** route와 같은 순서 — ④ → JSON 왕복 → ⑫ → 엔진 */
function endToEnd(form: DeemedFormState) {
  const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(form)));
  const parsed = deemedGiftInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return calcDeemedGift(parsed.data as DeemedGiftInput)!;
}
const bodyOf = (form: DeemedFormState) => buildDeemedGiftInput(form) as unknown as Record<string, unknown>;

// ── §38 합병 ──
const MRG_SINGLE: DeemedFormState = {
  ...B, type: "merger", mrgCaseType: "stock", mrgMergedPriceMode: "direct", mrgMergedPrice: "15,000",
  mrgOvervaluedPrice: "12,000", mrgPreShares: "100", mrgExchangedShares: "100", mrgMajorShares: "80,000",
}; // 240,000,000 · 기준 3억
const MRG_NS: DeemedFormState = { ...B, type: "merger", mrgCaseType: "non_stock", mrgFaceValue: "5,000", mrgOvervaluedPrice: "3,000", mrgMajorShares: "100,000" }; // 2억
const MRG_MATRIX: DeemedFormState = {
  ...B, type: "merger", mrgCaseType: "stock", mrgUseShareholders: true, mrgOvervaluedPrice: "12,000", mrgUnderSharePrice: "23,400",
  mrgPostMergerTotalShares: "380,000", mrgExchangedShares: "280,000", mrgExchangeNumer: "1", mrgExchangeDenom: "1",
  mrgOverShareholders: [{ name: "갑", shares: "80,000" }, { name: "병", shares: "200,000" }],
  mrgUnderShareholders: [{ name: "을", shares: "100,000" }],
}; // 갑 240,000,000 미적용 · 병 600,000,000

describe("§38 합병 배관", () => {
  it("[PL-M1] 🔴 단일 주식교부: 선행 합병 행이 엔진에 닿는다 — 240,000,000 과세", () => {
    const r = endToEnd({ ...MRG_SINGLE, mrgPriorSameClauseRows: row("100,000,000") });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(240_000_000);
  });
  it("[PL-M1+] 짝 — 선행 행이 없으면 0", () => {
    expect(endToEnd(MRG_SINGLE).deemedGiftValue).toBe(0);
  });
  it("[PL-M2] 🔴 주식 외 재산 교부도 같은 표를 쓴다 — 2억 과세", () => {
    expect(endToEnd({ ...MRG_NS, mrgPriorSameClauseRows: row("120,000,000") }).deemedGiftValue).toBe(200_000_000);
  });
  it("[PL-M3] 🔴 매트릭스: 갑 행 선행 이익 → 갑 과세, 합계 840,000,000", () => {
    const f = { ...MRG_MATRIX, mrgOverShareholders: [{ name: "갑", shares: "80,000", priorSameClauseGain: "100,000,000" }, { name: "병", shares: "200,000" }] };
    expect(endToEnd(f).deemedGiftValue).toBe(840_000_000);
  });
  it("[PL-M3+] 매트릭스 모드면 남아 있는 단일 표 행을 보내지 않는다 · 단일 모드면 행 칸을 보내지 않는다", () => {
    expect(bodyOf({ ...MRG_MATRIX, mrgPriorSameClauseRows: row("100,000,000") }).priorSameClauseGains).toBeUndefined();
    const single = bodyOf({ ...MRG_SINGLE, mrgOverShareholders: [{ name: "갑", shares: "1", priorSameClauseGain: "100,000,000" }] });
    expect(single.shareholders).toBeUndefined();
  });
});

// ── §39의2 감자 ──
const CD_LOW: DeemedFormState = { ...B, type: "capital_decrease", cdCaseType: "low", cdSharePrice: "10,000", cdRedemptionPrice: "8,000", cdTotalShares: "200,000", cdMajorRatioPct: "50", cdRelatedShares: "200,000" }; // 2억
const CD_MULTI: DeemedFormState = {
  ...B, type: "capital_decrease", cdMode: "multi", cdSharePrice: "10,000", cdPreTotalShares: "1,000,000", cdFaceValue: "5,000",
  cdShareholders: [
    { id: "a", name: "갑", preShares: "300,000", redeemedShares: "200,000", redemptionPrice: "8,000", relationGroup: "g" },
    { id: "b", name: "을", preShares: "400,000", redeemedShares: "0", redemptionPrice: "", relationGroup: "g" },
    { id: "c", name: "병", preShares: "300,000", redeemedShares: "0", redemptionPrice: "", relationGroup: "h" },
  ],
}; // 을 잠재 2억 · 기준 3억

describe("§39의2 감자 배관", () => {
  it("[PL-D1] 🔴 단일 저가: 선행 감자 행 → 2억 과세", () => {
    expect(endToEnd({ ...CD_LOW, cdPriorSameClauseRows: row("150,000,000") }).deemedGiftValue).toBe(200_000_000);
  });
  it("[PL-D2] 🔴 멀티: 을 행 선행 이익 → 을 2억 과세", () => {
    const rows = CD_MULTI.cdShareholders.map((s) => (s.id === "b" ? { ...s, priorSameClauseGain: "150,000,000" } : s));
    expect(endToEnd({ ...CD_MULTI, cdShareholders: rows }).deemedGiftValue).toBe(200_000_000);
  });
  it("[PL-D2+] 멀티 모드면 단일 표 행을 보내지 않는다 · 짝: 멀티 선행 없으면 0", () => {
    expect(bodyOf({ ...CD_MULTI, cdPriorSameClauseRows: row("150,000,000") }).priorSameClauseGains).toBeUndefined();
    expect(endToEnd(CD_MULTI).deemedGiftValue).toBe(0);
  });
});

// ── §39의3 현물출자 ──
const CON_HIGH: DeemedFormState = { ...B, type: "contribution", conCaseType: "high", conPrePrice: "10,000", conPreShares: "100,000", conNewPrice: "12,000", conContributedShares: "100,000", conAllocatedShares: "200,000", conRelatedRatioPct: "100" }; // 2억
const CON_ROSTER: DeemedFormState = {
  ...CON_HIGH, conRelatedRatioPct: "",
  conParties: [{ name: "갑", shares: "60,000", relation: "father" }, { name: "을", shares: "40,000", relation: "mother" }],
} as DeemedFormState; // 갑 1.2억 · 을 0.8억

describe("§39의3 현물출자 배관", () => {
  it("[PL-C1] 🔴 고가(명부 없음): 선행 행 → 2억 과세", () => {
    expect(endToEnd({ ...CON_HIGH, conPriorSameClauseRows: row("150,000,000") }).deemedGiftValue).toBe(200_000_000);
  });
  it("[PL-C2] 🔴 고가 명부: 갑 행 선행 2억 → 1.2억 과세", () => {
    const parties = CON_ROSTER.conParties!.map((p, i) => (i === 0 ? { ...p, priorSameClauseGain: "200,000,000" } : p));
    expect(endToEnd({ ...CON_ROSTER, conParties: parties }).deemedGiftValue).toBe(120_000_000);
  });
  it("[PL-C3] 저가는 금액기준이 없다 — 표 행도 명부 행 칸도 보내지 않는다", () => {
    const low = { ...CON_HIGH, conCaseType: "low" as const, conPriorSameClauseRows: row("150,000,000") };
    expect(bodyOf(low).priorSameClauseGains).toBeUndefined();
    const lowRoster = { ...CON_ROSTER, conCaseType: "low" as const, conParties: [{ name: "갑", shares: "60,000", relation: "father" as const, priorSameClauseGain: "1" }] };
    expect((bodyOf(lowRoster).parties as { priorSameClauseGain?: number }[])[0].priorSameClauseGain).toBeUndefined();
  });
});

// ── §40 전환사채 ──
const CB_ACQ: DeemedFormState = { ...B, type: "convertible_bond", cbCaseType: "acquisition", cbMarketValue: "1,000,000,000", cbAcquisitionPrice: "950,000,000" }; // 5천만 · 1억
const CB_REV: DeemedFormState = { ...B, type: "convertible_bond", cbCaseType: "conversion_reverse", cbPreConvPrice: "10,000", cbPreConvShares: "100,000", cbConversionPrice: "20,000", cbIncreasedShares: "10,000", cbRelatedPreRatioPct: "50" };

describe("§40 전환사채 배관", () => {
  it("[PL-B1] 🔴 1호 인수: 선행 행 → 5천만 과세", () => {
    expect(endToEnd({ ...CB_ACQ, cbPriorSameClauseRows: row("60,000,000") }).deemedGiftValue).toBe(50_000_000);
  });
  it("[PL-B2] 2호 라목(기준 0원)은 표 행을 보내지 않는다", () => {
    expect(bodyOf({ ...CB_REV, cbPriorSameClauseRows: row("60,000,000") }).priorSameClauseGains).toBeUndefined();
  });
});

describe("⑧ — 활성 표의 빈 행·소급 아닌 행을 막고, 비활성이면 막지 않는다(④와 같은 조건)", () => {
  const bad = row("", "");
  it.each([
    ["합병", { ...MRG_SINGLE, mrgPriorSameClauseRows: bad }, "선행 합병 1의 증여일"],
    ["감자", { ...CD_LOW, cdPriorSameClauseRows: bad }, "선행 감자 1의 증여일"],
    ["현물출자", { ...CON_HIGH, conPriorSameClauseRows: bad }, "선행 현물출자 1의 증여일"],
    ["전환사채", { ...CB_ACQ, cbPriorSameClauseRows: bad }, "선행 전환사채등 거래 1의 증여일"],
  ] as const)("[PL-V] %s", (_n, form, msg) => {
    expect(validateDeemedInput(form as DeemedFormState)).toContain(msg);
  });
  it("[PL-V+] 소급이 아닌 행(증여일 뒤)·빈 이익도 막는다", () => {
    expect(validateDeemedInput({ ...CD_LOW, cdPriorSameClauseRows: row("1", "2026-04-01") })).toContain("소급");
    expect(validateDeemedInput({ ...CD_LOW, cdPriorSameClauseRows: row("") })).toContain("선행 감자 1의 이익");
  });
  it("[PL-V-] 비활성(라목·매트릭스·멀티·저가 현물출자)이면 같은 빈 행을 막지 않는다 · 유효 행이면 통과", () => {
    expect(validateDeemedInput({ ...CB_REV, cbPriorSameClauseRows: bad })).toBeNull();
    expect(validateDeemedInput({ ...MRG_MATRIX, mrgPriorSameClauseRows: bad })).toBeNull();
    expect(validateDeemedInput({ ...CD_MULTI, cdPriorSameClauseRows: bad })).toBeNull();
    expect(validateDeemedInput({ ...CON_HIGH, conCaseType: "low", conPriorSameClauseRows: bad })).toBeNull();
    expect(validateDeemedInput({ ...MRG_SINGLE, mrgPriorSameClauseRows: row("100,000,000") })).toBeNull();
  });
});

describe("⑤ — 표·칸은 활성 조건에서만 보인다", () => {
  const noop = () => {};
  it("[PL-U1] 합병: 단일(주식·주식 외)은 표, 매트릭스는 수증자 행 칸", () => {
    const { rerender } = render(<MergerFields form={MRG_SINGLE} set={noop} />);
    expect(screen.getByTestId("mrg-prior-tx-table")).toBeInTheDocument();
    rerender(<MergerFields form={MRG_NS} set={noop} />);
    expect(screen.getByTestId("mrg-prior-tx-table")).toBeInTheDocument();
    rerender(<MergerFields form={MRG_MATRIX} set={noop} />);
    expect(screen.queryByTestId("mrg-prior-tx-table")).toBeNull();
    expect(screen.getByTestId("mrg-over-prior-0")).toBeInTheDocument();
  });
  it("[PL-U2] 감자: 단일은 표, 멀티는 행 칸", () => {
    const { rerender } = render(<CapitalDecreaseFields form={CD_LOW} set={noop} />);
    expect(screen.getByTestId("cd-prior-tx-table")).toBeInTheDocument();
    rerender(<CapitalDecreaseFields form={CD_MULTI} set={noop} />);
    expect(screen.queryByTestId("cd-prior-tx-table")).toBeNull();
    expect(screen.getByTestId("cd-sh-prior-1")).toBeInTheDocument();
  });
  it("[PL-U3] 현물출자: 고가는 표/명부 칸, 저가는 둘 다 없다", () => {
    const { rerender } = render(<ContributionFields form={CON_HIGH} set={noop} />);
    expect(screen.getByTestId("con-prior-tx-table")).toBeInTheDocument();
    rerender(<ContributionFields form={CON_ROSTER} set={noop} />);
    expect(screen.queryByTestId("con-prior-tx-table")).toBeNull();
    expect(screen.getByTestId("con-party-prior-0")).toBeInTheDocument();
    rerender(<ContributionFields form={{ ...CON_ROSTER, conCaseType: "low" }} set={noop} />);
    expect(screen.queryByTestId("con-party-prior-0")).toBeNull();
    rerender(<ContributionFields form={{ ...CON_HIGH, conCaseType: "low" }} set={noop} />);
    expect(screen.queryByTestId("con-prior-tx-table")).toBeNull();
  });
  it("[PL-U4] 전환사채: 라목만 표가 없다", () => {
    const { rerender } = render(<ConvertibleBondFields form={CB_ACQ} set={noop} />);
    expect(screen.getByTestId("cb-prior-tx-table")).toBeInTheDocument();
    rerender(<ConvertibleBondFields form={CB_REV} set={noop} />);
    expect(screen.queryByTestId("cb-prior-tx-table")).toBeNull();
  });
});
