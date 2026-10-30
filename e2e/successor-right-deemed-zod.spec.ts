/**
 * E2E: ⑫ 상속·증여 승계 입주권 — §163⑨ 평가액 채널 없이 승계취득가액 칸만 오면 400. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §9.
 *
 * 화면 계산(200)이 보낸 요청 본문을 받아, 평가액 채널을 지운 사본을 같은 라우트에 직접 보낸다.
 *   SD-E1. 증여 단건 — `inheritedAcquisition` 없이 `acquisitionPrice` 900,000,000 → 400(종전 200 · 133,060,000)
 *   SD-E2. 상속 함께 양도 — 컴패니언 `inheritanceValuation` 없이 `fixedAcquisitionPrice` 100,000,000 → 400(종전 200)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const succ = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular",
  isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "", successorRightAddedContribution: "",
  ...over,
});
const GIFT = { acquisitionCause: "gift", acquisitionDate: "2023-06-01", donorAcquisitionDate: "2021-01-01", fixedAcquisitionPrice: "300000000" };
const INH = { acquisitionCause: "inheritance", acquisitionDate: "2023-06-01", inheritanceStartDate: "2023-06-01", decedentAcquisitionDate: "2021-01-01", publishedValueAtInheritance: "300000000" };
const land = { ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };

async function calcBody(page: Page, assets: unknown[], extra: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...extra,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  return { url: r.url(), body: r.request().postDataJSON() };
}

test("SD-E1: 증여 단건 · 평가액 페이로드 없이 acquisitionPrice만 — 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [succ(GIFT)]);
  delete body.inheritedAcquisition;
  body.acquisitionPrice = 900_000_000;
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("§163⑨");
});

test("SD-E2: 상속 함께 양도 · 컴패니언 상속개시일 평가액 없이 fixedAcquisitionPrice만 — 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [land, succ({ ...INH, actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" })], { bundledSaleMode: "actual" });
  delete body.companionAssets[0].inheritanceValuation;
  body.companionAssets[0].fixedAcquisitionPrice = 100_000_000;
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("inheritanceValuation");
});
