/**
 * 비사업용 토지 판정 메뉴 route — 400 parity anchor (A-4) · 오류 envelope · rate limit · 이월과세 요청 규칙.
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §3.2(R1~R4) · §5.3 · 「사용자 결정 2차」 Q-1 (c).
 * raw 스키마가 못 막는 3틈(상속 피상속인 취득일 · 취득일 ≥ 양도일 · 빈 날짜 → plain Error 500)을 래퍼가 막는다 — 같은 입력을 계산기 route도 400으로 막는다.
 *
 * mutation 대응: M-2(R4 삭제) = 상속 행 · M-3(R3 삭제) = 순서 행 · M-4(R2 삭제) = 날짜 행(500).
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

import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_MENU } from "@/app/api/calc/non-business-land-judgment/route";
import { POST as POST_CALC } from "@/app/api/calc/transfer/route";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { CARRYOVER_BASE, landForm, postMenu, type Loose } from "../calc/_helpers/nbl-judgment-menu";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const fieldKeys = (json: Loose) => Object.keys(json?.error?.fieldErrors ?? {});

/** 계산기 ④가 싣는 본문 + 메뉴 본문(raw만) — `mutate`가 두 곳(계산기 최상위 · raw)을 같은 사실로 고친다. */
async function bothBodies(form: ReturnType<typeof landForm>, mutate: (body: Loose, raw: Loose) => void) {
  const body = await captureBody(form);
  const raw = body.nonBusinessLandRaw as Loose;
  mutate(body, raw);
  return { calcBody: body, menuBody: { nonBusinessLandRaw: raw } };
}

