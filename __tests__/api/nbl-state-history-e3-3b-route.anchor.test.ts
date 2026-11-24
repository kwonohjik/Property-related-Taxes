/**
 * NBL-STATE-HISTORY-E3-③ B (E3d-2) — route 관통 anchor: 와이어 칸(`nblOtherStateEvents[].buildingKindBefore`·`houseFootprintBefore` · `nblIsMetropolitanArea`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §5(⑫ 중첩 칸 침묵 strip은 TS 미감지 — route 관통이 유일한 안전망 · T-7) · §6.2 · §7.2 Anchor 6(B)·9·10 · §7.3 Y-8·Y-16·Y-18·Y-19·Y-20·Y-24
 * 표: `_helpers/nbl-state-history-e3-3b-table.ts` — 엔진 단위(`nbl-state-history-e3-3b.anchor.test.ts`)와 같은 표.
 *
 * mutation 대응: Y-18(⑫ Zod에서 `buildingKindBefore` 삭제 = strip) = B-M1·B1c-333.34(주택 행이 종전 «모름» 사슬로 읽혀 N) · Y-8(`houseFootprintBefore` 삭제) = B-M1·B6 구별 ·
 *   Y-19(D-8 ① 제거) = 신축 행 종류 400 · Y-20(D-8 ② 제거) = 주택 구간 안 구분 변경 400 · Y-24(⑭ 수도권 게이트) = «Anchor 10».
 *
 * ⚠️ 입력 경로: **직접 API raw**다. ④ 와이어(`stateHistoryWireFields`·`buildNonBusinessLandRaw`의 수도권 게이트)는 UI-B PR이 기타토지 철거 행의 종류 칸·조건부 수도권 칸을 싣도록 바꾼다 —
 * 지금은 폼으로 body를 만든 뒤 이력 칸·수도권 칸만 표의 raw로 덮어쓴다(A route anchor와 같은 방식). ④ 관통은 UI-B가 같은 표로 단언한다.
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
import { E3D_B_ROWS, e3dBRowRaw, type E3dBRow } from "../tax-engine/_helpers/nbl-state-history-e3-3b-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE,
  NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { HOUSING_METRO_DEFAULTED_WARNING } from "@/lib/tax-engine/non-business-land/housing-limit";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3D_B_ROWS.find((r) => r.id === id)!;
const N = 253_960_000;
const B = 198_210_000;

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적)를 뺀 `nbl*` 칸. */
function nblKeysOf(r: E3dBRow): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e3dBRowRaw(r, { history: false });
  return nbl as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억 단건. */
function formOf(r: E3dBRow, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "1000", transferArea: r.area ?? "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblKeysOf(r), over) as AssetForm,
  ];
  return f;
}

