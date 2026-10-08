/**
 * 「동 안 일부 지구만 조정대상지역」인 동 — 판정 메뉴 ② 소재지 아래 「지정 지구 안인가」 질문 (2026-10-08 사용자 결정).
 *
 * 2019.11.8.~2020.6.18. 고양시 일산서구 대화동은 「킨텍스1단계 도시개발지구」만 조정대상지역이었다. 종전에는 대화동 전체가
 * 지정으로 나왔고 소재지 코드가 선언을 이겨 벗어날 길이 없었다. 유닛(`regulated-district-only.anchor.test.tsx`)은 판정·
 * leaf를 본다. 여기서는 질문이 실제로 뜨고, 고른 값이 자동 판정 카드와 판정 결과에 닿는지를 본다.
 *
 * 🔑 소재지는 시드한다 — 주소 검색(Vworld)은 별개 축이다(`one-house-judgment-step-jump-gate.spec.ts`와 같은 판단).
 */
import { test, expect, type Page } from "@playwright/test";

async function seedDaehwa(page: Page) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    ([s]) => sessionStorage.setItem("one-house-judgment-wizard", s as string),
    [
      JSON.stringify({
        state: {
          formData: {
            isOneHousehold: true,
            transferDate: "2026-02-23",
            contractTotalPrice: "900000000",
            houses: [],
            presaleRights: [],
            assets: [
              {
                assetKind: "housing",
                acquisitionDate: "2020-01-15",
                addressJibun: "경기도 고양시 일산서구 대화동 2600",
                regionCode: "4128710400",
              },
            ],
          },
        },
        version: 0,
      }),
    ],
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

function sidebarStep(page: Page, name: string) {
  return page.getByRole("navigation", { name: "진행 단계" }).getByRole("button", { name });
}

test.describe("판정 메뉴 — 지정 지구 안인가", () => {
  test("[DD-1] 대화동(2020.1. 취득)이면 질문이 뜨고, 「지구 밖」을 고르면 취득 당시 조정대상지역 미해당", async ({ page }) => {
    await seedDaehwa(page);
    const q = page.getByTestId("designated-district-question-selling");
    await expect(q).toBeVisible();
    await expect(q).toContainText("킨텍스1단계 도시개발지구");

    const auto = page.getByTestId("one-house-regulated-auto");
    await expect(auto).toContainText("해당");
    await expect(auto).toContainText("지구 안인지 확인 필요");

    await page.getByTestId("designated-district-out-selling").click();
    await expect(auto).toContainText("미해당");
  });

  /** 🔑 음성 짝 — 고르지 않으면 지정으로 보고, 결과의 「판정하지 않은 부분」에 확인 필요가 남는다. */
  test("[DD-2] 고르지 않으면 판정 결과에 지정 지구 확인 필요가 남는다", async ({ page }) => {
    await seedDaehwa(page);
    await sidebarStep(page, "판정 결과").click();
    const result = page.getByTestId("one-house-judgment-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("지구 안인지 고르지 않아");
  });
});
