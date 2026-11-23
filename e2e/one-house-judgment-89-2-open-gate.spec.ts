/**
 * E2E — §89② 예외 조문 판정 보류 고지(`89-2-open:*`)는 본체 판정이 비과세로 설 때만 낸다(2026-11 리뷰 I-26 · 사용자 결정 2026-11-23).
 *
 * 시료: 1주택 + 상속받은 입주권 2개(§156의2⑥·⑦ 「1개」 전제 밖 → 판정 보류) · 비조정 · 2023-10-15 양도 8억.
 *   OG-1 보유 8년 → 비과세 + 「§156의2 ⑥·⑦에 해당하는지를 판정하지 않았습니다」 고지
 *   OG-2 보유 9개월 → 과세(보유 미달 — 조문이 성립해도 같은 결론) · 고지 없음(종전: 고지)
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const right = (id: string, acquisitionDate: string) => ({
  id,
  type: "redevelopment_right",
  acquisitionDate,
  region: "non_capital",
  memberOrigin: "successor",
  isInherited: true,
  inheritedDate: acquisitionDate,
  decedentHouseholdSeparate: true,
});

async function seedAndJudge(page: Page, acquisitionDate: string) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2023-10-15",
    contractTotalPrice: "800000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    assets: [{ assetKind: "housing", acquisitionDate }],
    houses: [],
    presaleRights: [right("a", "2022-01-01"), right("b", "2022-02-01")],
  });
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

const OPEN = '[data-testid^="one-house-undetermined-89-2-open:"]';

test("[OG-1] 보유 8년(본체 비과세) → 비과세 + §156의2 ⑥·⑦ 판정 보류 고지", async ({ page }) => {
  await seedAndJudge(page, "2015-05-10");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.locator(OPEN)).toHaveCount(1);
  await expect(page.locator(OPEN)).toContainText("§156의2 ⑥·⑦에 해당하는지를 판정하지 않았습니다");
});

test("[OG-2] 보유 9개월(보유 미달 과세) → 고지 없음", async ({ page }) => {
  await seedAndJudge(page, "2023-01-10");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.locator(OPEN)).toHaveCount(0);
});
