/**
 * 양도세 계산기 — sessionStorage(`transfer-tax-wizard`)로 폼을 넣고 「보유 상황」 단계로 간다.
 *
 * 라이브 주소검색(Vworld) 없이 명부 행을 만든다(`transfer-house-editor-address.spec.ts`와 같은 방식).
 * 조특법 주택 수 제외 행 ⑥ spec 4개가 공유한다(`transfer-calc-count-exclusion-row-link.plan.md`).
 */
import type { Page } from "@playwright/test";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

export const otherHouse = (id: string, acquisitionDate: string, over: Record<string, unknown> = {}) => ({
  id,
  region: "non_capital",
  acquisitionDate,
  officialPrice: "150000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

export async function gotoTransferHoldingsStep(
  page: Page,
  opts: {
    houses: Record<string, unknown>[];
    assetOver?: Record<string, unknown>;
    formOver?: Record<string, unknown>;
  },
) {
  const seed = {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "강원특별자치도 춘천시 테스트동 1",
            regionCode: "5111010100",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2015-01-01",
            actualSalePrice: "900000000",
            fixedAcquisitionPrice: "300000000",
            ...opts.assetOver,
          },
        ],
        transferDate: "2024-06-01",
        contractTotalPrice: "900000000",
        householdHousingCount: String(1 + opts.houses.length),
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        houses: opts.houses,
        ...opts.formOver,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}
