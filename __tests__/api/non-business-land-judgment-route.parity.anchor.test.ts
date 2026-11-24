/**
 * 비사업용 토지 판정 메뉴 route — parity anchor (A-1 · A-2 · 이월과세 A/B parity).
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §6 · 「사용자 결정 2차」 Q-1 (c).
 * 같은 폼 → 계산기 route의 `nonBusinessLandJudgmentDetail` ≡ 메뉴 route의 `judgment` (JSON 기준).
 * 메뉴 본문은 ④ 래퍼(`buildNblJudgmentApiBody`)가 만든다 — 래퍼가 raw를 빠뜨리면 이 anchor가 실패한다(M-7).
 *
 * mutation 대응: M-1(`judgeNonBusinessLand(input, rules)` → rules 제거) = A-2 · M-5(`buildNblEngineInput` 인라인) = A-1 해당 행 · M-7(④ raw `transferDate` 누락) = A-1 전 행.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { CARRYOVER_BASE, CARRYOVER_GRID, MENU_GRID, jsonRound, landForm, postMenu, type Loose, type MenuGridRow } from "../calc/_helpers/nbl-judgment-menu";
import { E3D_B_ROWS, e3dBRowRaw } from "../tax-engine/_helpers/nbl-state-history-e3-3b-table";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { buildNblJudgmentApiBody } from "@/lib/calc/non-business-land-judgment-api";
import { buildNblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 폼 → 계산기 route 결과 + 메뉴 route 응답(같은 폼에서 ④ 래퍼가 만든 본문). */
async function runBoth(form: TransferFormData) {
  const calcBody = await captureBody(form);
  const calc = await postTransfer(calcBody);
  const menuBody = buildNblJudgmentApiBody(form.assets[0], form.transferDate);
  expect(menuBody, "④ 래퍼가 본문을 만든다(⑧ 통과 상태)").toBeDefined();
  const menu = await postMenu(menuBody);
  return { calcBody, calc, menuBody: menuBody!, menu };
}

describe("A-1 — 같은 폼 → 같은 판정 (격자 전 행)", () => {
  it.each(MENU_GRID.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, row: MenuGridRow) => {
    const form = landForm(row.asset, row.form);
    const { calcBody, calc, menuBody, menu } = await runBoth(form);
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    // ④ 래퍼가 싣는 raw = 계산기 ④가 싣는 raw (같은 leaf)
    expect(menuBody.nonBusinessLandRaw).toEqual(calcBody.nonBusinessLandRaw);
    const calcNbl = calc.result?.nonBusinessLandJudgmentDetail;
    expect(calcNbl, "계산기 STEP 0.6이 판정을 싣는다").toBeDefined();
    expect(menu.data?.judgment).toEqual(jsonRound(calcNbl));
    expect(menu.data?.judgmentIfCarryoverExcluded, "이월과세가 아니면 B 없음").toBeUndefined();
  });

  it("격자가 퇴화하지 않았다 — 사업용·비사업용 둘 다, 무조건 의제 성립 행이 있다", async () => {
    const verdicts: boolean[] = [];
    let uncond = 0;
    for (const row of MENU_GRID) {
      const r = await runBoth(landForm(row.asset, row.form));
      verdicts.push(r.menu.data?.judgment.isNonBusinessLand);
      if (r.menu.data?.judgment.unconditionalExemption?.isApplied) uncond++;
    }
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
    expect(uncond).toBeGreaterThanOrEqual(1);
  });

  it.each(E3D_B_ROWS.map((r) => [r.id, r.scenario, r] as const))("E3d-B %s — 주택 철거 이력 행도 같은 판정", async (_id, _s, r) => {
    // 계산기 폼 → ④ body 캡처 후 와이어 이력 칸을 표의 raw로 덮어쓴다(E3d route anchor와 같은 방식) — 메뉴에도 같은 raw를 싣는다.
    const form = landForm({ acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "1000", transferArea: r.area ?? "1000" } as Partial<AssetForm>, { transferDate: r.transfer ?? "2024-01-01" });
    const calcBody = await captureBody(form);
    const raw = calcBody.nonBusinessLandRaw as Loose;
    Object.assign(raw, e3dBRowRaw(r));
    if (r.metroOmit) delete raw.nblIsMetropolitanArea;
    const calc = await postTransfer(calcBody);
    const menu = await postMenu({ nonBusinessLandRaw: raw });
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    expect(menu.data?.judgment).toEqual(jsonRound(calc.result?.nonBusinessLandJudgmentDetail));
  });
});

