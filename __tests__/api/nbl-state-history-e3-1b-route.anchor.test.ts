/**
 * NBL-STATE-HISTORY-E3-1b (E3b-1) — route 관통 anchor: 와이어 칸(`nblOtherStateEvents`의 `propertyTaxBasisBefore`·`areaWithinLimitBefore`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md §5(R1~R18) · §6(⑫ 신규 칸 2개 — 침묵 strip은 TS 미감지, route 관통이 유일한 안전망) · §7.2 Anchor 6
 * 표: `_helpers/nbl-state-history-e3-1b-table.ts` — 엔진 단위(`nbl-state-history-e3-1b.anchor.test.ts`)와 같은 표.
 *
 * mutation 대응: P-b9(⑫ Zod에서 새 칸 누락 = strip) = R1·R4·R7·R3 전 행 + «⑫ 칸 도달» 가드 · P-b8(⑭ 운반 누락) = 같은 가드.
 *
 * ⚠️ 입력 경로: **직접 API raw**다. ④ `stateHistoryWireFields`(lib/calc/nbl-other-state-history-scope.ts)는 UI PR이 새 칸을 싣도록 교체한다 — 지금은 폼으로 body를 만든 뒤 이력 칸만 표의 raw로 덮어쓴다(E3-① route anchor와 같은 방식).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { vi } from "vitest";
import { beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { buildMultiBody } from "../calc/_helpers/single-multi-route-parity";
import { postMulti } from "../calc/_helpers/single-multi-route-parity";
import { E3B_B, E3B_N, E3B_ROWS, e3bRowRaw, type E3bRow } from "../tax-engine/_helpers/nbl-state-history-e3-1b-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3B_ROWS.find((r) => r.id === id)!;
const NOTICE = { unconfirmed: NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE, accepted: NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE, area: NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } as const;

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 자산에 직접 얹으면 ④ prefix-pick이 운반한다. */
function nblKeysOf(r: E3bRow): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e3bRowRaw(r);
  return nbl as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억(양도차손 행은 2억) 단건. */
function formOf(r: E3bRow, over: Partial<AssetForm> = {}): TransferFormData {
  const price = String(r.transferPrice ?? 1_000_000_000);
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = price;
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: price, isNonBusinessLand: true,
    }, nblKeysOf(r), over) as AssetForm,
  ];
  return f;
}

/** 폼 → body 캡처 → 이력 칸을 `events`(기본 = 표의 raw)로 덮어쓰고 POST. */
async function run(f: TransferFormData, events: unknown, mutate?: (raw: Loose) => void) {
  const body = await captureBody(f);
  const raw = body.nonBusinessLandRaw as Loose;
  raw.nblOtherStateEvents = events;
  mutate?.(raw);
  const r = await postTransfer(body);
  return { ...r, body, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const runRow = (r: E3bRow) => run(formOf(r), e3bRowRaw(r).nblOtherStateEvents);
const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

describe("E3b-1 route 관통 — 엔진 계획서 §5 R1~R18(+변형, 단건): 입력 → ⑫ → ⑭ → 엔진 → 세액 · 고지", () => {
  it.each(E3B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3bRow) => {
    const res = await runRow(r);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.body.nonBusinessLandRaw, "④가 raw를 싣는다").toBeDefined();
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(res.result?.calculatedTax).toBe(r.expect.tax);
    const expected = new Set(r.notices ?? []);
    for (const [kind, text] of Object.entries(NOTICE)) {
      expect((res.nbl?.warnings as string[]).filter((w) => w === text), `${r.id} ${kind}`).toHaveLength(expected.has(kind as keyof typeof NOTICE) ? 1 : 0);
    }
    const hasTax = r.events.some(([k]) => k === "tax_type_changed");
    expect(res.nbl?.warnings).toContain(hasTax ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE);
  });

  it("⑫ 칸 도달 가드(P-b8·P-b9 — TS 미감지): R1 응답 echo의 나대지 구간에 근거·선언 구분·`accepted`가 실려 온다 — Zod가 두 칸을 strip하면 echo에 근거가 없고 세액이 N으로 돌아간다", async () => {
    const res = await runRow(row("R1"));
    const iv = res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv[0]).toMatchObject({ hasBuilding: false, propertyTaxType: "separate", basisOutcome: "accepted", basis: "vacant_state", declaredPropertyTaxType: "separate", business: true });
    expect(res.result?.calculatedTax).not.toBe(E3B_N);
    // 면적한도 칸도 따로 도달해야 한다 — 같은 행에서 한도만 «일부 초과»로 바꾸면 접힌다(한도 칸 strip이면 이 단언이 깨진다)
    const exceeded = await run(formOf(row("R1")), [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "exceeded" }]);
    expect(exceeded.nbl?.periodEvaluation?.stateHistory?.intervals[0]).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "area_exceeded" });
  });

  it("R4(과소 해소) · R7(과대 해소): 이력 칸이 결과를 돌린다 — R4 현행 B → N · R7 현행 N → B (같은 거래에서 모드만 끈 대조)", async () => {
    for (const [id, withHistory] of [["R4", E3B_N], ["R7", E3B_B]] as const) {
      const r = row(id);
      const off = await run(formOf(r), [], (raw) => { raw.nblOtherStateHistoryMode = ""; });
      expect(off.status, id).toBe(200);
      expect(off.result?.calculatedTax, `${id} 현행`).toBe(withHistory === E3B_N ? E3B_B : E3B_N);
      expect((await runRow(r)).result?.calculatedTax, `${id} 이력`).toBe(withHistory);
    }
  });

  it("R18 양도차손 실측: 사업용 판정(3,072/3,651) · 산출세액 0 — 판정과 세액이 독립이다", async () => {
    const res = await runRow(row("R18"));
    expect(res.status).toBe(200);
    expect([res.nbl?.isNonBusinessLand, res.nbl?.effectiveBusinessDays, res.result?.calculatedTax]).toEqual([false, 3072, 0]);
  });
});

