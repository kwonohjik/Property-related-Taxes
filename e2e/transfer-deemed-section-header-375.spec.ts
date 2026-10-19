/**
 * E2E: 상속 「취득가액 의제 특례」 헤더 — 375px 가로 넘침·겹침 회귀.
 *
 * 제목·의제 배지가 둘 다 `shrink-0`이던 때, 375px에서 140px로 줄어든 묶음 밖으로 358px을 그려
 *   · 「의제취득일 이후/이전」 배지가 430px까지 밀려 페이지 가로 스크롤이 생기고
 *   · 제목이 「소령 §163 ⑨」 법령 배지와 겹쳤다.
 * 계획서: docs/00-pm/transfer-deemed-section-header-375-overflow.plan.md
 *
 * 실행: E2E_PORT=3177 npx playwright test e2e/transfer-deemed-section-header-375.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 상속 토지 — 상속개시일만 바꿔 의제취득일(1985.1.1.) 이전·이후를 가른다. */
function seedForm(inheritanceDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "land",
            landNature: "standalone",
            assetLabel: "상속 토지",
            acquisitionCause: "inheritance",
            acquisitionDate: inheritanceDate,
            inheritanceStartDate: inheritanceDate,
            decedentAcquisitionDate: "1975-03-01",
            inheritanceAssetKind: "land",
            inheritanceValuationMethod: "supplementary",
            publishedValueAtInheritance: "50000000",
            acquisitionArea: "1000",
            actualSalePrice: "500000000",
            standardPriceAtTransfer: "200000000",
          },
        ],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "500000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openHeader(page: Page, width: number, inheritanceDate: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(inheritanceDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
  const header = page.getByTestId("deemed-section-header");
  await header.waitFor();
  return header;
}

/** 헤더 줄의 제목·의제 배지·법령 배지 사각형과 페이지 가로 폭 */
async function measure(page: Page) {
  return page.getByTestId("deemed-section-header").evaluate((row) => {
    const group = row.firstElementChild!;
    const title = group.querySelector("p")!;
    const badge = group.querySelector("span")!;
    const law = row.lastElementChild!;
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      row: box(row),
      title: box(title),
      badge: box(badge),
      law: box(law),
    };
  });
}

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const [label, date, badgeText] of [
  ["의제취득일 이후", "1987-05-01", "의제취득일 이후"],
  ["의제취득일 이전", "1980-05-01", "의제취득일 이전"],
] as const) {
  test(`375px ${label} — 가로 넘침·제목↔법령 배지 겹침 없음`, async ({ page }) => {
    const header = await openHeader(page, 375, date);
    await expect(header.getByText(badgeText, { exact: true })).toBeVisible();

    const m = await measure(page);
    expect(m.scrollWidth, "페이지 가로 스크롤이 생겼다").toBe(m.innerWidth);
    expect(overlaps(m.title, m.law), "제목이 법령 배지와 겹친다").toBe(false);
    expect(m.badge.right, "의제 배지가 헤더 줄 밖으로 밀렸다").toBeLessThanOrEqual(m.row.right);
    // 배지는 제목 아래 줄로 내려간다 — 같은 줄에 붙들면 넘침은 없어도 제목이 50px 남짓으로 눌려 단어마다 줄이 바뀐다
    expect(m.badge.top, "의제 배지가 제목과 같은 줄에 남아 제목 폭을 잠식한다").toBeGreaterThanOrEqual(m.title.bottom - 1);
  });
}

test("1280px — 헤더는 한 줄 그대로", async ({ page }) => {
  await openHeader(page, 1280, "1987-05-01");
  const m = await measure(page);
  expect(m.scrollWidth).toBe(m.innerWidth);
  // 한 줄이면 헤더 높이 = 그 줄에서 가장 큰 요소 높이(법령 배지·의제 배지)와 같다
  expect(m.row.height).toBe(Math.max(m.law.height, m.badge.height));
  // 배지가 다음 줄로 내려가지 않았다(법령 배지와 같은 줄)
  expect(Math.abs(m.badge.top - m.law.top)).toBeLessThan(1);
});
