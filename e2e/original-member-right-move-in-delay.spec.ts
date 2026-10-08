/**
 * 기존주택 원조합원 조합원입주권 행 — §155①2호 가목 전입일 · §155⑱ 처분기한 예외 사유 (#2054 후속)
 *
 * 엔진·④⑫⑭·⑧·명부 배선은 anchor(`original-member-right-move-in-delay.anchor.test.tsx`)가 고정한다. 여기서는
 * 판정 메뉴에서 칸이 뜨고 그 입력으로 결론이 바뀌는지, 계산기 ② 1세대1주택 섹션에도 같은 칸이 뜨는지를 본다.
 *
 * 시나리오(0620 구조): 양도 주택 A 2018-01-01 · 기존주택 B 2020-03-01(관리처분으로 입주권) · 둘 다 강남(조정) ·
 * 양도 2021-02-01 — 2019-12-17 체제라 B 취득일부터 1년 안에 양도하고 B로 세대전원이 전입해야 한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const GANGNAM = "1168010100";
const RIGHT = {
  id: "p1",
  type: "redevelopment_right",
  acquisitionDate: "2020-03-01",
  region: "capital",
  memberOrigin: "original_house",
  regionCode: GANGNAM,
};

async function seedJudgment(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2021-02-01",
    contractTotalPrice: "800000000",
    wasRegulatedAtAcquisition: true,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2018-01-01",
        regionCode: GANGNAM,
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "36",
      },
    ],
    houses: [],
    presaleRights: [RIGHT],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as { presaleRights?: Record<string, unknown>[] };
}

test("[OMR-1] 판정 메뉴 — 기존주택 전입일을 넣으면 본문에 실리고 비과세", async ({ page }) => {
  await seedJudgment(page);
  const moveIn = page.getByTestId("original-member-move-in-date-0");
  await moveIn.getByRole("textbox", { name: "연도" }).fill("2020");
  await moveIn.getByRole("textbox", { name: "월" }).fill("9");
  await moveIn.getByRole("textbox", { name: "일" }).fill("1");
  await expect(moveIn.getByRole("textbox", { name: "일" })).toHaveValue("1");
  const body = await judge(page);
  expect(body.presaleRights?.[0]).toMatchObject({ memberOrigin: "original_house", originalMemberMoveInDate: "2020-09-01" });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});

test("[OMR-2] 짝 — 전입일이 없으면 과세 + 확인 필요", async ({ page }) => {
  await seedJudgment(page);
  await expect(page.getByTestId("original-member-disposal-delay-0")).toBeVisible();
  const body = await judge(page);
  expect(body.presaleRights?.[0]).not.toHaveProperty("originalMemberMoveInDate");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/기존주택 전입일을 입력하세요/).first()).toBeVisible();
});

test("[OMR-3] 계산기 ② 1세대1주택 섹션에도 같은 칸이 뜬다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: { acquisitionDate: "2018-01-01", regionCode: GANGNAM },
    formOver: { transferDate: "2021-02-01", presaleRights: [RIGHT], householdNoPresaleRightsConfirmed: false },
  });
  await expect(page.getByTestId("original-member-move-in-date-0")).toBeVisible();
  await expect(page.getByTestId("original-member-disposal-delay-0")).toBeVisible();
});
