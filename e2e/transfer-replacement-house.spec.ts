/**
 * E2E: 대체주택 비과세 특례 §156의2⑤ — 사례 43
 *
 * ★ ToggleCard 토글은 setChecked(true) (.click()/Space 이중발화로 안 먹음 — memory feedback_e2e_togglecard_setchecked)
 *
 * ## 🔄 입력 화면이 **판정 메뉴로 옮겨졌다** (P6-b)
 *
 * §156의2⑤의 중과 배제는 영 §167의10①**15호**(「§154①의 요건을 모두 충족」 2요소)라 비과세
 * 판정을 반드시 경유한다 ⇒ 입력·검증이 판정 메뉴로 갔다. 계산기에는 **읽기 전용 요약**만 남고,
 * 값은 flat 필드라 ④가 그대로 보낸다 — 그래서 세액은 변하지 않는다(OH-21).
 *
 * | # | 무엇을 본다 |
 * |---|---|
 * | RH-E2E-1 | 판정 메뉴에서 토글 ON + 4필드를 **입력할 수 있다** |
 * | RH-E2E-2 | 계산기가 선언 없이 계산하면 body에 `replacementHouse`가 **없다** (⑬ 게이팅) |
 * | RH-E2E-3 | 판정 메뉴 ⑧이 날짜 미입력을 **막는다** (이관된 검증의 긍정 짝) |
 * | RH-E2E-4 | 계산기가 그 값을 **읽기 전용으로 보여 주고** 세액은 종전대로 비과세다 |
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { setupAddress } from "./_helpers/fill-address";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";

/** CurrencyInput(htmlFor 미연결) → label 부모 div 탐색 후 input */
function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

/** Step1 주택 자산 (사례 43: 양도 3.2억 / 취득 2017-04-13 2.5억) */
async function fillStep1Housing(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("23");
  await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
  await page.getByTestId("filing-date").getByLabel("월").fill("04");
  await page.getByTestId("filing-date").getByLabel("일").fill("30");
  await expandAssetSection(page, 1);
  await setupAddress(page); // ⑧ 소재지 필수
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await getInputByLabel(page, "양도가액 (원)").first().fill("320000000");
  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2017");
  await page.getByLabel("월", { exact: true }).nth(2).fill("04");
  await page.getByLabel("일", { exact: true }).nth(2).fill("13");
  await getInputByLabel(page, "취득가액 (원)").first().fill("250000000");
}

/** Step4 이동 + 1세대 + 2채 */
async function gotoStep4Household2(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByText("세대 보유 주택 수")).toBeVisible();
  await page.getByRole("switch", { name: "1세대 해당" }).setChecked(true);
  await page.getByRole("button", { name: "2채", exact: true }).click();
}

/** 대체주택 특례 토글 ON + 4필드 (사례 43) — **판정 메뉴 ②** 화면에서. */
async function fillReplacementHouse(page: Page) {
  await page.getByRole("switch", { name: /대체주택 비과세 특례 해당/ }).setChecked(true);
  const approval = page.getByText("사업시행계획인가일").locator("xpath=..");
  await approval.getByLabel("연도").fill("2015");
  await approval.getByLabel("월").fill("05");
  await approval.getByLabel("일").fill("16");
  const completion = page.getByText("신축주택 준공일").locator("xpath=..");
  await completion.getByLabel("연도").fill("2023");
  await completion.getByLabel("월").fill("04");
  await completion.getByLabel("일").fill("17");
  await page.getByText("대체주택 거주개월수").locator("xpath=..").locator("input").fill("106");
  await page.getByRole("switch", { name: /신축주택 1년 이상 거주 예정/ }).setChecked(true);
}

/** 남은 단계 이동 후 계산 */
async function navigateAndCalc(page: Page) {
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

/** 사례 43의 4필드 — 시드와 화면 입력이 **같은 값**이어야 두 테스트가 같은 것을 본다. */
const CASE43 = {
  replacementHouseSpecial: true,
  replBusinessApprovalDate: "2015-05-16",
  replCompletionDate: "2023-04-17",
  replResidenceMonths: "106",
  replWillResideNewHouse: true,
} as const;

test.describe("대체주택 비과세 특례 §156의2⑤ (사례 43)", () => {
  test("RH-E2E-1: 판정 메뉴에서 토글 ON + 4필드를 입력할 수 있다", async ({ page }) => {
    await gotoJudgmentStep2(page);
    await fillReplacementHouse(page);
    await expect(page.getByText(/§156의2⑬/)).toBeVisible(); // 사후관리 경고
  });

  test("RH-E2E-2: 선언 없이 계산 → API body 에 replacementHouse 없음 (⑬ 게이팅)", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/calc/transfer", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.continue();
    });
    await fillStep1Housing(page);
    await gotoStep4Household2(page);
    await navigateAndCalc(page);
    await expect(async () => {
      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies[bodies.length - 1]).not.toHaveProperty("replacementHouse");
    }).toPass({ timeout: 10000 });
  });

  test("RH-E2E-3: 판정 메뉴 — 토글 ON + 날짜 미입력 → validation 차단(⑧)", async ({ page }) => {
    await gotoJudgmentStep2(page);
    await page.getByRole("switch", { name: /대체주택 비과세 특례 해당/ }).setChecked(true);
    // 🔄 2026-09-23 재배치 — 보유 주택·권리가 **마지막 입력 단계**가 되어 액션이
    //    「다음」이 아니라 「판정 결과 보기」다. ⑧(`validateStep2`)은 그 CTA에서도 돈다.
    await page.getByRole("button", { name: "판정 결과 보기" }).click();
    await expect(page.getByText(/사업시행계획인가일을 입력/)).toBeVisible({ timeout: 5000 });
  });

  /**
   * 🔴 **OH-21.** P6-b 이전에 저장된 폼(4필드 보유)을 다시 열면, 화면에 편집 칸이 없어도
   *    값은 ④가 그대로 보내 세액을 바꾼다. 요약이 없으면 **보이지 않는 값이 세액을 바꾸는**
   *    상태가 된다.
   */
  test("RH-E2E-4: 계산기가 읽기 전용으로 보여 주고 세액은 종전대로 비과세다", async ({ page }) => {
    await fillStep1Housing(page);
    await gotoStep4Household2(page);
    await page.evaluate((facts) => {
      const raw = sessionStorage.getItem("transfer-tax-wizard");
      if (!raw) throw new Error("wizard state missing");
      const s = JSON.parse(raw);
      Object.assign(s.state.formData, facts);
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s));
    }, CASE43);
    await page.reload();
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId("imported-temp-two-house-specials")).toBeVisible();
    await expect(page.getByText("2015-05-16")).toBeVisible();
    // 편집 칸은 없다 — 옮겨갔다.
    await expect(page.getByRole("switch", { name: /대체주택 비과세 특례 해당/ })).toHaveCount(0);
    await navigateAndCalc(page);
    await expect(page.getByText(/비과세/).first()).toBeVisible({ timeout: 15000 });
  });
});
