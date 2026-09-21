/**
 * §155⑦ 농어촌주택 **소재 요건 자동 판별** E2E (W-3).
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md W-3
 *
 * 순수 판정은 `__tests__/lib/geo/rural-house-location.test.ts` 19건이 커버한다.
 * 여기서는 **배선**을 본다: 행 주소 → (읍이면) 용도지역 조회 → 배지·토글 반영.
 *
 * ⚠️ `/api/address/land-use-zone`은 외부(Vworld) 의존이라 route를 mock한다 —
 *    외부 장애가 회귀로 둔갑하지 않도록.
 *
 * ## 🔄 화면이 **명부 행으로 옮겨졌다** (D-6 3b · P7-4)
 *
 * 종전 경로: 계산기 ③ → 판정 메뉴 ③(P6-b) → **명부 행 편집 모달 ⑤**(지금).
 * 법문이 「농어촌주택과 일반주택을 **각각 1개씩** 소유」라 농어촌주택은 보유 중인 다른
 * 주택이고, 「어느 주택인가」가 정본이다.
 *
 * 🔑 **세 칸이 사라졌다** — 소재지는 행 주소(`addressJibun`·`regionCode`), 귀농 취득일은
 *    행의 `acquisitionDate`, `locationTouched`는 `ruralOutsideCapitalEupMyeon`이
 *    optional이라 불필요하다(`undefined` = 자동 판정).
 *
 * 🔴 **자동 판정이 store를 미러링하지 않는다.** 종전에는 `useEffect`가 판정 결과를
 *    폼에 써 넣었다. 지금은 **조회 결과**(`ruralUrbanZone`)만 행에 남기고 판정은
 *    `resolveRuralLocationQualified`가 읽는 시점에 한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 명부에 농어촌 행 1건을 심고 그 행의 편집 모달을 연다. */
async function gotoRuralRow(page: Page, rowOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [
            {
              ...makeDefaultAsset(1),
              addressJibun: "서울 강남구 역삼동 1-1",
              assetKind: "housing",
              acquisitionCause: "purchase",
              acquisitionDate: "2018-01-01",
              actualSalePrice: "900000000",
              fixedAcquisitionPrice: "400000000",
            },
          ],
          transferDate: "2026-06-01",
          contractTotalPrice: "900000000",
          isOneHousehold: true,
          householdHousingCount: "2",
          houses: [
            {
              id: "h1",
              region: "non_capital",
              acquisitionDate: "2015-06-01",
              officialPrice: "200000000",
              isInherited: false,
              isLongTermRental: false,
              isApartment: false,
              isOfficetel: false,
              isUnsoldHousing: false,
              oneHouseRuralHouse: true,
              ruralHouseKind: "inherited",
              ...rowOver,
            },
          ],
          presaleRights: [],
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: /편집/ }).first().click();
}

const verdict = (page: Page) => page.getByTestId("house-row-rural-location");

test.describe("§155⑦ 소재 요건 자동 판별 — 명부 행", () => {
  test("면지역 → 용도지역 조회 없이 충족", async ({ page }) => {
    let zoneCalled = false;
    await page.route("**/api/address/land-use-zone*", async (route) => {
      zoneCalled = true;
      await route.fulfill({ json: { verdict: "urban" } });
    });

    await gotoRuralRow(page, {
      addressJibun: "강원특별자치도 평창군 진부면 하진부리 760",
      regionCode: "5176036021",
    });

    await expect(verdict(page)).toContainText("면지역");
    // 면지역은 도시지역 여부를 따지지 않으므로 조회 자체를 하지 않는다.
    expect(zoneCalled).toBe(false);
  });

  test("🔴 읍 + 도시지역 → 제외로 판정 (실측: 평창읍 하리 = 제2종일반주거지역)", async ({ page }) => {
    await page.route("**/api/address/land-use-zone*", (route) =>
      route.fulfill({ json: { verdict: "urban" } }),
    );

    await gotoRuralRow(page, {
      addressJibun: "강원특별자치도 평창군 평창읍 하리 100",
      regionCode: "5176025021",
    });

    await expect(verdict(page)).toContainText("도시지역");
  });

  test("읍 + 비도시지역 → 충족", async ({ page }) => {
    await page.route("**/api/address/land-use-zone*", (route) =>
      route.fulfill({ json: { verdict: "non_urban" } }),
    );

    await gotoRuralRow(page, {
      addressJibun: "강원특별자치도 평창군 평창읍 하리 100",
      regionCode: "5176025021",
    });

    await expect(verdict(page)).toContainText("소재 요건 충족");
  });

  test("수도권 → 미충족", async ({ page }) => {
    await page.route("**/api/address/land-use-zone*", (route) =>
      route.fulfill({ json: { verdict: "non_urban" } }),
    );
    await gotoRuralRow(page, {
      addressJibun: "경기도 가평군 가평읍 읍내리 100",
      regionCode: "4182025021",
    });
    await expect(verdict(page)).toContainText("수도권");
  });

  /**
   * 🔑 `ruralOutsideCapitalEupMyeon`이 **정의돼 있으면** 자동 판정을 덮는다.
   *    종전 `ruralHouseLocationTouched` 플래그가 하던 일을 optional이 대신한다.
   */
  test("사용자가 토글을 직접 조작하면 자동 판정이 덮지 않는다", async ({ page }) => {
    await gotoRuralRow(page, {
      addressJibun: "서울특별시 강남구 삼성동 100",
      regionCode: "1168010100",
      ruralOutsideCapitalEupMyeon: true,
    });
    // 판정은 미충족이지만 사용자 선택(true)이 유지된다.
    await expect(verdict(page)).toContainText("수도권");
    // ⚠️ ToggleCard는 제목+설명이 accessible name으로 합쳐진다(e2e/CLAUDE.md §2) — 속성 직접 매칭.
    await expect(
      page.locator('[role="switch"][aria-label="수도권 밖 읍·면 소재 (도시지역 읍 제외)"]'),
    ).toHaveAttribute("aria-checked", "true");
  });
});
