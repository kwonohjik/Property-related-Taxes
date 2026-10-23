/**
 * anchor — 일체 주택 본인 신축 × §114조의2 base 건물분: ⑧ ↔ ④ ↔ ⑫ ↔ 엔진 정합 격자 (단건 · 함께 양도 · 다건) — Q-12 PR-2
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.7 ⑧↔⑫ 격자 · §9 PR-2)
 *
 * 규칙(`feedback_fe8_vs_12_parity_grid`): 같은 입력에서 **⑧ 차단 ⇒ route 400, ⑧ 통과 ⇒ route 200**. 한쪽만 막으면
 * 「UI 통과 → 400」(dead-end 역) 또는 「칸 없는 차단」이다. 범위 밖(숨은 입력)은 ⑧ 요구 없음 ∧ 미전송 ∧ 200.
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { allIssues, bundledForm, bundledProps, calc, sbForm, SB_APPRAISAL, type CalcOut } from "./_self-built-housing-fixture";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const OUR_FIELDS = new Set([
  "selfBuiltBuildingAppraisal",
  "standardPricePerSqmAtAcq",
  "acquisitionArea",
  "buildingStandardPriceAtAcq",
  "standardPricePerSqmAtTransfer",
  "transferArea",
  "buildingStandardPriceAtTransfer",
]);
const oursOf = (issues: CalcOut["issues"], assetIndex?: number) =>
  issues.filter((i) => OUR_FIELDS.has(i.field ?? "") && (assetIndex === undefined || i.assetIndex === assetIndex));
const blank = (...keys: (keyof AssetForm)[]) => Object.fromEntries(keys.map((k) => [k, ""])) as Partial<AssetForm>;

const AP_DIRECT = { ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "110000000" } as Partial<AssetForm>;
const AP_NOSPLIT = { ...SB_APPRAISAL, selfBuiltAppraisalNoSplit: true } as Partial<AssetForm>;

/** [이름, 자산 변주, 폼 변주] — 필수 칸을 하나씩 비운다 → ⑧ 차단 ∧ route 400 */
const MISSING: [string, Partial<AssetForm>, Record<string, unknown>?][] = [
  ["환산 · 취득 ㎡당 공시지가", blank("standardPricePerSqmAtAcq")],
  ["환산 · 토지 면적(취득=양도)", blank("acquisitionArea", "transferArea")],
  ["환산 · 취득 건물 기준시가", blank("buildingStandardPriceAtAcq")],
  ["환산 · 양도 ㎡당 공시지가", blank("standardPricePerSqmAtTransfer")],
  ["환산 · 양도 건물 기준시가", blank("buildingStandardPriceAtTransfer")],
  ["감정 직접 · 건물 감정가액", { ...AP_DIRECT, selfBuiltBuildingAppraisal: "" }],
  ["감정 직접 · 총액 초과", { ...AP_DIRECT, selfBuiltBuildingAppraisal: "300000001" }],
  ["감정 구분 표시 없음 · 취득 ㎡당 공시지가", { ...AP_NOSPLIT, ...blank("standardPricePerSqmAtAcq") }],
  ["감정 구분 표시 없음 · 면적", { ...AP_NOSPLIT, ...blank("acquisitionArea", "transferArea") }],
  ["감정 구분 표시 없음 · 건물 기준시가", { ...AP_NOSPLIT, ...blank("buildingStandardPriceAtAcq") }],
];

