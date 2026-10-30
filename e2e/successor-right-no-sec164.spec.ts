/**
 * E2E: ⑫ 승계 입주권 — §163⑨ 단서 ②(§164④~⑦ 가액) 운반 키 거부. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §11·§12.
 *
 * 「소득세법 시행령」 §163⑨ 단서는 토지·건물만이다 — 입주권(권리)은 평가액만. 화면 계산(200)이 보낸 요청 본문에 ② 키를 더해 같은 라우트에 직접 보낸다.
 *   SN-E1. 상속 단건 — 화면 본문에 ② 키 없음 · 상속개시일 2000 + 단독주택 + 주택 환산 → 400(종전 200 · 290,933,077)
 *   SN-E2. 상속 함께 양도 — 컴패니언에 §163⑨ 페이로드 + 주택 환산 → 400(종전 200)
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

const IHV = { inheritanceDate: "2000-03-01", transferDate: "2026-02-16", landArea: 200, landPricePerSqmAtTransfer: 3_000_000, landPricePerSqmAtFirstDisclosure: 1_000_000, landPricePerSqmAtInheritance: 500_000, housePriceAtTransfer: 0, housePriceAtFirstDisclosure: 900_000_000, buildingStdPriceAtFirstDisclosure: 60_000_000, buildingStdPriceAtInheritance: 50_000_000 };
const KEYS = ["inheritedHouseValuation", "pre1990Land", "commercialInheritanceValuation"];

test("SN-E1: 상속 단건 · 주택 환산(§164⑦) 직접 호출 — 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [succ(INH)]);
  expect(KEYS.filter((k) => k in body)).toEqual([]);
  Object.assign(body, { acquisitionDate: "2000-03-01", decedentAcquisitionDate: "1998-01-01", inheritedHouseValuation: IHV });
  Object.assign(body.inheritedAcquisition, { inheritanceStartDate: "2000-03-01", assetKind: "house_individual" });
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("§164④~⑦ 가액과 비교하지 않습니다");
});

test("SN-E2: 상속 함께 양도 · 컴패니언 주택 환산 직접 호출 — 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [land, succ({ ...INH, actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" })], { bundledSaleMode: "actual" });
  const c = body.companionAssets[0];
  expect(KEYS.filter((k) => k in c)).toEqual([]);
  Object.assign(c, { acquisitionDate: "2000-03-01", decedentAcquisitionDate: "1998-01-01", inheritedHouseValuation: IHV });
  c.inheritanceValuation.inheritanceDate = "2000-03-01";
  c.inheritedAcquisition = { mode: "post-deemed", inheritanceStartDate: "2000-03-01", assetKind: "house_individual", reportedValue: 300_000_000, reportedMethod: "supplementary", useSupplementaryHelper: true, publishedValueAtInheritance: 300_000_000 };
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("companionAssets.0.inheritedHouseValuation");
});
