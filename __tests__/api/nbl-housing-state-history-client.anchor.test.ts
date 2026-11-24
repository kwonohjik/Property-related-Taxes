/**
 * NBL-STATE-HISTORY-E3-③ A (UI-A-1) — **폼 상태 → ⑧ → ④ 와이어 → ⑫ → ⑭ → 엔진 → 세액** 관통 anchor.
 *
 * 엔진 route anchor(`nbl-state-history-e3-3-route.anchor.test.ts`)는 raw를 직접 덮어쓴다. 이 파일은 **폼 이벤트 행**(`nblOtherStateEvents`)에서 출발해
 * ④ `stateHistoryWireFields`가 만든 body가 엔진에 닿는지를 같은 표(`E3D_A_ROWS` — 오라클)로 고정한다: 입력 → 전송 사건 집합 동일(침묵 drop 0) · 중첩 칸 `houseFootprintBefore`가
 * ⑫ 행 스키마를 지나 엔진 input에 도달(strip되면 구옥 구간이 «모름»으로 접혀 세액이 갈린다 — TS 미감지).
 *
 * mutation 대응(계획서 §11.3 A): ① ④ housing 술어를 기타토지 술어로 되돌림(전 행 `""`로 비워짐) · ③ ⑫ 행 스키마에서 `houseFootprintBefore` 삭제(H3b/H3c 세액) ·
 *   ⑥ ④ `nblOtherHasBuilding` 고정 true 제거(H3c — 토글 stale false) · ⑬ ④ 신축 행에 `houseFootprintBefore` 전송 허용.
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
import { E3D_A_ROWS, E3D_SWING_2014, e3dTradeTax, type E3dARow } from "../tax-engine/_helpers/nbl-state-history-e3-3-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import {
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row = (id: string) => E3D_A_ROWS.find((r) => r.id === id)!;

/** 표 행의 사건 → **폼** 이벤트 행(철거 행에만 정착면적 · 신축 행은 키 없음). */
const formEvents = (r: E3dARow): NblOtherStateEventInput[] =>
  r.events.map(([kind, date, footprint]) => ({ kind, date, propertyTaxTypeBefore: "", ...(kind === "building_removed" ? { houseFootprintBefore: footprint ?? "" } : {}) }));

/** 주택부수토지 폼 — 질문 `changed` + 표의 사건 행. 기본은 «건축물 있음» 토글이 stale false(주택 카드에는 토글이 없다). */
function formOf(r: E3dARow, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "500", transferArea: r.area ?? "500",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: r.metro ?? "no", nblHousingFootprint: r.footprint ?? "100",
      nblOtherHasBuilding: false,
      nblOtherStateHistoryMode: "changed", nblOtherStateEvents: formEvents(r),
      nblGracePeriods: (r.grace ?? []).map((g, i) => ({ id: `g${i}`, ...g })),
    }, over) as AssetForm,
  ];
  return f;
}

