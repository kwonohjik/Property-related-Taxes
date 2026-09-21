/**
 * 계산기 결과의 **출처 한 줄** (P5-b-1)
 *
 * 계획서 §5.3.
 *
 * ## 이 spec이 지키는 것
 *
 * staleness 3상태·술어·4종 배선은 anchor와 정적 가드가 고정한다
 * (`one-house-judgment-provenance.anchor.test.ts` · `one-house-provenance-four-views.guard.test.ts`).
 *
 * 여기서만 관측되는 것은 **실제 판정 → 전달 → 계산 → 결과 화면**까지 이어진 뒤 그 줄이
 * 진짜로 뜨는가다. 기준선(`inputHash`)은 IndexedDB에 저장된 record에서 읽으므로 브라우저
 * 없이는 확인되지 않는다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const JIBUN = "서울 강남구 대치동 316";

async function mockAddress(page: Page) {
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: [] }) }),
  );
}

/** 판정 메뉴 ①②③을 지나 판정 결과까지 간다. */
async function judge(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("③ 양도 예정")).toBeVisible();
  await fillDateAndVerify(page, { year: "2019", month: "03", day: "10" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

/** 전달 후 계산기 0단계의 계산기-전용 입력을 채우고 결과까지 간다. */
async function calculateInCalculator(page: Page) {
  await expect(page).toHaveURL(/\/calc\/transfer-tax$/);
  await expandAssetSection(page, 1);
  const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(JIBUN);
  await input.press("Enter");
  await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
  await expect(page.getByText(JIBUN).first()).toBeVisible();

  await expandAssetSection(page, 3);
  await page.getByTestId("fixed-acquisition-price").fill("500000000");

  // 0 → 1 → 2 → 3 단계를 지나 계산한다.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "다음" }).click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: /계산하기|계산/ }).first().click();
}

test.describe("계산기 결과의 출처 한 줄", () => {
  /**
   * 🔴 **핵심 경로** — 판정 → 전달 → 계산 → 결과 화면에 출처가 뜬다.
   *    P5-a는 `sourceJudgmentId`를 심었지만 **읽는 곳이 0건**이었다. 이 spec이 그것을 잡는다.
   */
  test("[PV-1] 판정에서 넘어와 계산하면 결과에 출처가 뜬다", async ({ page }) => {
    await mockAddress(page);
    await judge(page);
    await page.getByTestId("one-house-to-calculator").click();
    await calculateInCalculator(page);

    const prov = page.getByTestId("one-house-judgment-provenance");
    await expect(prov).toBeVisible({ timeout: 20_000 });
    // 판정 대상 양도예정일 + 판정 결과가 원본 record에서 읽혀 표시된다.
    await expect(prov).toContainText("2026-06-01");
    await expect(page.getByTestId("provenance-verdict")).toBeVisible();
  });

  /**
   * 🔑 **판정 메뉴를 거치지 않으면 뜨지 않는다.** 모든 계산 결과에 「출처 없음」을 띄우면
   *    쓰지 않는 고지로 화면만 길어진다.
   */
  test("[PV-2] 계산기에 직접 들어와 계산하면 출처가 없다", async ({ page }) => {
    await mockAddress(page);
    await page.goto("/calc/transfer-tax?new=1");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });
    await expandAssetSection(page, 1);
    const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
    await input.fill(JIBUN);
    await input.press("Enter");
    await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
    await expandAssetSection(page, 2);
    await page.getByTestId("companion-actual-sale-price").fill("900000000");
    await expandAssetSection(page, 3);
    await fillDateAndVerify(page, { year: "2019", month: "03", day: "10" }, {
      scope: page.getByTestId("acq-date-building"),
    });
    await page.getByTestId("fixed-acquisition-price").fill("500000000");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "다음" }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: /계산하기|계산/ }).first().click();

    /*
     * 🔑 「결과가 떴다」의 신호는 **출력 항목 선택 패널**이다 — 4종 결과뷰가 전부 렌더하는
     *    유일한 최상단 요소다(세액 문구는 뷰마다 다르고 인쇄용 사본과 중복된다).
     */
    await expect(page.getByText("출력 항목 선택").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("one-house-judgment-provenance")).toHaveCount(0);
  });
});
