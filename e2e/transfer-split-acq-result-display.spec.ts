/**
 * E2E: 토지·건물 별개 취득(split) — 결과 표시 정합 (Phase C UI)
 *
 * 설계: `docs/02-design/features/transfer-split-acq-result-display.ui.design.md` §6 · 계획서 C-통합 결정 1~10.
 *
 * 종전에는 결과 화면 네 곳이 같은 split 자산에 서로 다른 취득가액·필요경비를 보였다.
 *   · 단건 상세명세서가 `양도가액 − 양도차익 − result.expenses`로 역산해 개산공제가 취득가액 칸으로 섞이고 소제목이 항상 「(실제 거래가액)」
 *   · 다건·컴패니언 합산은 분리 자산의 취득가액 0 · 필요경비 = 취득합 + 개산공제(엔진 echo) — 신고서·명세서·요약 카드·건별 신고서 5곳이 따라 틀렸다
 *   · 집계 소제목이 환산 자산이 섞여도 「자산별 실제 거래가액 합계」
 *   · 일반건물 명세서의 실가 파트에 환산·안분 산식이 붙는 거짓 등식
 *
 *   S1~S6  단건 6조합(실/실·실/환·환/실·환/환·실/감정·매매사례/실) — 요청 body + 4뷰 값·라벨 일치 + 항등식
 *   S7     swap(§97②2호 단서) 파트 — 취득가액 0 · 필요경비 = 직접경비 · 안내
 *   S8     미등기 — 카드·명세서 개산공제율 0.3%
 *   S9     구 이력(echo 부재) — 율 echo가 없으면 종전 「× 3%」
 *   S10    전액 비과세 split(엔진 보고 #1) — 신고서·명세서·카드가 비과세와 모순 없이 파트 값을 보인다
 *   M1     컴패니언(자산 2건)    M2 다건(이력 시드)    M3 다건 비과세·평범한 환산 토지 소제목
 *   G1~G3  일반건물 — 실가 파트 거짓 등식 제거 · 일괄 실가 안분 분모(취득시) · stale 총액
 *
 * 소유자 분리(selfOwns ≠ both) 항등식(S11·S12·M5~M7)은 `transfer-split-acq-owner-split-display.spec.ts` — 800줄 정책 분리.
 *
 * ⚠️ 수치의 정본은 vitest anchor(`split-acq-result-display.c.*.anchor.test.*`)다. 이 스펙은 「입력이 엔진을 거쳐 네 화면에 같은 값으로
 *    도달한다」는 배선 확인이다. 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect } from "@playwright/test";
import {
  type Over,
  card,
  calculate,
  formRow,
  housing,
  landStandalone,
  multiForm,
  multiProps,
  num,
  runMulti,
  seedWizard,
  singleSeed,
  stmtRow,
  stmtText,
  stmtValue,
  won,
} from "./_helpers/split-acq-display";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";

interface Combo {
  name: string;
  land: "actual" | "estimated" | "salesCase";
  building: "actual" | "estimated" | "appraisal";
  /** 화면 라벨 */
  labels: [string, string];
  /** 시드 가액 */
  seed: Over;
  /** 정답 — 엔진 splitDetail 값(설계서 §1.3) */
  acq: [number, number];
  ded: [number, number];
}
const COMBOS: Combo[] = [
  { name: "실가/실가", land: "actual", building: "actual", labels: ["실거래가", "실거래가"], seed: { landAcquisitionPrice: "200000000", buildingAcquisitionPrice: "150000000" }, acq: [200_000_000, 150_000_000], ded: [0, 0] },
  { name: "실가/환산", land: "actual", building: "estimated", labels: ["실거래가", "환산취득가"], seed: { landAcquisitionPrice: "200000000" }, acq: [200_000_000, 112_500_000], ded: [0, 1_500_000] },
  { name: "환산/실가", land: "estimated", building: "actual", labels: ["환산취득가", "실거래가"], seed: { buildingAcquisitionPrice: "150000000" }, acq: [225_000_000, 150_000_000], ded: [3_000_000, 0] },
  { name: "환산/환산", land: "estimated", building: "estimated", labels: ["환산취득가", "환산취득가"], seed: {}, acq: [225_000_000, 112_500_000], ded: [3_000_000, 1_500_000] },
  { name: "실가/감정", land: "actual", building: "appraisal", labels: ["실거래가", "감정가액"], seed: { landAcquisitionPrice: "200000000", buildingAcquisitionPrice: "150000000" }, acq: [200_000_000, 150_000_000], ded: [0, 1_500_000] },
  { name: "매매사례/실가", land: "salesCase", building: "actual", labels: ["매매사례가액", "실거래가"], seed: { landSalesCaseValue: "210000000", buildingAcquisitionPrice: "150000000" }, acq: [210_000_000, 150_000_000], ded: [3_000_000, 0] },
];
const sum = (a: [number, number]) => a[0] + a[1];

