import { test, expect, type Page } from "@playwright/test";

/** E2E: 증여로 보는 경우 — 감자 §39의2 다주주(불균등 N:N 안분). 교재 두 계산사례 재현. */

async function openDetail(page: Page) {
  await page.getByTestId("deemed-type-capital_decrease").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("4");
  await dialog.getByLabel("일", { exact: true }).fill("1");
}

type Row = { name: string; pre: string; redeemed: string; price?: string; group: string };

async function fillShareholders(page: Page, rows: Row[]) {
  for (let i = 0; i < rows.length; i++) await page.getByTestId("cd-sh-add").click();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = page.getByTestId(`cd-shareholder-row-${i}`);
    await page.getByTestId(`cd-sh-name-${i}`).fill(r.name);
    await row.getByPlaceholder("감자 전 보유 주식수").fill(r.pre);
    await row.getByPlaceholder("소각 주식수 (0이면 잔존주주)").fill(r.redeemed);
    if (r.price) await row.getByPlaceholder("소각 1주당 지급액").fill(r.price);
    await page.getByTestId(`cd-sh-group-${i}`).fill(r.group);
  }
}

test.describe("§39의2 감자 다주주(N:N 안분)", () => {
  test("사례1 저가소각 — 병 증여재산가액 2,228,571,428 / 감자후평가 67,143", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");
    await dialog.getByTestId("cd-mode-multi").click();
    await dialog.getByPlaceholder("할증 미적용(§53⑧3호)·§60 평가액").fill("30000");
    await dialog.getByPlaceholder("감자 전 발행주식총수").fill("200000");
    await fillShareholders(page, [
      { name: "갑", pre: "100000", redeemed: "100000", price: "10000", group: "famA" },
      { name: "을", pre: "30000", redeemed: "30000", price: "10000", group: "famA" },
      { name: "병", pre: "60000", redeemed: "0", group: "famA" },
      { name: "소액주주", pre: "10000", redeemed: "0", group: "other" },
    ]);
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("cd-multi-matrix")).toContainText("2,228,571,428");
    await expect(page.getByTestId("cd-multi-post-value")).toContainText("67,143");
  });

  test("사례2 고가소각 — 병 180,000,000·정 60,000,000 / 감자후평가 4,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");
    await dialog.getByTestId("cd-mode-multi").click();
    await dialog.getByPlaceholder("할증 미적용(§53⑧3호)·§60 평가액").fill("6000");
    await dialog.getByPlaceholder("고가게이트 §29의2①2호 + 대주주 액면 3억 §28②").fill("10000");
    await dialog.getByPlaceholder("감자 전 발행주식총수").fill("200000");
    await fillShareholders(page, [
      { name: "갑", pre: "80000", redeemed: "0", group: "famB" },
      { name: "을", pre: "40000", redeemed: "0", group: "famB" },
      { name: "병", pre: "60000", redeemed: "60000", price: "9000", group: "famB" },
      { name: "정", pre: "20000", redeemed: "20000", price: "9000", group: "famB" },
    ]);
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("cd-multi-matrix")).toContainText("180,000,000");
    await expect(page.getByTestId("cd-multi-matrix")).toContainText("60,000,000");
    await expect(page.getByTestId("cd-multi-post-value")).toContainText("4,000");
  });
});
