/**
 * NBL-STATE-HISTORY-U1 — ⑧ ↔ ⑫ parity 격자 + ⑧ 규칙 anchor + 필드 점프 키.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §8.1 · §8.4 (`feedback_fe8_vs_12_parity_grid`)
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭).
 * 규칙: **⑫가 400이면 반드시 ⑧이 막는다**(UI 통과 → 400 금지). ⑧만 막는 칸(#1 질문 미선택 · #6 하한일)은 허용 목록으로 명시한다.
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
import { stateHistoryFloorDate } from "@/lib/calc/transfer-tax-validate-nbl-state-history";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Ev = NblOtherStateEventInput;
const built = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
const removed = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });

/** 잡종지 1,000㎡ · 취득 2014-01-01 · 양도 2024-01-01 · 취득가 3억 · 양도가 10억 — ⑧을 통과하는 기본 폼(마지막 구간 = 건축물 없음). */
function formOf(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false,
      nblOtherStateHistoryMode: "unchanged",
    }, over) as AssetForm,
  ];
  return f;
}

/** ⑧이 이력 칸을 가리키는 첫 이슈 (이력 이외 이슈는 기본 폼이 통과하므로 나오지 않는다). */
const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblOtherState"));

async function status12(f: TransferFormData): Promise<number> {
  const r = await postTransfer(await captureBody(f));
  return r.status;
}

describe("기본 폼 sanity — 질문에 «바뀐 적 없음»을 답하면 ⑧을 통과하고 ⑫ 200", () => {
  it("unchanged", async () => {
    expect(allIssues(formOf())).toEqual([]);
    expect(await status12(formOf())).toBe(200);
  });
});

describe("⑧ ↔ ⑫ parity 격자 (UI §8.4)", () => {
  type Row = { id: string; over: Partial<AssetForm>; transfer?: string; field8: string | null; blocked12: boolean };
  const changed = (events: Ev[]): Partial<AssetForm> => ({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events });
  const rows: Row[] = [
    { id: "#1 질문 미선택(\"\")", over: { nblOtherStateHistoryMode: "" }, field8: "nblOtherStateHistoryMode", blocked12: false /* ⑧만 — Q-5 */ },
    { id: "#2 changed + 0행", over: changed([]), field8: "nblOtherStateEvents", blocked12: true },
    { id: "#3 첫 행 종류 미선택", over: changed([{ kind: "", date: "2021-01-01", propertyTaxTypeBefore: "" }]), field8: "nblOtherStateEvents.0.kind", blocked12: true },
    { id: "#4 날짜 빈 칸", over: changed([removed("")]), field8: "nblOtherStateEvents.0.date", blocked12: true },
    { id: "#4 날짜 해석 불가", over: changed([removed("2021-13-45")]), field8: "nblOtherStateEvents.0.date", blocked12: true },
    { id: "#5 역순", over: changed([built("2016-01-01"), removed("2015-01-01")]), field8: "nblOtherStateEvents.1.date", blocked12: true },
    { id: "#5 같은 날", over: changed([built("2016-01-01"), removed("2016-01-01")]), field8: "nblOtherStateEvents.1.date", blocked12: true },
    { id: "#6 하한일 이전(취득일 앞)", over: changed([removed("2013-06-01")]), field8: "nblOtherStateEvents.0.date", blocked12: false /* ⑧만 — 축 B 늦은 지분 400 방지 */ },
    { id: "#6 하한일 당일(취득일)", over: changed([removed("2014-01-01")]), field8: "nblOtherStateEvents.0.date", blocked12: false },
    { id: "#7 양도일 당일", over: changed([removed("2024-01-01")]), field8: "nblOtherStateEvents.0.date", blocked12: true },
    { id: "#7 양도일 이후", over: changed([removed("2024-06-01")]), field8: "nblOtherStateEvents.0.date", blocked12: true },
    { id: "#8 같은 종류 연속(신축→신축)", over: changed([built("2016-01-01"), built("2018-01-01")]), field8: "nblOtherStateEvents.1.kind", blocked12: true },
    { id: "#11 철거 직전 구분 «모름»(\"\")", over: changed([removed("2021-01-01", "")]), field8: null, blocked12: false },
    { id: "정상 — 철거 1건", over: changed([removed("2021-01-01")]), field8: null, blocked12: false },
    { id: "정상 — 신축→철거→신축(마지막 신축: 바닥면적 필요)", over: { ...changed([built("2016-01-01"), removed("2018-01-01"), built("2021-01-01")]), nblOtherBuildingFloorArea: "100" }, field8: null, blocked12: false },
    { id: "stale 불량 행 + unchanged → 건너뜀", over: { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [{ kind: "", date: "", propertyTaxTypeBefore: "" }] }, field8: null, blocked12: false },
    { id: "stale 불량 행 + unknown → 건너뜀", over: { nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [{ kind: "", date: "", propertyTaxTypeBefore: "" }] }, field8: null, blocked12: false },
    { id: "연접 다필지 ON + stale 불량 changed → ⑧ 건너뜀 · ④가 비워 ⑫ 통과", over: { ...changed([{ kind: "", date: "", propertyTaxTypeBefore: "" }]), nblOtherUseParcels: true, nblOtherParcels: [{ id: "p1", landArea: "1000", acquisitionDate: "2014-01-01", hasBuilding: false, buildingFootprintArea: "" }] }, field8: null, blocked12: false },
  ];

  it.each(rows.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const f = formOf(row.over);
    const found = issue8(f);
    expect(found?.field ?? null, `⑧ field — ${found?.message ?? ""}`).toBe(row.field8);
    const s = await status12(f);
    expect(s === 400, `⑫ 400 여부(status ${s})`).toBe(row.blocked12);
    // 핵심 불변: ⑫ 400이면 ⑧도 막는다(UI 통과 → 400 금지)
    if (row.blocked12) expect(found, "⑫가 막는데 ⑧이 통과 = UI 통과 → API 400 모순").toBeDefined();
  });
});

