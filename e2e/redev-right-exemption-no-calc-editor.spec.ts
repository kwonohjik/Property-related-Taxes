/**
 * ③-c 「비과세 보유 요건」 카드는 **완공APT 전용** — 입주권 화면에 편집기가 없다 (P6-c-3).
 *
 * ## 왜 새로 만드나 — 이 조합엔 E2E 안전망이 **0건**이었다
 *
 * 필드명 역방향 grep(`redevExemptionEligibleAtApproval`·`redevPostApprovalHousingUse`·
 * `redevExemption-`) 결과 ③-c를 건드리는 spec은 2건뿐이었고 **둘 다 입주권이 아니었다**
 * (`redev-receive-only-filing-total`은 `redevSubject: "apt"`,
 * `non-housing-to-housing-conversion`은 「사실상 주거용 사용 **개시일**」 — 용도변경 쪽의 다른 필드).
 *
 * 그래서 아래 중복이 아무 게이트에도 걸리지 않은 채 있었다.
 *
 * ## 🔴 고친 결함
 *
 * ③-c 렌더 게이트에 `!isRightSubject`가 빠져 있었다. 입주권 + 청산금 **수령** + 1세대1주택이면
 * 한 화면에 이 둘이 **동시에** 떴다:
 *
 * | 위젯 | 같은 필드에 대해 |
 * |---|---|
 * | `ImportedRedevRightFactsCard` (P6-c-1) | 「이 화면에서는 수정할 수 없습니다」 + 읽기 전용 표시 |
 * | `ExemptionAtApprovalCard` ③-c | 3-state 라디오로 **편집** |
 *
 * RTL 실측: 요약 렌더 true + 라디오 3개 동시.
 *
 * 입주권의 §89①4호 선언은 판정 메뉴가 소유한다. 완공APT는 판정 메뉴에 입력 경로가 없어
 * (④가 `assetKind === "right_to_move_in"`만 보낸다) 계산기가 계속 소유한다 — 축으로 갈랐다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** ③-c가 열리는 축: 청산금 **수령** + 원조합원 + 1세대1주택. */
function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            acquisitionDate: "2010-01-01",
            acquisitionCause: "purchase",
            redevApprovalDate: "2020-10-23",
            redevApprovalLawBasis: "urban_renovation_art_74",
            redevOriginalAssetType: "housing",
            redevSettlementDirection: "receive",
            redevIsSuccessorMember: "no",
            redevRightsValue: "800000000",
            redevSettlementAmount: "100000000",
            redevExemptionEligibleAtApproval: "yes",
            ...over,
          },
        ],
        transferDate: "2026-06-01",
        isOneHousehold: true,
        householdHousingCount: "1",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoRedevBlock(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3, 0);
}

test.describe("③-c 비과세 보유 요건 — 양도 대상 축", () => {
  /** 🔴 이관의 본체. 부정형이므로 아래 긍정 짝과 함께 읽어야 한다. */
  test("[RC3-1] 입주권 — 계산기에 3-state 편집 라디오가 없고 읽기 전용 요약만 있다", async ({ page }) => {
    await gotoRedevBlock(page, {
      assetKind: "right_to_move_in",
      redevSubject: "right",
    });

    await expect(page.locator('input[name^="redevExemption-"]')).toHaveCount(0);
    await expect(page.getByText("비과세 보유 요건")).toHaveCount(0);
    // 판정 메뉴에서 넘어온 값은 읽기 전용으로 남는다 — 값은 살아서 세액을 바꾼다(OH-21).
    await expect(page.getByTestId("redev-right-calc-card")).toBeVisible();
    await expect(page.getByTestId("imported-redev-right-facts")).toContainText("충족 선언");
  });

  /**
   * 🔴 **RC3-1의 긍정 짝.** 없으면 「게이트가 과하게 좁아 완공APT에서도 사라졌다」와
   *    구별되지 않는다. 완공APT는 판정 메뉴에 입력 경로가 없어 이 라디오가 유일하다 —
   *    사라지면 §95② 표1 강등을 선언할 방법 자체가 없어진다.
   */
  test("[RC3-2] 완공APT — 3-state 편집 라디오가 남는다", async ({ page }) => {
    await gotoRedevBlock(page, {
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
    });

    await expect(page.getByText("비과세 보유 요건")).toBeVisible();
    await expect(page.getByRole("radio", { name: /선언 안 함/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /미충족으로 선언/ })).toBeVisible();
    // 입주권 전용 읽기 전용 요약은 여기 없다.
    await expect(page.getByTestId("redev-right-calc-card")).toHaveCount(0);
  });
});
