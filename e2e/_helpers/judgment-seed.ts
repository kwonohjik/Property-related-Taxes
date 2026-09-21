import { expect, type Page } from "@playwright/test";

/**
 * 판정 메뉴(`/calc/one-house-exemption`) ② 화면을 **시드해서** 연다 (P6-b).
 *
 * ## 왜 시드인가
 *
 * ③ 특례 섹션은 **2주택 이상**에서만 열리는데, 판정 메뉴는 주택 수를 `householdHousingCount`
 * 스칼라가 아니라 **명부**(`houses[]`)에서 센다(`deriveJudgmentHouseCount` = 양도 대상 1 +
 * `houses.length`). 화면으로 명부를 채우려면 주소 검색·공시가격까지 거쳐야 해서, 정작
 * 관측하려는 축(특례 입력)과 무관한 단계에서 깨진다.
 *
 * 계산기 쪽 선례와 같은 방법이다 — `transfer-155-temp-two-house-auto-judge.spec.ts`가
 * `transfer-tax-wizard`를 같은 식으로 시드해 왔다.
 *
 * ⚠️ **`?new=1`을 붙이지 않는다** — 홈 메뉴 진입 경로라 store를 리셋한다
 *    (`e2e/wizard-reset-on-home-entry.spec.ts` F6).
 */
export async function gotoJudgmentStep2(
  page: Page,
  formOver: Record<string, unknown> = {},
): Promise<void> {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    (s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          transferDate: "2026-02-23",
          isOneHousehold: true,
          /** 명부 1채 + 양도 대상 1 = 2주택 ⇒ `judgmentTemporaryTwoHouseVisible` 성립. */
          houses: [
            {
              id: "h1",
              region: "capital",
              acquisitionDate: "2018-01-01",
              officialPrice: "300000000",
              isInherited: false,
            },
          ],
          ...formOver,
        },
      },
      version: 0,
    },
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 보유 주택·권리")).toBeVisible();
}