describe("⑧ 순서 = 화면 순서 — 질문(맨 위)이 재산세 과세 분류보다 먼저", () => {
  it("질문 미선택 + 재산세 과세 분류 미선택이 함께 있으면 첫 이슈는 질문이다", () => {
    const first = allIssues(formOf({ nblOtherStateHistoryMode: "", nblOtherPropertyTaxType: "" }))[0];
    expect(first?.field).toBe("nblOtherStateHistoryMode");
  });
  it("질문에 답하면 다음 이슈는 재산세 과세 분류다(질문이 다른 검증을 가리지 않는다)", () => {
    const first = allIssues(formOf({ nblOtherStateHistoryMode: "unchanged", nblOtherPropertyTaxType: "" }))[0];
    expect(first?.field).toBe("nblOtherPropertyTaxType");
  });
});

describe("⑧ 문구·필드 점프 키", () => {
  it("#1 메시지 = 「모름」 안내 + 질문 앵커", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "" }))!;
    expect(i.field).toBe("nblOtherStateHistoryMode");
    expect(i.message).toContain("모름");
  });
  it("#4 행 점프 키는 `nblOtherStateEvents.{i}.date` (인덱스는 행 위치)", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("")] }))!;
    expect(i.field).toBe("nblOtherStateEvents.1.date");
    expect(i.message).toContain("2번째 행");
  });
  it("⑫와 같은 문구 — 같은 leaf(`stateEventSequenceIssue`)", async () => {
    const f = formOf({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2024-06-01")] });
    const i8 = issue8(f)!;
    const r = await postTransfer(await captureBody(f));
    const msg12 = JSON.stringify(r.json);
    // ⑧ 문구 = `{label}: 기타토지 — {leaf 문구}` · ⑫ = leaf 문구 그대로
    const leafMsg = i8.message.split("기타토지 — ")[1];
    expect(msg12).toContain(leafMsg);
  });
});

describe("⑧ #6 하한일 — 축 B 번들은 전 지분 중 가장 이른 취득일", () => {
  const share = (n: number, acq: string, over: Partial<AssetForm> = {}) =>
    Object.assign({ ...makeDefaultAsset(n) }, { assetKind: "land", acquisitionCause: "purchase", acquisitionDate: acq, acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "150000000", isNonBusinessLand: true, ownershipNumerator: "50", ownershipDenominator: "100" }, over) as AssetForm;

  it("stateHistoryFloorDate — 번들이면 최이른 취득일(첫 카드가 가장 이르다는 보장 없음) · 아니면 자기 취득일", () => {
    const bundle = { assets: [share(1, "2021-06-01"), share(2, "2014-01-01")], assetSplitMode: "fractional" as const };
    expect(stateHistoryFloorDate(bundle, bundle.assets[0])).toBe("2014-01-01");
    const single = { assets: [share(1, "2021-06-01")], assetSplitMode: undefined };
    expect(stateHistoryFloorDate(single, single.assets[0])).toBe("2021-06-01");
    const companion = { assets: [share(1, "2021-06-01", { ownershipNumerator: "100" }), share(2, "2014-01-01", { ownershipNumerator: "100" })], assetSplitMode: "companion" as const };
    expect(stateHistoryFloorDate(companion, companion.assets[0])).toBe("2021-06-01");
  });

  it("첫 카드(2021-06-01)보다 이른 지분(2014-01-01)이 있으면 그 사이 사건은 ⑧을 통과한다 — 첫 카드 취득일 기준이면 막혔을 입력", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    f.assets = [
      share(1, "2021-06-01", { nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblOtherPropertyTaxType: "comprehensive", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2018-01-01")] }),
      share(2, "2014-01-01"),
    ];
    expect(allIssues(f), "다른 이슈가 ⑧을 가리지 않는다").toEqual([]);
    // 번들 최이른 취득일 이전(2013-06-01)은 막힌다
    f.assets[0].nblOtherStateEvents = [removed("2013-06-01")];
    expect(issue8(f)?.field).toBe("nblOtherStateEvents.0.date");
  });

  it("축 B 둘째 이후 지분 카드는 질문이 없으므로 ⑧이 요구하지 않는다(첫 카드에만) — 지분 카드에 stale 정밀판정이 남아 있어도 차단 없음", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    const land = { nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblOtherPropertyTaxType: "comprehensive" } as Partial<AssetForm>;
    f.assets = [
      share(1, "2014-01-01", { ...land, nblOtherStateHistoryMode: "unchanged" }),
      share(2, "2014-01-01", { ...land, nblOtherStateHistoryMode: "" }), // 지분 카드의 stale 값 — 화면에 질문이 없다
    ];
    expect(allIssues(f)).toEqual([]);
    // 대조: 같은 카드가 첫 카드(비지분 단건)라면 ⑧ #1이 막는다
    const single = formOf({ nblOtherStateHistoryMode: "" });
    expect(issue8(single)?.field).toBe("nblOtherStateHistoryMode");
  });
});
