/**
 * 승계조합원 입주권 — ⑧ validate anchor
 *
 * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §5 Phase 5 · S8
 *
 * 착수 전 실측(§2.4(3)): 승계조합원 입주권은 **어느 경로로도 계산할 수 없었다**.
 *   `validateRedevelopmentAsset:155`가 「인가일은 취득일 이후여야 합니다. … "승계조합원 모드"를
 *   ON 하세요」로 막는데, 그 토글은 #1245에서 입주권 화면에서 제거됐다(완공APT 전용 분리).
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function successorRight(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in" as const,
    acquisitionCause: "purchase" as const,
    isSuccessorRightToMoveIn: true,
    acquisitionDate: "2020-05-01", // 관리처분 인가(2018-10-23) 이후 승계취득
    redevSubject: "right",
    redevApprovalDate: "2018-10-23",
    actualSalePrice: "500,000,000",
    successorRightAcqPrice: "350000000",
    successorRightAddedContribution: "90000000",
    useEstimatedAcquisition: false,
    ...over,
  } as unknown as AssetForm;
}

describe("승계조합원 입주권 validate", () => {
  it("S8: 정상 입력이 통과한다 (종전에는 「승계조합원 모드를 ON 하세요」로 영구 차단)", () => {
    expect(validateAssetAcquisition(successorRight(), "자산1", "2026-02-16")).toBeNull();
  });

  it("추가분담금 미입력도 통과한다 (승계 직후 양도 — 0이 정상)", () => {
    expect(
      validateAssetAcquisition(successorRight({ successorRightAddedContribution: "" }), "자산1", "2026-02-16"),
    ).toBeNull();
  });

  it("승계취득가액 미입력은 차단하고 §97①1호 가목을 지목한다", () => {
    const err = validateAssetAcquisition(successorRight({ successorRightAcqPrice: "" }), "자산1", "2026-02-16");
    expect(err).toContain("승계취득가액");
    expect(err).toContain("§97①1호 가목");
  });

  it("인가일이 취득일보다 나중이면 「원조합원 아닌가」로 지목한다", () => {
    const err = validateAssetAcquisition(
      successorRight({ acquisitionDate: "2015-03-01" }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toContain("원조합원");
  });

  /**
   * 🔴 2026-08-23 **정책 변경** (R-12) — 종전 단언은 「환산취득가액을 지원하지 않습니다」였다.
   *
   * 당시 사유는 「입주권의 §99①2호 기준시가 산정 경로가 없다」였는데 **그것이 사실이 아니었다** —
   * 영 **§165①**이 「취득일 또는 양도일까지 납입한 금액 + 그 시점의 프리미엄」으로 명문 규정하고,
   * 환산 산식(영 §176의2②**2호**)도 「법 §94①2호**가목** … 부동산을 취득할 수 있는 권리」를
   * 명시 대상으로 삼는다. ⇒ 미지원 사유는 「근거 없음」이 아니라 「구현하지 않았음」이었다.
   *
   * 이제 환산은 **열려 있고**, 차단은 「지원 안 함」이 아니라 **§165① 기준시가 미입력**으로 바뀐다.
   * 그 차단이 없으면 환산 분자가 0이 되어 취득가액이 **0**으로 계산된다(실측 P-8 ⑤).
   */
  it("환산 모드 + §165① 기준시가 미입력 → 차단 (취득가액 0 방지)", () => {
    const err = validateAssetAcquisition(
      successorRight({ useEstimatedAcquisition: true }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toContain("§165①");
  });

  it("환산 모드 + §165① 4칸 입력 → 통과", () => {
    const err = validateAssetAcquisition(
      successorRight({
        useEstimatedAcquisition: true,
        successorRightStdPaidAtAcq: "250000000",
        successorRightStdPremiumAtAcq: "50000000",
        successorRightStdPaidAtTransfer: "500000000",
        successorRightStdPremiumAtTransfer: "100000000",
      }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toBeNull();
  });

  it("환산 모드 + 취득당시만 입력(양도당시 누락) → 분모 차단", () => {
    const err = validateAssetAcquisition(
      successorRight({
        useEstimatedAcquisition: true,
        successorRightStdPaidAtAcq: "300000000",
      }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toContain("양도당시 기준시가");
  });

  it("§166 전용 필드(권리가액·청산금)를 요구하지 않는다 — 승계는 §166 대상이 아니다", () => {
    const err = validateAssetAcquisition(
      successorRight({ redevRightsValue: "", redevSettlementAmount: "", redevSettlementDirection: "" }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toBeNull();
  });
});

describe("원조합원 입주권 무변경 트립와이어", () => {
  it("원조합원은 §166 검증을 그대로 탄다 — 권리가액 미입력 시 차단", () => {
    const err = validateAssetAcquisition(
      successorRight({
        isSuccessorRightToMoveIn: false,
        acquisitionDate: "2015-03-01",
        redevSettlementDirection: "pay",
        redevRightsValue: "",
        redevActualAcquisitionPrice: "100000000",
      }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toContain("권리가액");
  });
});
