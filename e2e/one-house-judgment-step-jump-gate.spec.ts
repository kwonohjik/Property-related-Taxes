/**
 * 단계 점프가 **앞 단계의 차단 오류를 우회하지 못한다** (F-2).
 *
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-2.
 *
 * ## 왜 브라우저에서만 관측되는가
 *
 * 유닛(`__tests__/calc/judgment-step-jump-bypass.predo.anchor.test.tsx`)은 store를 직접 세우고
 * 오케스트레이터를 렌더한다. 여기서만 보이는 것은 **사이드바를 실제로 눌렀을 때** 관문이
 * 서는가다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * 🔴 막지 못하면 **과세가 비과세로 뒤집힌다** — 취득일 없는 주택이 주택 수에서 조용히 빠진다
 *    (유닛 FB-1이 API 응답으로 실측: 주택 수 2·과세 → 1·비과세).
 *
 * 🔑 명부는 **시드한다** — 「+ 주택 추가」는 편집 모달·주소 검색·공시가격을 거치는 **별개 축**이라
 *    여기 섞으면 겨냥한 축이 흐려진다(`one-house-judgment-step-order.spec.ts`와 같은 판단).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

const HOUSE = {
  id: "h1",
  region: "capital",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

/** 명부 1행을 시드한다. `acquisitionDate`가 비면 ③이 차단 오류를 낸다. */
async function seedRoster(page: Page, acquisitionDate: string) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    ([s]) => sessionStorage.setItem("one-house-judgment-wizard", s as string),
    [
      JSON.stringify({
        state: {
          formData: {
            isOneHousehold: true,
            presaleRights: [],
            houses: [{ ...HOUSE, acquisitionDate }],
          },
        },
        version: 0,
      }),
    ],
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
}

/** ①→② 로 가서 양도 대상 3값을 채운다(②는 온전한 상태로 만든다). */
async function fillSaleStep(page: Page) {
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("1200000000");
}

/**
 * 사이드바의 단계 버튼. StepIndicator에도 같은 라벨이 있어 `nav[aria-label="진행 단계"]`로
 * 좁힌다 — 좁히지 않으면 strict 위반이다(유닛에서 실측).
 */
function sidebarStep(page: Page, name: string) {
  return page.getByRole("navigation", { name: "진행 단계" }).getByRole("button", { name });
}

test.describe("판정 마법사 — 단계 점프 관문", () => {
  test("[SJ-1] 명부가 불완전하면 사이드바로 ④를 눌러도 막히고 ③으로 간다", async ({ page }) => {
    await seedRoster(page, ""); // 취득일 없음 ⇒ ③ 차단 오류
    await fillSaleStep(page);

    await sidebarStep(page, "판정 결과").click();

    // ④로 가지 않고 **문제가 있는 ③**에 선다.
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
    await expect(page.getByText(/취득일을 입력하세요/)).toBeVisible();
    await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
  });

  /** 🔑 **음성 짝** — 막기만 하는 구현이면 정상 사용자가 갇힌다. */
  test("[SJ-2] 명부가 온전하면 같은 점프가 그대로 된다", async ({ page }) => {
    await seedRoster(page, "2020-01-01");
    await fillSaleStep(page);

    await sidebarStep(page, "판정 결과").click();

    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  });

  /** 🔑 **뒤로 가는 길은 막지 않는다** — 고치러 가는 경로를 닫으면 사용자가 갇힌다. */
  test("[SJ-3] ③에 오류가 있어도 ①로 되돌아갈 수 있다", async ({ page }) => {
    await seedRoster(page, "");
    await fillSaleStep(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();

    await sidebarStep(page, "세대").click();

    await expect(page.getByTestId("one-house-household")).toBeVisible();
  });
});
