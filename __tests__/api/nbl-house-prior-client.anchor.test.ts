/**
 * NBL-STATE-HISTORY-E3-③ B (UI-B-1) — **폼 상태 → ⑧ → ④ 와이어 → ⑫ → ⑭ → 엔진 → 세액** 관통 anchor (기타토지 카드 · 철거 행 «철거된 건축물 = 주택»).
 *
 * 엔진 route anchor(`nbl-state-history-e3-3b-route.anchor.test.ts`)는 raw를 직접 덮어쓴다(그때는 ④가 B를 몰랐다). 이 파일은 **폼 이벤트 행**(`nblOtherStateEvents`·`nblIsMetropolitanArea`)에서 출발해
 * 같은 표(`E3D_B_ROWS` — 오라클)를 **덮어쓰기 없이** 단언한다: ④가 종류 칸·정착면적을 싣고, 수도권 칸을 **비우지 않는지**(BP1 — 안 열면 서버가 보수적 3배로 읽어 5배 토지가 «초과»로 접힌다), 중첩 칸이 ⑫를 지나 도달하는지.
 *
 * mutation 대응(계획서 §11.3 B): ⑰ ④ `metro` 게이트에서 `housePriorNeedsMetropolitanOf` 제거(B1·수도권 «no» 행이 3배로 접혀 N) · ⑳ ⑫ 행 스키마에서 `buildingKindBefore` 삭제(주택 행이 종전 사슬로 읽혀 N) ·
 *   ㉑ ④ «그 밖» 철거 행에도 `houseFootprintBefore` 전송(바이트 동일 가드) · ⑯ `housePriorNeedsMetropolitanOf`가 폼 저장 events를 읽음(unchanged + stale 행 가드).
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
import { E3D_B_ROWS, e3dBRowRaw, type BEv, type E3dBRow } from "../tax-engine/_helpers/nbl-state-history-e3-3b-table";
import { housePriorNeedsMetropolitanOf } from "@/lib/calc/nbl-other-state-history-scope";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import {
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row = (id: string) => E3D_B_ROWS.find((r) => r.id === id)!;
const N = 253_960_000;
const B = 198_210_000;

/** 표의 사건 → **폼** 이벤트 행. 주택 철거 행은 종류 칸(`house`) + 정착면적, 그 밖의 철거 행은 철거 직전 재산세 구분. */
function formEvents(r: E3dBRow): NblOtherStateEventInput[] {
  return r.events.map((ev: BEv): NblOtherStateEventInput => {
    if (ev.kind === "building_built") return { kind: "building_built", date: ev.date, propertyTaxTypeBefore: "" };
    if (ev.house === false) return { kind: "building_removed", date: ev.date, propertyTaxTypeBefore: ev.taxBefore ?? "separate" };
    return { kind: "building_removed", date: ev.date, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: ev.fp ?? "200" };
  });
}

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 이력(모드·사건)은 폼 이벤트로 넣는다. */
function nblKeysOf(r: E3dBRow): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e3dBRowRaw(r, { history: false });
  return nbl as Partial<AssetForm>;
}

