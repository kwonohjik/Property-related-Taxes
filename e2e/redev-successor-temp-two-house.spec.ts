/**
 * 승계조합원 완공APT × §155① 종전주택 취득일 = 준공일(사용승인서 교부일) — 브라우저 경로
 *
 * 계획서 `docs/00-pm/land-contributed-apt-temp-two-house.plan.md` §1.4 · Q-1 (c). 엔진·④ 주장은 anchor가 고정한다
 * (`__tests__/calc/redev-successor-temp-two-house.anchor.test.ts`). 여기서만 보이는 것: 명부 행의 「취득 경위」 질문이
 * 준공일 기준으로 열리고 닫히는가 · 화면 입력이 그대로 계산 본문에 실려 결론이 나는가.
 *
 * 시료: 입주권 승계 2019-06-01 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 경남(조정대상지역 지정 이력 없음).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const NON_REGULATED = "4682025021";
const COMPLETION = "2021-02-15";

const SUCCESSOR_APT = {
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2019-06-01",
  addressJibun: "경상남도 고성군 테스트리 1",
  regionCode: NON_REGULATED,
  actualSalePrice: "1000000000",
  fixedAcquisitionPrice: "100000000",
  redevSubject: "apt",
  redevApprovalDate: "2019-03-15",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevIsSuccessorMember: "yes",
  redevCompletionDate: COMPLETION,
  redevSettlementDirection: "pay",
  redevSettlementAmount: "0",
};

async function seed(page: Page, otherAcquisition: string, transferDate: string) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("n", otherAcquisition, { regionCode: NON_REGULATED })],
    assetOver: SUCCESSOR_APT,
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
    request: resp.request().postDataJSON() as { temporaryTwoHouse?: { previousAcquisitionDate: string; newAcquisitionDate: string } },
    body: (await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } },
  };
}

test("[RST-1] 사용승인 전 취득 주택 — 취득 경위를 묻지 않고, 일시적 2주택으로 싣지 않아 과세", async ({ page }) => {
  await seed(page, "2020-09-01", "2023-04-01");
  expect(await originQuestionVisible(page)).toBe(false);
  const { request, body } = await calculate(page);
  expect(request.temporaryTwoHouse).toBeUndefined();
  expect(body.data.result.isExempt).toBe(false);
});

test("[RST-2] 사용승인 후 1년 안 취득 — 종전주택 취득일 = 준공일로 실려 1년 요건 불충족 · 과세", async ({ page }) => {
  await seed(page, "2021-08-01", "2023-04-01");
  expect(await originQuestionVisible(page)).toBe(true);
  const { request, body } = await calculate(page);
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2021-08-01" });
  expect(body.data.result.isExempt).toBe(false);
});

test("[RST-3] 짝 — 사용승인 후 1년 뒤 취득이면 일시적 2주택 비과세", async ({ page }) => {
  await seed(page, "2022-03-01", "2024-06-01");
  const { request, body } = await calculate(page);
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2022-03-01" });
  expect(body.data.result.isExempt).toBe(true);
  expect(body.data.result.totalTax).toBe(0);
});
