/**
 * anchor — GB(Phase 2)·재개발(Phase 3) 증여 §163⑨ 취득가액 validation 가드.
 *
 * §163⑨: 상속 또는 증여받은 자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을
 *   취득당시 실지거래가액으로 본다 → 취득가액 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제.
 * 증여 신고가액은 항상 확인 가능하므로 환산 자체가 법적으로 불필요 →
 *   GB·재개발 증여는 환산(estimated) 모드를 차단하고 실가(신고가액=취득가액) 모드를 강제한다.
 *
 * 버그(수정 전): GB 증여 환산 경로가 매매와 동일하게 환산취득가·개산공제 산정(증여 신고가액 무시).
 *   재개발 증여 환산 토글 ON 시 §166③ 환산으로 증여 신고가액 소실.
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ─── GB 픽스처 ───────────────────────────────────────────────
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "gift",
    acquisitionDate: "2015-06-01",
    gbLandArea: "200",
    gbBuildingFootprintArea: "100",
    gbZoneType: "residential",
    gbTransferLandPricePerSqm: "5000000",
    gbTransferBuildingValue: "300000000",
    // 취득시 기준시가 — 실가 경로도 **취득 축 안분**에 쓴다(2026-08-07 P-2 · V-5b).
    // 이 spec의 주제(§163⑨ 증여 게이트)와는 무관하지만, 자산 단위 취득가액을 토지·건물로
    // 나누려면 필요하다. 없으면 「validate 통과 → 엔진 throw」 모순이 된다.
    gbAcqLandPricePerSqm: "2000000",
    gbAcqBuildingValue: "150000000",
    fixedAcquisitionPrice: "500000000",
    ...over,
  } as AssetForm;
}
const GB = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산 1") ?? "";

describe("GB 증여 §163⑨ validation 가드", () => {
  it("gift 실가(환산 OFF·증축 OFF) + 신고가액 → 통과", () => {
    expect(GB(gbAsset())).toBe("");
  });

  it("gift + 환산 모드 → 차단(§163⑨ 실가 유도)", () => {
    const msg = GB(gbAsset({ useEstimatedAcquisition: true }));
    expect(msg).toContain("환산취득가");
    expect(msg).toContain("§163⑨");
  });

  it("gift + 증축 → 차단(§163⑨ 실가 유도)", () => {
    const msg = GB(gbAsset({ gbHasExtension: true }));
    expect(msg).toContain("§163⑨");
  });

  it("gift 실가 + 신고가액 미입력 → 차단(신고가액 필수)", () => {
    const msg = GB(gbAsset({ fixedAcquisitionPrice: "" }));
    expect(msg).toContain("증여 신고가액");
  });

  it("부분증여(건물만 gift·토지 매매) + 환산 → 차단(fixedAcquisitionPrice=토지·건물 합계 단일)", () => {
    const msg = GB(
      gbAsset({ acquisitionCause: "purchase", gbBuildingAcquisitionCause: "gift", useEstimatedAcquisition: true }),
    );
    expect(msg).toContain("§163⑨");
  });

  /**
   * 🔄 **정정(2026-08-07) — 종전 단언은 법령상 틀린 전제를 잠그고 있었다.**
   *
   * 종전: 「pre-1985 증여는 §176조의2④ 의제취득 영역이므로 §163⑨ 게이트가 꺼진다」.
   * 원문 확인 결과 두 군데가 어긋났다:
   *   ① 「소득세법 시행령」 제163조 제9항에 **「의제취득일」 조건이 없다** — 조건은
   *      「상속 또는 증여받은 자산」과 단서의 「기준시가 고시 전」뿐이다.
   *   ② §176조의2④는 **나목** 계열이라 가목이 확인되면 도달하지 않는다 — 법 §97①1호 단서
   *      「가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목」.
   * 계획서: `docs/02-design/features/transfer-gb-pre1985-163-9.plan.md`
   */
  it("🔄 pre-1985 gift도 §163⑨ 게이트 안 → 환산 차단", () => {
    const msg = GB(gbAsset({ acquisitionDate: "1980-01-01", useEstimatedAcquisition: true }));
    expect(msg).toContain("§163⑨");
  });

  it("R(회귀): 매매 실가 → 통과(불변)", () => {
    expect(GB(gbAsset({ acquisitionCause: "purchase" }))).toBe("");
  });

  it("R(회귀): 상속(토지·건물) + 환산 → 상속 전용 메시지 불변(증여 메시지 아님)", () => {
    const msg = GB(
      gbAsset({
        acquisitionCause: "inheritance",
        gbBuildingAcquisitionCause: "inheritance",
        useEstimatedAcquisition: true,
      }),
    );
    /**
     * 🔄 계약 갱신(2026-08-06 O-3) — **의도는 그대로, 표현만 정정**.
     *
     * 이 테스트의 계약은 「상속 케이스가 **증여** 메시지로 새지 않는다」다. 종전에는 그 대리
     * 지표로 `not.toContain("§163⑨")`를 썼는데, §163⑨은 **상속과 증여를 함께** 규정하는
     * 조항이라 상속 메시지가 그것을 인용하는 것이 오히려 정확하다. 두 경로를 가르는 직접
     * 지표(상속 O · 증여 X)로 바꾼다(메모리 `feedback_anchor_correction_legal_priority`).
     */
    expect(msg).toContain("상속");
    expect(msg).not.toContain("증여");
  });
});