/** 기타토지(잡종지) 1,000㎡ · 취득가 3억 · 양도가 10억 단건 — 질문 `changed` + 표의 사건 행. 덮어쓰기 없음. */
function formOf(r: E3dBRow, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "1000", transferArea: r.area ?? "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblKeysOf(r), {
      nblIsMetropolitanArea: r.metroOmit ? "" : (r.metro ?? "no"),
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

const houseIv = (r: { nbl?: Loose }) => ((r.nbl?.periodEvaluation?.stateHistory?.intervals ?? []) as Loose[]).filter((i) => i.buildingKind === "house");

describe("UI-B 관통 — 표의 B 행(⑧ 통과 행): 폼 사건 → ④ → ⑫ → 엔진 → 세액·고지 = 엔진 오라클", () => {
  // ⑧이 막는 행(정착면적 빈칸·0·음수·비수치·정착>토지)은 아래 «H9 차단 격자»가 단언한다. 나머지는 ⑧ 통과여야 한다.
  const blocked = new Set(["B6", "B15-0", "B15-neg", "B15-abc", "B15-1200"]);
  const passing = E3D_B_ROWS.filter((r) => !blocked.has(r.id));

  it.each(passing.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3dBRow) => {
    const res = await run(formOf(r));
    // 소유 시작 전 사건(클립 행 — ⑧ H3b가 날짜 칸으로 막는 입력)은 ⑧ 단독 차단이다(⑫ 200). 그 외에는 ⑧ 통과여야 한다.
    const dateOnly = res.issues.length > 0 && res.issues.every((i) => /^nblOtherStateEvents\.\d+\.date$/.test(i.field ?? ""));
    if (!dateOnly) expect(res.issues, "⑧ 통과(정착면적 정상 · 수도권 선택)").toEqual([]);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    // ④ 전송 사건 집합 = 폼 사건 집합(침묵 drop 0) — 철거 행은 종류 칸 + 정착면적, 그 밖은 키 없음
    const sent = res.raw?.nblOtherStateEvents as Loose[];
    expect(sent.map((e) => [e.kind, e.date])).toEqual(r.events.map((e) => [e.kind, e.date]));
    r.events.forEach((e, i) => {
      if (e.kind === "building_removed" && e.house !== false) {
        expect(sent[i], `${i}번째 철거 행`).toMatchObject({ buildingKindBefore: "house", houseFootprintBefore: e.fp ?? "200" });
        expect(sent[i].propertyTaxTypeBefore, "T-5: 주택 철거 행은 재산세 구분을 싣지 않는다").toBe("");
      } else {
        expect(sent[i], `${i}번째 행 — 종류 칸·정착면적 미전송`).not.toHaveProperty("buildingKindBefore");
        expect(sent[i]).not.toHaveProperty("houseFootprintBefore");
      }
    });
    expect(res.raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(res.result?.calculatedTax).toBe(r.expect.tax);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    const iv = houseIv(res);
    expect(iv.map((i) => i.houseOutcome)).toEqual(r.outcomes.slice(0, iv.length));
    if (iv.length > 0) {
      expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
      expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    }
  });
});

describe("UI-B 관통 — 입력에서 엔진까지 닿는다는 가드(TS 미감지)", () => {
  it("B1 (EB1 과대 해소): 종류 «그 밖»(별도합산 위장) B 198,210,000 · 종류 «주택» + 정착 200 → 같은 거래·같은 철거일에서 B 198,210,000 · 종류 없이 «모름» 사슬이면 N 253,960,000", async () => {
    const house = await run(formOf(row("B-M1")));
    expect(house.issues).toEqual([]);
    expect(house.result?.calculatedTax).toBe(B);
    expect(houseIv(house)[0]).toMatchObject({ houseOutcome: "within", business: true, houseCheck: { footprint: 200, allowedArea: 1000, landArea: 1000, multiplier: 5 } });
    const legacy = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }] }));
    expect(legacy.result?.calculatedTax).toBe(N);
    expect(houseIv(legacy)).toEqual([]);
    const other = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }] }));
    expect(other.result?.calculatedTax, "EB5: «그 밖» + 별도합산은 바이트 동일 B").toBe(B);
    expect(other.raw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }]);
    expect(house.result.calculatedTax - legacy.result.calculatedTax).toBe(B - N);
  });

  it("BP1 해소(수도권 값이 ④에서 비워지지 않는다): 같은 정착 200㎡ · 일반주거 — 수도권 «no» → 5배(허용 1,000) 이내 B · «yes» → 3배(허용 600) 초과 N. ④가 수도권을 비우면 둘 다 3배로 읽혀 «no»가 N이 된다", async () => {
    const no = await run(formOf({ ...row("B-M1"), metro: "no" }));
    expect(no.raw?.nblIsMetropolitanArea).toBe("no");
    expect(no.issues).toEqual([]);
    expect(houseIv(no)[0].houseCheck).toMatchObject({ multiplier: 5, allowedArea: 1000 });
    expect(no.result?.calculatedTax).toBe(B);
    const yes = await run(formOf({ ...row("B-M1"), metro: "yes" }));
    expect(yes.raw?.nblIsMetropolitanArea).toBe("yes");
    expect(houseIv(yes)[0]).toMatchObject({ houseOutcome: "exceeded", houseCheck: { multiplier: 3, allowedArea: 600, excessArea: 400 } });
    expect(yes.result?.calculatedTax).toBe(N);
    expect(yes.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  });

  it("EB3 경계 — 수도권 333.34(허용 1,000.02 이내) / 333.33(허용 999.99 → 초과 0.01㎡) · 비수도권으로 바꾸면 같은 정착면적이 5배 기준", async () => {
    const within = await run(formOf(row("B1c-333.34")));
    expect(within.result?.calculatedTax).toBe(B);
    const over = await run(formOf(row("B1c-333.33")));
    expect(over.result?.calculatedTax).toBe(N);
    expect(houseIv(over)[0]).toMatchObject({ houseOutcome: "exceeded", houseCheck: { excessArea: 0.01 } });
    const asNon = await run(formOf({ ...row("B1c-333.33"), metro: "no" }));
    expect(houseIv(asNon)[0]).toMatchObject({ houseOutcome: "within", houseCheck: { multiplier: 5 } });
  });

  it("EB2 경계 — 비수도권 정착 199.99(허용 999.95 → 초과 0.05㎡) / 200.00(이내): 0.05㎡가 B ↔ N 절벽을 가른다", async () => {
    expect((await run(formOf(row("B1b")))).result?.calculatedTax).toBe(N);
    expect((await run(formOf(row("B1-200.00")))).result?.calculatedTax).toBe(B);
  });

  it("EB4 수도권 칸 조건부 — 녹지(수도권이 배율을 안 가르는 용도지역)는 수도권을 «yes»로 입력해도 서버로 보내지 않는다(술어 거짓 → `\"\"`) · 판정은 5배 그대로", async () => {
    const res = await run(formOf({ ...row("B-M1"), zone: "green", metro: "yes" }));
    expect(res.raw?.nblIsMetropolitanArea).toBe("");
    expect(houseIv(res)[0].houseCheck.multiplier).toBe(5);
  });

  it("EB4 «그 밖» 철거 행 · 철거 행 없음 — 기존 기타토지 입력은 수도권을 보내지 않는다(변화 0)", async () => {
    const legacy = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }], nblIsMetropolitanArea: "yes" }));
    expect(legacy.raw?.nblIsMetropolitanArea).toBe("");
    const built = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "" }], nblIsMetropolitanArea: "yes", nblOtherHasBuilding: true }));
    expect(built.raw?.nblIsMetropolitanArea).toBe("");
  });

  it("EB7 stale: 철거 행을 «주택»→«그 밖»으로 바꾸면(저장 정착면적 잔존) body에 정착면적·종류가 없고 · 모드 `unchanged`(stale 주택 행)면 수도권을 보내지 않으며 H10도 없다", async () => {
    const toOther = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate", houseFootprintBefore: "200" }] }));
    expect(toOther.raw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }]);
    const unchanged = await run(formOf(row("B-M1"), { nblOtherStateHistoryMode: "unchanged", nblIsMetropolitanArea: "" }));
    expect(unchanged.issues, "stale 주택 행 + unchanged → 화면에 없는 수도권 칸 요구(막다른 길) 금지").toEqual([]);
    expect(unchanged.raw?.nblIsMetropolitanArea).toBe("");
    expect(unchanged.raw?.nblOtherStateEvents).toEqual([]);
    expect(unchanged.nbl?.periodEvaluation?.basis).not.toBe("state_history");
    // ⑯ 술어는 **와이어 사건**을 읽는다 — 폼 저장 사건(stale 주택 행)을 읽으면 `unchanged`인데도 수도권 값이 서버로 닿는다
    const staleMetro = await run(formOf(row("B-M1"), { nblOtherStateHistoryMode: "unchanged", nblIsMetropolitanArea: "yes" }));
    expect(staleMetro.raw?.nblIsMetropolitanArea, "stale 주택 행 + unchanged: 수도권 미전송").toBe("");
    expect(housePriorNeedsMetropolitanOf(formOf(row("B-M1"), { nblOtherStateHistoryMode: "unchanged" }).assets[0], "2024-01-01")).toBe(false);
    expect(housePriorNeedsMetropolitanOf(formOf(row("B-M1")).assets[0], "2024-01-01")).toBe(true);
  });

  it("X29 연접 다필지 ON(기타토지 칸) — 질문·행이 화면에 없으므로 이력·수도권 모두 전송하지 않고 ⑧도 요구하지 않는다", async () => {
    const res = await run(formOf(row("B-M1"), { nblOtherUseParcels: true, nblIsMetropolitanArea: "" }));
    expect(res.raw?.nblOtherStateHistoryMode).toBe("");
    expect(res.raw?.nblOtherStateEvents).toEqual([]);
    expect(res.raw?.nblIsMetropolitanArea).toBe("");
    expect(res.issues.some((i) => i.field === "nblIsMetropolitanArea" || (i.field ?? "").startsWith("nblOtherStateEvents"))).toBe(false);
  });

  it("EB10 / UQ-12 (가): 양도일 의제 사유 선택 — 정착면적 빈칸·수도권 미선택이어도 ⑧이 B 새 규칙을 건너뛴다 · 엔진도 이력을 읽지 않는다(DEEMED 고지) · 사유를 «없음»으로 되돌리면 다시 요구", async () => {
    const deemed = { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01" } as Partial<AssetForm>;
    const events = [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "" }] as NblOtherStateEventInput[];
    const skipped = await run(formOf(row("B-M1"), { ...deemed, nblOtherStateEvents: events, nblIsMetropolitanArea: "" }));
    expect(skipped.issues.filter((i) => i.field === "nblIsMetropolitanArea" || (i.field ?? "").endsWith("houseFootprintBefore"))).toEqual([]);
    expect(skipped.status).toBe(200);
    expect(skipped.nbl?.periodEvaluation?.basis).not.toBe("state_history");
    const back = await run(formOf(row("B-M1"), { nblDeemedTransferReason: "none", nblOtherStateEvents: events, nblIsMetropolitanArea: "" }));
    expect(back.issues.map((i) => i.field)).toContain("nblOtherStateEvents.0.houseFootprintBefore");
  });
});

