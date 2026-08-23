/**
 * anchor — **컴패니언 §164⑤ PHD 3-시점 환산 미지원** N-6.
 *
 * 계획서: `docs/00-pm/transfer-f16-spinoff-items.plan.md` §N-6
 *
 * ## 결함 (수정 전 실측)
 *
 * | 지점 | 상태 |
 * |---|---|
 * | ⑤ UI | PHD 토글을 **컴패니언에도 렌더**했다 |
 * | ⑧ validate | `usePreHousingDisclosure`면 **11필드를 필수로 요구**했다 (자산 인덱스 무관) |
 * | ④ 변환 | `buildPreHousingDisclosurePayload(primary, …)` — **primary 전용, 호출 1곳** |
 * | ⑫ Zod | `companionAssetSchema`에 `preHousingDisclosure` **필드 자체가 없다** |
 *
 * ⇒ 사용자는 11칸을 **강제로** 채워야 했고 그 값은 통째로 버려졌다.
 *
 * ## 왜 (a) ⑫ 배관이 아니라 (b) 입력 경로 정리인가 — 실측이 갈랐다
 *
 * ⑫ + ⑭를 **모두 배관해도 응답이 바이트 동일**했다(결정세액 419,028,462 불변,
 * `preHousingDisclosureDetail` 부재). `calcSplitGain`(`transfer-tax-split-gain.ts`)이
 * **`!input.landAcquisitionDate`면 즉시 `null`**을 반환하는데, `landAcquisitionDate`는
 * ⑫(`transfer-tax-schema-sub.ts`)·⑭(`bundled-split-helpers.ts`) 어디에도 **없다**.
 * ⇒ 컴패니언은 토지·건물 분리취득 자체를 지원하지 않아 PHD 분기에 **진입조차 못 한다**.
 *   최소 배관은 완전한 no-op이고, 정식 지원은 신규 기능 규모다(사용자 결정 2026-08-23).
 *
 * ## 이 anchor가 지키는 것
 *
 * ⑤ 게이트와 ⑧ 게이트가 **같은 술어**(첫 자산 여부)를 본다는 것. 한쪽만 바뀌면
 * 「화면엔 있는데 검증이 막는다」 또는 그 반대가 되어 dead-end가 재발한다.
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 환산 모드 + PHD 토글 ON, **11필드는 비워 둔 채**. */
function phdAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2000-03-01",
    useEstimatedAcquisition: true,
    usePreHousingDisclosure: true,
    fixedAcquisitionPrice: "",
    standardPriceAtAcq: "",
    standardPriceAtTransfer: "400,000,000",
    ...over,
  } as AssetForm;
}

describe("N6 — 컴패니언 §164⑤ PHD 미지원 (⑤·⑧ 동일 술어)", () => {
  it("N6-01: 첫 자산은 종전대로 11필드를 요구한다 (primary 회귀 방지)", () => {
    const msg = validateAssetAcquisition(phdAsset(), "자산 1", "2024-06-01", false);
    expect(msg).toBe("자산 1: 최초 고시일을 입력하세요.");
  });

  it("N6-02: 🔴 첫 자산이 아니면 PHD 11필드를 요구하지 않는다", () => {
    const msg = validateAssetAcquisition(phdAsset(), "자산 2", "2024-06-01", true);
    // PHD를 요구하지 않으므로 「최초 고시일」 메시지가 나오지 않는다.
    expect(msg).not.toBe("자산 2: 최초 고시일을 입력하세요.");
    /**
     * 대신 일반 환산 경로로 떨어져 **취득 당시 기준시가**를 요구한다 —
     * ⑤가 띄우는 안내(「취득 당시 기준시가를 직접 입력합니다」)와 **같은 말**이어야 한다.
     */
    expect(msg).toBe("자산 2: 취득 당시 기준시가를 입력하세요.");
  });

  it("N6-03: 첫 자산이 아니어도 기준시가를 채우면 통과한다 (dead-end 부재)", () => {
    const msg = validateAssetAcquisition(
      phdAsset({ standardPriceAtAcq: "100,000,000" }),
      "자산 2",
      "2024-06-01",
      true,
    );
    expect(msg).toBeNull();
  });

  it("N6-04: PHD 토글이 꺼져 있으면 첫 자산 여부와 무관하게 동작이 같다", () => {
    const off = phdAsset({ usePreHousingDisclosure: false, standardPriceAtAcq: "100,000,000" });
    expect(validateAssetAcquisition(off, "자산", "2024-06-01", false)).toBeNull();
    expect(validateAssetAcquisition(off, "자산", "2024-06-01", true)).toBeNull();
  });

  it("N6-05: 기본값은 `false`(첫 자산) — 인자를 안 넘긴 기존 호출부가 안 바뀐다", () => {
    expect(validateAssetAcquisition(phdAsset(), "자산", "2024-06-01")).toBe(
      "자산: 최초 고시일을 입력하세요.",
    );
  });
});
