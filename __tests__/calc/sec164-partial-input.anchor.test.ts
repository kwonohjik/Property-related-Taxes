/**
 * anchor: §164④·⑥·⑤~⑦ **부분 입력 차단** — all-or-nothing opt-in의 침묵 실패 해소.
 *
 * 「소득세법 시행령」 §163⑨1호·2호의 ②(§164④~⑦ 취득당시 기준시가)는 필수 필드가 **모두**
 * 채워져야 payload가 생성된다. 일부만 입력하면 빌더가 `{}`를 반환해 ②가 계산에서 사라지고
 * ① 단독으로 계산되는데 **아무 경고도 없었다** — 사용자에게는 "입력했는데 반영되지 않는" 상태다.
 *
 * ⇒ 「하나라도 손댔으면 끝까지」 규약으로 차단한다(`0 < filled < total`).
 *
 * ⚠️ **판정 순서가 중요하다** — 완성된 그룹이 하나라도 있으면 **먼저** 충족으로 보고,
 *    어느 그룹도 완성되지 않았을 때만 손댄 그룹 기준으로 누락을 안내한다. 순서가 뒤바뀌면
 *    C-4b(단가 완성 + 등급 2/3)에서 잘못 차단한다. 빌더(`transfer-tax-api-inheritance.ts:206`)가
 *    그렇게 동작하므로 validate가 더 엄격하면 "칸은 다 있는데 차단"이 된다.
 *
 * 계획서: docs/02-design/features/sec164-partial-input-silent-noop.plan.md §6 케이스 매트릭스
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const L = "자산1";
const blocked = (a: AssetForm) => validateAssetAcquisition(a, L);

/** 주택 §164⑤~⑦ 4필수 중 3 — 「하나 비었다」를 만드는 부분 집합 */
const HOUSE_3 = {
  inhHouseValLandArea: "200",
  inhHouseValLandPricePerSqmAtTransfer: "500000",
  inhHouseValLandPricePerSqmAtFirst: "300000",
};
/** 주택 §164⑤~⑦ 4필수 */
const HOUSE_4 = { ...HOUSE_3, inhHouseValHousePriceAtFirst: "80000000" };

function house(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "1998-07-01", // 1990.8.30. 後 · 2005.4.30. 前
    inheritanceStartDate: "1998-07-01",
    decedentAcquisitionDate: "1980-01-01",
    publishedValueAtInheritance: "100000000",
    inheritanceAssetKind: "house_individual",
    ...over,
  } as AssetForm;
}

/** 상가 §164⑥ 8필드 중 7 */
const CB_7 = {
  cbExclusiveArea: "50",
  cbSharedArea: "20",
  cbLandArea: "100",
  cbUnitPriceAtFirstOrAcq: "1000000",
  cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000",
  cbBuildingStdPriceAtAcq: "30000000",
};
/** 상가 §164⑥ 8필드 */
const CB_8 = { ...CB_7, cbBuildingStdPriceAtFirst: "40000000" };

function commercial(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: "1998-07-01", // 상가 최초고시(2005-01-01) 前
    inheritanceStartDate: "1998-07-01",
    decedentAcquisitionDate: "1980-01-01",
    publishedValueAtInheritance: "100000000",
    cbAcqBuildingStdBy164_5: true, // §164⑥ 단서(2000년 이전) 확인란
    ...over,
  } as AssetForm;
}

/** 토지 §164④ 5필드 중 4 (취득시 등급 누락) */
const LAND_4 = {
  acquisitionArea: "184.2",
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number" as const,
};
/** 토지 §164④ 5필드(등급 3 + 면적 + 1990㎡당가) */
const LAND_5 = { ...LAND_4, pre1990Grade_atAcq: "200" };

function land(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "1987-05-01", // 1990.8.30. 前 · 의제취득일 後
    donorAcquisitionDate: "1980-01-01",
    fixedAcquisitionPrice: "100000000",
    inheritanceAssetKind: "land",
    standardPriceAtTransfer: "1243350000",
    ...over,
  } as AssetForm;
}

// ─── 주택 §164⑤~⑦ ────────────────────────────────────────────────

