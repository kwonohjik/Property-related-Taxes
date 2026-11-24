/**
 * anchor U-5 — 비사업용 토지 판정 → 양도세 계산기 넘기기 (계획서 `nbl-judgment-menu.ui.plan.md` §7)
 *
 * H-1 넘긴 뒤 계산기 자산이 「판정 도움」 상태이고 계산기가 만드는 raw가 메뉴 raw와 같다(같은 사실 → 같은 판정 입력)
 * H-2 stale 키 목록 ⊇ 1주택 patch가 undefined로 두는 키 · H-3 남은 입력 목록대로 채우면 계산기 ⑧ 0~3단계 0건(+ 하나라도 빼면 막힌다)
 * H-4 이동 전 clearResult · H-5 router.push 대상
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

import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { NBL_HANDOFF_STALE_KEYS, openTransferWithNblFacts, toTransferFormPatchFromNbl } from "@/lib/calc/nbl-judgment-handoff";
import { nblHandoffRemainingInputs } from "@/lib/calc/nbl-judgment-handoff-remaining";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { buildNblJudgmentApiBody } from "@/lib/calc/non-business-land-judgment-api";
import { validateAllSteps } from "@/lib/calc/non-business-land-judgment-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { forceNblFacts } from "@/lib/stores/nbl-judgment-form.types";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { MENU_GRID, landForm } from "./_helpers/nbl-judgment-menu";

const router = { push: vi.fn() } as unknown as Parameters<typeof openTransferWithNblFacts>[1];

/** 메뉴가 묻지 않는 금액 칸은 비어 있다 — 메뉴 화면이 만드는 폼. */
function menuForm(asset: Partial<AssetForm>, form: Parameters<typeof landForm>[1] = {}): NblJudgmentFormData {
  const f = landForm(asset, form);
  return { ...f, contractTotalPrice: "", assets: [forceNblFacts({ ...f.assets[0], fixedAcquisitionPrice: "", actualSalePrice: "" })] } as NblJudgmentFormData;
}
const CO = { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2012-01-01", giftRegistryDate: "2022-06-01" };

const SCENARIOS: [string, Partial<AssetForm>, Parameters<typeof landForm>[1]][] = [
  ["매매 기타토지", {}, {}],
  ["상속 임야", { acquisitionCause: "inheritance", acquisitionDate: "2022-03-01", decedentAcquisitionDate: "1990-01-01", nblLandType: "forest", nblZoneType: "management" } as Partial<AssetForm>, {}],
  ["증여 기타토지", { acquisitionCause: "gift", acquisitionDate: "2020-01-01" }, {}],
  ["이월과세 기타토지", { acquisitionCause: "carryover_gift", acquisitionDate: "", carryover: CO as never } as Partial<AssetForm>, { transferDate: "2023-12-01" }],
  ["지분 50%(나머지 타인)", { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }, {}],
  ["주택 부수토지", { nblLandType: "housing_site", nblZoneType: "general_residential", nblHousingFootprint: "100", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "unchanged" } as Partial<AssetForm>, {}],
];

/** 남은 입력을 채운 계산기 폼 — 목록의 각 항목을 채우는 칸(총 양도가액은 폼 전역). */
const FILL: Record<string, (f: Record<string, unknown>, a: Record<string, unknown>) => void> = {
  "총 양도가액": (f, a) => { f.contractTotalPrice = "1000000000"; a.actualSalePrice = "1000000000"; },
  "취득가액": (_f, a) => { a.fixedAcquisitionPrice = "300000000"; },
  "상속개시일 평가액(상속세 신고가액)": (_f, a) => { a.publishedValueAtInheritance = "300000000"; },
  "증여 신고가액": (_f, a) => { a.fixedAcquisitionPrice = "300000000"; },
  "증여 당시 평가액": (_f, a) => { a.carryover = { ...(a.carryover as object), giftDateValuation: "800000000" }; },
  "증여자 취득가액(환산취득가를 쓰면 환산 방식)": (_f, a) => { a.carryover = { ...(a.carryover as object), donorAcquisitionPrice: "100000000" }; },
};

function calcForm(menu: NblJudgmentFormData, skip?: string): TransferFormLike {
  const f = { ...createDefaultTransferFormData(), ...toTransferFormPatchFromNbl(menu) } as unknown as TransferFormLike;
  const a = { ...f.assets[0] } as Record<string, unknown>;
  for (const item of nblHandoffRemainingInputs(menu)) if (item !== skip) FILL[item](f as unknown as Record<string, unknown>, a);
  f.assets = [a] as never;
  return f;
}
type TransferFormLike = ReturnType<typeof createDefaultTransferFormData>;
const calcIssues = (f: TransferFormLike) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));

beforeEach(() => {
  useCalcWizardStore.getState().reset();
  vi.mocked(router.push).mockClear();
});

