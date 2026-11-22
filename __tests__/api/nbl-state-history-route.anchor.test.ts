/**
 * NBL-STATE-HISTORY-E0 · Anchor 2(route) + Anchor 3(route) — 이력 칸이 아직 엔진에 닿지 않는 지금, route 실호출에서
 *   (a) 세액 2값 — 전량 비사업용 253,960,000 / 전량 사업용 198,210,000 (잡종지 1,000㎡ · 양도 10억 · 취득 3억 · 2014-01-01 → 2024-01-01 · `makeMockRates`)
 *   (b) 모드 — raw에 `nblOtherStateHistoryMode`(+ `nblOtherStateEvents: []`)를 넣어도 `""`·`unchanged`는 응답 전체가 미전송과 같고, `unknown`은 고지 한 줄만 더한다
 *   (c) 이력 없음 경로의 확인 필요 고지 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`가 route 응답 `nonBusinessLandJudgmentDetail.warnings`에 실린다
 * 를 고정한다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §4 E0
 *   엔진 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §7.2 Anchor 2·3 · §4.4
 * 결정: Q-15 (가′) · V-1 일 단위. 입력 경로 = 화면 폼 → ④ `callTransferTaxAPI` 본문 → 실제 route(⑫⑭) → 엔진.
 *
 * ⚠️ E0에서는 ⑫ Zod가 새 칸을 모르고 침묵 strip해 모드 4종이 모두 같았다. E2가 ⑫에 칸을 열었으므로 `""`·`unchanged`는 «현행 그대로»(바이트 동일 — P-11)이고
 *    `unknown`만 `NBL_STATE_HISTORY_UNKNOWN_NOTICE` 한 줄이 더해진다(엔진 §4.4 · 통합 Q-6). 이 변경은 E2 PR에서 의도적으로 한 것이다.
 */
import { describe, it, expect, vi } from "vitest";

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
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 잡종지 1,000㎡ · 취득 2014-01-01 3억 → 양도 2024-01-01 10억 · 단건. */
function form(own: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-01-01";
  f.filingDate = "2024-03-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000",
      isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
      // NBL-STATE-HISTORY-U1 픽스처 보정 — 질문에 «바뀐 적 없음»(⑧ #1 통과). 엔진은 `unchanged`를 미전송과 바이트 동일하게 다룬다(E2) — 모드 4종 대조는 `run`의 rawExtra가 raw를 덮어써서 그대로 유지된다.
      nblOtherStateHistoryMode: "unchanged",
    }, own) as AssetForm,
  ];
  return f;
}

const NON_BUSINESS = { nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false } as Partial<AssetForm>;
/** 별도합산 + 공지상태 근거(건축물 없음) — D2 anchor와 같은 사업용 시료. */
const BUSINESS = { nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false, nblOtherPropertyTaxBasis: "vacant_state" } as Partial<AssetForm>;

/** 모드 4종 — 미전송 / `""` / `unchanged` / `unknown`. raw(`nonBusinessLandRaw`)에 UI 계획서 §6의 와이어 칸 이름으로 싣는다. */
const MODES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["미전송", {}],
  ['""', { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }],
  ["unchanged", { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [] }],
  ["unknown", { nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [] }],
];

async function run(own: Partial<AssetForm>, rawExtra: Record<string, unknown> = {}) {
  const f = form(own);
  const body = await captureBody(f);
  body.nonBusinessLandRaw = { ...(body.nonBusinessLandRaw as Loose), ...rawExtra };
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    status: r.status,
    issues: allIssues(f),
    json: r.json as Loose,
    result,
    nbl: result?.nonBusinessLandJudgmentDetail as { isNonBusinessLand: boolean; warnings: string[] } | undefined,
  };
}

describe("NBL-STATE-HISTORY-E0 Anchor 2(route) — 세액 2값", () => {
  it("전량 비사업용: 산출세액 253,960,000 · 지방소득세 25,396,000 · 총 279,356,000", async () => {
    const r = await run(NON_BUSINESS);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl?.isNonBusinessLand).toBe(true);
    expect(r.result?.calculatedTax).toBe(253_960_000);
    expect(r.result?.localIncomeTax).toBe(25_396_000);
    expect(r.result?.totalTax).toBe(279_356_000);
  });

  it("전량 사업용(별도합산 + 공지상태 근거): 산출세액 198,210,000 · 지방소득세 19,821,000 · 총 218,031,000", async () => {
    const r = await run(BUSINESS);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
    expect(r.result?.calculatedTax).toBe(198_210_000);
    expect(r.result?.localIncomeTax).toBe(19_821_000);
    expect(r.result?.totalTax).toBe(218_031_000);
  });
});

/** unknown 모드의 응답에서 «모름» 고지 한 줄을 뺀 data — 나머지가 미전송과 같음을 보인다. */
function withoutUnknownNotice(data: Loose): Loose {
  const copy = JSON.parse(JSON.stringify(data)) as Loose;
  const d = copy.result?.nonBusinessLandJudgmentDetail;
  if (d) d.warnings = (d.warnings as string[]).filter((w) => w !== NBL_STATE_HISTORY_UNKNOWN_NOTICE);
  return copy;
}

describe("NBL-STATE-HISTORY-E0 Anchor 2(route) — 모드별 응답", () => {
  it.each([
    ["비사업용 시료", NON_BUSINESS],
    ["사업용 시료", BUSINESS],
  ] as const)("%s: raw에 이력 칸을 넣어도 \"\"·unchanged는 응답 data 전체가 미전송과 같다 · unknown은 «모름» 고지 한 줄만 더한다", async (_n, own) => {
    const base = await run(own);
    expect(base.status).toBe(200);
    for (const [modeName, extra] of MODES.slice(1, 3)) {
      const r = await run(own, extra);
      expect(r.status, `${modeName}: ${JSON.stringify(r.json).slice(0, 200)}`).toBe(200);
      expect(r.json.data, modeName).toEqual(base.json.data);
    }
    const unknown = await run(own, MODES[3][1]);
    expect(unknown.status).toBe(200);
    expect(unknown.nbl?.warnings.filter((w) => w === NBL_STATE_HISTORY_UNKNOWN_NOTICE)).toHaveLength(1);
    expect(withoutUnknownNotice(unknown.json.data)).toEqual(base.json.data);
  });
});

describe("NBL-STATE-HISTORY-E0 Anchor 3(route) — 이력 없음 경로 고지", () => {
  it.each([
    ["비사업용 시료", NON_BUSINESS],
    ["사업용 시료", BUSINESS],
  ] as const)("%s × 모드 4종: route 응답 warnings에 «양도일 현재의 상태» 고지가 실린다", async (_n, own) => {
    for (const [modeName, extra] of MODES) {
      const r = await run(own, extra);
      expect(r.status, modeName).toBe(200);
      expect(r.nbl?.warnings, modeName).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
      // 문구 자체도 고정 — 상수가 바뀌어도 route가 같은 상수를 실어 이 단언이 통과하는 일을 막는다.
      expect(r.nbl?.warnings.join(" "), modeName).toContain("양도일 현재의 상태로 판정해 소유기간 전체에 적용했습니다");
    }
  });
});