/** 폼 → body 캡처 → 이력 칸(모드·사건)과 수도권 칸을 표의 raw로 덮어쓰고 POST. */
async function run(r: E3dBRow, events: unknown = e3dBRowRaw(r).nblOtherStateEvents, mutate?: (raw: Loose) => void) {
  const body = await captureBody(formOf(r));
  const raw = body.nonBusinessLandRaw as Loose;
  raw.nblOtherStateHistoryMode = "changed";
  raw.nblOtherStateEvents = events;
  if (r.metroOmit) delete raw.nblIsMetropolitanArea;
  else raw.nblIsMetropolitanArea = r.metro ?? "no";
  mutate?.(raw);
  const res = await postTransfer(body);
  return { ...res, body, nbl: res.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const errorText = (r: { json: Loose }) => JSON.stringify(r.json);
const houseIv = (r: { nbl?: Loose }) => ((r.nbl?.periodEvaluation?.stateHistory?.intervals ?? []) as Loose[]).filter((i) => i.buildingKind === "house");

describe("E3d-2 route 관통 — 엔진 계획서 §6.2 B 행(단건): 입력 → ⑫ → ⑭ → 엔진 → 세액 · 고지", () => {
  it.each(E3D_B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3dBRow) => {
    const res = await run(r);
    expect(res.status, errorText(res).slice(0, 400)).toBe(200);
    expect(res.body.nonBusinessLandRaw, "④가 raw를 싣는다").toBeDefined();
    expect(res.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(res.nbl?.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.graceDays !== undefined) expect(res.nbl?.gracePeriodDays).toBe(r.expect.graceDays);
    if (r.expect.tax !== undefined) expect(res.result?.calculatedTax).toBe(r.expect.tax);
    // 주택 구간이 소유기간에 남아 있으면 echo가 판정을 그대로 보인다(⑫ 칸 strip이면 `buildingKind`가 사라진다)
    const iv = houseIv(res);
    expect(iv.map((i) => i.houseOutcome)).toEqual(r.outcomes.slice(0, iv.length));
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    if (iv.length > 0) {
      expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
      expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    }
  });

  it("⑫ 칸 도달 가드(Y-18·Y-8 — TS 미감지): B1은 `buildingKindBefore`·`houseFootprintBefore` 둘 다 서버에 닿아야 사업용(2,556/3,651)이다. 종류 칸만 빠지면 종전 «모름» 사슬이라 N, 정착면적만 빠지면 접힘이라 N — 셋이 서로 다른 칸을 증명한다", async () => {
    const ok = await run(row("B-M1"));
    expect(ok.nbl?.isNonBusinessLand).toBe(false);
    expect(houseIv(ok)[0]).toMatchObject({ houseOutcome: "within", business: true, houseCheck: { footprint: 200, allowedArea: 1000, landArea: 1000, multiplier: 5 } });
    const noKind = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", houseFootprintBefore: "200" }]);
    expect(noKind.status).toBe(200);
    expect(houseIv(noKind)).toEqual([]);
    expect(noKind.nbl?.isNonBusinessLand).toBe(true);
    expect(noKind.result?.calculatedTax).toBe(N);
    const noFootprint = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house" }]);
    expect(noFootprint.status).toBe(200);
    expect(houseIv(noFootprint)[0]).toMatchObject({ houseOutcome: "unconfirmed" });
    expect(noFootprint.result?.calculatedTax).toBe(N);
  });

  it("B1 과대 해소: 같은 거래에서 철거 행을 종류 없이(모름 사슬) 보내면 N 253,960,000 · 주택 + 정착면적 200이면 B 198,210,000 (−55,750,000)", async () => {
    const legacy = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }]);
    const house = await run(row("B-M1"));
    expect(legacy.result?.calculatedTax).toBe(N);
    expect(house.result?.calculatedTax).toBe(B);
    expect(house.result.calculatedTax - legacy.result.calculatedTax).toBe(B - N);
  });
});

describe("E3d-2 Anchor 10 — 수도권 값이 other_land 입력에서 엔진 판정까지 닿는다(T-7 · Y-24)", () => {
  it("정착 200㎡ · 일반주거 · 양도 2024-01-01: 수도권 yes → 3배(허용 600) 초과 N / no → 5배(허용 1,000) 이내 B", async () => {
    const yes = await run({ ...row("B-M1"), metro: "yes" });
    const no = await run({ ...row("B-M1"), metro: "no" });
    expect(houseIv(yes)[0]).toMatchObject({ houseOutcome: "exceeded", houseCheck: { multiplier: 3, allowedArea: 600, excessArea: 400 } });
    expect(houseIv(no)[0]).toMatchObject({ houseOutcome: "within", houseCheck: { multiplier: 5, allowedArea: 1000 } });
    expect(yes.result?.calculatedTax).toBe(N);
    expect(no.result?.calculatedTax).toBe(B);
  });

  it("333.34㎡: 수도권 yes → 3배 이내(허용 1,000.02) · no → 5배 이내(허용 1,666.7) — 같은 정착면적이 두 쪽 모두 이내지만 근거 배율이 다르다", async () => {
    const yes = await run({ ...row("B1c-333.34"), metro: "yes" });
    const no = await run({ ...row("B1c-333.34"), metro: "no" });
    expect(houseIv(yes)[0].houseCheck).toMatchObject({ multiplier: 3, allowedArea: 1000.02 });
    expect(houseIv(no)[0].houseCheck).toMatchObject({ multiplier: 5, allowedArea: 1666.7 });
  });

  it("B16 직접 API: 수도권 «모름»·미선택·칸 없음(주·상·공) → 보수적 3배 + 기존 경고(200 — ⑫는 ⑧보다 엄격하지 않다)", async () => {
    for (const r of [{ ...row("B-M1"), metro: "unknown" as const }, { ...row("B-M1"), metro: "" as const }, { ...row("B-M1"), metroOmit: true }]) {
      const res = await run(r);
      expect(res.status, errorText(res).slice(0, 300)).toBe(200);
      expect(houseIv(res)[0].houseCheck.multiplier).toBe(3);
      expect(res.nbl?.warnings).toContain(HOUSING_METRO_DEFAULTED_WARNING);
    }
  });

  it("B17: 수도권이 배율을 가르지 않는 조합(녹지)은 값이 와도 읽지 않는다 — 경고도 없다", async () => {
    const res = await run({ ...row("B-M1"), zone: "green", metro: "yes" });
    expect(res.status).toBe(200);
    expect(houseIv(res)[0].houseCheck).toMatchObject({ multiplier: 5 });
    expect(res.nbl?.warnings).not.toContain(HOUSING_METRO_DEFAULTED_WARNING);
  });

  it("B1d: 양도일로 갈린다 — 수도권 정착 200 · 양도 2021-12-31 → 5배 이내 / 2022-01-01 → 3배 초과(구간 당시 법령이 아니다 · Y-29)", async () => {
    const base = { ...row("B-M1"), metro: "yes" as const };
    const pre = await run({ ...base, transfer: "2021-12-31" });
    const post = await run({ ...base, transfer: "2022-01-01" });
    expect([houseIv(pre)[0].houseOutcome, houseIv(pre)[0].houseCheck.multiplier]).toEqual(["within", 5]);
    expect([houseIv(post)[0].houseOutcome, houseIv(post)[0].houseCheck.multiplier]).toEqual(["exceeded", 3]);
  });
});

