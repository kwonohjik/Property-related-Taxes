/**
 * E2E: 일반건물 취득가액 — 감정가액·매매사례가액 개방 (Phase A2)
 *
 * 설계서: `docs/02-design/features/gb-part-appraisal-salescase.ui.design.md` §10
 * 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §4 A-통합
 *
 * 종전에는 일반건물의 취득가액 산정방식이 실거래가·환산취득가 2종뿐이라 「토지 실가 + 건물 감정가액」을 입력할 수 없었다
 * (「소득세법 시행령」 §176의2③은 매매사례가액 → 감정가액 → 환산취득가액을 순차 적용하고 일반건물만 예외가 아니다).
 *
 *   T1. 토지 실가 + 건물 감정 → request body(`landAcqMode`·`buildingAcqMode`·파트 가액) + 결과 결정세액
 *   T2. 파트 라디오 4종 / 상속 1종 / 이월과세 2종 (원인별 필터)
 *   T3. 감정 선택 → 금액칸 · 개산공제 안내 · 취득시 기준시가 칸(⑧이 요구하는 칸이 화면에 있다)
 *   T4. 증축 + 자산 단위 감정 → 차단 메시지(Q-A3)
 *   T5. G-3 — 분리 OFF 감정 → 분리 ON 전환: 파트 라디오가 감정으로 승격되고 body 최상위 acquisitionMethod=actual
 *   T6. 분리 OFF — 입력이 있으면 확인 Dialog(취소=불변 · 확정=소거)
 *   T7. G-3 — 「건물(토지 제외)」 감정 → 「일반건물」 전환: 감정 승계(분리 OFF) → 분리 ON 승격, 막다른 길 없음
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`general-building-part-appraisal-salescase.a1*.anchor.test.ts`)다. 이 스펙의 금액 단언은
 *    「입력이 엔진까지 도달해 결과 화면에 그 세액이 표시된다」는 배선 확인이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

type Over = Record<string, unknown>;

/** 분리 ON · 토지 실가(3억) + 건물 감정(1.2억) 시드 — 필요한 면적·기준시가·용도지역을 모두 채운 통과 기준선 */
function seedForm(over: Over = {}) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
          assetKind: "general_building",
          acquisitionCause: "purchase",
          gbBuildingAcquisitionCause: "purchase",
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionDate: "1999-05-24",
          acquisitionDate: "2015-03-01",
          landAcqMode: "actual",
          buildingAcqMode: "appraisal",
          landAcquisitionPrice: "300000000",
          buildingAcquisitionPrice: "120000000",
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
        }],
        transferDate: "2026-02-16",
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

async function seed(page: Page, over: Over = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(over));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 가산세 단계로 가서 계산 — request를 잡아 body를 돌려준다. */
async function calculate(page: Page): Promise<Record<string, unknown>> {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  return (await reqP).postDataJSON();
}

const radiosIn = (page: Page, testId: string) => page.getByTestId(testId).getByRole("radio");

