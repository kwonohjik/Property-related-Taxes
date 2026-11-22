/**
 * transfer-nbl-ptax-basis.spec.ts
 *
 * NBL2611-V1-A (R19 · Q-1 (가)) — 기타토지 «재산세 분류 근거» — 입력 → 계산 → 결과 풀플로우.
 *
 * 검증:
 *  1) ⑤ 건축물 없는 토지 + 별도합산 선언이면 근거 선택지가 뜨고, 미선택이면 «확인 필요» 안내가 보인다.
 *  2) ⑬⑭ 근거를 고르면 계산 요청 body.nonBusinessLandRaw.nblOtherPropertyTaxBasis로 실려 엔진에 도달한다(침묵 strip 방지).
 *  3) ⑦ 결과 카드에 근거 echo가 한국어로 보이고 판정이 «사업용»이다(근거 미선택이면 종합합산 → 비사업용 — 역버그 방지).
 *
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-nbl-ptax-basis.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { setupAddress } from "./_helpers/fill-address";

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input").first();
}

function selectByCardLabel(page: Page, cardLabel: string): Locator {
  return page.locator("div.rounded-lg").filter({ hasText: cardLabel }).getByRole("combobox").first();
}

/** 열고 → 고르고 → 골라졌는지 확인(transfer-nbl-revenue-deemed-common.spec.ts와 같은 방식). */
async function chooseFromSelect(page: Page, cardLabel: string, optionName: string, shown: string) {
  const trigger = selectByCardLabel(page, cardLabel);
  await expect(trigger, `«${cardLabel}» Select가 보여야 함`).toBeVisible();
  const listbox = page.getByRole("listbox");
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(listbox, `«${cardLabel}» 드롭다운이 열려야 함`).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 20_000 });
  await listbox.getByRole("option", { name: optionName }).click();
  await expect(trigger, `«${cardLabel}» = ${shown}`).toContainText(shown);
}

async function openNblDetailedJudgment(page: Page) {
  const sw = page.getByRole("switch", { name: /비사업용 토지/ });
  await expect(async () => {
    if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    await expect(sw, "비사업용 토지 토글 ON").toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("radio", { name: /판정 도움 필요/ }).click();
  await expect(page.getByText("비사업용 토지 정밀 판정"), "「판정 도움 필요」 상세 섹션이 떠야 함").toBeVisible({ timeout: 20_000 });
}

/** 양도일·자산·취득·보유 상황·지목·용도지역·재산세 분류(별도합산)까지 입력해 근거 칸이 보이는 상태로 만든다. */
async function fillUpToTaxType(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitForHydration(page);

  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("18");

  await expandAssetSection(page, 1);
  await setupAddress(page);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("314.1");
  await inputByLabel(page, "양도가액 (원)").fill("2000000000");
  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByRole("radio", { name: "환산취득가" }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("1997");
  await page.getByLabel("월", { exact: true }).nth(2).fill("02");
  await page.getByLabel("일", { exact: true }).nth(2).fill("03");
  await page.getByPlaceholder("공시지가 단가").first().fill("637000");
  await page.waitForTimeout(150);
  await page.getByPlaceholder("공시지가 단가").nth(1).fill("893300");
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await openNblDetailedJudgment(page);
  await chooseFromSelect(page, "토지 지목", "기타 토지 (나대지·잡종지)", "기타 토지");
  await chooseFromSelect(page, "용도지역", "일반주거지역", "일반주거지역");
  // NBL-STATE-HISTORY-U1 — 소유기간 중 건축물 이력 질문은 ⑧ #1 필수 입력이다. 이 스펙의 주제와 무관해 «바뀐 적 없습니다».
  await page.getByTestId("nbl-other-state-mode-unchanged").click();
  await expect(page.getByTestId("nbl-other-state-mode-unchanged")).toBeChecked();
  await chooseFromSelect(page, "재산세 과세 분류", "별도합산", "별도합산");
}

async function calculate(page: Page): Promise<Record<string, unknown> | undefined> {
  let capturedRaw: Record<string, unknown> | undefined;
  await page.route("**/api/calc/transfer", async (route) => {
    const body = route.request().postDataJSON?.() as { nonBusinessLandRaw?: Record<string, unknown> } | undefined;
    capturedRaw = body?.nonBusinessLandRaw;
    await route.continue();
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });
  return capturedRaw;
}

test.describe("기타토지 재산세 분류 근거 — 풀플로우", () => {
  test("근거 선택(공지상태): body 도달 + 결과 echo + 사업용", async ({ page }) => {
    test.setTimeout(120_000);
    await fillUpToTaxType(page);

    // 건축물 없음 + 별도합산 → 근거 선택지 + 미선택 «확인 필요» 안내
    await expect(page.getByTestId("nbl-other-tax-basis")).toBeVisible();
    await expect(page.getByTestId("nbl-other-tax-basis-unconfirmed")).toContainText("종합합산");
    await page.getByTestId("nbl-other-tax-basis-vacant_state").click();
    await expect(page.getByTestId("nbl-other-tax-basis-unconfirmed")).toHaveCount(0);

    const raw = await calculate(page);
    expect(raw, "nonBusinessLandRaw 가 요청 body 에 있어야 함").toBeTruthy();
    expect(raw?.nblOtherPropertyTaxBasis, "근거 필드 도달(⑬)").toBe("vacant_state");

    const echo = page.getByTestId("nbl-property-tax-basis-echo");
    await expect(echo).toBeVisible();
    await expect(echo).toContainText("공지상태");
    await expect(page.getByText("사업용 토지 — 일반세율이 적용됩니다.")).toBeVisible();
  });

  test("근거 미선택: 종합합산 + 확인 필요 → 비사업용(역버그 방지 — ⑧ 차단 아님)", async ({ page }) => {
    test.setTimeout(120_000);
    await fillUpToTaxType(page);
    await expect(page.getByTestId("nbl-other-tax-basis-unconfirmed")).toBeVisible();

    const raw = await calculate(page);
    expect(raw?.nblOtherPropertyTaxBasis ?? "").toBe("");

    await expect(page.getByTestId("nbl-property-tax-basis-unconfirmed-echo")).toContainText("확인 필요");
    await expect(page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/)).toBeVisible();
  });
});
