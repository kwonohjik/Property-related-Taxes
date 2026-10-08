/**
 * 판정 메뉴 — 해석이 갈리는 쟁점(P4) → 두 입장의 결론 (브라우저 경로)
 *
 * 감지·재판정·배지·④⑫⑭는 anchor(`one-house-contested-dual-view.anchor.test.tsx`)와 해석례 평가셋이 고정한다. 여기서만
 * 관측되는 것은 **명부 행 편집 창의 입력이 판정 본문으로 실리고, 결과 화면이 두 결론과 「해석이 갈림」 배지를 그리는가**다.
 *
 * - CT-1(C1): 별도세대 부친에게서 상속받은 주택 지분을 배우자에게 증여한 세대가 일반주택 양도(서면-2015-부동산-1363 ↔
 *   조심-2023-서-10059). 일자는 현행 기준으로 옮겼다.
 * - CT-2(C2): 동일세대 부친에게서 공동상속받은 주택 소수지분을 보유한 세대가 일반주택 양도(서면-2021-법규재산-0843 ↔
 *   조심-2023-중-7006).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const C1 = "155-2-inherited-house-gifted-within-household";
const C2 = "155-3-same-household-co-inherited-minority";

async function seed(page: Page, inheritedRow: Record<string, unknown>) {
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
        decedentSameHouseholdAtInheritance: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        ...inheritedRow,
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

test("[CT-1] 상속주택 증여 칩 → 본문에 실리고 「해석이 갈림」 · 입장 A 과세 / 입장 B 비과세", async ({ page }) => {
  await seed(page, {});
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId("house-row-inherited-gifted-to-household-member").getByRole("switch").click();
  await page.getByRole("button", { name: "완료" }).click();
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")).toMatchObject({ isInherited: true, inheritedGiftedToHouseholdMember: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("해석이 갈림");
  await expect(page.getByTestId(`one-house-contested-${C1}-A-verdict`)).toHaveText("과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-note`)).toContainText("입장 B에 따릅니다");
});

test("[CT-1b] 짝 — 증여 칩 없이 상속주택이면 쟁점 카드 없이 비과세", async ({ page }) => {
  await seed(page, {});
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")?.inheritedGiftedToHouseholdMember).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}`)).toHaveCount(0);
});

test("[CT-2] 동일세대 공동상속 소수지분 → 「해석이 갈림」 · 입장 A 과세 / 입장 B 비과세", async ({ page }) => {
  await seed(page, { isCoInherited: true, isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: true });
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("해석이 갈림");
  await expect(page.getByTestId(`one-house-contested-${C2}-A-verdict`)).toHaveText("과세");
  await expect(page.getByTestId(`one-house-contested-${C2}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C2}-note`)).toContainText("입장 A에 따릅니다");
});