// ─── 재개발 픽스처 (housing 원조합원) ─────────────────────────
function redevAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionCause: "gift",
    acquisitionDate: "2010-03-01",
    redevSubject: "apt",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    redevApprovalDate: "2020-05-01",
    redevRightsValue: "600000000",
    redevSettlementAmount: "0",
    redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "200000000",
    ...over,
  } as AssetForm;
}
const RD = (a: AssetForm) => validateRedevelopmentAsset(a, "자산 1") ?? "";

describe("재개발 증여 §163⑨ validation 가드 (원조합원)", () => {
  it("gift 실가(환산 OFF) + 종전자산 취득가액 → 통과", () => {
    expect(RD(redevAsset())).toBe("");
  });

  it("gift + 환산 모드 → 차단(§163⑨ 실가 유도)", () => {
    const msg = RD(redevAsset({ useEstimatedAcquisition: true }));
    expect(msg).toContain("§163⑨");
    expect(msg).toContain("환산취득가");
  });

  it("R(회귀): 매매 실가 → 통과(불변)", () => {
    expect(RD(redevAsset({ acquisitionCause: "purchase" }))).toBe("");
  });

  it("M-1: land+right+gift+환산+**pay** → §163⑨ 실가 전환 (#1(A)로 실가 pay 지원)", () => {
    // #1(A): land+right+실가+pay가 computeRightPay(§166①1호)로 신고가액 정확 산출 → 실가 pay 지원.
    // 따라서 gift+환산+pay는 "실가로 전환, 신고가액 입력"(§163⑨)이 유효(deadlock 없음).
    const msg = RD(
      redevAsset({
        redevOriginalAssetType: "land",
        redevSubject: "right",
        redevSettlementDirection: "pay",
        useEstimatedAcquisition: true,
      }),
    );
    expect(msg).toContain("§163⑨");
    expect(msg).toContain("증여 신고가액을 입력"); // 실가 전환 유도(실가 pay 지원)
  });

  // ── #1(A) 잔여 — land+right+receive 실가 개방 ──
  // receive fixture: right + receive + settlementAmount>0 + 실가 취득가액.
  function landRightReceive(over: Partial<AssetForm> = {}): AssetForm {
    return redevAsset({
      redevOriginalAssetType: "land",
      redevSubject: "right",
      redevSettlementDirection: "receive",
      redevSettlementAmount: "50000000",
      redevRightsValue: "500000000",
      redevActualAcquisitionPrice: "200000000",
      ...over,
    });
  }

  it("#1A: land+right+실가+receive(gift) → 통과(개방·§163⑨ 신고가액=취득가액)", () => {
    // computeRightReceive(§166①2호)가 신고가액 사용 — 실가 receive 정합.
    expect(RD(landRightReceive())).toBe("");
  });

  it("#1A: land+right+실가+receive(매매) → 통과(개방·회귀-safe)", () => {
    expect(RD(landRightReceive({ acquisitionCause: "purchase" }))).toBe("");
  });

  it("#1A: land+right+gift+환산+receive → §163⑨ 실가 전환 (#1(B) '미지원' → '실가로 전환'으로 갱신)", () => {
    // 실가 receive 개방으로 gift+환산+receive도 "실가로 전환"이 유효(deadlock 해소).
    const msg = RD(landRightReceive({ useEstimatedAcquisition: true }));
    expect(msg).toContain("§163⑨");
    expect(msg).toContain("증여 신고가액을 입력");
  });

  it("#1A: land+right+매매+환산+receive → 차단 유지(환산 후속 PR)", () => {
    // 환산 receive는 runLandContribEstimated가 settlementPaid로 pay만 가정 → 미지원 유지.
    const msg = RD(landRightReceive({ acquisitionCause: "purchase", useEstimatedAcquisition: true }));
    expect(msg).toContain("환산취득가");
    expect(msg).not.toContain("§163⑨");
  });

  it("R(회귀): land+right+실가+pay → 통과 불변(#734 보존)", () => {
    expect(
      RD(landRightReceive({ redevSettlementDirection: "pay", redevSettlementAmount: "0" })),
    ).toBe("");
  });

  it("R(회귀): 승계조합원 gift+환산 → 승계 전용 차단 불변(§163⑨ 아님)", () => {
    const msg = RD(
      redevAsset({
        redevIsSuccessorMember: "yes",
        redevCompletionDate: "2021-01-01",
        useEstimatedAcquisition: true,
      }),
    );
    expect(msg).toContain("승계조합원");
    expect(msg).not.toContain("§163⑨");
  });
});
