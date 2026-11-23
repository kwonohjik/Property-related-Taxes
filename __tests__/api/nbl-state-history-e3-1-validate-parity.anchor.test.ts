/**
 * NBL-STATE-HISTORY-E3-① (E3-1a) — ⑧ ↔ ⑫ parity 격자 (Anchor 5): 건축물 사건 × 재산세 과세 구분 변경 × 순서·같은 날·초기 건축물 상태(`tailHasBuilding`) × 하한 유무.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §3.4 · §7.2 Anchor 5 · `feedback_fe8_vs_12_parity_grid`
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭).
 * 규칙: **⑫가 400이면 반드시 ⑧이 막는다**(UI 통과 → 400 금지) · ⑧만 막는 칸(하한일)은 허용 목록으로 명시한다 · **⑧이 막는 칸은 문구까지 같다**(같은 leaf).
 * 반대 방향(⑧ 통과 + ⑫ 200)도 «정상 행의 field8 = null · status 200»으로 고정한다 — ⑧이 `tailHasBuilding`을 빠뜨리면 정상 tax-only 이력이 영구 차단된다(막다른 길).
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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Ev = NblOtherStateEventInput;
const built = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
const removed = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });
const tax = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: before });

/** 잡종지 1,000㎡ · 취득 2014-01-01 · 양도 2024-01-01 — 꼬리: 건축물 있음(250㎡) 종합합산. `nblOtherHasBuilding`은 행이 덮어쓴다(건축물 사건 0건일 때만 초기 상태). */
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
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250",
      nblOtherStateHistoryMode: "changed",
    }, over) as AssetForm,
  ];
  return f;
}

const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblOtherState"));

/** ⑫ 호출 — ④가 와이어에서 tax 행의 Before를 `""`로 정규화하는 현행 한계(U4가 교체)와 무관하게 판정 규칙(순서·초기 상태)만 본다. */
async function post12(f: TransferFormData) {
  const r = await postTransfer(await captureBody(f));
  return { status: r.status, text: JSON.stringify(r.json) };
}

