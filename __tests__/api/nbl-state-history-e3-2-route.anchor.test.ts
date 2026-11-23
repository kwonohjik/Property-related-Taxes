/**
 * NBL-STATE-HISTORY-E3-② (E3c-1) — route 관통 anchor: 와이어 칸(`nblRevenuePeriodOn` · `nblRevenueBusinessEndDate` · `nblRevenueYearRows`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §5 · §6(⑫ 신규 칸 3개 — 침묵 strip은 TS 미감지, route 관통이 유일한 안전망) · §7.2 Anchor 6 · 결정 기록(2026-11-23)
 * 표: `_helpers/nbl-state-history-e3-2-table.ts` — 엔진 단위(`nbl-state-history-e3-2.anchor.test.ts`)와 같은 표.
 *
 * mutation 대응: X-13(⑫ Zod에서 새 칸 누락 = strip) = 표 전 행 + «⑫ 칸 도달» 가드 · X-14(⑭가 연도 행 연도를 파싱하지 않음) = 같은 가드 · 개시일 단일 소스.
 * ⚠️ 입력 경로: **직접 API raw**다. ④ 와이어(UI PR)는 아직 새 칸을 싣지 않는다 — 폼으로 body를 만든 뒤 영위 기간 칸만 표의 raw로 덮어쓴다(E3-① route anchor와 같은 방식).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { vi } from "vitest";
import { beforeEach } from "vitest";

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
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { buildMultiBody } from "../calc/_helpers/single-multi-route-parity";
import { postMulti } from "../calc/_helpers/single-multi-route-parity";
import { E3C_ON_ROWS, E3C_ROWS, E3C_SWING_2014, e3cExpectedTax, e3cRowRaw, type E3cRow } from "../tax-engine/_helpers/nbl-state-history-e3-2-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_REVENUE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3C_ROWS.find((r) => r.id === id)!;
const NOTICE = {
  rowUnknown: NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE,
  grace10Premise: NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE,
  pastYears: NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE,
  closureGrace: NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE,
} as const;

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 자산에 직접 얹으면 ④ prefix-pick이 운반한다. OFF 칸은 영위 기간 키를 싣지 않는다. */
function nblKeysOf(r: E3cRow, on: boolean): Partial<AssetForm> {
  const nbl = Object.fromEntries(Object.entries(e3cRowRaw(r, on)).filter(([k]) => !["acquisitionArea", "acquisitionDate", "transferDate"].includes(k)));
  return nbl as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억 단건. */
function formOf(r: E3cRow, on = true, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-06-30";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblKeysOf(r, on), over) as AssetForm,
  ];
  return f;
}

