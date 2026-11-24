/**
 * NBL-STATE-HISTORY-E3-④ (E3e-1·2) — route 관통 anchor: 와이어 칸(`nblOtherHouseholdHousePeriods` · 13호 × 이력 사건) → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §5(⑫ 새 칸 — 침묵 strip은 TS 미감지, route 관통이 유일한 안전망) · §6 · §7.2 P-7
 * 표: `_helpers/nbl-state-history-e3-4-table.ts` — 엔진 단위(`nbl-state-history-e3-4.anchor.test.ts`)와 같은 표.
 *
 * mutation 대응: P-7(⑫ Zod에서 `nblOtherHouseholdHousePeriods` 삭제 = strip) = W1·W2·W5 «⑫ 칸 도달» 가드 · ⑫′ refine 삭제 = 400 행 · ⑭ 변환 삭제 = W 행 전부.
 *
 * ⚠️ 입력 경로: **직접 API raw**다. ④(`buildNonBusinessLandRaw` — 화면 전송)는 UI PR이 새 칸을 싣도록 배선한다 — 지금은 폼으로 body를 만든 뒤 `nonBusinessLandRaw`를 표의 raw로 덮어쓴다(E3-③ route anchor와 같은 방식).
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
import { E3E_ALL_ROWS, e3eRowRaw, e3eTax, type E3eRow } from "../tax-engine/_helpers/nbl-state-history-e3-4-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX, nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import {
  NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE,
  NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (id: string) => E3E_ALL_ROWS.find((r) => r.id === id)!;

/** 기타토지 취득가 3억 · 양도가 10억 단건 — 면적·날짜는 행에서. */
function formOf(r: E3eRow): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: r.acq ?? "2014-01-01", acquisitionArea: r.area ?? "600", transferArea: r.area ?? "600",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true, nblUseDetailedJudgment: true,
    }) as AssetForm,
  ];
  return f;
}

/** 폼 → body 캡처 → `nonBusinessLandRaw`를 표의 raw로 덮어쓰고(+ `mutate`) POST. */
async function run(r: E3eRow, mutate?: (raw: Loose) => void, opts: { houseRows?: boolean } = {}) {
  const body = await captureBody(formOf(r));
  const raw = { ...(body.nonBusinessLandRaw as Loose), ...e3eRowRaw(r, opts) };
  mutate?.(raw);
  body.nonBusinessLandRaw = raw;
  const res = await postTransfer(body);
  return { ...res, nbl: res.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}
const errorText = (r: { json: Loose }) => JSON.stringify(r.json);

describe("E3e route 관통 — 케이스 표 전 행: 입력 → ⑫ → ⑭ → 엔진 → 세액", () => {
  it.each(E3E_ALL_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3eRow) => {
    const res = await run(r);
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.nbl?.isNonBusinessLand, `${r.id} 판정`).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays, `${r.id} 사업용 일수`).toBe(r.expect.eff);
    expect(res.nbl?.totalOwnershipDays).toBe(r.expect.total);
    const ap = res.nbl?.areaProportioning;
    if (!ap || ap.nonBusinessRatio === 0 || ap.nonBusinessRatio === 1) expect(res.result?.calculatedTax, `${r.id} 세액`).toBe(e3eTax(r.expect.nonBusiness));
  });

  it("⑫ 칸 도달 가드(P-7 — TS 미감지): W2는 세대 주택 소유 행이 서버에 닿아야 N(2,190/3,651)이다 — Zod가 칸을 strip하면 13호 선택만 남아 B(3,651)가 된다", async () => {
    const res = await run(row("W2"));
    expect(res.nbl?.isNonBusinessLand).toBe(true);
    expect(res.nbl?.effectiveBusinessDays).toBe(2190);
    expect(res.nbl?.periodEvaluation?.basis).toBe("usage_periods");
    expect(res.nbl?.periodEvaluation?.vacantLot).toMatchObject({ scope: "whole_period", houseOwnedDays: 1461 });
    expect(res.nbl?.warnings).toContain(NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE);
    expect(res.nbl?.warnings).toContain(NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE);
    // 대조: 같은 행을 빼면 현행(B)
    const without = await run(row("W2"), undefined, { houseRows: false });
    expect(without.nbl?.isNonBusinessLand).toBe(false);
    expect(without.nbl?.effectiveBusinessDays).toBe(3651);
  });

  it("종료일 칸 도달: W5(주택 소유 2018-01-01~2021-01-01)는 종료일이 닿아야 소유 구간만 제외(2,555일 B)다 — 종료일이 strip되면 양도일까지로 읽혀 N", async () => {
    const res = await run(row("W5"));
    expect(res.nbl?.isNonBusinessLand).toBe(false);
    expect(res.nbl?.effectiveBusinessDays).toBe(2555);
  });

  it("이력 경로 echo가 응답까지 닿는다(R-3): X1 — `periodEvaluation.vacantLot`(scope bare_intervals · 구간 2,190일 · 주택 소유 365일) + 구간표 `vacantLotDays`", async () => {
    const res = await run(row("X1"));
    expect(res.nbl?.periodEvaluation?.vacantLot).toMatchObject({ scope: "bare_intervals", houseOwnedDays: 365 });
    expect(res.nbl?.periodEvaluation?.vacantLot.intervals.map((i: Loose) => i.days)).toEqual([2190]);
    expect((res.nbl?.periodEvaluation?.stateHistory.intervals as Loose[]).map((i) => i.vacantLotDays)).toEqual([2190, undefined, undefined]);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
  });
});

