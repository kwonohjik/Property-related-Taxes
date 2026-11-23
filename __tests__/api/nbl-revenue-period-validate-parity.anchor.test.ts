/**
 * NBL-STATE-HISTORY-E3-② UI — ⑧ ↔ ⑫ parity 격자 + ⑧ 규칙 anchor + 필드 점프 키 (`feedback_fe8_vs_12_parity_grid`).
 * 선례: `nbl-state-history-u1-validate-parity.anchor.test.ts`.
 *
 * 경로: 폼 → ⑧ `collectStepIssues`(전 단계) → ④ `callTransferTaxAPI` 본문 → 실제 route POST(⑫⑭).
 * 규칙: **⑫가 400이면 반드시 ⑧이 막는다**(UI 통과 → 400 금지). ⑧만 막는 칸(하한일 · 읽는 해의 필수 입력)은 허용 목록으로 명시한다.
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const LV = "100000000";

/** 잡종지 1,000㎡ · 취득 2014-01-01 · 양도 2024-06-30 · 주차장운영업 · 영위 기간 ON(개시 2022-12-01 계속) — ⑧을 통과하는 기본 폼(M9′). */
function formOf(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-30";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
      nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "unchanged",
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: LV, nblRevenuePriorRevenue: "5000000", nblRevenuePriorLandValue: LV,
      nblRevenuePeriodOn: true, nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenueBusinessEndDate: "",
      nblRevenueYearRows: [{ year: "2022", revenue: "600000", landValue: LV }],
    }, over) as AssetForm,
  ];
  return f;
}

/** ⑧이 수입금액 칸을 가리키는 첫 이슈. */
const issue8 = (f: TransferFormData) => allIssues(f).find((i) => (i.field ?? "").startsWith("nblRevenue"));

async function status12(f: TransferFormData): Promise<number> {
  return (await postTransfer(await captureBody(f))).status;
}

describe("기본 폼 sanity — 영위 기간 ON 기본 폼은 ⑧을 통과하고 ⑫ 200", () => {
  it("M9′", async () => {
    expect(allIssues(formOf())).toEqual([]);
    expect(await status12(formOf())).toBe(200);
  });
});