/** 모든 칸이 차 있는 통과 셀 — ⑧ 통과 ∧ route 200 ∧ 키 실림 */
const FILLED: [string, Partial<AssetForm>, Record<string, unknown>?][] = [
  ["환산", {}],
  ["환산 · 구분 기재", { saleSplitMode: "actual", landTransferPrice: "700000000", buildingTransferPrice: "300000000" }],
  ["환산 · 구분 기재 한쪽만(건물)", { saleSplitMode: "actual", buildingTransferPrice: "300000000" }],
  ["환산 · 감정평가 안분", { saleSplitMode: "appraisal", landAppraisalAtTransfer: "700000000", buildingAppraisalAtTransfer: "300000000" }],
  ["환산 · 지분 50%", { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }],
  ["환산 · 양도차손", { capitalExpenditure: "1200000000" }],
  ["환산 · 일부 양도", { areaScenario: "partial", acquisitionArea: "100", transferArea: "50", actualSalePrice: "500000000" }, { contractTotalPrice: "500000000" }],
  ["감정 직접", AP_DIRECT],
  ["감정 직접 · 지분 50%", { ...AP_DIRECT, ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }],
  ["감정 구분 표시 없음", AP_NOSPLIT],
];

/** 범위 밖 — 숨은 입력(칸은 채워 둔 stale)이라 ⑧ 요구 없음 ∧ 키 미전송 ∧ route 200 */
const HIDDEN: [string, Partial<AssetForm>, Record<string, unknown>?][] = [
  ["실지거래가액", { useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" }],
  ["5년 경과", {}, { transferDate: "2027-01-11" }],
  ["본인 신축 토글 OFF", { isSelfBuilt: false }],
];

/** 범위 밖이지만 route 가 다른 이유로 입력을 요구하는 조합(겸용 서브객체·수용 보상액) — 키 미전송 ∧ ⑧ 요구 없음만 대조 */
const HIDDEN_OTHER_REQUIREMENTS: [string, Partial<AssetForm>][] = [
  ["겸용주택", { isMixedUseHouse: true }],
  ["공익수용 특례(영 §164⑨ — 엔진이 결합을 거부)", { transferCause: "public_expropriation" }],
  ["공매·경락 특례(영 §164⑨2호 — 환산 분모가 바뀐다)", { isAuctionTransfer: true }],
  ["PHD(첫 자산 — 건물 파트가 이미 축)", { usePreHousingDisclosure: true }],
  ["소유자 분리(건물만 소유 — 건물 파트가 이미 축)", { selfOwns: "building_only" }],
  ["토지·건물 취득일 분리(건물 파트가 이미 축)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01" }],
];

describe("단건 — ⑧ ↔ ④ ↔ ⑫ 격자", () => {
  it.each(MISSING)("빈 칸 %s → ⑧ 차단 ∧ route 400", async (_n, over, formOver) => {
    const r = await calc(sbForm(over, formOver as never));
    expect(oursOf(r.issues).length, "⑧").toBeGreaterThan(0);
    expect(r.status, JSON.stringify((r.json as { error?: unknown }).error)).toBe(400);
  });

  it.each(FILLED)("채움 %s → ⑧ 통과 ∧ 키 실림 ∧ route 200", async (_n, over, formOver) => {
    const r = await calc(sbForm(over, formOver as never));
    expect(r.issues, "⑧").toEqual([]);
    expect(r.body.selfBuiltHousing).toBeDefined();
    expect(r.status, JSON.stringify((r.json as { error?: unknown }).error)).toBe(200);
    expect(r.result?.selfBuiltHousingPenalty).toBeDefined();
  });

  it.each(HIDDEN_OTHER_REQUIREMENTS)("숨김 %s → ⑧ 요구 없음 ∧ 키 없음", async (_n, over) => {
    const r = await calc(sbForm(over));
    expect(oursOf(r.issues)).toEqual([]);
    expect(r.body.selfBuiltHousing).toBeUndefined();
  });

  it("감정 직접 입력은 보이는 칸이 건물 감정가액 하나뿐 — L·N 이 비어 있어도 요구하지 않고 와이어는 그 한 값(토글 전환 잔재가 새지 않는다)", async () => {
    const r = await calc(sbForm({ ...AP_DIRECT, ...blank("standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq", "standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer") }));
    expect(oursOf(r.issues)).toEqual([]);
    expect(r.body.selfBuiltHousing).toEqual({ buildingAppraisalValue: 110_000_000 });
    expect(r.status).toBe(200);
  });

  it("감정 「구분 표시 없음」은 건물 감정가액 칸이 숨는다 — 비어 있어도 요구하지 않고 와이어에 싣지 않는다", async () => {
    const r = await calc(sbForm({ ...AP_NOSPLIT, selfBuiltBuildingAppraisal: "" }));
    expect(oursOf(r.issues)).toEqual([]);
    expect(r.body.selfBuiltHousing).toEqual({ landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 });
    expect(r.status).toBe(200);
  });

  it("일부 양도에서 양도분 면적(transferArea)을 비우면 ⑧ 이 그 칸으로 막는다 — 화면에 있는 칸이며, ④는 전체 면적(acquisitionArea)으로 L_T 를 보내 route 는 통과한다(⑧ 이 더 엄격한 방향)", async () => {
    const r = await calc(sbForm({ areaScenario: "partial", acquisitionArea: "100", transferArea: "", actualSalePrice: "500000000" }, { contractTotalPrice: "500000000" }));
    expect(oursOf(r.issues)[0]?.field).toBe("transferArea");
    expect(r.status).toBe(200);
  });

  it.each(HIDDEN)("숨김 %s → ⑧ 요구 없음 ∧ 키 없음 ∧ route 200", async (_n, over, formOver) => {
    const r = await calc(sbForm(over, formOver as never));
    expect(oursOf(r.issues)).toEqual([]);
    expect(r.body.selfBuiltHousing).toBeUndefined();
    expect(r.status, JSON.stringify((r.json as { error?: unknown }).error)).toBe(200);
    expect(r.result?.selfBuiltHousingPenalty).toBeUndefined();
  });
});

describe("함께 양도(컴패니언) — 두 번째 자산 카드도 같은 술어", () => {
  const second = (r: CalcOut) => bundledProps(r.json)[1];

  it("채움 → ⑧ 통과 ∧ companionAssets[0].selfBuiltHousing ∧ 건물분 base(37,499,999 · 1,874,999)", async () => {
    const r = await calc(bundledForm());
    expect(oursOf(r.issues, 1)).toEqual([]);
    const c = (r.body.companionAssets as Record<string, unknown>[])[0];
    expect(c.selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 600_000_000,
      buildingStdPriceAtTransfer: 400_000_000,
    });
    expect(r.status).toBe(200);
    expect(second(r)).toMatchObject({ penaltyBase: 37_499_999, penaltyTax: 1_874_999 });
    expect(bundledProps(r.json)[0].penaltyTax).toBe(0);
  });

  it.each([
    ["취득 ㎡당 공시지가", blank("standardPricePerSqmAtAcq"), "standardPricePerSqmAtAcq"],
    ["취득 건물 기준시가", blank("buildingStandardPriceAtAcq"), "buildingStandardPriceAtAcq"],
    ["양도 건물 기준시가", blank("buildingStandardPriceAtTransfer"), "buildingStandardPriceAtTransfer"],
  ])("빈 칸 %s → ⑧ 이 두 번째 자산(assetIndex 1)에서 막고 route 400", async (_n, over, field) => {
    const r = await calc(bundledForm(over));
    const hit = oursOf(r.issues, 1);
    expect(hit[0]?.field).toBe(field);
    expect(r.status).toBe(400);
  });

  it("감정 직접 1.1억 · 지분 카드 50%는 감정가액과 같은 지분 스케일(5,500만) — 와이어·⑧·route 일치", async () => {
    const r = await calc(
      bundledForm({ ...SB_APPRAISAL, useEstimatedAcquisition: false, selfBuiltBuildingAppraisal: "110000000", ownershipNumerator: "50" }),
    );
    expect(oursOf(r.issues, 1)).toEqual([]);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].selfBuiltHousing).toEqual({ buildingAppraisalValue: 55_000_000 });
    expect(r.status).toBe(200);
  });

  it("PHD 플래그 잔재가 있는 함께 양도 자산도 ⑧ 이 칸을 요구한다(첫 자산이 아니라 PHD 가 축이 아니다) — 빈 칸 → 두 번째 자산에서 차단 ∧ route 400", async () => {
    const r = await calc(bundledForm({ usePreHousingDisclosure: true, ...blank("buildingStandardPriceAtAcq") }));
    expect(oursOf(r.issues, 1)[0]?.field).toBe("buildingStandardPriceAtAcq");
    expect(r.status).toBe(400);
  });

  it("PHD 플래그 잔재가 있는 함께 양도 자산은 범위 안이다 — PHD 는 첫 자산에만 닿고 컴패니언 ④는 싣지 않는다(키 실림 ∧ 200)", async () => {
    const r = await calc(bundledForm({ usePreHousingDisclosure: true }));
    expect(oursOf(r.issues, 1)).toEqual([]);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].selfBuiltHousing).toBeDefined();
    expect(r.status).toBe(200);
  });

  it("지분 카드(50%)는 양도가액·기준시가 중 구분 기재만 지분 스케일 — 안분 모드는 기준시가 그대로(와이어 L_T 6억)", async () => {
    const r = await calc(bundledForm({ ownershipNumerator: "50" }));
    expect((r.body.companionAssets as Record<string, unknown>[])[0].selfBuiltHousing).toMatchObject({ landStdPriceAtTransfer: 600_000_000 });
  });

  it.each([
    ["5년 경과", {}, { transferDate: "2026-06-02" }],
    ["실지거래가액", { useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" }, {}],
    ["본인 신축 아님", { isSelfBuilt: false }, {}],
  ])("숨김 %s → ⑧ 요구 없음 ∧ 키 없음 ∧ 200", async (_n, over, formOver) => {
    const f = { ...bundledForm(over), ...formOver } as ReturnType<typeof bundledForm>;
    const r = await calc(f);
    expect(oursOf(r.issues, 1)).toEqual([]);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].selfBuiltHousing).toBeUndefined();
    expect(r.status).toBe(200);
  });
});