describe("E3d-2 ⑫ — 직접 API 계약: 정착면적 오입력은 400이 아니라 접힘(Q-10 (가) · D-16)", () => {
  it.each([
    ["빈칸", ""],
    ["미전송", undefined],
    ["0", "0"],
    ["-5", "-5"],
    ["abc", "abc"],
    ["정착 1,200 > 토지 1,000", "1200"],
  ])("정착면적 %s → 200 · 접힘(`unconfirmed`) + UNCONFIRMED 고지 — «이내»로 읽지 않는다(Y-31)", async (_n, fp) => {
    const res = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", ...(fp === undefined ? {} : { houseFootprintBefore: fp }) }]);
    expect(res.status, errorText(res).slice(0, 300)).toBe(200);
    expect(houseIv(res)[0].houseOutcome).toBe("unconfirmed");
    expect(res.nbl?.isNonBusinessLand).toBe(true);
    expect(res.result?.calculatedTax).toBe(N);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE);
    expect(res.nbl?.warnings).not.toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE); // T-6
  });

  it("초과(100㎡) → 200 · `exceeded` + EXCEEDED 고지 · «초과»가 «모름»(빈칸)보다 유리하지 않다 — 같은 수(Y-7) · 9호 유예가 있으면 Q-8 (가) 고지", async () => {
    const exceeded = await run(row("B7"));
    const unknown = await run(row("B6"));
    expect(exceeded.status).toBe(200);
    expect(exceeded.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
    expect(exceeded.nbl?.warnings).not.toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    expect(exceeded.result?.calculatedTax).toBe(unknown.result?.calculatedTax);
    expect(exceeded.nbl?.effectiveBusinessDays).toBe(unknown.nbl?.effectiveBusinessDays);
    const withGrace = await run(row("B7g"));
    expect(withGrace.nbl?.warnings).toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    expect(withGrace.nbl?.gracePeriodDays).toBe(730);
  });

  it("Y-16(T-5): 주택으로 바꾼 철거 행에 숨은 stale `propertyTaxTypeBefore`(별도합산)를 보내도 판정에 새지 않는다 — 정착면적 빈칸이면 N", async () => {
    const res = await run(row("B6"), [{ kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", propertyTaxTypeBefore: "separate" }]);
    expect(res.status).toBe(200);
    expect(res.nbl?.isNonBusinessLand).toBe(true);
    expect(houseIv(res)[0].houseOutcome).toBe("unconfirmed");
    expect(res.result?.calculatedTax).toBe(N);
  });

  it("종류 칸 `\"\"`·미전송은 종전 그대로(Anchor 9) — 같은 철거 행(별도합산)이 B 198,210,000 · 주택 echo·주택 고지 없음", async () => {
    for (const kind of [undefined, ""]) {
      const res = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate", ...(kind === undefined ? {} : { buildingKindBefore: kind }) }]);
      expect(res.status, String(kind)).toBe(200);
      expect(res.result?.calculatedTax, String(kind)).toBe(B);
      expect(houseIv(res), String(kind)).toEqual([]);
      expect(res.nbl?.warnings, String(kind)).not.toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    }
  });
});

describe("E3d-2 ⑫′ 구조 규칙 D-8 — 400 (⑧과 같은 leaf · 기타토지 카드라 «건축물 사건» 접두)", () => {
  it("B10: 종류 `house`를 신축 행에 입력 → 400", async () => {
    const res = await run(row("B-M1"), [{ kind: "building_built", date: "2016-01-01", buildingKindBefore: "house" }, { kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", houseFootprintBefore: "200" }]);
    expect(res.status).toBe(400);
    expect(errorText(res)).toContain("건축물 사건 1번째 행");
    expect(errorText(res)).toContain("buildingKindBefore");
  });

  it("B10: 종류 `house`를 재산세 과세 구분 변경 행에 입력 → 400", async () => {
    const res = await run(row("B-M1"), [{ kind: "tax_type_changed", date: "2016-01-01", buildingKindBefore: "house" }, { kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", houseFootprintBefore: "200" }]);
    expect(res.status).toBe(400);
    expect(errorText(res)).toContain("재산세 과세 구분 변경 사건 1번째 행");
  });

  it("B9: 주택 구간 안에 `tax_type_changed` → 400 · 주택 구간 **밖**(철거 뒤 나대지) 구분 변경은 200", async () => {
    const inside = await run(row("B-M1"), [{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, { kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", houseFootprintBefore: "200" }]);
    expect(inside.status).toBe(400);
    expect(errorText(inside)).toContain("구분이 바뀐 건축물 구간은 「주택」으로 입력할 수 없습니다");
    const outside = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", buildingKindBefore: "house", houseFootprintBefore: "200" }, { kind: "tax_type_changed", date: "2022-01-01", propertyTaxTypeBefore: "comprehensive" }]);
    expect(outside.status, errorText(outside).slice(0, 300)).toBe(200);
  });

  it("종류 enum: `house`·`\"\"`만 — 허용값 밖은 400(⑫ Zod enum)", async () => {
    const res = await run(row("B-M1"), [{ kind: "building_removed", date: "2021-01-01", buildingKindBefore: "villa", houseFootprintBefore: "200" }]);
    expect(res.status).toBe(400);
  });

  it("`unchanged`·`unknown`·`\"\"` 모드는 구조 규칙을 읽지 않는다 — stale 행이 400을 만들지 않고 이력도 쓰이지 않는다", async () => {
    for (const mode of ["", "unchanged", "unknown"]) {
      const res = await run(row("B-M1"), [{ kind: "building_built", date: "2016-01-01", buildingKindBefore: "house" }], (raw) => { raw.nblOtherStateHistoryMode = mode; });
      expect(res.status, mode).toBe(200);
      expect(res.nbl?.periodEvaluation?.basis, mode).not.toBe("state_history");
      if (mode === "unknown") expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    }
  });
});

describe("E3d-2 B12 · UQ-12 — 양도일 의제 사유 + 주택 철거 행: 이력을 쓰지 않는다(수도권·정착면적 입력과 무관)", () => {
  it("의제(경매) 사유 선택 → state_history가 아니고 주택 고지가 없다", async () => {
    const res = await run(row("B-M1"), undefined, (raw) => { raw.nblDeemedTransferReason = "auction"; raw.nblDeemedTransferDate = "2020-01-01"; });
    expect(res.status, errorText(res).slice(0, 300)).toBe(200);
    expect(res.nbl?.periodEvaluation?.basis).not.toBe("state_history");
    expect(res.nbl?.warnings).not.toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
  });
});

describe("E3d-2 route 관통 — 다건 입구 · 축 B 지분", () => {
  it("다건 route: 같은 raw가 단건과 같은 판정으로 이력에 닿는다 — B1(철거 후 사업용) · B1b(0.05㎡ 초과 → 접힘)", async () => {
    for (const id of ["B-M1", "B1b"] as const) {
      const r = row(id);
      const body = await buildMultiBody([formOf(r)]);
      const holder = ((body as Loose).properties as Loose[])?.[0]?.nonBusinessLandRaw as Loose | undefined;
      expect(holder, `${id} 다건 body에 raw가 있다`).toBeDefined();
      holder!.nblOtherStateHistoryMode = "changed";
      holder!.nblOtherStateEvents = e3dBRowRaw(r).nblOtherStateEvents;
      holder!.nblIsMetropolitanArea = "no";
      const multi = await postMulti(body);
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, id).toBe("state_history");
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
    }
  });

  it("B13 축 B 지분(소유기간만 다른 같은 이력): 지분1(취득 2014) 사업용 · 지분2(취득 2020) 비사업용(365/1,460) · 지분3(취득 2021-06 · 철거가 소유 전 → 클립) 비사업용 — E2 M14와 같은 값. 지분 카드의 `acquisitionArea`가 지분 면적인지는 미확인(V-19) — 이 표는 면적 1,000㎡ 그대로", async () => {
    for (const id of ["B-M14-1", "B-M14-2", "B-M14-3"] as const) {
      const r = row(id);
      const res = await run(r);
      expect(res.status, id).toBe(200);
      expect(res.nbl?.isNonBusinessLand, id).toBe(r.expect.nonBusiness);
      expect(res.nbl?.effectiveBusinessDays, id).toBe(r.expect.eff);
      expect(res.result?.calculatedTax, id).toBe(r.expect.tax);
    }
  });
});
