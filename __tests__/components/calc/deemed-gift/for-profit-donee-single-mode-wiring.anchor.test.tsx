/**
 * 명부형 3종 단일 모드 공통 토글 — ⑤ 노출 · ④ 탑재 · ⑫ Zod · 폼↔엔진 판정 parity (7-15).
 *
 * ⑤는 폼 모드 플래그(`mrgUseShareholders`·`cdMode`·`conCaseType`/`conParties`)로 판정하고, 엔진은 페이로드
 * 모양(`shareholders`·`parties`)으로 판정한다. 둘이 어긋나면 ① 토글이 보이는데 엔진이 무시하거나(거짓 입력
 * 경로) ② 토글이 숨었는데 stale 값이 엔진에 닿는다. 검증을 통과하는 모드 조합 전부에서 같아야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedDetailModal } from "@/components/calc/deemed-gift/DeemedDetailModal";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { buildDeemedGiftInput, forProfitDoneeToggleVisible } from "@/lib/calc/gift-deemed-api";
import { forProfitDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { SINGLE_MODE } from "../../../tax-engine/gift-deemed/for-profit-donee-single-mode.fixture";

afterEach(cleanup);

const cdRow = (id: string, redeemed: string) => ({ id, name: id, preShares: "100", redeemedShares: redeemed, redemptionPrice: "1", relationGroup: "A" });
/** 검증을 통과하는 모양의 모드 조합 — 명부 모드는 행이 있다(빈 명부는 ⑧이 막는다) */
const MODES: Record<string, Partial<DeemedFormState>> = {
  merger_single: { type: "merger", mrgUseShareholders: false },
  merger_matrix: { type: "merger", mrgUseShareholders: true, mrgOverShareholders: [{ name: "갑", shares: "1" }], mrgUnderShareholders: [{ name: "을", shares: "1" }] },
  cd_single_low: { type: "capital_decrease", cdMode: "single", cdCaseType: "low" },
  cd_single_high: { type: "capital_decrease", cdMode: "single", cdCaseType: "high" },
  cd_multi: { type: "capital_decrease", cdMode: "multi", cdShareholders: [cdRow("갑", "100"), cdRow("병", "0")] },
  con_low: { type: "contribution", conCaseType: "low", conParties: undefined },
  con_low_roster: { type: "contribution", conCaseType: "low", conParties: [{ name: "을", shares: "1", relation: "" }] },
  con_high: { type: "contribution", conCaseType: "high", conParties: undefined },
  con_high_roster: { type: "contribution", conCaseType: "high", conParties: [{ name: "을", shares: "1", relation: "" }] },
};
const EXPECT_VISIBLE = ["merger_single", "cd_single_low", "cd_single_high", "con_low", "con_low_roster", "con_high"];
const form = (k: string, on = false) => ({ ...INITIAL_DEEMED, giftDate: "2025-06-30", ...MODES[k], doneeIsForProfitCorp: on }) as DeemedFormState;

describe("판정 — 폼(⑤) ↔ 엔진(라우터) parity", () => {
  it.each(Object.keys(MODES))("[SFW-0] %s — 폼 판정 = 엔진 판정(페이로드)", (k) => {
    expect(forProfitDoneeToggleVisible(form(k))).toBe(EXPECT_VISIBLE.includes(k));
    expect(forProfitDoneeGateApplies(buildDeemedGiftInput(form(k)))).toBe(EXPECT_VISIBLE.includes(k));
  });
});

describe("⑤ 상세 입력 모달 — 공통 토글 노출", () => {
  it.each(Object.keys(MODES))("[SFW-1] %s", (k) => {
    render(<DeemedDetailModal open onOpenChange={() => {}} form={form(k)} set={vi.fn()} />);
    expect(screen.queryByTestId("deemed-donee-for-profit-corp") !== null).toBe(EXPECT_VISIBLE.includes(k));
  });
});

describe("④ API — 공통 필드 탑재", () => {
  it.each(Object.keys(MODES))("[SFW-2] %s — 켜 둔 값은 단일 모드에서만 실린다(명부 모드 stale 차단)", (k) => {
    const p = buildDeemedGiftInput(form(k, true)) as unknown as Record<string, unknown>;
    expect(p.doneeIsForProfitCorp === true).toBe(EXPECT_VISIBLE.includes(k));
  });
});

describe("⑫ Zod — 세 유형이 공통 필드를 통과시킨다", () => {
  it.each(Object.keys(SINGLE_MODE))("[SFW-3] %s", (k) => {
    const r = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify({ ...SINGLE_MODE[k], doneeIsForProfitCorp: true })));
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).doneeIsForProfitCorp).toBe(true);
  });
});
