/**
 * NBL-STATE-HISTORY-E3-③ B (UI-B-1) — ⑧ ↔ ⑫ parity 격자(기타토지 카드의 «철거된 건축물 = 주택») + A 후속 Low 3 행 · ⑧ 규칙 · 필드 점프 키.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §7 (H9~H12 · P10~P20) · `feedback_fe8_vs_12_parity_grid`
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭).
 * 불변식: (a) ⑫ 400인 행은 반드시 ⑧이 막는다(UI 통과 → 400 금지) (b) **⑧ 단독 차단 행(H9·H10)의 ⑫ 상태는 200**(접힘·보수 기본값 — 400이 아니다) (c) 술어가 거짓인 행은 ④·⑤·⑧이 같은 결과.
 *
 * mutation 대응(계획서 §11.3 B): ⑱ ⑧ H10 제거(P11) · ⑲ ⑧ H10이 술어와 무관하게 항상 요구(P12·P16) · ㉓ ⑧ H11 둘째 규칙 제거(P14) · ⑯ 술어가 폼 저장 events를 읽음(P16) · Low 3: ⑧ H9 게이트(양도일 현재 배율 초과) 제거(A-P9x).
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
import { houseFootprintBlankMessage, houseFootprintExceedsLandMessage } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
/** B 철거 행 — 기본은 «주택» + 정착면적. `house: false` = «그 밖» + 철거 직전 재산세 구분. */
const removed = (date: string, footprint?: string, extra: Partial<Ev> = {}): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  buildingKindBefore: "house",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
  ...extra,
});
const removedOther = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });

