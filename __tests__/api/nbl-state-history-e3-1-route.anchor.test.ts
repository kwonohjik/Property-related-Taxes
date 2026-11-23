/**
 * NBL-STATE-HISTORY-E3-① (E3-1a) — route 관통 anchor: 와이어 칸(`nblOtherStateEvents` 에 `tax_type_changed`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §5(매트릭스 21행) · §6(⑫ 무변경이라도 route 관통으로 확인 — P-E3-6·P-E3-8)
 * 표: `_helpers/nbl-state-history-e3-1-table.ts` — 엔진 단위(`nbl-state-history-e3-1.anchor.test.ts`)와 같은 표.
 *
 * ⚠️ 입력 경로: **직접 API raw**다. ④ `stateHistoryWireFields`(lib/calc/nbl-other-state-history-scope.ts)는 아직 `tax_type_changed` 행의 `propertyTaxTypeBefore`를 `""`로 정규화한다
 * (U4가 단일 술어 `eventCarriesTaxTypeBefore`로 교체한다) — 그래서 폼으로 body를 만든 뒤 이력 칸만 표의 raw로 덮어쓴다(E2의 연접 다필지 행과 같은 방식).
 * U4 이후 폼 경로 행(화면 입력 → 같은 body)은 UI 계획서의 E2E가 확장한다.
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
import { E3_N } from "../tax-engine/_helpers/nbl-state-history-e3-1-table";
import { E3_ROWS } from "../tax-engine/_helpers/nbl-state-history-e3-1-table";
import { e3RowRaw } from "../tax-engine/_helpers/nbl-state-history-e3-1-table";
import { type E3Row } from "../tax-engine/_helpers/nbl-state-history-e3-1-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3_ROWS.find((r) => r.id === id)!;

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸 — 자산에 직접 얹으면 ④ prefix-pick이 운반한다. */
function nblKeysOf(r: E3Row): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e3RowRaw(r);
  return nbl as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억(양도차손 행은 2억) 단건. */
function formOf(r: E3Row, over: Partial<AssetForm> = {}): TransferFormData {
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

const runRow = (r: E3Row) => run(formOf(r), e3RowRaw(r).nblOtherStateEvents);
const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

describe("E3-1a route 관통 — 엔진 계획서 §5 21행(단건): 입력 → ⑫ → ⑭ → 엔진 → 세액", () => {
  it.each(E3_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3Row) => {
    const res = await runRow(r);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.body.nonBusinessLandRaw, "④가 raw를 싣는다").toBeDefined();
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(res.result?.calculatedTax).toBe(r.expect.tax);
    // 구분 변경 사건이 있는 행만 변형 고지(대체) — 건축물 사건만 있는 행(T9c·T9o)은 종전 한정 고지 그대로
    const hasTaxEvent = r.events.some(([k]) => k === "tax_type_changed");
    expect(res.nbl?.warnings).toContain(hasTaxEvent ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(res.nbl?.warnings).not.toContain(hasTaxEvent ? NBL_STATE_HISTORY_APPLIED_NOTICE : NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
  });

  it("«모름»(T15)은 새 모름 고지가 응답 warnings에 도달한다 · 아는 행(T1)은 없다", async () => {
    expect((await runRow(row("T15"))).nbl?.warnings).toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    expect((await runRow(row("T1"))).nbl?.warnings).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  });

  it("⑭ Before 운반(P-E3-6): ⑭가 Before를 지우면 T1은 `\"\"`(모름)이 되어 비사업용 N으로 돌아간다 — 응답 echo의 첫 구간 구분이 `separate`", async () => {
    const res = await runRow(row("T1"));
    const iv = res.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType])).toEqual([[true, "separate"], [true, "comprehensive"]]);
    expect(res.result?.calculatedTax).not.toBe(E3_N);
  });
});

