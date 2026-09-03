/**
 * anchor ⑧ — 인가일 이후 「사실상 주거용 사용」 종료일 검증 (R8, 2026-09-03)
 *
 * 자동 안분 fallback 금지: 종료일을 모르면 합산 기간을 지어낼 수 없다. 「양도일까지」로 메우면
 * **철거 후 기간까지 세어 과대 산정**된다 — 사전-2019-법령해석재산-0739은 철거 전 사실상
 * 주거용 사용 기간만 합산한다.
 */
import { describe, it, expect } from "vitest";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    redevSettlementAmount: "100000000",
    acquisitionDate: "2018-01-01",
    redevApprovalDate: "2019-03-01",
    ...over,
  };
}

describe("R8 ⑧ — 사실상 주거용 사용 종료일", () => {
  it("V1: 토글 ON + 종료일 미입력 → 차단", () => {
    const msg = validateRedevelopmentAsset(
      asset({ redevPostApprovalHousingUse: "yes", redevPostApprovalHousingUseEndDate: "" }),
      "자산 1",
    );
    expect(msg).toContain("사용 종료일");
    expect(msg).toContain("0739");
  });

  it("V2: 종료일이 인가일 이전·같은 날 → 차단 (합산할 기간이 없다)", () => {
    for (const end of ["2018-06-01", "2019-03-01"]) {
      const msg = validateRedevelopmentAsset(
        asset({ redevPostApprovalHousingUse: "yes", redevPostApprovalHousingUseEndDate: end }),
        "자산 1",
      );
      expect(msg, `종료일 ${end}`).toContain("관리처분계획인가일 이후");
    }
  });

  it("V3: 정상 입력은 이 규칙에서 막히지 않는다", () => {
    const msg = validateRedevelopmentAsset(
      asset({
        redevPostApprovalHousingUse: "yes",
        redevPostApprovalHousingUseEndDate: "2020-02-01",
      }),
      "자산 1",
    );
    expect(msg == null || !msg.includes("사실상 주거용")).toBe(true);
  });

  it("V4: 토글 OFF면 종료일이 비어 있어도 막지 않는다 (대조군 — 회귀 0)", () => {
    const msg = validateRedevelopmentAsset(
      asset({ redevPostApprovalHousingUse: "", redevPostApprovalHousingUseEndDate: "" }),
      "자산 1",
    );
    expect(msg == null || !msg.includes("사실상 주거용")).toBe(true);
  });
});
