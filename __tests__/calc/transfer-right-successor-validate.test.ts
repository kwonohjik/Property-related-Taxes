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

  it("stale 환산 모드는 차단한다 (§166③은 승계에 적용되지 않는다)", () => {
    const err = validateAssetAcquisition(
      successorRight({ useEstimatedAcquisition: true }),
      "자산1",
      "2026-02-16",
    );
    expect(err).toContain("환산취득가액을 지원하지 않습니다");
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
