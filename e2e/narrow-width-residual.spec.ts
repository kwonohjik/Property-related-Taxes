/**
 * E2E: 좁은 폭 잔여 넘침 — 회귀.
 *
 * ① FieldCard 라벨-좌 배치가 화면 폭(sm) 기준이라, 330px 남짓한 카드에서 입력 자리가 122px로 줄어
 *    날짜칸(약 150px)이 카드 밖으로 넘쳤다(768 전체 E2E 실측 2,319회). sm 이상을 flex-wrap으로 바꿔
 *    입력의 최소 폭이 라벨 옆에 안 들어갈 때만 본문이 라벨 아래로 내려간다.
 * ② 375에서 화면별로 남은 넘침 — 모바일에서도 2열이던 날짜칸 격자, 직접 쓴 값 span이 줄지 않던 Select.
 * 계획서: docs/00-pm/ui-narrow-width-and-dark-mode-residual.plan.md ①②
 *
 * 실행: E2E_PORT=3181 npx playwright test e2e/narrow-width-residual.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 카드 안쪽 오른쪽 끝을 넘은 보이는 요소 수 — 1.5px까지는 반올림으로 본다 */
async function overflowCount(card: Locator) {
  return card.evaluate((c) => {
    const cs = getComputedStyle(c);
    const right = c.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return [...c.querySelectorAll("*")].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1 && b.height > 1 && b.right > right + 1.5;
    }).length;
  });
}

/** 라벨과 입력 본문이 같은 줄인가(라벨-좌) */
async function labelBeside(card: Locator) {
  return card.evaluate((c) => {
    const label = c.querySelector(":scope > label")!.getBoundingClientRect();
    const body = c.querySelector(":scope > div")!.getBoundingClientRect();
    return body.top < label.bottom && body.left >= label.right;
  });
}

const cardByLabel = (page: Page, label: string | RegExp) =>
  page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: label }) }).first();

test.describe("① 양도일·신고일 — 화면 폭별 배치", () => {
  for (const [width, beside] of [[768, false], [1280, true], [375, false]] as const) {
    test(`${width}px — 날짜칸이 카드 안, 라벨 ${beside ? "옆" : "위"}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/calc/transfer-tax");
      await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
      for (const label of [/양도일/, /^신고일/]) {
        const card = cardByLabel(page, label);
        await card.waitFor();
        expect(await overflowCount(card), `${label} 카드 밖으로 넘쳤다`).toBe(0);
        expect(await labelBeside(card)).toBe(beside);
      }
    });
  }
});

test("② 375px 건물 기준시가 — 연도·날짜 짝과 구조·용도 짝이 카드 밖으로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/tools/building-standard-price");
  await page.getByPlaceholder("신축연도 (4자리)").waitFor();
  for (const label of ["취득연도", "취득일", "양도연도", "양도일", "취득당시 구조", "양도당시 구조"]) {
    const card = cardByLabel(page, new RegExp(`^${label}`));
    await card.waitFor();
    expect(await overflowCount(card), `「${label}」 카드 밖으로 넘쳤다`).toBe(0);
  }
});

for (const width of [375, 1280]) test(`② ${width}px 공시지가 연도 Select — 카드 밖으로 넘치지 않고${width === 1280 ? ", 값이 잘리지 않는다" : ""}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", assetLabel: "상속 주택",
          acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01",
          decedentAcquisitionDate: "1975-03-01", inheritanceAssetKind: "house_individual", inheritanceValuationMethod: "supplementary",
          publishedValueAtInheritance: "50000000", acquisitionArea: "200", actualSalePrice: "500000000",
        }],
        transferDate: "2025-06-01", houses: [], presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
  const cards = page.locator("[data-slot=field-card]").filter({ has: page.locator(":scope > label", { hasText: /^공시지가 연도/ }) });
  await cards.first().waitFor();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if (!(await card.isVisible())) continue;
    expect(await overflowCount(card), `공시지가 연도 카드 ${i} 밖으로 넘쳤다`).toBe(0);
    if (width === 1280) {
      // 넓은 화면에서는 조회 버튼이 아래 줄로 내려가더라도 연도 값(「2025년 (자동)」)이 말줄임되지 않는다
      const clipped = await card.locator("[data-slot=select-trigger] > span").evaluate((e) => e.scrollWidth > e.clientWidth + 1);
      expect(clipped, `공시지가 연도 카드 ${i} 값이 잘렸다`).toBe(false);
    }
  }
});
