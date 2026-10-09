/**
 * 동일세대 상속 분양권 — §156의3② 3년 기한을 피상속인 취득일부터 센다(사전-2023-법규재산-0464 · 재산세제과-1033 논리).
 *
 * 엔진·노출 술어는 anchor(`inherited-presale-right-timing-start.anchor.test.ts`)가 고정한다. 여기서는 판정 메뉴에서
 * 피상속인 취득일을 넣으면 3년 경과 예외 칸이 뜨고 결론이 바뀌는지를 본다.
 *
 * 시나리오: 주택 A 2015-03-15 · 피상속인(동일세대) 분양권 2022-01-10 · 상속개시 2024-06-01 · 양도 2025-06-01.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const CARD = "권리 취득 후 3년이 지나 양도 — 비과세 예외 선언";

async function seed(page: Page, decedentAcquisitionDate?: string) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2025-06-01",
    contractTotalPrice: "600000000",
    assets: [{ assetKind: "housing", acquisitionDate: "2015-03-15" }],
    houses: [],
    presaleRights: [
      {
        id: "b",
        type: "presale_right",
        acquisitionDate: "2024-06-01",
        region: "capital",
        isInherited: true,
        decedentSameHouseholdAtInheritance: true,
        ...(decedentAcquisitionDate ? { decedentAcquisitionDate } : {}),
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
}

test("[IPRT-1] 피상속인 취득일(2022-01-10)부터 3년 초과 → 예외 칸이 뜨고 과세 + 확인 필요", async ({ page }) => {
  await seed(page, "2022-01-10");
  await expect(page.getByText(CARD)).toBeVisible();
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/피상속인이 취득한 날을 분양권 취득일로 보아/).first()).toBeVisible();
});

test("[IPRT-2] 짝 — 피상속인 취득일이 없으면 상속개시일부터 3년 이내라 칸이 없고 비과세", async ({ page }) => {
  await seed(page);
  await expect(page.getByTestId("presale-decedent-acquisition-date-0")).toBeVisible();
  await expect(page.getByText(CARD)).toHaveCount(0);
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});
