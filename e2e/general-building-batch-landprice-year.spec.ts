/**
 * E2E: 일반건물 2시점 건물기준시가 일괄 계산 — 공시지가 연도 2축 (버그 ①·②)
 *
 * 사용자 실측 화면(토지 취득 2008 · 건물 취득 2022 · 양도 2026-02-19):
 *   ① 모달 「취득시 공시지가」 칸에 ① 토지 카드의 **2007년 기준** 값(3,920,000)이 prefill됐다.
 *      그 칸은 건물 취득일(2022) 위치지수용이라 다른 해의 공시지가가 들어간 것이다.
 *   ② 라벨이 "취득시 (2022년)"·"양도시 (2026년)"으로 떴다. 공시지가 기준연도는 5/31 공시
 *      규칙상 각각 2022(6/15 취득 → 당해)·**2025**(2/19 양도 → 전년)다.
 *
 * 수치·분기 anchor는 vitest가 담당한다
 * (`__tests__/calc/gb-batch-points-separate-land-acq-date.anchor.test.ts` ·
 *  `__tests__/components/multipoint-modal-landprice-year.anchor.test.tsx`).
 * 이 스펙은 **실제 화면에서 그렇게 보이는지**만 본다.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 모달 안 입력칸의 현재 값 목록 — 「모달에 그 값이 있는가」를 값 단위로 본다. */
async function dialogInputValues(dialog: Locator): Promise<string[]> {
  return dialog
    .locator("input")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

/** 토지 2008 취득 · 건물 2022 취득 · 건물 환산(취득시 기준시가 섹션 노출) */
function seedForm(landAcquisitionDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            // M-1a 규약 — acquisitionDate = 건물, landAcquisitionDate = 토지
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate,
            acquisitionDate: "2022-06-15",
            landAcqMode: "actual",
            buildingAcqMode: "estimated",
            landAcquisitionPrice: "300000000",
            gbLandArea: "205",
            gbBuildingArea: "180.96",
            gbBuildingFootprintArea: "90.48",
            gbAcqLandPricePerSqm: "3920000",
            gbTransferLandPricePerSqm: "5627000",
            gbTransferBuildingValue: "20629440",
            gbZoneType: "commercial",
            actualSalePrice: "2000000000",
          },
        ],
        transferDate: "2026-02-19",
        filingDate: "2026-04-30",
        contractTotalPrice: "2000000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openBatchModal(page: Page, landAcquisitionDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(landAcquisitionDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
  await page.getByTestId("gb-building-std-batch-open").click();
  await page.getByText("2시점 건물 기준시가 일괄 계산").waitFor();
  // 단언은 **모달 안**으로 좁힌다 — 상위 화면 ① 토지 공시지가 카드가 뒤에 그대로 살아 있어
  // 페이지 전역 셀렉터는 그 값(3,920,000)·라벨까지 잡는다(모달 밖 값을 모달 값으로 오독).
  return page.getByRole("dialog");
}

test.describe("일반건물 2시점 일괄 계산 — 공시지가 기준연도", () => {
  test("B-1: 취득일이 다르면 토지축 공시지가가 넘어오지 않고 조회 칸이 열린다", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await openBatchModal(page, "2008-05-20");

    // 라벨 = 건물 취득일(2022-06-15 → 5/31 이후 → 2022) 기준
    await expect(dialog.getByText("취득시 (2022년) 공시지가")).toBeVisible();
    // 사유 안내 + 값을 구할 경로(조회 버튼)
    await expect(dialog.getByText(/공시지가 기준연도가 달라/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "공시지가 조회" }).first()).toBeVisible();
    // 토지축 값(2007년 기준 3,920,000)은 모달 안에 없다
    expect(await dialogInputValues(dialog)).not.toContain("3,920,000");
  });

  test("B-2: 양도시 라벨은 양도일의 5/31 규칙을 따른다 (2026-02-19 → 2025)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await openBatchModal(page, "2008-05-20");

    await expect(dialog.getByText(/양도시 \(2025년\) 공시지가/).first()).toBeVisible();
    await expect(dialog.getByText(/양도시 \(2026년\) 공시지가/)).toHaveCount(0);
    // 값은 그대로 넘어온다(양도 시점은 토지·건물이 같은 날)
    expect(await dialogInputValues(dialog)).toContain("5,627,000");
  });

  test("B-3: 양성 대조군 — 취득일이 같으면 종전대로 prefill된다", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openBatchModal(page, "2022-06-15");

    expect(await dialogInputValues(dialog)).toContain("3,920,000");
    await expect(dialog.getByText(/취득시 \(2022년\) 공시지가/).first()).toBeVisible();
    await expect(dialog.getByText(/공시지가 기준연도가 달라/)).toHaveCount(0);
  });

  test("B-4: 구조·용도 체계 연도는 고시 연도를 그대로 쓴다(공시지가 축과 분리)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await openBatchModal(page, "2008-05-20");

    await expect(dialog.getByText("취득당시 (구조·용도 — 2022년 체계)")).toBeVisible();
    await expect(dialog.getByText("양도당시 (구조·용도 — 2026년 체계)")).toBeVisible();
  });
});
