/**
 * NBL-STATE-HISTORY-E3-③ A (E3d-1) — route 관통 anchor: 와이어 칸(`nblOtherStateEvents`의 `houseFootprintBefore`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §5(⑫ 중첩 칸 — 침묵 strip은 TS 미감지, route 관통이 유일한 안전망) · §6.1 · §7.2 Anchor 6 · §7.3 Y-8·Y-9·Y-16
 * 표: `_helpers/nbl-state-history-e3-3-table.ts` — 엔진 단위(`nbl-state-history-e3-3.anchor.test.ts`)와 같은 표.
 *
 * mutation 대응: Y-8(⑫ Zod에서 `houseFootprintBefore` 삭제 = strip) = H3b·H3·«⑫ 칸 도달» 가드 · Y-9(⑭ `tailHasBuilding`을 토글로 되돌림) = H3c 계열 ·
 *   Y-10(D-1 차단 제거) = X1 · Y-11(D-2 차단 제거) = X2.
 *
 * ⚠️ 입력 경로: **직접 API raw**다. ④ `stateHistoryWireFields`(lib/calc/nbl-other-state-history-scope.ts)는 UI PR이 주택 카드의 새 칸을 싣도록 교체한다 — 지금은 폼으로 body를 만든 뒤 이력 칸만 표의 raw로 덮어쓴다(E3-① route anchor와 같은 방식).
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
import { E3D_A_ROWS, E3D_SWING_2014, e3dARowRaw, e3dTradeTax, type E3dARow } from "../tax-engine/_helpers/nbl-state-history-e3-3-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3D_A_ROWS.find((r) => r.id === id)!;

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 자산에 직접 얹으면 ④ prefix-pick이 운반한다(이력 칸은 아래 `run`이 덮어쓴다). */
function nblKeysOf(r: E3dARow): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e3dARowRaw(r, { history: false });
  return nbl as Partial<AssetForm>;
}

/** 주택부수토지 500㎡ · 취득가 3억 · 양도가 10억 단건. */
function formOf(r: E3dARow, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "500", transferArea: r.area ?? "500",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblKeysOf(r), over) as AssetForm,
  ];
  return f;
}

/** 폼 → body 캡처 → 이력 칸(모드·사건)을 표의 raw로 덮어쓰고 POST. */
async function run(f: TransferFormData, events: unknown, mutate?: (raw: Loose) => void) {
  const body = await captureBody(f);
  const raw = body.nonBusinessLandRaw as Loose;
  raw.nblOtherStateHistoryMode = "changed";
  raw.nblOtherStateEvents = events;
  mutate?.(raw);
  const r = await postTransfer(body);
  return { ...r, body, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const runRow = (r: E3dARow) => run(formOf(r), e3dARowRaw(r).nblOtherStateEvents);
const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

describe("E3d-1 route 관통 — 엔진 계획서 §6.1 A 행(단건): 입력 → ⑫ → ⑭ → 엔진 → 세액 · 고지", () => {
  it.each(E3D_A_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3dARow) => {
    const res = await runRow(r);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.body.nonBusinessLandRaw, "④가 raw를 싣는다").toBeDefined();
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    const tax = e3dTradeTax(r, r.expect.nonBusiness);
    if (tax !== undefined) expect(res.result?.calculatedTax).toBe(tax);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
    expect(res.nbl?.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    if (r.expect.nonBusiness) expect(res.nbl?.surcharge?.nonBusinessAreaRatio).toBe(1); // T-1
  });

  it("⑫ 칸 도달 가드(Y-8 — TS 미감지): H3b는 철거 전 정착면적 100(이내)이 서버에 닿아야 사업용(2,770/3,651)이다 — Zod가 `houseFootprintBefore`를 strip하면 구옥 구간이 «모름»으로 접혀 N이 된다", async () => {
    const res = await runRow(row("H3b"));
    expect(res.nbl?.isNonBusinessLand).toBe(false);
    expect(res.nbl?.effectiveBusinessDays).toBe(2770);
    const iv = res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv[0]).toMatchObject({ buildingKind: "house", houseOutcome: "within", business: true });
    expect(iv[0].houseCheck).toMatchObject({ footprint: 100, allowedArea: 500, landArea: 500 });
    // 같은 행에서 정착면적만 빈칸이면 접힌다(칸이 따로 도달함을 증명 — 100이 와도 전부 접히는 strip과 구별)
    const folded = await run(formOf(row("H3b")), [{ kind: "building_removed", date: "2021-01-01" }, { kind: "building_built", date: "2023-06-01" }]);
    expect(folded.status).toBe(200);
    expect(folded.nbl?.isNonBusinessLand).toBe(true);
    expect((folded.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[])[0].houseOutcome).toBe("unconfirmed");
  });

  it("M15 과소 해소: 같은 거래에서 모드만 끄면 현행 B 198,210,000(`not_judged`) · 이력을 켜면 N 253,960,000 (+55,750,000)", async () => {
    const r = row("M15");
    const off = await run(formOf(r), [], (raw) => { raw.nblOtherStateHistoryMode = ""; });
    expect(off.status).toBe(200);
    expect(off.nbl?.periodEvaluation?.basis).toBe("not_judged");
    expect(off.result?.calculatedTax).toBe(198_210_000);
    const on = await runRow(r);
    expect(on.result?.calculatedTax).toBe(253_960_000);
    expect(on.result.calculatedTax - off.result.calculatedTax).toBe(E3D_SWING_2014);
  });

  it("T-4 (Y-9): 철거를 먼저 입력(첫 건축물 사건 = 철거)한 H3c는 주택 카드에 `nblOtherHasBuilding` 토글이 없어도 초기 주택 구간으로 읽힌다(⑭가 `tailHasBuilding = true`)", async () => {
    const res = await runRow(row("H3c"));
    const iv = res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv.map((v) => [v.hasBuilding, v.buildingKind ?? null])).toEqual([[true, "house"], [false, null], [true, "house"]]);
    // UI-A(2026-11-24) — ④가 주택 카드의 `nblOtherHasBuilding`을 true로 고정해 싣는다(A-12 · ⑭ `tailHasBuilding = true`와 같은 값). 종전(엔진 PR)에는 저장 토글 그대로였다.
    expect((res.body.nonBusinessLandRaw as Loose).nblOtherHasBuilding).toBe(true);
  });
});

