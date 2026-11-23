/**
 * NBL-STATE-HISTORY-E3-② UI — ④ 와이어 ↔ ⑧ 검증 ↔ ⑫ ↔ ⑭ ↔ 엔진: 케이스 표(엔진과 **같은 표** `_helpers/nbl-state-history-e3-2-table.ts`)를 **폼 상태(AssetForm)** 로 넣는다.
 * 엔진 route anchor(`nbl-state-history-e3-2-route.anchor.test.ts`)는 직접 API raw를 덮어쓰지만, 이 파일은 ④가 만든 body 그대로를 쓴다 — UI가 실제로 보내는 칸이다.
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭) → 엔진 → 세액.
 * 불변: ① ⑧이 통과하는 입력은 ⑫도 통과한다(UI 통과 → 400 금지) ② ④ 와이어 3칸 = 표의 raw ③ 세액·판정 = 엔진 표(오라클) ④ 영위 기간 OFF 와이어는 `false`·`""`·`[]`.
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
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { E3C_ON_ROWS, E3C_ROWS, E3C_SWING_2014, e3cExpectedTax, e3cRowRaw, type E3cRow } from "../tax-engine/_helpers/nbl-state-history-e3-2-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row = (id: string) => E3C_ROWS.find((r) => r.id === id)!;

/** 표의 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 폼 상태 그대로(④ prefix-pick이 운반한다). */
function nblKeysOf(r: E3cRow, on: boolean): Partial<AssetForm> {
  return Object.fromEntries(Object.entries(e3cRowRaw(r, on)).filter(([k]) => !["acquisitionArea", "acquisitionDate", "transferDate"].includes(k))) as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억 단건. 건축물 이력 질문은 표의 raw가 정한다(없으면 «바뀐 적 없음»). */
function formOf(r: E3cRow, on = true, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-06-30";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblOtherStateHistoryMode: "unchanged",
    }, nblKeysOf(r, on), over) as AssetForm,
  ];
  return f;
}

async function run(f: TransferFormData) {
  const body = await captureBody(f);
  const r = await postTransfer(body);
  return { ...r, body, raw: body.nonBusinessLandRaw as Loose, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined, issues: allIssues(f) };
}

describe("④ → ⑧ → ⑫ → 엔진: 케이스 표 21행(영위 기간 ON) — 폼 상태 그대로", () => {
  it.each(E3C_ON_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3cRow) => {
    const res = await run(formOf(r));
    expect(res.issues, "⑧이 통과해야 한다(표는 화면에서 입력 가능한 값이다)").toEqual([]);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    // ④ 와이어 3칸 = 표의 raw (연도 오름차순 · 범위 안 연도만)
    const want = e3cRowRaw(r, true) as Loose;
    expect(res.raw.nblRevenuePeriodOn).toBe(true);
    expect(res.raw.nblRevenueBusinessEndDate).toBe(want.nblRevenueBusinessEndDate);
    expect(res.raw.nblRevenueYearRows).toEqual(want.nblRevenueYearRows);
    // 판정·세액 = 오라클
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    const tax = e3cExpectedTax(r);
    if (tax !== undefined) expect(res.result?.calculatedTax).toBe(tax);
  });
});

