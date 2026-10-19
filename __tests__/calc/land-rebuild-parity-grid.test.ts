/**
 * 구주택 멸실·신축 통산(해석 (5)) — ⑧≡⑫ 격자 + ④ body 계약 + 호스트 닫힘(stale) 격자.
 *
 * 폼(AssetForm/TransferFormData) → ④(`callTransferTaxAPI`·`buildPropertyPayload` body) → ⑫(route Zod) → 엔진, 그리고 ⑧(`collectStepIssues` 0·1)을 같은 폼에서 나란히 돌린다.
 * 기대의 정본은 엔진 leaf(`collectLandRebuildIssues`)가 ⑫ 400으로 내는 칸이다 — ⑧ 기대값을 손으로 따로 적지 않는다(feedback_fe8_vs_12_parity_grid).
 *
 * 불변식
 *   (A) 막다른 길 0 — ⑧이 통과한 폼은 ⑫가 200이다.
 *   (B) leaf 소관 사유는 ⑧ 차단 ⇔ ⑫ 400(같은 칸).
 *   (C) 호스트가 닫힌 폼(토글 OFF·토지 원인 OFF·취득원인 변경·소유자 분리·부담부증여·겸용·건물 종류·컴패니언)은 입력이 있어도
 *       ⑧ 결과·④ body가 입력 없음과 **같다**(저장값은 지우지 않고 읽는 쪽이 「없음」으로 읽는다).
 *
 * 호스트가 두 곳이다 — 건물 신축 + 토지 상속·증여(`rebuildAsset`) / 매매 + 「토지·건물 취득일 다름」 + 토지 overlay 없음(`purchaseRebuildAsset`).
 * (A)(B) 격자는 두 호스트에 같은 셀을 돌리고, (C)는 호스트별 닫힘 목록을 따로 둔다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { bodyOf, routeOf, issuesOf } from "./_helpers/split-carryover-c-form";
import { rebuildAsset, rebuildForm, purchaseRebuildAsset } from "./_helpers/land-rebuild-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const asForm = (over: Record<string, unknown>) => rebuildForm({}, rebuildAsset(over));
const asPurchaseForm = (over: Record<string, unknown>) => rebuildForm({}, purchaseRebuildAsset(over));

type Cell = {
  name: string;
  make: () => TransferFormData;
  /** 이 칸에서 ⑧ 차단·⑫ 400이 같이 나야 한다(⑫ 칸 이름에 포함) */
  leafKey?: string;
  /** ⑫는 통과(키를 싣지 않음)하고 ⑧만 막는다 — ④가 키를 보내지 않는 미선택 상태 */
  strictOnly?: boolean;
  /** 통과 셀 — ⑧ 통과 · ⑫ 200 */
  pass?: boolean;
};

const cellsOf = (asForm: (over: Record<string, unknown>) => TransferFormData, base: () => TransferFormData): Cell[] => [
  { name: "기준 — 구주택 토지 취득 때부터(since_land) · 멸실 2023-05-31 · 정착면적 확인", make: base, pass: true },
  { name: "later + 구주택 취득일(토지 법정 기산일 이후)", make: () => asForm({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "2018-03-01" }), pass: true },
  { name: "later + 구주택 취득일이 토지 법정 기산일보다 앞 → 법정 기산일부터(통과)", make: () => asForm({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "2005-03-01" }), pass: true },
  { name: "since_land인데 구주택 취득일 잔재 → 보내지 않는다(통과)", make: () => asForm({ landRebuildPriorHouseStartDate: "2018-03-01" }), pass: true },
  { name: "멸실일 = 신축 취득일 전날(경계 통과)", make: () => asForm({ landRebuildDemolitionDate: "2024-12-31" }), pass: true },
  { name: "멸실일 = 토지 취득일(경계 통과)", make: () => asForm({ landRebuildDemolitionDate: "2022-01-01" }), pass: true },
  // ── leaf 소관 — ⑧ 차단 ⇔ ⑫ 400 ──
  { name: "later인데 구주택 취득일 비움", make: () => asForm({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "" }), leafKey: "priorHouseStartDate" },
  { name: "구주택 시작일 > 멸실일", make: () => asForm({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "2024-01-01" }), leafKey: "demolitionDate" },
  { name: "멸실일 비움", make: () => asForm({ landRebuildDemolitionDate: "" }), leafKey: "demolitionDate" },
  { name: "멸실일 < 토지 취득일", make: () => asForm({ landRebuildDemolitionDate: "2021-12-31" }), leafKey: "demolitionDate" },
  { name: "멸실일 = 신축 취득일", make: () => asForm({ landRebuildDemolitionDate: "2025-01-01" }), leafKey: "demolitionDate" },
  { name: "멸실일 > 신축 취득일", make: () => asForm({ landRebuildDemolitionDate: "2025-03-01" }), leafKey: "demolitionDate" },
  { name: "정착면적 미확인", make: () => asForm({ landRebuildFootprintUnchanged: false }), leafKey: "footprintUnchanged" },
  // ── ⑧ 전용 — 시작 구분 미선택은 ④가 키를 싣지 않아 ⑫는 통과한다(⑧이 더 엄격한 방향: 모름 = 혜택 불성립 + 확인 필요) ──
  { name: "시작 구분 미선택", make: () => asForm({ landRebuildStartMode: "" }), strictOnly: true },
];