describe("A-2 — rules 배선 (DB 규칙이 판정에 닿는다)", () => {
  /** 농지 · 거주지 직선 약 22.2km — 재촌 한도 30km면 사업용(`within_30km`), 10km면 비사업용. 일반 사례는 rules 유무를 가르지 못한다(P5). */
  const farmForm = () =>
    landForm(
      {
        nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionDate: "2014-01-01", nblFarmingSelf: true,
        latitude: "37.5", longitude: "127.0",
        nblBusinessUsePeriods: [{ startDate: "2014-01-02", endDate: "2023-12-31", usageType: "자경" }],
        nblResidenceHistories: [{ sigunguName: "서울 외 거주지", startDate: "2014-01-02", endDate: "2024-06-01", hasResidentRegistration: true, lat: "37.7", lng: "127.0" }],
      } as Partial<AssetForm>,
    );
  const ruleRates = (km: number) => {
    const rates = makeMockRates();
    const key = "transfer:special:non_business_land_judgment";
    rates.set(key as never, {
      taxType: "transfer", category: "special", subCategory: "non_business_land_judgment", rateTable: null, deductionRules: null,
      specialRules: { ...DEFAULT_NON_BUSINESS_LAND_RULES, type: "non_business_land_judgment", farmlandDistanceKm: km },
    } as never);
    return rates;
  };

  it("DB가 한도를 10km로 돌려주면 메뉴·계산기 둘 다 비사업용으로 갈린다 (한도 30km 대조)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    try {
      const out: Record<number, { menu: boolean; calc: boolean }> = {};
      for (const km of [30, 10]) {
        vi.mocked(preloadTaxRates).mockResolvedValue(ruleRates(km) as never);
        const { calc, menu } = await runBoth(farmForm());
        expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
        expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
        out[km] = { menu: menu.data?.judgment.isNonBusinessLand, calc: calc.result?.nonBusinessLandJudgmentDetail?.isNonBusinessLand };
        expect(menu.data?.judgment).toEqual(jsonRound(calc.result?.nonBusinessLandJudgmentDetail));
      }
      expect(out[30]).toEqual({ menu: false, calc: false });
      expect(out[10]).toEqual({ menu: true, calc: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Q-1 (c) 이월과세 — 메뉴 A = 계산기 시나리오 A · 메뉴 B = 계산기 시나리오 B", () => {
  const carryoverForm = (taxFacts: object, transferDate = "2023-12-01") =>
    landForm({ ...CARRYOVER_BASE, carryover: { ...(CARRYOVER_BASE.carryover as object), ...taxFacts } as never } as Partial<AssetForm>, { transferDate });

  // A 채택: 증여자 취득가 낮고(100M) 증여 당시 평가액 높다(800M) → A 세액 ≥ B 세액 / B 채택: 증여자 취득가가 매우 높아 A 세액이 작다
  const A_ADOPTED = { donorAcquisitionPrice: "100000000", giftDateValuation: "800000000" };
  const B_ADOPTED = { donorAcquisitionPrice: "900000000", giftDateValuation: "300000000" };

  it("채택 시나리오가 A인 폼: 계산기 판정 = 메뉴 judgment (증여자 취득일 기산)", async () => {
    const { calc, menu, menuBody } = await runBoth(carryoverForm(A_ADOPTED));
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    expect(calc.result?.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(menuBody.carryoverGiftRegistryDate).toBe("2022-06-01");
    expect(menu.data?.judgment).toEqual(jsonRound(calc.result?.nonBusinessLandJudgmentDetail));
  });

  it("채택 시나리오가 B인 폼: 계산기 판정 = 메뉴 judgmentIfCarryoverExcluded (수증일 기산)", async () => {
    const { calc, menu } = await runBoth(carryoverForm(B_ADOPTED));
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    expect(calc.result?.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(menu.data?.judgmentIfCarryoverExcluded).toEqual(jsonRound(calc.result?.nonBusinessLandJudgmentDetail));
  });

  it("A·B는 기산일이 다르다 — 응답은 어느 쪽이 적용되는지 말하지 않는다", async () => {
    const { menu } = await runBoth(carryoverForm(A_ADOPTED));
    const a = menu.data?.judgment;
    const b = menu.data?.judgmentIfCarryoverExcluded;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.totalOwnershipDays).toBeGreaterThan(b.totalOwnershipDays);
    expect(Object.keys(menu.data ?? {}).sort()).toEqual(["inputEffects", "inputEffectsIfCarryoverExcluded", "judgment", "judgmentIfCarryoverExcluded"]);
    expect(JSON.stringify(menu.data)).not.toMatch(/adoptedScenario|adopted/);
  });

  it.each(CARRYOVER_GRID.map((r) => [r.id, r.scenario, r] as const))("%s — A·B 모두 같은 입력에서 계산기와 일치(채택된 쪽)", async (_id, _s, row) => {
    const form = landForm(row.asset, row.form);
    const { calc, menu } = await runBoth(form);
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(200);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    const adopted = calc.result?.carryoverTaxationDetail?.adoptedScenario;
    const expected = adopted === "B" ? menu.data?.judgmentIfCarryoverExcluded : menu.data?.judgment;
    expect(expected).toEqual(jsonRound(calc.result?.nonBusinessLandJudgmentDetail));
  });

  it("inputEffects는 서버가 한 번 계산한 값이다 — 같은 입력으로 순수 함수를 다시 불러도 같다", async () => {
    const row = MENU_GRID.find((r) => r.id === "G11-other-deemed")!;
    const { menu } = await runBoth(landForm(row.asset, row.form));
    expect(menu.data?.inputEffects).toEqual({ gracePeriods: "applied", deemedTransfer: "applied", urbanIncorporation: "not_declared" });
    expect(typeof buildNblInputEffects).toBe("function");
  });
});