describe("[H-1] 넘긴 뒤 계산기 자산 = 판정 도움 · 같은 raw", () => {
  it.each(SCENARIOS)("%s", async (_n, asset, form) => {
    const menu = menuForm(asset, form);
    expect(validateAllSteps(menu), "메뉴 ⑧ 통과 폼이어야 한다").toEqual([]);
    await openTransferWithNblFacts(menu, router);
    const calc = useCalcWizardStore.getState().formData;
    expect(calc.assets).toHaveLength(1);
    expect(calc.assets[0]).toMatchObject({ assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: true });
    // 계산기 ④가 만드는 raw = 메뉴 ④가 만드는 raw (사실이 그대로 넘어갔다)
    const menuRaw = buildNonBusinessLandRaw(menu.assets[0], menu.transferDate);
    expect(menuRaw).toBeDefined();
    expect(buildNonBusinessLandRaw(calc.assets[0], calc.transferDate)).toEqual(menuRaw);
    // 이월과세 칸이 함께 간다 — 메뉴 API 본문의 증여 등기접수일 = 계산기 폼의 그것
    expect(buildNblJudgmentApiBody(calc.assets[0], calc.transferDate)).toEqual(buildNblJudgmentApiBody(menu.assets[0], menu.transferDate));
  });

  it("MENU_GRID 전 행(⑧ 통과) — raw 동일", async () => {
    for (const row of MENU_GRID) {
      useCalcWizardStore.getState().reset();
      const menu = menuForm(row.asset, row.form);
      await openTransferWithNblFacts(menu, router);
      const calc = useCalcWizardStore.getState().formData;
      expect(buildNonBusinessLandRaw(calc.assets[0], calc.transferDate), row.id).toEqual(buildNonBusinessLandRaw(menu.assets[0], menu.transferDate));
    }
  });
});

describe("[H-2] stale 키 — 이전 물건의 계산기 전용 선택이 새 물건에 새지 않는다", () => {
  it("목록 ⊇ 1주택 patch가 undefined로 두는 키 (손 복제 드리프트 방지)", () => {
    const oneHouse = toTransferFormPatch(createInitialOneHouseJudgmentForm());
    const undefinedKeys = Object.entries(oneHouse).filter(([, v]) => v === undefined).map(([k]) => k);
    expect(undefinedKeys.length).toBeGreaterThan(0);
    for (const k of undefinedKeys) expect(NBL_HANDOFF_STALE_KEYS as readonly string[], k).toContain(k);
  });

  it("patch는 그 키를 늘 싣고(값 undefined) 얕은 병합 뒤 이전 값이 남지 않는다", async () => {
    const patch = toTransferFormPatchFromNbl(menuForm({}));
    for (const k of NBL_HANDOFF_STALE_KEYS) {
      expect(k in patch, k).toBe(true);
      expect((patch as Record<string, unknown>)[k], k).toBeUndefined();
    }
    useCalcWizardStore.getState().updateFormData({
      sourceJudgmentId: "old", sourceJudgmentInputHash: "h", sourceJudgmentMenu: "one_house", regionCode: "1168010100", assetSplitMode: "fractional",
      sellingHouseExclusion: { mortgageExecution: true } as never,
    } as never);
    await openTransferWithNblFacts(menuForm({}), router);
    const f = useCalcWizardStore.getState().formData as unknown as Record<string, unknown>;
    for (const k of NBL_HANDOFF_STALE_KEYS) expect(f[k], k).toBeUndefined();
  });
});

describe("[H-3] 남은 입력 목록 — 그대로 채우면 계산기 ⑧ 0건, 하나라도 빼면 막힌다", () => {
  it.each(SCENARIOS)("%s", (_n, asset, form) => {
    const menu = menuForm(asset, form);
    const items = nblHandoffRemainingInputs(menu);
    expect(items.length).toBeGreaterThan(0);
    expect(calcIssues(calcForm(menu)), "목록대로 채움").toEqual([]);
    // 아무것도 안 채우면 막힌다 · 항목 하나를 빼도 막힌다(목록에 빠진 항목이 없다는 반대 방향 증명)
    const before = calcIssues({ ...(createDefaultTransferFormData() as TransferFormLike), ...toTransferFormPatchFromNbl(menu) } as TransferFormLike);
    expect(before.length).toBeGreaterThan(0);
    for (const skip of items) expect(calcIssues(calcForm(menu, skip)).length, `${skip} 없이`).toBeGreaterThan(0);
  });

  it("취득원인별 목록", () => {
    expect(nblHandoffRemainingInputs(menuForm({}))).toEqual(["총 양도가액", "취득가액"]);
    expect(nblHandoffRemainingInputs(menuForm({ acquisitionCause: "inheritance" }))).toEqual(["총 양도가액", "상속개시일 평가액(상속세 신고가액)"]);
    expect(nblHandoffRemainingInputs(menuForm({ acquisitionCause: "gift" }))).toEqual(["총 양도가액", "증여 신고가액"]);
    expect(nblHandoffRemainingInputs(menuForm({ acquisitionCause: "carryover_gift" }))).toEqual(["총 양도가액", "증여 당시 평가액", "증여자 취득가액(환산취득가를 쓰면 환산 방식)"]);
  });
});

describe("[H-4/H-5] 이동 — 결과를 비우고 1단계로, 계산기 경로로", () => {
  it("이전 물건의 계산 결과를 비운다 · setStep(0) · router.push(/calc/transfer-tax)", async () => {
    useCalcWizardStore.setState({ result: { stale: true } as never, currentStep: 3 });
    await openTransferWithNblFacts(menuForm({}), router);
    const s = useCalcWizardStore.getState();
    expect(s.result).toBeNull();
    expect(s.currentStep).toBe(0);
    expect(router.push).toHaveBeenCalledWith("/calc/transfer-tax");
  });

  it("양도일 · 소재지 · 면적이 그대로 넘어간다", async () => {
    await openTransferWithNblFacts(menuForm({ addressJibun: "서울 강남구 테스트동 77", acquisitionArea: "321" }, { transferDate: "2024-07-15" }), router);
    const s = useCalcWizardStore.getState().formData;
    expect(s.transferDate).toBe("2024-07-15");
    expect(s.assets[0].addressJibun).toBe("서울 강남구 테스트동 77");
    expect(s.assets[0].acquisitionArea).toBe("321");
  });
});
