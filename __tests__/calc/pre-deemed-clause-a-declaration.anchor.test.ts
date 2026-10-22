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
  /**
   * 🔄 **증여에는 선언 경로가 없다**(PR-5 · 사용자 결정 Q-14, 2026-10-22). ①(증여 신고가액)은 계속 필수이고 ③은 증여 화면의
   * 전용 칸(`GiftPreDeemedConversionSection`)으로 받는다. 종전 X-1~X-4는 「1985 전 증여 · 추계 플래그」를 ③으로 가는 통로로 썼다 —
   * 그 플래그는 이제 남은 값으로 보아 ⑧이 막고(`giftEstimatedModeBlocked` 1985 하한 제거) 복원에서 비운다.
   */
  const GIFT_EST_BLOCK = /증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다/;

  it("🔄 X-1: 증여 · 남은 추계 플래그 · ① 입력 → 추계 차단(선언이 아니라 플래그를 끄라는 안내)", () => {
    expect(V(giftLand({ fixedAcquisitionPrice: "100000000" }))).toMatch(GIFT_EST_BLOCK);
  });

  it("🔄 X-2: 증여 · 실거래가 · ① 비움 · ② 충족(토지 등급) → 증여 신고가액 요구 (종전 실거래가 규칙 그대로 · Q-14)", () => {
    // 종전 X-2는 추계 플래그 덕에 ① 검사를 건너뛰었다. 화면의 증여 토지 등급 입력은 `pre1990Enabled` 래치를 켜지 않으므로
    // (`alwaysOpen` · 복원 시 `sec164LandLatchClearPatch`) 실거래가 증여는 ①이 필수다 — ②는 ①과 비교할 값이다.
    expect(V(giftLand({ ...LAND_5, useEstimatedAcquisition: false }))).toMatch(/증여 신고가액을 입력하세요/);
    expect(V(giftLand({ ...LAND_5, useEstimatedAcquisition: false, fixedAcquisitionPrice: "100000000" }))).toBeNull();
  });

  it("🔄 X-3: 증여 · 실거래가 · ①② 비움 → 「확인 불가」 선언이 아니라 증여 신고가액을 요구한다 (Q-14)", () => {
    const err = V(giftLand({ useEstimatedAcquisition: false, standardPriceAtAcq: "", standardPriceAtTransfer: "" }));
    expect(err).toMatch(/증여 신고가액을 입력하세요/);
    expect(err).not.toMatch(CLAUSE_A);
  });

  it("🔄 X-4: 증여 · 실거래가 · ①② 비움 · 선언 + ③ 칸 → 선언으로 뚫리지 않는다 (Q-14)", () => {
    expect(V(giftLand({ useEstimatedAcquisition: false, preDeemedClauseAUnconfirmed: true }))).toMatch(/증여 신고가액을 입력하세요/);
  });

  it("★ X-5: 상속 주택 · 실거래가 · ① 비움 · ② 미충족 · 선언 없음 → 차단 (P2c 제외의 해소)", () => {
    expect(V(inhHouse())).toMatch(CLAUSE_A);
  });

  it("X-6: 상속 주택 · 실거래가 · ① 비움 · 선언 → 통과", () => {
    // 2026-09-30 PD-1: 선언으로 간 ③(환산)의 분자·분모를 보충했다 — 종전 픽스처는 둘 다 비어 엔진이
    // 취득가액 0으로 계산하는 상태였다(⑧ `preDeemedConversionInputError`가 이제 막는다).
    expect(
      V(inhHouse({ preDeemedClauseAUnconfirmed: true, standardPriceAtAcq: "50000000", standardPriceAtTransfer: "600000000" })),
    ).toBeNull();
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
  it("X-12: 상속 상가 · pre-deemed · ① 비움 · ② 미충족 · **선언** + ③ 기준시가 2칸 → 통과", () => {
    expect(
      V(inhCommercial({ preDeemedClauseAUnconfirmed: true, standardPriceAtAcq: "200000000", standardPriceAtTransfer: "400000000" })),
    ).toBeNull();
  });

  it("★ X-12d: 상속 상가 · pre-deemed · **선언**만 하고 ③ 칸 비움 → 의제취득일 기준시가로 차단 (⑫ `refinePreDeemedAcquisitionSource` 거울 — 종전 ⑧ 통과 ↔ ⑫ 400)", () => {
    const err = V(inhCommercial({ preDeemedClauseAUnconfirmed: true }));
    expect(err).toMatch(/의제취득일 현재 기준시가를 입력하세요/);
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

  it("🔄 X-13: **증여** 상가 · 남은 추계 플래그 → 추계 차단 (PR-5 — 1985 전 증여 상가는 환산 토글을 숨기고 ③ 칸을 쓴다 · Q-13)", () => {
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
    expect(V(a)).toMatch(/증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다/);
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
