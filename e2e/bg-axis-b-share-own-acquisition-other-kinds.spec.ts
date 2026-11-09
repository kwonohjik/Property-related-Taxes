/**
 * 축 B(지분 분할) × 부담부증여 — 주택 · 토지 · 상가 지분 카드(「+ 지분 추가」 기본값 그대로)의 취득가액 따로 입력 브라우저 확인.
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §15 D-3 · D-3b · D-3c (Q-8 a · Q-9 a · D-3c 함께 고침).
 *
 * - OKE-1: 지분 카드 ③에 계산에 쓰이지 않는 일반 「취득가액 산정 방식」 칸이 없고(D-3c), 부담부증여 안내가 자산 1의 ②와 이 카드의 토글을 가리킨다(D-3b).
 *   토글을 켜고 이 지분 실지취득가액 300,000,000 입력 → 양도차익 438,000,000(anchor OK-1과 같은 오라클).
 * - OKE-2: 토글 끔(기본) — 자산 1 값으로 계산 450,000,000.
 * - OKE-3: 주택 지분 카드 화면(일반 취득가액 칸 없음 · 안내 · 토글). 계산은 주택 명부(「보유 상황」) 입력이 필요해 OKE-1·2는 토지 · 상가로 한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

type Kind = "housing" | "land" | "commercial_building";
const FIELD: Record<Kind, string> = { housing: "bgActualAcquisitionTotal", land: "bgActualAcquisitionLand", commercial_building: "bgActualAcquisitionTotal" };
const primaryOf = (k: Kind) => ({
  ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: k, acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgAcquisitionMethod: "actual",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", [FIELD[k]]: "250000000", ownershipNumerator: "60", ownershipDenominator: "100",
  ...(k === "land" ? { landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent" } : {}),
});

async function seed(page: Page, k: Kind) {
  // 지분 2 = 「+ 지분 추가」 기본값(양도 형태 「일반 양도」) + 취득원인 · 취득일 · 지분율만. 실지취득가액 칸은 비어 있다(값 있는 칸에 fill하면 느린 러너에서 이어 붙는다).
  const assets = [primaryOf(k), { ...makeDefaultAsset(2), assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", ownershipNumerator: "40", ownershipDenominator: "100" }];
  const s = {
    state: {
      formData: {
        assets, assetSplitMode: "fractional", transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1000000000", totalTransferExpense: "0",
        householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // hydration 대기(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bg-share-own-acquisition"] [role="switch"]');
    return !!el && Object.keys(el).some((key) => key.startsWith("__react"));
  });
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { data: { aggregated: { totalTransferGain: number } } };
}

/** 지분 카드 ③ 화면 — 일반 취득가액 칸 없음(D-3c) · 안내가 자산 1의 ②와 이 카드의 토글을 가리킨다(D-3b). 안내 요소를 돌려준다. */
async function checkShareCardAcq(page: Page) {
  await page.getByRole("button", { name: /취득정보/ }).last().click();
  // D-3c — 계산에 쓰이지 않는 일반 취득가액 산정 방식 라디오가 없다
  await expect(page.getByText("계약서상 실거래가")).toHaveCount(0);
  // D-3b — 지분 카드 안내는 숨은 「위 ‘부담부증여’ 카드」가 아니라 자산 1의 ②와 이 카드의 토글을 가리킨다
  const src = page.getByTestId("bg-acq-method-source").last();
  await expect(src).toContainText("자산 1의 ② 양도정보");
  await expect(src).toContainText("이 지분의 취득가액을 자산 1과 따로 입력");
  return src;
}

test.describe("축 B × 부담부증여 — 주택 · 토지 · 상가 지분 카드 취득가액 따로 입력", () => {
  test("OKE-3 housing: 지분 카드 화면 — 일반 취득가액 칸 없음 · 안내 · 토글", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, "housing");
    await checkShareCardAcq(page);
    await expect(page.getByTestId("bg-share-own-acquisition").getByRole("switch", { name: /이 지분의 취득가액을 자산 1과 따로 입력/ })).toBeVisible();
  });

  for (const k of ["land", "commercial_building"] as const) {
    test(`OKE-1 ${k}: 일반 취득가액 칸 없음 · 안내가 실제 위치 · 토글 켬 → 438,000,000`, async ({ page }) => {
      test.setTimeout(120_000);
      await seed(page, k);
      const src = await checkShareCardAcq(page);
      const block = page.getByTestId("bg-share-own-acquisition");
      const sw = block.getByRole("switch", { name: /이 지분의 취득가액을 자산 1과 따로 입력/ });
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "true");
      await expect(block.getByRole("radio", { name: /실지취득가액 안분/ })).toBeChecked();
      await expect(src).toContainText("이 카드 위 「이 지분의 취득가액을 자산 1과 따로 입력」에서 선택");
      // 처음 켤 때 자산 1 값(2.5억)으로 시작한다 — 값 있는 칸에 fill하지 않도록 비우고 입력
      const input = block.locator(`input[data-field="${FIELD[k]}"], [data-field="${FIELD[k]}"] input`).first();
      await input.click();
      await input.press("ControlOrMeta+a");
      await input.press("Backspace");
      await expect(input).toHaveValue("");
      await input.fill("300000000");
      await expect(input).toHaveValue(/^300,?000,?000$/);
      const j = await calc(page);
      expect(j.data.aggregated.totalTransferGain).toBe(438_000_000);
    });
  }

  test("OKE-2 land: 토글 끔(기본) — 자산 1 값으로 계산 450,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, "land");
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(450_000_000);
  });
});