describe("A-4 — 입력 결함: 메뉴 400 ⇔ 계산기 400 (NBL 경로 결함에 한해)", () => {
  const inheritForm = () =>
    landForm({ acquisitionCause: "inheritance", acquisitionDate: "2020-01-01", decedentAcquisitionDate: "1990-01-01" } as Partial<AssetForm>);

  const rows: { id: string; scenario: string; form: () => ReturnType<typeof landForm>; mutate: (body: Loose, raw: Loose) => void; field: string }[] = [
    {
      id: "R4-inherit-missing", scenario: "상속인데 피상속인 취득일 없음", form: inheritForm,
      mutate: (b, r) => { b.decedentAcquisitionDate = undefined; r.decedentAcquisitionDate = ""; }, field: "nonBusinessLandRaw.decedentAcquisitionDate",
    },
    {
      id: "R4-inherit-order", scenario: "피상속인 취득일 ≥ 상속개시일", form: inheritForm,
      mutate: (b, r) => { b.decedentAcquisitionDate = "2020-01-01"; r.decedentAcquisitionDate = "2020-01-01"; }, field: "nonBusinessLandRaw.decedentAcquisitionDate",
    },
    {
      id: "R3-order", scenario: "취득일 ≥ 양도일", form: () => landForm(),
      mutate: (b, r) => { b.acquisitionDate = "2024-06-01"; r.acquisitionDate = "2024-06-01"; }, field: "nonBusinessLandRaw.acquisitionDate",
    },
    {
      id: "R2-empty-acq", scenario: "취득일이 빈 문자열(메뉴는 500이 아니라 400)", form: () => landForm(),
      mutate: (b, r) => { b.acquisitionDate = ""; r.acquisitionDate = ""; }, field: "nonBusinessLandRaw.acquisitionDate",
    },
    {
      id: "R2-empty-transfer", scenario: "양도일이 빈 문자열", form: () => landForm(),
      mutate: (b, r) => { b.transferDate = ""; r.transferDate = ""; }, field: "nonBusinessLandRaw.transferDate",
    },
    {
      id: "R2-garbage", scenario: "날짜 형식이 깨짐", form: () => landForm(),
      mutate: (b, r) => { b.acquisitionDate = "abc"; r.acquisitionDate = "abc"; }, field: "nonBusinessLandRaw.acquisitionDate",
    },
    {
      id: "raw-landtype", scenario: "지목이 비었고 무조건 의제도 불성립", form: () => landForm(),
      mutate: (_b, r) => { r.nblLandType = ""; }, field: "nonBusinessLandRaw.nblLandType",
    },
    {
      id: "raw-row", scenario: "농지 사업용 사용기간 행 역순(raw refine — 같은 스키마)", form: () => landForm({ nblLandType: "farmland", nblZoneType: "agriculture_forest" } as Partial<AssetForm>),
      mutate: (_b, r) => { r.nblBusinessUsePeriods = [{ startDate: "2023-01-01", endDate: "2022-01-01", usageType: "자경" }]; }, field: "nonBusinessLandRaw.nblBusinessUsePeriods",
    },
  ];

  it.each(rows.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, row) => {
    const { calcBody, menuBody } = await bothBodies(row.form(), row.mutate);
    const calc = await postTransfer(calcBody);
    const menu = await postMenu(menuBody);
    expect(calc.status, JSON.stringify(calc.json).slice(0, 300)).toBe(400);
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(400);
    expect(menu.json.error.code).toBe("INVALID_INPUT");
    expect(menu.json.error.message).toBe("입력값이 올바르지 않습니다");
    // UI가 `[object Object]` 없이 읽는 envelope — fieldErrors는 {경로: 문구[]}
    for (const v of Object.values(menu.json.error.fieldErrors as Record<string, string[]>)) expect(Array.isArray(v) && v.every((m) => typeof m === "string")).toBe(true);
    expect(fieldKeys(menu.json).some((k) => k.startsWith(row.field)), `${row.field} ∈ ${fieldKeys(menu.json)}`).toBe(true);
  });

  it("R3·R4 문구는 계산기와 같다(같은 규칙의 거울)", async () => {
    const order = await bothBodies(landForm(), (b, r) => { b.acquisitionDate = "2024-06-01"; r.acquisitionDate = "2024-06-01"; });
    const calcOrder = await postTransfer(order.calcBody);
    const menuOrder = await postMenu(order.menuBody);
    expect(JSON.stringify(calcOrder.json)).toContain("취득일은 양도일보다 이전이어야 합니다");
    expect(menuOrder.json.error.fieldErrors["nonBusinessLandRaw.acquisitionDate"]).toContain("취득일은 양도일보다 이전이어야 합니다");

    const inh = await bothBodies(landForm({ acquisitionCause: "inheritance", acquisitionDate: "2020-01-01" } as Partial<AssetForm>), (b, r) => { b.decedentAcquisitionDate = undefined; r.decedentAcquisitionDate = ""; });
    const calcInh = await postTransfer(inh.calcBody);
    const menuInh = await postMenu(inh.menuBody);
    expect(JSON.stringify(calcInh.json)).toContain("상속의 경우 피상속인 취득일이 필수입니다");
    expect(menuInh.json.error.fieldErrors["nonBusinessLandRaw.decedentAcquisitionDate"]).toContain("상속의 경우 피상속인 취득일이 필수입니다");
  });

  it("R1 — 정밀판정 OFF 본문은 400(메뉴는 항상 상세 판정)", async () => {
    const { menuBody } = await bothBodies(landForm(), (_b, r) => { r.nblUseDetailedJudgment = false; });
    const menu = await postMenu(menuBody);
    expect(menu.status).toBe(400);
    expect(fieldKeys(menu.json)).toContain("nonBusinessLandRaw.nblUseDetailedJudgment");
  });

  /**
   * V-4 실측(계획서 §3.2 마지막 줄) — raw 면적이 0·음수·비수치·빈 값이어도 **계산기 route는 400 없이 200**이다(엔진이 면적 0으로 읽어 비사업용으로 접는다).
   * 메뉴 route도 같다 — 면적은 ⑧(`validateNblDetailedJudgment`)만 막는다. 이 anchor는 그 «현행»을 못박아 두 route가 갈라지면(한쪽만 400) 알린다.
   */
  it.each(["0", "-5", "abc", ""])("V-4 — 면적 %j: 두 route 모두 400 없이 같은 판정(⑧만 막는다)", async (area) => {
    const body = await captureBody(landForm());
    (body.nonBusinessLandRaw as Loose).acquisitionArea = area;
    const calc = await postTransfer(body);
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw });
    expect(calc.status).toBe(200);
    expect(menu.status).toBe(200);
    expect(menu.data?.judgment.isNonBusinessLand).toBe(calc.result?.nonBusinessLandJudgmentDetail?.isNonBusinessLand);
  });

  it("본문이 raw를 안 싣거나 JSON이 깨지면 400 — 500이 아니다", async () => {
    expect((await postMenu({})).status).toBe(400);
    expect((await postMenu({ nonBusinessLandRaw: null })).status).toBe(400);
    const broken = await postMenu("{not json");
    expect(broken.status).toBe(400);
    expect(broken.json.error.code).toBe("INVALID_JSON");
  });
});

