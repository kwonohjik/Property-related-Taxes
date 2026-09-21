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
 *
 * ## 🔄 화면이 **판정 메뉴로 옮겨졌다** (P6-b)
 *
 * §155⑦의 중과 배제는 영 §167의10①15호(「§154①의 요건을 모두 충족」 2요소)라 비과세 판정을
 * 경유한다 ⇒ 계산기 ③에서 판정 메뉴로. 자동판정 `useEffect`도 판정 메뉴 쪽 사본
 * (`one-house-exemption/steps/Step2.tsx`)이 소유한다. **같은 컴포넌트**라 단언은 바뀌지 않는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";

/** 판정 메뉴는 주택 수를 **명부**에서 센다 — `householdHousingCount`는 덮어써진다. */
function gotoHolding(page: Page, over: Record<string, unknown> = {}) {
  return gotoJudgmentStep2(page, {
    assets: [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2018-01-01",
      },
    ],
    transferDate: "2026-06-01",
    ruralHouseSpecial: true,
    ruralHouseKind: "inherited",
    ...over,
  });
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
