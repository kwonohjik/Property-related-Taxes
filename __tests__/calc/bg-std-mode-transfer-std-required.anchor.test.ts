/**
 * anchor — 부담부증여 기준시가 평가 × 양도시 기준시가 비움 (계획서 `docs/02-design/features/bg-std-mode-transfer-std-required.plan.md`).
 *
 * 종전: 양도시 기준시가를 비우면 ⑧ 통과 → 엔진이 담보평가를 증여가액으로 고르고 양도가액 0 → 취득가액만 남은 양도차손 → **세액 0**.
 * 1985 이후 매매·증여·재개발·축 B 공통이었다(계획서 §2 실측). 착수 전 mutation(P-0a)에서 이 동작을 지키는 테스트가 0건이었다.
 *
 * 여기서 재는 것 — 화면 경로(폼 → ⑧ → ④ → route → 엔진):
 * - S-1~S-5 비우면 ⑧이 「양도시 기준시가」 칸을 짚고, ⑧을 건너뛴 body도 400이다.
 * - S-6 토지는 ㎡당 공시지가 × 면적만으로 통과하고 세액이 총액 입력과 같다(④ leaf와 같은 판정).
 * - S-7~S-10 숨은 ① · 축 B 한 지분 · 일반건물 · 함께 양도.
 * - S-11 채운 시료 세액 불변 · S-12 시가 평가는 새 검사 없음.
 * - R4-1~3 시가 평가 · 담보 승 · 1985 전 상속 상가는 쓰이지 않는 양도시 기준시가를 요구하지 않는다(Q-2 a). 지분 보유는 종전대로 막는다.
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
import { allIssues } from "./_helpers/redev-one-house-route";
import { captureBody } from "./_helpers/redev-one-house-route";
import { postTransfer } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Partial<AssetForm> & Record<string, unknown>;

/** ⑧ 새 검사 문구 · 엔진 fail-fast 문구 */
const FE8 = /부담부증여 기준시가 평가 — .*양도시 기준시가/;
const ENGINE = /양도시 기준시가/;
/** 상가 ③ 가드 문구(R-4) */
const CB3 = /환산취득가액도 비교합니다/;

