/**
 * F-13 anchor — 복합구조 결과의 「취득시/양도시 적용」 버튼에 bothMode·applyTimePoint 가드가 없었다.
 *
 * 결함(수정 전 `BuildingStdPriceModalButton.tsx`):
 *   {result.acquisition && !bothMode && applyTimePoint !== "transfer" && ( … )}   ← 단건: 가드 있음
 *   {result.transfer    && !bothMode && applyTimePoint !== "acquisition" && ( … )} ← 단건: 가드 있음
 *   {result.acquisitionComposite && ( … )}   ← 복합: **조건이 결과 존재뿐**
 *   {result.transferComposite    && ( … )}   ← 복합: **조건이 결과 존재뿐**
 *   const showBothButton = bothMode && !!result?.acquisition && !!result?.transfer;
 *                                       ↑ 복합은 acquisitionComposite/transferComposite 를 내므로
 *                                         통합 버튼이 **구조적으로 뜨지 않았다** ⇒ 가드 없는 개별 버튼만 남았다.
 *
 * 실제 피해(리뷰 실측):
 *   ① `LandBuildingSplitSection`(bothMode) 의 `onApply` 가 취득 필드에 고정 배선돼 있어
 *      「양도시 적용」이 **양도값을 취득 칸에** 써 넣고 양도 칸은 비운다.
 *   ② `MixedUseAssetMajorStdPrice` 는 `onApply` 미배선이라 클릭 시 콜백 0회 —
 *      다이얼로그만 닫혀 「적용됐다」고 오인된다.
 *
 * ⇒ 판정을 JSX 에서 순수 leaf `planApplyButtons` 로 뽑아 단건·복합이 **같은 축**의 가드를 쓰게 했다.
 *
 * 법령: 두 필드의 용도가 갈린다 — 취득시 = 「소득세법 시행령」 제164조 제3항(직전 고시분),
 *   양도시 = 「소득세법」 제99조 제1항 제1호 나목(환산 분모). 조문 표기는 코드 인용을 따랐고
 *   이번에 원문을 재확인하지 않았다.
 */
import { describe, it, expect } from "vitest";
import { planApplyButtons } from "@/lib/calc/building-std-apply-buttons";

describe("F-13 적용 버튼 — §1 복합 결과도 bothMode 가드를 받는다", () => {
  it("bothMode 에서 복합 개별 버튼이 뜨지 않는다 (수정 전 결함의 핵심)", () => {
    const p = planApplyButtons({
      acquisitionComposite: 100_000_000,
      transferComposite: 217_230_000,
      bothMode: true,
    });
    expect(p.showAcquisitionCompositeOnly).toBe(false);
    expect(p.showTransferCompositeOnly).toBe(false);
  });

  it("bothMode + 복합 2시점이면 통합 버튼이 뜬다 — 종전에는 구조적으로 불가능했다", () => {
    const p = planApplyButtons({
      acquisitionComposite: 100_000_000,
      transferComposite: 217_230_000,
      bothMode: true,
    });
    expect(p.showBoth).toBe(true);
    expect(p.acqTotal).toBe(100_000_000);
    expect(p.transferTotal).toBe(217_230_000);
    expect(p.showBothPending).toBe(false);
  });

  it("applyTimePoint 가 고정된 호출부에서 반대 시점 복합 버튼이 뜨지 않는다", () => {
    const acqOnly = planApplyButtons({
      acquisitionComposite: 100_000_000,
      transferComposite: 217_230_000,
      bothMode: false,
      applyTimePoint: "acquisition",
    });
    expect(acqOnly.showAcquisitionCompositeOnly).toBe(true);
    expect(acqOnly.showTransferCompositeOnly).toBe(false);

    const transferOnly = planApplyButtons({
      acquisitionComposite: 100_000_000,
      transferComposite: 217_230_000,
      bothMode: false,
      applyTimePoint: "transfer",
    });
    expect(transferOnly.showAcquisitionCompositeOnly).toBe(false);
    expect(transferOnly.showTransferCompositeOnly).toBe(true);
  });
});

describe("F-13 적용 버튼 — §2 단건 축은 종전 그대로 (역방향 가드)", () => {
  it("단건 2시점 + bothMode → 통합 버튼만", () => {
    const p = planApplyButtons({ acquisition: 1, transfer: 2, bothMode: true });
    expect(p.showBoth).toBe(true);
    expect(p.showAcquisitionOnly).toBe(false);
    expect(p.showTransferOnly).toBe(false);
  });

  it("단건 2시점 + 자유 모드 → 개별 버튼 2개", () => {
    const p = planApplyButtons({ acquisition: 1, transfer: 2, bothMode: false });
    expect(p.showBoth).toBe(false);
    expect(p.showAcquisitionOnly).toBe(true);
    expect(p.showTransferOnly).toBe(true);
  });

  it("bothMode 인데 한 시점만 있으면 안내 문구", () => {
    const p = planApplyButtons({ acquisition: 1, bothMode: true });
    expect(p.showBoth).toBe(false);
    expect(p.showBothPending).toBe(true);
  });

  it("결과가 아무것도 없으면 안내도 뜨지 않는다", () => {
    expect(planApplyButtons({ bothMode: true }).showBothPending).toBe(false);
  });

  it("상증 1시점 복합 합계 버튼은 시점 축과 무관하게 뜬다", () => {
    const p = planApplyButtons({ compositeTotal: 22_801_680, bothMode: false });
    expect(p.showCompositeTotal).toBe(true);
    expect(p.showBoth).toBe(false);
  });
});

describe("F-13 적용 버튼 — §3 취득 ≤2000 환산값 우선", () => {
  it("acquisitionComposite 대신 산정기준율 환산 후 값이 넘어오면 그것이 통합 버튼 금액이 된다", () => {
    // 호출부가 `acqBaseConversion.convertedTotal ?? acquisitionComposite.total` 을 넣는다.
    const p = planApplyButtons({
      acquisitionComposite: 157_439_360,
      transferComposite: 200_000_000,
      bothMode: true,
    });
    expect(p.acqTotal).toBe(157_439_360);
  });
});
