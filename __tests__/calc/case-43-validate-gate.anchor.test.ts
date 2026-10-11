/**
 * anchor — 사례 43 ⑧ 게이트: **두 게이트는 다른 판정**이다
 *
 * `transfer-tax-validate-redev.ts`에는 토지출자+환산+수령 차단이 **둘** 나란히 있다.
 * 모양이 같아 한꺼번에 지우기 쉬운데 판정이 정반대다:
 *
 * | 게이트 | 조합 | 판정 |
 * |---|---|---|
 * | `:88` (종전) | **완공APT**(`subject === "apt"`) | 🔴 **오차단** — 엔진이 이미 §166③·§166①2호를 정확히 적용한다 ⇒ 해제 |
 * | `:93` | **입주권**(`subject === "right"`) | ✅ **정당** — `runLandContribEstimated`가 `settlementPaid` 한 필드뿐인 2분기 모형이라 수령을 표현하지 못하고 **납부 답을 낸다** ⇒ 유지 |
 *
 * 차이는 라우팅에 있다(`redevelopment.ts:188-194`) — `runLandContribEstimated`는
 * `subject === "right"` 전용이고, 완공APT는 `runOriginalMember`로 간다.
 * 종전 주석은 그 사실을 놓치고 **인접 함수의 한계를 완공APT의 한계로 옮겨 적었다.**
 */
import { describe, it, expect } from "vitest";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 토지출자 + 환산 + 청산금 수령 — §166③ 2필드(단가×면적)까지 채운 정상 입력. */
function landEstimatedReceive(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevOriginalAssetType: "land",
    redevSettlementDirection: "receive",
    useEstimatedAcquisition: true,
    acquisitionDate: "2002-04-09",
    redevApprovalDate: "2009-10-23",
    redevRightsValue: "500,000,000",
    redevSettlementAmount: "114,000,000",
    redevSettlementSaleDate: "2023-03-02",
    // §166③ 분자·분모 — 3중 패턴(단가×면적 우선)
    redevLandArea: "100",
    redevLandPricePerSqmAtAcq: "600,000",
    redevLandPricePerSqmAtApproval: "2,000,000",
    ...over,
  };
}

describe("🔴 완공APT 게이트는 오차단이었다", () => {
  it("★ 토지출자 + 완공APT + 수령 + 환산이 차단되지 않는다", () => {
    expect(validateRedevelopmentAsset(landEstimatedReceive(), "자산1")).toBeNull();
  });

  it("🔑 「후속 PR」 안내 문구가 더 이상 나오지 않는다", () => {
    const err = validateRedevelopmentAsset(landEstimatedReceive(), "자산1") ?? "";
    expect(err).not.toContain("후속 PR");
  });
});

describe("✅ 입주권 게이트는 유지된다", () => {
  it("★ 토지출자 + 입주권 + 수령 + 환산은 계속 차단된다 (수령 미구현)", () => {
    const err = validateRedevelopmentAsset(
      landEstimatedReceive({ assetKind: "right_to_move_in", redevSubject: "right" }),
      "자산1",
    );
    expect(err).toContain("후속 PR");
  });

  it("🔑 입주권 + **납부** + 환산은 열려 있다 (사례 37 — 회귀)", () => {
    expect(
      validateRedevelopmentAsset(
        landEstimatedReceive({
          assetKind: "right_to_move_in",
          redevSubject: "right",
          redevSettlementDirection: "pay",
        }),
        "자산1",
      ),
    ).toBeNull();
  });
});

describe("🔑 게이트를 열어도 §166③ 필수 입력 검증은 살아 있다", () => {
  it("취득당시 단가가 없으면 §166③ 분자 사유로 차단된다", () => {
    const err = validateRedevelopmentAsset(
      landEstimatedReceive({ redevLandPricePerSqmAtAcq: "" }),
      "자산1",
    );
    expect(err).toContain("§166③ 분자");
  });

  it("인가당시 단가가 없으면 §166③ 분모 사유로 차단된다", () => {
    const err = validateRedevelopmentAsset(
      landEstimatedReceive({ redevLandPricePerSqmAtApproval: "" }),
      "자산1",
    );
    expect(err).toContain("§166③ 분모");
  });

  it("토지면적이 없으면 면적 사유로 차단된다", () => {
    const err = validateRedevelopmentAsset(
      landEstimatedReceive({ redevLandArea: "" }),
      "자산1",
    );
    expect(err).toContain("토지면적");
  });
});
