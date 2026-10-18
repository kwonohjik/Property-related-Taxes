/**
 * E2E: D1-H — 1990.8.30.~2005.4.29. 상속·증여 주택 부수토지(건물 매매): 영 §163⑨ 단서 2호 max(평가액, 영 §164⑦ 가액의 토지 몫) 입력·표시
 *
 * 계획서: docs/00-pm/transfer-house-land-163-9-2.plan.md (Q-1~Q-5 권고안) · 근거 부동산거래관리과-364(2010.3.10.)
 *
 * - 카드 노출 → 「받을 당시 주택 있었음」 → 단독·다가구 → 4칸 입력 → 계산 → 요청 body `landHouseExisted`·`landHouseSec164Value`·`buildingHouseKind`
 *   → 결과 카드·상세명세서가 「평가액 vs 영 §164⑦ 가액의 토지 몫 → 채택」을 엔진 echo 그대로 보인다.
 * - ⑧: 「받을 당시 주택」 미선택 → 그 칸으로 이동. 모름 → 평가액만 · body에 ② 없음.
 * - 부정형 짝: 토지 증여일을 2005-04-30으로 고치면 카드가 사라진다.
 *
 * ⚠️ 수치의 정본은 vitest anchor(`house-land-sec164-card.d1h.ui.anchor.test.tsx`)다. 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, card, housing, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 2018-06-01 매매 3.5억 + 토지 1995-05-01 증여 ① 1억 · 파트 실가 · 양도 900,000,000 · 토지 면적 200㎡ */
const d1h = (over: Record<string, unknown> = {}) =>
  housing({
    landAcquisitionCause: "gift",
    landCauseHost: "purchase",
    landAcquisitionDate: "1995-05-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "100000000",
    buildingAcquisitionPrice: "350000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    ...over,
  });

/** ② = 300,000,000 × (500,000 × 200) ÷ (1,000,000 × 200 + 60,000,000) = 115,384,615 */
const SEC164 = {
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValBuildingStdPriceAtFirst: "60000000",
  inhHouseValLandPricePerSqmAtInheritance: "500000",
};

const hlCard = (p: Page) => p.getByTestId("house-land-sec164-card");
/** CurrencyInput·LandPriceLookupField는 input 자신에, FieldCard는 래퍼에 data-field를 단다 — 둘 다 받는다 */
const field = (p: Page, f: string) => hlCard(p).locator(`input[data-field="${f}"], [data-field="${f}"] input`).first();
const existedRadio = (p: Page, name: RegExp) => hlCard(p).locator('[data-field="landHouseExisted"]').getByRole("radio", { name });
const kindRadio = (p: Page, name: RegExp) => hlCard(p).locator('[data-field="inheritanceAssetKind"]').getByRole("radio", { name });

async function ready(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test.describe("D1-H 주택 부수토지 — ② 입력 카드 → 계산 → 채택 표시", () => {
  test("있었음 → 단독·다가구 → 4칸 입력 → ② 115,384,615 채택 · body · 카드·명세서", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([d1h()]));
    await expandAssetSection(page, 3);
    await expect(hlCard(page)).toBeVisible();
    await expect(hlCard(page).getByRole("switch")).toHaveCount(0); // 토글 없음 — 법이 정한 비교

    await existedRadio(page, /있었음/).check();
    await kindRadio(page, /단독·다가구주택/).check();
    for (const [k, v] of Object.entries(SEC164)) await field(page, k).fill(v);
    await expect(page.getByTestId("house-land-sec164-total")).toHaveText("115,384,615");

    const body = await calculate(page);
    expect(body).toMatchObject({
      landAcquisitionCause: "gift",
      landAcquisitionPrice: 100_000_000,
      landHouseExisted: "yes",
      buildingHouseKind: "house_individual",
      landHouseSec164Value: 115_384_615,
    });

    const basis = card(page, "split-card-acq-basis");
    await expect(basis).toBeVisible();
    await expect(basis).toContainText("토지 취득가액 비교");
    await expect(basis).toContainText("단서 2호");
    await expect(card(page, "split-card-acq-basis-reported")).toHaveText("100,000,000");
    await expect(card(page, "split-card-acq-basis-sec164")).toHaveText("115,384,615");
    await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("영 §164⑦ 가액의 토지 몫");
    await expect(card(page, "split-card-acq-land")).toHaveText("115,384,615");

    expect(await stmtText(page, "취득가액")).toContain("많은 금액(증여 신고가액 100,000,000, 영 §164⑦ 가액의 토지 몫 115,384,615)");
  });

  test("모름 → 평가액만 · body에 ②·구분 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d1h({ ...SEC164, landHouseExisted: "unknown", inheritanceAssetKind: "house_individual" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("house-land-sec164-unknown-note")).toBeVisible();
    const body = await calculate(page);
    expect(body.landHouseExisted).toBe("unknown");
    expect(body.landHouseSec164Value).toBeUndefined();
    expect(body.buildingHouseKind).toBeUndefined();
    await expect(card(page, "split-card-acq-basis")).toHaveCount(0);
    await expect(card(page, "split-card-acq-land")).toHaveText("100,000,000");
  });

  test("부정형 짝 — 토지 증여일이 2005-04-30이면 카드가 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedWizard(page, singleSeed([d1h({ landAcquisitionDate: "2005-04-30" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("land-part-cause-purchase")).toBeVisible();
    await expect(hlCard(page)).toHaveCount(0);
  });
});

test.describe("D1-H ⑧ — 「받을 당시 주택」 미선택이면 그 칸으로 이동 (막다른 길 0)", () => {
  test("미선택 → 「다음」 → 선택 요구 · 라디오가 뷰포트 안", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d1h()]));
    await ready(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /토지를 받을 당시 지금의 주택이 그 위에 있었는지 선택하세요/ })).toBeVisible();
    await expect(existedRadio(page, /있었음/)).toBeInViewport();
  });
});