/** 폼 → body 캡처 → (선택) raw 덮어쓰기 → POST. */
async function run(f: TransferFormData, mutate?: (raw: Loose) => void) {
  const body = await captureBody(f);
  const raw = body.nonBusinessLandRaw as Loose;
  mutate?.(raw);
  const r = await postTransfer(body);
  return { ...r, body, raw, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}
const runRow = (r: E3cRow) => run(formOf(r));
const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

describe("E3c-1 route 관통 — 케이스 표(영위 기간 ON, 단건): 입력 → ⑫ → ⑭ → 엔진 → 세액 · 고지", () => {
  it.each(E3C_ON_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3cRow) => {
    const res = await runRow(r);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.raw.nblRevenuePeriodOn, "④가 영위 기간 칸을 싣는다(직접 raw)").toBe(true);
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    expect(res.nbl?.periodEvaluation?.revenueHistory, "echo가 응답에 실린다").toBeDefined();
    const tax = e3cExpectedTax(r);
    if (tax !== undefined) expect(res.result?.calculatedTax).toBe(tax);
    const expected = new Set(r.notices ?? []);
    for (const [kind, text] of Object.entries(NOTICE)) {
      expect((res.nbl?.warnings as string[]).filter((w) => w === text), `${r.id} ${kind}`).toHaveLength(expected.has(kind as keyof typeof NOTICE) ? 1 : 0);
    }
    expect(res.nbl?.warnings).toContain(NBL_REVENUE_HISTORY_APPLIED_NOTICE);
  });

  it("⑫ 칸 도달 가드(X-13·X-14 — TS 미감지): M9p 응답 echo의 연도별 판정에 «2022 행(연도 문자열 → 숫자)»이 실려 온다 — Zod가 `nblRevenueYearRows`를 strip하면 2022가 «모름»(불통과)으로 돌아간다", async () => {
    const res = await runRow(row("M9p"));
    const years = res.nbl?.periodEvaluation?.revenueHistory?.years as Loose[];
    expect(years.map((y) => [y.taxYear, y.source, y.known, y.pass])).toEqual([[2022, "row", true, true], [2023, "prior", true, true], [2024, "current", true, true]]);
    expect(years[0].annualizedRevenue).toBe(7_064_516);
    // 폐업일 칸도 따로 도달해야 한다 — M11p에서 폐업일만 지우면(strip과 같은 효과) 영위 구간이 양도일까지로 늘어난다
    const closed = await runRow(row("M11p"));
    expect(closed.nbl?.periodEvaluation?.revenueHistory?.operatingDays).toBe(2707);
    const noEnd = await run(formOf(row("M11p")), (raw) => { raw.nblRevenueBusinessEndDate = ""; });
    expect(noEnd.status).toBe(200);
    expect(noEnd.nbl?.periodEvaluation?.revenueHistory?.operatingDays).toBe(3832);
    // 토글 칸도 — 켜지 않으면(미전송) 현행이다
    const noOn = await run(formOf(row("M11p")), (raw) => { delete raw.nblRevenuePeriodOn; });
    expect(noOn.nbl?.periodEvaluation?.revenueHistory).toBeUndefined();
    expect(noOn.nbl?.isNonBusinessLand).toBe(row("M11p").current.nonBusiness);
  });

  it("과소 해소(M9p 현행 B → N) · 과대 해소(M11p 현행 N → B): 같은 거래에서 영위 기간 칸만 끈 대조 — 스윙 55,750,000", async () => {
    for (const id of ["M9p", "M11p", "C10b"] as const) {
      const r = row(id);
      const off = await run(formOf(r, false));
      expect(off.status, id).toBe(200);
      expect(off.nbl?.periodEvaluation?.revenueHistory, `${id} OFF echo 부재`).toBeUndefined();
      const on = await runRow(r);
      expect(Math.abs((on.result?.calculatedTax ?? 0) - (off.result?.calculatedTax ?? 0)), id).toBe(E3C_SWING_2014);
      expect(off.result?.calculatedTax, `${id} 현행`).toBe(e3cExpectedTax(r, r.current.nonBusiness));
    }
  });

  it("OFF(칸 미전송)는 판정 객체 전체가 영위 기간을 모른다 — 키·고지 부재(바이트 동일 계약)", async () => {
    for (const id of ["M9p", "C10a", "M11p"] as const) {
      const off = await run(formOf(row(id), false));
      expect(JSON.stringify(off.nbl), id).not.toContain("revenueHistory");
      for (const text of [NBL_REVENUE_HISTORY_APPLIED_NOTICE, ...Object.values(NOTICE)]) expect(off.nbl?.warnings, id).not.toContain(text);
    }
  });
});