describe("⑧ ↔ ⑫ parity 격자 — 재산세 과세 구분 변경 사건 (Anchor 5)", () => {
  type Row = { id: string; over: Partial<AssetForm>; field8: string | null; blocked12: boolean; text?: string };
  const changed = (events: Ev[], hasBuilding = true, extra: Partial<AssetForm> = {}): Partial<AssetForm> => ({
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: events,
    nblOtherHasBuilding: hasBuilding,
    nblOtherBuildingFloorArea: hasBuilding ? "250" : "",
    ...extra,
  });
  const NO_BUILDING = "이 날짜 직전에는 건축물이 없습니다";
  const rows: Row[] = [
    // ── 정상(둘 다 통과) ──
    { id: "정상 — tax-only + 건축물 있음 토글(M12)", over: changed([tax("2022-06-01")]), field8: null, blocked12: false },
    { id: "정상 — tax-only 3건 연속(별도 → 분리 → 비과세 …)", over: changed([tax("2016-01-01", "exempt"), tax("2018-01-01", "special_sum"), tax("2021-01-01", "separate")]), field8: null, blocked12: false },
    { id: "정상 — 신축 → 구분 변경(T8)", over: changed([built("2019-01-01"), tax("2022-06-01")]), field8: null, blocked12: false },
    { id: "정상 — 구분 변경 → 철거(T7: 초기 건축물 있음은 첫 건축물 사건이 철거라서) · 토글 false여도 통과", over: changed([tax("2019-01-01"), removed("2021-01-01", "comprehensive")], false), field8: null, blocked12: false },
    { id: "정상 — 신축 → 구분 변경 → 철거 → 신축 → 구분 변경", over: changed([built("2015-01-01"), tax("2016-01-01"), removed("2018-01-01"), built("2020-01-01"), tax("2022-01-01", "comprehensive")], true, { nblOtherPropertyTaxType: "separate" }), field8: null, blocked12: false },
    { id: "정상 — 변경 직전 구분 «모름»(\"\")", over: changed([tax("2022-06-01", "")]), field8: null, blocked12: false },
    { id: "정상 — 변경 전후 같은 구분(Before = 꼬리 종합합산)은 차단하지 않는다(Q-6)", over: changed([tax("2022-06-01", "comprehensive")]), field8: null, blocked12: false },
    // ── V-6 닫힘: 건축물 없는 구간의 구분 변경 ──
    { id: "차단 — tax-only + 건축물 없음 토글", over: changed([tax("2022-06-01")], false), field8: "nblOtherStateEvents.0.kind", blocked12: true, text: NO_BUILDING },
    { id: "차단 — 철거 뒤 구분 변경(나대지 위)", over: changed([removed("2019-01-01"), tax("2021-01-01")], false), field8: "nblOtherStateEvents.1.kind", blocked12: true, text: NO_BUILDING },
    { id: "차단 — 신축 앞 구분 변경(첫 건축물 사건이 신축 → 초기 없음) · 토글 true여도", over: changed([tax("2019-01-01"), built("2021-01-01")]), field8: "nblOtherStateEvents.0.kind", blocked12: true, text: NO_BUILDING },
    { id: "차단 — 철거 → 신축 → 철거 → 구분 변경(마지막 철거 뒤)", over: changed([removed("2015-01-01"), built("2016-01-01"), removed("2018-01-01"), tax("2020-01-01")], false), field8: "nblOtherStateEvents.3.kind", blocked12: true, text: NO_BUILDING },
    // ── 교대 · 같은 날 · 순서 ──
    { id: "차단 — 신축 → 구분 변경 → 신축(같은 종류 연속은 직전 «건축물» 사건과 비교)", over: changed([built("2017-01-01"), tax("2018-01-01"), built("2019-01-01")]), field8: "nblOtherStateEvents.2.kind", blocked12: true, text: "앞 사건이 이미 「건축물 있음」" },
    { id: "차단 — 건축물 + 구분 변경 같은 날(신축 당일 변경)", over: changed([built("2019-01-01"), tax("2019-01-01")]), field8: "nblOtherStateEvents.1.date", blocked12: true, text: "같은 날" },
    { id: "차단 — 구분 변경 + 철거 같은 날", over: changed([tax("2021-01-01"), removed("2021-01-01", "comprehensive")]), field8: "nblOtherStateEvents.1.date", blocked12: true, text: "같은 날" },
    { id: "차단 — 구분 변경끼리 같은 날", over: changed([tax("2019-01-01"), tax("2019-01-01", "comprehensive")]), field8: "nblOtherStateEvents.1.date", blocked12: true, text: "같은 날" },
    { id: "차단 — 역순(구분 변경이 앞 건축물 사건보다 빠름)", over: changed([built("2020-01-01"), tax("2019-01-01")]), field8: "nblOtherStateEvents.1.date", blocked12: true, text: "재산세 과세 구분 변경 사건 2번째 행" },
    { id: "차단 — 구분 변경이 양도일 당일", over: changed([tax("2024-01-01")]), field8: "nblOtherStateEvents.0.date", blocked12: true, text: "재산세 과세 구분 변경 사건 1번째 행" },
    { id: "차단 — 구분 변경 날짜 빈 칸", over: changed([tax("")]), field8: "nblOtherStateEvents.0.date", blocked12: true, text: "재산세 과세 구분 변경 사건 1번째 행 — 날짜를 입력하세요" },
    // ── 하한일(⑧만) ──
    { id: "하한 — 구분 변경이 취득일 이전: ⑧만 막는다(축 B 늦은 지분 400 방지)", over: changed([tax("2013-06-01")]), field8: "nblOtherStateEvents.0.date", blocked12: false },
    { id: "하한 — 구분 변경이 취득일 당일: ⑧만", over: changed([tax("2014-01-01")]), field8: "nblOtherStateEvents.0.date", blocked12: false },
  ];

  it.each(rows.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const f = formOf(row.over);
    const found = issue8(f);
    expect(found?.field ?? null, `⑧ field — ${found?.message ?? ""}`).toBe(row.field8);
    const r = await post12(f);
    expect(r.status === 400, `⑫ 400 여부(status ${r.status})`).toBe(row.blocked12);
    // 핵심 불변: ⑫ 400이면 ⑧도 막는다(UI 통과 → 400 금지)
    if (row.blocked12) expect(found, "⑫가 막는데 ⑧이 통과 = UI 통과 → API 400 모순").toBeDefined();
    if (row.blocked12 && row.text) {
      // 같은 leaf · 같은 문구 — ⑧ 문구 = `{label}: 기타토지 — {leaf 문구}`, ⑫ = leaf 문구 그대로
      expect(found!.message).toContain(row.text);
      expect(r.text).toContain(row.text);
      expect(r.text).toContain(found!.message.split("기타토지 — ")[1]);
    }
    if (!row.blocked12 && row.field8 === null) expect(r.status, r.text.slice(0, 300)).toBe(200);
  });
});

describe("⑧ ↔ ⑫ — 건축물 사건만 있는 이력은 종전과 바이트 동일 (회귀 가드: 접두·문구·차단 위치)", () => {
  const changed = (events: Ev[]): Partial<AssetForm> => ({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events, nblOtherHasBuilding: false, nblOtherBuildingFloorArea: "" });
  it("신축 → 신축: 종전 문구 그대로(`건축물 사건 2번째 행 — 앞 사건이 이미 「건축물 있음」입니다 …`)", async () => {
    const f = formOf(changed([built("2016-01-01"), built("2018-01-01")]));
    const i = issue8(f)!;
    expect(i.field).toBe("nblOtherStateEvents.1.kind");
    expect(i.message).toContain("건축물 사건 2번째 행 — 앞 사건이 이미 「건축물 있음」입니다. 사이에 「건축물 멸실·철거·붕괴」 사건이 빠졌습니까? (신축과 멸실은 번갈아 입력합니다)");
  });
  it("철거 → 철거(건축물 있던 초기 상태): 종전과 같은 위치·문구", () => {
    const i = issue8(formOf(changed([removed("2016-01-01"), removed("2018-01-01")])))!;
    expect(i.field).toBe("nblOtherStateEvents.1.kind");
    expect(i.message).toContain("건축물 사건 2번째 행 — 앞 사건이 이미 「건축물 없음」입니다. 사이에 「건축물 신축」 사건이 빠졌습니까?");
  });
});
