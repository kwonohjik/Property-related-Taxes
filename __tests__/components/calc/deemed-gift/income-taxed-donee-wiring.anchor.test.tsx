/**
 * 「상증법」§4의2③ 계산 단위 토글 — ⑤ 노출 · ④ 탑재 · ⑫ Zod · 폼↔엔진 판정 parity (7-16).
 *
 * 범위는 수증자 1명(한 묶음) 입력이다. 명부 모드에서는 토글 대신 「반영되지 않는다」 안내를 보인다 —
 * 조용히 빠지면 사용자는 명부 모드에서도 ③이 반영된 줄 안다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeemedDetailModal } from "@/components/calc/deemed-gift/DeemedDetailModal";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { buildDeemedGiftInput, incomeTaxedToggleVisible } from "@/lib/calc/gift-deemed-api";
import { incomeTaxedDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { INCOME_TAXED_APPLIED } from "../../../tax-engine/gift-deemed/income-taxed-donee.fixture";

afterEach(cleanup);

const cdRow = (id: string, redeemed: string) => ({ id, name: id, preShares: "100", redeemedShares: redeemed, redemptionPrice: "1", relationGroup: "A" });
const scRow = { id: "g", name: "갑", relation: "", shares: "1", isDonor: false, isRelated: true, isCorporate: false };
/** 검증을 통과하는 모양의 모드 조합 */
const MODES: Record<string, Partial<DeemedFormState>> = {
  bargain_transfer: { type: "bargain_transfer" },
  merger_single: { type: "merger", mrgUseShareholders: false },
  merger_matrix: { type: "merger", mrgUseShareholders: true, mrgOverShareholders: [{ name: "갑", shares: "1" }], mrgUnderShareholders: [{ name: "을", shares: "1" }] },
  cd_single: { type: "capital_decrease", cdMode: "single" },
  cd_multi: { type: "capital_decrease", cdMode: "multi", cdShareholders: [cdRow("갑", "100"), cdRow("병", "0")] },
  con_low_roster: { type: "contribution", conCaseType: "low", conParties: [{ name: "을", shares: "1", relation: "" }] },
  con_high_roster: { type: "contribution", conCaseType: "high", conParties: [{ name: "을", shares: "1", relation: "" }] },
  capital_increase: { type: "capital_increase" },
  convertible_stock: { type: "convertible_stock" },
  sc_single: { type: "specific_corp", scMode: "single" },
  sc_roster: { type: "specific_corp", scMode: "roster", scShareholders: [scRow] as never },
  excess_dividend: { type: "excess_dividend" },
  nominee_trust: { type: "nominee_trust" },
  related_corp: { type: "related_corp" },
  capital_increase_allocation: { type: "capital_increase_allocation" },
};
const VISIBLE = ["bargain_transfer", "merger_single", "cd_single", "con_low_roster", "capital_increase", "convertible_stock", "sc_single"];
/** 명부 모드 — 토글 대신 안내 */
const ROSTER_NOTICE = ["merger_matrix", "cd_multi", "con_high_roster", "sc_roster", "related_corp", "capital_increase_allocation"];
const form = (k: string, on = false) => ({ ...INITIAL_DEEMED, giftDate: "2025-06-30", ...MODES[k], doneeIncomeTaxed: on }) as DeemedFormState;
/** 라우터를 거치는 폼(cap-table은 별도 진입점이라 엔진 판정 대상이 아니다) */
const ROUTED = Object.keys(MODES).filter((k) => k !== "capital_increase_allocation");

describe("판정 — 폼(⑤④) ↔ 엔진(라우터) parity", () => {
  it.each(Object.keys(MODES))("[ITW-0] %s — 폼 판정", (k) => {
    expect(incomeTaxedToggleVisible(form(k))).toBe(VISIBLE.includes(k));
  });
  it.each(ROUTED)("[ITW-0b] %s — 엔진 판정(페이로드)이 폼 판정과 같다", (k) => {
    expect(incomeTaxedDoneeGateApplies(buildDeemedGiftInput(form(k)))).toBe(VISIBLE.includes(k));
  });
});

