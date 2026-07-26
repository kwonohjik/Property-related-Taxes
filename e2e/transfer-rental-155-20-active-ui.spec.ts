/**
 * §155⑳ 임대주택 요건 능동형 UI — 조건부 노출 + 판정기준 배지 E2E.
 *
 * 등록일 2필드(세무서·지자체) + 임대구분/취득방법에 따라 소재지역·규모·조정 필드가
 * 능동적으로 노출/숨김되고, 판정 기준 배지(도출 목·의무기간·기준시가 상한)가 실시간 파생됨을 검증.
 * 계획서: docs/02-design/features/rental-housing-155-20-active-ui.plan.md
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

function rentalUnit(over: Record<string, unknown> = {}) {
  return {
    businessRegistrationDate: "2020-08-18",
    rentalRegistrationDate: "2020-08-18",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    isExcluded918Rule: false,
    standardPriceAtRentalStart: "",
    rentalLandArea: "",
    rentalTotalFloorArea: "",
    hasMinimum2Units: false,
    rentalMonths: "",
    rentalAutoTermination: false,
    requirementsConfirmed: false,
    ...over,
  };
}

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            residencePeriodMonthsAsset: "30",
            rentalHousingException: {
              applyException: true,
              scenario: "A",
              rentalUnits: [rentalUnit()],
            },
          },
        ],
        transferDate: "2027-01-01",
        isOneHousehold: true,
        householdHousingCount: "1",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoRentalSection(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 5, 0);
}

test.describe("§155⑳ 임대주택 능동형 UI", () => {
  test("등록일 2필드 + 판정 배지(마목 10년) + 조건부 노출 전환", async ({ page }) => {
    await gotoRentalSection(page);

    // 등록일 2필드 노출
    await expect(page.getByText("세무서 사업자등록일", { exact: false })).toBeVisible();
    await expect(page.getByText("지자체 임대사업자등록신청일", { exact: false })).toBeVisible();

    // 판정 기준 배지 — long_general + 2020.8.18 등록 → 마목 · 의무 10년 · 6억
    const badge = page.getByTestId("rental-verdict-badge-0");
    await expect(badge).toContainText("마목");
    await expect(badge).toContainText("10년");
    await expect(badge).toContainText("6억");

    // 매입 장기(마목) → 소재지역 노출, 규모 숨김, 918 토글 노출(마목 hard)
    await expect(page.locator('input[name="rental-region-0"]').first()).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toHaveCount(0);
    await expect(page.getByText("2018.9.14 이후 조정대상지역에 신규취득한 주택입니다.")).toBeVisible();

    // 취득방법 → 건설 : 바목, 규모 필드 노출, 소재지역 숨김
    // (등록기준일 2020-08-18 < 2025.2.28 → 바목 cap 6억, F5)
    await page.locator('input[name="rental-acq-type-0"][value="construction"]').check();
    await expect(badge).toContainText("바목");
    await expect(badge).toContainText("6억");
    await expect(page.getByText("건설임대 규모요건")).toBeVisible();
    await expect(page.getByText("대지면적", { exact: false })).toBeVisible();
    await expect(page.locator('input[name="rental-region-0"]')).toHaveCount(0);

    // 매입 복귀 + 등록일 2025-06-04(단기 6년 신설일)로 변경 → 단기 6년 활성화 → 아목
    await page.locator('input[name="rental-acq-type-0"][value="purchase"]').check();
    await fillDateAndVerify(page, { year: "2025", month: "06", day: "04" }, {
      scope: page.getByTestId("rental-biz-reg-date-0"),
    });
    await fillDateAndVerify(page, { year: "2025", month: "06", day: "04" }, {
      scope: page.getByTestId("rental-reg-date-0"),
    });
    await page.locator('input[name="rental-category-0"][value="short_6y"]').check();
    await expect(badge).toContainText("아목");
    await expect(badge).toContainText("6년");
    await expect(badge).toContainText("4억");
    await expect(page.getByText("2018.9.14 이후 조정대상지역에 신규취득한 주택입니다.")).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toHaveCount(0);
  });

  test("나목(기존사업자) 선택 → 취득당시 기준시가 스왑 + 국민주택 토글 + 소재지역 숨김", async ({ page }) => {
    await gotoRentalSection(page);

    // 나목(기존사업자)은 세무서 등록 ≤2003.10.29만 활성 → biz 등록일을 2003-01-01로 변경
    await fillDateAndVerify(page, { year: "2003", month: "01", day: "01" }, {
      scope: page.getByTestId("rental-biz-reg-date-0"),
    });
    // 임대구분 → 기존사업자(나목)
    await page.locator('input[name="rental-category-0"][value="existing_business"]').check();

    const badge = page.getByTestId("rental-verdict-badge-0");
    await expect(badge).toContainText("나목");

    // 나목: 취득당시 기준시가 노출 · 임대개시일 기준시가 숨김
    await expect(page.getByText("취득 당시 기준시가", { exact: false })).toBeVisible();
    await expect(page.getByText("임대개시일 기준시가")).toHaveCount(0);

    // 국민주택규모 토글 노출 + 소재지역/취득방법 숨김(매입 전용)
    await expect(page.getByText("국민주택규모", { exact: false }).first()).toBeVisible();
    await expect(page.locator('input[name="rental-region-0"]')).toHaveCount(0);
    await expect(page.getByText("나목(기존사업자)은 매입임대 전용입니다.")).toBeVisible();
  });

  test("라목(미분양) 선택 → 계약일·5호·취득당시 기준시가·소재지역 노출 + 말소 특례 토글", async ({ page }) => {
    await gotoRentalSection(page);

    await page.locator('input[name="rental-category-0"][value="unsold_08_09"]').check();

    const badge = page.getByTestId("rental-verdict-badge-0");
    await expect(badge).toContainText("라목");

    // 라목: 최초 분양계약일 + 5호 + 취득당시 기준시가 + 소재지역(비수도권 요건) 노출
    await expect(page.getByTestId("rental-first-sale-date-0")).toBeVisible();
    await expect(page.getByText("5호 이상 임대", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("취득 당시 기준시가", { exact: false })).toBeVisible();
    await expect(page.getByText("임대개시일 기준시가")).toHaveCount(0);
    await expect(page.locator('input[name="rental-region-0"]').first()).toBeVisible();
    await expect(page.getByText("라목(미분양)은 매입임대 전용입니다.")).toBeVisible();

    // §155⑳㉓ 말소 특례 토글(가·다·라·마목) 노출
    await expect(page.getByText("자진·자동 말소된 임대주택", { exact: false })).toBeVisible();
  });

  test("두 등록일 중 하나 미입력 → 사업자등록등 미완비 경고", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
      ...seedForm(),
      state: {
        ...seedForm().state,
        formData: {
          ...seedForm().state.formData,
          assets: [
            {
              ...seedForm().state.formData.assets[0],
              rentalHousingException: {
                applyException: true,
                scenario: "A",
                rentalUnits: [rentalUnit({ businessRegistrationDate: "" })],
              },
            },
          ],
        },
      },
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 5, 0);

    await expect(page.getByTestId("rental-verdict-badge-0")).toContainText("사업자등록등");
  });

  test("등록시기별 임대 구분 disabled + 사유 캡션 (2020 등록 → 단기6년·기존사업자 배제)", async ({ page }) => {
    await gotoRentalSection(page); // 기본 seed: 2020-08-18 등록·long_general 선택

    // 2020 등록: 단기6년(아·자, 2025.6.4 신설)·기존사업자(나, 2003.10.29 이전) 배제 → disabled
    await expect(page.getByTestId("rental-category-short_6y-0")).toBeDisabled();
    await expect(page.getByTestId("rental-category-existing_business-0")).toBeDisabled();
    // 근거 없는 3유형은 활성
    await expect(page.getByTestId("rental-category-long_general-0")).toBeEnabled();
    await expect(page.getByTestId("rental-category-unsold_08_09-0")).toBeEnabled();
    await expect(page.getByTestId("rental-category-pre_2018-0")).toBeEnabled();
    // 사유 캡션 2줄
    await expect(page.getByText("단기 6년(아·자목)은 2025.6.4 이후", { exact: false })).toBeVisible();
    await expect(page.getByText("기존사업자(나목)는 세무서 사업자등록 2003.10.29 이전", { exact: false })).toBeVisible();
  });

  test("mount-limbo 가드 — 이력 로드로 무효 선택(short_6y+2020) mount 시 회색 아님·checked 유지", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
      ...seedForm(),
      state: {
        ...seedForm().state,
        formData: {
          ...seedForm().state.formData,
          assets: [
            {
              ...seedForm().state.formData.assets[0],
              rentalHousingException: {
                applyException: true,
                scenario: "A",
                rentalUnits: [rentalUnit({ rentalCategory: "short_6y" })], // 2020 등록 + short_6y(무효 조합)
              },
            },
          ],
        },
      },
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 5, 0);

    // 선택-제외 가드: 현재 선택(short_6y)은 무효여도 disabled 아님(limbo 방지) + checked 유지
    const short6y = page.getByTestId("rental-category-short_6y-0");
    await expect(short6y).toBeEnabled();
    await expect(short6y).toBeChecked();
    // 사유 캡션은 여전히 노출(선택이 무효임을 안내)
    await expect(page.getByText("단기 6년(아·자목)은 2025.6.4 이후", { exact: false })).toBeVisible();
    // 미선택인 existing_business는 disabled
    await expect(page.getByTestId("rental-category-existing_business-0")).toBeDisabled();
  });

  test("auto-reset — 유효 short_6y 선택 후 등록일을 2020으로 낮추면 long_general로 복원", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
      ...seedForm(),
      state: {
        ...seedForm().state,
        formData: {
          ...seedForm().state.formData,
          assets: [
            {
              ...seedForm().state.formData.assets[0],
              rentalHousingException: {
                applyException: true,
                scenario: "A",
                rentalUnits: [
                  rentalUnit({
                    rentalCategory: "short_6y",
                    businessRegistrationDate: "2025-06-04",
                    rentalRegistrationDate: "2025-06-04",
                  }),
                ],
              },
            },
          ],
        },
      },
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 5, 0);

    // 초기: 유효 short_6y 선택 → 아목
    await expect(page.getByTestId("rental-category-short_6y-0")).toBeChecked();
    await expect(page.getByTestId("rental-verdict-badge-0")).toContainText("아목");

    // 두 등록일을 2020-05-01로 낮춤 → 등록기준일 < 2025.6.4 → short_6y 무효 → auto-reset
    await fillDateAndVerify(page, { year: "2020", month: "05", day: "01" }, {
      scope: page.getByTestId("rental-biz-reg-date-0"),
    });
    await fillDateAndVerify(page, { year: "2020", month: "05", day: "01" }, {
      scope: page.getByTestId("rental-reg-date-0"),
    });

    // 복원: long_general로 전환 → 아목 아님(2020-05-01 매입 장기 → 가목)
    await expect(page.getByTestId("rental-category-long_general-0")).toBeChecked();
    await expect(page.getByTestId("rental-verdict-badge-0")).not.toContainText("아목");
  });
});
