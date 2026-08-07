/**
 * post-deemed 상속 — ①(상증법 평가액) 또는 ②(§164⑤~⑦) **필수화**.
 *
 * 「상속세 및 증여세법」 §60③: "시가를 산정하기 **어려운 경우에는** … 제61조부터 제65조까지에
 * 규정된 방법으로 평가한 가액을 시가로 **본다**" ⇒ **평가액이 「없는」 상태는 법적으로 성립하지
 * 않는다**. 따라서 법 §97①1호 단서의 「가목의 실지거래가액을 확인할 수 없는 경우」에 해당하지
 * 않고, **나목(환산)에 도달하지 않는다**.
 *
 * ⇒ pre-deemed의 E-1과 갈린다 — 거기는 ③(나목)이 있어 「확인 불가 선언 → ③」이 성립하지만,
 *   **post-deemed는 갈 곳이 없어 「필수 입력」**이다. 선언은 여기서 효력이 없다(P-14).
 *
 * ⚠️ 종전에는 **주택·토지·건물**이 통과해 취득가액 0으로 계산됐다(양도차익 = 양도가액 전액).
 *    상가는 이미 같은 규칙으로 막고 있었다 — 그 게이트를 3종에 넓히는 것이 전부다.
 *
 * 설계: docs/02-design/features/post-deemed-clause-a-required.plan.md §5
 */
import { describe, expect, it } from "vitest";

import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const L = "자산 1";
const V = (a: AssetForm) => validateAssetAcquisition(a, L);

/** 상가·본 게이트가 공유하는 메시지 — 같은 규칙이므로 문구도 같다. */
const CLAUSE_A_REQUIRED = /상속개시일 평가액\(상속세 신고가액\)을 입력하세요/;

/**
 * 주택 §164⑤~⑦ **5필수** — post-deemed(1998)는 개별주택가격 최초고시(2005-04-30) 前이라 대상이다.
 * 기준일이 1990.8.30. 後라 「취득당시 개별공시지가」 단독으로 두 번째 그룹이 충족된다
 * (`sec164HouseStatus` — 1990 前이면 토지등급 4종과 택일).
 */
const HOUSE_5 = {
  inhHouseValLandArea: "84.5",
  inhHouseValLandPricePerSqmAtTransfer: "500000",
  inhHouseValLandPricePerSqmAtFirst: "300000",
  inhHouseValHousePriceAtFirst: "80000000",
  inhHouseValLandPricePerSqmAtInheritance: "250000",
};

function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    acquisitionCause: "inheritance",
    acquisitionDate: "1998-07-01", // post-deemed
    inheritanceStartDate: "1998-07-01",
    decedentAcquisitionDate: "1980-01-01",
    publishedValueAtInheritance: "", // ① 비움
    actualSalePrice: "500000000",
    standardPriceAtTransfer: "200000000",
    ...over,
  } as AssetForm;
}

const house = (over: Partial<AssetForm> = {}) =>
  base({ assetKind: "housing", inheritanceAssetKind: "house_individual", ...over });
const land = (over: Partial<AssetForm> = {}) =>
  base({ assetKind: "land", inheritanceAssetKind: "land", acquisitionArea: "1000", ...over });

describe("post-deemed 상속 — ① 또는 ② 필수", () => {
  it("P-1: ① 입력 → 통과", () => {
    expect(V(house({ publishedValueAtInheritance: "300000000" }))).toBeNull();
  });

  it("P-2: ① 비움 · **② 충족** → 통과 (§163⑨2호 「많은 금액」 — ② 단독도 가목)", () => {
    expect(V(house({ ...HOUSE_5 }))).toBeNull();
  });

  it("★ P-3: 주택 · 실거래가 · ①·② 없음 → 차단 (신규)", () => {
    expect(V(house())).toMatch(CLAUSE_A_REQUIRED);
  });

  it("★ P-4: 주택 · **추계** · ①·② 없음 → 차단 — 모드를 가르지 않는다", () => {
    expect(V(house({ useEstimatedAcquisition: true, standardPriceAtAcq: "50000000" }))).toMatch(
      CLAUSE_A_REQUIRED,
    );
  });

  it("★ P-5: **토지** · ①·② 없음 → 차단 (신규)", () => {
    expect(V(land())).toMatch(CLAUSE_A_REQUIRED);
  });

  it("★ P-6: **건물(토지 제외)** · ①·② 없음 → 차단 (신규)", () => {
    expect(V(base({ assetKind: "building" }))).toMatch(CLAUSE_A_REQUIRED);
  });
});

