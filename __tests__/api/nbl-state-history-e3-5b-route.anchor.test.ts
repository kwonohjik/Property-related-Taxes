/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1b — route 관통 anchor: 새 칸 `nblOtherDemolishedOn`(꼬리 근거 «철거ㆍ멸실»의 철거ㆍ멸실일) → ⑬ body → ⑫ Zod·refine → ⑭ 매퍼 → 엔진 → 세액.
 *
 * 침묵 strip 방지: 새 키가 Zod 객체 정의(⑫)에 없으면 route는 값을 버리고 엔진은 철거일 없음으로 접는다(⑫⑬⑭는 TS 미감지) — 이 파일이 «값이 엔진에 닿는다»를 판정으로 고정한다.
 * 직접 API 하위호환 반전(K-16h): 종전 200 + 현행 인정이던 «꼬리 근거 + 철거일 없음»은 400이다(Q-5 (가)).
 * 입력 경로: 자산에 칸을 직접 얹는다 — ④ `nbl*` prefix-pick이 운반한다(④ 덮어쓰기·⑧·⑤는 U-2).
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";
import { E35_B, E35_N, e35Tail } from "../tax-engine/_helpers/nbl-state-history-e3-5-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { DEMOLISHED_ON_REQUIRED_MESSAGE } from "@/lib/tax-engine/non-business-land/demolished-input-issue";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NO_HISTORY = { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [] } as const;

/** E3f-0 표의 raw(= 와이어 칸)를 단건 폼으로 — 잡종지 1,000㎡ · 취득가 3억 · 양도가 10억. */
const WIRE_BASICS = ["acquisitionArea", "acquisitionDate", "transferDate"];
const nblOnly = (raw: Record<string, unknown>) => Object.fromEntries(Object.entries(raw).filter(([k]) => !WIRE_BASICS.includes(k)));

function formOf(raw: Record<string, unknown>): TransferFormData {
  const { acquisitionDate, transferDate } = raw;
  const nbl = nblOnly(raw);
  const f = createDefaultTransferFormData();
  f.transferDate = String(transferDate);
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, {
      assetKind: "land", acquisitionCause: "purchase", acquisitionDate, acquisitionArea: "1000", transferArea: "1000",
      addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", isNonBusinessLand: true,
    }, nbl) as AssetForm,
  ];
  return f;
}

