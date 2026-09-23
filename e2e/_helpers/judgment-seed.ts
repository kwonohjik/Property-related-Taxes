import { expect, type Page } from "@playwright/test";

/**
 * 판정 메뉴(`/calc/one-house-exemption`)의 **③ 보유 주택·권리** 화면을 시드해서 연다 (P6-b).
 *
 * ## 왜 시드인가
 *
 * 특례 섹션은 **2주택 이상**에서만 열리는데, 판정 메뉴는 주택 수를 `householdHousingCount`
 * 스칼라가 아니라 **명부**(`houses[]`)에서 센다(`deriveJudgmentHouseCount` = 양도 대상 1 +
 * `houses.length`). 화면으로 명부를 채우려면 주소 검색·공시가격까지 거쳐야 해서, 정작
 * 관측하려는 축(특례 입력)과 무관한 단계에서 깨진다.
 *
 * 계산기 쪽 선례와 같은 방법이다 — `transfer-155-temp-two-house-auto-judge.spec.ts`가
 * `transfer-tax-wizard`를 같은 식으로 시드해 왔다.
 *
 * ## 🔄 2026-09-23 단계 재배치
 *
 * 화면 순서가 **① 세대 → ② 양도 대상 주택 → ③ 보유 주택·권리**로 바뀌었다
 * (`docs/00-pm/one-house-judgment-step-reorder.plan.md`). 그래서 이 헬퍼는
 * **「다음」을 두 번** 누른다.
 *
 * 🔴 두 번째 「다음」은 **`validateStep3`(② 화면)를 통과해야** 넘어간다 — 양도 예정일·취득일·
 *    예상 양도가액이 필요하다. 시드에 그 셋을 넣지 않으면 ②에서 막혀 **호출부 전부가
 *    타임아웃**된다. `assets`는 부분 객체로 둬도 `migrateAsset`이 나머지를 채운다
 *    (`one-house-judgment-form.types.ts:89`).
 *
 * ⚠️ **`?new=1`을 붙이지 않는다** — 홈 메뉴 진입 경로라 store를 리셋한다
 *    (`e2e/wizard-reset-on-home-entry.spec.ts` F6).
 */
export async function gotoJudgmentHoldingsStep(
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
          /** ② 화면(`validateStep3`)을 통과시키는 최소값 — 없으면 3번째 화면에 도달하지 못한다. */
          contractTotalPrice: "1000000000",
          assets: [{ assetKind: "housing", acquisitionDate: "2017-01-01" }],
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
  await page.getByRole("button", { name: "다음" }).click(); // ① → ②
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click(); // ② → ③
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
}

/**
 * @deprecated 2026-09-23 단계 재배치로 이름이 화면 번호와 어긋났다 —
 * `gotoJudgmentHoldingsStep`을 쓸 것. 기존 호출부 호환을 위해 남긴다.
 */
export const gotoJudgmentStep2 = gotoJudgmentHoldingsStep;