describe("post-deemed 예외 — 취득가 소스가 따로 있거나 이미 막힌다", () => {
  it("P-7(회귀): **상가**는 기존 블록이 막는다 — 중복 차단이 아니다", () => {
    const err = V(base({ assetKind: "commercial_building", cbAcqBuildingStdBy164_5: true }));
    expect(err).toMatch(CLAUSE_A_REQUIRED);
  });

  it("P-8(회귀): **겸용주택**은 통과 — `mixedAcq*`가 실제 취득가 소스다", () => {
    const a = house({
      isMixedUseHouse: true,
      residentialFloorArea: "100",
      nonResidentialFloorArea: "100",
      mixedUseTotalLandArea: "200",
      buildingFootprintArea: "100",
      mixedAcqHousingPrice: "500000000",
      mixedAcqLandPricePerSqm: "2000000",
      mixedAcqCommercialBuildingPrice: "300000000",
      mixedTransferHousingPrice: "800000000",
      mixedTransferLandPricePerSqm: "3000000",
      mixedTransferCommercialBuildingPrice: "500000000",
    });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A_REQUIRED);
  });

  it("P-9(회귀): **재개발 APT**는 §166④ 경로가 먼저 막는다", () => {
    const err = V(base({ assetKind: "redevelopment_apt" }));
    expect(err).toBeTruthy();
    expect(err).not.toMatch(CLAUSE_A_REQUIRED);
  });
});

describe("post-deemed 경계 — 적용 범위", () => {
  it("P-10(경계): **pre-deemed**(1980)는 E-1이 담당 — 본 게이트 미적용", () => {
    const a = house({ acquisitionDate: "1980-03-01", inheritanceStartDate: "1980-03-01" });
    const err = V(a);
    expect(err).toBeTruthy();
    expect(err).not.toMatch(CLAUSE_A_REQUIRED); // E-1의 「확인할 수 없음」 메시지
  });

  it("P-11(경계): **증여**는 기존 「증여 신고가액」이 담당 — 상속 전용이다", () => {
    const a = house({
      acquisitionCause: "gift",
      inheritanceStartDate: "",
      donorAcquisitionDate: "1980-01-01",
      fixedAcquisitionPrice: "",
    });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A_REQUIRED);
  });

  it("P-12(경계): **매매**는 §163⑨ 대상이 아니다", () => {
    const a = house({
      acquisitionCause: "purchase",
      inheritanceStartDate: "",
      fixedAcquisitionPrice: "300000000",
    });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A_REQUIRED);
  });

  it("★ P-13: `fixedAcquisitionPrice`만 있는 stale 세션 → **차단** — 그 값은 §163⑨ 경로로 가지 않는다", () => {
    // 상속의 ① 소스는 `publishedValueAtInheritance` 하나뿐이다
    // (`transfer-tax-api-inheritance.ts:52-54` — 증여만 `fixedAcquisitionPrice`).
    // 상속에는 그 입력 UI 자체가 없으므로(P2b/P2c 폐지) 실사용자는 이 상태를 만들 수 없다.
    expect(V(house({ fixedAcquisitionPrice: "600000000" }))).toMatch(CLAUSE_A_REQUIRED);
  });

  it("P-14(경계): 「확인 불가」 **선언은 효력이 없다** — post-deemed에는 ③(나목)이 없다", () => {
    expect(V(house({ preDeemedClauseAUnconfirmed: true }))).toMatch(CLAUSE_A_REQUIRED);
  });
});
