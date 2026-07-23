/**
 * 다주택 중과 한시배제 경과조치(§167의3①12의2 나·다목) Step4 UI E2E.
 *
 * 2026-05-10 이후 양도분(가목 윈도우 밖)에서 gracePeriod 경과조치 입력이 노출되고,
 * 나목/다목 분기에 따라 입력 필드·기한 미리보기가 달라지는지 검증.
 *
 * 근거: 소득세법 시행령 §167의3①12의2 나·다목 · §167의10①12의2 나·다목 (국세청 해설서 2026-07-24).
 * 계획서: docs/02-design/features/transfer-surcharge-transition-na-da.plan.md.
 * 엔진 판정(M1~M15)·결과 basis echo는 유닛(multi-house-surcharge-transition.test.ts / MHG-03)에서 커버 —
 * 이 스펙은 Step4 위젯의 나/다 분기 노출·기한 미리보기 상호작용에 집중.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 가목 윈도우 밖(2026-05-10 이후) 양도 + 1세대 2주택(보유주택 1건) → gracePeriod 섹션 노출 조건 충족 seed */
function seedForm(transferDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2020-01-01", // 보유 2년 이상
          },
        ],
        transferDate,
        householdHousingCount: "2", // 2주택 (gracePeriod 노출 조건)
        isOneHousehold: true, // 1세대 (gracePeriod 노출 조건)
        isRegulatedArea: true,
        houses: [
          {
            id: "house_other_1",
            region: "capital",
            acquisitionDate: "2019-01-01",
            officialPrice: "800000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
            acquisitionPrice: "700000000",
            exclusiveArea: "84",
            isUnsoldNewHouse: false,
            completionDate: "",
            isSpouseOwned: false,
            isCoInherited: false,
            decedentSameHouseholdAtInheritance: false,
            isRankingDisqualifiedInheritedHouse: false,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, transferDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(transferDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

/** ToggleCard(경과조치 조건 입력) switch — aria-label이 title 전체(probe 실측) */
function graceToggle(page: Page) {
  return page.getByRole("switch", { name: /중과 경과조치 조건 입력/ });
}

test.describe("다주택 중과 경과조치(나·다목) Step4 UI", () => {
  test("가목 윈도우 밖(2026-06-01) → 경과조치 토글 노출, 나목 선택 시 허가 신청일 필드 노출 + 기한 미리보기", async ({
    page,
  }) => {
    await gotoHolding(page, "2026-06-01");

    // 경과조치 토글 ON
    await graceToggle(page).click();

    // 나목(토지거래허가 대상) 선택
    await page.getByTestId("grace-period-basis-na").click();

    // 나목 전용 — 토지거래허가 신청일 라벨 노출
    await expect(page.getByText("토지거래허가 신청일", { exact: false })).toBeVisible();

    // 소재지 자동 판정 미리보기(개월수) 노출
    await expect(page.getByText(/적용 개월수:/)).toBeVisible();
  });

  test("다목(허가 대상 아님) 선택 → 허가 신청일 필드 미노출", async ({ page }) => {
    await gotoHolding(page, "2026-06-01");
    await graceToggle(page).click();

    await page.getByTestId("grace-period-basis-da").click();

    // 다목은 허가 신청일 입력이 없어야 함
    await expect(page.getByText("토지거래허가 신청일", { exact: false })).toHaveCount(0);
    // 매매계약일·계약금 증빙은 노출
    await expect(page.getByText("매매계약일", { exact: false })).toBeVisible();
    await expect(page.getByText("계약금 수령 증빙 확인", { exact: false })).toBeVisible();
  });

  test("가목 윈도우 내(2026-05-01) → ④ 중과 판정 섹션 자체가 한시배제 안내로 대체(경과조치 입력 미도달)", async ({
    page,
  }) => {
    await gotoHolding(page, "2026-05-01");
    // 가목 전면배제 안내 카드 노출 + 경과조치 토글 미노출
    await expect(page.getByTestId("surcharge-suspended-notice")).toBeVisible();
    await expect(page.getByText(/중과 경과조치 조건 입력/)).toHaveCount(0);
  });
});
