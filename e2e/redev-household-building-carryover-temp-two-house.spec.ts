/**
 * 토지 출자 원조합원 + 세대원 건물 출자 통산(#12) × §155① 종전주택 취득일 = 세대원 건물 취득일 — 브라우저 경로
 *
 * 계획서 `docs/00-pm/household-building-carryover-temp-two-house.plan.md` §7 · Q-B1 (b) 사용자 결정(2026-10-26). 엔진·④ 주장은 anchor가
 * 고정한다(`__tests__/calc/redev-household-building-carryover-temp-two-house.anchor.test.ts`). 여기서만 보이는 것: 명부 행의 「취득 경위」
 * 질문이 건물 취득일 기준으로 열리는가 · 화면 입력이 그대로 계산 본문에 실려 결론이 나는가 · 결과 화면에 확인 필요 고지가 보이는가.
 *
 * 시료: 토지 2005-01-01 · 세대원 건물 2010-01-01 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 경남(조정대상지역 지정 이력 없음).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const NON_REGULATED = "4682025021";
const COMPLETION = "2021-02-15";

const CARRY_APT = {
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2005-01-01",
  addressJibun: "경상남도 고성군 테스트리 1",
  regionCode: NON_REGULATED,
  actualSalePrice: "1000000000",
  fixedAcquisitionPrice: "100000000",
  redevSubject: "apt",
  redevApprovalDate: "2019-03-15",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevIsSuccessorMember: "no",
  redevOriginalAssetType: "land",
  redevCompletionDate: COMPLETION,
  redevActualAcquisitionPrice: "100000000",
  redevRightsValue: "900000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevHouseholdBuildingCarryover: "yes",
  redevHouseholdBuildingAcquisitionDate: "2010-01-01",
  redevHouseholdBuildingResidenceMonths: "0",
};

async function seed(page: Page, otherAcquisition: string, transferDate: string, over: Record<string, string> = {}) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("n", otherAcquisition, { regionCode: NON_REGULATED })],
    assetOver: { ...CARRY_APT, ...over },
    formOver: { transferDate, contractTotalPrice: "1000000000" },
  });
}

async function originQuestionVisible(page: Page) {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const visible = await dialog.getByTestId("house-row-origin-intro").isVisible();
  await dialog.getByRole("button", { name: "완료" }).click();
  return visible;
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return {
    request: resp.request().postDataJSON() as {
      acquisitionDate: string;
      temporaryTwoHouse?: { previousAcquisitionDate: string; newAcquisitionDate: string };
    },
    body: (await resp.json()) as { data: { result: { isExempt: boolean; isPartialExempt?: boolean; totalTax: number } } },
  };
}

test("[HBE-1] 사용승인 전 취득 주택 — 건물 취득일 뒤라 취득 경위를 묻고, 종전주택 취득일 = 건물 취득일로 비과세 · 고지", async ({ page }) => {
  await seed(page, "2020-06-01", "2023-04-01");
  expect(await originQuestionVisible(page)).toBe(true);
  const { request, body } = await calculate(page);
  expect(request.acquisitionDate).toBe("2005-01-01");
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2010-01-01", newAcquisitionDate: "2020-06-01" });
  expect(body.data.result.isExempt).toBe(true);
  await expect(page.getByText(/종전주택 취득일도 토지 취득일이 아니라 세대원 건물 취득일로 보았습니다/).first()).toBeVisible();
});

test("[HBE-2] 건물 취득 9개월 뒤 다른 주택 — 1년 요건 불충족 · 과세", async ({ page }) => {
  await seed(page, "2019-10-01", "2022-06-01", { redevHouseholdBuildingAcquisitionDate: "2019-01-01" });
  const { request, body } = await calculate(page);
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2019-01-01", newAcquisitionDate: "2019-10-01" });
  expect(body.data.result.isExempt).toBe(false);
  expect(body.data.result.totalTax).toBe(218_625_000);
});

test("[HBE-3] 건물을 먼저(2003)·토지를 나중(2018) 취득 — 일시적 2주택 고가주택 부분 과세", async ({ page }) => {
  await seed(page, "2019-01-01", "2021-12-01", { acquisitionDate: "2018-06-01", redevHouseholdBuildingAcquisitionDate: "2003-01-01" });
  const { request, body } = await calculate(page);
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2003-01-01", newAcquisitionDate: "2019-01-01" });
  expect(body.data.result.isPartialExempt).toBe(true);
  expect(body.data.result.totalTax).toBe(13_450_800);
});
