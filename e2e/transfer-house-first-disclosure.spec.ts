/**
 * E2E: 주택별 개별주택가격 최초공시일 — 영 §163⑨ 단서 2호 구간의 끝을 주택마다로 (2026-10-19)
 *
 * 계획서: docs/00-pm/transfer-house-first-disclosure-per-house.plan.md (Q-1~Q-4 권고안) · 근거 영 §164⑦ ·
 * 부동산거래관리과-364(2005.5.12. 수증 · 2006.4.28. 최초공시).
 *
 * - 2005.5.12.에 받은 부수토지(건물 매매) → 진입 카드만 보인다 → 최초 공시일 2006-04-28 입력 → 주택 구분 단독 → 영 §164⑦ 카드가 열린다
 *   → 「있었음」·4칸 → 계산 → body `houseFirstDisclosureDate` · 토지 취득가액이 ② 115,384,615(2005.4.29. 이전 수증과 같은 비교).
 * - ⑧: 최초 공시일을 2005.4.30. 전으로 넣으면 그 칸으로 이동한다.
 *
 * ⚠️ 수치의 정본은 vitest anchor(`transfer.route.house-first-disclosure.anchor.test.ts`)다. 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, card, housing, seedWizard, singleSeed } from "./_helpers/split-acq-display";

/** 건물 2018-06-01 매매 3.5억 + 토지 2005-05-12 증여 ① 1억 · 파트 실가 · 양도 900,000,000 · 토지 면적 200㎡ · 주택 구분·「있었는지」 미선택 */
const d1h = (over: Record<string, unknown> = {}) =>
  housing({
    landAcquisitionCause: "gift",
    landCauseHost: "purchase",
    landAcquisitionDate: "2005-05-12",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "100000000",
    buildingAcquisitionPrice: "350000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    inheritanceAssetKind: "",
    landHouseExisted: "",
    ...over,
  });

/** ② = 300,000,000 × (500,000 × 200) ÷ (1,000,000 × 200 + 60,000,000) = 115,384,615 */
const SEC164 = {
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValBuildingStdPriceAtFirst: "60000000",
  inhHouseValLandPricePerSqmAtInheritance: "500000",
};

const entry = (p: Page) => p.getByTestId("house-first-disclosure-entry");
const hlCard = (p: Page) => p.getByTestId("house-land-sec164-card");
const field = (p: Page, f: string) => hlCard(p).locator(`input[data-field="${f}"], [data-field="${f}"] input`).first();

async function fillDate(p: Page, ymd: string) {
  const [y, m, d] = ymd.split("-");
  const inputs = p.getByTestId("house-first-disclosure-date").locator("input");
  await inputs.nth(0).fill(y);
  await inputs.nth(1).fill(String(Number(m)));
  await inputs.nth(2).fill(String(Number(d)));
}

async function ready(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test.describe("주택별 최초공시일 — 진입 카드 → 날짜·구분 → 영 §164⑦ 카드 → 계산", () => {
  test("2005.5.12. 수증 · 최초공시 2006.4.28. → ② 115,384,615 채택 · body에 날짜", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([d1h()]));
    await expandAssetSection(page, 3);
    await expect(entry(page)).toBeVisible();
    await expect(hlCard(page)).toHaveCount(0);
    await expect(page.locator('[data-field="inhHouseValFirstDisclosureDate"]')).toHaveCount(1);

    await fillDate(page, "2006-04-28");
    // 고르는 순간 진입 카드가 사라지고 영 §164⑦ 카드가 열린다 — check()는 사라진 라디오의 체크 상태를 기다리므로 click()
    await entry(page).locator('[data-field="inheritanceAssetKind"]').getByRole("radio", { name: /단독·다가구주택/ }).click();
    await expect(hlCard(page)).toBeVisible();
    await expect(entry(page)).toHaveCount(0);
    await expect(hlCard(page)).toContainText("(2006.4.28. 이전)");
    await expect(page.locator('[data-field="inhHouseValFirstDisclosureDate"]')).toHaveCount(1);

    await hlCard(page).locator('[data-field="landHouseExisted"]').getByRole("radio", { name: /있었음/ }).check();
    for (const [k, v] of Object.entries(SEC164)) await field(page, k).fill(v);
    await expect(page.getByTestId("house-land-sec164-total")).toHaveText("115,384,615");

    const body = await calculate(page);
    expect(body).toMatchObject({
      houseFirstDisclosureDate: "2006-04-28",
      landHouseExisted: "yes",
      buildingHouseKind: "house_individual",
      landHouseSec164Value: 115_384_615,
    });
    await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("영 §164⑦ 가액의 토지 몫");
    await expect(card(page, "split-card-acq-land")).toHaveText("115,384,615");
  });

  test("기본값(2005-04-30)이면 카드 없이 평가액만 · body에 날짜 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d1h({ ...SEC164, inheritanceAssetKind: "house_individual" })]));
    await expandAssetSection(page, 3);
    await expect(entry(page)).toBeVisible();
    const body = await calculate(page);
    expect(body.houseFirstDisclosureDate).toBeUndefined();
    expect(body.landHouseSec164Value).toBeUndefined();
    await expect(card(page, "split-card-acq-land")).toHaveText("100,000,000");
  });
});

test.describe("주택별 최초공시일 ⑧ — 범위 밖이면 그 칸으로 이동 (막다른 길 0)", () => {
  test("2004-12-31 → 「다음」 → 범위 안내 · 날짜 칸이 뷰포트 안", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d1h({ inhHouseValFirstDisclosureDate: "2004-12-31", inheritanceAssetKind: "house_individual" })]));
    await ready(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /2005\.4\.30\.\(개별주택가격 첫 공시\)부터 양도일까지/ })).toBeVisible();
    await expect(page.getByTestId("house-first-disclosure-date")).toBeInViewport();
  });
});
