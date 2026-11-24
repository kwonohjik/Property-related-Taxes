/**
 * NBL-STATE-HISTORY-E3-③ A (UI-A-1) — ⑧ ↔ ⑫ parity 격자(주택부수토지 카드) + ⑧ 규칙 · 필드 점프 키.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §7 (H1~H9 · P1~P9 · P16~P19) · `feedback_fe8_vs_12_parity_grid`
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭).
 * 불변식: (a) ⑫ 400인 행은 반드시 ⑧이 막는다(UI 통과 → 400 금지) (b) **⑧ 단독 차단 행(H1·H3b·H9)의 ⑫ 상태는 200**(접힘 — 400이 아니다)이다 — 열을 따로 단언한다.
 *
 * mutation 대응(계획서 §11.3 A): ② ⑧ housing 호출 제거(P1~P9 전부) · ⑦ H4 제거(P4) · ⑤ H5 제거(P3) · ⑭ H9 «정착 > 토지» 비교 제거(P8) · ⑮ H9가 NaN/음수 통과(P7).
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
const removed = (date: string, footprint?: string, extra: Partial<Ev> = {}): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
  ...extra,
});

/** 주택부수토지 500㎡ · 정착 100㎡ · 수도권 밖 일반주거(5배 — 이내) · 취득 2014-01-01 · 양도 2024-01-01 — ⑧을 통과하는 기본 폼(질문에 «바뀐 적 없음»). */
function formOf(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "500", transferArea: "500",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "no", nblHousingFootprint: "100",
      nblOtherStateHistoryMode: "unchanged",
    }, over) as AssetForm,
  ];
  return f;
}

/** ⑧이 이력 칸을 가리키는 첫 이슈. */
const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblOtherState"));

async function status12(f: TransferFormData): Promise<number> {
  const r = await postTransfer(await captureBody(f));
  return r.status;
}

describe("기본 폼 sanity — «바뀐 적 없음»은 ⑧을 통과하고 ⑫ 200", () => {
  it("unchanged", async () => {
    expect(allIssues(formOf())).toEqual([]);
    expect(await status12(formOf())).toBe(200);
  });
});

