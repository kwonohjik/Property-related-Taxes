/**
 * §155⑳ 장기임대 거주주택 특례 — **계산기에 남은 것** (P6-c-2).
 *
 * ## 무엇이 남았고 왜인가
 *
 * `RentalHousingExceptionSection`이 `mode="calc"`로 바뀌면서 계산기는 판정 사실
 * (토글·시나리오·① 임대주택 정보 9유형 18필드)을 더 이상 받지 않는다. 그 10건은
 * `one-house-judgment-rental-155-20-active-ui.spec.ts`로 이관됐다.
 *
 * | 블록 | 왜 계산기에 남는가 |
 * |---|---|
 * | ② §161① 안분 | **세액 산식**. 실측: 직전양도 기준시가 4.5억→4억 하나로 과세 양도차익 172,605,000 → 115,070,000 |
 * | ③ 거주기간 편집기 | 🔴 **유일 입력 경로** — 아래 |
 *
 * ## 🔴 ③를 감출 수 없었던 이유
 *
 * ⑧(`transfer-tax-validate-rental-exception.ts:190`)은 `deriveResidencePeriodMonths(asset, …)`
 * 를 **자산별로** 불러 24개월 미만이면 계산을 차단한다. 대체 경로인 Step4
 * `ResidencePeriodSection`은 `form.isOneHousehold && isOneHouseExemptionAsset(…)` 게이트에
 * `i === 0`만 패치한다(`Step4.tsx:498`) — 컴패니언 주택 자산이나 `isOneHousehold` OFF에서는
 * 채울 칸이 사라진다.
 *
 * ## 🔑 ②는 P6-c-2 전까지 E2E 안전망이 **0건**이었다
 *
 * `phrp-stdprice-*`를 단언하는 spec이 저장소에 없었다. 계산기에 **남기는** 블록이야말로
 * 이관 과정에서 조용히 사라지기 쉬우므로 여기서 처음 고정한다.
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

/**
 * 계산기 자산카드 ⑤ 기타 섹션을 연다.
 *
 * 🔑 `rhOver`로 **특례 선언 자체**를 갈아 끼운다 — 계산기에는 토글이 없으므로 선언 상태는
 *    시드(=판정 메뉴에서 넘어온 값)로만 만들 수 있다. 그것이 이 모드의 계약이다.
 */
async function gotoCalcRentalSection(page: Page, rhOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [
            {
              ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
              assetKind: "housing",
              acquisitionCause: "purchase",
              acquisitionDate: "2018-01-01",
              residencePeriodMonthsAsset: "30",
              rentalHousingException: {
                applyException: true,
                scenario: "A",
                rentalUnits: [rentalUnit()],
                ...rhOver,
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
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 5, 0);
}

test.describe("§155⑳ 계산기 잔류분", () => {
  /**
   * 🔴 이관의 **본체**. 부정형이므로 짝이 필요하다 —
   *    `one-house-judgment-rental-155-20-active-ui.spec.ts`의 10건이 판정 메뉴에 있음을 말한다.
   */
  test("[RC2-1] 계산기에 ① 임대주택 정보·시나리오 라디오·토글이 없다", async ({ page }) => {
    await gotoCalcRentalSection(page);

    await expect(page.getByTestId("rental-biz-reg-date-0")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ 임대주택 추가" })).toHaveCount(0);
    await expect(page.locator('input[name^="rental-scenario-"]')).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: /장기임대주택 보유자 거주주택 비과세 특례 적용/ }),
    ).toHaveCount(0);
  });

  /** 위젯만 없앴고 값은 살아서 세액을 바꾼다 — 화면이 그 상태를 말해야 한다(OH-20). */
  test("[RC2-2] 넘겨받은 선언을 읽기 전용으로 말해 준다", async ({ page }) => {
    await gotoCalcRentalSection(page, { scenario: "B" });

    const facts = page.getByTestId("imported-rental-housing-facts");
    await expect(facts).toBeVisible();
    await expect(facts).toContainText("임대주택을 거주주택으로 전환 후 양도");
    await expect(facts).toContainText("임대주택 1호");
  });

  test("[RC2-3] 선언이 없으면 판정 메뉴 안내가 대신 뜬다", async ({ page }) => {
    await gotoCalcRentalSection(page, { applyException: false });

    await expect(page.getByTestId("imported-rental-housing-facts")).toHaveCount(0);
    await expect(page.getByTestId("rental-housing-handoff-notice")).toBeVisible();
    await expect(page.getByTestId("rental-housing-handoff-link")).toHaveAttribute(
      "href",
      "/calc/one-house-exemption",
    );
  });

  /**
   * 🔴 **② §161① 안분 — 계산기에 남는 세액 축.** 판정 메뉴(`mode="facts"`)는 이 블록을
   *    안내로 대체한다(`one-house-judgment-rental-housing.spec.ts` OHR-2가 그쪽을 고정).
   */
  test("[RC2-4] B 시나리오면 §161① 안분 3-시점 기준시가 입력이 열린다", async ({ page }) => {
    await gotoCalcRentalSection(page, { scenario: "B" });

    // 판정 메뉴 쪽 「나중에 받습니다」 안내가 여기서는 뜨지 않는다
    await expect(page.getByTestId("rental-allocation-deferred-notice")).toHaveCount(0);

    await expect(page.getByText("직전거주주택 + 3-시점 기준시가")).toBeVisible();
    await expect(page.getByTestId("phrp-stdprice-acq-price-input")).toBeVisible();
    await expect(page.getByTestId("phrp-stdprice-prior-price-input")).toBeVisible();
    await expect(page.getByTestId("phrp-stdprice-transfer-price-input")).toBeVisible();
  });

  /** 안분 비율이 실제로 파생되는지 — 「칸이 있다」보다 강한 단언(대리 지표 회피). */
  test("[RC2-5] 3-시점을 채우면 §161① 안분 비율이 파생된다 (75.00%)", async ({ page }) => {
    await gotoCalcRentalSection(page, {
      scenario: "B",
      priorResidenceTransferDate: "2022-01-01",
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtPriorTransfer: "450,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
    });

    // (450,000,000 − 300,000,000) ÷ (500,000,000 − 300,000,000) = 75.00%
    await expect(page.getByText("과세 안분 비율 미리보기", { exact: false })).toBeVisible();
    await expect(page.getByText("75.00%", { exact: false })).toBeVisible();
  });

  /**
   * 🔴 **유일 입력 경로.** 컴패니언 주택 자산·`isOneHousehold` OFF에서는 Step4
   *    `ResidencePeriodSection`이 뜨지 않으므로 이 칸이 사라지면 ⑧이 요구하는 24개월을
   *    채울 방법이 없다. 계산기 이관에서 **감추면 안 되는 블록**이다.
   */
  test("[RC2-6] 거주기간 편집기 — 입주·퇴거일 입력 → 총 개월 자동계산(36개월)", async ({ page }) => {
    await gotoCalcRentalSection(page);

    await expect(page.getByTestId("residence-period-editor")).toBeVisible();
    await fillDateAndVerify(page, { year: "2019", month: "01", day: "01" }, {
      scope: page.getByTestId("residence-period-start-0"),
    });
    await fillDateAndVerify(page, { year: "2022", month: "01", day: "01" }, {
      scope: page.getByTestId("residence-period-end-0"),
    });

    await expect(page.getByTestId("residence-period-total")).toContainText("36개월");
    // 거주주택 요건 충족 상태(2년 이상)도 도출값으로 충족 표시
    await expect(page.getByText("현재 36개월", { exact: false })).toBeVisible();
  });
});