// ───────────────────────────────────────────────────────────────────────────
// S — 단건
// ───────────────────────────────────────────────────────────────────────────
test.describe("단건 — split 6조합 × 4뷰(카드·신고서·명세서·단계 문구)가 같은 값을 보인다", () => {
  for (const c of COMBOS) {
    test(`S: ${c.name}`, async ({ page }) => {
      test.setTimeout(150_000);
      await seedWizard(page, singleSeed([housing({ landAcqMode: c.land, buildingAcqMode: c.building, ...c.seed })]));
      const body = await calculate(page);
      // 요청 body — 파트 모드·가액이 실려 간다
      expect(body.landAcqMode).toBe(c.land);
      expect(body.buildingAcqMode).toBe(c.building);

      // ② 신고서 합계 열 + 토지·건물 열
      const acqRow = await formRow(page, "취득가액");
      const expRow = await formRow(page, "필요경비");
      expect([num(acqRow[2]), num(acqRow[3])]).toEqual(c.acq);
      expect(num(acqRow[1])).toBe(sum(c.acq));
      expect(num(expRow[1])).toBe(sum(c.ded));
      const gainRow = await formRow(page, "전체 양도차익");
      // 항등식 — 양도가액 900,000,000 − 취득가액 − 필요경비 = 전체 양도차익
      expect(900_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));

      // ① 결과 카드 — 라벨은 정본 어휘, 「실지취득가액」 없음, 값 = 신고서 열
      await expect(card(page, "split-card-acq-mode-land")).toHaveText(c.labels[0]);
      await expect(card(page, "split-card-acq-mode-building")).toHaveText(c.labels[1]);
      await expect(card(page, "split-card-acq-land")).toContainText(won(c.acq[0]));
      await expect(card(page, "split-card-acq-building")).toContainText(won(c.acq[1]));
      await expect(page.locator('[data-print-id="split-detail"]').first()).not.toContainText("실지취득가액");

      // ③ 상세명세서 — 값 = 신고서 합계, 소제목 「토지(…) + 건물(…)」, 개산공제는 필요경비 칸
      expect(await stmtValue(page, "취득가액")).toBe(sum(c.acq));
      expect(await stmtValue(page, "필요경비")).toBe(sum(c.ded));
      const acqText = await stmtText(page, "취득가액");
      expect(acqText).toContain(`토지(${c.labels[0]}) ${won(c.acq[0])} + 건물(${c.labels[1]}) ${won(c.acq[1])}`);
      expect(acqText).not.toContain("(실제 거래가액)");
      if (sum(c.ded) > 0) expect(await stmtRow(page, "필요경비").innerText()).toContain("개산공제");

      // ④ 엔진 단계 문구(H-2) — 글자 그대로 계산하면 금액이 나오는 파트별 문구
      const gainFormula = await stmtText(page, "전체 양도차익");
      expect(gainFormula).toContain(`취득가(토지 ${c.labels[0]} ${won(c.acq[0])} + 건물 ${c.labels[1]} ${won(c.acq[1])})`);
    });
  }
});

