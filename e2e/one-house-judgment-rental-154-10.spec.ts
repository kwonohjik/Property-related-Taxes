/**
 * §154⑩ 표준 경로(I-5) — 판정 메뉴에서 rentalUnits 0호(B 시나리오) 입력 경로.
 *
 * 종전에는 시나리오 B에서 임대주택을 전부 삭제할 수 없었다(마지막 호는 `canRemove=false`로
 * 막혀 있었다) — §155⑳ 본문이 항상 성립한다고 전제했기 때문이다. 이 경로가 열리지 않으면
 * 「이미 임대주택을 전부 처분하고 PHRP만 남은」 사실관계(§154⑩)를 아예 입력할 수 없었다.
 *
 * 법령 근거: 소득세법 시행령 §154⑩ · §155⑳ 각 호 외의 부분 후단.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { selectDirectResidenceInput } from "./_helpers/residence-direct";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await selectDirectResidenceInput(page); // 거주 무관 흐름 — 구 기본값(개월 수 직접 입력) 축
}

test.describe("판정 메뉴 §154⑩ 표준 경로 (rentalUnits 0호)", () => {
  test("[I5-1] B 시나리오에서 임대주택을 0호까지 삭제할 수 있고 §154⑩ 블록이 뜬다", async ({ page }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();
    await page.getByRole("radio", { name: /임대주택을 거주주택으로 전환/ }).click();

    // 토글 ON 시 자동 추가된 1호를 삭제 — A와 달리 B는 마지막 호까지 지울 수 있어야 한다(I-5).
    await expect(page.getByRole("button", { name: "삭제" })).toBeVisible();
    await page.getByRole("button", { name: "삭제" }).click();

    await expect(page.getByTestId("rental-154-10-block")).toBeVisible();
    // §155⑳ 본문 문구가 아니라 §154⑩ 안내로 갈린다
    await expect(page.getByText("§154⑩ 표준 경로")).toBeVisible();
  });

  test("[I5-2] 판정 메뉴(facts)는 §161 3-시점 기준시가는 감추지만 직전거주주택 양도일은 받는다", async ({
    page,
  }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();
    await page.getByRole("radio", { name: /임대주택을 거주주택으로 전환/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();

    // Q-7 분할선 — 3-시점 기준시가(세액 산식)는 여전히 판정 메뉴에 없다.
    await expect(page.getByTestId("phrp-stdprice-acq-price-input")).toHaveCount(0);
    // 직전거주주택 양도일은 §154⑩의 판정 축이라 예외적으로 이 화면에서 받는다.
    await expect(page.getByTestId("rental-154-10-prior-date")).toBeVisible();

    await fillDateAndVerify(page, { year: "2022", month: "01", day: "01" }, {
      scope: page.getByTestId("rental-154-10-prior-date"),
    });
  });

  test("[I5-3] 등록·운영 사실 토글이 동작하고, 2019.2.12 이후 취득이면 등록일 이후 거주기간 칸이 뜬다", async ({
    page,
  }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();
    await page.getByRole("radio", { name: /임대주택을 거주주택으로 전환/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();

    // §154⑩1호 — 등록·운영 사실 토글. 바깥 `applyException` 토글-카드가 이 카드를 감싸므로
    // (hasText가 조상까지 매치) `rental-154-10-block` 안으로 스코프를 좁힌다.
    const block = page.getByTestId("rental-154-10-block");
    const factToggle = block
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: /임대주택 등록·어린이집 운영 사실/ })
      .getByRole("switch");
    await expect(factToggle).toHaveAttribute("aria-checked", "false");
    await factToggle.click();
    await expect(factToggle).toHaveAttribute("aria-checked", "true");

    // 2019.2.12 이후 취득 — §154① 종전규정이 아니므로 §155⑳1호 괄호를 준용해 등록일(또는
    // 어린이집 인가일) 이후 거주기간 칸이 뜬다(rentalUnits 0호에서도 postRegistrationResidenceMonths
    // 를 재사용한다는 것을 확인 — I-5 correction).
    await page.getByTestId("one-house-acq-date").getByLabel("연도").fill("2020");
    await page.getByTestId("one-house-acq-date").getByLabel("월").fill("01");
    await page.getByTestId("one-house-acq-date").getByLabel("일").fill("01");

    await expect(page.getByText("사업자등록·임대사업자 등록 이후 거주기간")).toBeVisible();
    await expect(page.getByText("괄호 준용", { exact: false })).toBeVisible();
  });

  test("[I5-4] 2019.2.12 전 취득이면 §154① 원칙 안내가 뜨고 등록일 이후 거주기간 칸은 뜨지 않는다", async ({
    page,
  }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();
    await page.getByRole("radio", { name: /임대주택을 거주주택으로 전환/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();

    await page.getByTestId("one-house-acq-date").getByLabel("연도").fill("2015");
    await page.getByTestId("one-house-acq-date").getByLabel("월").fill("01");
    await page.getByTestId("one-house-acq-date").getByLabel("일").fill("01");

    await expect(page.getByText("종전규정이 적용됩니다", { exact: false })).toBeVisible();
    await expect(page.getByText("사업자등록·임대사업자 등록 이후 거주기간")).toHaveCount(0);
  });
});
