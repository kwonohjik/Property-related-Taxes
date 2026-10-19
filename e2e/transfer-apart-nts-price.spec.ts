/**
 * E2E: 자산 단위 공동주택 — 「상속개시일 당시 국세청 고시 공동주택 기준시가가 있었는가」 (영 §163⑨ 단서 2호 · 2026-10-19)
 *
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md (A안 · Q-1~Q-3 A · 「모름」 없음)
 *
 * - 2000.3.1. 상속 공동주택 · ① 1억 · ② 4칸 입력 · 질문 미선택 → 「다음」 → 질문 칸으로 이동(막다른 길 0).
 * - 「있었음」 → §164 카드 없이 계산 → body `apartNtsPriceExisted: true` · `inheritedHouseValuation` 없음 · 의제 취득가액 100,000,000(①).
 * - 「없었음」 → 카드가 열린다 → 국세청 첫 고시 · 2001-01-01 → 계산 → ② 173,076,923(= 3억 × 1.5억 / 2.6억) 채택.
 *
 * ⚠️ 수치의 정본은 vitest anchor(`transfer.route.apart-nts-price.anchor.test.ts`)다. 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWizard, singleSeed } from "./_helpers/split-acq-display";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const apart = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
  addressJibun: "강원특별자치도 춘천시 테스트동 1",
  regionCode: "5111010100",
  assetKind: "housing",
  acquisitionCause: "inheritance",
  acquisitionDate: "2000-03-01",
  inheritanceStartDate: "2000-03-01",
  decedentAcquisitionDate: "1990-01-01",
  inheritanceAssetKind: "house_apart",
  inheritanceValuationMethod: "supplementary",
  publishedValueAtInheritance: "100000000",
  useEstimatedAcquisition: false,
  actualSalePrice: "1200000000",
  acquisitionArea: "200",
  transferArea: "200",
  inhHouseValLandArea: "200",
  inhHouseValLandPricePerSqmAtTransfer: "3000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValLandPricePerSqmAtInheritance: "500000",
  inhHouseValBuildingStdPriceAtFirst: "60000000",
  inhHouseValBuildingStdPriceAtInheritance: "50000000",
  ...over,
});
const seed = (over: Record<string, unknown> = {}) => singleSeed([apart(over)], { contractTotalPrice: "1200000000" });

const question = (p: Page) => p.getByTestId("apart-nts-price-question");
const sec164Card = (p: Page) => p.locator('[data-field="inhHouseValHousePriceAtFirst"]');

async function ready(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

/** 가산세 단계로 가서 계산 — 요청 body와 응답 결과를 함께 돌려준다. */
async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON();
  const res = await resP;
  expect(res.status()).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { body, result: json.data.result };
}

async function fillApartDate(p: Page, ymd: string) {
  const [y, m, d] = ymd.split("-");
  const inputs = p.getByTestId("apart-first-price-date").locator("input");
  await inputs.nth(0).fill(y);
  await inputs.nth(1).fill(String(Number(m)));
  await inputs.nth(2).fill(String(Number(d)));
}

test.describe("공동주택 국세청 고시 가액 — 필수 질문(모름 없음) → 답에 따라 ①/② 비교", () => {
  test("미선택 → 「다음」 → 질문 칸으로 이동 · 「모름」 선택지 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, seed());
    await ready(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByTestId("validation-issues").getByRole("button", { name: /국세청장이 고시한 공동주택 기준시가가 있었는지 고르세요/ }),
    ).toBeVisible();
    await expect(question(page)).toBeInViewport();
    await expect(question(page)).not.toContainText("모름");
    await expect(sec164Card(page)).toHaveCount(0);
  });

  test("있었음 → §164 카드 없음 · body 미송신 · 의제 취득가액 = ① 100,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed());
    await expandAssetSection(page, 3);
    await page.getByTestId("apart-nts-existed-yes").click();
    await expect(page.getByTestId("apart-nts-existed-note")).toBeVisible();
    await expect(sec164Card(page)).toHaveCount(0);

    const { body, result } = await calculate(page);
    expect(body.inheritedAcquisition).toMatchObject({ assetKind: "house_apart", apartNtsPriceExisted: true });
    expect(body.inheritedHouseValuation).toBeUndefined();
    expect(result.inheritedAcquisitionDetail.acquisitionPrice).toBe(100_000_000);
  });

  test("없었음 → 카드가 열린다 → 국세청 첫 고시 2001-01-01 → ② 173,076,923 · 영 §164⑥", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed());
    await expandAssetSection(page, 3);
    await page.getByTestId("apart-nts-existed-no").click();
    // 「없었음」을 고르면 카드가 열린다 — 첫 가격 날짜 전에는 조회 기준일이 2005-04-30이고, 날짜를 넣으면 그 날로 바뀐다
    await expect(sec164Card(page)).toHaveCount(1);
    await page.getByTestId("apart-first-price-nts").click();
    await fillApartDate(page, "2001-01-01");
    await expect(page.getByText("최초고시 시점 (2001-01-01)")).toBeVisible();

    const { body, result } = await calculate(page);
    expect(body.inheritedAcquisition).toMatchObject({ apartNtsPriceExisted: false, apartFirstPriceAgency: "nts", apartFirstPriceDate: "2001-01-01" });
    expect(body.inheritedHouseValuation).toBeDefined();
    expect(result.inheritedAcquisitionDetail.acquisitionPrice).toBe(173_076_923);
    expect(result.inheritedAcquisitionDetail.legalBasis).toBe("소득세법 시행령 §163 ⑨ 2호 · §164 ⑥");
  });
});