/** 기타토지(잡종지) 1,000㎡ · 일반주거 · 수도권 밖(5배) · 취득 2014-01-01 → 양도 2024-01-01 · 꼬리 나대지(종합합산) — ⑧을 통과하는 기본 폼(질문 «바뀐 적 없음»). */
function formOf(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-01-01";
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

/** ⑧이 이력·수도권 칸을 가리키는 첫 이슈. */
const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblOtherState") || i.field === "nblIsMetropolitanArea");
const changed = (events: Ev[], over: Partial<AssetForm> = {}): Partial<AssetForm> => ({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events, ...over });

async function status12(f: TransferFormData): Promise<number> {
  const r = await postTransfer(await captureBody(f));
  return r.status;
}

describe("기본 폼 sanity — «바뀐 적 없음»·주택 철거 정상 입력은 ⑧을 통과하고 ⑫ 200", () => {
  it.each([["unchanged", {}], ["B1 주택 철거 + 정착 200", changed([removed("2021-01-01", "200")])]] as const)("%s", async (_n, over) => {
    expect(allIssues(formOf(over))).toEqual([]);
    expect(await status12(formOf(over))).toBe(200);
  });
});

describe("⑧ ↔ ⑫ parity 격자 — B (UI §7 P10~P20)", () => {
  type Row = { id: string; over: Partial<AssetForm>; field8: string | null; status12: 200 | 400 };
  const rows: Row[] = [
    { id: "P10 주택 + 정착면적 빈칸 — ⑧만(⑫ 200·엔진 접힘)", over: changed([removed("2021-01-01", "")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P10b 정착면적 미입력(키 없음)", over: changed([removed("2021-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P10c 정착면적 0", over: changed([removed("2021-01-01", "0")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P10d 정착면적 abc", over: changed([removed("2021-01-01", "abc")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P10e 정착면적 > 토지 면적(1,200 > 1,000)", over: changed([removed("2021-01-01", "1200")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P10f 둘째 주택 철거 행 정착면적 결함 → 그 행 앵커", over: changed([removed("2016-01-01", "200"), built("2018-01-01"), removed("2021-01-01", "")]), field8: "nblOtherStateEvents.2.houseFootprintBefore", status12: 200 },
    { id: "P11 주택 + 주·상·공 + 수도권 미선택(\"\") — ⑧만(⑫ 200·보수 3배)", over: changed([removed("2021-01-01", "200")], { nblIsMetropolitanArea: "" }), field8: "nblIsMetropolitanArea", status12: 200 },
    { id: "P11b 수도권 «미확인»", over: changed([removed("2021-01-01", "200")], { nblIsMetropolitanArea: "unknown" }), field8: "nblIsMetropolitanArea", status12: 200 },
    { id: "P12 주택 + 녹지 + 수도권 빈칸 → 통과(술어 거짓 — 요구 없음)", over: changed([removed("2021-01-01", "200")], { nblZoneType: "green", nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P12b 주택 + 도시지역 밖(관리지역) + 수도권 빈칸 → 통과", over: changed([removed("2021-01-01", "200")], { nblZoneType: "management", nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P12c «그 밖» 철거 행 + 주·상·공 + 수도권 빈칸 → 통과(기타토지 기존 입력 변화 0)", over: changed([removedOther("2021-01-01")], { nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    // P13 — UI 경로에서는 «신축·구분 변경 행의 종류 칸»이 만들어지지 않는다(칸이 철거 행에만 있고 종류 전환 시 행이 재생성된다 · ③은 철거 행만 보존). stale이 있어도 ④가 보내지 않으므로(와이어 사건) ⑧도 읽지 않고 ⑫ 200 —
    // 직접 API의 400(D-8 ①)은 엔진 route anchor(`nbl-state-history-e3-3b-route.anchor.test.ts` B10)가 고정한다.
    { id: "P13 stale: `house`가 신축 행 — ④ 미전송 → ⑧ 통과 · ⑫ 200(고칠 칸이 없는 차단 금지)", over: changed([built("2016-01-01", { buildingKindBefore: "house" }), removed("2021-01-01", "200")]), field8: null, status12: 200 },
    { id: "P13b stale: `house`가 구분 변경 행 — 그 구분 변경이 주택 구간 안이라 철거 행 기준 구조 오류(D-8 ②)는 잡힌다", over: changed([{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate", buildingKindBefore: "house" }, removed("2021-01-01", "200")]), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "P14 주택 구간 안 `tax_type_changed` → 구조 오류", over: changed([{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, removed("2021-01-01", "200")]), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "P14b 주택 구간 밖(철거 뒤 나대지) 구분 변경 → 통과", over: changed([removed("2021-01-01", "200"), { kind: "tax_type_changed", date: "2022-01-01", propertyTaxTypeBefore: "comprehensive" }]), field8: null, status12: 200 },
    { id: "P15 종류 «그 밖» + 별도합산 위장(기존 경로) → 통과 · 바이트 동일", over: changed([removedOther("2021-01-01")]), field8: null, status12: 200 },
    { id: "P16 stale: unchanged + 주택 철거 행(정착면적 빈칸) + 수도권 빈칸 → 건너뜀(wire events `[]`)", over: { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [removed("2021-01-01", "")], nblIsMetropolitanArea: "" }, field8: null, status12: 200 },
    { id: "P16b stale: unknown + 주택 철거 행 + 수도권 빈칸 → 건너뜀", over: { nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [removed("2021-01-01", "")], nblIsMetropolitanArea: "" }, field8: null, status12: 200 },
    { id: "P17 stale 연접 다필지 ON(기타토지 칸) + changed 주택 철거 행 정착면적 빈칸 → 질문·행이 화면에 없다 → 건너뜀", over: changed([removed("2021-01-01", "")], { nblOtherUseParcels: true, nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P18 지목 농지 + stale 주택 행 → 통과·무시", over: changed([removed("2021-01-01", "")], { nblLandType: "farmland", nblZoneType: "agricultural", nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P19 정밀판정 OFF + stale changed → 건너뜀", over: changed([removed("2021-01-01", "")], { nblUseDetailedJudgment: false, nblIsMetropolitanArea: "" }), field8: null, status12: 200 },
    { id: "P20 양도일 의제 사유 + 주택 철거 행 + 정착면적 빈칸 + 수도권 빈칸 → 통과(UQ-12 (가))", over: changed([removed("2021-01-01", "")], { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01", nblIsMetropolitanArea: "" } as Partial<AssetForm>), field8: null, status12: 200 },
    { id: "P20b 의제 사유 + 구조 오류(주택 구간 안 구분 변경)는 여전히 차단(건너뛰는 것은 B 새 규칙 H9·H10뿐)", over: changed([{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, removed("2021-01-01", "")], { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01" } as Partial<AssetForm>), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "H3b 사건일 ≤ 취득일 — ⑧만", over: changed([removed("2013-06-01", "200")]), field8: "nblOtherStateEvents.0.date", status12: 200 },
  ];

  it.each(rows.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const f = formOf(row.over);
    const found = issue8(f);
    expect(found?.field ?? null, `⑧ field — ${found?.message ?? ""}`).toBe(row.field8);
    const s = await status12(f);
    expect(s, `⑫ 상태(${s})`).toBe(row.status12);
    if (s === 400) expect(found, "⑫가 막는데 ⑧이 통과 = UI 통과 → API 400 모순").toBeDefined();
  });
});

describe("A 후속 Low 3 — 양도일 현재 배율 초과면 엔진이 이력을 읽지 않으므로 ⑧ H9는 철거 행 정착면적을 요구하지 않는다(단일 술어 `housingStateHistoryIsRead`)", () => {
  /** 주택부수토지 500㎡ · 수도권 밖 일반주거(5배) · 취득 2014-01-01 → 양도 2024-01-01. 양도일 현재 정착면적이 배율 이내/초과를 가른다. */
  const house = (over: Partial<AssetForm> = {}) =>
    formOf({
      acquisitionArea: "500", transferArea: "500", nblLandType: "housing_site", nblHousingFootprint: "100", nblOtherPropertyTaxType: "",
      nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "" }, built("2023-01-01")],
      ...over,
    });

  it("이내(정착 100 → 허용 500 ≥ 500) + 철거 행 정착면적 빈칸 → ⑧ H9 차단(엔진이 이력을 읽는다 — 정착면적 필요)", () => {
    expect(issue8(house())?.field).toBe("nblOtherStateEvents.0.houseFootprintBefore");
  });

  it("초과(정착 40 → 허용 200 < 500) + 철거 행 정착면적 빈칸 → ⑧ 통과 · ⑫ 200 · 엔진은 이력을 읽지 않는다(`not_judged` + 주택 변형 PARTIAL 고지)", async () => {
    const f = house({ nblHousingFootprint: "40" });
    expect(issue8(f)).toBeUndefined();
    const r = await postTransfer(await captureBody(f));
    expect(r.status).toBe(200);
    expect(r.result?.nonBusinessLandJudgmentDetail?.periodEvaluation?.basis).toBe("not_judged");
  });

  it("초과 + 사건 구조 오류(마지막 사건 철거)는 여전히 ⑧ 차단 — ⑫ 400과 같은 규칙은 게이트가 건드리지 않는다", async () => {
    const f = house({ nblHousingFootprint: "40", nblOtherStateEvents: [built("2016-01-01"), { kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "" }] });
    expect(issue8(f)?.field).toBe("nblOtherStateEvents.1.kind");
    expect(await status12(f)).toBe(400);
  });

  it("초과 + 정착면적 입력이 있어도 ⑧ 통과(요구하지 않을 뿐 막지도 않는다)", () => {
    expect(issue8(house({ nblHousingFootprint: "40", nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "600" }, built("2023-01-01")] }))).toBeUndefined();
  });
});

describe("⑧ 문구·필드 점프 키 — B", () => {
  it("H9: 엔진 leaf 문구(사건 주체 «건축물» — 행 제목과 같은 말) + 탈출구 «모름» 안내 + 행 앵커", () => {
    const i = issue8(formOf(changed([removed("2021-01-01", "")])))!;
    expect(i.field).toBe("nblOtherStateEvents.0.houseFootprintBefore");
    expect(i.message).toContain(`기타토지 — ${houseFootprintBlankMessage(0, "building")}`);
    expect(i.message).toContain("건축물 사건 1번째 행");
    expect(i.message).toContain("「모름」");
  });

  it("H9 정착 > 토지: 두 수치(1200 · 1000)", () => {
    const i = issue8(formOf(changed([removed("2021-01-01", "1200")])))!;
    expect(i.message).toContain(houseFootprintExceedsLandMessage(0, "1200", "1000", "building"));
  });

  it("H10: 문구 + 점프 앵커 `nblIsMetropolitanArea`", () => {
    const i = issue8(formOf(changed([removed("2021-01-01", "200")], { nblIsMetropolitanArea: "" })))!;
    expect(i.field).toBe("nblIsMetropolitanArea");
    expect(i.message).toContain("기타토지 — ");
    expect(i.message).toContain("수도권 여부를 선택하세요");
  });

  it("H11 구조 문구는 ⑫와 같은 leaf — 주택 구간 안 구분 변경: ⑧ 문구가 ⑫ 400 본문에 그대로 들어 있다", async () => {
    const f = formOf(changed([{ kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, removed("2021-01-01", "200")]));
    const i8 = issue8(f)!;
    const r = await postTransfer(await captureBody(f));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(i8.message.split("기타토지 — ")[1]);
  });

  it("기타토지 byte-identical — 종류 «그 밖»·철거 행 없음의 ⑧ 접두·문구는 종전 그대로(주택 문구 없음)", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "" }))!;
    expect(i.message).toContain("기타토지 — 소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요");
  });
});

describe("Low 4 — 주택 카드 H1 문구는 «주택» 변형(엔진 `stateHistoryModeRequiredMessage`) · 기타토지는 종전 문구 그대로", () => {
  it("주택 부수토지: «이 토지 위 주택이 새로 지어지거나 없어진 적이 있는지 선택하세요» (건축물 문구 아님)", () => {
    const f = formOf({ acquisitionArea: "500", transferArea: "500", nblLandType: "housing_site", nblHousingFootprint: "100", nblOtherPropertyTaxType: "", nblOtherStateHistoryMode: "" });
    const i = issue8(f)!;
    expect(i.field).toBe("nblOtherStateHistoryMode");
    expect(i.message).toContain("주택 부수토지 — 소유기간 중 이 토지 위 주택이 새로 지어지거나 없어진 적이 있는지 선택하세요");
    expect(i.message).not.toContain("건축물");
  });
});
