/**
 * 판정 메뉴 §155⑳ 장기임대주택 특례 (P4-3a)
 *
 * 계획서 Q-7 — 「판정 사실은 판정 메뉴 · 세액 산식 입력은 계산기」.
 *
 * ## 이 spec이 지키는 것
 *
 * 엔진·어댑터 쪽 주장은 anchor가 고정한다(`one-house-exemption-rental-housing.route.anchor.test.ts`).
 * 여기서만 관측되는 것은 **화면에 무엇이 뜨고 무엇이 안 뜨는가**다 — `mode="facts"`가
 * §161① 안분 입력을 실제로 감추는지는 DOM에서만 보인다
 * (`feedback_guard_uses_proxy_not_the_claim`).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

/**
 * ① → ② 양도 대상 주택. `isOneHousehold`는 기본값 true라 누르지 않는다.
 *
 * 🔄 2026-09-23 재배치 — §155⑳ 거주주택 특례 입력이 **이 화면으로 옮겨왔다**(거주요건을
 * 면제하는 특례라 거주기간 입력과 같은 화면에 모았다). ⑧ 차단도 함께 `validateStep3`로 갔다.
 */
async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

test.describe("판정 메뉴 §155⑳ 장기임대주택 특례", () => {
  test("[OHR-1] 토글 ON이면 임대주택 1호 카드가 자동으로 열린다", async ({ page }) => {
    await gotoSaleStep(page);

    const toggle = toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용");
    await expect(toggle).toBeVisible();
    await toggle.click();

    // 토글 ON 시 빈 1호를 자동 추가하는 것이 이 섹션의 계약이다(② 정책).
    await expect(page.getByText("임대주택 정보")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ 임대주택 추가" })).toBeVisible();
  });

  /**
   * 🔴 **Q-7 분할선을 화면에서 확인한다.**
   * 계산기에서는 B 시나리오를 고르면 「직전거주주택 + 3-시점 기준시가」 블록이 열린다.
   * 판정 메뉴에서는 그것이 **열리지 않고** 안내로 대체돼야 한다 — 세액 산식 입력이기 때문이다.
   */
  test("[OHR-2] B 시나리오를 골라도 §161 안분 입력이 뜨지 않는다", async ({ page }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();

    await page.getByRole("radio", { name: /임대주택을 거주주택으로 전환/ }).click();

    await expect(page.getByTestId("rental-allocation-deferred-notice")).toBeVisible();
    /*
      부재는 `toHaveCount(0)`로 본다(strict 무관).
      ⚠️ 「직전거주주택 양도일」만으로 찾으면 **B 라디오의 설명문**에도 그 말이 있어 2건이 잡힌다
         (실측). 블록 고유 헤더와 입력 라벨로 좁힌다.
    */
    await expect(page.getByText("직전거주주택 + 3-시점 기준시가")).toHaveCount(0);
    await expect(page.getByText("직전거주주택 양도 당시 기준시가")).toHaveCount(0);
    await expect(page.getByText("현 양도 당시 기준시가")).toHaveCount(0);
  });

  /**
   * ⑧ 배선 — 「판정이 불가능한 입력」은 막는다. 「요건 미달」은 막지 않는다(그건 판정 결과다).
   */
  test("[OHR-3] 등록일을 비운 채 다음으로 가면 차단된다", async ({ page }) => {
    await gotoSaleStep(page);

    /*
      🔄 2026-09-23 재배치 — §155⑳이 ② 양도 대상 화면으로 오면서 **같은 화면의 필수 3값**과
         한 검증(`validateStep3`)을 공유하게 됐다. 배너는 **첫 error 하나만** 띄우므로
         (`OneHouseJudgmentCalculator.tsx:66-71`) 기본값을 비워 두면 「양도 예정일을 입력하세요」가
         먼저 뜨고 이 spec이 겨냥한 축이 가려진다. ⇒ 기본 3값을 먼저 채워 축을 남긴다.
    */
    await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("900000000");

    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();

    await page.getByRole("button", { name: "다음" }).click();

    // 배너가 뜨고 ② 단계에 그대로 남는다.
    await expect(page.getByText(/사업자등록일을 입력하세요/)).toBeVisible();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  });

  /**
   * 🔴 **종전 오답의 회귀 단언.** §155⑳ 축이 붙기 전에는 이 화면에서 특례를 켤 경로 자체가
   *    없어 임대 요건을 하나도 보지 않은 채 비과세가 나왔다. 여기서는 요건 미충족이
   *    「과세」로 돌아오는지를 **판정 결과 화면**에서 본다.
   */
  test("[OHR-4] 요건 미충족 임대주택이면 판정이 과세로 나온다", async ({ page }) => {
    await gotoSaleStep(page);
    await toggleSwitch(page, "장기임대주택 보유자 거주주택 비과세 특례 적용").click();

    /*
      등록일만 채운다 — 나머지 요건(기준시가·국민주택규모·2호 등)은 미충족 상태로 둔다.
      ⚠️ `getByLabel("일")`은 **substring 매칭**이라 라디오까지 잡힌다(실측 — e2e/CLAUDE.md §1).
         공용 헬퍼 + `data-testid` 스코프로만 채운다.
    */
    await fillDateAndVerify(page, { year: "2015", month: "01", day: "01" }, {
      scope: page.getByTestId("rental-biz-reg-date-0"),
    });
    await fillDateAndVerify(page, { year: "2015", month: "01", day: "01" }, {
      scope: page.getByTestId("rental-reg-date-0"),
    });

    /*
      ⑧이 요구하는 나머지 필수값. **요건 미달은 막지 않지만 「판정 불가」는 막는다** —
      그래서 기준시가는 «채우되 상한을 넘겨» 둔다(20억 ≫ 6억 상한). 엔진이 미충족을 판정한다.
    */
    await page
      .getByTestId("rental-stdprice-0-price-input")
      .getByRole("textbox")
      .fill("2000000000");
    /*
      ⚠️ `toggleSwitch`는 **바깥 특례 카드까지** 잡는다 — 이 토글이 그 안에 중첩돼 있어
         `hasText` 필터가 3개를 반환한다(실측). 스위치의 `aria-label`로 바로 좁힌다.
    */
    await page.getByRole("switch", { name: /^임대료 5% 상한/ }).click();

    // ② — 판정에 필요한 최소 입력 (특례와 **같은 화면**이다)
    await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("900000000");

    // ③ 보유 주택·권리 — 명부는 비운 채 지나간다. CTA는 이 마지막 입력 단계에만 있다.
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
    await page.getByTestId("one-house-judge-cta").click();

    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    await expect(page.getByTestId("one-house-rental-verdict")).toContainText("요건 미충족");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  });
});