describe("E3c-1 ⑫ — 직접 API 계약: 폐업일·연도 행은 «토글 ON»일 때만 검증(⑧ 거울 — 같은 leaf·같은 문구) · 누락·빈 금액은 400이 아니다(모름)", () => {
  const M11 = row("M11p");
  const rowsOf = (...rows: Array<[string, string?, string?]>) => rows.map(([year, revenue, landValue]) => ({ year, ...(revenue !== undefined ? { revenue } : {}), ...(landValue !== undefined ? { landValue } : {}) }));

  it("폐업일 ≤ 개시일 · 폐업일 ≥ 양도일 · 읽을 수 없는 폐업일은 400 — 문구는 leaf 단일 소스", async () => {
    const start = await run(formOf(row("C4a")), (raw) => { raw.nblRevenueCurrentBusinessStartDate = "2019-01-01"; });
    expect(start.status).toBe(400);
    expect(errorText(start)).toContain("개시일보다 뒤여야");
    const late = await run(formOf(M11), (raw) => { raw.nblRevenueBusinessEndDate = "2024-06-30"; });
    expect(late.status).toBe(400);
    expect(errorText(late)).toContain("양도일(2024-06-30) 당일 또는 그 이후");
    const bad = await run(formOf(M11), (raw) => { raw.nblRevenueBusinessEndDate = "내일"; });
    expect(bad.status).toBe(400);
    expect(errorText(bad)).toContain("읽을 수 없습니다");
  });

  it("연도 행: 연도 형식·중복·양도연도(T)·직전(T−1)·금액 형식은 400 · 누락 연도·빈 금액은 200(모름 + 고지)", async () => {
    const withRows = (rows: unknown) => run(formOf(M11), (raw) => { raw.nblRevenueYearRows = rows; });
    expect((await withRows(rowsOf(["22", "1", "1"]))).status).toBe(400);
    expect((await withRows(rowsOf(["2014", "1", "1"], ["2014", "1", "1"]))).status).toBe(400);
    const t = await withRows(rowsOf(["2023", "1", "1"]));
    expect(t.status).toBe(400);
    expect(errorText(t)).toContain("당해 과세기간");
    expect((await withRows(rowsOf(["2024", "1", "1"]))).status).toBe(400);
    expect((await withRows(rowsOf(["2014", "-5", "1"]))).status).toBe(400);
    expect((await withRows(rowsOf(["2014", "1", "abc"]))).status).toBe(400);
    // 모름 — 막지 않는다
    const unknown = await withRows(rowsOf(["2014", "", ""], ["2015"]));
    expect(unknown.status, errorText(unknown).slice(0, 300)).toBe(200);
    expect(unknown.nbl?.periodEvaluation?.revenueHistory?.unknownYears).toEqual(expect.arrayContaining([2014, 2015]));
    expect(unknown.nbl?.warnings).toContain(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE);
    // 행 전체 생략(배열 없음)도 400이 아니다 — 영위 연도 전부 모름
    const none = await run(formOf(M11), (raw) => { delete raw.nblRevenueYearRows; });
    expect(none.status).toBe(200);
  });

  it("토글 OFF의 stale 행·폐업일은 검증하지 않는다 — 400이 아니고 판정에도 닿지 않는다", async () => {
    const r = await run(formOf(M11), (raw) => { raw.nblRevenuePeriodOn = false; raw.nblRevenueBusinessEndDate = "내일"; raw.nblRevenueYearRows = rowsOf(["22", "x", "y"]); });
    expect(r.status, errorText(r).slice(0, 300)).toBe(200);
    expect(r.nbl?.periodEvaluation?.revenueHistory).toBeUndefined();
  });

  it("업종이 없으면 토글이 켜져 있어도 검증·판정하지 않는다(수입금액비율 경로 자체가 없다)", async () => {
    const r = await run(formOf(M11), (raw) => { raw.nblRevenueBusinessType = ""; raw.nblRevenueBusinessEndDate = "내일"; });
    expect(r.status, errorText(r).slice(0, 300)).toBe(200);
    expect(r.nbl?.periodEvaluation?.revenueHistory).toBeUndefined();
  });

  it("행 스키마: `year` 누락·`taxYear` 오타는 400(엔진이 모르는 칸을 조용히 버리지 않는다) · 금액 칸 생략은 200", async () => {
    expect((await run(formOf(M11), (raw) => { raw.nblRevenueYearRows = [{ taxYear: "2014", revenue: "1", landValue: "1" }]; })).status).toBe(400);
    expect((await run(formOf(M11), (raw) => { raw.nblRevenueYearRows = [{ year: "2014" }]; })).status).toBe(200);
  });
});

describe("E3c-1 route 관통 — 다건 입구", () => {
  it("다건 route: 같은 raw가 단건과 같은 판정으로 영위 기간에 닿는다 — M9p(과소 해소: 비사업용) · M11p(과대 해소: 사업용)", async () => {
    for (const id of ["M9p", "M11p"] as const) {
      const r = row(id);
      const body = await buildMultiBody([formOf(r)]);
      const rawHolder = ((body as Loose).properties as Loose[])?.[0]?.nonBusinessLandRaw as Loose | undefined;
      expect(rawHolder, `${id} 다건 body에 raw가 있다`).toBeDefined();
      expect(rawHolder!.nblRevenuePeriodOn, `${id} 다건 body에도 영위 기간 칸이 실린다`).toBe(true);
      const multi = await postMulti(body);
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.revenueHistory, id).toBeDefined();
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
    }
  });
});
