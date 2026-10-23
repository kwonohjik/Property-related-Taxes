/**
 * anchor — `selfBuiltHousingScope` 진리표 (⑤ 노출 · ⑧ 요구 · ④ 전송이 읽는 단일 술어) — Q-12 PR-2
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.4)
 *
 * 엔진 거울: `unreachableReason`(정적 거부) + `selfBuiltHousingGateOpen`(5년·시행일) + `splitActive`. 이 표가 엔진·⑫와 같은 집합임은
 * `self-built-housing-validate-parity.anchor.test.ts` 가 폼 → ⑧ → ④ → route 로 대조한다.
 */
import { describe, it, expect } from "vitest";
import { selfBuiltHousingScope } from "@/lib/calc/self-built-housing-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TD = "2026-03-01";
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2022-01-10",
    useEstimatedAcquisition: true,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: "2022-01-10",
    ...over,
  }) as AssetForm;
const scope = (over: Partial<AssetForm> = {}, td: string | undefined = TD, isNonPrimary = false) =>
  selfBuiltHousingScope(asset(over), { transferDate: td, isNonPrimary });

describe("범위 안", () => {
  it("환산 → 취득(가)·양도(나) 칸을 모두 받는다", () => {
    expect(scope()).toEqual({ method: "estimated", acq: true, sale: true, directAppraisal: false });
  });
  it("감정 → 기본은 건물 감정가액 직접 입력 · 「구분 표시 없음」이면 취득 당시 3칸(양도 칸 없음)", () => {
    const ap = { useEstimatedAcquisition: false, isAppraisalAcquisition: true };
    expect(scope(ap)).toEqual({ method: "appraisal", acq: false, sale: false, directAppraisal: true });
    expect(scope({ ...ap, selfBuiltAppraisalNoSplit: true })).toEqual({ method: "appraisal", acq: true, sale: false, directAppraisal: false });
  });
  it("함께 양도 자산(isNonPrimary)도 같은 범위", () => {
    expect(scope({}, TD, true)).not.toBeNull();
  });
});

