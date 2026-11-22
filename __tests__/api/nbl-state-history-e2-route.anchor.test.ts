/**
 * NBL-STATE-HISTORY-E2 — route 관통 anchor: 와이어 칸(`nblOtherStateHistoryMode`·`nblOtherStateEvents`) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §5(⑫⑭) · §6 «일 단위» 열 · §7.3 P-8(⑫ 침묵 strip)·P-9(⑭ 미운반)·P-10(축 B 클립)·P-12·P-13
 * 입력 경로: 폼(칸을 자산에 직접 얹는다 — ④ prefix-pick `nbl*`이 운반) → ④ `callTransferTaxAPI`/`callMultiTransferTaxAPI` 본문 → 실제 route(⑫⑭) → 엔진.
 * 입구 5곳 중 단건·다건·축 B 지분(컴패니언 raw)·이월과세 배제(시나리오 B, `buildNblEngineInputGiftBasis`)를 각각 건다 — 전부 `mapAssetToNblInput` 한 함수를 거치지만
 * 각 입구가 그 함수를 부르는 줄은 따로다(⑭ TS 미감지). 수치는 mock 세율표(`makeMockRates`) 실측값이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";
import { E2_ROWS, e2RowRaw, type E2Row } from "../tax-engine/_helpers/nbl-state-history-e2-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 행 raw 중 자산 칸이 아닌 3개(취득일·양도일·면적은 자산·폼 값으로 따로 싣는다)를 뺀 `nbl*` 칸 — 자산에 직접 얹으면 ④ prefix-pick이 운반한다. */
function nblKeysOf(row: E2Row): Partial<AssetForm> {
  const { acquisitionArea: _a, acquisitionDate: _d, transferDate: _t, ...nbl } = e2RowRaw(row);
  return nbl as Partial<AssetForm>;
}

/** 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억 단건 — 행의 취득일·양도일·칸을 싣는다. */
function formOf(row: E2Row, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = row.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: row.acq ?? "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nblKeysOf(row), over) as AssetForm,
  ];
  return f;
}

