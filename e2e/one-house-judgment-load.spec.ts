/**
 * 계산기 「판정 불러오기」 (P5-b-2)
 *
 * 계획서 §5.3 표 2행.
 *
 * ## 이 spec만 관측하는 것
 *
 * 후보 목록·이동 금지·적용 인자는 anchor와 정적 가드가 고정한다
 * (`one-house-judgment-lookup.anchor.test.ts` · `one-house-judgment-load-modal.test.tsx`).
 *
 * 여기서만 보이는 것은 **저장소 → 모달 → store → 화면**이 실제로 이어지는가다. 특히
 * 「불러온 값이 계산기 입력란에 실제로 들어갔는가」는 브라우저 없이는 확인되지 않는다 —
 * P5-a에서 **스토어에는 9억이 들어갔는데 화면에서는 사라진** 결함이 정확히 그 층에서 났다
 * (`withMirroredSalePrice`의 존재 이유).
 */
import { test, expect, type Page } from "@playwright/test";
import { putCalculationRecord } from "./_helpers/history-seed";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const ADDRESS = "서울 강남구 대치동 316";

async function mockAddress(page: Page) {
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: [] }) }),
  );
}

/**
 * 판정 이력 1건 — 저장 형태를 직접 세운다(어댑터 미경유).
 *
 * 🔑 `inputHash`는 **적지 않는다** — `putCalculationRecord`가 실제 저장 경로와 **같은 leaf**로
 *    붙여 준다. 손으로 적으면 staleness 기준선이 테스트에서만 다르게 동작한다.
 */
function judgmentRecord() {
  return {
    id: "ohh-load-1",
    userId: "local-user",
    taxType: "one_house_exemption",
    title: `1세대1주택 판정 — ${ADDRESS} (양도예정 2026-06-01)`,
    inputData: {
      isOneHousehold: true,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ id: "a1", addressRoad: ADDRESS, acquisitionDate: "2019-03-10" }],
      houses: [],
      presaleRights: [],
      winWinRentalSpecial: true,
      winWinRentalContractDate: "2022-05-01",
    },
    resultData: {
      judgment: { isExempt: true, isPartialExempt: false, appliedExceptions: [], pending: [] },
      houseCount: { total: 1, countedForExemption: 1, excluded: [] },
    },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-21T01:00:00.000Z",
  };
}

async function openCalculator(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("계산기 판정 불러오기", () => {
  /**
   * 🔴 **핵심 경로.** P5-a가 만든 `applyOneHouseFactsToTransferForm`은 이 PR 전까지
   *    **소비자가 0건**이었다 — 만들어만 두고 아무도 부르지 않는 함수였다.
   */
  test("[LD-1] 저장된 판정을 골라 계산기 폼에 채운다", async ({ page }) => {
    await mockAddress(page);
    await openCalculator(page);
    await putCalculationRecord(page, judgmentRecord());
    // 시드는 페이지가 뜬 뒤에 들어가므로 모달이 열릴 때 조회된다(모달은 open 시점에 읽는다).

    await page.getByTestId("open-one-house-judgment-load").click();
    const modal = page.getByTestId("one-house-judgment-load-modal");
    await expect(modal).toBeVisible();
    /**
     * 🔑 배지 단언은 **후보 카드 안으로 한정한다.** 두 번 좁혀야 했다(실측):
     *    전역 `getByText("비과세")`는 계산기의 숨은 라벨 「…거주주택 **비과세** 특례 적용」
     *    9개를 잡고, 모달 범위로 좁혀도 안내문의 「1세대1주택 **비과세** 판정 메뉴」와 둘이 된다.
     *    묻고 싶은 것은 처음부터 **이 후보의 배지**였다.
     */
    const card = page.getByTestId("load-judgment-ohh-load-1");
    await expect(card.getByText("비과세")).toBeVisible();

    await card.click();

    // 🔑 적용이 끝난 뒤에 닫히므로, 닫힘이 곧 「폼이 채워졌다」의 신호다.
    await expect(page.getByTestId("one-house-judgment-load-modal")).toHaveCount(0);
    await expect(page.getByTestId("one-house-judgment-loaded")).toBeVisible();

    /**
     * 🔴 **값이 화면까지 도달했는가.** 판정 메뉴는 예상 양도가액을 폼-전역에만 쓰는데
     *    계산기는 `assets[0].actualSalePrice`를 원본으로 본다. 미러가 없으면 여기서
     *    빈칸이 된다(P5-a E2E HO-2가 그렇게 깨졌다).
     */
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("companion-actual-sale-price")).toHaveValue(/900,?000,?000/);
  });

  /** 🔑 판정 이력이 없으면 **판정 메뉴로 보낸다** — 빈 목록을 띄워 두지 않는다. */
  test("[LD-2] 판정 이력이 없으면 판정 메뉴로 안내한다", async ({ page }) => {
    await mockAddress(page);
    await openCalculator(page);

    await page.getByTestId("open-one-house-judgment-load").click();
    await expect(page.getByTestId("one-house-judgment-load-modal")).toBeVisible();
    await expect(page.getByText(/저장된 1세대1주택 판정이 없습니다/)).toBeVisible();
    // 불러온 것이 없으므로 확인 표시도 뜨지 않는다.
    await expect(page.getByTestId("one-house-judgment-loaded")).toHaveCount(0);
  });
});