describe("⑫′ refine — 행 구조 결함은 400(⑧ HH-3과 같은 leaf·같은 문구) · 정상·비13호·빈 배열은 200", () => {
  const rows = (arr: unknown) => (raw: Loose) => {
    raw.nblOtherHouseholdHousePeriods = arr;
  };
  const bad: ReadonlyArray<readonly [string, unknown, string]> = [
    ["시작일 빈칸", [{ startDate: "" }], "시작일"],
    ["시작일 해석 불가", [{ startDate: "2020-13-45" }], "읽을 수 없습니다"],
    ["종료일 해석 불가", [{ startDate: "2020-01-01", endDate: "내년" }], "종료일"],
    ["종료일 < 시작일(역순)", [{ startDate: "2020-01-01", endDate: "2019-01-01" }], "빠릅니다"],
    ["종료일 = 시작일(같은 날)", [{ startDate: "2020-01-01", endDate: "2020-01-01" }], "같습니다"],
    ["양도일 이후 시작", [{ startDate: "2024-06-01" }], "양도일"],
    ["둘째 행 결함", [{ startDate: "2020-01-01", endDate: "2021-01-01" }, { startDate: "" }], "2번째 행"],
  ];
  it.each(bad)("%s → 400", async (_n, arr, text) => {
    const res = await run(row("W2"), rows(arr));
    expect(res.status).toBe(400);
    expect(errorText(res)).toContain("nblOtherHouseholdHousePeriods");
    expect(errorText(res)).toContain(text);
  });

  it("행 수 상한(R-7 단일 소스): 상한 건수는 200 · 상한 + 1건은 400 + 상한 문구", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ startDate: `20${10 + i}-01-01`, endDate: `20${10 + i}-06-01` }));
    expect((await run(row("W2"), rows(mk(NBL_HOUSEHOLD_HOUSE_PERIODS_MAX)))).status).toBe(200);
    const over = await run(row("W2"), rows(mk(NBL_HOUSEHOLD_HOUSE_PERIODS_MAX + 1)));
    expect(over.status).toBe(400);
    expect(errorText(over)).toContain(nblHouseholdHousePeriodsCapMessage());
  });

  it("13호가 아닌 자산의 stale 행은 400이 아니고 엔진도 읽지 않는다(호 없음 C1p에 결함 행 → 200 · 결과 불변)", async () => {
    const control = await run(row("C1p"));
    const stale = await run(row("C1p"), rows([{ startDate: "" }, { startDate: "2020-01-01", endDate: "2019-01-01" }]));
    expect(stale.status).toBe(200);
    expect(stale.nbl?.effectiveBusinessDays).toBe(control.nbl?.effectiveBusinessDays);
    expect(stale.nbl?.isNonBusinessLand).toBe(control.nbl?.isNonBusinessLand);
  });

  it("빈 배열·키 없음 = 현행(W0): 두 입력의 결과가 같다(Q-4 (가))", async () => {
    const none = await run(row("W0"));
    const empty = await run(row("W0"), rows([]));
    expect(empty.status).toBe(200);
    expect(JSON.stringify(empty.nbl)).toBe(JSON.stringify(none.nbl));
  });
});