describe("④ 와이어 — OFF · 술어 거짓 · stale 값 차단", () => {
  it("영위 기간 OFF: 새 3칸은 false·\"\"·[] — 저장된 폐업일·행이 남아 있어도 닿지 않는다(M11′ 현행 N)", async () => {
    const r = row("M11p");
    const res = await run(formOf(r, true, { nblRevenuePeriodOn: false }));
    expect(res.raw.nblRevenuePeriodOn).toBe(false);
    expect(res.raw.nblRevenueBusinessEndDate).toBe("");
    expect(res.raw.nblRevenueYearRows).toEqual([]);
    expect(res.status).toBe(200);
    expect(res.nbl?.periodEvaluation?.revenueHistory, "OFF = echo 키 부재").toBeUndefined();
    expect(res.nbl?.isNonBusinessLand).toBe(r.current.nonBusiness);
  });

  it("업종을 «해당 없음»으로 되돌리면(토글은 켜진 채) 술어 거짓 — 새 3칸은 비워 보낸다", async () => {
    const res = await run(formOf(row("M11p"), true, { nblRevenueBusinessType: "" }));
    expect(res.raw.nblRevenuePeriodOn).toBe(false);
    expect(res.raw.nblRevenueBusinessEndDate).toBe("");
    expect(res.raw.nblRevenueYearRows).toEqual([]);
    expect(res.status).toBe(200);
  });

  it("지목이 기타토지가 아니면(농지) 술어 거짓 — stale 폐업일·행이 와이어에 닿지 않는다", async () => {
    const res = await run(formOf(row("M11p"), true, { nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true }));
    expect(res.raw.nblRevenuePeriodOn).toBe(false);
    expect(res.raw.nblRevenueYearRows).toEqual([]);
  });

  it("개시일을 늦춰 표에서 사라진 연도의 행은 store에 남아도 보내지 않는다 — 되돌리면 복원", async () => {
    const r = row("M11p"); // 영위 2014-01-02~2021-05-31 → 행 2014~2021
    const rowsAll = (e3cRowRaw(r, true) as Loose).nblRevenueYearRows as Array<{ year: string }>;
    expect(rowsAll.map((x) => x.year)).toEqual(["2014", "2015", "2016", "2017", "2018", "2019", "2020", "2021"]);
    const late = await run(formOf(r, true, { nblRevenueCurrentBusinessStartDate: "2019-06-01" }));
    expect((late.raw.nblRevenueYearRows as Array<{ year: string }>).map((x) => x.year)).toEqual(["2019", "2020", "2021"]);
    expect(late.status, JSON.stringify(late.json).slice(0, 300)).toBe(200);
    // 되돌리면(= 개시일 비움) 같은 store 값이 다시 간다
    const back = await run(formOf(r, true, { nblRevenueCurrentBusinessStartDate: "" }));
    expect((back.raw.nblRevenueYearRows as Array<{ year: string }>).map((x) => x.year)).toEqual(rowsAll.map((x) => x.year));
  });

  it("양도연도 T−1 이후 연도 행(stale)은 보내지 않는다 — ⑫의 «T−1 이후 400» 막다른 길 방지", async () => {
    const r = row("M9p"); // T=2024 → 표는 2022까지
    const res = await run(formOf(r, true, { nblRevenueYearRows: [...((e3cRowRaw(r, true) as Loose).nblRevenueYearRows as []), { year: "2023", revenue: "1", landValue: "1" }, { year: "2024", revenue: "1", landValue: "1" }] }));
    expect((res.raw.nblRevenueYearRows as Array<{ year: string }>).map((x) => x.year)).toEqual(["2022"]);
    expect(res.status).toBe(200);
    expect(res.issues).toEqual([]);
  });
});

describe("대조 — 같은 거래에서 영위 기간 토글만 바꾼다 (세액 변화)", () => {
  /**
   * M11′·V7b는 양도연도에 영위일이 없다(폐업 후 양도) — **OFF(현행)에는 입력 경로가 없다**: ⑧이 «업종 선택 시 당해 수입금액 필수»로 막는다(UI 계획서 §0 문제 ②).
   * 그래서 OFF 쪽은 ⑧을 건너뛰고 body를 직접 POST한 현행 판정과 비교한다(엔진 표의 `current` 열과 같은 값).
   */
  it.each([
    ["M9p", +E3C_SWING_2014, false],
    ["M11p", -E3C_SWING_2014, true],
    ["V7b", +69_750_000, true],
  ] as const)("%s: OFF → ON 세액 변화 %i원 (OFF ⑧ 차단 = %s)", async (id, delta, offBlocked) => {
    const r = row(id);
    const off = await run(formOf(r, false));
    const on = await run(formOf(r, true));
    if (offBlocked) expect(off.issues.map((i) => i.field), "OFF에는 폐업 후 양도 입력 경로가 없다").toEqual(["nblRevenueCurrentRevenue"]);
    else expect(off.issues).toEqual([]);
    expect(on.issues, "ON은 ⑧을 통과한다").toEqual([]);
    expect(off.status).toBe(200);
    expect(on.status).toBe(200);
    expect((on.result?.calculatedTax ?? 0) - (off.result?.calculatedTax ?? 0)).toBe(delta);
  });
});
