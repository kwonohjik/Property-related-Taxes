/**
 * E-1 — 「가목(§163⑨ 평가액) 확인 불가」 선언 게이트 (U2-E)
 *
 * 「소득세법」 §97①1호 **단서**: "가목의 실지거래가액을 확인할 수 없는 경우에 **한정하여**
 * 나목의 금액을 적용한다". pre-deemed(기준일 < 1985.1.1.)에서 ①(상증법 평가액)도 ②(§164④~⑦)도
 * 없으면 엔진은 ③(환산·나목)으로 가는데, **「확인할 수 없다」를 사용자가 선언한 적이 없다**.
 *
 * ⇒ ①·② 모두 미충족이면 **차단**하고, 명시 선언(`preDeemedClauseAUnconfirmed`)이 있을 때만
 *   통과시킨다. 선언은 **③(나목)이 존재하는 구간에만** 효력이 있다(X-7·X-12c).
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §4.2·§5
 */
import { describe, expect, it } from "vitest";

import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const L = "자산 1";
const V = (a: AssetForm) => validateAssetAcquisition(a, L);

/** E-1이 내는 메시지만 골라낸다 — 다른 사유의 차단과 섞이면 anchor가 무의미해진다. */
const CLAUSE_A = /확인할 수 없음/;

// ── §164 ② 충족 세트 (isFullyFilled 기준) ─────────────────────────

/** 토지 §164④ 5필드 */
const LAND_5 = {
  acquisitionArea: "184.2",
  pre1990Grade_atAcq: "200",
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number" as const,
};

/** 상가 §164⑥ 8필드 */
const CB_8 = {
  cbExclusiveArea: "50",
  cbSharedArea: "20",
  cbLandArea: "100",
  cbUnitPriceAtFirstOrAcq: "1000000",
  cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000",
  cbBuildingStdPriceAtAcq: "30000000",
  cbBuildingStdPriceAtFirst: "40000000",
};

// ── fixture ───────────────────────────────────────────────────────

/** 증여 토지 — 기준일 = `acquisitionDate`(증여일) */
function giftLand(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "1980-03-01",
    donorAcquisitionDate: "1975-01-01",
    fixedAcquisitionPrice: "", // ① 비움
    useEstimatedAcquisition: true, // 추계
    standardPriceAtAcq: "50000000",
    standardPriceAtTransfer: "1243350000",
    ...over,
  } as AssetForm;
}

/** 상속 주택 — 기준일 = `inheritanceStartDate` */
function inhHouse(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-03-01",
    inheritanceStartDate: "1980-03-01",
    decedentAcquisitionDate: "1970-01-01",
    publishedValueAtInheritance: "", // ① 비움
    inheritanceAssetKind: "house_individual",
    ...over,
  } as AssetForm;
}

/** 상속 상가 — `:127` 전용 블록을 탄다 */
function inhCommercial(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-03-01",
    inheritanceStartDate: "1980-03-01",
    decedentAcquisitionDate: "1970-01-01",
    publishedValueAtInheritance: "", // ① 비움
    cbAcqBuildingStdBy164_5: true, // §164⑥ 단서(2000년 이전) 확인란
    ...over,
  } as AssetForm;
}

// ── X-1 ~ X-6: 기본 4분면 ─────────────────────────────────────────

describe("E-1 — ①·② 미충족 시 「확인 불가」 선언 요구", () => {
  it("X-1: 증여·추계 · ① 입력 → 통과 (가목 = ①)", () => {
    expect(V(giftLand({ fixedAcquisitionPrice: "100000000" }))).toBeNull();
  });

  it("X-2: 증여·추계 · ① 비움 · ② 충족 → 통과 (가목 = ② 단독, §163⑨1호 「많은 금액」)", () => {
    expect(V(giftLand({ ...LAND_5 }))).toBeNull();
  });

  it("★ X-3: 증여·추계 · ① 비움 · ② 미충족 · 선언 없음 → 차단 (신규)", () => {
    expect(V(giftLand())).toMatch(CLAUSE_A);
  });

  it("X-4: 증여·추계 · ① 비움 · ② 미충족 · 선언 → 통과 (③ 나목)", () => {
    expect(V(giftLand({ preDeemedClauseAUnconfirmed: true }))).toBeNull();
  });

  it("★ X-5: 상속 주택 · 실거래가 · ① 비움 · ② 미충족 · 선언 없음 → 차단 (P2c 제외의 해소)", () => {
    expect(V(inhHouse())).toMatch(CLAUSE_A);
  });

  it("X-6: 상속 주택 · 실거래가 · ① 비움 · 선언 → 통과", () => {
    expect(V(inhHouse({ preDeemedClauseAUnconfirmed: true }))).toBeNull();
  });
});

// ── X-7 ~ X-11: 경계 — 선언이 **뚫어서는 안 되는** 곳 ─────────────