async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = await captureBody(f);
  const r = await postTransfer(body);
  return { ...r, issues, body, raw: body.nonBusinessLandRaw as Loose | undefined, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

describe("UI-A 관통 — 표의 A 행(⑧ 통과 행): 폼 사건 → ④ → ⑫ → 엔진 → 세액·고지 = 엔진 오라클", () => {
  // 제외: H3e(정착면적 빈칸 — ⑧ H9 차단 · 아래 «탈출구» describe) · P3-clip(사건이 소유 시작 전 — ⑧ H3b가 차단하는 입력이고 이월과세 하한은 증여자 취득일이라 폼 단건 구매 취득으로 재현하지 않는다 — 엔진 단위·route가 클립을 고정).
  const passing = E3D_A_ROWS.filter((r) => r.notices?.includes("unconfirmed") !== true && r.id !== "P3-clip");

  it.each(passing.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3dARow) => {
    const res = await run(formOf(r));
    expect(res.issues, "⑧ 통과(정착면적 정상 · 정착면적을 모르면 질문 «모름»이 탈출구)").toEqual([]);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    // ④ 전송 사건 집합 = 폼 사건 집합(침묵 drop 0 — 종류·날짜·철거 행 정착면적)
    expect((res.raw?.nblOtherStateEvents as Loose[]).map((e) => [e.kind, e.date, e.houseFootprintBefore ?? null])).toEqual(r.events.map(([k, d, fp]) => [k, d, k === "building_removed" ? (fp ?? "") || null : null]));
    expect(res.raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(res.raw?.nblOtherHasBuilding, "A-12: 주택 카드는 stale 토글(false)이 아니라 true").toBe(true);
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    const tax = e3dTradeTax(r, r.expect.nonBusiness);
    if (tax !== undefined) expect(res.result?.calculatedTax).toBe(tax);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
  });
});

describe("UI-A 관통 — 입력에서 엔진까지 닿는다는 가드(TS 미감지)", () => {
  it("M15 (과소 해소): 질문 `unchanged` 198,210,000(`not_judged`) → `changed` + 신축 2023-06-01 → 253,960,000 (+55,750,000)", async () => {
    const r = row("M15");
    const off = await run(formOf(r, { nblOtherStateHistoryMode: "unchanged" }));
    expect(off.issues).toEqual([]);
    expect(off.raw?.nblOtherStateHistoryMode).toBe("unchanged");
    expect(off.raw?.nblOtherStateEvents).toEqual([]);
    expect(off.nbl?.periodEvaluation?.basis).toBe("not_judged");
    expect(off.result?.calculatedTax).toBe(198_210_000);
    const on = await run(formOf(r));
    expect(on.result?.calculatedTax).toBe(253_960_000);
    expect(on.result.calculatedTax - off.result.calculatedTax).toBe(E3D_SWING_2014);
  });

  it("⑫ 칸 도달(Y-8): H3b 철거 전 정착면적 100이 엔진에 닿아야 구옥 구간이 `within`(사업용 2,770/3,651) — 정착면적 50(초과)이면 같은 입력에서 접혀 N", async () => {
    const r = row("H3b");
    const within = await run(formOf(r));
    expect(within.nbl?.isNonBusinessLand).toBe(false);
    expect(within.nbl?.effectiveBusinessDays).toBe(2770);
    const iv = within.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv[0]).toMatchObject({ buildingKind: "house", houseOutcome: "within", business: true });
    expect(iv[0].houseCheck).toMatchObject({ footprint: 100, allowedArea: 500, landArea: 500 });
    const folded = await run(formOf(r, { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "50" }, { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }] }));
    expect(folded.issues, "정착 50은 ⑧ 통과(양수 · 토지 이하) — 엔진이 초과로 접는다").toEqual([]);
    expect((folded.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[])[0]).toMatchObject({ houseOutcome: "exceeded" });
    expect(folded.nbl?.isNonBusinessLand).toBe(true);
    expect(folded.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  });

  it("T-4 (Y-9): 철거를 먼저 입력(첫 건축물 사건 = 철거) + stale 토글 false — 초기 구간이 주택(⑭ `tailHasBuilding = true`)", async () => {
    const res = await run(formOf(row("H3c"), { nblOtherHasBuilding: false }));
    const iv = res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv.map((v) => [v.hasBuilding, v.buildingKind ?? null])).toEqual([[true, "house"], [false, null], [true, "house"]]);
  });

  it("X9 stale: 철거 행에 숨은 `propertyTaxTypeBefore`(별도합산)가 있어도 판정·와이어에 새지 않는다(Y-16) — 같은 세액", async () => {
    const r = row("H3c");
    const clean = await run(formOf(r));
    const stale = await run(formOf(r, { nblOtherStateEvents: formEvents(r).map((e) => (e.kind === "building_removed" ? { ...e, propertyTaxTypeBefore: "separate" as const } : e)) }));
    expect((stale.raw?.nblOtherStateEvents as Loose[])[0].propertyTaxTypeBefore).toBe("");
    expect(stale.result?.calculatedTax).toBe(clean.result?.calculatedTax);
  });

  it("X3 `unknown`: 현행 판정 + UNKNOWN 고지 · X1 `\"\"`: ⑧이 막는다(미입력 ≠ 미해당)", async () => {
    const r = row("M15");
    const unknown = await run(formOf(r, { nblOtherStateHistoryMode: "unknown" }));
    expect(unknown.issues).toEqual([]);
    expect(unknown.result?.calculatedTax).toBe(198_210_000);
    expect(unknown.nbl?.warnings).toContain(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    const blank = await run(formOf(r, { nblOtherStateHistoryMode: "" }));
    expect(blank.issues.map((i) => i.field)).toContain("nblOtherStateHistoryMode");
  });

  it("X12 배율 초과(양도일 현재 정착 40㎡ → 한도 200㎡ < 500㎡): 질문·검증은 그대로(⑧ 통과) · 이력은 판정에 반영되지 않고(현행 비율) PARTIAL 고지", async () => {
    const r = row("M15");
    const res = await run(formOf(r, { nblHousingFootprint: "40" }));
    expect(res.issues).toEqual([]);
    expect(res.raw?.nblOtherStateHistoryMode, "④는 배율로 게이트하지 않는다 — 사건이 그대로 닿는다").toBe("changed");
    expect(res.nbl?.periodEvaluation?.basis).toBe("not_judged");
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE);
  });

  it("X6 stale 연접 다필지(기타토지 칸) ON — 주택은 이 칸을 읽지 않는다: 이력이 그대로 닿는다(D5가 막던 «비워 보냄»이 아니다)", async () => {
    const r = row("M15");
    const res = await run(formOf(r, { nblOtherUseParcels: true }));
    expect(res.raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(res.result?.calculatedTax).toBe(253_960_000);
  });

  it("X10 stale 양도일 의제 사유 — 영향 0(주택은 의제 비적용 · ④가 `none`으로 덮음): 같은 세액", async () => {
    const r = row("M15");
    const res = await run(formOf(r, { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-01-01" } as Partial<AssetForm>));
    expect(res.raw?.nblDeemedTransferReason).toBe("none");
    expect(res.result?.calculatedTax).toBe(253_960_000);
  });

  it("X19 지목 왕복: 주택 → 기타토지로 바꾸면 body 이력이 기타토지 규칙으로 바뀌고(철거 행 정착면적 미전송) 주택 카드로 돌아오면 복원된다", async () => {
    const r = row("H3c");
    const asOther = await run(formOf(r, { nblLandType: "other_land", nblOtherPropertyTaxType: "comprehensive" }));
    expect((asOther.raw?.nblOtherStateEvents as Loose[]).every((e) => !("houseFootprintBefore" in e))).toBe(true);
    const back = await run(formOf(r));
    expect((back.raw?.nblOtherStateEvents as Loose[])[0].houseFootprintBefore).toBe("100");
  });
});

describe("UI-A — 정착면적을 모르면 이력 질문 «모름»이 탈출구(H9 안내) — 현행 판정 + 확인 필요", () => {
  it("H3e: 정착면적 빈칸 → ⑧ 차단(H9) · 질문을 «모름»으로 바꾸면 통과 + 현행 세액", async () => {
    const r = row("H3e");
    const blocked = await run(formOf(r));
    expect(blocked.issues.map((i) => i.field)).toEqual(["nblOtherStateEvents.0.houseFootprintBefore"]);
    expect(blocked.issues[0].message).toContain("「모름」");
    const escape = await run(formOf(r, { nblOtherStateHistoryMode: "unknown" }));
    expect(escape.issues).toEqual([]);
    expect(escape.result?.calculatedTax).toBe(198_210_000);
  });
});

describe("UI-A — 사건일이 소유 시작 전(H3b) — ⑧만 차단 · ⑫ 200(엔진이 클립)", () => {
  it("P3-clip 입력을 일반 취득 폼에 넣으면 ⑧ H3b가 날짜 칸으로 점프시키고, 같은 body는 ⑫가 200이다", async () => {
    const res = await run(formOf(row("P3-clip")));
    expect(res.issues.map((i) => i.field)).toEqual(["nblOtherStateEvents.0.date"]);
    expect(res.status).toBe(200);
    expect(res.nbl?.isNonBusinessLand).toBe(false);
    expect(res.nbl?.effectiveBusinessDays).toBe(30);
  });
});
