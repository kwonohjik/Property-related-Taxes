/**
 * E2E: 양도세 부담부증여 — 취득가액 산정방식 「매매사례가액(K-6)·감정가액(K-7)」
 *
 * 교재 문제 20 상황 1(토지, 채무 80,000,000, 시가 400,000,000, 증여일 기준시가 320,000,000,
 * 취득시 기준시가 180,000,000, 취득 당시 감정가 250,000,000) → 취득가액 50,000,000 · 개산공제 1,080,000 ·
 * **양도차익 28,920,000** 을 화면에서 재현한다.
 *
 *   PA-1. 라디오 4옵션(실지·매매사례·감정·환산) + 선택 시 입력 칸·개산공제 안내 + 방식 전환 시 값 초기화
 *   PA-2. 감정가액 — 입력 → 계산 → 결과 양도차익 28,920,000
 *   PA-3. 매매사례가액 — 같은 값 (A-2)
 *   PA-4. 축 B(지분 분할 취득) — 두 옵션이 비활성(⑧과 같은 술어)
 *   PA-6. 단건 상세 계산 명세서·신고서 양식(요약표)이 엔진 값과 일치 — 역산 오표기(음수 취득가액·양도비) 회귀 방지
 *   PA-5. 일반건물 — 토지·건물 감정가액 2칸이 payload(`presumedLand/BuildingAcquisitionPrice`)에 실려 §159로 안분된다
 *
 * ⚠️ 새 옵션의 문구에 「환산취득가액」·「실지취득가액 안분」이 없어야 기존 spec
 *    (`transfer-burdened-gift-acquisition-method.spec.ts`)의 라디오 셀렉터가 strict mode를 지킨다 — PA-1이 함께 고정한다.
 * 포트: 하드코딩하지 않는다(`baseURL`). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function landSeed(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-10-20",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "400000000",
    bgMortgageDebtAmount: "80000000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    bgPresumedAcquisitionLand: "250000000",
    standardPriceAtTransfer: "320000000",
    standardPriceAtAcq: "180000000",
    ...over,
  };
}

async function seedAndOpen(page: Page, assets: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets,
          transferDate: "2023-06-01",
          filingDate: "2023-08-31",
          contractTotalPrice: "",
          householdHousingCount: "1",
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 보유 상황 → 감면·공제 → 가산세 단계를 지나 계산 API 응답을 기다린다. */
async function calculate(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const res = await calcResponse;
  expect(res.status()).toBe(200);
  return res;
}