describe("E3-1a ⑫ — 직접 API 계약: 신규 종류는 400이 아니고(P-E3-8), 같은 날은 400(⑧과 같은 문구) · 건축물 없는 구간 위의 변경은 E3-1b부터 통과", () => {
  const T1 = row("T1");
  const tax = (date: string, before = "separate") => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: before });
  const removed = (date: string, before = "separate") => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });
  const built = (date: string) => ({ kind: "building_built", date });

  it("신규 종류 `tax_type_changed`는 Zod가 통과시킨다(`kind: z.string()`) — 침묵 strip이 아니라 판정에 도달", async () => {
    const r = await run(formOf(T1), [tax("2022-06-01")]);
    expect(r.status, errorText(r).slice(0, 300)).toBe(200);
    expect(r.nbl?.periodEvaluation?.basis).toBe("state_history");
  });

  it("E3-1b 의도된 반전: 건축물 없음 토글 + 구분 변경만(tax-only)도 200 — 나대지 구간 선언이다(V-6 «닫힘» 규칙 삭제) · 근거 없는 별도합산은 종합합산으로 접힌다(첫 구간 종합합산)", async () => {
    const off = await run(formOf(T1), [tax("2022-06-01")], (raw) => { raw.nblOtherHasBuilding = false; });
    expect(off.status, errorText(off).slice(0, 300)).toBe(200);
    const iv = off.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType])).toEqual([[false, "comprehensive"], [false, "comprehensive"]]);
    const on = await run(formOf(T1), [tax("2022-06-01")], (raw) => { raw.nblOtherHasBuilding = true; });
    expect(on.status, errorText(on).slice(0, 300)).toBe(200);
  });

  it("E3-1b 의도된 반전: 철거 뒤 구분 변경(나대지 위) · 신축 앞 구분 변경(첫 건축물 사건이 신축 = 초기 없음) · 신축 뒤 구분 변경 모두 200", async () => {
    const afterRemoved = await run(formOf(T1), [removed("2019-01-01"), tax("2021-01-01")]);
    expect(afterRemoved.status, errorText(afterRemoved).slice(0, 300)).toBe(200);
    const beforeBuilt = await run(formOf(T1), [tax("2019-01-01"), built("2021-01-01")], (raw) => { raw.nblOtherHasBuilding = true; });
    expect(beforeBuilt.status, errorText(beforeBuilt).slice(0, 300)).toBe(200);
    const afterBuilt = await run(formOf(T1), [built("2019-01-01"), tax("2021-01-01")]);
    expect(afterBuilt.status, errorText(afterBuilt).slice(0, 300)).toBe(200);
  });

  it("같은 날은 종류 무관 400 — 건축물 + 구분 변경 · 구분 변경 + 구분 변경 (P-E3-11)", async () => {
    for (const events of [[built("2019-01-01"), tax("2019-01-01")], [tax("2019-01-01"), tax("2019-01-01")]]) {
      const r = await run(formOf(T1), events);
      expect(r.status).toBe(400);
      expect(errorText(r)).toContain("같은 날");
    }
  });

  it("신축 → 구분 변경 → 신축은 «같은 종류 연속»(구분 변경은 교대에 참여하지 않는다) → 400 · 구분 변경 연속 → 200 (P-E3-4)", async () => {
    const same = await run(formOf(T1), [built("2017-01-01"), tax("2018-01-01"), built("2019-01-01")]);
    expect(same.status).toBe(400);
    expect(errorText(same)).toContain("사이에 「건축물 멸실·철거·붕괴」 사건이 빠졌습니까");
    const chain = await run(formOf(T1), [tax("2016-01-01", "exempt"), tax("2018-01-01", "special_sum"), tax("2021-01-01", "separate")]);
    expect(chain.status, errorText(chain).slice(0, 300)).toBe(200);
  });

  it("⑫ 하한 규칙 없음(P-E3-7): 취득일 이전 구분 변경도 400이 아니다 — 엔진이 클립(T11b)", async () => {
    const r = await runRow(row("T11b"));
    expect(r.status, errorText(r).slice(0, 300)).toBe(200);
    expect([r.nbl?.isNonBusinessLand, r.nbl?.effectiveBusinessDays, r.nbl?.totalOwnershipDays]).toEqual([true, 0, 486]);
  });

  it("변경 직전 구분은 enum — 허용값 밖은 400(침묵 strip이 아니다) · `\"\"`(모름)은 200", async () => {
    expect((await run(formOf(T1), [tax("2022-06-01", "foo")])).status).toBe(400);
    expect((await run(formOf(T1), [tax("2022-06-01", "")])).status).toBe(200);
  });

  it("`unchanged`·`unknown`·`\"\"` + 구분 변경 사건은 사건을 읽지 않는다 — 400 아님 · 현행(`state_at_transfer`) 판정", async () => {
    for (const mode of ["", "unchanged", "unknown"]) {
      const r = await run(formOf(T1), [tax("2022-06-01")], (raw) => { raw.nblOtherStateHistoryMode = mode; raw.nblOtherHasBuilding = false; });
      expect(r.status, mode).toBe(200);
      expect(r.nbl?.periodEvaluation?.basis, mode).toBe("state_at_transfer");
    }
  });
});

describe("E3-1a route 관통 — 다건·축 B 지분 입구", () => {
  it("다건 route: 같은 raw가 단건과 같은 판정으로 이력에 닿는다 — T1(과대 해소: 결정세액 감소) · T2(과소 해소: 결정세액 증가)", async () => {
    for (const id of ["T1", "T2"] as const) {
      const r = row(id);
      const body = await buildMultiBody([formOf(r)]);
      // 다건 body의 건별 raw(`properties[0].nonBusinessLandRaw`)에 이력 칸을 직접 API처럼 덮어쓴다(④ 와이어 정규화 전 값)
      const rawHolder = ((body as Loose).properties as Loose[])?.[0]?.nonBusinessLandRaw as Loose | undefined;
      expect(rawHolder, `${id} 다건 body에 raw가 있다`).toBeDefined();
      rawHolder!.nblOtherStateEvents = e3RowRaw(r).nblOtherStateEvents;
      const multi = await postMulti(body);
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, id).toBe("state_history");
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
    }
  });

  it("축 B 지분(컴패니언 raw): 구분 변경 사건은 땅 사실(첫 카드), 소유기간은 지분 취득일 — 지분1(2014) 3,072/3,651 사업용 · 지분2(2020-01-01) 881/1,460 사업용", async () => {
    const T1 = row("T1");
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.filingDate = "2025-12-31";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    const base = { assetKind: "land", acquisitionCause: "purchase", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "150000000", isNonBusinessLand: true } as Partial<AssetForm>;
    f.assets = [
      Object.assign({ ...makeDefaultAsset(1) }, base, { acquisitionDate: "2014-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }, nblKeysOf(T1)) as AssetForm,
      Object.assign({ ...makeDefaultAsset(2) }, base, { acquisitionDate: "2020-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }) as AssetForm,
    ];
    const body = await captureBody(f);
    const events = e3RowRaw(T1).nblOtherStateEvents;
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