const BG: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard" };
const STD: A = { standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000" };
const BUY: A = { acquisitionCause: "purchase", acquisitionDate: "2010-03-15" };
const MORT: A = { bgMortgageDebtAmount: "200000000", bgLendingDepositTotal: "0" };
const INH1983: A = { acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01" };
const H: A = { ...BG, assetKind: "housing", ...STD, ...BUY, ...MORT };

function form(assets: A[], extra: Record<string, unknown> = {}): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;
}

/** 1세대 판정 확인란 안내는 이 결함과 무관하다 — 빼고 본다. */
const issues = (f: TransferFormData) => allIssues(f).filter((i) => !/다른 보유 주택이 없는지|분양권·입주권이 없는지/.test(i.message));

/** ⑧을 건너뛰고 ④ body를 그대로 보낸다(API 직접 호출과 같다). */
async function route(f: TransferFormData) {
  const r = await postTransfer(await captureBody(f));
  const data = r.json?.data;
  return { status: r.status, text: JSON.stringify(r.json), tax: data?.result?.determinedTax ?? data?.aggregated?.determinedTax };
}

describe("S-1~S-5 — 비우면 ⑧이 칸을 짚고, ⑧을 건너뛰어도 400", () => {
  const cases: [string, A, A][] = [
    ["S-1 주택", H, { standardPriceAtTransfer: "" }],
    ["S-2 건물", { ...H, assetKind: "building" }, { standardPriceAtTransfer: "" }],
    ["S-3 상가", { ...H, assetKind: "commercial_building" }, { standardPriceAtTransfer: "" }],
    ["S-4 토지", { ...H, assetKind: "land", transferArea: "100", acquisitionArea: "100" }, { standardPriceAtTransfer: "", standardPricePerSqmAtTransfer: "" }],
  ];
  for (const [name, fill, empty] of cases) {
    it(`${name} — 채우면 세액 11,332,800 · 비우면 ⑧ standardPriceAtTransfer + 400 (종전 200 · 세액 0)`, async () => {
      expect((await route(form([fill]))).tax).toBe(11_332_800);
      const f = form([{ ...fill, ...empty }]);
      const first = issues(f)[0];
      expect(first?.field).toBe("standardPriceAtTransfer");
      expect(first?.message).toMatch(FE8);
      const r = await route(f);
      expect(r.status).toBe(400);
      expect(r.text).toMatch(ENGINE);
    });
  }

  it("S-5 재개발 완공 아파트 — 채우면 115,169,714 · 비우면 ⑧ + 400", async () => {
    const RD: A = {
      ...BG, assetKind: "redevelopment_apt", acquisitionCause: "inheritance", acquisitionDate: "2000-07-26", inheritanceStartDate: "2000-07-26", decedentAcquisitionDate: "1970-01-01",
      standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "100,000,000", bgMortgageDebtAmount: "600,000,000",
      redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
      redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000",
      redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000", redevActualAcquisitionPrice: "", useEstimatedAcquisition: false,
    };
    const ex = { householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
    expect((await route(form([RD], ex))).tax).toBe(115_169_714);
    const f = form([{ ...RD, standardPriceAtTransfer: "" }], ex);
    expect(issues(f)[0]?.field).toBe("standardPriceAtTransfer");
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(r.text).toMatch(ENGINE);
  });
});

describe("S-6 — 토지는 ㎡당 공시지가 × 면적만으로도 된다(④ leaf와 같은 판정)", () => {
  it("총액 칸을 비우고 ㎡당 4,000,000 × 100㎡ → ⑧ 통과 · 세액 = 총액 4억 입력과 같음", async () => {
    const f = form([{ ...H, assetKind: "land", transferArea: "100", acquisitionArea: "100", standardPriceAtTransfer: "", standardPricePerSqmAtTransfer: "4,000,000" }]);
    expect(issues(f).filter((i) => FE8.test(i.message))).toEqual([]);
    expect((await route(f)).tax).toBe(11_332_800);
  });
});

describe("S-7 — 1983 상속 · 숨은 ① 값이 남은 기준시가 평가", () => {
  it("채우면 9,936,000 · 비우면 ⑧ 새 문구(종전 통과 · 세액 0)", async () => {
    const a: A = { ...H, ...INH1983, publishedValueAtInheritance: "300000000" };
    expect((await route(form([a]))).tax).toBe(9_936_000);
    const f = form([{ ...a, standardPriceAtTransfer: "" }]);
    expect(issues(f)[0]?.message).toMatch(FE8);
    expect((await route(f)).status).toBe(400);
  });
});

describe("S-8 — 축 B 둘째 지분만 비움", () => {
  const HALF: A = { ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: "서울 A 1" };
  const second: A = { ...H, ...HALF, acquisitionDate: "2012-03-15" };
  const ex = { assetSplitMode: "fractional", contractTotalPrice: "" };
  it("채우면 11,798,400 · 둘째만 비우면 ⑧이 자산 2를 짚는다", async () => {
    expect((await route(form([{ ...H, ...HALF }, second], ex))).tax).toBe(11_798_400);
    const f = form([{ ...H, ...HALF }, { ...second, standardPriceAtTransfer: "" }], ex);
    const hit = issues(f).find((i) => FE8.test(i.message));
    expect(hit?.message).toMatch(/^자산 2:/);
    expect((await route(f)).status).toBe(400);
  });
});

describe("S-9·S-10 — ⑧이 다른 규칙으로 막는 경로도 API 직접 호출은 막힌다(S-9 ⑫ · S-10 엔진)", () => {
  // 2026-10-26 — 이 요청은 이제 엔진보다 ⑫(`refineGbBurdenedGiftActualPath` 기준시가 4칸)가 먼저 막는다(계획서 bg-gb-std-sides-and-pre-deemed-msg.plan.md §6 P-0).
  // 엔진 차단은 S-1~S-5가 지킨다.
  it("S-9 일반건물 양도시 토지·건물 다 비움 → 400 · ⑫ (종전 200 · 세액 0)", async () => {
    const GB: A = {
      ...BG, ...BUY, ...MORT, assetKind: "general_building", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential",
      gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    };
    expect((await route(form([GB]))).tax).toBe(11_332_800);
    const r = await route(form([{ ...GB, gbTransferLandPricePerSqm: "", gbTransferBuildingValue: "" }]));
    expect(r.status).toBe(400);
    expect(r.text).toContain("burdenedGiftInfo.landStdPriceAtTransfer");
    expect(r.text).toContain("burdenedGiftInfo.buildingStdPriceAtTransfer");
  });

  it("S-10 함께 양도 두 자산 다 비움 → 400 (종전 200 · 세액 0)", async () => {
    const ex = { assetSplitMode: "companion" };
    const two = (over: A) => [{ ...H, addressJibun: "서울 A 1", ...over }, { ...H, addressJibun: "서울 B 2", ...over }];
    expect((await route(form(two({}), ex))).tax).toBe(35_289_000);
    const r = await route(form(two({ standardPriceAtTransfer: "" }), ex));
    expect(r.status).toBe(400);
    expect(r.text).toMatch(ENGINE);
  });
});

describe("S-12 — 시가 평가는 새 검사가 없다", () => {
  it("시가 평가 · 양도시 기준시가 비움 → 기준시가 평가 문구가 뜨지 않는다", () => {
    const f = form([{ ...H, bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", standardPriceAtTransfer: "" }]);
    expect(issues(f).filter((i) => FE8.test(i.message))).toEqual([]);
  });
});

describe("R-4 — 시가 평가 · 1985 전 상속 상가: 담보 승이면 양도시 기준시가를 요구하지 않는다 (Q-2 a)", () => {
  const CB: A = {
    ...BG, ...INH1983, assetKind: "commercial_building", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000", publishedValueAtInheritance: "300000000",
    bgLendingDepositTotal: "0", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000", actualSalePrice: "",
    cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100", cbUnitPriceAtFirstOrAcq: "10000000", cbLandPricePerSqmAtAcq: "500000", cbLandPricePerSqmAtFirst: "700000",
    cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000", cbAcqBuildingStdBy164_5: true,
  };
  /** 담보평가 = 임대보증금 4.6억 + 담보 채무 5억 = 9.6억 > 시가 9.2억 */
  const COLL: A = { bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "", bgLendingDepositTotal: "460000000" };

  it("R4-1 담보 승 · 비움 → ⑧ 통과 · ⑫ 통과 · 세액 95,038,182 (4억·6억 입력과 같다)", async () => {
    expect((await route(form([{ ...CB, ...COLL }]))).tax).toBe(95_038_182);
    expect((await route(form([{ ...CB, ...COLL, standardPriceAtTransfer: "600000000" }]))).tax).toBe(95_038_182);
    const f = form([{ ...CB, ...COLL, standardPriceAtTransfer: "" }]);
    expect(issues(f)).toEqual([]);
    const r = await route(f);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(95_038_182);
  });

  it("R4-2 시가 승 · 비움 → 종전대로 ⑧·⑫가 막는다", async () => {
    const f = form([{ ...CB, bgMortgageDebtAmount: "460000000", standardPriceAtTransfer: "" }]);
    expect(issues(f).some((i) => i.field === "standardPriceAtTransfer" && CB3.test(i.message))).toBe(true);
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(r.text).toMatch(CB3);
  });

  it("R4-3 지분 1/2 · 담보 승 · 비움 → 막는다(단독 소유만 뺀다 — ⑧ `bgCollateralForcesStdAcq` 범위)", async () => {
    // 공유 소유(축 A)는 채무를 지분 인수분으로 넣는다 — 2.3억 + 2.5억 = 4.8억 > 시가 지분 몫 4.6억(담보 승)
    const share: A = { bgLendingDepositTotal: "230000000", bgMortgageDebtAmount: "250000000", bgMortgageSetAmount: "" };
    const f = form([{ ...CB, ...share, ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", standardPriceAtTransfer: "" }]);
    // ⑧은 지분 보유에서 담보 승을 취득가액 처리 범위 밖으로 막는다(`bgFractionalCollateralWin`) — 종전에는 「채무액이 증여가액 초과」라는 틀린 사유였다.
    expect(issues(f).some((i) => /지분 50%를 가진 자산에서 담보평가액/.test(i.message))).toBe(true);
    expect(issues(f).some((i) => /채무액\(480,000,000원\)이 증여가액/.test(i.message))).toBe(false);
    // ⑫는 지분이면 담보 승 제외를 하지 않는다(⑧ 범위와 같게) — 상가 ③ 가드가 그대로 막는다.
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(r.text).toMatch(CB3);
  });

  it("R4-3b 지분 1/2 · 물건 전체 기준으로 담보 승인 body(API 직접) → ⑫가 담보 승으로 보지 않고 막는다", async () => {
    // 채무 9.6억 > 물건 전체 시가 9.2억 — 지분을 보지 않고 계산하면 담보 승이 된다. ⑫는 지분이면 제외하지 않는다.
    const r = await route(form([{ ...CB, ...COLL, ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", standardPriceAtTransfer: "" }]));
    expect(r.status).toBe(400);
    expect(r.text).toMatch(CB3);
  });
});