test.describe("단건 — swap · 미등기 · 구 이력 · 비과세", () => {
  test("S7: swap(§97②2호 단서) 파트 — 건물 취득가액 0 · 필요경비 150,000,000 · 안내 (신고서·명세서·카드가 같은 항등식)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      singleSeed([housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000", buildingDirectExpenses: "150000000" })]),
    );
    await calculate(page);

    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    const gainRow = await formRow(page, "전체 양도차익");
    expect(num(acqRow[1])).toBe(200_000_000);
    expect(num(acqRow[3])).toBe(0); // 건물 열 — 차감되지 않는다
    expect(num(expRow[1])).toBe(150_000_000);
    expect(900_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("§97②2호 단서");

    expect(await stmtValue(page, "취득가액")).toBe(200_000_000);
    expect(await stmtValue(page, "필요경비")).toBe(150_000_000);
    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("건물(환산취득가) 0");
    expect(acqText).toContain("§97②2호 단서");
    await expect(stmtRow(page, "필요경비")).toContainText("건물 자본적지출·양도비 150,000,000");
    await expect(card(page, "split-card-acq-building")).toContainText("차감 안 됨");
  });

  test("S8: 미등기 — 카드·명세서가 엔진 개산공제율 0.3%를 읽는다 (종전 하드코딩 3%)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      singleSeed([housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" })], { isUnregistered: true }),
    );
    await calculate(page);
    await expect(card(page, "split-card-lump-base-building")).toContainText("취득시 기준시가 50,000,000 × 0.3%");
    await expect(card(page, "split-card-lump-base-building")).not.toContainText("× 3%");
    expect(await stmtValue(page, "필요경비")).toBe(150_000);
    await expect(stmtRow(page, "필요경비")).toContainText("× 0.3%");
  });

  test("S9: 구 이력(율 echo 부재) — 카드는 종전 「× 3%」를 유지한다", async ({ page }) => {
    test.setTimeout(150_000);
    // 서버 응답에서 echo(lumpDeductionRate)만 지운다 — echo가 도입되기 전에 저장된 결과와 같은 모양이다.
    await page.route("**/api/calc/transfer", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const res = await route.fetch();
      const json = await res.json();
      const sd = json?.data?.result?.splitDetail;
      if (sd) {
        delete sd.land.lumpDeductionRate;
        delete sd.building.lumpDeductionRate;
      }
      await route.fulfill({ response: res, json });
    });
    await seedWizard(
      page,
      singleSeed([housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" })], { isUnregistered: true }),
    );
    await calculate(page);
    await expect(card(page, "split-card-lump-base-building")).toContainText("취득시 기준시가 50,000,000 × 3%");
  });

  test("S10: 전액 비과세 split — 파트 값이 비과세와 모순 없이 네 화면에 같다 (엔진 보고 #1)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      singleSeed([housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" })], {
        householdHousingCount: "1",
        isOneHousehold: true,
      }),
    );
    await calculate(page);
    await expect(page.getByText("전액 비과세").first()).toBeVisible();
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    const gainRow = await formRow(page, "전체 양도차익");
    const exemptRow = await formRow(page, "비과세 양도차익");
    const taxableRow = await formRow(page, "과세대상 양도차익");
    expect(num(acqRow[1])).toBe(312_500_000); // 종전: 314,000,000(개산공제가 취득가액에 섞임)
    expect(num(expRow[1])).toBe(1_500_000); // 종전: 「-」
    expect(900_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
    expect(num(exemptRow[1])).toBe(586_000_000);
    expect(num(taxableRow[1])).toBe(0);
    expect(await stmtValue(page, "취득가액")).toBe(312_500_000);
    expect(await stmtValue(page, "필요경비")).toBe(1_500_000);
    await expect(card(page, "split-card-acq-land")).toContainText("200,000,000");
    // 납부세액 0 — 비과세 판정과 모순되는 세액이 없다
    expect(await stmtValue(page, "결정세액")).toBe(0);
  });

});

