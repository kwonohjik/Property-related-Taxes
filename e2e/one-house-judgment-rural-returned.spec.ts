/**
 * 판정 메뉴 ③ — 이농주택(§155⑦2호) 행에서 「이농 후 이 주택으로 다시 귀농」을 답 → 판정 본문 → 결과 (브라우저 경로)
 *
 * 엔진 술어·⑧·④는 anchor가 고정한다(`rural-returned-to-farm-exit-house.anchor.test.ts` 두 파일). 여기서만 관측되는 것은
 * **행 편집 모달의 라디오가 그 행에 붙어 판정 본문 `ruralHouse.returnedToFarmExitHouse`로 실리고, 결론이 바뀌는가**다.
 *
 * 시나리오: 부동산납세과-67 — 20여 년 거주한 농어촌주택에서 이농해 도시 주택을 취득했다가 그 농어촌주택으로 다시
 * 귀농한 뒤 도시 주택 양도 → 이농주택 특례 부적용. 일자는 현행 기준으로 옮겼다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seed(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-11-30",
    contractTotalPrice: "500000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    assets: [{ assetKind: "housing", acquisitionDate: "2020-01-15" }],
    houses: [
      {
        id: "a",
        region: "non_capital",
        acquisitionDate: "1995-05-15",
        officialPrice: "80000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        oneHouseRuralHouse: true,
        ruralHouseKind: "farm_exit",
        ruralOutsideCapitalEupMyeon: true,
        ruralOwnerResidenceYears: "20",
      },
    ],
  });
}

async function answer(page: Page, choice: "yes" | "no") {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId(`house-row-rural-returned-${choice}`).click();
  await page.getByRole("button", { name: "완료" }).click();
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

test("[RR-1] 「다시 귀농」 → 본문에 실리고 과세 · 그 사유를 보인다", async ({ page }) => {
  await seed(page);
  await answer(page, "yes");
  const body = await judge(page);
  expect(body.ruralHouse).toMatchObject({ kind: "farm_exit", returnedToFarmExitHouse: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/이농한 뒤 이 주택으로 다시 귀농했습니다/).first()).toBeVisible();
});

test("[RR-2] 짝 — 「아닙니다」 → 이농주택 특례로 비과세", async ({ page }) => {
  await seed(page);
  await answer(page, "no");
  const body = await judge(page);
  expect(body.ruralHouse).toMatchObject({ kind: "farm_exit", returnedToFarmExitHouse: false });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});

test("[RR-3] 답하지 않으면 판정이 막히고 그 사유가 뷰포트에 보인다", async ({ page }) => {
  await seed(page);
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByText(/다시 이 주택으로 돌아왔는지 선택하세요/).first()).toBeInViewport();
  await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
});