describe("⑧ ↔ ⑫ parity 격자", () => {
  type Row = { id: string; over: Partial<AssetForm>; field8: string | null; blocked12: boolean };
  const rows: Row[] = [
    // ── 공용 leaf: ⑫도 400 ──
    { id: "폐업일 = 양도일", over: { nblRevenueBusinessEndDate: "2024-06-30" }, field8: "nblRevenueBusinessEndDate", blocked12: true },
    { id: "폐업일 > 양도일", over: { nblRevenueBusinessEndDate: "2024-07-01" }, field8: "nblRevenueBusinessEndDate", blocked12: true },
    { id: "폐업일 = 개시일(같은 날 불가)", over: { nblRevenueBusinessEndDate: "2022-12-01" }, field8: "nblRevenueBusinessEndDate", blocked12: true },
    { id: "폐업일 < 개시일", over: { nblRevenueBusinessEndDate: "2022-06-01" }, field8: "nblRevenueBusinessEndDate", blocked12: true },
    { id: "폐업일 읽기 불가", over: { nblRevenueBusinessEndDate: "2022-13-45" }, field8: "nblRevenueBusinessEndDate", blocked12: true },
    { id: "행 수입금액 형식 불량", over: { nblRevenueYearRows: [{ year: "2022", revenue: "abc", landValue: LV }] }, field8: "nblRevenueYearRows.2022.revenue", blocked12: true },
    { id: "행 토지가액 형식 불량", over: { nblRevenueYearRows: [{ year: "2022", revenue: "1", landValue: "x1" }] }, field8: "nblRevenueYearRows.2022.landValue", blocked12: true },
    { id: "개시일 > 양도일(기존 규칙 — ON에서도 유지)", over: { nblRevenueCurrentBusinessStartDate: "2025-01-01" }, field8: "nblRevenueCurrentBusinessStartDate", blocked12: true },
    { id: "직전 수입만 있고 직전 토지가액 없음(DM06 — 기존 규칙 유지)", over: { nblRevenuePriorLandValue: "" }, field8: "nblRevenuePriorLandValue", blocked12: true },
    // ── ⑧만 막는다(의도된 비대칭) ──
    { id: "하한: 개시일 < 취득일", over: { nblRevenueCurrentBusinessStartDate: "2013-06-01" }, field8: "nblRevenueCurrentBusinessStartDate", blocked12: false /* ⑧만 — 축 B 늦은 지분 400 방지 */ },
    { id: "하한: 폐업일 = 취득일(영위일 없음)", over: { nblRevenueCurrentBusinessStartDate: "", nblRevenueBusinessEndDate: "2014-01-01" }, field8: "nblRevenueBusinessEndDate", blocked12: false },
    { id: "하한: 폐업일 < 취득일", over: { nblRevenueCurrentBusinessStartDate: "", nblRevenueBusinessEndDate: "2013-06-01" }, field8: "nblRevenueBusinessEndDate", blocked12: false },
    { id: "양도연도에 영위(폐업 T 안) + 당해 수입 빔 — 읽는 칸이라 필수", over: { nblRevenueCurrentBusinessStartDate: "", nblRevenueBusinessEndDate: "2024-03-01", nblRevenueCurrentRevenue: "", nblRevenueYearRows: [] }, field8: "nblRevenueCurrentRevenue", blocked12: false },
    // ── 정상(막지 않는다) ──
    { id: "개시일 = 취득일", over: { nblRevenueCurrentBusinessStartDate: "2014-01-01", nblRevenueYearRows: [] }, field8: null, blocked12: false },
    { id: "행 누락(모름 — 차단 없음)", over: { nblRevenueYearRows: [] }, field8: null, blocked12: false },
    { id: "행 빈 금액(모름 — 차단 없음)", over: { nblRevenueYearRows: [{ year: "2022", revenue: "", landValue: "" }] }, field8: null, blocked12: false },
    { id: "행 수입금액 0(허용)", over: { nblRevenueYearRows: [{ year: "2022", revenue: "0", landValue: LV }] }, field8: null, blocked12: false },
    { id: "폐업 T−2 이전 + 당해·직전 칸 전부 빔 — 읽지 않는 해의 필수 입력을 요구하지 않는다", over: { nblRevenueCurrentBusinessStartDate: "", nblRevenueBusinessEndDate: "2021-06-01", nblRevenueCurrentRevenue: "", nblRevenueCurrentLandValue: "", nblRevenuePriorRevenue: "", nblRevenuePriorLandValue: "", nblRevenueYearRows: [] }, field8: null, blocked12: false },
    { id: "폐업 T−1 안 + 당해 칸 빔 — 양도연도는 영위일 없음", over: { nblRevenueCurrentBusinessStartDate: "", nblRevenueBusinessEndDate: "2023-06-01", nblRevenueCurrentRevenue: "", nblRevenueCurrentLandValue: "", nblRevenueYearRows: [] }, field8: null, blocked12: false },
    // ── stale·술어 거짓: 보내지 않는다(④) ──
    { id: "범위 밖 stale 행(2030·불량)은 ⑧ 건너뜀 · ④가 보내지 않아 ⑫ 통과", over: { nblRevenueYearRows: [{ year: "2022", revenue: "600000", landValue: LV }, { year: "2030", revenue: "abc", landValue: "" }] }, field8: null, blocked12: false },
    { id: "T−1 stale 행(불량) — 기존 직전 칸이 말하는 해라 보내지 않는다", over: { nblRevenueYearRows: [{ year: "2022", revenue: "600000", landValue: LV }, { year: "2023", revenue: "abc", landValue: "" }] }, field8: null, blocked12: false },
    { id: "개시일을 늦춰 표에서 빠진 연도의 불량 stale 행", over: { nblRevenueCurrentBusinessStartDate: "2023-03-01", nblRevenueYearRows: [{ year: "2022", revenue: "abc", landValue: "x" }] }, field8: null, blocked12: false },
    { id: "OFF + stale 폐업일(양도일 이후) · 불량 행 → ⑧ 건너뜀 · ④가 비워 ⑫ 통과", over: { nblRevenuePeriodOn: false, nblRevenueBusinessEndDate: "2024-07-01", nblRevenueYearRows: [{ year: "2022", revenue: "abc", landValue: "" }] }, field8: null, blocked12: false },
    { id: "업종 «해당 없음» + 켜진 토글 + stale 폐업일 → 건너뜀", over: { nblRevenueBusinessType: "", nblRevenueBusinessEndDate: "2024-07-01" }, field8: null, blocked12: false },
    { id: "지목을 농지로 바꾼 뒤 남은 stale 폐업일 → ⑧ 건너뜀 · ④가 비워 ⑫ 통과", over: { nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true, nblRevenueBusinessEndDate: "2024-07-01" }, field8: null, blocked12: false },
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

describe("⑧ 문구·순서·필드 점프 키", () => {
  it("폐업일 문구 = ⑫와 같은 leaf 문구(⑧은 «자산: 기타토지 영위 기간 — » 접두만 더한다)", async () => {
    const f = formOf({ nblRevenueBusinessEndDate: "2024-07-01" });
    const i8 = issue8(f)!;
    expect(i8.message.startsWith("자산: 기타토지 영위 기간 — ")).toBe(true);
    const r = await postTransfer(await captureBody(f));
    const leaf = i8.message.split("기타토지 영위 기간 — ")[1];
    expect(JSON.stringify(r.json)).toContain(leaf);
  });

  it("행 점프 키는 연도 키(`nblRevenueYearRows.{year}.revenue`) — 행 위치가 아니다", () => {
    const i = issue8(formOf({ nblRevenueYearRows: [{ year: "2022", revenue: "abc", landValue: LV }] }))!;
    expect(i.field).toBe("nblRevenueYearRows.2022.revenue");
    expect(i.message).toContain("1번째 행");
  });

  it("순서 = 화면 순서: 영위 기간(폐업일)이 기존 당해 수입금액 칸보다 먼저", () => {
    const first = allIssues(formOf({ nblRevenueBusinessEndDate: "2024-07-01", nblRevenueCurrentRevenue: "" })).find((i) => (i.field ?? "").startsWith("nblRevenue"));
    expect(first?.field).toBe("nblRevenueBusinessEndDate");
  });

  it("OFF에서는 현행과 같다 — 같은 입력에서 당해 수입금액이 비면 그 칸을 가리킨다(폐업 후 양도는 OFF에 입력 경로가 없다)", () => {
    const i = issue8(formOf({ nblRevenuePeriodOn: false, nblRevenueCurrentRevenue: "" }))!;
    expect(i.field).toBe("nblRevenueCurrentRevenue");
    expect(i.message).toBe("자산: 수입금액비율 업종 선택 시 당해 과세기간 수입금액을 입력하세요.");
  });
});