// ───────────────────────────────────────────────────────────────────────────
// M — 컴패니언 · 다건
// ───────────────────────────────────────────────────────────────────────────
test.describe("컴패니언 · 다건 — 분리 자산의 취득가액·필요경비 echo가 화면 전부에 따라온다", () => {
  test("M1: 컴패니언(주 자산 주택 split + 독립 나대지) — 합산 신고서·명세서 합계·자산별·소제목", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      singleSeed(
        [
          housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000", standardPriceAtTransfer: "400000000" }),
          landStandalone(2),
        ],
        { householdHousingCount: "2" },
      ),
    );
    await calculate(page);

    // 합산 신고서 — 주 자산 열: 안분 양도가액 960,000,000 · 취득(토지 200,000,000 + 건물 환산 120,000,000) · 필요경비 1,500,000
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    expect(num(acqRow[2])).toBe(320_000_000);
    expect(num(acqRow[3])).toBe(100_000_000);
    expect(num(expRow[2])).toBe(1_500_000);
    expect(num(acqRow[1])).toBe(420_000_000);
    expect(num(expRow[1])).toBe(1_500_000);
    const gainRow = await formRow(page, "전체 양도차익");
    const priceRow = await formRow(page, "양도가액");
    expect(num(priceRow[1]) - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));

    // 명세서 합계 · 집계 소제목(G-4) · 자산별 행
    expect(await stmtValue(page, "취득가액")).toBe(420_000_000);
    expect(await stmtValue(page, "필요경비")).toBe(1_500_000);
    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("산정방식: 실거래가·환산취득가");
    expect(acqText).not.toContain("자산별 실제 거래가액 합계");
    expect(acqText).toContain("토지(실거래가) 200,000,000 + 건물(환산취득가) 120,000,000"); // 자산별 행(펼침 전 DOM)
    await expect(stmtRow(page, "필요경비")).toContainText("건물 개산공제 1,500,000");
    await expect(card(page, "split-card-acq-mode-building")).toHaveText("환산취득가");
  });

  test("M2: 다건 — 합산 신고서 건1 열 · 합산 요약 카드 · 건별 상세 신고서 · 명세서가 같은 값(취득 312,500,000 · 필요경비 1,500,000)", async ({ page }) => {
    test.setTimeout(180_000);
    await runMulti(page, "e2e-split-acq-m2", "분리 취득 다건 (E2E)", multiProps((a) => multiForm(a)));

    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([412_500_000, 312_500_000, 100_000_000]);
    expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([1_500_000, 1_500_000, 0]);

    // 합산 요약 카드 — 종전: 전체 취득가액 −100,000,000 · 전체 필요경비 −314,000,000
    const summary = page.locator('[data-print-id="summary"]').first();
    await expect(summary).toContainText("-412,500,000");
    await expect(summary).toContainText("-1,500,000");
    await expect(summary).not.toContainText("-314,000,000");

    // 명세서 합계 · 소제목
    expect(await stmtValue(page, "취득가액")).toBe(412_500_000);
    expect(await stmtValue(page, "필요경비")).toBe(1_500_000);
    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("산정방식: 실거래가·환산취득가");
    expect(acqText).toContain("토지(실거래가) 200,000,000 + 건물(환산취득가) 112,500,000");

    // 건별 상세(아코디언) — 건1 신고서(단일 열)와 카드
    await page.locator('[data-print-id="per-property"]').getByText("펼치기").first().click();
    const per = page.locator('[data-print-id="per-property"]').first();
    await expect(per).toContainText("토지/건물 분리 양도차익");
    const text = (await per.innerText()).replace(/\s+/g, " ");
    expect(text).toMatch(/취득가액 312,500,000 필요경비 1,500,000/);
    await expect(per).not.toContainText("취득가액 - 필요경비 314,000,000");
  });

  test("M3: 다건 — 전액 비과세 split(건1)·평범한 환산 토지(건2): 비과세 건도 취득·필요경비 정합, 집계 소제목은 환산 혼합", async ({ page }) => {
    test.setTimeout(180_000);
    const props = [
      {
        propertyId: "np1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: multiForm(housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" }), { isOneHousehold: true }),
      },
      {
        propertyId: "np2",
        propertyLabel: "건2",
        completionPercent: 100,
        form: multiForm(
          landStandalone(1, {
            acquisitionPrice: "",
            fixedAcquisitionPrice: "",
            useEstimatedAcquisition: true,
            standardPriceAtAcq: "100000000",
            standardPriceAtTransfer: "200000000",
            actualSalePrice: "500000000",
          }),
          { transferDate: "2026-03-01", contractTotalPrice: "500000000", householdHousingCount: "1" },
        ),
      },
    ];
    await runMulti(page, "e2e-split-acq-m3", "분리 비과세 + 환산 토지 다건 (E2E)", props);

    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    expect(num(acqRow[2])).toBe(312_500_000); // 종전 0
    expect(num(expRow[2])).toBe(1_500_000); // 종전 314,000,000
    const exemptRow = await formRow(page, "비과세 양도차익");
    expect(num(exemptRow[2])).toBe(586_000_000);

    const acqText = await stmtText(page, "취득가액");
    // 건1(실가·환산) + 건2(환산) → 환산이 섞인 집계 — 종전은 「자산별 실제 거래가액 합계」
    expect(acqText).toContain("산정방식: 실거래가·환산취득가");
    expect(acqText).not.toContain("자산별 실제 거래가액 합계");
  });

});

