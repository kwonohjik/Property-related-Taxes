/**
 * E2E: 첫 자산 삭제 — 주 자산 배지 · 폼 전역 미등기 · 사이드바 결과
 * 계획서 `docs/00-pm/first-asset-removal-primary-reindex.plan.md`.
 *
 *   T1. 토지 3건(첫 자산 미등기) 계산 → 자산 목록으로 돌아가 첫 자산 삭제
 *       → 새 첫 카드에 「주 자산」 배지 · 저장 폼: 미등기 false · 주 자산 플래그·기본 라벨 재정렬
 *       → 사이드바 첫 행이 지운 자산의 엔진 값(700,000,000 · 100,000,000)이 아니라 새 첫 자산의 값(300,000,000 · 200,000,000)
 *       → 다시 계산한 총세액 = «처음부터 남은 두 자산만 입력한 폼»
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`first-asset-removal.anchor.test.ts`)다 — 여기는 카드 삭제 버튼 → Step1 → 계산기 결과 비우기 배선 확인이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const land = (id: string, sale: string, acq: string) => ({
  assetId: id,
  assetKind: "land",
  landNature: "general",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  actualSalePrice: sale,
  fixedAcquisitionPrice: acq,
  addressJibun: `서울 테스트동 ${id}`,
  areaScenario: "same",
  acquisitionArea: "100",
  transferArea: "100",
  standardPriceAtTransfer: String(Number(sale) / 2),
});

const A = land("a1", "700000000", "100000000");
const B = land("b1", "300000000", "200000000");
const C = land("c1", "200000000", "150000000");

function seedForm(raw: Record<string, unknown>[], isUnregistered: boolean) {
  return {
    state: {
      formData: {
        assets: raw.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a })),
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        bundledSaleMode: "actual",
        contractTotalPrice: String(raw.reduce((s, a) => s + Number(a.actualSalePrice), 0)),
        isOneHousehold: false,
        householdHousingCount: "0",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isUnregistered,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, raw: Record<string, unknown>[], isUnregistered: boolean) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(raw, isUnregistered));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const res = await resP;
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { data: { aggregated: { totalTax: number } } };
  return json.data.aggregated.totalTax;
}

const storedForm = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData);

test.describe("첫 자산 삭제", () => {
  test("T1: 계산 후 첫 자산 삭제 → 배지·미등기·사이드바·재계산", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [A, B, C], true);
    const before = await calculate(page);
    expect(before).toBeGreaterThan(0);

    await page.getByRole("button", { name: "이전 단계로 이동" }).click();
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    const sidebar = page.locator("aside");
    // 계산 직후 사이드바 첫 행 = 엔진 값(자산 a1 양도가)
    await expect(sidebar.getByText("700,000,000").first()).toBeVisible();

    await page.locator('[data-asset-card-index="0"]').getByRole("button", { name: "삭제" }).click();

    await expect(page.locator('[data-asset-card-index="0"]').getByText("주 자산", { exact: true })).toBeVisible();
    await expect(page.locator('[data-asset-card-index="1"]').getByText("주 자산", { exact: true })).toHaveCount(0);
    // 재마운트 — 새 첫 카드가 ① 기본정보(양도일·신고일)를 펼친 채 시작한다(컴패니언 때의 접힘 상태를 이어받지 않는다)
    await expect(page.locator('[data-asset-card-index="0"]').getByText("양도일", { exact: true })).toBeVisible();
    const f = await storedForm(page);
    expect(f.assets.map((a: { assetId: string }) => a.assetId)).toEqual(["b1", "c1"]);
    expect(f.isUnregistered).toBe(false);
    expect(f.assets.map((a: { isPrimaryForHouseholdFlags: boolean }) => a.isPrimaryForHouseholdFlags)).toEqual([true, false]);
    expect(f.assets.map((a: { assetLabel: string }) => a.assetLabel)).toEqual(["자산 1", "자산 2"]);

    // 사이드바 — 지운 자산의 엔진 값이 새 첫 행에 붙지 않는다(결과가 비워져 입력값 프리뷰)
    await expect(sidebar.getByText("700,000,000")).toHaveCount(0);
    await expect(sidebar.getByText("100,000,000")).toHaveCount(0);
    await expect(sidebar.getByText("300,000,000").first()).toBeVisible();
    await expect(sidebar.getByText("200,000,000").first()).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/first-asset-removal-after.png", fullPage: true });

    // 총 양도가액을 남은 자산 합으로 고친 뒤 다시 계산 — 처음부터 [B, C]만 입력한 폼과 같아야 한다
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}");
      s.state.formData.contractTotalPrice = "500000000";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s));
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    const removed = await calculate(page);

    await seed(page, [B, C], false);
    const reference = await calculate(page);
    expect(removed).toBe(reference);
    expect(removed).not.toBe(before);
  });

  test("T2: 첫 자산 삭제 → 보유 상황 상단 안내 카드 → 확인 해제(값은 그대로)", async ({ page }) => {
    test.setTimeout(120_000);
    const house = (id: string, acq: string) => ({
      assetId: id,
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: acq,
      actualSalePrice: "300000000",
      fixedAcquisitionPrice: "200000000",
      addressJibun: `서울 테스트동 ${id}`,
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "0",
    });
    const raw = [house("h1", "2018-03-01"), house("h2", "2019-05-02"), house("h3", "2019-06-02")];
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
      ...seedForm(raw, false),
      state: {
        ...seedForm(raw, false).state,
        formData: {
          ...seedForm(raw, false).state.formData,
          isOneHousehold: true,
          householdHousingCount: "1",
          wasRegulatedAtAcquisition: true,
          marriageDate: "2020-01-01",
        },
      },
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.locator('[data-asset-card-index="0"]').getByRole("button", { name: "삭제" }).click();
    const f = await storedForm(page);
    expect(f.firstAssetChangeNote).toEqual({ newFirstAssetId: "h2", groups: ["regulated", "merge"] });

    await page.getByRole("button", { name: "보유 상황" }).first().click();
    const notice = page.getByTestId("first-asset-change-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("지금은 ‘자산 1 · 서울 테스트동 h2’이(가)");
    await expect(page.getByTestId("first-asset-change-notice-regulated")).toBeVisible();
    await expect(page.getByTestId("first-asset-change-notice-merge")).toBeVisible();
    await page.screenshot({ path: "e2e/_artifacts/first-asset-change-notice.png", fullPage: true });

    await page.getByTestId("first-asset-change-notice-ack").click();
    await expect(notice).toHaveCount(0);
    const g = await storedForm(page);
    expect(g.firstAssetChangeNote).toBeUndefined();
    expect(g.wasRegulatedAtAcquisition).toBe(true);
    expect(g.marriageDate).toBe("2020-01-01");
  });
});