async function run(raw: Record<string, unknown>) {
  const body = await captureBody(formOf(raw));
  const r = await postTransfer(body);
  return { ...r, body, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const noRow = (removedOn: string | undefined, over: Record<string, unknown> = {}) =>
  e35Tail("2023-12-26", "2024-01-01", undefined, { ...NO_HISTORY, ...(removedOn !== undefined ? { nblOtherDemolishedOn: removedOn } : {}), ...over });
const errorsOf = (json: Loose) => JSON.stringify(json?.error?.fieldErrors ?? json?.error ?? json);

describe("E3f-1b route — 새 칸 `nblOtherDemolishedOn`(출처 ② · 이력 없음) 관통", () => {
  it("K-16h 직접 API 하위호환 반전: 근거 «철거ㆍ멸실» + 철거일 없음 → ⑫ 400(종전 200 + 현행 인정) · 필드 경로·문구 = DEMOLISHED_ON_REQUIRED_MESSAGE", async () => {
    for (const raw of [noRow(undefined), noRow("")]) {
      const r = await run(raw);
      expect(r.status).toBe(400);
      expect(errorsOf(r.json)).toContain("nblOtherDemolishedOn");
      expect(errorsOf(r.json)).toContain(DEMOLISHED_ON_REQUIRED_MESSAGE.slice(0, 40));
    }
  });

  it("K-15 한시 안(철거 2023-12-26 · 양도 2024-01-01): 새 칸이 body(⑬)·⑫·⑭를 지나 엔진에 닿아 근거 인정 → 사업용 · B 198,210,000 — 침묵 strip이면 접혀 N", async () => {
    const r = await run(noRow("2023-12-26"));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.body.nonBusinessLandRaw && (r.body.nonBusinessLandRaw as Loose).nblOtherDemolishedOn).toBe("2023-12-26");
    expect(r.nbl?.isNonBusinessLand).toBe(false);
    expect(r.nbl?.propertyTaxBasis).toMatchObject({ outcome: "accepted", effective: "separate" });
    expect(r.result?.calculatedTax).toBe(E35_B);
  });

  it("K-15 한시 경과(철거 2018-01-01): 접힘 → 비사업용 · N 253,960,000 · echo `demolished_period_elapsed` · 고지 1건 — 같은 입력의 철거일만 다르다(55,750,000 차이)", async () => {
    const r = await run(noRow("2018-01-01"));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(true);
    expect(r.nbl?.propertyTaxBasis).toMatchObject({ outcome: "unconfirmed", effective: "comprehensive", unconfirmedReason: "demolished_period_elapsed" });
    expect((r.nbl?.warnings as string[]).filter((w) => w === NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE)).toHaveLength(1);
    expect(r.result?.calculatedTax).toBe(E35_N);
    expect(E35_N - E35_B).toBe(55_750_000);
  });

  it("K-16b 철거일 ≥ 양도일 → 400(당일 포함) · 비날짜 → 400 · 취득일 이전(2013-06-01) → 200(취득 전 철거는 정당 — 접힘)", async () => {
    for (const bad of ["2024-01-01", "2024-02-01", "abc"]) {
      const r = await run(noRow(bad));
      expect(r.status, bad).toBe(400);
      expect(errorsOf(r.json), bad).toContain("nblOtherDemolishedOn");
    }
    const before = await run(noRow("2013-06-01"));
    expect(before.status, JSON.stringify(before.json).slice(0, 300)).toBe(200);
    expect(before.nbl?.propertyTaxBasis).toMatchObject({ outcome: "unconfirmed", unconfirmedReason: "demolished_period_elapsed" });
  });

  it("K-16e 숨은 stale: 근거가 «공지상태»면 새 칸이 비날짜여도 400이 없다(술어 거짓 — 읽지 않는다) · 엔진 입력에도 닿지 않는다", async () => {
    const r = await run(noRow("abc", { nblOtherPropertyTaxBasis: "vacant_state" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.nbl?.propertyTaxBasis).toMatchObject({ outcome: "accepted", basis: "vacant_state" });
  });
});

describe("E3f-1b route — 출처 ①(이력의 철거 행 날짜) · K-17 철거 행 우선", () => {
  const TAIL = (removedOn: string, over: Record<string, unknown> = {}) => e35Tail(removedOn, "2024-01-01", undefined, over);

  it("철거 행이 날짜를 대면 새 칸 없이 통과하고 그 날짜로 한도가 정해진다(2018-01-01 → 접힘 N · 2023-12-26 → 인정 B)", async () => {
    const old = await run(TAIL("2018-01-01"));
    expect([old.status, old.nbl?.isNonBusinessLand, old.result?.calculatedTax]).toEqual([200, true, E35_N]);
    const fresh = await run(TAIL("2023-12-26"));
    expect([fresh.status, fresh.nbl?.isNonBusinessLand, fresh.result?.calculatedTax]).toEqual([200, false, E35_B]);
  });

  it("K-17 새 칸 stray(비날짜 포함)는 읽지 않는다 — 철거 행 날짜가 이긴다 · 응답 바이트 동일", async () => {
    const plain = await run(TAIL("2018-01-01"));
    for (const stray of ["2023-12-26", "abc", "2030-01-01"]) {
      const withStray = await run(TAIL("2018-01-01", { nblOtherDemolishedOn: stray }));
      expect(withStray.status, stray).toBe(200);
      expect(withStray.nbl?.isNonBusinessLand, stray).toBe(plain.nbl?.isNonBusinessLand);
      expect(withStray.result?.calculatedTax, stray).toBe(plain.result?.calculatedTax);
      expect(withStray.nbl?.effectiveBusinessDays, stray).toBe(plain.nbl?.effectiveBusinessDays);
    }
  });

  it("K-12a 9호 입력자 세액 불변: 접어도 9호 2년이 철거 후 구간을 덮는다 — B 198,210,000 · 일수 1,096(종전 1,826)", async () => {
    const withBuilding = e35Tail("2020-01-01", "2024-01-01", "2019-01-01", { nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2020-01-01" }] });
    const r = await run(withBuilding);
    expect([r.status, r.nbl?.effectiveBusinessDays, r.result?.calculatedTax]).toEqual([200, 1096, E35_B]);
  });
});

describe("E3f-1b route — 다건 입구(`multi/route-property-input.ts`) 관통", () => {
  it("다건도 같은 ⑫·⑭: 철거일 없음 → 400 · 철거일 입력 → 단건과 같은 판정(한시 경과 → 비사업용 / 한시 안 → 사업용)", async () => {
    const missing = await postMulti(await buildMultiBody([formOf(noRow(undefined))]));
    expect(missing.status, JSON.stringify(missing.json).slice(0, 200)).toBe(400);
    for (const [on, nonBusiness] of [["2018-01-01", true], ["2023-12-26", false]] as const) {
      const multi = await postMulti(await buildMultiBody([formOf(noRow(on))]));
      expect(multi.status, `${on} ${JSON.stringify(multi.json).slice(0, 200)}`).toBe(200);
      expect((multi.props[0] as Loose).nonBusinessLandJudgmentDetail?.isNonBusinessLand, on).toBe(nonBusiness);
    }
  });
});

describe("E3f-1b route — 축 B 지분 번들(같은 땅 지분): 땅 사실은 첫 카드 값을 그대로 쓴다 — 둘째 지분 raw의 철거ㆍ멸실일도 첫 카드의 것(K-28 실측)", () => {
  /** 두 지분(취득 2014-01-01 · 2021-06-01) — 첫 카드에만 nbl 칸을 얹고 둘째는 지분 사실(취득일·지분율)만 갖는다. 둘째에 stray 새 칸을 줄 수 있다. */
  function bundle(firstNbl: Record<string, unknown>, secondOver: Record<string, unknown> = {}): TransferFormData {
    const { transferDate } = firstNbl;
    const nbl = nblOnly(firstNbl);
    const f = createDefaultTransferFormData();
    f.transferDate = String(transferDate);
    f.filingDate = "2025-12-31";
    f.contractTotalPrice = "1000000000";
    f.assetSplitMode = "fractional";
    const base = { assetKind: "land", acquisitionCause: "purchase", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1", fixedAcquisitionPrice: "150000000", isNonBusinessLand: true } as Partial<AssetForm>;
    f.assets = [
      Object.assign({ ...makeDefaultAsset(1) }, base, { acquisitionDate: "2014-01-01", ownershipNumerator: "50", ownershipDenominator: "100" }, nbl) as AssetForm,
      Object.assign({ ...makeDefaultAsset(2) }, base, { acquisitionDate: "2021-06-01", ownershipNumerator: "50", ownershipDenominator: "100" }, secondOver) as AssetForm,
    ];
    return f;
  }
  const postBundle = async (f: TransferFormData) => {
    const body = await captureBody(f);
    return { body, ...(await postTransfer(body)) };
  };

  it("첫 카드 철거ㆍ멸실일 없음 → 400(지분 raw마다 ⑫′ — 둘째 지분 raw가 같은 값을 싣는다) · 경로는 컴패니언 raw의 새 칸", async () => {
    const r = await postBundle(bundle(noRow(undefined)));
    expect(r.status).toBe(400);
    expect(errorsOf(r.json)).toContain("nblOtherDemolishedOn");
  });

  it("첫 카드 새 칸 2018-01-01 + 둘째 카드 stray 새 칸 2023-12-26: 둘째 지분 raw의 철거ㆍ멸실일은 첫 카드 값(복사·미러링 없이 ④ 레코드가 첫 카드 땅 사실을 쓴다) → 두 지분 모두 한시 경과로 접힘", async () => {
    const r = await postBundle(bundle(noRow("2018-01-01"), { nblOtherDemolishedOn: "2023-12-26" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const companions = r.body.companionAssets as Loose[];
    expect(companions[0].nonBusinessLandRaw.nblOtherDemolishedOn).toBe("2018-01-01");
    expect((r.body.nonBusinessLandRaw as Loose).nblOtherDemolishedOn).toBe("2018-01-01");
    const details = ((r.json as Loose).data.aggregated.properties as Loose[]).map((p) => p.nonBusinessLandJudgmentDetail);
    expect(details.map((d) => d?.propertyTaxBasis?.unconfirmedReason)).toEqual(["demolished_period_elapsed", "demolished_period_elapsed"]);
  });

  it("둘째 카드에만 새 칸이 있어도(첫 카드 없음) 400 — 둘째 지분은 자기 칸을 읽지 않는다(땅 사실은 첫 카드)", async () => {
    const r = await postBundle(bundle(noRow(undefined), { nblOtherDemolishedOn: "2023-12-26" }));
    expect(r.status).toBe(400);
  });
});