describe("§164⑤~⑦ 주택 — 부분 입력 차단", () => {
  it("C-1: 상속 · 4필수 중 3 → 차단", () => {
        expect(blocked(house({ ...HOUSE_3, inhHouseValLandPricePerSqmAtInheritance: "250000" }))).toMatch(
      /§164/,
    );
  });

  it("C-2: 증여 · 4필수 중 3 → 차단", () => {
        expect(
      blocked(
        house({
          acquisitionCause: "gift",
          inheritanceStartDate: "",
          donorAcquisitionDate: "1980-01-01",
          fixedAcquisitionPrice: "100000000",
          ...HOUSE_3,
          inhHouseValLandPricePerSqmAtInheritance: "250000",
        }),
      ),
    ).toMatch(/§164/);
  });

  it("C-3: 상속 · 1990 前 · 4필수 + 등급 2/3 (단가 없음) → 차단", () => {
    expect(
      blocked(
        house({
          acquisitionDate: "1987-05-01",
          inheritanceStartDate: "1987-05-01",
          ...HOUSE_4,
          pre1990Grade_current: "218",
          pre1990Grade_prev: "218",
          pre1990PricePerSqm_1990: "1100000",
          pre1990GradeMode: "number",
        }),
      ),
    ).toMatch(/§164/);
  });

  /**
   * 🔄 **C-4·C-4b는 2026-09-05(Q11)에 결론이 뒤집혔다** — 종전에는 「등급 3종+1990가 ↔
   * 취득당시 단가」 **택일**이라 단가만으로 통과했다. 그러나 1990.8.30. 이전에는 개별공시지가가
   * **고시된 적이 없어** 그 단가는 존재하지 않는 값이고, 영 §164④가 그 자리를 등급환산으로
   * 채운다. 토지 축(`sec164LandStatus`)은 처음부터 등급 4필드를 **필수**로 요구했다 —
   * 주택 축만 예외였고, 그 예외가 UI에서 사라진 칸의 stale 값을 「충족」으로 읽어
   * 엔진에서 등급환산을 덮어쓰게 했다(`inheritance-house-valuation.ts:173`).
   *
   * ⚠️ 단언을 약화시킨 것이 아니라 **반대로 뒤집었다** — 통과였던 두 케이스가 이제 차단이다.
   */
  it("C-4(정정): 상속 · 1990 前 · 4필수 + 단가만 → **차단** (등급환산이 유일한 길)", () => {
    expect(
      blocked(
        house({
          acquisitionDate: "1987-05-01",
          inheritanceStartDate: "1987-05-01",
          ...HOUSE_4,
          inhHouseValLandPricePerSqmAtInheritance: "250000",
        }),
      ),
    ).toMatch(/§164/);
  });

  it("C-4b(정정): 상속 · 1990 前 · 단가 + 등급 2/3 → **차단** (등급 4필드 미완성)", () => {
    expect(
      blocked(
        house({
          acquisitionDate: "1987-05-01",
          inheritanceStartDate: "1987-05-01",
          ...HOUSE_4,
          inhHouseValLandPricePerSqmAtInheritance: "250000",
          pre1990Grade_current: "218",
          pre1990Grade_prev: "218",
          pre1990GradeMode: "number",
        }),
      ),
    ).toMatch(/§164/);
  });

  it("🔑 C-4c: 상속 · 1990 前 · 4필수 + 등급 4필드 완성 → 통과 (§164④ 경로)", () => {
    expect(
      blocked(
        house({
          acquisitionDate: "1987-05-01",
          inheritanceStartDate: "1987-05-01",
          ...HOUSE_4,
          pre1990Grade_current: "218",
          pre1990Grade_prev: "218",
          pre1990Grade_atAcq: "200",
          pre1990PricePerSqm_1990: "1100000",
          pre1990GradeMode: "number",
        }),
      ),
    ).toBeNull();
  });
});

// ─── 상가 §164⑥ ──────────────────────────────────────────────────

describe("§164⑥ 상가 — 부분 입력 차단", () => {
  it("C-5(회귀): 상속 · 8 중 7 → 차단 (현행 유지)", () => {
    expect(blocked(commercial(CB_7))).toMatch(/§164⑥/);
  });

  it("🔴 C-6: 증여 · 8 중 7 → 차단 (신규)", () => {
    expect(
      blocked(
        commercial({
          acquisitionCause: "gift",
          inheritanceStartDate: "",
          donorAcquisitionDate: "1980-01-01",
          fixedAcquisitionPrice: "100000000",
          ...CB_7,
        }),
      ),
    ).toMatch(/§164⑥/);
  });

  it("C-12(경계): 이월과세는 §97의2 승계라 대상 아님 → §164 검사 없음", () => {
    const err = blocked(
      commercial({
        acquisitionCause: "carryover_gift",
        inheritanceStartDate: "",
        ...CB_7,
      }),
    );
    expect(err ?? "").not.toMatch(/§164⑥/);
  });
});

// ─── 토지 §164④ ──────────────────────────────────────────────────

describe("§164④ 토지 — 부분 입력 차단", () => {
  it("🔴 C-7: 증여 post-1985 · 등급 2/3 → 차단 (신규 — hasPre1990이 배제하던 구멍)", () => {
    expect(blocked(land(LAND_4))).toMatch(/§164④|토지등급/);
  });

  it("C-8(회귀): 상속 · 등급 2/3 → 차단 (현행 hasPre1990 경유)", () => {
    expect(
      blocked(
        land({
          acquisitionCause: "inheritance",
          inheritanceStartDate: "1987-05-01",
          decedentAcquisitionDate: "1980-01-01",
          publishedValueAtInheritance: "100000000",
          pre1990Enabled: true,
          ...LAND_4,
        }),
      ),
    ).toBeTruthy();
  });

  it("C-8b(회귀): 증여 pre-1985 · 등급 2/3 → 차단 (현행 유지)", () => {
    expect(
      blocked(
        land({
          acquisitionDate: "1980-03-01",
          donorAcquisitionDate: "1975-01-01",
          pre1990Enabled: true,
          ...LAND_4,
        }),
      ),
    ).toBeTruthy();
  });
});

// ─── 회귀 — 전부 비움 / 전부 채움 ──────────────────────────────────

describe("회귀 — opt-in 양끝은 통과한다", () => {
  it("C-9a: 주택 상속 · §164 필드 전부 비움 → 통과 (① 단독은 정상 경로)", () => {
    expect(blocked(house())).toBeNull();
  });

  it("C-9b: 상가 상속 · 전부 비움 → 통과", () => {
    expect(blocked(commercial())).toBeNull();
  });

  it("C-9c: 토지 증여 · 전부 비움 → 통과", () => {
    expect(blocked(land())).toBeNull();
  });

  it("C-10a: 주택 상속 · 4필수 + 단가 전부 채움 → 통과", () => {
    expect(
      blocked(house({ ...HOUSE_4, inhHouseValLandPricePerSqmAtInheritance: "250000" })),
    ).toBeNull();
  });

  it("C-10b: 상가 상속 · 8 전부 채움 → 통과", () => {
    expect(blocked(commercial(CB_8))).toBeNull();
  });

  it("C-10c: 토지 증여 · 5 전부 채움 → 통과", () => {
    expect(blocked(land(LAND_5))).toBeNull();
  });
});