test.describe("부담부증여 — 매매사례가액·감정가액 (K-6/K-7)", () => {
  test("PA-1: 라디오 4옵션 + 입력 칸·개산공제 안내 + 방식 전환 시 값 초기화", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await card.getByRole("button", { name: "주택", exact: true }).click();
    await card.getByRole("radio", { name: /부담부증여/ }).check();
    await card.getByRole("radio", { name: /상증법 시가/ }).check();

    // 4옵션 — 법령 순차 순서. 기존 spec의 두 정규식은 각각 정확히 1개만 잡아야 한다(strict mode).
    const group = card.locator('[data-field="bgAcquisitionMethod"]');
    await expect(group.getByRole("radio")).toHaveCount(4);
    await expect(card.getByRole("radio", { name: /환산취득가액/ })).toHaveCount(1);
    await expect(card.getByRole("radio", { name: /실지취득가액 안분/ })).toHaveCount(1);
    const sales = card.getByRole("radio", { name: /매매사례가액/ });
    const appraisal = card.getByRole("radio", { name: /감정가액/ });
    await expect(sales).toBeEnabled();
    await expect(appraisal).toBeEnabled();

    // 감정가액 선택 → 총액 칸 + 개산공제 안내(자본적지출·양도비 칸은 없다)
    await appraisal.check();
    const total = card.locator('[data-field="bgPresumedAcquisitionTotal"] input, input[data-field="bgPresumedAcquisitionTotal"]').first();
    await expect(total).toBeVisible();
    await expect(card.getByTestId("bg-presumed-expense-notice")).toContainText("자본적지출·양도비는 공제하지 않습니다");
    await expect(card.getByText("감정가액 (주택·건물 전체)")).toBeVisible();
    await expect(card.getByText("자본적지출 (선택)")).toHaveCount(0);
    await total.fill("250000000");
    await expect(total).toHaveValue("250000000");

    // 매매사례가액으로 전환 → 감정가액 값이 초기화된다(의미가 달라 stale 해석 위험 — onChange 패치)
    await sales.check();
    await expect(card.getByText("매매사례가액 (주택·건물 전체)")).toBeVisible();
    await expect(
      card.locator('[data-field="bgPresumedAcquisitionTotal"] input, input[data-field="bgPresumedAcquisitionTotal"]').first(),
    ).toHaveValue("");

    // 환산으로 가면 새 입력 블록이 사라지고, 실지로 가면 K-4 입력 블록이 뜬다(회귀 0)
    await card.getByRole("radio", { name: /환산취득가액/ }).check();
    await expect(card.getByTestId("bg-presumed-expense-notice")).toHaveCount(0);
    await card.getByRole("radio", { name: /실지취득가액 안분/ }).check();
    await expect(card.getByText("실지취득가액 입력")).toBeVisible();
    await expect(card.getByTestId("bg-presumed-expense-notice")).toHaveCount(0);
  });

  for (const [id, method, label] of [
    ["PA-2", "appraisal", "감정가액"],
    ["PA-3", "salesCase", "매매사례가액"],
  ] as const) {
    test(`${id}: ${label} — 문제 20 상황 1 → 양도차익 28,920,000`, async ({ page }) => {
      test.setTimeout(120_000);
      await seedAndOpen(page, [landSeed({ bgAcquisitionMethod: method })]);
      const res = await calculate(page);

      // 엔진 응답 — 취득가액 50,000,000 · 개산공제 1,080,000 · 양도차익 28,920,000
      const body = await res.json();
      const r = body.data?.result ?? body.result ?? body.data;
      const bg = r.transferBurdenedGiftBreakdown;
      expect(bg.acquisitionMethodUsed).toBe(method);
      expect(bg.perAsset.land.acquisitionPrice).toBe(50_000_000);
      expect(bg.perAsset.land.estimatedDeduction).toBe(1_080_000);
      expect(r.transferGain).toBe(28_920_000);

      // 결과 화면 — 부담부증여 평가 명세 카드가 새 방식을 이름으로 밝힌다
      await expect(page.getByText(`자산별 취득가액 (${label} 안분`).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("28,920,000").first()).toBeVisible();
    });
  }

  test("PA-4: 축 B(지분 분할 취득) — 두 옵션 비활성", async ({ page }) => {
    test.setTimeout(90_000);
    const half = (idx: number, num: string) =>
      landSeed({ ...makeDefaultAsset(idx), ownershipNumerator: num, ownershipDenominator: "100", bgAcquisitionMethod: "" });
    await seedAndOpen(page, [
      { ...half(1, "60"), assetKind: "housing", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2018-10-20", bgPresumedAcquisitionLand: "" },
      { ...half(2, "40"), assetKind: "housing", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2018-10-20", bgPresumedAcquisitionLand: "" },
    ]);
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 2);
    const group = card.locator('[data-field="bgAcquisitionMethod"]');
    await expect(group.getByRole("radio")).toHaveCount(4);
    await expect(card.getByRole("radio", { name: /매매사례가액/ })).toBeDisabled();
    await expect(card.getByRole("radio", { name: /감정가액/ })).toBeDisabled();
    // 대조군 — 실지·환산은 활성
    await expect(card.getByRole("radio", { name: /실지취득가액 안분/ })).toBeEnabled();
    await expect(card.getByRole("radio", { name: /환산취득가액/ })).toBeEnabled();
  });

  test("PA-5: 일반건물 — 토지·건물 감정가액이 엔진에 도달해 채무비율로 안분된다", async ({ page }) => {
    test.setTimeout(120_000);
    // 시가 20억 · 채무 5억(B/C = 25%) · 감정가액 토지 8억 + 건물 2억 → 취득가액 2억 + 5천만
    // 개산공제 base = 취득시 기준시가(토지 2,130,000×1,279㎡ · 건물 424,472,064) × 25% × 3% — 취득가액과 무관
    await seedAndOpen(page, [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1",
        assetKind: "general_building",
        transferType: "burdened_gift",
        bgValuationMode: "sangjeungbeop_market",
        bgMarketValueAtTransfer: "2000000000",
        bgMortgageDebtAmount: "500000000",
        bgDonorRelation: "lineal_descendant",
        bgAcquisitionMethod: "appraisal",
        bgPresumedAcquisitionLand: "800000000",
        bgPresumedAcquisitionBuilding: "200000000",
        acquisitionCause: "purchase",
        gbBuildingAcquisitionCause: "purchase",
        hasSeperateLandAcquisitionDate: false,
        acquisitionDate: "2018-10-20",
        gbLandArea: "1279",
        gbBuildingArea: "1341.5",
        gbBuildingFootprintArea: "388.27",
        gbZoneType: "commercial",
        gbTransferLandPricePerSqm: "6215000",
        gbTransferBuildingValue: "631846500",
        gbAcqLandPricePerSqm: "2130000",
        gbAcqBuildingValue: "424472064",
      },
    ]);
    const res = await calculate(page);
    const body = await res.json();
    const r = body.data?.result ?? body.result ?? body.data;
    const bg = r.transferBurdenedGiftBreakdown ?? r.bundled?.transferBurdenedGiftBreakdown ?? body.data?.transferBurdenedGiftBreakdown;
    expect(bg.acquisitionMethodUsed).toBe("appraisal");
    expect(bg.perAsset.land.acquisitionPrice).toBe(200_000_000);
    expect(bg.perAsset.building.acquisitionPrice).toBe(50_000_000);
    expect(bg.perAsset.land.presumedAcquisition).toBe(800_000_000);
    // 개산공제 — 취득가액이 아니라 취득시 기준시가 × 채무비율 × 3%
    expect(bg.perAsset.land.estimatedDeduction).toBe(Math.floor(Math.floor(2_130_000 * 1279 * 0.25) * 0.03));
  });

  for (const [method, label, presumedNote] of [
    ["appraisal", "감정가액", "감정가액"],
    ["salesCase", "매매사례가액", "매매사례가액"],
  ] as const) {
    test(`PA-6(${label}): 단건 명세서·신고서 양식 — 양도가액 80,000,000 · 취득가액 50,000,000 · 개산공제 1,080,000`, async ({ page }) => {
      test.setTimeout(120_000);
      await seedAndOpen(page, [landSeed({ bgAcquisitionMethod: method })]);
      await calculate(page);

      // 상세 계산 명세서 — 펼쳐서(기본 펼침이지만 접혀 있으면 펼친다) 행을 읽는다
      const statement = page.locator('[data-print-section="detailed-statement"]');
      await expect(statement).toBeVisible({ timeout: 30_000 });
      const expandAll = statement.getByRole("button", { name: /전체 펼치기/ });
      if (await expandAll.isVisible().catch(() => false)) await expandAll.click();

      // 취득가액 — 부담부증여 산식으로 적히고, 역산 오표기(실제 거래가액·음수)가 없다
      await expect(statement).toContainText(`취득가액 = ${presumedNote} × 채무액 / 증여재산 평가액`);
      // 「a / b」는 결과뷰가 분수(Frac)로 쌓아 그려 DOM 텍스트에는 「/」 없이 분자·분모가 이어진다
      await expect(statement).toContainText(/= 250,000,000 × 80,000,000\s*400,000,000/);
      await expect(statement).toContainText("= 50,000,000");
      await expect(statement).not.toContainText("(실제 거래가액)");
      await expect(statement).not.toContainText("-30,000,000");
      // 필요경비 — 개산공제(취득시 기준시가 기준)이고 「양도비」가 아니다
      await expect(statement).toContainText("필요경비 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × 3%");
      await expect(statement).toContainText(/= 180,000,000 × 80,000,000\s*400,000,000 × 0\.03/);
      await expect(statement).toContainText("= 1,080,000");
      await expect(statement).not.toContainText("중개수수료");
      // 양도차익
      await expect(statement).toContainText("28,920,000");

      // 신고서 양식(요약표) — 양도가액·취득가액이 「-」가 아니다
      const form = page.locator('[data-print-section="form-table"]');
      const rowText = async (label: string) =>
        (await form.locator("tr", { hasText: label }).filter({ hasNotText: "전체 양도차익" }).first().innerText()).replace(/\s+/g, " ");
      expect(await rowText("양도가액")).toContain("80,000,000");
      expect(await rowText("취득가액")).toContain("50,000,000");
      expect(await rowText("필요경비")).toContain("1,080,000");
    });
  }
});