test.describe("일반건물 — 감정가액·매매사례가액 (A2)", () => {
  test("T1: 토지 실가 + 건물 감정 — body에 파트 모드·가액이 실리고 결정세액이 표시된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    const body = (await calculate(page)) as { generalBuildingValuation: Record<string, unknown> } & Record<string, unknown>;
    const gb = body.generalBuildingValuation;
    expect(gb.landAcqMode).toBe("actual");
    expect(gb.buildingAcqMode).toBe("appraisal");
    expect(gb.landAcquisitionPrice).toBe(300_000_000);
    expect(gb.buildingAcquisitionPrice).toBe(120_000_000);
    // 개산공제 base = 건물 취득시 기준시가 — 감정 파트도 자기 기준시가를 싣는다(F-4)
    expect(gb.acquisitionBuildingStdPrice).toBe(2_814_470);
    // stale 가드(R-2): 매매사례가액 필드는 그 모드가 아니면 싣지 않는다
    expect(gb).not.toHaveProperty("landSalesCaseValue");
    expect(gb).not.toHaveProperty("buildingSalesCaseValue");
    // E-3: 분리 ON — 최상위 산정방식은 actual 고정(레거시 감정 플래그가 새지 않는다)
    expect(body.acquisitionMethod).toBe("actual");

    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });
    // 결정세액 — 감정 파트의 개산공제(3% × 2,814,470 = 84,434)가 반영된 값(둘 다 실가였다면 다른 값이다)
    await expect(page.getByText("420,315,056").first()).toBeVisible();
  });

  test("T2: 파트 라디오 — 매매 4종 · 상속 1종 · 이월과세 2종", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { landAcqMode: "actual", buildingAcqMode: "actual" });
    await expandAssetSection(page, 3);

    await expect(radiosIn(page, "gb-part-acq-mode-land")).toHaveCount(4);
    await expect(radiosIn(page, "gb-part-acq-mode-building")).toHaveCount(4);
    for (const m of ["actual", "estimated", "appraisal", "salescase"]) {
      await expect(page.getByTestId(`gb-land-acq-mode-${m}`)).toBeAttached();
    }

    const landCause = page.locator('[data-field="acquisitionCause"]').first();
    await landCause.getByText("상속", { exact: true }).click();
    await expect(radiosIn(page, "gb-part-acq-mode-land")).toHaveCount(1);
    await landCause.getByText("이월과세(증여)", { exact: true }).click();
    await expect(radiosIn(page, "gb-part-acq-mode-land")).toHaveCount(2);
    // 이월과세 — 현행 {실거래가, 환산취득가} 유지, 감정·매매사례만 없다
    await expect(page.getByTestId("gb-land-acq-mode-estimated")).toBeAttached();
    await expect(page.getByTestId("gb-land-acq-mode-appraisal")).toHaveCount(0);
    await expect(page.getByTestId("gb-land-acq-mode-salescase")).toHaveCount(0);
  });

  test("T3: 감정 선택 → 금액칸·개산공제 안내·취득시 기준시가 칸이 열린다 (dead-end 방지)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { landAcqMode: "actual", buildingAcqMode: "actual", gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
    await expandAssetSection(page, 3);

    // 두 파트 실가 — 취득시 기준시가 카드·안내 없음 (시점별 런처 숨김 회귀 방지)
    await expect(page.locator('[data-gb-stdprice="acq"]')).toHaveCount(0);
    await expect(page.getByTestId("gb-deduction-only-notice")).toHaveCount(0);

    await page.getByTestId("gb-building-acq-mode-appraisal").click({ force: true });
    await expect(page.getByTestId("gb-building-apr-price")).toBeVisible();
    await expect(page.getByTestId("gb-building-act-price")).toHaveCount(0);
    await expect(page.getByTestId("gb-deduction-only-notice")).toBeVisible();
    await expect(page.locator('[data-gb-stdprice="acq"]').first()).toBeVisible();

    await page.getByTestId("gb-building-acq-mode-salescase").click({ force: true });
    await expect(page.getByTestId("gb-building-sc-value")).toBeVisible();
    await expect(page.getByTestId("gb-building-apr-price")).toHaveCount(0);
  });

  test("T4: 증축 + 자산 단위 감정가액 → 차단 (Q-A3)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, {
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "420000000",
      gbHasExtension: true,
      gbExtensionDate: "2020-05-01",
      gbExtensionAcquisitionCause: "purchase",
      gbExtensionAcquisitionMode: "actual",
      gbTransferExtensionBuildingStdPrice: "5000000",
      gbExtensionActualAcquisitionPrice: "50000000",
    });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(
      page.getByText(/증축분이 있으면 원건물 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다/).first(),
    ).toBeVisible();
    await expect(page.getByText("신고서 양식", { exact: false })).toHaveCount(0);
  });

  test("T5: G-3 — 분리 OFF 감정 → 분리 ON 전환 시 파트 모드로 승격되고 최상위는 actual", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "420000000",
    });
    await expandAssetSection(page, 3);
    // OFF — 자산 단위 라디오에서 감정가액이 선택돼 있다
    await expect(page.locator('input[name^="acqBasisMode"][value="appraisal"]')).toBeChecked();

    await page.getByText("토지·건물 취득일 다름").first().click();
    // ON — 파트 라디오가 감정으로 승격(무선택 막다른 길이 아니다)
    await expect(page.getByTestId("gb-land-acq-mode-appraisal")).toBeChecked();
    await expect(page.getByTestId("gb-building-acq-mode-appraisal")).toBeChecked();
    await expect(page.locator('input[name^="acqBasisMode"]')).toHaveCount(0);

    // 파트 금액은 옮기지 않는다(자동 안분 fallback 금지) — 사용자가 입력한다
    await page.getByTestId("gb-land-apr-price").fill("300000000");
    await page.getByTestId("gb-building-apr-price").fill("120000000");
    const body = (await calculate(page)) as { generalBuildingValuation: Record<string, unknown> } & Record<string, unknown>;
    expect(body.acquisitionMethod).toBe("actual");
    expect(body).not.toHaveProperty("appraisalValue");
    expect(body.generalBuildingValuation.landAcqMode).toBe("appraisal");
    expect(body.generalBuildingValuation.buildingAcqMode).toBe("appraisal");
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });
  });

  test("T6: 분리 OFF — 입력한 파트 값이 있으면 확인 Dialog (취소=불변 · 확정=소거)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    const toggle = () => page.getByRole("switch", { name: /토지·건물 취득일 다름/ });

    await toggle().click();
    await expect(page.getByText("삭제하고 끄기")).toBeVisible();
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByText("삭제하고 끄기")).toHaveCount(0);
    await expect(toggle()).toBeChecked();
    await expect(page.getByTestId("gb-building-apr-price")).toBeVisible(); // 값 불변

    await toggle().click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(toggle()).not.toBeChecked();
    await expect(page.getByTestId("gb-part-acq-mode-land")).toHaveCount(0);

    // 재ON — 복원되지 않는다
    await toggle().click();
    await expect(page.getByTestId("gb-land-act-price")).toHaveValue("");
  });

  test("T7: G-3 — 「건물(토지 제외)」 감정 → 「일반건물」 전환은 감정을 승계하고, 분리 ON에서 파트 모드로 승격된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      assetKind: "building",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "420000000",
    });
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: /일반건물/ }).first().click();
    await expandAssetSection(page, 3);
    // 승계 — 라디오에 감정가액이 선택돼 있고 금액칸이 보인다(종전: 무선택 + 금액칸 숨김 = 막다른 길)
    await expect(page.locator('input[name^="acqBasisMode"][value="appraisal"]')).toBeChecked();
    await expect(page.getByTestId("fixed-acquisition-price")).toHaveValue("420,000,000");
    // 분리 ON — 승격
    await page.getByText("토지·건물 취득일 다름").first().click();
    await expect(page.getByTestId("gb-land-acq-mode-appraisal")).toBeChecked();
    await expect(page.getByTestId("gb-building-acq-mode-appraisal")).toBeChecked();
  });
});