describe("다건 합산 — 건별 ④·⑧·⑫", () => {
  it("채움 → properties[0].selfBuiltHousing ∧ 건물분 base 187,500,000", async () => {
    const f = sbForm();
    expect(oursOf(allIssues(f))).toEqual([]);
    const body = await buildMultiBody([f]);
    const p0 = (body.properties as Record<string, unknown>[])[0];
    expect(p0.selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 240_000_000,
      buildingStdPriceAtTransfer: 160_000_000,
    });
    const res = await postMulti(body);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.props[0]).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000 });
  });

  it("빈 칸 → ⑧ 차단 ∧ route 400", async () => {
    const f = sbForm(blank("buildingStandardPriceAtAcq"));
    expect(oursOf(allIssues(f))[0]?.field).toBe("buildingStandardPriceAtAcq");
    const res = await postMulti(await buildMultiBody([f]));
    expect(res.status).toBe(400);
  });

  it("지분 50% — 구분 기재 양도가액만 지분 스케일(7억 → 3.5억, 3억 → 1.5억) · 기준시가는 그대로 → route 200", async () => {
    const f = sbForm({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", saleSplitMode: "actual", landTransferPrice: "700000000", buildingTransferPrice: "300000000" });
    const body = await buildMultiBody([f]);
    const sb = (body.properties as Record<string, unknown>[])[0].selfBuiltHousing as Record<string, unknown>;
    expect(sb.sale).toEqual({ landTransferPrice: 350_000_000, buildingTransferPrice: 150_000_000 });
    expect(sb.landStdPriceAtTransfer).toBe(240_000_000);
    expect((await postMulti(body)).status).toBe(200);
  });

  it("숨김(5년 경과) → 키 없음 ∧ 200", async () => {
    const f = sbForm({}, { transferDate: "2027-01-11" });
    const body = await buildMultiBody([f]);
    expect((body.properties as Record<string, unknown>[])[0].selfBuiltHousing).toBeUndefined();
    expect((await postMulti(body)).status).toBe(200);
  });
});
