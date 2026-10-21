/**
 * 주택 split 파트 이월과세 P4 B(건물만 이월과세 §97의2① + 토지 매매) — ⑧≡⑫ 격자 + ④ body 계약 (2026-10-21)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §5 · engine.design.md §1.2(B 행)·§6
 * 형식은 A·C 격자와 같다 — 폼 → ④ body → ⑫ route, 같은 폼의 ⑧(단계 0·1)을 나란히. 기대의 정본은 엔진 leaf가 ⑫ 400으로 내는 칸이다.
 *
 * 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) leaf 소관 ⑧ 차단 ⇔ ⑫ 400 · (C) ⑧ 전용 사유는 ⑧ 차단 · (D) 화면에 없는 잔재는 세액을 바꾸지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
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
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { effectiveBuildingCarryoverMix, effectiveBuildingCauseMix, effectiveCarryoverDonorSplit } from "@/lib/calc/transfer-land-part-cause";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { carryoverResidenceJudgmentDate } from "@/lib/calc/transfer-tax-api-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf } from "./_helpers/split-carryover-c-form";
import { bAsset, bForm, withBuildingCarry, B_CARRYOVER } from "./_helpers/split-carryover-b-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Cell = { name: string; make: () => TransferFormData; leafKey?: string; strictOnly?: boolean; bothWays?: boolean };

const companion = (): AssetForm =>
  ({
    ...makeDefaultAsset(2),
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "400,000,000",
  }) as unknown as AssetForm;

const CELLS: Cell[] = [
  // ── leaf 소관 ──
  { name: "S9 1세대1주택 해당(주택)", make: () => bForm({ isOneHousehold: true }), leafKey: "isOneHousehold" },
  { name: "S9 아님: 1세대 + 미등기", make: () => bForm({ isOneHousehold: true, isUnregistered: true }) },
  { name: "F-6 건물 증여자 취득일 > 증여일", make: () => bForm({}, withBuildingCarry({ donorAcquisitionDate: "2023-03-02" })), leafKey: "buildingCarryoverPart.donorAcquisitionDate" },
  { name: "증여자 취득일 = 증여일(허용)", make: () => bForm({}, withBuildingCarry({ donorAcquisitionDate: "2023-03-01" })) },
  { name: "평가액 > 과세가액", make: () => bForm({}, withBuildingCarry({ giftTaxBase: "390,000,000" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "과세가액 비움", make: () => bForm({}, withBuildingCarry({ giftTaxBase: "" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "산출세액 비움(0 허용)", make: () => bForm({}, withBuildingCarry({ giftTaxCalculated: "" })) },
  { name: "증여자 취득가액 비움", make: () => bForm({}, withBuildingCarry({ donorAcquisitionPrice: "" })), leafKey: "buildingCarryoverPart.donorAcquisitionPrice" },
  { name: "증여자 취득일 비움", make: () => bForm({}, withBuildingCarry({ donorAcquisitionDate: "" })), leafKey: "buildingCarryoverPart.donorAcquisitionDate" },
  { name: "건물 증여 신고가액 비움(S7)", make: () => bForm({}, bAsset({ buildingAcquisitionPrice: "" })), leafKey: "buildingAcquisitionPrice" },
  { name: "토지 취득가액 비움(실거래가)", make: () => bForm({}, bAsset({ landAcquisitionPrice: "" })), leafKey: "landAcquisitionPrice" },
  { name: "토지 취득일 비움", make: () => bForm({}, bAsset({ landAcquisitionDate: "" })), bothWays: true },
  { name: "증여 등기접수일 비움", make: () => bForm({}, withBuildingCarry({ giftRegistryDate: "" })), bothWays: true },
  { name: "구조: 소유자 분리(건물만 소유)", make: () => bForm({}, bAsset({ selfOwns: "building_only" })), bothWays: true },
  // ── ⑧ 전용(⑫보다 엄격) ──
  { name: "토지 취득일 = 건물 증여일(Q-4 같은 날)", make: () => bForm({}, bAsset({ landAcquisitionDate: "2023-03-01" })), strictOnly: true },
  { name: "고시 전 증여(2005.4.30. 전 — 비교 입력 없음)", make: () => bForm({ transferDate: "2010-03-31" }, withBuildingCarry({ giftRegistryDate: "2005-04-29", donorAcquisitionDate: "2000-01-01" }, { landAcquisitionDate: "1999-01-01" })), strictOnly: true },
  { name: "등기접수일 ≥ 양도일", make: () => bForm({}, withBuildingCarry({ giftRegistryDate: "2025-06-30" })), strictOnly: true },
  { name: "관계 그 외", make: () => bForm({}, withBuildingCarry({ donorRelation: "other" })), strictOnly: true },
  { name: "사망 선언 + 관계 미선택", make: () => bForm({}, withBuildingCarry({ donorDeceased: true, donorRelation: "" })), strictOnly: true },
  { name: "가업상속 선언", make: () => bForm({}, withBuildingCarry({ exclusionDeclared: { ...CARRYOVER_DEFAULTS.exclusionDeclared, isFamilyBusinessInheritedAsset: true } })), strictOnly: true },
  { name: "보이는 이전 형식 필요경비(directExpenses)", make: () => bForm({}, bAsset({ directExpenses: "5,000,000" })), strictOnly: true },
  { name: "축 A: 구분양도인데 양도가액·기준시가 근거 없음", make: () => bForm({}, bAsset({ landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" })), strictOnly: true },
  // ── 잔재(D) — 통과하고 세액이 기준과 같아야 한다 ──
  { name: "잔재: 건물 취득일 칸 옛 값(등기접수일과 다름)", make: () => bForm({}, bAsset({ acquisitionDate: "2010-01-01" })) },
  { name: "잔재: 건물 방식 라디오 estimated", make: () => bForm({}, bAsset({ buildingAcqMode: "estimated" })) },
  { name: "잔재: PHD 자동 ON", make: () => bForm({}, bAsset({ usePreHousingDisclosure: true })) },
  { name: "잔재: C 토글 저장값 ON", make: () => bForm({}, bAsset({ carryoverDonorSplit: true })) },
  { name: "잔재: 자산 단위 환산·평가액(전체 이월과세 칸)", make: () => bForm({}, withBuildingCarry({ useEstimatedAcquisition: true, estimationMode: "general", giftDateValuation: "900,000,000" })) },
  { name: "잔재: 세대 사실 답(전체 이월과세 칸)", make: () => bForm({}, withBuildingCarry({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2015-06-01" })) },
];

describe("P4 B — ⑧≡⑫ 격자", () => {
  const baseTax = (async () => (await routeOf(POST, await bodyOf(bForm()))).json?.data?.result?.determinedTax as number)();

  it("기준 셀: ⑧ 통과 · ④ 사건 + 건물 파트만 · 토지 overlay purchase · 건물 취득일 = 증여 등기접수일 · ⑫ 200 · 결정세액 261,210,000(엔진 anchor SPCO-T5)", async () => {
    const form = bForm();
    expect(issuesOf(form)).toEqual([]);
    const body = await bodyOf(form);
    expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 400_000_000, donorRelation: "lineal" });
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 100_000_000 });
    expect("landCarryoverPart" in body).toBe(false);
    expect(body.landAcquisitionCause).toBe("purchase");
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.acquisitionDate).toBe("2023-03-01");
    expect(body.landAcquisitionDate).toBe("2008-01-01");
    expect(body.isSeparateAcquisition).toBe(true);
    expect(body.buildingAcqMode).toBe("actual");
    expect(body.landAcquisitionPrice).toBe(120_000_000);
    expect(body.buildingAcquisitionPrice).toBe(400_000_000);
    expect("carryoverTaxation" in body).toBe(false);
    expect(body.expenses).toBe(0);
    const r = await routeOf(POST, body);
    expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
    expect(r.json.data.result.determinedTax).toBe(261_210_000);
    expect(r.json.data.result.splitDetail.building.carryover.judgment).toBe("applied");
    expect(r.json.data.result.splitDetail.land.carryover).toBeUndefined();
  });

  for (const cell of CELLS) {
    it(cell.name, async () => {
      const form = cell.make();
      const issues = issuesOf(form);
      const r = await routeOf(POST, await bodyOf(form));
      const keys = Object.keys(r.fieldErrors);
      const blocked8 = issues.length > 0;
      if (!blocked8) expect(r.status, `⑧ 통과인데 ⑫ ${r.status} ${JSON.stringify(r.fieldErrors)}`).toBe(200);
      if (cell.leafKey) {
        expect(blocked8, `⑧ 차단 기대(${cell.leafKey})`).toBe(true);
        expect(keys.some((k) => k.includes(cell.leafKey!)), `⑫ 칸 ${cell.leafKey} ← ${JSON.stringify(keys)}`).toBe(true);
      }
      if (cell.bothWays) expect(blocked8, `⑧ ${JSON.stringify(issues.map((i) => i.field))} ↔ ⑫ ${r.status}`).toBe(r.status === 400);
      if (cell.strictOnly) expect(blocked8).toBe(true);
      if (cell.name.startsWith("잔재:")) {
        expect(blocked8, JSON.stringify(issues)).toBe(false);
        expect(r.json.data.result.determinedTax).toBe(await baseTax);
      }
    });
  }

  it("⑧ 앵커 — 화면 칸으로 이동: 사건·건물 파트는 carryover.*, 토지 칸은 그 칸, 구조(소유자 분리)는 «토지는 다른 원인으로 취득» 토글", () => {
    const field = (f: TransferFormData) => issuesOf(f)[0]?.field;
    expect(field(bForm({}, withBuildingCarry({ giftRegistryDate: "" })))).toBe("carryover.giftRegistryDate");
    expect(field(bForm({}, withBuildingCarry({ donorAcquisitionDate: "" })))).toBe("carryover.donorAcquisitionDate");
    expect(field(bForm({}, withBuildingCarry({ donorAcquisitionPrice: "" })))).toBe("carryover.donorAcquisitionPrice");
    expect(field(bForm({}, withBuildingCarry({ giftTaxBase: "" })))).toBe("carryover.giftTaxBase");
    expect(field(bForm({}, withBuildingCarry({ donorDeceased: true, donorRelation: "" })))).toBe("carryover.donorRelation");
    expect(field(bForm({}, withBuildingCarry({ donorRelation: "other" })))).toBe("acquisitionCause");
    expect(field(bForm({}, bAsset({ buildingAcquisitionPrice: "" })))).toBe("buildingAcquisitionPrice");
    expect(field(bForm({}, bAsset({ landAcquisitionDate: "" })))).toBe("landAcquisitionDate");
    expect(field(bForm({}, bAsset({ landAcquisitionDate: "2023-03-01" })))).toBe("landAcquisitionDate");
    expect(field(bForm({}, bAsset({ selfOwns: "building_only" })))).toBe("landAcquisitionCause");
    const pre = issuesOf(bForm({ transferDate: "2010-03-31" }, withBuildingCarry({ giftRegistryDate: "2005-04-29", donorAcquisitionDate: "2000-01-01" }, { landAcquisitionDate: "1999-01-01" })))[0];
    expect(pre?.field).toBe("carryover.giftRegistryDate");
    expect(pre?.message).toContain("2005.4.30. 전이면 «건물만 이월과세 + 토지 매수»");
    // 경계 짝 — 2005-04-30 증여는 막지 않는다
    expect(issuesOf(bForm({ transferDate: "2010-03-31" }, withBuildingCarry({ giftRegistryDate: "2005-04-30", donorAcquisitionDate: "2000-01-01" }, { landAcquisitionDate: "1999-01-01" }))).map((i) => i.message).join()).not.toContain("2005.4.30. 전이면");
  });

  it("S9 — 보유 상황 단계(1)에서 막고 자산 단계(0)는 통과: 앵커 isOneHousehold · 끄는 방법은 «토지는 다른 원인으로 취득»", () => {
    const form = bForm({ isOneHousehold: true });
    expect(collectStepIssues(0, form)).toEqual([]);
    const s1 = collectStepIssues(1, form).find((i) => i.field === "isOneHousehold");
    expect(s1?.message).toContain("토지는 다른 원인으로 취득");
  });

  it("S2′ 함께 양도 자산 1건 — 첫 자산 B를 ⑧·⑫가 같이 막는다", async () => {
    const form = bForm({ assets: [bAsset(), companion()], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
    expect(issuesOf(form).length).toBeGreaterThan(0);
    const r = await routeOf(POST, await bodyOf(form));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).some((k) => k.includes("buildingCarryoverPart"))).toBe(true);
  });

  it("두 번째 자산(컴패니언)의 B — ⑧이 맨 앞에서 막고(입력을 다 채우기 전) ④는 그 자산의 파트 키를 싣지 않는다", async () => {
    const form = bForm({ assets: [companion(), bAsset({ assetId: "a2" })], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
    const empty = bForm({ assets: [companion(), withBuildingCarry({ giftRegistryDate: "", donorAcquisitionDate: "" })], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
    for (const f of [form, empty]) {
      const i = issuesOf(f).find((x) => x.field === "landAcquisitionCause");
      expect(i?.message).toContain("함께 양도 2번째 이후 자산");
    }
    const body = await bodyOf(form);
    expect(JSON.stringify(body.companionAssets ?? [])).not.toContain("buildingCarryoverPart");
    expect("buildingCarryoverPart" in body).toBe(false);
  });

  it("다건 — ⑧ 지원 모드 아님(단건 전용 문구) · 우회 시 multi route가 400(strip 금지)", async () => {
    expect(validateMultiSupportedMode(bForm() as never)).toBe(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE);
    const payload = buildPropertyPayload(bForm() as never) as Record<string, unknown>;
    expect(payload.buildingCarryoverPart).toBeTruthy();
    const res = await POST_MULTI(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...JSON.parse(JSON.stringify(payload)) }], annualBasicDeductionUsed: 0 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("숨은 이전 형식 필요경비(양도비 입력으로 칸이 숨음) — ⑧ 통과 · ④ expenses 0 · 양도비만 입력한 것과 세액 동일(엔진 S8)", async () => {
    const hidden = bForm({}, bAsset({ directExpenses: "5,000,000", transferExpense: "1,000,000" }));
    const ref = bForm({}, bAsset({ transferExpense: "1,000,000" }));
    expect(issuesOf(hidden)).toEqual([]);
    const b = await bodyOf(hidden);
    expect(b.expenses).toBe(0);
    const [rh, rr] = [await routeOf(POST, b), await routeOf(POST, await bodyOf(ref))];
    expect(rh.status, JSON.stringify(rh.fieldErrors)).toBe(200);
    expect(rh.json.data.result.determinedTax).toBe(rr.json.data.result.determinedTax);
  });

  it("토지 환산 방식 — 토지는 매매라 4방식을 쓸 수 있다(⑧ 통과 ⇒ ⑫ 200)", async () => {
    const form = bForm({}, bAsset({ landAcqMode: "estimated", landAcquisitionPrice: "", landStandardPriceAtAcq: "300,000,000", standardPricePerSqmAtAcq: "1000000", acquisitionArea: "100" }));
    const issues = issuesOf(form);
    const r = await routeOf(POST, await bodyOf(form));
    expect(issues, "B의 토지 환산 셀은 ⑧을 통과해야 한다(토지는 매매)").toEqual([]);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  });

  it("부정형 짝 — 토글 OFF·호스트 불일치·overlay 비움이면 B 키를 하나도 싣지 않고 자산 전체 이월과세로 읽는다(값은 보존)", async () => {
    for (const patch of [
      { landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false },
      { landCauseHost: "" },
      { landAcquisitionCause: "" },
      { transferType: "burdened_gift" },
    ]) {
      const asset = bAsset(patch);
      expect(effectiveBuildingCarryoverMix(asset), JSON.stringify(patch)).toBe(false);
      const body = await bodyOf(bForm({}, asset));
      expect("carryoverGiftEvent" in body, JSON.stringify(patch)).toBe(false);
      expect("buildingCarryoverPart" in body, JSON.stringify(patch)).toBe(false);
      expect(asset.carryover).toEqual(B_CARRYOVER);
    }
  });

  it("술어 분리 — B는 D2 술어를 켜지 않고(상속·증여 고유 소비처 무영향), B가 켜지면 C 저장값은 잔재다", () => {
    expect(effectiveBuildingCauseMix(bAsset())).toBe("");
    expect(effectiveCarryoverDonorSplit(bAsset({ carryoverDonorSplit: true }))).toBe(false);
    // 긍정 짝 — B를 끄면 같은 C 저장값이 되살아난다
    expect(effectiveCarryoverDonorSplit(bAsset({ carryoverDonorSplit: true, landCauseHost: "" }))).toBe(true);
    // 별개 취득 판정: 화면 건물 취득일 칸이 비어도(읽기 전용) 정규화가 등기접수일로 덮는다
    expect(isSeparateAcquisition(bAsset({ acquisitionDate: "" }))).toBe(true);
  });
});

describe("Step4 «취득 당시» 기준일 — B는 세대 사실을 묻지 않는다", () => {
  it("남은 «계속 같은 세대» 답·세대 보유 시작일이 있어도 기준일 = 증여 등기접수일 · 긍정 짝: 자산 전체 이월과세면 세대 보유 시작일", () => {
    const residue = { donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2016-01-01" };
    expect(carryoverResidenceJudgmentDate(withBuildingCarry(residue))).toBe("2023-03-01");
    expect(carryoverResidenceJudgmentDate(withBuildingCarry(residue, { landCauseHost: "", hasSeperateLandAcquisitionDate: false }))).toBe("2016-01-01");
  });
});

