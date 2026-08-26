/**
 * anchor — 차단 메시지가 그 화면에 없는 토글을 가리켰다 (P2-05)
 *
 * 「인가일 < 취득일」 차단이 안내하는 우회 수단은 ②-a `SuccessorMemberSection`의
 * 「승계조합원 모드」 토글인데, 그 카드는 `RedevelopmentBlock`이 `{!isRightSubject && …}`로
 * **입주권 화면에서 제거**한다(#1245에서 완공APT 전용으로 분리). 입주권의 승계 여부를 받는
 * 실제 컨트롤은 ① 기본정보의 「조합원 유형」(`isSuccessorRightToMoveIn`)으로 **다른 필드**다.
 *
 * 완전한 dead-end는 아니다 — ① 라디오로 복구할 수 있다. 다만 차단된 사용자가 존재하지 않는
 * 이름의 컨트롤을 찾게 된다. `validateSuccessorRightAsset`이 **반대 방향**에서 이미 쓰는
 * 문구(「① 기본정보의 「조합원 유형」을 "원조합원"으로」)와 짝을 맞춘다.
 */
import { describe, it, expect } from "vitest";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 인가 후 취득한 실제 사안 — 원조합원으로 두면 차단된다. */
function approvalBeforeAcquisition(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    acquisitionDate: "2020-05-10",
    redevApprovalDate: "2016-10-23",
    redevRightsValue: "300,000,000",
    ...over,
  };
}

const V = (a: AssetForm) => validateRedevelopmentAsset(a, "자산 1");

describe("P2-05 · 인가일 < 취득일 차단 메시지는 그 화면에 있는 컨트롤을 가리킨다", () => {
  it("입주권 → ① 기본정보 「조합원 유형」을 가리킨다 (그 화면엔 「승계조합원 모드」가 없다)", () => {
    const message = V(
      approvalBeforeAcquisition({
        assetKind: "right_to_move_in",
        redevSubject: "right",
        isSuccessorRightToMoveIn: false,
      }),
    );
    expect(message).toContain("조합원 유형");
    expect(message).not.toContain("승계조합원 모드");
  });

  it("완공APT → 종전대로 ②-a 「승계조합원 모드」 토글을 가리킨다 (그 화면엔 있다)", () => {
    const message = V(approvalBeforeAcquisition());
    expect(message).toContain("승계조합원 모드");
  });

  it("어느 쪽이든 차단 자체는 유지된다 — 안내 문구만 갈린다", () => {
    expect(V(approvalBeforeAcquisition())).toContain("인가일은 취득일 이후여야 합니다");
    expect(
      V(approvalBeforeAcquisition({ assetKind: "right_to_move_in", redevSubject: "right" })),
    ).toContain("인가일은 취득일 이후여야 합니다");
  });

  it("인가일 ≥ 취득일이면 이 차단은 발동하지 않는다 (과잉 차단 방지)", () => {
    const message = V(approvalBeforeAcquisition({ redevApprovalDate: "2022-10-23" }));
    expect(message).not.toContain("인가일은 취득일 이후여야 합니다");
  });
});
