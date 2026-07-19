/**
 * §155③ 공동상속주택 (Tier 2-A2 LEAN) — 상속주택 편집 모달 내 공동상속·최대지분 토글 노출 E2E.
 *
 * 상속주택(isInherited) ON 시 "공동상속주택" 토글 노출 → ON 시 "본인이 최대지분 상속인" 칩 토글 노출.
 * 설계: docs/02-design/features/transfer-155-2a2-inheritance-ranking.{engine,ui}.design.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
          },
        ],
        transferDate: "2027-01-01", // 중과 배제기간 밖 → ④ 섹션 노출
        isOneHousehold: true,
        householdHousingCount: "2",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

// ToggleCard Switch의 accessible name = "{title} {description} {title}" 이므로 고유 substring으로 매칭
const INHERITED = "피상속인으로부터 상속받은 주택"; // 상속주택 토글(설명 문구, 공동상속주택과 충돌 회피)
const CO = "공동상속주택";
const LARGEST = "본인이 최대지분 상속인";

test.describe("§155③ 공동상속주택 토글", () => {
  test("상속주택 ON → 공동상속 ON 시 최대지분 토글 단계적 노출", async ({ page }) => {
    await gotoHolding(page);
    // + 주택 추가 → 편집 모달 자동 오픈
    await page.getByRole("button", { name: "주택 추가" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 상속주택 OFF 상태에서는 공동상속 토글 미노출
    await expect(dialog.getByRole("switch", { name: CO })).toHaveCount(0);

    // 상속주택 ON → 공동상속 토글 노출
    await dialog.getByRole("switch", { name: INHERITED }).click();
    await expect(dialog.getByRole("switch", { name: CO })).toBeVisible();

    // 공동상속 OFF 상태에서는 최대지분 토글 미노출
    await expect(dialog.getByRole("switch", { name: LARGEST })).toHaveCount(0);

    // 공동상속 ON → 최대지분 토글 노출
    await dialog.getByRole("switch", { name: CO }).click();
    await expect(dialog.getByRole("switch", { name: LARGEST })).toBeVisible();
  });
});
