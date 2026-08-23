/**
 * 입주권 자산의 **완공 APT 전용 저장값 정규화** 봉인 (2026-08-14).
 *
 * 입력 UI를 숨기는 것만으로는 이미 sessionStorage에 저장된 값이 남는다. 게다가 카드가
 * 사라지면 사용자가 그 값을 **끌 수단도 없다** — 그래서 validate 차단이 아니라
 * 마이그레이션 정규화로 처리한다([[feedback-ui-gate-removes-sole-input-path]]).
 *
 * 대상 2필드는 신축 APT가 존재해야 성립하는 사실이라 완공 전 권리 양도인 입주권에는 없다:
 *   `redevReceiveOnlyMode`(사례 46) · `redevNewHouseResidenceMonths`(사례 45)
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

const APT_ONLY = {
  redevReceiveOnlyMode: "yes",
  redevNewHouseResidenceMonths: "120",
};

describe("입주권 — 완공 APT 전용 저장값 정규화", () => {
  it("N-1: 입주권 자산의 두 필드가 비워진다", () => {
    const a = migrateAsset({ assetId: 1, assetKind: "right_to_move_in", ...APT_ONLY });

    expect(a.assetKind).toBe("right_to_move_in");
    expect(a.redevReceiveOnlyMode).toBe("");
    expect(a.redevNewHouseResidenceMonths).toBe("");
  });

  it("N-2: 「APT 자산 + 입주권 양도」 승격분도 함께 비워진다 (PR #1245 승격 경로)", () => {
    const a = migrateAsset({
      assetId: 1,
      assetKind: "redevelopment_apt",
      redevSubject: "right",
      ...APT_ONLY,
    });

    // 자산 종류가 입주권으로 승격된 뒤 정규화가 이어진다 — 순서 의존이므로 함께 봉인한다.
    expect(a.assetKind).toBe("right_to_move_in");
    expect(a.redevReceiveOnlyMode).toBe("");
    expect(a.redevNewHouseResidenceMonths).toBe("");
  });

  it("N-3: 완공 APT 자산은 값이 보존된다 (사례 45·46 회귀 방지)", () => {
    const a = migrateAsset({ assetId: 1, assetKind: "redevelopment_apt", ...APT_ONLY });

    expect(a.assetKind).toBe("redevelopment_apt");
    expect(a.redevReceiveOnlyMode).toBe("yes");
    expect(a.redevNewHouseResidenceMonths).toBe("120");
  });
});
