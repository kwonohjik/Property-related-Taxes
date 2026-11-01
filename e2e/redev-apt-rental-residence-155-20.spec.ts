/**
 * 재개발 완공APT × §155⑳ 장기임대주택 거주주택 특례 — 브라우저 경로 (계획서 `docs/00-pm/redev-apt-rental-residence-155-20.plan.md` D-1·D-2)
 *
 * 계산기의 §155⑳ 카드는 판정 메뉴에서 넘겨받은 선언을 요약한다(P6-c-2). 판정 메뉴는 양도 자산을 「주택」으로 판정하므로,
 * 완공APT는 「불러오기 → 자산 종류를 재개발 완공APT로 전환」 경로로 선언을 갖게 된다. 종전에는 그 전환이 선언을 지웠고
 * (`housing-flag-reset.ts` — 술어가 완공APT를 뺐다) ④도 싣지 않았다. 여기서는 전환 뒤 상태(완공APT + 선언)를 열어
 * 카드가 선언을 요약하고 계산 본문에 실려 비과세가 나는지 본다. 세액·경로별 단언은 anchor(RR-1~10)가 고정한다.
 *
 * 시료: 원조합원 완공APT · 종전주택 2008-01-01 · 인가 2016-06-01 · 거주 5년 · 2024-06-01 10억 · 장기임대 1호(2015 등록).
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

test("[RRE-1] 완공APT + §155⑳ 선언 — 카드가 선언을 요약하고 계산 본문에 실려 비과세", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: {
      assetKind: "redevelopment_apt",
      acquisitionCause: "purchase",
      acquisitionDate: "2008-01-01",
      addressJibun: "경상남도 고성군 테스트리 1",
      regionCode: "4682025021",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "",
      redevSubject: "apt",
      redevApprovalDate: "2016-06-01",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevOriginalAssetType: "housing",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "100000000",
      redevRightsValue: "900000000",
      redevIsSuccessorMember: "no",
      redevActualAcquisitionPrice: "400000000",
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        priorRentalExemptionHistory: "none",
        rentalUnits: [
          {
            ...makeDefaultRentalUnit(),
            businessRegistrationDate: "2015-01-01",
            rentalRegistrationDate: "2015-01-01",
            standardPriceAtRentalStart: "250,000,000",
            rentalInputMode: "direct",
            rentalMonths: "110",
            requirementsConfirmed: true,
          },
        ],
      },
    },
    formOver: { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000" },
  });
  // 카드는 선언을 요약한다 — 「판정 메뉴로 가세요」 안내가 아니다.
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expandAssetSection(page, 5);
  await expect(page.getByTestId("imported-rental-housing-facts")).toBeVisible();
  await expect(page.getByTestId("rental-housing-handoff-notice")).toHaveCount(0);
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const request = resp.request().postDataJSON() as { rentalHousingException?: { scenario: string } };
  expect(request.rentalHousingException).toMatchObject({ scenario: "A" });
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data.result;
  expect(result.isExempt).toBe(true);
  expect(result.totalTax).toBe(0);
});