describe("범위 밖 → null (칸 없음 · 요구 없음 · 미전송)", () => {
  it.each([
    ["본인 신축 토글 OFF", { isSelfBuilt: false }],
    ["증축(Q-4)", { buildingType: "extension" as const }],
    ["신축·증축 구분 미선택", { buildingType: "" as const }],
    ["완공일 미입력", { constructionDate: "" }],
    ["비주택(건물 단독)", { assetKind: "building" as const }],
    ["토지", { assetKind: "land" as const }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["부담부증여", { transferType: "burdened_gift" as const }],
    ["취득원인 상속", { acquisitionCause: "inheritance" as const }],
    ["실지거래가액", { useEstimatedAcquisition: false }],
    ["매매사례가액", { useEstimatedAcquisition: false, isSalesCaseAcquisition: true }],
    ["공익수용 특례", { transferCause: "public_expropriation" as const }],
    ["공매·경락 특례(영 §164⑨2호 — 주택도 대상)", { isAuctionTransfer: true }],
    ["토지·건물 취득일 분리", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-01-01" }],
    ["PHD(첫 자산)", { usePreHousingDisclosure: true }],
  ])("%s", (_n, over) => {
    expect(scope(over as Partial<AssetForm>)).toBeNull();
  });

  it("환산·감정 플래그가 함께 켜진 잔재는 ④가 싣는 방식을 따른다 — 첫 자산은 감정 우선, 함께 양도 자산은 환산 (엔진이 던지는 집합과 같아야 한다: PR-4)", () => {
    const both = { useEstimatedAcquisition: true, isAppraisalAcquisition: true };
    expect(scope(both)?.method).toBe("appraisal");
    expect(scope(both, TD, true)?.method).toBe("estimated");
    expect(scope(both, TD, true)).toEqual({ method: "estimated", acq: true, sale: true, directAppraisal: false });
    // 매매사례가 함께 켜지면 어느 자산이든 범위 밖(첫 자산 ④는 salesCase 로 싣고, 함께 양도는 ⑧ 이 차단한다)
    expect(scope({ ...both, isSalesCaseAcquisition: true })).toBeNull();
  });

  it("PHD 는 첫 자산에만 닿는다 — 함께 양도 자산의 PHD 잔재는 범위를 막지 않는다(컴패니언 ④는 PHD 를 싣지 않는다)", () => {
    expect(scope({ usePreHousingDisclosure: true }, TD, false)).toBeNull();
    expect(scope({ usePreHousingDisclosure: true }, TD, true)).not.toBeNull();
  });

  it("소유자 분리(건물만 소유)는 건물 파트가 이미 축 → null", () => {
    expect(scope({ selfOwns: "building_only" })).toBeNull();
  });

  it("양도일 미입력 → null", () => {
    expect(selfBuiltHousingScope(asset(), {})).toBeNull();
    expect(selfBuiltHousingScope(asset(), { transferDate: "" })).toBeNull();
  });
});

describe("게이트 경계 — 엔진 calculateBuildingPenalty 와 같은 날짜", () => {
  it("신축일부터 5년 되는 날 당일 포함 / 다음날 제외", () => {
    expect(scope({}, "2027-01-10")).not.toBeNull();
    expect(scope({}, "2027-01-11")).toBeNull();
  });
  it("윤년 2/29 신축 → 5년 되는 날 2025-02-28 포함 / 03-01 제외", () => {
    const leap = { acquisitionDate: "2020-02-29", constructionDate: "2020-02-29" };
    expect(scope(leap, "2025-02-28")).not.toBeNull();
    expect(scope(leap, "2025-03-01")).toBeNull();
  });
  it("환산은 양도일 ≥ 2018-01-01", () => {
    const c = { acquisitionDate: "2015-06-01", constructionDate: "2015-06-01" };
    expect(scope(c, "2017-12-31")).toBeNull();
    expect(scope(c, "2018-01-01")).not.toBeNull();
  });
  it("감정은 양도일 ≥ 2020-01-01", () => {
    const c = { acquisitionDate: "2016-06-01", constructionDate: "2016-06-01", useEstimatedAcquisition: false, isAppraisalAcquisition: true };
    expect(scope(c, "2019-12-31")).toBeNull();
    expect(scope(c, "2020-01-01")).not.toBeNull();
  });
});

describe("①②③ — 폼 상태 · 초기값 · 구 세션 복원", () => {
  it("신규 자산의 초기값 — 건물 감정가액은 빈 문자열, 「구분 표시 없음」은 꺼짐(직접 입력이 기본)", () => {
    const a = makeDefaultAsset(1);
    expect(a.selfBuiltBuildingAppraisal).toBe("");
    expect(a.selfBuiltAppraisalNoSplit).toBe(false);
  });

  it("구 sessionStorage 자산(두 키가 없다)을 복원하면 factory 기본값으로 채워진다(`fillMissingFromFactory` — 신규 필드마다 손으로 가드를 달지 않는다) — undefined 전송·controlled/uncontrolled 경고가 없다", () => {
    const legacy = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete legacy.selfBuiltBuildingAppraisal;
    delete legacy.selfBuiltAppraisalNoSplit;
    const restored = migrateAsset(legacy as never) as AssetForm;
    expect(restored.selfBuiltBuildingAppraisal).toBe("");
    expect(restored.selfBuiltAppraisalNoSplit).toBe(false);
  });

  it("저장된 값은 복원이 덮어쓰지 않는다", () => {
    const saved = { ...makeDefaultAsset(1), selfBuiltBuildingAppraisal: "110,000,000", selfBuiltAppraisalNoSplit: true };
    const restored = migrateAsset(saved as never) as AssetForm;
    expect(restored.selfBuiltBuildingAppraisal).toBe("110,000,000");
    expect(restored.selfBuiltAppraisalNoSplit).toBe(true);
  });
});
