/**
 * anchor — 두 조문이 공유하는 단가 필드가 §164⑦ 「부분 입력」 차단을 켰다 (P2-06)
 *
 * ## 무엇이 문제였나
 *
 * `redevLandPricePerSqmAtAcq`는 **두 조문 축에서 공유**된다:
 *   · 토지 출자 분기 — §166③ 분자 단가 (`LandContribValuationContent`)
 *   · 주택 출자 분기 — §164⑦ Sum_A 구성 (`RedevelopmentValuationSection`의 §164⑦ 블록)
 *
 * ⑧ validate의 부분 입력 차단은 이 필드를 「§164⑦를 쓰겠다는 의사 표시」로 읽었다. 그래서
 * 토지 출자로 단가를 채운 뒤 ② 출자 자산을 「주택」으로 되돌리면 「최초공시일도 입력하세요」로
 * 막히는데, **그 화면에는 최초공시일 칸도 단가를 지울 칸도 없다** — `RedevelopmentValuationSection`
 * 자체가 환산 모드에서만 렌더되기 때문이다. 채울 칸 없는 영구 dead-end다.
 *
 * ## 판별 기준은 이미 저장소에 있다
 *
 * `sec164-required-fields.ts`의 `shared?: boolean`이 같은 함정을 같은 기준으로 이미 다룬다 —
 * 「입력 위젯이 §164 섹션 **밖에도** 있는가」. 있으면 opt-in 신호로 보지 않는다.
 * `redevLandPricePerSqmAtFirst`(최초공시 당시 단가)는 §164⑦ 전용이므로 신호로 남긴다.
 *
 * ⚠️ 이 anchor는 **차단이 풀리는지**만 보지 않는다 — §164⑦ 본문이 실제로 발동했을 때
 *    그 단가를 여전히 필수로 요구하는지도 함께 고정한다. 둘을 섞어야 「과소 차단」으로
 *    반대편으로 넘어가지 않는다.
 */
import { describe, it, expect } from "vitest";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 실가 모드 주택 출자 — 그 화면에는 §164⑦ 입력칸이 하나도 없다. */
function actualModeHousing(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    acquisitionDate: "2003-05-10",
    redevApprovalDate: "2009-10-23",
    redevRightsValue: "300,000,000",
    redevSettlementAmount: "50,000,000",
    redevPreApprovalExpenses: "0",
    useEstimatedAcquisition: false,
    redevActualAcquisitionPrice: "200,000,000",
    ...over,
  };
}

const V = (a: AssetForm) => validateRedevelopmentAsset(a, "자산 1");

describe("P2-06 · 공유 단가 필드는 §164⑦ opt-in 신호가 아니다", () => {
  it("토지 출자로 채운 §166③ 단가가 남아 있어도 실가 주택 모드를 막지 않는다", () => {
    // 토지 출자 분기에서 채운 값이 그대로 남은 상태 — 지울 칸이 화면에 없다.
    const asset = actualModeHousing({
      redevLandPricePerSqmAtAcq: "1,000,000",
      redevLandPricePerSqmAtApproval: "2,000,000",
      redevLandArea: "150",
    });
    expect(V(asset)).toBeNull();
  });

  it("입주권에서도 같다 (같은 전환 경로가 재현된다)", () => {
    const asset = actualModeHousing({
      assetKind: "right_to_move_in",
      redevSubject: "right",
      redevLandPricePerSqmAtAcq: "1,000,000",
      redevLandArea: "150",
    });
    expect(V(asset)).toBeNull();
  });

  /**
   * 🔴 2026-09-30 정정(R2): 아래 두 건은 종전에 **실가 모드**로 「최초공시일을 요구한다」를 고정했다.
   *    그 화면에는 최초공시일 칸이 없다 — 이 anchor가 막다른 오류를 기대값으로 삼고 있었다.
   *    opt-in 신호는 **칸이 있는 환산 모드**에서만 본다.
   */
  const estimatedModeHousing = (over: Partial<AssetForm> = {}) =>
    actualModeHousing({
      useEstimatedAcquisition: true,
      redevActualAcquisitionPrice: "",
      redevManagementDisposalHousingPrice: "132,000,000",
      redevAcquisitionHousingPrice: "80,000,000",
      ...over,
    });

  it("§164⑦ **전용** 필드는 환산 모드에서 opt-in 신호다 — 최초공시일을 요구한다", () => {
    // 최초공시 당시 단가는 §164⑦ 블록에만 있다 ⇒ 그 값이 있는데 날짜가 없으면 모순이 맞다.
    const asset = estimatedModeHousing({ redevLandPricePerSqmAtFirst: "700,000" });
    expect(V(asset)).toContain("최초공시일");
  });

  it("A(최초공시 주택가격)도 환산 모드에서 opt-in 신호다", () => {
    const asset = estimatedModeHousing({ redevFirstDisclosureHousingPrice: "90,000,000" });
    expect(V(asset)).toContain("최초공시일");
  });

  it("R2 — 실가 모드에 남은 A·최초공시 단가는 막지 않는다 (날짜 칸이 없는 화면)", () => {
    expect(V(actualModeHousing({ redevFirstDisclosureHousingPrice: "90,000,000" }))).toBeNull();
    expect(V(actualModeHousing({ redevLandPricePerSqmAtFirst: "700,000" }))).toBeNull();
  });

  it("🔑 §164⑦ 본문이 발동하면 그 단가를 여전히 **필수**로 요구한다 (과소 차단 방지)", () => {
    const asset = actualModeHousing({
      useEstimatedAcquisition: true,
      redevActualAcquisitionPrice: "",
      redevManagementDisposalHousingPrice: "132,000,000",
      redevFirstDisclosureDate: "2005-04-30", // 취득 2003 < 최초공시 → 본문 발동
      redevFirstDisclosureHousingPrice: "90,000,000",
      redevLandArea: "150",
      redevLandPricePerSqmAtAcq: "", // ← 비운다
      redevBuildingStdPriceAtAcq: "30,000,000",
      redevLandPricePerSqmAtFirst: "700,000",
      redevBuildingStdPriceAtFirst: "40,000,000",
    });
    expect(V(asset)).toContain("취득시 토지 ㎡당 단가");
  });
});