describe("E3b-1 ⑫ — 직접 API 계약: 새 칸은 enum(허용값 밖 400 · `\"\"` 200) · 나대지 구간 구분 변경은 400이 아니다", () => {
  const R1 = row("R1");
  const built = (extra: Record<string, unknown> = {}) => [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within", ...extra }];

  it("근거: 허용값 밖은 400(침묵 strip이 아니다) · `\"\"`(미선택)·`unknown`·`demolished`는 200(엔진이 접는다 — 400 아님)", async () => {
    expect((await run(formOf(R1), built({ propertyTaxBasisBefore: "foo" }))).status).toBe(400);
    for (const basis of ["", "unknown", "demolished", "statutory_exempt"]) {
      const r = await run(formOf(R1), built({ propertyTaxBasisBefore: basis }));
      expect(r.status, `${basis}: ${errorText(r).slice(0, 200)}`).toBe(200);
    }
  });

  it("면적한도: 허용값 밖은 400 · `\"\"`·`within`·`exceeded`·`unknown`은 200", async () => {
    expect((await run(formOf(R1), built({ areaWithinLimitBefore: "foo" }))).status).toBe(400);
    for (const limit of ["", "within", "exceeded", "unknown"]) {
      const r = await run(formOf(R1), built({ areaWithinLimitBefore: limit }));
      expect(r.status, `${limit}: ${errorText(r).slice(0, 200)}`).toBe(200);
    }
  });

  it("칸 미전송은 400이 아니다(optional) — 선언 없음 = 신축 행 종합합산(종전 이력과 같다)", async () => {
    const r = await run(formOf(R1), [{ kind: "building_built", date: "2023-06-01" }]);
    expect(r.status).toBe(200);
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays]).toEqual([true, 214]);
    for (const text of Object.values(NOTICE)) expect(r.nbl?.warnings).not.toContain(text);
  });

  it("V-1(직접 API stray): 신축 행에 근거 없는 `separate` Before — 판정은 종전과 같고(214 N) «근거 미확인» 고지만 더해진다", async () => {
    const r = await run(formOf(R1), [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate" }]);
    expect(r.status).toBe(200);
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays]).toEqual([true, 214]);
    expect(r.nbl?.warnings).toContain(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
  });

  it("건축물 없는 구간 위 구분 변경은 토글·위치와 무관하게 200 — ⑧ 차단 규칙 삭제의 ⑫ 측(E3-1b) · 같은 날은 여전히 400", async () => {
    const tax = (date: string) => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" });
    for (const toggle of [true, false]) {
      const r = await run(formOf(row("R7")), [tax("2022-06-01")], (raw) => { raw.nblOtherHasBuilding = toggle; });
      expect(r.status, `toggle=${toggle} ${errorText(r).slice(0, 200)}`).toBe(200);
    }
    const same = await run(formOf(row("R7")), [{ kind: "building_built", date: "2019-01-01" }, tax("2019-01-01")]);
    expect(same.status).toBe(400);
    expect(errorText(same)).toContain("같은 날");
  });

  it("건축물 있는 구간 위 구분 변경의 숨은 stale 선언 칸(근거·한도)은 판정에 쓰이지 않는다(P-b10) — 토글 on + tax-only: 첫 구간은 건축물 별도합산(종전 E3-① T1과 같은 3,072/3,651)", async () => {
    const r = await run(formOf(row("R7")), [{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown", areaWithinLimitBefore: "exceeded" }], (raw) => {
      raw.nblOtherHasBuilding = true;
      raw.nblOtherBuildingFloorArea = "250";
    });
    expect(r.status).toBe(200);
    const iv = r.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv[0]).toMatchObject({ hasBuilding: true, propertyTaxType: "separate" });
    expect("basisOutcome" in iv[0]).toBe(false);
    for (const text of Object.values(NOTICE)) expect(r.nbl?.warnings).not.toContain(text);
  });

  it("`unchanged`·`unknown`·`\"\"` 모드는 선언 칸을 읽지 않는다 — 400 아님 · 현행(`state_at_transfer`) 판정", async () => {
    for (const mode of ["", "unchanged", "unknown"]) {
      const r = await run(formOf(R1), built(), (raw) => { raw.nblOtherStateHistoryMode = mode; });
      expect(r.status, mode).toBe(200);
      expect(r.nbl?.periodEvaluation?.basis, mode).toBe("state_at_transfer");
    }
  });
});

