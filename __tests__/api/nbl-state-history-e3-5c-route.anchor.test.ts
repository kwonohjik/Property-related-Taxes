/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-2 — route 관통 anchor: 나대지 구간 근거 «철거ㆍ멸실» + 사실 칸 4개 → ⑬ body → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 침묵 strip 방지: 사건 행의 새 키(`demolishedPermitBefore` 등)가 Zod 행 객체(⑫)에 없으면 route는 값을 버리고 엔진은 «모름»으로 접는다(⑫⑬⑭는 TS 미감지) — 이 파일이 «값이 엔진에 닿는다»를 판정·세액으로 고정한다.
 * ⑫′ 거울: 요구되는 칸이 빈칸이면 400(Q-5 (가) · Q-11 (나)) — 엔진이 이력을 읽지 않는 입력(의제)은 4칸 모두 요구하지 않는다(UQ-8 (가)).
 * 입력 경로: ④(`buildNonBusinessLandRaw`)가 사건 행을 `stateEventWireRow`로 정규화해 싣는다 — 요구되지 않는 stale 값은 와이어에 없다.
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
import { buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";
import { E35_B, E35_N, E35_BARE_FACTS, e35BareDecl, e35VacantHouseCell } from "../tax-engine/_helpers/nbl-state-history-e3-5-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const WIRE_BASICS = ["acquisitionArea", "acquisitionDate", "transferDate"];
const nblOnly = (raw: Record<string, unknown>) => Object.fromEntries(Object.entries(raw).filter(([k]) => !WIRE_BASICS.includes(k)));

function formOf(raw: Record<string, unknown>): TransferFormData {
  const { acquisitionDate, transferDate } = raw;
  const f = createDefaultTransferFormData();
  f.transferDate = String(transferDate);
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate, acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblOnly(raw)) as AssetForm,
  ];
  return f;
}

