/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 — route 관통 anchor: 영 §103의2 2호 단서 하위 4칸(공용 사용 / 유료 / 개시일 / 종료일) → ④ body(⑬ 무변경) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 침묵 strip 방지: 사건 행의 새 키가 Zod 행 객체(⑫)에 없으면 route는 값을 버리고 엔진은 단서를 읽지 못해 종전 «건축 외 용도 예 접힘»으로 돌아간다(⑫⑬⑭는 TS 미감지) — 이 파일이 «값이 엔진에 닿는다»를 판정·세액으로 고정한다.
 * ⑬: 사건 배열이 `nonBusinessLandRaw`에 통째로 실려(`transfer-tax-api.ts`) body spread 변경 없이 닿는다 — 이 파일이 body에 4칸이 있음을 고정한다(V-11).
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
import { e35Base } from "../tax-engine/_helpers/nbl-state-history-e3-5-table";
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
const intervalsOf = (nbl: Loose | undefined) => (nbl?.periodEvaluation?.stateHistory?.intervals ?? []) as Loose[];


/** 시료 H/K7 — e3-5d 엔진 anchor와 같다(주택 철거 행 + 구분 변경 닫는 행). */
function houseRow(o: { acq: string; bld: string; rem: string; close: string; transfer: string }, facts: Loose): Record<string, unknown> {
  return e35Base({
    acquisitionDate: o.acq, transferDate: o.transfer,
    nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: o.bld },
      { kind: "building_removed", date: o.rem, propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
      { kind: "tax_type_changed", date: o.close, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
    ],
  });
}
const H = (facts: Loose) => houseRow({ acq: "2023-03-01", bld: "2023-03-02", rem: "2024-03-01", close: "2026-12-01", transfer: "2027-01-15" }, facts);
const K7 = (facts: Loose) => houseRow({ acq: "2018-06-01", bld: "2020-06-01", rem: "2021-06-02", close: "2024-08-01", transfer: "2024-09-01" }, facts);
const BASE_FACTS = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes" };
const PU = (from: string, to: string, over: Loose = {}) => ({ ...BASE_FACTS, demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: from, demolishedPublicUseToBefore: to, ...over });
const NO_PU = { ...BASE_FACTS, demolishedOtherUseBefore: "no" };

