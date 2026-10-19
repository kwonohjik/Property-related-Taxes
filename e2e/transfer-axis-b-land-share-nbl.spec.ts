/**
 * E2E: 축 B(같은 땅을 지분으로 나눠 취득) 토지 — 비사업용 정밀판정이 지분마다 돌고, 결과 화면에 지분 고지가 뜬다.
 * 계획서: `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md`
 *
 * 세액·판정 단위는 `transfer.route.axis-b-land-share-nbl.anchor.test.ts`가 고정한다(mock 세율표).
 * 여기서만 관측되는 것: 실제 화면이 보내는 요청에 지분 정밀판정 입력이 실리는지 · 응답의 지분별 판정 · 결과 화면의 「확인 필요」 고지.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-land-share-nbl.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
const LAND = {
  assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
};
const SHARE2 = { acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000", ...HALF };

type Body = { companionAssets?: Array<{ nonBusinessLandRaw?: unknown }> };
type Data = { aggregated: { properties: Array<{ nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean } }> } };

async function calc(page: Page, assets: object[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)),
    {
      state: {
        formData: { transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional", assets },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return { req: resp.request().postDataJSON() as Body, data: ((await resp.json()) as { data: Data }).data };
}

test("[AXN-1] 같은 날 취득 50/50 — 둘째 지분도 정밀판정 입력이 실리고 «사업용»으로 판정된다", async ({ page }) => {
  test.setTimeout(90_000);
  const { req, data } = await calc(page, [
    { ...makeDefaultAsset(1), ...LAND, ...HALF },
    { ...makeDefaultAsset(2), ...SHARE2 },
  ]);
  expect(req.companionAssets?.[0]?.nonBusinessLandRaw).toBeDefined();
  expect(data.aggregated.properties.map((p) => p.nonBusinessLandJudgmentDetail?.isNonBusinessLand)).toEqual([false, false]);
});

test("[AXN-2] 둘째 지분 매매 취득 — 첫 카드 「직계존속 8년 자경」 선언 미적용 고지가 결과 화면에 뜬다", async ({ page }) => {
  test.setTimeout(90_000);
  const { data } = await calc(page, [
    {
      ...makeDefaultAsset(1), ...LAND, ...HALF, transferCause: "general", expropriationNoticeDate: "",
      acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000",
      nblLandType: "farmland", nblZoneType: "agricultural", nblExemptAncestor8YearFarming: true,
    },
    { ...makeDefaultAsset(2), ...SHARE2, acquisitionDate: "2019-06-03" },
  ]);
  expect(data.aggregated.properties.map((p) => p.nonBusinessLandJudgmentDetail?.isNonBusinessLand)).toEqual([false, true]);
  await expect(page.getByText(/이 지분의 판정에는 적용하지 않았습니다 — 확인 필요/).first()).toBeVisible({ timeout: 15_000 });
});
