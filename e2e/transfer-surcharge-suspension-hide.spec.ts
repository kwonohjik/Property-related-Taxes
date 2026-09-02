/**
 * 다주택 중과 한시배제기간(2022-05-10~2026-05-09, 보유 2년 이상) → Step4 ④ **중과 전용** 입력
 * 숨김 + 안내 카드 노출 E2E.
 *
 * 근거: 소득세법 시행령 §167의3①12의2·§167의10①12의2.
 * 계획서: docs/02-design/features/transfer-surcharge-grace-period-ui-hide.plan.md §4-C·§8.
 *
 * 🔴 2026-09-02 정정 — 종전 이 spec은 「다른 보유 주택 목록」이 **0건**임을 단언해
 * **결함을 특성화**하고 있었다. 세대 보유 주택 목록은 §104⑦ 중과뿐 아니라 §155②③
 * 상속주택·§89② 분양권이라는 **비과세(§89①3호) 축**의 유일한 입력 경로여서, 한시배제
 * 창에서 사라지면 12억 비과세를 통째로 잃는다(실측 141,966,000원). 지금은 목록이
 * **보이는 것**이 정답이고, 숨는 것은 중과 전용인 「양도일 기준 조정대상지역」뿐이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(transferDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2020-01-01", // 보유 2년 이상
          },
        ],
        transferDate,
        householdHousingCount: "3", // 다주택 (④ 트리거)
        isOneHousehold: false,
        isRegulatedArea: true,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, transferDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(transferDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("다주택 중과 한시배제 → 중과 전용 입력만 숨김", () => {
  test("배제기간 내(2025-06-01) + 보유 2년↑ → 안내 카드 노출 + 조정대상지역 토글 숨김", async ({
    page,
  }) => {
    await gotoHolding(page, "2025-06-01");
    await expect(page.getByTestId("surcharge-suspended-notice")).toBeVisible();
    /**
     * 중과 전용 입력(양도일 기준 조정대상지역)만 사라진다.
     * ⚠️ `getByText`는 쓸 수 없다 — 위 안내 카드가 같은 문구를 **인용**하고 있어 2곳에 걸린다.
     *    토글 자체를 role로 집는다(memory `feedback_hint_quoting_toggle_title_breaks_selector`).
     */
    await expect(page.getByRole("switch", { name: /양도일 기준 조정대상지역/ })).toHaveCount(0);
  });

  test("배제기간 내에도 세대 보유 주택 목록은 남는다 (§155②③·§89② 비과세 축)", async ({
    page,
  }) => {
    await gotoHolding(page, "2025-06-01");
    await expect(page.getByTestId("surcharge-suspended-notice")).toBeVisible();
    await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
  });

  test("배제기간 밖(2026-05-10) → 안내 카드 없음 + ④ 중과 트랙 노출", async ({ page }) => {
    await gotoHolding(page, "2026-05-10");
    await expect(page.getByTestId("surcharge-suspended-notice")).toHaveCount(0);
    await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("switch", { name: /양도일 기준 조정대상지역/ }).first()).toBeVisible();
  });
});