describe("E-1 경계 — 선언의 효력은 ③(나목)이 있는 구간에 한정된다", () => {
  it("X-7(회귀): 증여 · **실거래가** · ① 비움 → 기존 메시지 유지 · 선언으로 뚫리지 않는다", () => {
    const a = giftLand({ useEstimatedAcquisition: false, preDeemedClauseAUnconfirmed: true });
    expect(V(a)).toMatch(/증여 신고가액을 입력하세요/);
  });

  it("X-8(회귀): 증여 · 추계 · **1990-03-01**(post-deemed) → 기존 giftEstimatedModeError · E-1 미적용", () => {
    const err = V(giftLand({ acquisitionDate: "1990-03-01" }));
    expect(err).toBeTruthy();
    expect(err).not.toMatch(CLAUSE_A);
  });

  it("X-9(회귀): 상속 주택 · **1990-03-01**(post-deemed) · ① 비움 → E-1 미적용", () => {
    const a = inhHouse({ acquisitionDate: "1990-03-01", inheritanceStartDate: "1990-03-01" });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A);
  });

  it("X-10(경계): **매매** · 1980 · 추계 → §163⑨ 대상 아님 · E-1 미적용", () => {
    const a = giftLand({ acquisitionCause: "purchase", fixedAcquisitionPrice: "100000000" });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A);
  });

  it("X-11(경계): **이월과세** · 1980 · 추계 → §97의2 승계 · E-1 미적용", () => {
    const a = giftLand({ acquisitionCause: "carryover_gift" });
    expect(V(a) ?? "").not.toMatch(CLAUSE_A);
  });
});

// ── X-12 ~ X-13: 상가 (D-5 — Y-5 결정) ────────────────────────────

describe("D-5 — 상가 게이트 완화 (§163⑨2호 「많은 금액」 = ② 단독도 가목)", () => {
  it("X-12: 상속 상가 · pre-deemed · ① 비움 · ② 미충족 · **선언** → 통과", () => {
    expect(V(inhCommercial({ preDeemedClauseAUnconfirmed: true }))).toBeNull();
  });

  it("★ X-12b: 상속 상가 · pre-deemed · ① 비움 · **② 충족** → 통과 (현행은 차단 — Y-5 정정)", () => {
    expect(V(inhCommercial({ ...CB_8 }))).toBeNull();
  });

  it("X-12c(회귀): 상속 상가 · **post-deemed** · ① 비움 · 선언 → **차단 유지** (③이 없어 선언 무의미)", () => {
    const a = inhCommercial({
      acquisitionDate: "1990-03-01",
      inheritanceStartDate: "1990-03-01",
      preDeemedClauseAUnconfirmed: true,
    });
    expect(V(a)).toMatch(/상속개시일 평가액/);
  });

  it("X-13: **증여** 상가 · 추계 · ① 비움 · ② 미충족 · 선언 없음 → 차단", () => {
    const a = inhCommercial({
      acquisitionCause: "gift",
      inheritanceStartDate: "",
      donorAcquisitionDate: "1975-01-01",
      useEstimatedAcquisition: true,
      // 면적 3종은 §164⑥ 전용이 아니라 상가의 일반 필드다(D-0 `shared`) — 채워도 ② opt-in이
      // 아니므로 「② 미충족」이 유지된다. 비워두면 면적 검증에 먼저 걸려 E-1에 도달하지 못한다.
      cbExclusiveArea: "50",
      cbSharedArea: "20",
      cbLandArea: "100",
      standardPriceAtAcq: "50000000",
      standardPriceAtTransfer: "1243350000",
    });
    expect(V(a)).toMatch(CLAUSE_A);
  });
});

// ── X-14: `hasPre1990` 구멍 ───────────────────────────────────────

/**
 * 🔵 **설계서 §3.2·X-14 정정 (2026-08-07 실측)** — `hasPre1990`은 **구멍이 아니었다**.
 *
 * 설계서는 `:549`의 `!hasPre1990`이 취득가액 필수 검증을 건너뛰므로 「① 없고 ② 미충족」이
 * 통과한다고 봤다. 그러나 그보다 **앞선** `hasPre1990` 블록(`:471-487`)이 §164④의 5필드를
 * **전부 필수**로 요구한다(면적·1990 공시지가·등급 3종). ⇒ 그 블록을 통과했다면 **②는 이미
 * 충족**이고, 미충족 상태로는 `:549`에 **도달조차 하지 못한다**.
 *
 * ⇒ 실제 구멍은 두 개다 — ⑴ 증여·**추계**(X-3) ⑵ 상속·**P2c 제외**(X-5). 아래는 회귀 고정.
 */
describe("경계 — `hasPre1990` 경로는 §164④ 5필드를 전부 요구하므로 구멍이 아니다", () => {
  it("X-14(회귀): 증여 토지 · 실거래가 + `pre1990Enabled` · ② 미충족 → **§164④ 필수 입력**으로 차단 (E-1 이전)", () => {
    const err = V(giftLand({ useEstimatedAcquisition: false, pre1990Enabled: true }));
    expect(err).toMatch(/취득 당시 면적/);
    expect(err).not.toMatch(CLAUSE_A);
  });

  it("X-14b: 같은 조합 · ② 충족 → 통과 — `hasPre1990` 제외 로직을 가져오면 여기서 과잉 차단된다", () => {
    const a = giftLand({
      useEstimatedAcquisition: false,
      pre1990Enabled: true,
      ...LAND_5,
    });
    expect(V(a)).toBeNull();
  });
});