const HOSTS = [
  { host: "신축 호스트", asForm, cells: cellsOf(asForm, () => rebuildForm()) },
  { host: "매매 호스트", asForm: asPurchaseForm, cells: cellsOf(asPurchaseForm, () => rebuildForm({}, purchaseRebuildAsset())) },
];

describe("구주택 멸실·신축 통산 — ⑧≡⑫ 격자", () => {
  const offTax = (async () => {
    const r = await routeOf(POST, await bodyOf(asForm({ landRebuildEnabled: false })));
    return r.json?.data?.result?.calculatedTax as number;
  })();

  it("기준 셀: ⑧ 통과 · ④ body에 키 4필드(구주택 취득일 없음) · ⑫ 200 · 세율 개월이 두 구간 합(161 + 8 = 169) · 세액이 입력 없음보다 낮다(통산 효과)", async () => {
    const form = rebuildForm();
    expect(issuesOf(form)).toEqual([]);
    const body = await bodyOf(form);
    expect(body.landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2023-05-31", footprintUnchanged: true });
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    const agg = r.json.data.result.splitDetail.land.rateHoldingAggregation;
    expect(agg).toMatchObject({ totalMonths: 169, priorHouse: { from: "2010-01-01", to: "2023-05-31", months: 161 }, newHouse: { from: "2025-01-01", to: "2025-09-01", months: 8 }, startRule: "land_basis" });
    expect(r.json.data.result.calculatedTax).toBeLessThan(await offTax);
  });

  it("[매매 호스트] 기준 셀: ⑧ 통과 · ④ body에 키 3필드 · ⑫ 200 · 세율 개월 17 + 8 = 25 · 세액이 입력 없음보다 낮다 · 건물 원인 purchase echo", async () => {
    const form = rebuildForm({}, purchaseRebuildAsset());
    expect(issuesOf(form)).toEqual([]);
    const body = await bodyOf(form);
    expect(body.acquisitionCause).toBe("purchase");
    expect(body.landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2023-05-31", footprintUnchanged: true });
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    const land = r.json.data.result.splitDetail.land;
    expect(land.rateHoldingAggregation).toMatchObject({ totalMonths: 25, priorHouse: { from: "2022-01-01", to: "2023-05-31", months: 17 }, newHouse: { from: "2025-01-01", to: "2025-09-01", months: 8 }, startRule: "land_basis" });
    expect(land.acquisitionCause).toBe("purchase");
    const off = await routeOf(POST, await bodyOf(rebuildForm({}, purchaseRebuildAsset({ landRebuildEnabled: false }))));
    expect(r.json.data.result.calculatedTax).toBeLessThan(off.json.data.result.calculatedTax);
  });

  it("[매매 호스트] 다건(합산) ④도 같은 키", async () => {
    const form = rebuildForm({}, purchaseRebuildAsset());
    expect((buildPropertyPayload(form) as Record<string, unknown>).landRebuildPriorHouse).toEqual((await bodyOf(form)).landRebuildPriorHouse);
  });

  it("[매매 호스트] API 직접 호출 — 건물 매매 + 토지 상속 overlay + 통산은 ⑫ 400(건물을 산 것이지 신축이 아니다). 화면은 그 호스트를 닫아 키를 싣지 않는다", async () => {
    const body = { ...(await bodyOf(rebuildForm({}, purchaseRebuildAsset()))), landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2010-01-01" };
    const r = await routeOf(POST, body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.fieldErrors)).toContain("건물을 산 것이지 같은 토지 위에 신축한 것이 아닙니다");
  });

  it("다건(합산) ④도 같은 leaf — body 키가 단건과 같다(⑬ 도달) · 시작 구분 미선택이면 싣지 않는다", async () => {
    const form = rebuildForm();
    expect((buildPropertyPayload(form) as Record<string, unknown>).landRebuildPriorHouse).toEqual((await bodyOf(form)).landRebuildPriorHouse);
    expect("landRebuildPriorHouse" in buildPropertyPayload(asForm({ landRebuildStartMode: "" }))).toBe(false);
  });

  it("토글 OFF — 키가 없고 body가 입력 없음과 같으며 세액이 종전과 같다(회귀 0)", async () => {
    const off = await bodyOf(asForm({ landRebuildEnabled: false }));
    expect("landRebuildPriorHouse" in off).toBe(false);
    const r = await routeOf(POST, off);
    expect(r.status).toBe(200);
    expect(r.json.data.result.splitDetail.land.rateHoldingAggregation).toBeUndefined();
  });

  for (const { host, cells } of HOSTS) for (const cell of cells) {
    it(`[${host}] ${cell.name}`, async () => {
      const form = cell.make();
      const issues = issuesOf(form);
      const body = await bodyOf(form);
      const r = await routeOf(POST, body);
      const keys = Object.keys(r.fieldErrors);
      const blocked8 = issues.length > 0;
      // (A) 막다른 길 0
      if (!blocked8) expect(r.status, `⑧ 통과인데 ⑫ ${r.status} ${JSON.stringify(r.fieldErrors)}`).toBe(200);
      if (cell.pass) {
        expect(blocked8, JSON.stringify(issues)).toBe(false);
        expect(r.status).toBe(200);
      }
      // (B) leaf 소관 ⇔
      if (cell.leafKey) {
        expect(blocked8, `⑧ 차단 기대(${cell.leafKey})`).toBe(true);
        expect(r.status, `⑫ 400 기대(${cell.leafKey})`).toBe(400);
        expect(keys.some((k) => k.includes(cell.leafKey!)), `⑫ 칸 ${cell.leafKey} ← ${JSON.stringify(keys)}`).toBe(true);
        // 같은 문구 — ⑧은 leaf 문구를 그대로 낸다(자산 라벨 접두만 다르다)
        const msg12 = (r.fieldErrors[keys.find((k) => k.includes(cell.leafKey!))!] ?? [])[0];
        if (msg12 && !msg12.startsWith("Invalid") && msg12 !== "Required") expect(issues.some((i) => i.message.includes(msg12)), `⑧ 문구 ≠ ⑫ 문구: ${msg12}`).toBe(true);
      }
      if (cell.strictOnly) {
        expect(blocked8).toBe(true);
        expect("landRebuildPriorHouse" in body, "시작 구분이 비면 키를 싣지 않는다").toBe(false);
        expect(r.status).toBe(200);
      }
    });
  }

  it("⑧ 칸 앵커 — 위반 칸이 입력 위젯의 data-field와 같은 이름이다", () => {
    const field = (over: Record<string, unknown>) => issuesOf(asForm(over))[0]?.field;
    expect(field({ landRebuildStartMode: "" })).toBe("landRebuildStartMode");
    expect(field({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "" })).toBe("landRebuildPriorHouseStartDate");
    expect(field({ landRebuildDemolitionDate: "" })).toBe("landRebuildDemolitionDate");
    expect(field({ landRebuildDemolitionDate: "2025-03-01" })).toBe("landRebuildDemolitionDate");
    expect(field({ landRebuildFootprintUnchanged: false })).toBe("landRebuildFootprintUnchanged");
  });
});

describe("호스트가 닫힌 폼 — ⑧·④가 입력 없음과 같다 (저장값은 지우지 않는다)", () => {
  const CLOSED: [string, Record<string, unknown>][] = [
    ["토지 원인 토글 OFF(호스트 태그 비움)", { landCauseHost: "" }],
    ["토지 원인 값 비움", { landAcquisitionCause: "" }],
    ["취득원인을 상속으로 전환(건물 상속·증여는 호스트가 아니다)", { acquisitionCause: "inheritance" }],
    ["소유자 분리(건물만 본인)", { selfOwns: "building_only" }],
    ["부담부증여 양도", { transferType: "burdened_gift" }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["자산 종류가 건물(주택 아님)", { assetKind: "building" }],
    ["취득일 분리 OFF", { hasSeperateLandAcquisitionDate: false }],
  ];
  for (const [name, patch] of CLOSED) {
    it(`${name} — 통산 입력이 켜져 있어도 ⑧ 결과·④ body가 토글 OFF와 같다`, async () => {
      const on = rebuildForm({}, rebuildAsset({ ...patch, landRebuildEnabled: true }));
      const off = rebuildForm({}, rebuildAsset({ ...patch, landRebuildEnabled: false }));
      expect(issuesOf(on)).toEqual(issuesOf(off));
      const [bOn, bOff] = [await bodyOf(on), await bodyOf(off)];
      expect("landRebuildPriorHouse" in bOn).toBe(false);
      expect(bOn).toEqual(bOff);
      // 다건(합산) ④도 같은 leaf
      expect("landRebuildPriorHouse" in buildPropertyPayload(on)).toBe(false);
    });
  }

  const CLOSED_PURCHASE: [string, Record<string, unknown>][] = [
    ["토지 상속 overlay 켬(건물은 매수 — 신축 아님)", { landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "2010-01-01" }],
    ["토지 증여 overlay 켬", { landAcquisitionCause: "gift", landCauseHost: "purchase" }],
    ["D2 건물 상속 + 토지 매매", { acquisitionCause: "inheritance", landAcquisitionCause: "purchase", landCauseHost: "inheritance" }],
    ["취득일 다름 OFF", { hasSeperateLandAcquisitionDate: false }],
    ["소유자 분리(토지만 본인)", { selfOwns: "land_only" }],
    ["부담부증여 양도", { transferType: "burdened_gift" }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["자산 종류가 건물(주택 아님)", { assetKind: "building" }],
  ];
  for (const [name, patch] of CLOSED_PURCHASE) {
    it(`[매매 호스트] ${name} — 통산 입력이 켜져 있어도 ⑧ 결과·④ body가 토글 OFF와 같다`, async () => {
      const on = rebuildForm({}, purchaseRebuildAsset({ ...patch, landRebuildEnabled: true }));
      const off = rebuildForm({}, purchaseRebuildAsset({ ...patch, landRebuildEnabled: false }));
      expect(issuesOf(on)).toEqual(issuesOf(off));
      const [bOn, bOff] = [await bodyOf(on), await bodyOf(off)];
      expect("landRebuildPriorHouse" in bOn).toBe(false);
      expect(bOn).toEqual(bOff);
      expect("landRebuildPriorHouse" in buildPropertyPayload(on)).toBe(false);
    });
  }

  it("[매매 호스트] 신축 호스트에서 켠 뒤 취득원인을 매매로 전환 — 화면에 보이는 매매 호스트 블록이 열려 ④·⑧이 같은 값을 읽는다(침묵 누수 아님)", async () => {
    const form = rebuildForm({}, rebuildAsset({ acquisitionCause: "purchase", buildingAcquisitionPrice: "250,000,000" }));
    expect((await bodyOf(form)).landRebuildPriorHouse).toBeTruthy();
  });

  it("[매매 호스트] 저장값을 지우지 않는다 — 취득일 다름 OFF → ON 복원", async () => {
    const closed = purchaseRebuildAsset({ hasSeperateLandAcquisitionDate: false });
    expect(closed.landRebuildEnabled).toBe(true);
    expect("landRebuildPriorHouse" in (await bodyOf(rebuildForm({}, closed)))).toBe(false);
    expect((await bodyOf(rebuildForm({}, purchaseRebuildAsset()))).landRebuildPriorHouse).toBeTruthy();
  });

  it("저장값을 지우지 않는다 — 호스트를 닫았다 다시 열면 통산 입력이 복원된다", async () => {
    const closed = rebuildAsset({ landCauseHost: "" });
    expect(closed.landRebuildEnabled).toBe(true);
    expect(closed.landRebuildDemolitionDate).toBe("2023-05-31");
    const reopened = rebuildForm({}, rebuildAsset({ landCauseHost: "newConstruction" }));
    expect((await bodyOf(reopened)).landRebuildPriorHouse).toBeTruthy();
  });

  const companion = (over: Record<string, unknown> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(2),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2018-03-02",
      fixedAcquisitionPrice: "300,000,000",
      actualSalePrice: "400,000,000",
      ...over,
    }) as unknown as AssetForm;

  it("함께 양도 자산(두 번째 이후)에는 입력이 열리지 않는다 — 통산이 켜진 신축 컴패니언도 ⑧ 통과 · ④ 키 없음(⑫ 400 방지)", async () => {
    // 첫 자산은 통산 없음, 둘째가 신축 + 토지 상속 + 통산 ON — 둘째 자산은 컴패니언 자리다
    const first = companion({ assetId: "a1" });
    const second = rebuildAsset({ assetId: "a2" });
    const secondOff = rebuildAsset({ assetId: "a2", landRebuildEnabled: false });
    const on = rebuildForm({ assets: [first, second], contractTotalPrice: "1400000000", bundledSaleMode: "actual" } as never);
    const off = rebuildForm({ assets: [first, secondOff], contractTotalPrice: "1400000000", bundledSaleMode: "actual" } as never);
    expect(issuesOf(on)).toEqual(issuesOf(off));
    const [bOn, bOff] = [await bodyOf(on), await bodyOf(off)];
    // 컴패니언이 실제로 body에 실렸는지부터 — 없으면 아래 부재 단언이 공허하다
    expect((bOn.companionAssets as unknown[] | undefined)?.length).toBe(1);
    expect(JSON.stringify(bOn)).not.toContain("landRebuildPriorHouse");
    expect(bOn).toEqual(bOff);
  });
});