async function runSingle(f: TransferFormData, mutateRaw?: (raw: Loose) => void) {
  const body = await captureBody(f);
  if (mutateRaw) mutateRaw(body.nonBusinessLandRaw as Loose);
  const r = await postTransfer(body);
  return { ...r, body, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

describe("E2 route 관통 — 엔진 §6 «일 단위» 열 전 행(단건): 입력 → ⑫ → ⑭ → 엔진 → 세액", () => {
  it.each(E2_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, row: E2Row) => {
    // 연접 다필지 행은 화면 경로(④)에서는 이력 질문이 숨고 ④가 `""`·`[]`로 비워 보낸다(U1 — 통합 Q-13 배타). 이 행은 «직접 API로 보낸 raw»의 엔진 계약이라 body 캡처 뒤 이력 칸을 다시 얹는다.
    const directApi = row.extra?.nblOtherUseParcels === true;
    const r = await runSingle(formOf(row), directApi ? (raw) => {
      const src = e2RowRaw(row);
      raw.nblOtherStateHistoryMode = src.nblOtherStateHistoryMode;
      raw.nblOtherStateEvents = src.nblOtherStateEvents;
    } : undefined);
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.body.nonBusinessLandRaw, "④가 raw를 싣는다").toBeDefined();
    expect(r.nbl?.periodEvaluation?.basis).toBe("state_history");
    expect(r.nbl?.isNonBusinessLand).toBe(row.expect.nonBusiness);
    expect(r.nbl?.effectiveBusinessDays).toBe(row.expect.eff);
    expect(r.nbl?.totalOwnershipDays).toBe(row.expect.total);
    if (row.expect.graceDays !== undefined) expect(r.nbl?.gracePeriodDays).toBe(row.expect.graceDays);
    if (row.expect.tax !== undefined) expect(r.result?.calculatedTax).toBe(row.expect.tax);
    expect(r.nbl?.warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
  });
});

describe("E2 route 관통 — 다건·축 B 지분·이월과세 배제 입구", () => {
  const M1 = E2_ROWS.find((r) => r.id === "M1")!; // 철거 후 나대지 → 사업용(2,556/3,651) · 이력 없으면 비사업용
  const M6 = E2_ROWS.find((r) => r.id === "M6")!; // 신축 직후 → 비사업용(214/3,651) · 이력 없으면 사업용

  it("다건 route(`multi/route-property-input.ts`): 같은 폼이 단건과 같은 판정·세액으로 이력에 닿는다", async () => {
    for (const row of [M1, M6]) {
      const single = await runSingle(formOf(row));
      const multi = await postMulti(await buildMultiBody([formOf(row)]));
      expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
      const p = multi.props[0] as Loose;
      expect(p.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, row.id).toBe("state_history");
      expect(p.nonBusinessLandJudgmentDetail?.effectiveBusinessDays, row.id).toBe(row.expect.eff);
      expect(p.nonBusinessLandJudgmentDetail?.isNonBusinessLand, row.id).toBe(row.expect.nonBusiness);
      // 다건 property에는 산출세액이 없고 결정세액(연간 합산 기본공제 배분 후)이 있다 — 이력 없는 같은 폼과 비교하면 이력이 세액을 «어느 쪽으로» 바꿨는지가 보인다.
      const noHistory = await postMulti(await buildMultiBody([formOf(row, { nblOtherStateHistoryMode: "" } as Partial<AssetForm>)]));
      const q = noHistory.props[0] as Loose;
      expect(q.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis, row.id).toBe("state_at_transfer");
      if (row.expect.nonBusiness) expect(p.determinedTax, row.id).toBeGreaterThan(q.determinedTax); // 과소 해소: 신축 직후 — 사업용 → 비사업용
      else expect(p.determinedTax, row.id).toBeLessThan(q.determinedTax); // 과대 해소: 철거 후 — 비사업용 → 사업용
      expect(single.result.calculatedTax, row.id).toBe(row.expect.tax);
    }
  });

  it("축 B 지분(`bundled-split-helpers.ts` 컴패니언 raw): 이력은 땅 사실(첫 카드), 소유기간은 지분 취득일 — 지분2 늦은 취득은 400이 아니라 클립(M14)", async () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.filingDate = "2025-12-31";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    const base = { assetKind: "land", acquisitionCause: "purchase", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "150000000", isNonBusinessLand: true } as Partial<AssetForm>;
    f.assets = [
      Object.assign({ ...makeDefaultAsset(1) }, base, { acquisitionDate: "2014-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }, nblKeysOf(M1)) as AssetForm,
      Object.assign({ ...makeDefaultAsset(2) }, base, { acquisitionDate: "2021-06-01", ownershipNumerator: "50", ownershipDenominator: "100" }) as AssetForm,
    ];
    const body = await captureBody(f);
    const companions = body.companionAssets as Loose[];
    expect(companions?.[0]?.nonBusinessLandRaw?.nblOtherStateHistoryMode, "컴패니언 raw가 이력 칸을 운반한다").toBe("changed");
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const json = (await res.json()) as Loose;
    expect(res.status, JSON.stringify(json).slice(0, 500)).toBe(200);
    const props = json.data.aggregated.properties as Loose[];
    const details = props.map((p) => p.nonBusinessLandJudgmentDetail);
    // 지분1(취득 2014-01-01): 철거 2021-01-01 전 건축물(별도합산) 2,556일 → 사업용 · 지분2(취득 2021-06-01): 철거가 소유 전이라 클립 → 전 구간 나대지 0/943 → 비사업용
    expect(details.map((d) => d?.periodEvaluation?.basis)).toEqual(["state_history", "state_history"]);
    expect(details.map((d) => [d?.isNonBusinessLand, d?.effectiveBusinessDays, d?.totalOwnershipDays])).toEqual([
      [false, 2556, 3651],
      [true, 0, 943],
    ]);
  });

  describe("이월과세 배제(시나리오 B) — `buildNblEngineInputGiftBasis`: 이력이 수증일 기산으로 다시 매핑된다", () => {
    const T = "2024-06-03";
    const carry = (giftDate: string, donorDate: string, over: Record<string, unknown> = {}) =>
      ({
        giftRegistryDate: giftDate, donorAcquisitionDate: donorDate, donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
        estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: {}, donorRelation: "spouse", ...over,
      }) as unknown as AssetForm["carryover"];
    const events = (...e: Array<[string, string]>) => e.map(([kind, date]) => ({ kind, date, ...(kind === "building_removed" ? { propertyTaxTypeBefore: "separate" } : {}) }));
    const OTHER = {
      assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
      standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "changed",
    } as Partial<AssetForm>;
    const mainForm = (over: Partial<AssetForm>): TransferFormData => {
      const f = createDefaultTransferFormData();
      f.transferDate = T;
      f.filingDate = "2024-08-31";
      f.contractTotalPrice = "1000000000";
      f.assets = [Object.assign({ ...makeDefaultAsset(1) }, OTHER, over) as AssetForm];
      return f;
    };
    const asCarryover = (c: AssetForm["carryover"], ev: unknown[]) =>
      mainForm({ acquisitionCause: "carryover_gift", acquisitionDate: "", carryover: c, nblOtherStateEvents: ev } as unknown as Partial<AssetForm>);
    const purchaseAt = (g: string, ev: unknown[]) =>
      mainForm({ acquisitionCause: "purchase", acquisitionDate: g, fixedAcquisitionPrice: "100000000", nblOtherStateEvents: ev } as unknown as Partial<AssetForm>);

    it("③ 기간 경과 배제: B 채택 — 증여자 취득 2000-01-01 · 수증 2013-03-01 · 철거 2015-01-01 이력 → NBL = 수증일 기준(건축물 670일 사업용) · 수증일에 매입한 일반 토지 대조와 세액이 같다", async () => {
      const ev = events(["building_removed", "2015-01-01"]);
      const r = await runSingle(asCarryover(carry("2013-03-01", "2000-01-01"), ev));
      const control = await runSingle(purchaseAt("2013-03-01", ev));
      expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
      expect(r.result.carryoverTaxationDetail).toMatchObject({ adoptedScenario: "B", exclusionReason: "period_exceeded" });
      // 시나리오 B의 NBL은 `IfCarryoverExcluded` 입력(수증일 기산)이다 — 이력이 그 입력에도 실렸으면 670일, 못 실렸으면(P-9) 전 구간 나대지 0일.
      expect(r.nbl?.totalOwnershipDays).toBe(4111); // 2013-03-02 ~ 2024-06-03
      expect(r.nbl?.effectiveBusinessDays).toBe(670); // 2013-03-02 ~ 2015-01-01
      expect(r.nbl?.isNonBusinessLand).toBe(true);
      expect(r.result.totalTax).toBe(control.result.totalTax);
      expect(control.nbl?.effectiveBusinessDays).toBe(670);
    });

    it("대조 — 이월과세가 적용(A 채택)되면 증여자 취득일 기산 그대로(소유기간 2000-01-02~): 같은 이력이 증여자 소유기간 전체에 걸쳐 판정된다", async () => {
      const ev = events(["building_removed", "2023-01-01"]);
      const r = await runSingle(asCarryover(carry("2022-03-01", "2000-01-01", { giftDateValuation: "900000000" }), ev));
      expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
      expect(r.result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
      // 2000-01-02 ~ 2023-01-01 건축물(별도합산) 8,400일 사업용 · 철거 후 나대지 519일 → 직전 5년 비사업 519 ≤ 730 → 사업용
      expect(r.nbl?.totalOwnershipDays).toBe(8919);
      expect(r.nbl?.effectiveBusinessDays).toBe(8400);
      expect(r.nbl?.isNonBusinessLand).toBe(false);
    });
  });
});

describe("E2 ⑫ — 직접 API 계약: `changed`일 때만 400 · `\"\"`·미전송·`unchanged`·`unknown`은 현행(400 아님)", () => {
  const M6 = E2_ROWS.find((r) => r.id === "M6")!;
  const ok = (r: { status: number; json: Loose }) => expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const run = (events: unknown, mode: unknown = "changed") =>
    runSingle(formOf(M6), (raw) => {
      raw.nblOtherStateHistoryMode = mode;
      raw.nblOtherStateEvents = events;
    });
  const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

  it("`changed` + 사건 0건 → 400(이력 없음을 changed로 위장한 입력 차단 — ⑧과 같은 문구)", async () => {
    const r = await run([]);
    expect(r.status).toBe(400);
    expect(errorText(r)).toContain("사건을 1건 이상 입력하거나");
  });

  it.each([
    ["순서 역전(P-12)", [{ kind: "building_removed", date: "2021-01-01" }, { kind: "building_built", date: "2020-01-01" }], "앞 사건(2021-01-01)보다 빠릅니다"],
    ["같은 날(P-12)", [{ kind: "building_removed", date: "2021-01-01" }, { kind: "building_built", date: "2021-01-01" }], "같은 날"],
    ["양도일 당일(P-13)", [{ kind: "building_built", date: "2024-01-01" }], "양도일(2024-01-01) 당일 또는 그 이후"],
    ["양도일 이후", [{ kind: "building_built", date: "2024-02-01" }], "양도일(2024-01-01) 당일 또는 그 이후"],
    ["같은 종류 연속(신축 뒤 신축)", [{ kind: "building_built", date: "2021-01-01" }, { kind: "building_built", date: "2022-01-01" }], "사이에 「건축물 멸실·철거·붕괴」 사건이 빠졌습니까"],
    ["종류 미선택", [{ kind: "", date: "2021-01-01" }], "종류(건축물 신축 / 건축물 멸실·철거·붕괴)를 선택하세요"],
    ["날짜 빈 칸", [{ kind: "building_built", date: "" }], "날짜를 입력하세요"],
    ["날짜 해석 불가", [{ kind: "building_built", date: "2021-13-45" }], "날짜(YYYY-MM-DD)로 읽을 수 없습니다"],
  ])("`changed` + %s → 400 + 공용 leaf 문구", async (_n, events, text) => {
    const r = await run(events);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
    expect(errorText(r)).toContain(text);
  });

  it("⑫ 하한 규칙 없음: `changed` + 취득일 이전·당일 사건도 400이 아니다(컴패니언 스키마가 지분 raw마다 이 refine을 돌려 늦게 취득한 지분이 막히기 때문 — 엔진이 클립)", async () => {
    const r = await run([{ kind: "building_removed", date: "2013-06-01", propertyTaxTypeBefore: "separate" }]);
    ok(r);
    expect(r.nbl?.periodEvaluation?.basis).toBe("state_history");
    const sameDay = await run([{ kind: "building_removed", date: "2014-01-01", propertyTaxTypeBefore: "separate" }]);
    ok(sameDay);
  });

  it("철거 직전 재산세 구분은 enum — 허용값 밖은 400(침묵 strip이 아니다 · P-8) · `\"\"`(모름)은 통과해 종합합산 + 확인 필요로 판정된다", async () => {
    const bad = await run([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "foo" }]);
    expect(bad.status).toBe(400);
    const unknown = await run([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }]);
    ok(unknown);
    expect(unknown.nbl?.isNonBusinessLand).toBe(true);
    expect(unknown.nbl?.effectiveBusinessDays).toBe(0);
  });

  it("질문 답 enum 밖(\"maybe\") → 400", async () => {
    const r = await run([{ kind: "building_built", date: "2023-06-01" }], "maybe");
    expect(r.status).toBe(400);
  });

  it("`\"\"`·미전송·`unchanged`·`unknown` + 쓰레기 사건(역순·같은 날·종류 미선택): 400이 아니고 이력 판정도 하지 않는다(현행 — E0 하위호환)", async () => {
    const trash = [{ kind: "", date: "" }, { kind: "building_built", date: "2024-02-01" }, { kind: "building_built", date: "2024-02-01" }];
    const base = await runSingle(formOf(M6), (raw) => {
      delete raw.nblOtherStateHistoryMode;
      delete raw.nblOtherStateEvents;
    });
    ok(base);
    for (const mode of ["", "unchanged", "unknown"]) {
      const r = await run(trash, mode);
      ok(r);
      expect(r.nbl?.periodEvaluation?.basis, mode).toBe("state_at_transfer");
      expect(r.nbl?.isNonBusinessLand, mode).toBe(base.nbl?.isNonBusinessLand);
      expect(r.result.calculatedTax, mode).toBe(base.result.calculatedTax);
    }
    // 이력 칸을 아예 안 보낸 값 = 현행(신축 직후인데 양도일 현재 상태로 사업용)
    expect(base.nbl?.isNonBusinessLand).toBe(false);
    expect(base.result.calculatedTax).toBe(198_210_000);
  });

  it("이력을 쓰지 않는 지목(농지)은 `changed` + 사건 오류도 400이 아니다 — `consumesStateHistory` 소비표", async () => {
    const farm = formOf(M6, { nblLandType: "farmland", nblZoneType: "agriculture_forest" } as Partial<AssetForm>);
    const r = await runSingle(farm, (raw) => {
      raw.nblOtherStateHistoryMode = "changed";
      raw.nblOtherStateEvents = [];
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).not.toBe(400);
  });
});

describe("E2 ⑫⑭ — hasBuilding 파생: `changed`이면 숨은 토글이 사건과 모순돼도 사건이 이긴다 (V-19 · P-15)", () => {
  const M6 = E2_ROWS.find((r) => r.id === "M6")!;
  it("신축으로 끝나는데 raw 토글이 «건축물 없음»: 사건대로 «건축물 있음(별도합산 배율 이내)» 꼬리 — M6과 같은 판정(비사업용 214/3,651) · 토글을 그대로 읽었다면 나대지로 보아 별도합산이 무너진다", async () => {
    const r = await runSingle(formOf(M6), (raw) => {
      raw.nblOtherHasBuilding = false;
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(true);
    expect(r.nbl?.effectiveBusinessDays).toBe(214);
    const echo = r.nbl?.periodEvaluation?.stateHistory?.intervals as Loose[];
    expect(echo.map((i) => i.hasBuilding)).toEqual([false, true]);
  });

  it("⑫ 거울: 철거 근거 바닥면적 검사(`demolishedBasisIssue`)도 파생값을 쓴다 — 철거로 끝나는 `changed` + 근거 «철거·멸실» + 바닥면적 없음 → 400, 토글이 «건축물 있음»이어도 같다", async () => {
    const M1 = E2_ROWS.find((r) => r.id === "M1")!;
    const r = await runSingle(formOf(M1), (raw) => {
      raw.nblOtherHasBuilding = true; // 사건은 철거로 끝난다 → 파생값 false
      raw.nblOtherPropertyTaxType = "separate";
      raw.nblOtherPropertyTaxBasis = "demolished";
      raw.nblOtherDemolishedFloorArea = "";
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  });
});

describe("E2 ⑭ — callTransferTaxAPI body에 이력 칸이 그대로 실린다 (⑬ 무변경 확인)", () => {
  it("raw에 두 칸이 모두 실리고 Zod 통과 후에도 사라지지 않는다(침묵 strip 방지 — 응답에 이력 판정이 나타난다)", async () => {
    const M6 = E2_ROWS.find((r) => r.id === "M6")!;
    const cap: { body?: Loose } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }));
    await callTransferTaxAPI(formOf(M6));
    vi.unstubAllGlobals();
    expect(cap.body?.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("changed");
    // ④가 신축 행의 «철거 직전 재산세 구분»을 `""`로 정규화해 싣는다(U1 — `stateHistoryWireFields`).
    expect(cap.body?.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
  });

  it("U1 ④ — 연접 다필지 ON + stale `changed`: 이력 칸을 비워 보내 400이 아니라 현행(`state_at_transfer`) 판정이 된다", async () => {
    const row = E2_ROWS.find((r) => r.id === "Da-연접다필지")!;
    const r = await runSingle(formOf(row));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.body.nonBusinessLandRaw).toMatchObject({ nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect(r.nbl?.periodEvaluation?.basis).toBe("state_at_transfer");
  });
});
