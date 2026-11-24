/**
 * NBL-STATE-HISTORY-E3-③ 후속 — «⑧은 엔진이 실제로 읽는 칸만 요구한다» 4건의 ⑧ ↔ ⑫ parity 격자 + 전송·세액 불변 anchor.
 *   #1 (Medium) 기타토지 철거 행 «주택» 입력(정착면적 H9 · 수도권 H10)을 core가 면적 일부만 비사업용으로 판정하면 엔진이 읽지 않는다(`isPartialArea` → `PARTIAL_AREA` 고지만) → ⑧ 요구 없음
 *   L1  2022.1.1. 전 양도(종전 영 §168의12 — 도시지역 일률 5배)는 수도권이 배율을 가르지 않는다 → ⑧ H10 요구 없음 · ④ 수도권 미전송 · ⑭ 매퍼도 같은 술어
 *   L2  양도일 의제 사유가 선택되면 엔진이 이력을 읽지 않는다 → ⑤ 필수 표시·수도권 칸이 ⑧과 같은 판정(렌더는 `nbl-house-prior-followups-render.test.tsx`)
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭) → 엔진. 불변식: (a) ⑫ 400인 행은 반드시 ⑧이 막는다 (b) ⑧ 단독 차단 행의 ⑫ 상태는 200
 *   (c) ⑧이 면제한 행의 세액·판정은 «요구했다면 채웠을 값»과 무관하다(엔진이 읽지 않는 칸 — 세액 불변).
 *
 * mutation 대응(계획서 §19 후속): ㉔ ⑧ H9에서 `housePriorHistoryIgnoredOf` 제거(P-A1·P-A2 N) · ㉕ ⑧ H10에서 같은 게이트 제거(P-B1 N) · ㉖ `housePriorNeedsMetropolitan`이 양도일을 무시(L1-a N) ·
 *   ㉗ 읽음 래퍼가 부분 면적 대신 자체 근사(P-C1 — 호 인정 PASS인데 요구해야 하는 행)로 바뀌면 P-A3·P-C1이 갈린다.
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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { housePriorNeedsMetropolitan } from "@/lib/tax-engine/non-business-land/house-prior-scope";
import { buildNblEngineInput, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Ev = NblOtherStateEventInput;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, footprint?: string): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  buildingKindBefore: "house",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
});

/** 기타토지(잡종지) 1,000㎡ · 일반주거 · 수도권 밖 · 취득 2014-01-01 → 양도 `transfer`(기본 2024-01-01) · 꼬리 나대지(종합합산 → 전량 비사업용) — 질문 «바뀐 적 없음». */
function formOf(over: Partial<AssetForm> = {}, transfer = "2024-01-01"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transfer;
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblIsMetropolitanArea: "no",
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "unchanged",
    }, over) as AssetForm,
  ];
  return f;
}
const changed = (events: Ev[], over: Partial<AssetForm> = {}): Partial<AssetForm> => ({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events, ...over });
const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblOtherState") || i.field === "nblIsMetropolitanArea");
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const r = await postTransfer(body);
  return { ...r, raw: body.nonBusinessLandRaw as Loose | undefined, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

/**
 * 부분 면적 입력 — 건물 있는 꼬리(신축 2020) + 별도합산 선언 + 바닥면적 `floor`㎡ · 시가표준액(2% 이상 — 나대지 간주 회피).
 * 일반주거 4배: 바닥 100㎡ → 허용 400㎡ < 1,000㎡ → 초과분 비사업용(비율 0.6 — 부분 면적). 바닥 400㎡ → 허용 1,600㎡ ≥ 1,000㎡ → 전량 사업용(이력을 읽는다 — 대조군).
 */
const partialBase = (floor: string): Partial<AssetForm> => ({
  nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: floor, nblOtherBuildingValue: "100000000", nblOtherLandValue: "200000000",
});
const PARTIAL = partialBase("100");
const WITHIN = partialBase("400");

describe("#1 Medium — core가 면적 일부만 비사업용이면 엔진은 철거 행 이력을 읽지 않는다 → ⑧ H9·H10 요구 없음(⑧ ↔ ⑫ parity)", () => {
  type Row = { id: string; over: Partial<AssetForm>; field8: string | null; status12: 200 | 400 };
  const rows: Row[] = [
    { id: "P-A1 부분 면적 + 주택 철거 행 정착면적 빈칸 → ⑧ 통과(엔진이 읽지 않는 칸) · ⑫ 200", over: changed([removed("2016-01-01", ""), built("2020-01-01")], PARTIAL), field8: null, status12: 200 },
    { id: "P-A2 부분 면적 + 정착면적 > 토지 면적(1,200 > 1,000) → ⑧ 통과(엔진이 읽지 않는다)", over: changed([removed("2016-01-01", "1200"), built("2020-01-01")], PARTIAL), field8: null, status12: 200 },
    { id: "P-A3 대조: 배율 이내(바닥 400㎡ → 허용 1,600㎡) = 전량 사업용 → 엔진이 이력을 읽는다 → 정착면적 빈칸은 여전히 ⑧ H9 차단", over: changed([removed("2016-01-01", ""), built("2020-01-01")], WITHIN), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P-B1 부분 면적 + 정착면적 정상 + 수도권 빈칸 → ⑧ H10 통과(엔진이 읽지 않는다)", over: changed([removed("2016-01-01", "200"), built("2020-01-01")], { ...PARTIAL, nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P-B2 대조: 이내 + 수도권 빈칸 → ⑧ H10 차단(엔진이 읽는다)", over: changed([removed("2016-01-01", "200"), built("2020-01-01")], { ...WITHIN, nblIsMetropolitanArea: "" }), field8: "nblIsMetropolitanArea", status12: 200 },
    { id: "P-B3 부분 면적 + 정착면적·수도권 둘 다 빈칸 → 통과", over: changed([removed("2016-01-01", ""), built("2020-01-01")], { ...PARTIAL, nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    // 다른 부분 면적 경로(호별 기준면적 초과) — 7개 분기의 한 곳이 아니라 core 결과를 읽는다는 증거(자체 근사면 한 경로만 맞는다).
    { id: "P-C1 호별 기준면적 초과(주차장 최소 100㎡ → 한도 < 1,000㎡) + 정착면적 빈칸 → ⑧ 통과", over: changed([removed("2016-01-01", ""), built("2020-01-01")], { nblOtherRelatedBusinessType: "parking_garage", nblOtherMinGarageArea: "100", nblOtherBuildingFloorArea: "100" } as Partial<AssetForm>), field8: null, status12: 200 },
    // 구조 오류·날짜 오류는 부분 면적이어도 막는다(건너뛰는 것은 H9·H10뿐)
    { id: "P-D1 부분 면적 + 주택 구간 안 구분 변경(구조 오류 D-8) → 여전히 차단", over: changed([{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, removed("2018-01-01", ""), built("2020-01-01")], PARTIAL), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "P-D2 부분 면적 + 사건일 ≤ 취득일 → 여전히 ⑧ 날짜 차단", over: changed([removed("2013-06-01", ""), built("2020-01-01")], PARTIAL), field8: "nblOtherStateEvents.0.date", status12: 200 },
  ];

  it.each(rows.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const f = formOf(row.over);
    const found = issue8(f);
    expect(found?.field ?? null, `⑧ field — ${found?.message ?? ""}`).toBe(row.field8);
    const s = (await post(f)).status;
    expect(s, `⑫ 상태(${s})`).toBe(row.status12);
    if (s === 400) expect(found, "⑫가 막는데 ⑧이 통과 = UI 통과 → API 400 모순").toBeDefined();
  });

  it("엔진 오라클: 부분 면적 + 정착면적 빈칸/정상/어긋남 — 판정·세액이 같다(엔진이 읽지 않는 칸 — 세액 불변) · `PARTIAL_AREA` 고지 · 이력 미적용", async () => {
    const blank = await post(formOf(changed([removed("2016-01-01", ""), built("2020-01-01")], PARTIAL)));
    const filled = await post(formOf(changed([removed("2016-01-01", "200"), built("2020-01-01")], PARTIAL)));
    const exceeded = await post(formOf(changed([removed("2016-01-01", "1200"), built("2020-01-01")], PARTIAL)));
    for (const r of [blank, filled, exceeded]) {
      expect(r.status).toBe(200);
      expect(r.nbl?.periodEvaluation?.basis).toBe("state_at_transfer");
      expect(r.nbl?.warnings).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    }
    expect(filled.result?.calculatedTax).toBe(blank.result?.calculatedTax);
    expect(exceeded.result?.calculatedTax).toBe(blank.result?.calculatedTax);
    expect(filled.nbl?.areaProportioning?.nonBusinessRatio).toBe(0.6);
    // 이력 없음(`unchanged`)과도 같은 세액 — 이력이 접히므로 현행 결과와 바이트 동일한 판정이다
    const none = await post(formOf({ ...PARTIAL, nblOtherHasBuilding: true }));
    expect(blank.result?.calculatedTax).toBe(none.result?.calculatedTax);
  });

  it("④ 전송은 달라지지 않는다 — 면제는 ⑧ 요구·⑤ 표시뿐이고 와이어(정착면적 키)는 입력 그대로다(침묵 drop 금지)", async () => {
    const r = await post(formOf(changed([removed("2016-01-01", "200"), built("2020-01-01")], PARTIAL)));
    expect((r.raw?.nblOtherStateEvents as Loose[])[0]).toMatchObject({ buildingKindBefore: "house", houseFootprintBefore: "200" });
  });
});

describe("L1 — 2022.1.1. 전 양도(종전 영 §168의12: 도시지역 일률 5배)는 수도권이 배율을 가르지 않는다 → H10 요구 없음 · 수도권 미전송", () => {
  const withMetroBlank = (over: Partial<AssetForm> = {}) => changed([removed("2016-01-01", "200")], { nblIsMetropolitanArea: "", ...over });

  it.each([
    ["L1-a 양도 2021-12-31 + 주·상·공 + 주택 철거 + 수도권 빈칸 → ⑧ 통과 · ⑫ 200", "2021-12-31", null],
    ["L1-b 경계 양도 2022-01-01 → ⑧ H10 차단(현행 표 — 수도권 3배 / 밖 5배)", "2022-01-01", "nblIsMetropolitanArea"],
    ["L1-c 양도 2023-06-30 → ⑧ H10 차단", "2023-06-30", "nblIsMetropolitanArea"],
  ] as const)("%s", async (_n, transfer, field8) => {
    const f = formOf(withMetroBlank(), transfer);
    expect(issue8(f)?.field ?? null).toBe(field8);
    expect((await post(f)).status).toBe(200);
  });

  it("L1-d 종전 규정 양도에서 수도권을 «미확인»으로 둬도 통과", () => {
    expect(issue8(formOf(withMetroBlank({ nblIsMetropolitanArea: "unknown" }), "2021-06-01"))).toBeUndefined();
  });

  it("L1-e 세액·판정 불변 — 2021-12-31 양도: 수도권 미입력 = «예» = «아니오»(엔진이 종전 표로 5배 — 수도권을 읽지 않는다)", async () => {
    const [blank, yes, no] = await Promise.all(["", "yes", "no"].map((m) => post(formOf(withMetroBlank({ nblIsMetropolitanArea: m as AssetForm["nblIsMetropolitanArea"] }), "2021-12-31"))));
    for (const r of [blank, yes, no]) expect(r.status).toBe(200);
    expect(blank.result?.calculatedTax).toBe(yes.result?.calculatedTax);
    expect(blank.result?.calculatedTax).toBe(no.result?.calculatedTax);
    expect(blank.nbl?.periodEvaluation?.stateHistory?.intervals).toEqual(yes.nbl?.periodEvaluation?.stateHistory?.intervals);
    expect(blank.nbl?.periodEvaluation?.stateHistory?.intervals).toEqual(no.nbl?.periodEvaluation?.stateHistory?.intervals);
    // 현행 표에서는 달라진다(대조 — 2022-01-01 이후 수도권이 3배 vs 5배를 가른다): 정착 200㎡ → 허용 600㎡ vs 1,000㎡
    const cur = await Promise.all(["yes", "no"].map((m) => post(formOf(changed([removed("2016-01-01", "200")], { nblIsMetropolitanArea: m as AssetForm["nblIsMetropolitanArea"] }), "2024-01-01"))));
    expect(cur[0].nbl?.periodEvaluation?.stateHistory?.intervals).not.toEqual(cur[1].nbl?.periodEvaluation?.stateHistory?.intervals);
  });

  it("L1-f ④ 수도권 전송: 종전 규정 양도면 비운다(술어 거짓) · 현행 양도면 입력 그대로 — ⑭ 매퍼도 같은 술어(받은 값을 읽지 않는다)", async () => {
    const pre = await post(formOf(withMetroBlank({ nblIsMetropolitanArea: "yes" }), "2021-12-31"));
    expect(pre.raw?.nblIsMetropolitanArea).toBe("");
    const cur = await post(formOf(withMetroBlank({ nblIsMetropolitanArea: "yes" }), "2024-01-01"));
    expect(cur.raw?.nblIsMetropolitanArea).toBe("yes");
  });

  it("L1-h ⑭ 매퍼 = 같은 술어 — 직접 API로 수도권 «yes»를 보내도 종전 규정 양도에서는 엔진 입력에 싣지 않는다(양도일 인자 없이는 5배 구간이 «수도권 3배»로 읽힌다) · 현행 양도는 싣는다", () => {
    const mapped = (transfer: string) => {
      const f = formOf(withMetroBlank({ nblIsMetropolitanArea: "yes" }), transfer);
      // ④ 게이트를 거치지 않은 raw(직접 API 시뮬레이션) — 수도권 값을 raw에 그대로 덮어쓴다
      const raw = { ...buildNonBusinessLandRaw(f.assets[0], transfer)!, nblIsMetropolitanArea: "yes" };
      return buildNblEngineInput(raw as Parameters<typeof buildNblEngineInput>[0])!;
    };
    expect(mapped("2021-12-31").isMetropolitanArea).toBeUndefined();
    expect(mapped("2024-01-01").isMetropolitanArea).toBe(true);
  });

  it("L1-i 엔진 술어 직접: 양도일 생략 = 현행 표(칸 연다) · 2021-12-31 = 닫는다 · 2022-01-01 = 연다 — 용도지역 격자와 독립", () => {
    const ev = [{ kind: "building_removed", buildingKindBefore: "house" }];
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", ev)).toBe(true);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", ev, new Date("2021-12-31"))).toBe(false);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", ev, new Date("2022-01-01"))).toBe(true);
    expect(housePriorNeedsMetropolitan("other_land", "green", ev, new Date("2024-01-01"))).toBe(false);
  });

  it("L1-g 양도일이 아직 입력되지 않으면(빈 문자열) 현행 표로 본다 — 칸을 열어 묻는다(종전 동작)", () => {
    expect(issue8(formOf(withMetroBlank(), ""))?.field).not.toBe("transferDate");
    // 양도일이 비면 ⑧의 앞 단계가 먼저 막는다 — 여기서는 술어가 던지지 않는다는 것만 고정한다
    expect(() => allIssues(formOf(withMetroBlank(), ""))).not.toThrow();
  });
});

describe("L2 — 양도일 의제 사유 + 주택 철거 행: ⑧은 H9·H10을 건너뛴다(⑤ 표시는 render 테스트가 같은 판정으로 고정)", () => {
  it("P-E1 의제(경매) + 정착면적 빈칸 + 수도권 빈칸 → 통과 · 엔진은 이력 미적용 + 의제 고지", async () => {
    const f = formOf(changed([removed("2016-01-01", "")], { nblIsMetropolitanArea: "", nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01" } as Partial<AssetForm>));
    expect(issue8(f)).toBeUndefined();
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(r.nbl?.periodEvaluation?.basis).not.toBe("state_history");
  });
});
