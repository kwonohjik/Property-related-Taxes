/**
 * 조합원입주권 「취득 경위」(원조합원 / 승계취득) — 판정 메뉴 ③ 명부 행 (2026-10-08 사용자 결정).
 *
 * 기존주택 원조합원은 §155① 일시적 2주택(사전-2018-법령해석재산-0620 — 기존주택 취득일부터 3년)이고, 상가·토지
 * 원조합원·승계취득은 §156의2③·④다(재산세과-1708). 주택 양도면 이 칸이 필수다(⑧).
 *
 * 유닛(`article-89-2-original-member-right.anchor.test.ts`)은 엔진·leaf를 본다. 여기서는 칸이 실제로 뜨고,
 * 비우면 ③에서 막히며, 고르면 판정 결과까지 가는지를 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function seedRight(page: Page) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    ([s]) => sessionStorage.setItem("one-house-judgment-wizard", s as string),
    [
      JSON.stringify({
        state: {
          formData: {
            isOneHousehold: true,
            houses: [],
            presaleRights: [
              { id: "p1", type: "redevelopment_right", acquisitionDate: "2021-06-01", region: "capital" },
            ],
          },
        },
        version: 0,
      }),
    ],
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
}

/** ② 양도 주택 — 2018-01-01 취득 · 2024-03-01 양도(입주권 행 취득일부터 3년 이내). */
async function fillSaleStep(page: Page) {
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await fillDateAndVerify(page, { year: "2018", month: "01", day: "01" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2024", month: "03", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");
}

function sidebarStep(page: Page, name: string) {
  return page.getByRole("navigation", { name: "진행 단계" }).getByRole("button", { name });
}

test.describe("판정 메뉴 — 조합원입주권 취득 경위", () => {
  test("[OM-1] 비우면 ③에서 막히고, 기존주택 원조합원을 고르면 날짜 칸이 기존주택 취득일이 되어 판정까지 간다", async ({ page }) => {
    await seedRight(page);
    await fillSaleStep(page);

    await sidebarStep(page, "판정 결과").click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
    await expect(page.getByText("인지 승계취득인지 선택하세요", { exact: false })).toBeVisible();
    await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);

    await page.getByTestId("presale-member-origin-original-house-0").click();
    await expect(page.getByText("기존주택 취득일", { exact: true })).toBeVisible();

    await sidebarStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  });

  /** 🔑 음성 짝 — 승계취득을 골라도 같은 관문을 통과한다(특정 경위 전용 막힘이 아니다). */
  test("[OM-2] 승계취득을 고르면 날짜 칸 라벨은 그대로 「취득일」이고 판정까지 간다", async ({ page }) => {
    await seedRight(page);
    await fillSaleStep(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();

    await page.getByTestId("presale-member-origin-successor-0").click();
    await expect(page.getByText("기존주택 취득일", { exact: true })).toHaveCount(0);

    await sidebarStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  });
});
