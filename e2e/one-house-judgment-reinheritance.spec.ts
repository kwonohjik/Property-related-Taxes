/**
 * 판정 메뉴 ③ — 상속주택 행 「별도세대에서 받은 상속주택을 다시 상속」(D17) → 판정 본문 → 결과 (브라우저 경로)
 *
 * 엔진 게이트·④·⑭·판정 보류는 anchor가 고정한다(`reinheritance-separate-household-d17.anchor.test.tsx`). 여기서만 관측되는
 * 것은 **행 편집 창의 칩이 그 행에 붙어 판정 본문 `houses[].reInheritedFromSeparateHousehold`로 실리고, 결론이 바뀌는가**다.
 *
 * 시나리오: 재산세과-2961 · 부동산납세과-624 — 남편이 별도세대 부친에게서 상속받은 주택 A를 남편 사망으로 아내가 재상속,
 * 아내가 일반주택 B 양도. 일자는 현행 기준으로 옮겼다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seed(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-11-30",
    contractTotalPrice: "500000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    assets: [{ assetKind: "housing", acquisitionDate: "2019-03-15" }],
    houses: [
      {
        id: "a",
        region: "non_capital",
        acquisitionDate: "1995-06-15",
        officialPrice: "150000000",
        isInherited: true,
        inheritedDate: "2024-05-15",
        isCoInherited: false,
        decedentSameHouseholdAtInheritance: true,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as { houses?: Record<string, unknown>[] };
}

test("[RI-1] 재상속 칩 → 본문에 실리고 비과세 · 기준일 확인 필요를 보인다", async ({ page }) => {
  await seed(page);
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId("house-row-reinherited-from-separate-household").getByRole("switch").click();
  await page.getByRole("button", { name: "완료" }).click();
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")).toMatchObject({ decedentSameHouseholdAtInheritance: true, reInheritedFromSeparateHousehold: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByText(/최초 상속일을 기준으로 보는지는 확인되지 않았으니/).first()).toBeVisible();
});

test("[RI-2] 짝 — 재상속 표시 없이 동일세대 상속이면 과세", async ({ page }) => {
  await seed(page);
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")?.reInheritedFromSeparateHousehold).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});
