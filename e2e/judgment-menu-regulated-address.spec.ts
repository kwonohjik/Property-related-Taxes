/**
 * 판정 메뉴 조정대상지역 — 법정동코드 없이 주소 문자열만 있을 때(「입력한 주소를 그대로 사용」) 계산기와 같은 판정.
 * 계획서: `docs/00-pm/judgment-menu-regulated-area-address.plan.md` (Q-1~Q-4 a).
 *
 * 종전에는 판정 메뉴가 토글 기본값 「아니오」로 비과세를 내고, 계산기로 넘기면 계산기가 주소로 다시 판정해 과세가 나왔다.
 * 사용자가 판정 메뉴에서 고른 값도 「직접 만짐」 표지가 없어 계산기에서 주소 판정에 덮였다.
 * 유닛: `__tests__/calc/judgment-menu-regulated-address.{anchor.test.ts,ui.test.tsx}`.
 *
 * 🔑 소재지는 시드한다 — 주소 검색(Vworld)은 별개 축이다(`one-house-judgment-designated-district.spec.ts`와 같은 판단).
 */
import { test, expect, type Page } from "@playwright/test";
import { answerPhrp154_10NoIfUnanswered } from "./_helpers/judgment-seed";

async function seedGangnamText(page: Page, addressJibun = "서울특별시 강남구 역삼동 1") {
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
            assets: [{ assetKind: "housing", acquisitionDate: "2018-06-01", addressJibun }],
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
  await answerPhrp154_10NoIfUnanswered(page);
}

const judgmentStep = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "진행 단계" }).getByRole("button", { name });

/** 판정 결과 → 계산기 → 보유 상황. 계산기 Step4의 취득 당시 토글을 돌려준다. */
async function handoffToHoldingStep(page: Page) {
  await page.getByTestId("one-house-to-calculator").click();
  // 샤드의 첫 이동이면 dev 서버가 계산기 라우트를 이때 컴파일한다 — CI에서 5초(기본)를 넘겨 실패했다(PR #3139 E2E 5/12 · 첫 테스트로 배치).
  //   같은 이동을 기다리는 다른 스펙과 같은 값(`carryover-gift-debt-purchased-part-parts.spec.ts`)
  await expect(page).toHaveURL(/\/calc\/transfer-tax$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  return page.getByTestId("transfer-was-regulated").getByRole("switch");
}

test.describe("판정 메뉴 — 주소 문자열 조정대상지역", () => {
  test("[RA-1] 안 만지면 주소로 판정(조정대상지역) → 과세 · 계산기도 조정대상지역", async ({ page }) => {
    await seedGangnamText(page);
    const was = page.getByTestId("one-house-was-regulated");
    await expect(was).toContainText("주소로 판정");
    await expect(was.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await judgmentStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");

    const calcWas = await handoffToHoldingStep(page);
    await expect(calcWas).toHaveAttribute("aria-checked", "true");
  });

  test("[RA-2] 직접 「아니오」를 고르면 비과세 · 계산기로 넘겨도 그 선택이 남는다", async ({ page }) => {
    await seedGangnamText(page);
    const sw = page.getByTestId("one-house-was-regulated").getByRole("switch");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("one-house-was-regulated")).not.toContainText("주소로 판정");

    await judgmentStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");

    const calcWas = await handoffToHoldingStep(page);
    await expect(calcWas).toHaveAttribute("aria-checked", "false");
    const touched = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state?.formData?.wasRegulatedAtAcquisitionTouched,
    );
    expect(touched).toBe(true);
  });

  /**
   * 결과 화면 고지(`regulated-area-notices-followup.plan.md` 4번) — 시·도를 알아볼 수 없는 주소는 조정대상지역(low)으로 보고 판정한다.
   * 계산기 결과와 같은 줄이 판정 메뉴 결과에도 뜨고, 「직접 선택」은 판정 메뉴의 칸(② 양도 대상 주택)을 가리킨다.
   */
  test("[RA-3] 시·도 생략 주소 → 판정 결과에 「조정대상지역 판정 — 확인 필요」(② 양도 대상 주택에서 직접 선택)", async ({ page }) => {
    await seedGangnamText(page, "강남구 테헤란로 1");
    await judgmentStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    const line = page.getByTestId("regulated-area-assumption-line");
    await expect(line).toContainText("조정대상지역 판정 — 확인 필요");
    await expect(line).toContainText("「② 양도 대상 주택」에서 조정대상지역 여부를 직접 선택하세요");
  });

  test("[RA-4] 정식 주소(신뢰도 high) → 결과에 고지 없음", async ({ page }) => {
    await seedGangnamText(page);
    await judgmentStep(page, "판정 결과").click();
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByTestId("regulated-area-assumption-line")).toHaveCount(0);
  });
});