describe("Q-1 (c) 이월과세 요청 규칙 — 계산기 `refineCarryoverTaxation`과 같은 규칙·같은 문구", () => {
  const carryoverForm = () => landForm(CARRYOVER_BASE, { transferDate: "2023-12-01" });
  const GIFT_AFTER_TRANSFER = "증여 등기접수일은 양도일보다 이전이어야 합니다";
  const DONOR_AFTER_GIFT = "증여자 취득일은 증여 등기접수일보다 이전이어야 합니다";

  it("증여 등기접수일이 없으면 400 (이월과세는 B 판정 입력이 필요하다)", async () => {
    const body = await captureBody(carryoverForm());
    delete body.carryoverTaxation;
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw });
    expect(menu.status).toBe(400);
    expect(fieldKeys(menu.json)).toContain("carryoverGiftRegistryDate");
  });

  it("증여 등기접수일 ≥ 양도일 → 400 · 계산기도 400(같은 문구)", async () => {
    const body = await captureBody(carryoverForm());
    (body.carryoverTaxation as Loose).giftRegistryDate = "2023-12-01";
    const calc = await postTransfer(body);
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw, carryoverGiftRegistryDate: "2023-12-01" });
    expect(calc.status).toBe(400);
    expect(JSON.stringify(calc.json)).toContain(GIFT_AFTER_TRANSFER);
    expect(menu.status).toBe(400);
    expect(menu.json.error.fieldErrors.carryoverGiftRegistryDate).toContain(GIFT_AFTER_TRANSFER);
  });

  it("증여자 취득일 ≥ 증여 등기접수일 → 400 · 계산기도 400(같은 문구)", async () => {
    const body = await captureBody(carryoverForm());
    (body.carryoverTaxation as Loose).giftRegistryDate = "2011-01-01"; // 증여자 취득일 2012-01-01 이후가 아니게
    const calc = await postTransfer(body);
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw, carryoverGiftRegistryDate: "2011-01-01" });
    expect(calc.status).toBe(400);
    expect(JSON.stringify(calc.json)).toContain(DONOR_AFTER_GIFT);
    expect(menu.status).toBe(400);
    expect(JSON.stringify(menu.json)).toContain(DONOR_AFTER_GIFT);
  });

  it("증여자 취득일(raw)이 없으면 400", async () => {
    const body = await captureBody(carryoverForm());
    const raw = { ...(body.nonBusinessLandRaw as Loose), donorAcquisitionDate: "" };
    const menu = await postMenu({ nonBusinessLandRaw: raw, carryoverGiftRegistryDate: "2022-06-01" });
    expect(menu.status).toBe(400);
    expect(fieldKeys(menu.json)).toContain("nonBusinessLandRaw.donorAcquisitionDate");
  });

  it("증여 등기접수일 형식이 깨지면 400(500이 아니다)", async () => {
    const body = await captureBody(carryoverForm());
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw, carryoverGiftRegistryDate: "abc" });
    expect(menu.status).toBe(400);
  });

  it("이월과세가 아니면 증여 등기접수일은 읽지 않는다 — B 없음 · 200", async () => {
    const body = await captureBody(landForm());
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw, carryoverGiftRegistryDate: "2022-06-01" });
    expect(menu.status).toBe(200);
    expect(menu.data?.judgmentIfCarryoverExcluded).toBeUndefined();
    expect(menu.data?.inputEffectsIfCarryoverExcluded).toBeUndefined();
  });

  it("증여 당시 평가액·증여자 취득가액 같은 세액 입력은 묻지 않는다 — 요청에 없어도 200", async () => {
    const body = await captureBody(carryoverForm());
    const menu = await postMenu({ nonBusinessLandRaw: body.nonBusinessLandRaw, carryoverGiftRegistryDate: "2022-06-01" });
    expect(menu.status, JSON.stringify(menu.json).slice(0, 300)).toBe(200);
    expect(menu.data?.judgmentIfCarryoverExcluded).toBeDefined();
  });
});

describe("rate limit — 계산기 route와 같은 규약(분당 30 · 429 envelope)", () => {
  it("한도를 넘으면 두 route 모두 같은 429 본문", async () => {
    const mk = (url: string) => new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, limit: 30, remaining: 0, resetAt: Date.now() + 60_000 } as never);
    try {
      const menu = await POST_MENU(mk("http://localhost/api/calc/non-business-land-judgment"));
      const calc = await POST_CALC(mk("http://localhost/api/calc/transfer"));
      expect(menu.status).toBe(429);
      expect(calc.status).toBe(429);
      const menuJson = (await menu.json()) as Loose;
      expect(menuJson.error.code).toBe("RATE_LIMITED");
      expect(vi.mocked(checkRateLimit).mock.calls.some(([key, opts]) => String(key).startsWith("non-business-land-judgment:") && (opts as Loose).limit === 30 && (opts as Loose).windowMs === 60_000)).toBe(true);
    } finally {
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 } as never);
    }
  });
});
