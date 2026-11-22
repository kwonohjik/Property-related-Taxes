/**
 * transfer-nbl-other-state-history.spec.ts
 *
 * NBL-STATE-HISTORY-U1 — 기타토지 «소유기간 중 건축물 유무 이력» — 입력 → 계산 → 결과 풀플로우(브라우저 확인).
 *
 * 검증:
 *  1) ⑤ 질문 «바뀐 적 있습니다» → 사건 행(철거 + 철거 직전 재산세 구분) → 미리보기(엔진 leaf 구간) · 「건축물 있음」 토글은 숨는다.
 *  2) ④⑫⑬⑭ 요청 body `nonBusinessLandRaw`에 `nblOtherStateHistoryMode`·`nblOtherStateEvents`(철거 직전 재산세 구분 포함)가 도달한다(침묵 strip 방지).
 *  3) 결과 판정 — 철거 전 구간을 별도합산으로 선언하면 사업용(이력 없으면 비사업용 — 양도일 현재 상태를 전 기간에 적용하던 과대 해소), «모름»이면 종합합산 + 확인 필요로 비사업용.
 *  4) ⑧ 질문 미선택은 계산 전에 막고 그 칸으로 이동한다(필드 점프).
 *
 * 실행: E2E_PORT=3119 npx playwright test e2e/transfer-nbl-other-state-history.spec.ts
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

/** 양도일 2026-02-18 · 취득일 1997-02-03(환산) · 토지 314.1㎡ — 지목 «기타 토지»·용도지역까지 입력해 건축물 이력 질문이 보이는 상태로 만든다. */
async function fillUpToHistoryQuestion(page: Page) {
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
  await expect(page.getByTestId("nbl-other-state-history"), "건축물 이력 질문이 보여야 함").toBeVisible();
}

/** 질문 «바뀐 적 있습니다» → 철거 사건 1건(2021-01-01) 입력 → 양도일 현재 재산세 과세 분류 = 종합합산(나대지). */
async function enterDemolition(page: Page) {
  await page.getByTestId("nbl-other-state-mode-changed").click();
  await expect(page.getByTestId("nbl-other-state-mode-changed")).toBeChecked();
  await page.getByTestId("nbl-other-state-event-add").click();
  await page.getByTestId("nbl-other-state-event-0-kind-removed").click();
  await expect(page.getByTestId("nbl-other-state-event-0-kind-removed")).toBeChecked();
  const date = page.getByTestId("nbl-other-state-event-0-date");
  await date.getByLabel("연도").fill("2021");
  await date.getByLabel("월").fill("01");
  await date.getByLabel("일").fill("01");
  await expect(date.getByLabel("연도")).toHaveValue("2021");
  // 「건축물 있음」 토글은 숨고 사건이 양도일 현재 유무를 정한다
  await expect(page.getByTestId("nbl-other-has-building-toggle")).toHaveCount(0);
  await expect(page.getByTestId("nbl-state-history-at-transfer")).toContainText("양도일 현재 건축물: 없음");
  await chooseFromSelect(page, "재산세 과세 분류 (양도일 현재)", "종합합산", "종합합산");
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

test.describe("기타토지 소유기간 중 건축물 이력 — 풀플로우", () => {
  test("철거 사건 + 철거 직전 별도합산: 미리보기 구간 · body 도달 · 사업용(양도일 현재 상태만 적용하면 비사업용이던 과대 해소)", async ({ page }) => {
    test.setTimeout(150_000);
    await fillUpToHistoryQuestion(page);
    await enterDemolition(page);

    // 철거 직전 재산세 구분 = 별도합산 (미선택이면 «모름» 확인 필요 안내가 뜬다)
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-unknown-notice")).toBeVisible();
    await page.getByTestId("nbl-other-state-event-0-ptax-separate").click();
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-separate")).toBeChecked();
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-unknown-notice")).toHaveCount(0);

    // 미리보기 = 엔진 leaf 구간(취득일 다음날 ~ 철거 전날 · 철거일 ~ 양도일 전날)
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("1997-02-04 ~ 2020-12-31");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("별도합산(선언)");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("2021-01-01 ~ 2026-02-17");
    await expect(page.getByTestId("nbl-state-history-preview-total")).toContainText("= 소유기간");

    const raw = await calculate(page);
    expect(raw, "nonBusinessLandRaw 가 요청 body 에 있어야 함").toBeTruthy();
    expect(raw?.nblOtherStateHistoryMode, "질문 답 도달(④⑫⑬⑭)").toBe("changed");
    expect(raw?.nblOtherStateEvents, "사건 행 + 철거 직전 재산세 구분 도달(침묵 strip 방지)").toEqual([
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
    ]);
    expect(raw?.nblOtherHasBuilding, "양도일 현재 건축물 유무는 사건에서 파생").toBe(false);

    await expect(page.getByText("사업용 토지 — 일반세율이 적용됩니다.")).toBeVisible();
  });

  test("철거 직전 재산세 구분 «모름»(미선택): 종합합산 + 확인 필요 → 비사업용 · body는 \"\"", async ({ page }) => {
    test.setTimeout(150_000);
    await fillUpToHistoryQuestion(page);
    await enterDemolition(page);
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-unknown")).toBeChecked(); // 표시 fallback — 저장값 ""

    const raw = await calculate(page);
    expect(raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(raw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }]);
    await expect(page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/)).toBeVisible();
  });

  test("⑧ 질문 미선택: 계산 전에 막고 그 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(120_000);
    await fillUpToHistoryQuestion(page);
    await chooseFromSelect(page, "재산세 과세 분류", "종합합산", "종합합산");
    for (const m of ["unchanged", "changed", "unknown"]) await expect(page.getByTestId(`nbl-other-state-mode-${m}`)).not.toBeChecked();

    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const issue = page.getByTestId("validation-issues").getByRole("button", { name: /소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요/ });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect(page.locator('[data-field="nblOtherStateHistoryMode"] input:focus')).toHaveCount(1);
  });
});