async function run(raw: Record<string, unknown>) {
  const body = await captureBody(formOf(raw));
  const r = await postTransfer(body);
  return { ...r, body, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}
const errorsOf = (json: Loose) => JSON.stringify(json?.error?.fieldErrors ?? json?.error ?? json);
const closing = (raw: Record<string, unknown>) => (raw.nblOtherStateEvents as Loose[]).at(-1)!;
const withClosing = (raw: Record<string, unknown>, patch: Loose) => {
  const events = (raw.nblOtherStateEvents as Loose[]).map((e) => ({ ...e }));
  events[events.length - 1] = { ...events[events.length - 1], ...patch };
  return { ...raw, nblOtherStateEvents: events };
};
const withoutFacts = (raw: Record<string, unknown>) => {
  const events = (raw.nblOtherStateEvents as Loose[]).map((e) => ({ ...e }));
  const last = events[events.length - 1];
  for (const k of ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore", "demolishedFloorAreaBefore"]) delete last[k];
  return { ...raw, nblOtherStateEvents: events };
};
const intervalsOf = (nbl: Loose | undefined) => (nbl?.periodEvaluation?.stateHistory?.intervals ?? []) as Loose[];

describe("E3f-2 route — 사실 칸 4개(사건 행) 관통: ④ body → ⑫ Zod(침묵 strip 방지) → ⑭ → 한시 창 → 세액", () => {
  it("K-1: 철거 2022-12-15 · 신축 2023-12-01 + 허가 예 · 건축 외 용도 아니오 — 사실 칸이 body·⑫·⑭를 지나 엔진에 닿아 창 인정 → 사업용 775일 · B 198,210,000 · echo 한시 창(침묵 strip이면 «모름»으로 접혀 N)", async () => {
    const r = await run(e35BareDecl("2022-12-15"));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    // ④가 요구 칸만 싣는다 — 이 구간은 과세기준일 2023-06-01 시행본뿐이라 허가·사용승인만 묻는다(건축 외 용도·바닥면적은 2024.6.1.~ 시행본 문언 — 저장된 값이 있어도 싣지 않는다 · stale 비전송)
    const wire = closing((r.body.nonBusinessLandRaw as Loose));
    expect(wire).toMatchObject({ propertyTaxBasisBefore: "demolished", demolishedPermitBefore: "yes" });
    expect("demolishedOtherUseBefore" in wire).toBe(false);
    expect("demolishedFloorAreaBefore" in wire).toBe(false);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
    expect(r.nbl?.effectiveBusinessDays).toBe(775);
    expect(r.result?.calculatedTax).toBe(E35_B);
    const iv = intervalsOf(r.nbl).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", temporaryStatusMonths: 6, temporaryStatusRemovedKind: "building", businessDays: 183 });
    expect(String(iv.temporaryStatusWindow.start)).toContain("2022-12-15");
    expect(String(iv.temporaryStatusWindow.end)).toContain("2023-06-16");
  });

  it("K-4/K-10d: 허가 «모름»(명시 선택)은 400이 아니라 접힘 — `demolished_permit` · 비사업용 592 · N 253,960,000 (미선택과 달리 차단하지 않는다)", async () => {
    const r = await run(withClosing(e35BareDecl("2022-12-15"), { demolishedPermitBefore: "unknown" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(intervalsOf(r.nbl).find((x) => x.basis === "demolished")).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_permit" });
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays, r.result?.calculatedTax]).toEqual([true, 592, E35_N]);
    expect(E35_N - E35_B).toBe(55_750_000);
  });

  it("K-10/K-10d ⑫ 400: 요구되는 칸이 미선택·빈칸이면 400 — 경로 `nblOtherStateEvents.2.…`(같은 문구) · 첫 빈 칸 하나만 · 요구되지 않는 칸(2023 시행본의 건축 외 용도)은 비어도 200", async () => {
    const noPermit = await run(withClosing(e35BareDecl("2022-12-15"), { demolishedPermitBefore: "" }));
    expect(noPermit.status).toBe(400);
    expect(errorsOf(noPermit.json)).toContain("nblOtherStateEvents");
    expect(errorsOf(noPermit.json)).toContain("demolishedPermitBefore");
    expect(errorsOf(noPermit.json)).not.toContain("demolishedOtherUseBefore");
    const none = await run(withoutFacts(e35BareDecl("2022-12-15")));
    expect(none.status).toBe(400);
    expect(errorsOf(none.json)).toContain("demolishedPermitBefore");
    // 2023 시행본에는 건축 외 용도 문언이 없다 — 칸이 비어도 요구하지 않는다
    expect((await run(withClosing(e35BareDecl("2022-12-15"), { demolishedOtherUseBefore: "" }))).status).toBe(200);
    // 2024.6.1.~ 시행본은 건축 외 용도를 묻는다 — 미선택이면 400
    const y24 = (patch: Loose) => withClosing(e35BareDecl("2024-01-15", { transferDate: "2024-12-01" }, "2021-06-02", "2024-09-01"), patch);
    const noOtherUse = await run(y24({ demolishedOtherUseBefore: "" }));
    expect(noOtherUse.status).toBe(400);
    expect(errorsOf(noOtherUse.json)).toContain("demolishedOtherUseBefore");
  });

  it("K-3/K-5: 칸을 요구하지 않는 구간(6개월 안에 과세기준일 없음 · 2018 시행본)은 사실 칸이 비어도 200 — 요구되지 않는 칸 400 없음", async () => {
    const never = await run(withoutFacts(e35BareDecl("2022-07-01")));
    expect(never.status, JSON.stringify(never.json).slice(0, 300)).toBe(200);
    expect(intervalsOf(never.nbl).find((x) => x.basis === "demolished")).toMatchObject({ foldReason: "demolished_never_period" });
    expect(never.nbl?.effectiveBusinessDays).toBe(425);
  });

  it("K-9/K-6 (2024.6.1.~ 시행본): 바닥면적 빈칸 → 400 · 250 → 인정 창 [2024-01-15, 2024-07-16) · 200(× 4 = 800 < 1,000) → 200 응답 + `demolished_area_exceeded` 접힘(자동 안분 없음)", async () => {
    const mk = (floor: string) => withClosing(e35BareDecl("2024-01-15", { transferDate: "2024-12-01" }, "2021-06-02", "2024-09-01"), { demolishedFloorAreaBefore: floor });
    const blank = await run(mk(""));
    expect(blank.status).toBe(400);
    expect(errorsOf(blank.json)).toContain("demolishedFloorAreaBefore");
    const ok = await run(mk("250"));
    expect(ok.status, JSON.stringify(ok.json).slice(0, 300)).toBe(200);
    expect(String(intervalsOf(ok.nbl).find((x) => x.basis === "demolished")!.temporaryStatusWindow.end)).toContain("2024-07-16");
    const exceeded = await run(mk("200"));
    expect(exceeded.status).toBe(200);
    expect(intervalsOf(exceeded.nbl).find((x) => x.basis === "demolished")).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_area_exceeded", businessDays: 0 });
  });

  it("K-10f 읽지 않는 입력(양도일 의제 — 경매): 4칸이 모두 비어도 ⑫ 200(요구 0) — 엔진은 이력을 읽지 않고 안내한다 · 의제를 해소하면 같은 입력이 400", async () => {
    const raw = withoutFacts(e35BareDecl("2022-12-15"));
    const deemed = await run({ ...raw, nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-10-01" });
    expect(deemed.status, JSON.stringify(deemed.json).slice(0, 300)).toBe(200);
    expect(intervalsOf(deemed.nbl)).toEqual([]);
    expect((await run(raw)).status).toBe(400);
  });

  it("K-7 빈집 셀(주택 철거 행 · 빈집정비 «예»): 사실 3칸이 닿아 3년 창 → 사업용 1,463/2,283 — 같은 입력에서 빈집정비 «아니오»는 일반 W로 과세기준일이 안 닿아 접힘(비사업용 366) · 미선택은 400", async () => {
    const yes = await run(e35VacantHouseCell({}, "yes"));
    expect(yes.status, JSON.stringify(yes.json).slice(0, 300)).toBe(200);
    expect([yes.nbl?.isNonBusinessLand, yes.nbl?.effectiveBusinessDays, yes.nbl?.totalOwnershipDays]).toEqual([false, 1463, 2283]);
    expect(intervalsOf(yes.nbl).find((x) => x.basis === "demolished")).toMatchObject({ temporaryStatusMonths: 36, temporaryStatusRemovedKind: "house" });
    const no = await run(e35VacantHouseCell({}, "no"));
    expect([no.status, no.nbl?.isNonBusinessLand, no.nbl?.effectiveBusinessDays]).toEqual([200, true, 366]);
    expect((await run(e35VacantHouseCell({}, ""))).status).toBe(400);
  });

  it("K-8: 한시 창 + 9호 입력(철거일 기산)은 합집합 943 — 입력 경로를 바꿔도 이중 계산 없음", async () => {
    const r = await run(e35BareDecl("2022-12-15", { nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2022-12-15" }] }));
    expect([r.status, r.nbl?.effectiveBusinessDays, r.result?.calculatedTax]).toEqual([200, 943, E35_B]);
  });

  it("엔진 직접 호환(V-7): 철거 행이 **없는** 구간(신축 앞 나대지)의 근거 `demolished`는 ④가 선택지에서 빼 와이어에 싣지 않는다 → 근거 미선택으로 접힘(이전과 같은 결과)", async () => {
    const raw = {
      ...e35BareDecl("2022-12-15"),
      nblOtherStateEvents: [{ kind: "building_built", date: "2021-06-02", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...E35_BARE_FACTS }],
    };
    const r = await run(raw);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const wire = (r.body.nonBusinessLandRaw as Loose).nblOtherStateEvents[0];
    expect("propertyTaxBasisBefore" in wire).toBe(false);
    for (const k of ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedFloorAreaBefore"]) expect(k in wire, k).toBe(false);
    expect(intervalsOf(r.nbl)[0]).toMatchObject({ foldReason: "unselected" });
  });
});

describe("E3f-2 route — 다건 입구(`multi/route-property-input.ts`) · 주택부수토지 카드(Q-12 (가))", () => {
  it("다건도 같은 ⑫·⑭: 사실 칸 있음 → 단건과 같은 판정(사업용 775) · 허가 미선택 → 400", async () => {
    const ok = await postMulti(await buildMultiBody([formOf(e35BareDecl("2022-12-15"))]));
    expect(ok.status, JSON.stringify(ok.json).slice(0, 200)).toBe(200);
    expect((ok.props[0] as Loose).nonBusinessLandJudgmentDetail?.effectiveBusinessDays).toBe(775);
    const missing = await postMulti(await buildMultiBody([formOf(withClosing(e35BareDecl("2022-12-15"), { demolishedPermitBefore: "" }))]));
    expect(missing.status).toBe(400);
  });

  it("K-27 주택부수토지 카드: 주택 철거 2022-12-15 → 신축 2023-12-01 사이 나대지 구간에 근거 «철거ㆍ멸실» + 사실 3칸(바닥면적 칸 없음) → 같은 leaf·한시 창 · 허가 미선택은 400", async () => {
    const housing = (facts: Loose) => ({
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", acquisitionArea: "1000", acquisitionDate: "2014-01-01", transferDate: "2024-01-01",
      nblHousingFootprint: "250", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" },
        { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
      ],
    });
    const ok = await run(housing({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "no" }));
    expect(ok.status, JSON.stringify(ok.json).slice(0, 300)).toBe(200);
    const iv = intervalsOf(ok.nbl).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", temporaryStatusMonths: 6, temporaryStatusRemovedKind: "house", businessDays: 183 });
    const missing = await run(housing({ demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "no" }));
    expect(missing.status).toBe(400);
    expect(errorsOf(missing.json)).toContain("demolishedPermitBefore");
  });
});