test.describe("다건 — 평범한 자산만으로도 집계 소제목이 거짓말을 하지 않는다 (G-4, 분리 자산 없음)", () => {
  test("M4: 환산 토지(건1) + 실가 토지(건2) — 혼합 소제목(종전: 「자산별 실제 거래가액 합계」)", async ({ page }) => {
    test.setTimeout(180_000);
    const plainForm = (asset: Over, date: string, price: string) => ({
      ...createDefaultTransferFormData(),
      assets: [asset],
      transferDate: date,
      contractTotalPrice: price,
      householdHousingCount: "1",
      isOneHousehold: false,
    });
    const props = [
      {
        propertyId: "np1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: plainForm(
          landStandalone(1, { fixedAcquisitionPrice: "", useEstimatedAcquisition: true, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000", actualSalePrice: "500000000" }),
          "2026-02-16",
          "500000000",
        ),
      },
      { propertyId: "np2", propertyLabel: "건2", completionPercent: 100, form: plainForm(landStandalone(1, { actualSalePrice: "300000000" }), "2026-03-01", "300000000") },
    ];
    await page.goto("/history");
    await putCalculationRecord(page, {
      id: "e2e-split-acq-m4",
      userId: "local-user",
      taxType: "transfer",
      title: "환산 토지 + 실가 토지 다건 (E2E)",
      inputData: { __multiTransfer: true, taxYear: 2026, properties: props, activePropertyIndex: 0, activeStep: "settings", annualBasicDeductionUsed: "0", basicDeductionAllocation: "MAX_BENEFIT" },
      resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "np1" }, { propertyId: "np2" }] },
      taxLawVersion: "2026",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    });
    await page.goto("/calc/transfer-tax/multi");
    await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText("환산 토지 + 실가 토지 다건 (E2E)"));
    await page.getByTestId("load-record-e2e-split-acq-m4").click();
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "세액 계산" }).click();
    expect((await respP).status()).toBe(200);
    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 30_000 });

    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("산정방식: 실거래가·환산취득가");
    expect(acqText).not.toContain("자산별 실제 거래가액 합계");
    expect(await stmtText(page, "필요경비")).toContain("환산취득가·감정가액·매매사례가액 파트는 개산공제");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// G — 일반건물
// ───────────────────────────────────────────────────────────────────────────
function generalBuilding(over: Over = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    regionCode: "1168010100",
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1999-05-24",
    acquisitionDate: "2015-03-01",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  };
}
const gbSeed = (over: Over) =>
  singleSeed([generalBuilding(over)], { contractTotalPrice: "2000000000", householdHousingCount: "1" });

test.describe("일반건물 — 실가 파트 거짓 등식 제거 · 일괄 실가 안분 분모", () => {
  test("G1: 토지 실가 + 건물 환산 — 실가 토지는 입력값 그대로, 소제목은 산정방식 혼합", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, gbSeed({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "300000000" }));
    await calculate(page);
    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("산정방식: 실거래가·환산취득가");
    expect(acqText).not.toContain("자산별 실제 거래가액 합계");
    expect(acqText).toContain("자산별 취득가액 = 300,000,000 (실거래가 — 소득세법 §97①1호 가목)");
    // 종전 거짓 등식 「양도가액 × 취득시 기준시가 ÷ 양도시 기준시가 = 300,000,000」(좌변 505,748,404)
    expect(acqText).not.toContain("1,956,162,578 × 238,000,000");
    // 필요경비 소제목 — 「양도비 합계」가 아니라 파트별(개산공제 포함)
    const expText = await stmtText(page, "필요경비");
    expect(expText).toContain("개산공제");
    expect(expText).not.toContain("자산별 양도비 합계 (중개수수료");
  });

  test("G2: 같은 취득일 일괄 실가 700,000,000 — 안분 산식 분모가 취득시 기준시가(값 691,818,892을 산식이 만든다)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, gbSeed({ hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "", fixedAcquisitionPrice: "700000000" }));
    await calculate(page);
    const acqText = await stmtText(page, "취득가액");
    // FormulaText가 「숫자 / 숫자」를 분수로 치환하므로 분자·분모를 각각 확인한다.
    expect(acqText).toContain("700,000,000 ×");
    expect(acqText).toContain("238,000,000");
    expect(acqText).toContain("(238,000,000+2,814,470)");
    expect(acqText).toContain("= 691,818,892");
    expect(acqText).not.toContain("(920,550,000+20,629,440) = 691,818,892"); // 종전 양도시 분모 — 값을 못 만든다
    expect(acqText).toContain("700,000,000 - 토지 691,818,892 = 8,181,108 (잔액 보정)");
  });

  test("G3: 실가/실가 + 숨은 자산 단위 총액 999,000,000 — 산식에 stale 총액·「0 ×」·「잔액 보정」이 없다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      gbSeed({ landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000", fixedAcquisitionPrice: "999000000" }),
    );
    await calculate(page);
    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("자산별 취득가액 = 300,000,000 (실거래가");
    expect(acqText).toContain("자산별 취득가액 = 400,000,000 (실거래가");
    expect(acqText).not.toContain("999,000,000");
    expect(acqText).not.toContain("0 ×");
    expect(acqText).not.toContain("잔액 보정");
    expect(await stmtValue(page, "취득가액")).toBe(700_000_000);
  });
});