describe("E3d-1 Q-3a (나) 경계(S1~S3) · 모드 — route", () => {
  it("S1: 배율 초과(1,000㎡) + 신축 앞 나대지 — 이력 미반영(현행 비율 0.5 · 199,720,000) + PARTIAL_AREA 고지", async () => {
    const r = row("M15");
    const res = await run(formOf(r, { acquisitionArea: "1000", transferArea: "1000" }), e3dARowRaw(r).nblOtherStateEvents, (raw) => { raw.acquisitionArea = "1000"; });
    expect(res.status, JSON.stringify(res.json).slice(0, 300)).toBe(200);
    expect(res.nbl?.periodEvaluation?.basis).toBe("not_judged");
    expect(res.nbl?.areaProportioning?.nonBusinessRatio).toBe(0.5);
    expect(res.result?.calculatedTax).toBe(199_720_000);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE);
  });

  it("`unknown`: 현행 판정(198,210,000) + UNKNOWN 고지 1줄 · `unchanged`·`\"\"`: 현행(고지 없음)", async () => {
    const r = row("M15");
    const unknown = await run(formOf(r), [], (raw) => { raw.nblOtherStateHistoryMode = "unknown"; });
    expect(unknown.result?.calculatedTax).toBe(198_210_000);
    expect(unknown.nbl?.warnings).toContain(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    for (const mode of ["", "unchanged"]) {
      const res = await run(formOf(r), [], (raw) => { raw.nblOtherStateHistoryMode = mode; });
      expect(res.status, mode).toBe(200);
      expect(res.result?.calculatedTax, mode).toBe(198_210_000);
      expect(res.nbl?.warnings, mode).not.toContain(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
      expect(res.nbl?.periodEvaluation?.basis, mode).toBe("not_judged");
    }
  });
});

describe("E3d-1 ⑫ — 직접 API 계약: 정착면적 오입력은 400이 아니라 접힘(Q-10 (가) · D-16) · 구조 규칙(D-1·D-2)은 400 · 문구 «주택 사건»", () => {
  const rmRow = (fp: string | undefined) => ({ kind: "building_removed", date: "2016-01-01", ...(fp === undefined ? {} : { houseFootprintBefore: fp }) });
  const builtRow = { kind: "building_built", date: "2023-01-01" };

  it.each([
    ["빈칸", ""],
    ["미전송", undefined],
    ["0", "0"],
    ["-5", "-5"],
    ["abc", "abc"],
    ["정착 600 > 토지 500", "600"],
  ])("정착면적 %s → 200 · 접힘(`unconfirmed`) + UNCONFIRMED 고지 — «이내»로 읽지 않는다(Y-31)", async (_n, fp) => {
    const res = await run(formOf(row("H3c")), [rmRow(fp), builtRow]);
    expect(res.status, errorText(res).slice(0, 300)).toBe(200);
    expect((res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[])[0].houseOutcome).toBe("unconfirmed");
    expect(res.nbl?.isNonBusinessLand).toBe(true);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE);
  });

  it("초과(50㎡) → 200 · `exceeded` + EXCEEDED 고지 · «초과»가 «모름»(빈칸)보다 유리하지 않다 — 같은 수(Y-7)", async () => {
    const exceeded = await run(formOf(row("H3c")), [rmRow("50"), builtRow]);
    const unknown = await run(formOf(row("H3c")), [rmRow(""), builtRow]);
    expect(exceeded.status).toBe(200);
    expect(exceeded.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
    expect(exceeded.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    expect(exceeded.result?.calculatedTax).toBe(unknown.result?.calculatedTax);
    expect(exceeded.nbl?.effectiveBusinessDays).toBe(unknown.nbl?.effectiveBusinessDays);
  });

  it("X1 D-1: 마지막 건축물 사건이 철거 → 400 + «지목을 「나대지·잡종지」로 바꿔» 안내 · 문구 주체 «주택 사건»", async () => {
    const res = await run(formOf(row("H3c")), [builtRow, { kind: "building_removed", date: "2023-06-01", houseFootprintBefore: "100" }]);
    expect(res.status).toBe(400);
    const text = errorText(res);
    expect(text).toContain("주택 사건 2번째 행");
    expect(text).toContain("나대지·잡종지");
  });

  it("X2 D-2: `tax_type_changed` 사건 → 400(주택 구간에는 토지 재산세 구분이 없다)", async () => {
    const res = await run(formOf(row("H3c")), [{ kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "separate" }, builtRow]);
    expect(res.status).toBe(400);
    expect(errorText(res)).toContain("재산세 과세 구분 변경");
    expect(errorText(res)).toContain("주택");
  });

  it("X3: 같은 날 · 역순 · 양도일 이후 · `changed` + 0건 — 기타토지와 같은 leaf·같은 규칙이되 문구 주체만 «주택 사건»", async () => {
    const sameDay = await run(formOf(row("H3c")), [rmRow("100"), { kind: "building_built", date: "2016-01-01" }]);
    expect(sameDay.status).toBe(400);
    expect(errorText(sameDay)).toContain("주택 사건 2번째 행");
    expect(errorText(sameDay)).toContain("같은 날");
    const afterTransfer = await run(formOf(row("H3c")), [{ kind: "building_built", date: "2024-06-01" }]);
    expect(afterTransfer.status).toBe(400);
    const empty = await run(formOf(row("H3c")), []);
    expect(empty.status).toBe(400);
    expect(errorText(empty)).toContain("주택이 새로 생기거나 없어진 적이 있다고 답했으나 사건이 없습니다");
  });

  it("`unchanged`·`unknown`·`\"\"` 모드는 구조 규칙을 읽지 않는다(stale 행이 400을 만들지 않는다)", async () => {
    for (const mode of ["", "unchanged", "unknown"]) {
      const res = await run(formOf(row("H3c")), [{ kind: "tax_type_changed", date: "2020-01-01" }], (raw) => { raw.nblOtherStateHistoryMode = mode; });
      expect(res.status, mode).toBe(200);
    }
  });

  it("Y-16: 철거 행에 숨은 stale `propertyTaxTypeBefore`(별도합산)를 보내도 판정에 새지 않는다 — 정착면적 빈칸이면 같은 N", async () => {
    const res = await run(formOf(row("H3c")), [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, builtRow]);
    expect(res.status).toBe(200);
    expect(res.nbl?.isNonBusinessLand).toBe(true);
    expect((res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[])[0].houseOutcome).toBe("unconfirmed");
  });
});

describe("E3d-1 route 관통 — 다건 입구", () => {
  it("다건 route: 같은 raw가 단건과 같은 판정으로 이력에 닿는다 — M15(과소 해소: 비사업용) · H3b(사업용)", async () => {
    for (const id of ["M15", "H3b"] as const) {
      const r = row(id);
      const body = await buildMultiBody([formOf(r)]);
      const rawHolder = ((body as Loose).properties as Loose[])?.[0]?.nonBusinessLandRaw as Loose | undefined;
      expect(rawHolder, `${id} 다건 body에 raw가 있다`).toBeDefined();
      rawHolder!.nblOtherStateHistoryMode = "changed";
      rawHolder!.nblOtherStateEvents = e3dARowRaw(r).nblOtherStateEvents;
      const multi = await postMulti(body);
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, id).toBe("state_history");
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
    }
  });
});
