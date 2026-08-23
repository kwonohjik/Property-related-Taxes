/**
 * 입주권 stale 값 정규화 — 재수화(migrate) · 세션 내 전환(patch) 양쪽
 *
 * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §5 Phase 4
 *
 * 왜 두 경로 모두 필요한가:
 *  - `migrateAsset`는 **저장값 재수화 시점**에만 돈다. 다른 자산 종류에서 입주권으로 지금 바꾸는
 *    경우에는 거치지 않는다.
 *  - 한쪽만 두면 「새로고침해야 정상화되는」 상태가 된다.
 *
 * 무엇을 비우나 (계획서 §2.1 · §2.4(3) 실측 근거):
 *  - `isAppraisalAcquisition`·`isSalesCaseAcquisition` — 상단 축 A 제거로 **끌 수단이 없어진** 추계 플래그.
 *    남으면 API가 취득가액 0을 보내 「인가전 양도차익 = 권리가액 − 0」으로 과대과세된다.
 *  - `redevIsSuccessorMember` — 사례 48 **완공APT** 전용 필드. 입주권에 남으면 ⑤ 카드가 숨겨지고
 *    validate가 「준공일을 입력하세요」로 막는데 그 입력칸도 숨겨져 **채울 칸 없는 영구 차단**이 된다.
 *
 * 무엇을 안 비우나:
 *  - `useEstimatedAcquisition` — 원조합원 ⑤ 카드 실가/환산 라디오의 **정본**이다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { redevSubjectPatchForAssetKind } from "@/components/calc/transfer/asset-sections/AssetAreaRedevelopment";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

function staleRightAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in" as const,
    // 종전 완공APT 시절 남은 값들
    isAppraisalAcquisition: true,
    isSalesCaseAcquisition: true,
    redevIsSuccessorMember: "yes",
    redevReceiveOnlyMode: "yes",
    redevNewHouseResidenceMonths: "120",
    useEstimatedAcquisition: true,
    redevActualAcquisitionPrice: "77777777",
    ...over,
  };
}

describe("재수화 경로 — migrateAsset", () => {
  it("입주권의 도달 불가 입력 3종을 비운다", () => {
    const a = migrateAsset(staleRightAsset() as never);
    expect(a.isAppraisalAcquisition).toBe(false);
    expect(a.isSalesCaseAcquisition).toBe(false);
    expect(a.redevIsSuccessorMember).toBe("");
  });

  it("useEstimatedAcquisition은 보존한다 (⑤ 실가/환산 라디오의 정본)", () => {
    const a = migrateAsset(staleRightAsset() as never);
    expect(
      a.useEstimatedAcquisition,
      "비우면 §166③ 환산 모드가 꺼져 원조합원 입주권의 환산 입력이 무력화된다.",
    ).toBe(true);
    expect(a.redevActualAcquisitionPrice).toBe("77777777");
  });

  it("PR #1246의 완공APT 전용 2종 정규화는 그대로다 (회귀 확인)", () => {
    const a = migrateAsset(staleRightAsset() as never);
    expect(a.redevReceiveOnlyMode).toBe("");
    expect(a.redevNewHouseResidenceMonths).toBe("");
  });

  it("완공APT 자산은 건드리지 않는다 (본 PR 범위 밖)", () => {
    const a = migrateAsset(
      staleRightAsset({ assetKind: "redevelopment_apt", redevSubject: "apt" }) as never,
    );
    expect(a.isAppraisalAcquisition).toBe(true);
    expect(a.isSalesCaseAcquisition).toBe(true);
    expect(a.redevIsSuccessorMember).toBe("yes");
  });

  it("신규 2필드가 undefined면 빈 문자열로 채운다 (sessionStorage 호환)", () => {
    const legacy = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete legacy.successorRightAcqPrice;
    delete legacy.successorRightAddedContribution;
    const a = migrateAsset(legacy as never);
    expect(a.successorRightAcqPrice).toBe("");
    expect(a.successorRightAddedContribution).toBe("");
  });
});

describe("세션 내 전환 경로 — redevSubjectPatchForAssetKind", () => {
  it("입주권 전환 patch가 같은 3필드를 함께 비운다", () => {
    const patch = redevSubjectPatchForAssetKind("right_to_move_in");
    expect(patch.redevSubject).toBe("right");
    expect(patch.isAppraisalAcquisition).toBe(false);
    expect(patch.isSalesCaseAcquisition).toBe(false);
    expect(patch.redevIsSuccessorMember).toBe("");
    expect(
      "useEstimatedAcquisition" in patch,
      "환산 모드는 ⑤ 라디오 소유 — 전환 patch가 건드리면 안 된다.",
    ).toBe(false);
  });

  it("완공APT 전환은 redevSubject만 건드린다", () => {
    expect(redevSubjectPatchForAssetKind("redevelopment_apt")).toEqual({ redevSubject: "apt" });
  });

  it("재개발 계열이 아니면 빈 patch", () => {
    expect(redevSubjectPatchForAssetKind("housing")).toEqual({});
  });
});

describe("⑥ 사이드바 — 취득가액 라벨·값", () => {
  function form(asset: Record<string, unknown>) {
    return {
      transferDate: "2026-03-02",
      contractTotalPrice: "420,000,000",
      totalTransferExpense: "0",
      assets: [{ ...makeDefaultAsset(1), assetKind: "right_to_move_in", ...asset }],
      houses: [],
      presaleRights: [],
    } as never;
  }

  /**
   * 2026-08-23 브라우저 실측에서 잡힌 표시 결함 — 승계조합원인데 사이드바가
   * 「인가전 분 취득가액」으로 표시했다. 승계자는 종전 부동산을 소유한 적이 없어
   * 「인가 전 분」이 성립하지 않으므로 입력 카드(「승계취득가액 + 추가분담금」)와
   * 사이드바가 서로 다른 개념을 가리켰다.
   */
  it("승계조합원 입주권 — 라벨은 「취득가액」, 값은 승계취득가 + 추가분담금", () => {
    const { rows: [row] } = computeTransferPerAssetSummary(
      form({
        isSuccessorRightToMoveIn: true,
        successorRightAcqPrice: "350000000",
        successorRightAddedContribution: "20000000",
      }),
      null,
    );
    expect(row.acqLabel).toBe("취득가액");
    expect(row.acqPrice).toBe(370_000_000);
  });

  it("원조합원 입주권 — 라벨은 「인가전 분 취득가액」, 값은 ⑤ 필드", () => {
    const { rows: [row] } = computeTransferPerAssetSummary(
      form({ isSuccessorRightToMoveIn: false, redevActualAcquisitionPrice: "180000000" }),
      null,
    );
    expect(row.acqLabel).toBe("인가전 분 취득가액");
    expect(row.acqPrice).toBe(180_000_000);
  });
});

describe("조합원 유형 토글 — successorRightTogglePatch (단일 배치)", () => {
  it("승계조합원 선택 시 원조합원 전용 필드를 비운다", () => {
    const patch = successorRightTogglePatch(true);
    expect(patch.isSuccessorRightToMoveIn).toBe(true);
    expect(patch.redevActualAcquisitionPrice).toBe("");
    expect(
      patch.useEstimatedAcquisition,
      "승계는 §166③ 환산 대상이 아니고 ⑤ 카드도 사라지므로 끌 수단이 없어진다.",
    ).toBe(false);
  });

  it("원조합원 선택 시 승계 전용 2필드를 비운다", () => {
    const patch = successorRightTogglePatch(false);
    expect(patch.isSuccessorRightToMoveIn).toBe(false);
    expect(patch.successorRightAcqPrice).toBe("");
    expect(patch.successorRightAddedContribution).toBe("");
  });
});