describe("E3b-1 route 관통 — 다건·축 B 지분 입구", () => {
  it("다건 route: 같은 raw가 단건과 같은 판정으로 이력에 닿는다 — R1(과대 해소: 사업용) · R4(과소 해소: 비사업용)", async () => {
    for (const id of ["R1", "R4"] as const) {
      const r = row(id);
      const body = await buildMultiBody([formOf(r)]);
      const rawHolder = ((body as Loose).properties as Loose[])?.[0]?.nonBusinessLandRaw as Loose | undefined;
      expect(rawHolder, `${id} 다건 body에 raw가 있다`).toBeDefined();
      rawHolder!.nblOtherStateEvents = e3bRowRaw(r).nblOtherStateEvents;
      const multi = await postMulti(body);
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, id).toBe("state_history");
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
    }
  });

  it("축 B 지분(컴패니언 raw): 선언 사건은 땅 사실(첫 카드), 소유기간은 지분 취득일 — R7: 지분1(2014) 3,072/3,651 사업용 · 지분2(2020-01-01) 사건 2022-06-01 → 881/1,460 사업용", async () => {
    const R7 = row("R7");
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.filingDate = "2025-12-31";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    const base = { assetKind: "land", acquisitionCause: "purchase", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "150000000", isNonBusinessLand: true } as Partial<AssetForm>;
    f.assets = [
      Object.assign({ ...makeDefaultAsset(1) }, base, { acquisitionDate: "2014-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }, nblKeysOf(R7)) as AssetForm,
      Object.assign({ ...makeDefaultAsset(2) }, base, { acquisitionDate: "2020-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }) as AssetForm,
    ];
    const body = await captureBody(f);
    const events = e3bRowRaw(R7).nblOtherStateEvents;
    (body.nonBusinessLandRaw as Loose).nblOtherStateEvents = events;
    for (const c of (body.companionAssets as Loose[]) ?? []) if (c.nonBusinessLandRaw) c.nonBusinessLandRaw.nblOtherStateEvents = events;
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const json = (await res.json()) as Loose;
    expect(res.status, JSON.stringify(json).slice(0, 500)).toBe(200);
    const details = (json.data.aggregated.properties as Loose[]).map((p) => p.nonBusinessLandJudgmentDetail);
    expect(details.map((d) => d?.periodEvaluation?.basis)).toEqual(["state_history", "state_history"]);
    expect(details.map((d) => [d?.isNonBusinessLand, d?.effectiveBusinessDays, d?.totalOwnershipDays])).toEqual([
      [false, 3072, 3651],
      [false, 881, 1460],
    ]);
  });
});