describe("⑧ ↔ ⑫ parity 격자 (UI §7 P1~P9 · P16~P19)", () => {
  type Row = { id: string; over: Partial<AssetForm>; field8: string | null; status12: 200 | 400 };
  const changed = (events: Ev[]): Partial<AssetForm> => ({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events });
  const rows: Row[] = [
    { id: "P1 changed + 사건 0건", over: changed([]), field8: "nblOtherStateEvents", status12: 400 },
    { id: "P2 changed + 빈 행", over: changed([{ kind: "", date: "", propertyTaxTypeBefore: "" }]), field8: "nblOtherStateEvents.0.kind", status12: 400 },
    { id: "P2b 날짜 빈 칸", over: changed([built("")]), field8: "nblOtherStateEvents.0.date", status12: 400 },
    { id: "P2c 역순", over: changed([built("2016-01-01"), removed("2015-01-01", "100"), built("2023-01-01")]), field8: "nblOtherStateEvents.1.date", status12: 400 },
    { id: "P2d 같은 종류 연속", over: changed([built("2016-01-01"), built("2018-01-01")]), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "P2e 양도일 당일", over: changed([built("2024-01-01")]), field8: "nblOtherStateEvents.0.date", status12: 400 },
    { id: "P3 마지막 건축물 사건 = 철거(D-1)", over: changed([built("2016-01-01"), removed("2018-01-01", "100")]), field8: "nblOtherStateEvents.1.kind", status12: 400 },
    { id: "P4 tax_type_changed(D-2)", over: changed([{ kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "separate" }, built("2023-01-01")]), field8: "nblOtherStateEvents.0.kind", status12: 400 },
    { id: "P5 질문 미선택(\"\") — ⑧만", over: { nblOtherStateHistoryMode: "" }, field8: "nblOtherStateHistoryMode", status12: 200 },
    { id: "P6 철거 행 정착면적 빈칸 — ⑧만(⑫ 200·엔진 접힘)", over: changed([removed("2016-01-01", ""), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P6b 정착면적 미입력(키 없음)", over: changed([removed("2016-01-01"), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P7 정착면적 0", over: changed([removed("2016-01-01", "0"), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P7b 정착면적 -5", over: changed([removed("2016-01-01", "-5"), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P7c 정착면적 abc", over: changed([removed("2016-01-01", "abc"), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P8 정착면적 > 토지 면적(600 > 500)", over: changed([removed("2016-01-01", "600"), built("2023-01-01")]), field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P8b 둘째 철거 행 정착면적 결함 → 그 행 앵커", over: changed([removed("2014-06-01", "100"), built("2015-01-01"), removed("2020-01-01", ""), built("2023-01-01")]), field8: "nblOtherStateEvents.2.houseFootprintBefore", status12: 200 },
    { id: "P9 정착면적 정상(초과 계산 결과 — 50㎡ × 5배 < 500㎡) — 통과 · 엔진이 접음", over: changed([removed("2016-01-01", "50"), built("2023-01-01")]), field8: null, status12: 200 },
    { id: "정상 — 신축 1건(M15)", over: changed([built("2023-06-01")]), field8: null, status12: 200 },
    { id: "정상 — 철거 → 신축(H3c)", over: changed([removed("2016-01-01", "100"), built("2023-01-01")]), field8: null, status12: 200 },
    { id: "정상 — 정착 = 토지(500 = 500, 경계)", over: changed([removed("2016-01-01", "500"), built("2023-01-01")]), field8: null, status12: 200 },
    { id: "H3b 사건일 ≤ 취득일(하한) — ⑧만", over: changed([built("2013-06-01")]), field8: "nblOtherStateEvents.0.date", status12: 200 },
    { id: "P16 stale: unchanged + 철거 행 정착면적 빈칸 → 건너뜀", over: { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }, field8: null, status12: 200 },
    { id: "P16b stale: unknown + tax_type_changed → 건너뜀", over: { nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "" }] }, field8: null, status12: 200 },
    { id: "P17 stale 연접 다필지 ON(기타토지 칸) + changed 정상 — 주택 술어는 이 칸을 읽지 않는다 → 그대로 적용", over: { ...changed([removed("2016-01-01", "100"), built("2023-01-01")]), nblOtherUseParcels: true }, field8: null, status12: 200 },
    { id: "P17b stale 연접 다필지 ON + changed 정착면적 빈칸 → 여전히 ⑧ 차단(질문이 화면에 있다)", over: { ...changed([removed("2016-01-01", ""), built("2023-01-01")]), nblOtherUseParcels: true }, field8: "nblOtherStateEvents.0.houseFootprintBefore", status12: 200 },
    { id: "P18 지목 농지 + stale 주택 키 → 통과·무시", over: { ...changed([removed("2016-01-01", ""), built("2023-01-01")]), nblLandType: "farmland", nblZoneType: "agricultural", nblHousingFootprint: "" }, field8: null, status12: 200 },
    { id: "P19 정밀판정 OFF + stale changed → 건너뜀", over: { ...changed([removed("2016-01-01", ""), built("2023-01-01")]), nblUseDetailedJudgment: false }, field8: null, status12: 200 },
  ];

  it.each(rows.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const f = formOf(row.over);
    const found = issue8(f);
    expect(found?.field ?? null, `⑧ field — ${found?.message ?? ""}`).toBe(row.field8);
    const s = await status12(f);
    expect(s, `⑫ 상태(${s})`).toBe(row.status12);
    // 핵심 불변: ⑫ 400이면 ⑧도 막는다(UI 통과 → 400 금지)
    if (s === 400) expect(found, "⑫가 막는데 ⑧이 통과 = UI 통과 → API 400 모순").toBeDefined();
  });
});

describe("⑧ 순서 = 화면 순서 — 정착면적·배율 안내 뒤 · 유예 앞", () => {
  it("V-10: 정착면적 0 + changed — 정착면적 필수 규칙이 이력 규칙보다 먼저 막는다", () => {
    const first = allIssues(formOf({ nblHousingFootprint: "", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [] }))[0];
    expect(first?.field).toBe("nblHousingFootprint");
  });
  it("질문 미선택 + 수도권 미선택이 함께 있으면 첫 이슈는 수도권(화면 위)이고, 수도권을 답하면 질문이다", () => {
    expect(allIssues(formOf({ nblOtherStateHistoryMode: "", nblIsMetropolitanArea: "" }))[0]?.field).toBe("nblIsMetropolitanArea");
    expect(allIssues(formOf({ nblOtherStateHistoryMode: "" }))[0]?.field).toBe("nblOtherStateHistoryMode");
  });
});

describe("⑧ 문구·필드 점프 키", () => {
  it("H1: 접두 «주택 부수토지 —» + 「모름」 안내 + 질문 앵커", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "" }))!;
    expect(i.field).toBe("nblOtherStateHistoryMode");
    expect(i.message).toContain("주택 부수토지 — ");
    expect(i.message).toContain("모름");
  });

  it("H9: 엔진 leaf 문구 그대로(`houseFootprintBlankMessage`) + 탈출구 «모름» 안내 · 행 앵커 `nblOtherStateEvents.{i}.houseFootprintBefore`", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }))!;
    expect(i.field).toBe("nblOtherStateEvents.0.houseFootprintBefore");
    expect(i.message).toContain(houseFootprintBlankMessage(0));
    expect(i.message).toContain("「모름」");
  });

  it("H9 정착 > 토지: 문구에 두 수치(600 · 500) + 토지 면적을 줄인 정당 입력의 탈출구(Q: 「모름」)", () => {
    const i = issue8(formOf({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2016-01-01", "600"), built("2023-01-01")] }))!;
    expect(i.message).toContain(houseFootprintExceedsLandMessage(0, "600", "500"));
  });

  it("H4·H5 — ⑫와 같은 leaf·같은 문구(주체 «주택 사건»)", async () => {
    const f = formOf({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("2018-01-01", "100")] });
    const i8 = issue8(f)!;
    expect(i8.message).toContain("주택 사건 2번째 행");
    const r = await postTransfer(await captureBody(f));
    expect(r.status).toBe(400);
    const leafMsg = i8.message.split("주택 부수토지 — ")[1];
    expect(JSON.stringify(r.json)).toContain(leafMsg);
  });

  it("기타토지 byte-identical — 기타토지 카드의 ⑧ 접두·문구는 종전 그대로(«기타토지 —»)", () => {
    const f = formOf({ nblLandType: "other_land", nblHousingFootprint: "", nblOtherPropertyTaxType: "comprehensive", nblOtherStateHistoryMode: "" });
    const i = issue8(f)!;
    expect(i.message).toContain("기타토지 — ");
    expect(i.message).not.toContain("주택 부수토지 — ");
  });
});