describe("⑤ 모달 — 토글 또는 명부 모드 안내", () => {
  it.each(Object.keys(MODES))("[ITW-1] %s", (k) => {
    render(<DeemedDetailModal open onOpenChange={() => {}} form={form(k)} set={vi.fn()} />);
    expect(screen.queryByTestId("deemed-donee-income-taxed") !== null).toBe(VISIBLE.includes(k));
    expect(screen.queryByTestId("deemed-donee-income-taxed-roster-notice") !== null).toBe(ROSTER_NOTICE.includes(k));
  });

  it("[ITW-2] 토글을 누르면 ③ 필드만 켜진다 — 영리법인 필드를 건드리지 않는다", () => {
    const set = vi.fn();
    render(<DeemedDetailModal open onOpenChange={() => {}} form={form("bargain_transfer")} set={set} />);
    fireEvent.click(screen.getByRole("switch", { name: /소득세·법인세 부과/ }));
    expect(set).toHaveBeenCalledWith({ doneeIncomeTaxed: true });
  });
});

describe("④ API — 필드 탑재", () => {
  it.each(Object.keys(MODES))("[ITW-3] %s — 켜 둔 값은 토글이 보이는 모드에서만 실린다", (k) => {
    const p = buildDeemedGiftInput(form(k, true)) as unknown as Record<string, unknown>;
    expect(p.doneeIncomeOrCorporateTaxed === true).toBe(VISIBLE.includes(k));
  });
});

describe("⑫ Zod — 왕복", () => {
  it.each(Object.keys(INCOME_TAXED_APPLIED))("[ITW-4] %s — Zod를 지나 엔진이 제외한다", (k) => {
    const r = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify({ ...INCOME_TAXED_APPLIED[k], doneeIncomeOrCorporateTaxed: true })));
    expect(r.success).toBe(true);
    const data = r.data as Record<string, unknown>;
    expect(data.doneeIncomeOrCorporateTaxed).toBe(true);
  });

  it("[ITW-5] 긍정 짝: §41의2·§45의2·§45의3 스키마는 필드를 strip한다", () => {
    const ed = deemedGiftInputSchema.safeParse({
      type: "excess_dividend", doneeIncomeOrCorporateTaxed: true,
      // 최대주주등·특수관계인 행 모두 필요 — ⑧ F2·F3(2026-09-30 ⑫ 필수화 #29)
      shareholders: [
        { id: "A", role: "major_shareholder", ownershipRatio: { numer: 1, denom: 2 }, actualDividend: 0 },
        { id: "B", role: "related_party", ownershipRatio: { numer: 1, denom: 2 }, actualDividend: 100_000_000 },
      ],
      dividendDate: "2025-06-30", incomeTaxMode: "undetermined",
    });
    expect(ed.success).toBe(true);
    expect(ed.data).not.toHaveProperty("doneeIncomeOrCorporateTaxed");
    const nt = deemedGiftInputSchema.safeParse({ type: "nominee_trust", hasTaxAvoidancePurpose: true, propertyValue: 1_000_000_000, doneeIncomeOrCorporateTaxed: true });
    expect(nt.success).toBe(true);
    expect(nt.data).not.toHaveProperty("doneeIncomeOrCorporateTaxed");
  });

  it("[ITW-6] 폼 → API → JSON → Zod → 엔진 — §35 제외 사유 ③", () => {
    const f = { ...INITIAL_DEEMED, type: "bargain_transfer", giftDate: "2025-06-30", doneeIncomeTaxed: true, bargMarketValue: "1000000000", bargPrice: "600000000", bargRelated: true } as unknown as DeemedFormState;
    const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(f)));
    const parsed = deemedGiftInputSchema.parse(body) as unknown as DeemedGiftInput;
    const r = calcDeemedGift(parsed);
    expect(r.exclusionReason).toMatch(/§4의2③/);
  });
});