describe("UI-B — H9·H10 ⑧ 단독 차단 격자 + 탈출구(질문 «모름»)", () => {
  it.each([
    ["B6 빈칸", "B6"],
    ["B15-0 정착 0", "B15-0"],
    ["B15-neg 정착 −5", "B15-neg"],
    ["B15-abc 비수치", "B15-abc"],
    ["B15-1200 정착 1,200 > 토지 1,000", "B15-1200"],
  ])("%s → ⑧ H9 차단(행 앵커 `nblOtherStateEvents.0.houseFootprintBefore` · 「건축물 사건 1번째 행」 · 탈출구 «모름» 안내) · ⑫는 200(엔진 접힘 = 현행 N) · 질문을 «모름»으로 바꾸면 통과", async (_n, id) => {
    const f = formOf(row(id));
    const res = await run(f);
    const h9 = res.issues.find((i) => i.field === "nblOtherStateEvents.0.houseFootprintBefore");
    expect(h9, JSON.stringify(res.issues)).toBeDefined();
    expect(h9!.message).toContain("기타토지 — 건축물 사건 1번째 행");
    // 탈출구 안내는 엔진 leaf 문구가 «빈칸»·«정착 > 토지»에 싣는다(D-17) — 비수치·0·음수는 값을 고치면 되므로 안내가 없다.
    if (["B6", "B15-1200"].includes(id)) expect(h9!.message).toContain("「모름」");
    expect(res.status, "⑧ 단독 차단 행은 ⑫ 400이 아니다").toBe(200);
    expect(res.result?.calculatedTax).toBe(N);
    const escape = await run(formOf(row(id), { nblOtherStateHistoryMode: "unknown" }));
    expect(escape.issues).toEqual([]);
    expect(escape.result?.calculatedTax).toBe(N);
  });

  it("H10: 주·상·공 + 수도권 «미확인»/미선택 → ⑧ 차단(점프 `nblIsMetropolitanArea`) · ⑫ 200(보수적 3배 + 기존 경고) · 수도권을 답하면 통과", async () => {
    for (const metro of ["", "unknown"] as const) {
      const res = await run(formOf({ ...row("B-M1"), metro }));
      const h10 = res.issues.find((i) => i.field === "nblIsMetropolitanArea");
      expect(h10, `metro=${JSON.stringify(metro)} ${JSON.stringify(res.issues)}`).toBeDefined();
      expect(h10!.message).toContain("기타토지 — ");
      expect(res.status).toBe(200);
      expect(houseIv(res)[0].houseCheck.multiplier, "서버는 보수적 3배").toBe(3);
    }
    expect((await run(formOf(row("B-M1")))).issues).toEqual([]);
  });

  it("H10 순서 = 화면 순서: 행 규칙(H9)이 수도권 규칙보다 먼저 막는다(수도권 칸이 사건 행 목록 아래에 있다)", async () => {
    const res = await run(formOf({ ...row("B6"), metro: "" }));
    expect(res.issues[0]?.field).toBe("nblOtherStateEvents.0.houseFootprintBefore");
  });

  it("P12: 녹지 · 도시지역 밖 — 수도권 칸이 없으므로 수도권 빈칸은 통과", async () => {
    for (const zone of ["green", "management"] as const) {
      const res = await run(formOf({ ...row("B-M1"), zone, metro: "" }));
      expect(res.issues, zone).toEqual([]);
    }
  });

  it("H11: 주택 구간 안 `tax_type_changed` → ⑧ 차단(행 종류 앵커) · ⑫ 400 — 같은 leaf 문구 · 신축 행의 종류 stale은 ⑧이 막고 ⑫도 400(직접 API) · 구간 밖 구분 변경은 통과", async () => {
    const inside = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "200" }] }));
    expect(inside.issues.map((i) => i.field)).toEqual(["nblOtherStateEvents.1.kind"]);
    expect(inside.status).toBe(400);
    expect(inside.issues[0].message).toContain("구분이 바뀐 건축물 구간은 「주택」으로 입력할 수 없습니다");
    expect(JSON.stringify(inside.json)).toContain("구분이 바뀐 건축물 구간은 「주택」으로 입력할 수 없습니다");
    const outside = await run(formOf(row("B-M1"), { nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "200" }, { kind: "tax_type_changed", date: "2022-01-01", propertyTaxTypeBefore: "comprehensive" }] }));
    expect(outside.issues).toEqual([]);
    expect(outside.status).toBe(200);
  });
});