describe("E3f-3 route — 하위 4칸 관통: ④ body → ⑫ Zod(침묵 strip 방지) → ⑭(날짜 문자열 → Date) → 단서 창 → 세액", () => {
  it("E5-11b(P-1): 취득 2023-03-01 · 철거 2024-03-01 · 구간 끝 2026-12-01 · 양도 2027-01-15 · 사용 2025-01-01 ~ 2026-12-01 — body에 4칸 · 판정 사업용 1,064/1,415 · 세액 239,370,000(종전 접힘 304,920,000) · echo 공용 사용", async () => {
    const r = await run(H(PU("2025-01-01", "2026-12-01")));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    // ⑬ 무변경 — 사건 배열이 통째로 실려 4칸이 body에 있다(날짜는 문자열)
    const wire = closing(r.body.nonBusinessLandRaw as Loose);
    expect(wire).toMatchObject({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2025-01-01", demolishedPublicUseToBefore: "2026-12-01" });
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays, r.nbl?.totalOwnershipDays]).toEqual([false, 1064, 1415]);
    expect(r.result?.calculatedTax).toBe(239_370_000);
    const iv = intervalsOf(r.nbl).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", temporaryStatusMonths: 36, temporaryStatusRemovedKind: "house", temporaryStatusPublicUse: true, businessDays: 699 });
    expect(String(iv.temporaryStatusWindow.start)).toContain("2025-01-01");
    expect(String(iv.temporaryStatusWindow.end)).toContain("2026-12-01");
  });

  it("같은 시료에서 하위 칸을 비운 종전 입력(건축 외 용도 «예»만)은 ⑫ 400(미선택 — Q-7) · 건축 외 용도 «아니오»는 200 + P-0 창(1,370일) — 새 칸이 없는 입력은 종전과 같다(E0 골든)", async () => {
    const blank = await run(H(BASE_FACTS));
    expect(blank.status).toBe(400);
    expect(errorsOf(blank.json)).toContain("demolishedPublicUseBefore");
    const no = await run(H(NO_PU));
    expect([no.status, no.nbl?.effectiveBusinessDays, no.result?.calculatedTax]).toEqual([200, 1370, 239_370_000]);
    expect("temporaryStatusPublicUse" in intervalsOf(no.nbl).find((x) => x.basis === "demolished")!).toBe(false);
  });

  it("E5-11a(Q1): K7 시료 + 사용 2024-01-01 ~ 2024-07-01 → 창 [2024-01-01, 2024-06-03) · 비사업용 520/2,283 · 세액 283,080,000(현행 접힘과 같음 — 일수 366 → 520 · echo만 달라진다)", async () => {
    const r = await run(K7(PU("2024-01-01", "2024-07-01")));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays, r.nbl?.totalOwnershipDays, r.result?.calculatedTax]).toEqual([true, 520, 2283, 283_080_000]);
    const iv = intervalsOf(r.nbl).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ temporaryStatusPublicUse: true, businessDays: 154 });
    expect(String(iv.temporaryStatusWindow.end)).toContain("2024-06-03");
    // 종전 입력(새 칸 없음)은 미선택 400 — Q-7
    expect((await run(K7(BASE_FACTS))).status).toBe(400);
    const folded = await run(K7(PU("2024-01-01", "2024-05-31"))); // Q2 — 종료일이 최초 과세기준일 하루 전
    expect([folded.status, folded.nbl?.effectiveBusinessDays, folded.result?.calculatedTax]).toEqual([200, 366, 283_080_000]);
    expect(intervalsOf(folded.nbl).find((x) => x.basis === "demolished")).toMatchObject({ foldReason: "demolished_public_use_no_base_date", basisOutcome: "unconfirmed" });
  });

  it("R-4 ⑫ 400: 종료일 빈칸(구간 끝으로 읽지 않는다 — Q-4 (가)) · 개시일 빈칸 · 해석 불가 · 개시 > 종료 · ①②미선택 — 경로 `nblOtherStateEvents.2.…` · 같은 칸 한 개", async () => {
    const cases: Array<[string, Loose, string]> = [
      ["종료일 빈칸", { demolishedPublicUseToBefore: "" }, "demolishedPublicUseToBefore"],
      ["개시일 빈칸", { demolishedPublicUseFromBefore: "" }, "demolishedPublicUseFromBefore"],
      ["개시일 해석 불가", { demolishedPublicUseFromBefore: "2025-13-45" }, "demolishedPublicUseFromBefore"],
      ["개시 > 종료", { demolishedPublicUseFromBefore: "2026-01-01", demolishedPublicUseToBefore: "2025-01-01" }, "demolishedPublicUseToBefore"],
      ["유료 미선택", { demolishedPublicUsePaidBefore: "" }, "demolishedPublicUsePaidBefore"],
      ["공용 사용 미선택", { demolishedPublicUseBefore: "" }, "demolishedPublicUseBefore"],
    ];
    for (const [name, patch, field] of cases) {
      const r = await run(H(PU("2025-01-01", "2026-12-01", patch)));
      expect(r.status, name).toBe(400);
      expect(errorsOf(r.json), name).toContain(field);
    }
  });

  it("R-3 ①·② «아니오»·«모름»은 400이 아니라 접힘 — `demolished_other_use` · 비사업용 365 · N 304,920,000 · 하위 날짜가 비어도 요구 0", async () => {
    for (const patch of [{ demolishedPublicUseBefore: "no" }, { demolishedPublicUseBefore: "unknown" }, { demolishedPublicUsePaidBefore: "no" }, { demolishedPublicUsePaidBefore: "unknown" }]) {
      const r = await run(H(PU("", "", patch)));
      expect(r.status, JSON.stringify(patch)).toBe(200);
      expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays, r.result?.calculatedTax]).toEqual([true, 365, 304_920_000]);
      expect(intervalsOf(r.nbl).find((x) => x.basis === "demolished")).toMatchObject({ foldReason: "demolished_other_use" });
    }
  });

  it("R-6 건축 외 용도 «아니오»·빈집정비 «아니오»면 하위 칸이 stale로 남아 있어도 4칸 요구 0 · 200 · ④가 싣지 않는다", async () => {
    const stray = { demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "", demolishedPublicUseToBefore: "" };
    const no = await run(H({ ...NO_PU, ...stray }));
    expect(no.status, JSON.stringify(no.json).slice(0, 200)).toBe(200);
    const wire = closing(no.body.nonBusinessLandRaw as Loose);
    for (const k of Object.keys(stray)) expect(k in wire, k).toBe(false);
    const noVacant = await run(H({ ...BASE_FACTS, demolishedVacantHouseBefore: "no", ...stray }));
    expect(noVacant.status).toBe(200);
    for (const k of Object.keys(stray)) expect(k in closing(noVacant.body.nonBusinessLandRaw as Loose), k).toBe(false);
  });

  it("R-5 읽지 않는 입력(양도일 의제): 4칸이 비어도 200(요구 0) — 의제를 해소하면 400", async () => {
    const raw = H({ ...BASE_FACTS, demolishedPublicUseBefore: "" });
    const deemed = await run({ ...raw, nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2025-10-01" });
    expect(deemed.status, JSON.stringify(deemed.json).slice(0, 300)).toBe(200);
    expect((await run(raw)).status).toBe(400);
  });

  it("직접 API(엔진 안전망): ⑫′를 통과하는 raw에 날짜 문자열이 JSON을 경유해 Date로 변환돼 비교된다 — 종료일 = 과세기준일 당일(P-5a)이 성립(`Date < string` 침묵 false 방지)", async () => {
    const r = await run(H(PU("2024-07-01", "2025-06-01")));
    expect([r.status, r.nbl?.effectiveBusinessDays]).toEqual([200, 701]);
    const r2 = await run(H(PU("2025-06-01", "2025-12-31")));
    expect([r2.status, r2.nbl?.effectiveBusinessDays]).toEqual([200, 579]);
  });
});