describe("축 B 둘째 이후 지분 카드 — 질문 요구 없음(첫 카드에만) · 하한일 = 번들 최이른 취득일", () => {
  const share = (n: number, acq: string, over: Partial<AssetForm> = {}) =>
    Object.assign({ ...makeDefaultAsset(n) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: acq, acquisitionArea: "500", transferArea: "500", addressJibun: "서울 강남구 테스트동 1",
      fixedAcquisitionPrice: "150000000", isNonBusinessLand: true, ownershipNumerator: "50", ownershipDenominator: "100",
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "no", nblHousingFootprint: "100",
    }, over) as AssetForm;

  it("둘째 이후 지분 카드의 stale 질문 미선택(\"\")은 요구하지 않는다 — 대조: 비지분 단건이면 H1이 막는다", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    f.assets = [share(1, "2014-01-01", { nblOtherStateHistoryMode: "unchanged" }), share(2, "2014-01-01", { nblOtherStateHistoryMode: "" })];
    expect(allIssues(f)).toEqual([]);
    expect(issue8(formOf({ nblOtherStateHistoryMode: "" }))?.field).toBe("nblOtherStateHistoryMode");
  });

  it("첫 카드(2021-06-01)보다 이른 지분(2014-01-01)이 있으면 그 사이 사건은 통과 · 번들 최이른 취득일 이전은 막힌다(주택 카드도 같은 하한)", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-01-01";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    f.assets = [
      share(1, "2021-06-01", { nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2018-01-01", "100"), built("2022-01-01")] }),
      share(2, "2014-01-01"),
    ];
    expect(allIssues(f), "다른 이슈가 ⑧을 가리지 않는다").toEqual([]);
    f.assets[0].nblOtherStateEvents = [removed("2013-06-01", "100"), built("2022-01-01")];
    expect(issue8(f)?.field).toBe("nblOtherStateEvents.0.date");
  });
});
