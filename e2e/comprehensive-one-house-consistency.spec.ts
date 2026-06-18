import { test, expect, type Page } from "@playwright/test";
import {
  openHouseModal,
  addHouse,
  closeHouseModal,
  expandHouseAdvanced,
} from "./_helpers/tax-flow";

/**
 * 종합부동산세 1세대1주택자 토글 ↔ 일반주택 수 정합성 차단 E2E
 *
 * 버그: 1세대1주택자 토글 ON인데 §8④ 의제 미지정 일반주택 2채를 입력하면
 *   엔진이 토글값만으로 12억 공제·고령자/장기보유 세액공제를 적용(과소세액)
 *   → 경고 없이 잘못된 계산이 산출됐다.
 * 수정: validateOneHouseConsistency로 실시간 안내(rose 카드) + 계산 차단.
 *
 * - CPT-1H-1: 토글 ON + 일반 2채(§8④ 미지정) → rose 안내 카드 + 다음 차단(Step2 유지)
 * - CPT-1H-2: 주택2에 §8④ 지방저가 지정 → 안내 사라짐 + 다음 통과(Step3 진입)
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-one-house-consistency.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";
const MISMATCH_TITLE = "1세대 1주택자 설정과 주택 수가 맞지 않습니다";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("종부세 1세대1주택자 ↔ 주택 수 정합성", () => {
  test("CPT-1H-1: 토글 ON + 일반 2채(§8④ 미지정) → 안내 + 다음 차단", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2024" }).check();

    // Step1: 1세대1주택자 토글 ON (개인 첫 switch)
    await page.getByRole("switch").first().click();
    await clickNext(page); // Step1 → Step2

    // 주택1: 일반 15억
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await closeHouseModal(page);

    // 주택2 추가: 일반 2억 (§8④ 미지정)
    await addHouse(page);
    await page.getByPlaceholder("금액 입력").first().fill("200000000");
    await closeHouseModal(page);

    // 실시간 안내(rose) 카드 표시
    await expect(page.getByText(MISMATCH_TITLE)).toBeVisible();

    // 다음 클릭 → 차단: Step2 유지(주택 추가 버튼 여전히 보임) + 빨강 에러 메시지
    await clickNext(page);
    await expect(page.getByRole("button", { name: /주택 추가/ })).toBeVisible();
    await expect(
      page.locator("p.text-red-700").filter({ hasText: "일반주택이 2채" }),
    ).toBeVisible();
  });

  test("CPT-1H-2: 주택2 §8④ 지방저가 지정 → 안내 사라짐 + 다음 통과", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2024" }).check();
    await page.getByRole("switch").first().click(); // 1세대1주택 ON
    await clickNext(page);

    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await closeHouseModal(page);

    await addHouse(page);
    await page.getByPlaceholder("금액 입력").first().fill("200000000");
    // 주택2 비수도권 (§8④4호 지방저가 활성 전제)
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="non_metro"])')
      .first()
      .selectOption("non_metro");
    // §8④ ToggleCard ON → 지방 저가주택 라디오
    await expandHouseAdvanced(page);
    await page.getByRole("dialog").getByRole("switch").last().click();
    await page.getByRole("radio", { name: /지방 저가주택/ }).check();
    await closeHouseModal(page);

    // 안내 카드 사라짐 (normalHouseCount=1 → 의제 성립 가능)
    await expect(page.getByText(MISMATCH_TITLE)).toBeHidden();

    // 다음 통과 → Step3(합산배제) 진입
    await clickNext(page);
    await expect(page.getByText(/합산배제 신청 주택이 없습니다/)).toBeVisible();
  });
});