describe("E3f-3 route — 다건 입구 · 주택부수토지 카드(V-15)", () => {
  it("다건도 같은 ⑫·⑭: 단서 입력 → 단건과 같은 판정(1,064 · 사업용) · 종료일 빈칸 → 400", async () => {
    const ok = await postMulti(await buildMultiBody([formOf(H(PU("2025-01-01", "2026-12-01")))]));
    expect(ok.status, JSON.stringify(ok.json).slice(0, 200)).toBe(200);
    expect((ok.props[0] as Loose).nonBusinessLandJudgmentDetail?.effectiveBusinessDays).toBe(1064);
    const missing = await postMulti(await buildMultiBody([formOf(H(PU("2025-01-01", "2026-12-01", { demolishedPublicUseToBefore: "" })))]));
    expect(missing.status).toBe(400);
  });

  it("주택부수토지 카드: 모든 철거 행이 주택 — 같은 술어로 하위 4칸이 열리고 같은 단서 창 · 종료일 빈칸은 400", async () => {
    const housing = (facts: Loose) => ({
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", acquisitionArea: "1000", acquisitionDate: "2023-03-01", transferDate: "2027-01-15",
      nblHousingFootprint: "250", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2024-03-01", propertyTaxTypeBefore: "", houseFootprintBefore: "250" },
        { kind: "building_built", date: "2026-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
      ],
    });
    const ok = await run(housing(PU("2025-01-01", "2026-12-01")));
    expect(ok.status, JSON.stringify(ok.json).slice(0, 300)).toBe(200);
    const iv = intervalsOf(ok.nbl).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", temporaryStatusPublicUse: true, temporaryStatusRemovedKind: "house", businessDays: 699 });
    const bad = await run(housing(PU("2025-01-01", "2026-12-01", { demolishedPublicUseToBefore: "" })));
    expect(bad.status).toBe(400);
    expect(errorsOf(bad.json)).toContain("demolishedPublicUseToBefore");
  });
});
