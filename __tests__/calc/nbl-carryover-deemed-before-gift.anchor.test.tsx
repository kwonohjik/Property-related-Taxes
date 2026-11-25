/**
 * anchor — 이월과세 토지 × 양도일 의제일 ≤ 증여 등기접수일 「확인 필요」 고지 (사용자 결정 2026-11-25 Low-1).
 *
 * CB-1 술어 격자(단일 소스 `nblCarryoverDeemedBeforeGiftNote`)
 * CB-2 실측 전제 — 이 조건에서 메뉴 B 판정은 소유 0일 · A는 정상(입력을 막으면 A까지 막힌다 → 고지만)
 * CB-3 화면 — 판정 메뉴 B 카드 · 단건 계산기 · ValuationDetailCards(다건·일괄) 모두 같은 고지 · 판정값 불변
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { render, cleanup } from "@testing-library/react";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { CARRYOVER_BASE, landForm, postMenu, type Loose } from "./_helpers/nbl-judgment-menu";
import { buildNblJudgmentApiBody } from "@/lib/calc/non-business-land-judgment-api";
import { nblCarryoverDeemedBeforeGiftNote } from "@/lib/calc/nbl-carryover-deemed-before-gift";
import { NblJudgmentResultView } from "@/components/calc/results/NblJudgmentResultView";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const NOTE = '[data-testid="nbl-carryover-deemed-before-gift-note"]';

/** 증여자 취득 2012-01-01 → 공매 최초 공매일 2015-01-01 → 증여 등기 2022-06-01 → 양도 2024-06-01 (동기화 점검 Low-1 재현) */
const COB: Partial<AssetForm> = {
  ...CARRYOVER_BASE,
  nblDeemedTransferReason: "public_sale",
  nblDeemedTransferDate: "2015-01-01",
} as Partial<AssetForm>;
const cobForm = (over: Partial<AssetForm> = {}) => landForm({ ...COB, ...over } as Partial<AssetForm>);
const gift = (d: string) => ({ carryover: { ...(CARRYOVER_BASE.carryover as object), giftRegistryDate: d } as never });

describe("CB-1 술어 격자", () => {
  const a = (over: Partial<AssetForm> = {}) => cobForm(over).assets[0];
  it("의제일 < 증여 등기접수일 → 고지(두 날짜를 적는다)", () => {
    const note = nblCarryoverDeemedBeforeGiftNote(a());
    expect(note).toContain("2015-01-01");
    expect(note).toContain("2022-06-01");
    expect(note).toContain("확인이 필요합니다");
  });
  it("의제일 = 증여 등기접수일 → 고지(엔진도 0일)", () => {
    expect(nblCarryoverDeemedBeforeGiftNote(a({ nblDeemedTransferDate: "2022-06-01" }))).toBeDefined();
  });
  it.each([
    ["의제일이 증여 등기접수일 뒤", { nblDeemedTransferDate: "2023-01-01" }],
    ["이월과세 아님(일반 증여)", { acquisitionCause: "gift" }],
    ["의제 사유 없음", { nblDeemedTransferReason: "none" }],
    ["의제일 비어 있음", { nblDeemedTransferDate: "" }],
    ["증여 등기접수일 비어 있음", gift("")],
    ["양도일 의제를 읽지 않는 지목(주택부수토지)", { nblLandType: "housing_site" }],
  ] as const)("%s → 고지 없음", (_l, over) => {
    expect(nblCarryoverDeemedBeforeGiftNote(a(over as Partial<AssetForm>))).toBeUndefined();
  });
});

describe("CB-2 실측 전제 — B는 0일, A는 정상", () => {
  it("메뉴 route: B 소유 0일 · 비사업용 / A 소유일수 > 0", async () => {
    const f = cobForm();
    const body = buildNblJudgmentApiBody(f.assets[0], f.transferDate);
    const menu = await postMenu(body);
    expect(menu.status).toBe(200);
    const B = menu.data?.judgmentIfCarryoverExcluded as Loose;
    const A = menu.data?.judgment as Loose;
    expect(B.totalOwnershipDays).toBe(0);
    expect(B.isNonBusinessLand).toBe(true);
    expect(A.totalOwnershipDays).toBeGreaterThan(0);
  });
});

describe("CB-3 화면 — 같은 고지 · 판정값 불변", () => {
  it("판정 메뉴: B 카드 안에만 고지 · 짝(의제일이 증여 뒤)이면 없음", async () => {
    const f = cobForm();
    const menu = await postMenu(buildNblJudgmentApiBody(f.assets[0], f.transferDate));
    const { container, unmount } = render(<NblJudgmentResultView result={menu.data as never} form={f} />);
    const notes = container.querySelectorAll(NOTE);
    expect(notes).toHaveLength(1);
    expect(container.querySelector('[data-testid="nbl-judgment-card-b"]')?.querySelector(NOTE)).not.toBeNull();
    expect(container.querySelector('[data-testid="nbl-judgment-card-a"]')?.querySelector(NOTE)).toBeNull();
    unmount();

    const g = cobForm({ nblDeemedTransferDate: "2023-01-01" });
    const menu2 = await postMenu(buildNblJudgmentApiBody(g.assets[0], g.transferDate));
    const r2 = render(<NblJudgmentResultView result={menu2.data as never} form={g} />);
    expect(r2.container.querySelector(NOTE)).toBeNull();
  });

  it("단건 계산기: 이월과세 비교 결과가 있으면 비사업용 토지 판정 카드 아래 고지", async () => {
    const f = cobForm();
    const calc = await postTransfer(await captureBody(f));
    expect(calc.status).toBe(200);
    expect(calc.result?.carryoverTaxationDetail).toBeDefined();
    expect(calc.result?.nonBusinessLandJudgmentDetail).toBeDefined();
    const { container } = render(<TransferTaxResultView result={calc.result} formData={f} onReset={() => {}} onBack={() => {}} />);
    expect(container.querySelector(NOTE)?.textContent).toContain("2015-01-01");
  });

  it("ValuationDetailCards(다건·일괄 공용): prop이 있고 이월과세 비교가 있으면 고지 · 비교가 없으면 숨김", async () => {
    const f = cobForm();
    const calc = await postTransfer(await captureBody(f));
    const note = nblCarryoverDeemedBeforeGiftNote(f.assets[0]);
    const on = render(<ValuationDetailCards result={calc.result} transferPrice={1_000_000_000} nblCarryoverDeemedNote={note} />);
    expect(on.container.querySelector(NOTE)).not.toBeNull();
    on.unmount();
    const off = render(
      <ValuationDetailCards result={{ ...calc.result, carryoverTaxationDetail: undefined }} transferPrice={1_000_000_000} nblCarryoverDeemedNote={note} />,
    );
    expect(off.container.querySelector(NOTE)).toBeNull();
  });
});
