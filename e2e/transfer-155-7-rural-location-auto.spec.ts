/**
 * §155⑦ 농어촌주택 **소재 요건 자동 판별** E2E (W-3).
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md W-3
 *
 * 순수 판정은 `__tests__/lib/geo/rural-house-location.test.ts` 19건이 커버한다.
 * 여기서는 **배선**을 본다: 주소 → regionCode·지번 저장 → (읍이면) 용도지역 조회 → 배지·토글 반영.
 *
 * ⚠️ `/api/address/land-use-zone`은 외부(Vworld) 의존이라 route를 mock한다 —
 *    외부 장애가 회귀로 둔갑하지 않도록.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(over: Record<string, unknown>) {
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
        transferDate: "2026-06-01",
        isOneHousehold: true,
        householdHousingCount: "2",
        ruralHouseSpecial: true,
        ruralHouseKind: "inherited",
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("§155⑦ 소재 요건 자동 판별", () => {
  test("면지역 → 용도지역 조회 없이 충족", async ({ page }) => {
    let zoneCalled = false;
    await page.route("**/api/address/land-use-zone*", async (route) => {
      zoneCalled = true;
      await route.fulfill({ json: { verdict: "urban" } });
    });

    await gotoHolding(page, {
      ruralHouseJibun: "강원특별자치도 평창군 진부면 하진부리 760",
      ruralHouseRegionCode: "5176036021",
    });

    await expect(page.getByTestId("rural-location-verdict")).toContainText("면지역");
    // 면지역은 도시지역 여부를 따지지 않으므로 조회 자체를 하지 않는다.
    expect(zoneCalled).toBe(false);
  });

  test("🔴 읍 + 도시지역 → 제외로 판정 (실측: 평창읍 하리 = 제2종일반주거지역)", async ({ page }) => {
    await page.route("**/api/address/land-use-zone*", (route) =>
      route.fulfill({ json: { verdict: "urban" } }),
    );

    await gotoHolding(page, {
      ruralHouseJibun: "강원특별자치도 평창군 평창읍 하리 100",
      ruralHouseRegionCode: "5176025021",
    });

    await expect(page.getByTestId("rural-location-verdict")).toContainText("도시지역");
  });

  test("읍 + 비도시지역 → 충족", async ({ page }) => {
    await page.route("**/api/address/land-use-zone*", (route) =>
      route.fulfill({ json: { verdict: "non_urban" } }),
    );

    await gotoHolding(page, {
      ruralHouseJibun: "강원특별자치도 평창군 평창읍 하리 100",
      ruralHouseRegionCode: "5176025021",
    });

    await expect(page.getByTestId("rural-location-verdict")).toContainText("소재 요건 충족");
  });

  test("수도권 → 조회 없이 미충족", async ({ page }) => {
    await gotoHolding(page, {
      ruralHouseJibun: "경기도 가평군 가평읍 읍내리 100",
      ruralHouseRegionCode: "4182025021",
    });
    await expect(page.getByTestId("rural-location-verdict")).toContainText("수도권");
  });

  test("사용자가 토글을 직접 조작하면 자동 판정이 덮지 않는다", async ({ page }) => {
    await gotoHolding(page, {
      ruralHouseJibun: "서울특별시 강남구 삼성동 100",
      ruralHouseRegionCode: "1168010100",
      ruralHouseOutsideCapitalEupMyeon: true,
      ruralHouseLocationTouched: true,
    });
    // 판정은 미충족이지만 사용자 선택(true)이 유지된다.
    await expect(page.getByTestId("rural-location-verdict")).toContainText("수도권");
    // ⚠️ ToggleCard는 제목+설명이 accessible name으로 합쳐진다(e2e/CLAUDE.md §2) —
    //    aria-label 정확 매칭으로 한정한다.
    // ⚠️ ToggleCard는 제목+설명이 accessible name으로 합쳐지고(e2e/CLAUDE.md §2)
    //    aria-label·aria-labelledby가 둘 다 붙어 있어 getByLabel도 흔들린다 → 속성 직접 매칭.
    await expect(
      page.locator('[role="switch"][aria-label="수도권 밖 읍·면 소재 (도시지역 읍 제외)"]'),
    ).toHaveAttribute("aria-checked", "true");
  });
});
