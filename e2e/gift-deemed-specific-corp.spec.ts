import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §45의5 특정법인과의 거래 이익 증여의제 — 사례2 roster+auto 모드.
 *
 * 입력: 갑60%·부20%(증여자)·을3%·병17%, 거래이익 30억, 법인세 산출세액 780백만·소득 40억
 * 기대: 갑 증여재산가액 1,449,000,000 / 한도(㉯) 189,000,000
 *
 * anchor: docs/02-design/features/gift-specific-corp-45-5.engine.design.md SC-CASE2
 */

/** deemed-type 버튼 클릭 후 dialog가 열릴 때까지 대기 */
async function openDetail(page: Page) {
  await page.getByTestId("deemed-type-specific_corp").click();
  // dialog 내부 컨텐츠(deemed-detail-dialog)가 DOM에 나타날 때까지 기다림
  await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
}

const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("§45의5 특정법인과의 거래 (roster+auto — 사례2)", () => {
  test("사례2 갑 증여재산가액 1,449,000,000 · 한도 189,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    // 증여일 입력
    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    // 입력 방식: 주주 명단
    await dialog.getByTestId("sc-mode-roster").click();
    // §45의5① 거래상대방 — W4에서 필수가 됐다(미선택이면 ⑧이 차단한다)
    await dialog.getByTestId("sc-cp-ruling").click();

    // 거래이익 30억
    await dialog.getByTestId("sc-transaction-benefit").fill("3000000000");

    // 법인세: 산출세액+소득금액 자동안분
    await dialog.getByTestId("sc-corp-tax-auto").click();
    await dialog.getByTestId("sc-corp-tax-assessed").fill("780000000");
    await dialog.getByTestId("sc-corp-tax-deduction").fill("0");
    await dialog.getByTestId("sc-corp-income").fill("4000000000");

    // 발행주식 총수
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 주주 명단 4행: 갑60%·부20%(증여자)·을3%·병17%
    // 행 0: 갑(직계비속, 60000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("갑");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("60000");

    // 행 1: 부(직계존속, 20000, isDonor=true)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("부");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("lineal_ascendant");
    await dialog.getByTestId("sc-sh-shares-1").fill("20000");
    await dialog.getByTestId("sc-sh-is-donor-1").getByRole("switch").click();

    // 행 2: 을(형제자매, 3000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("을");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("sibling");
    await dialog.getByTestId("sc-sh-shares-2").fill("3000");

    // 행 3: 병(타인, 17000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-3").fill("병");
    await dialog.getByTestId("sc-sh-relation-3").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-3").fill("17000");

    // 증여재산공제 5천만 (§45의5② 한도 계산용)
    await dialog.getByTestId("sc-gift-deduction").fill("50000000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    // 주주별 표 확인 — 갑 증여재산가액
    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("1,449,000,000");

    // §45의5② 한도 표 확인
    const limitCard = page.getByTestId("sc-multi-limit");
    await expect(limitCard).toBeVisible();
    await expect(page.getByTestId("sc-limit-amount")).toContainText("189,000,000");
  });

  test("사례1 roster+direct → 장남 과세·직원 비특수관계 제외", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    // 주주 명단 모드, 거래이익 10억
    await dialog.getByTestId("sc-mode-roster").click();
    // §45의5① 거래상대방 — W4에서 필수가 됐다(미선택이면 ⑧이 차단한다)
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("1000000000");

    // 법인세: 직접 입력(이월결손금으로 0)
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");

    // 발행주식 총수
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 행 0: 부(직계존속, 40000, isDonor=true)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("부");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_ascendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("40000");
    await dialog.getByTestId("sc-sh-is-donor-0").getByRole("switch").click();

    // 행 1: 직원(타인, 10000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("직원");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-1").fill("10000");

    // 행 2: 장남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("장남");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-2").fill("25000");

    // 행 3: 차남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-3").fill("차남");
    await dialog.getByTestId("sc-sh-relation-3").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-3").fill("25000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    // 장남 25% → 250,000,000 과세
    await expect(matrix).toContainText("250,000,000");
    // "비특수관계인 제외" 배지 노출
    await expect(matrix).toContainText("비특수관계인 제외");
    // "본인증여 제외" 배지 노출
    await expect(matrix).toContainText("본인증여 제외");
  });

  /**
   * §45의5① ⓐ 특정법인 성립요건 — 지배주주등의 주식보유비율 100분의 30 이상.
   * 지배주주등 직접지분 합계 29%에서는 증여의제가 성립하지 않는다(종전 580,000,000 산출).
   * 「주식보유비율」은 법 §45의3①에 따라 **직접 또는 간접**이므로, 간접분을 신고하면 되살아난다.
   *
   * ⚠️ 계산 후에는 상세 dialog를 다시 열 수 없어(실측) 두 축을 각각 독립 플로우로 돌린다.
   */
  async function fillTwentyNinePercentRoster(page: Page, groupRatioPct?: string) {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    await dialog.getByTestId("sc-mode-roster").click();
    // §45의5① 거래상대방 — W4에서 필수가 됐다(미선택이면 ⑧이 차단한다)
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("2000000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 갑(직계비속, 29,000주 = 29%) — 지배주주등은 이 1인뿐이다
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("갑");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("29000");

    // 타인(71,000주)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("타인");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-1").fill("71000");

    if (groupRatioPct !== undefined) {
      await dialog.getByTestId("sc-group-ratio").fill(groupRatioPct);
    }

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
  }

  test("지배주주등 29% · 간접 미신고 → 특정법인 아님 고지 + 0원", async ({ page }) => {
    await fillTwentyNinePercentRoster(page);

    const notice = page.getByTestId("sc-eligibility-notice");
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(notice).toContainText("특정법인 아님");
    await expect(notice).toContainText("29.0%");
    // 표의 과세여부 배지도 갱신된다 — 「과세」가 남으면 합계 0과 어긋난다
    await expect(page.getByTestId("sc-multi-matrix")).toContainText("특정법인 아님");
    // 미적용 사유 카드 — 간접보유를 0%로 본 전제를 함께 고지해 되돌릴 수 있게 한다
    await expect(page.getByTestId("deemed-exclusion")).toContainText("간접보유");
  });

  /**
   * §45의5 「주식보유비율」의 간접분 — 법인 경유 지배지분.
   * 갑 직접 20% + 갑이 100% 소유한 A법인 40% ⇒ 갑의 주식보유비율 60%.
   * 종전에는 A법인 행이 「비특수관계인 제외」로 통째 탈락해 갑이 400,000,000만 잡혔다.
   */
  test("법인 경유 간접보유 40%가 개인에게 귀속된다 — 400,000,000 → 1,200,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    await dialog.getByTestId("sc-mode-roster").click();
    // §45의5① 거래상대방 — W4에서 필수가 됐다(미선택이면 ⑧이 차단한다)
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("2000000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-total-shares").fill("100000");

    // 행 0: 갑(직계비속, 직접 20,000주)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("갑");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("20000");

    // 행 1: A법인(법인주주, 40,000주)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-1").fill("A법인");
    await dialog.getByTestId("sc-sh-relation-1").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-1").fill("40000");
    await dialog.getByTestId("sc-sh-is-corporate-1").getByRole("switch").click();

    // 행 2: 타인(40,000주)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("타인");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("other");
    await dialog.getByTestId("sc-sh-shares-2").fill("40000");

    // 간접출자관계: A법인을 갑이 100% 소유
    await dialog.getByTestId("sc-im-add").click();
    await dialog.getByTestId("sc-im-corp-0").selectOption({ label: "A법인" });
    await dialog.getByTestId("sc-im-owner-add-0").click();
    await dialog.getByTestId("sc-im-owner-who-0-0").selectOption({ label: "갑" });
    await dialog.getByTestId("sc-im-owner-ratio-0-0").fill("100");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    // 갑 = 특정법인이익 20억 × 60%
    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("1,200,000,000");
    // 직접/간접 분해가 화면에 보인다
    await expect(page.getByTestId("sc-multi-ratio-split-0")).toContainText("직접 20.0 + 간접 40.0");
    // 법인주주 행은 과세되지 않고 0원 — 이중계상 방지
    await expect(matrix).toContainText("법인주주 — 개인에 간접 귀속");
  });

  /**
   * §45의5① 거래상대방 · 영 §34의5⑦ 현저성 — 두 요건이 없어 요건 미충족 거래도 전액 과세됐다.
   * single 모드로 두 축을 한 화면에서 누른다.
   */
  test("제3자와의 거래 → 0원 / 2호 현저성 미달 → 0원 (§45의5① · 영 §34의5⑦)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    // 지분율 직접 입력 · 상대방 = 그 밖의 자
    await dialog.getByTestId("sc-cp-other").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("2000000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-shareholder-ratio").fill("100");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    await expect(page.getByTestId("deemed-exclusion")).toContainText("지배주주 및 그 특수관계인이 아닙니다", {
      timeout: 15000,
    });
  });

  // 긍정 짝(35% → 350,000,000)은 unit [T-5]가 고정한다 — 계산 후 dialog 재오픈이 안 돼 여기선 음성만 본다
  test("2호 현저성 미달 — 시가 10억·대가 8억(20% & 3억 미만) → 이익 0원", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByLabel("연도").fill("2025");
    await dialog.getByLabel("월").fill("3");
    await dialog.getByLabel("일", { exact: true }).fill("15");

    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-tt-low").click();
    // 거래이익 칸이 사라지고 시가·대가를 받는다 (영 §34의5④1호다목 — 이익이 도출값이다)
    await expect(dialog.getByTestId("sc-transaction-benefit")).toHaveCount(0);
    await dialog.getByTestId("sc-market-value").fill("1000000000");
    await dialog.getByTestId("sc-consideration").fill("800000000");
    await expect(dialog.getByTestId("sc-significance-echo")).toContainText("현저성 미달");

    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-shareholder-ratio").fill("100");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("상증령 §34의5⑦", { timeout: 15000 });
  });

  test("3의2호 자본거래 — 지배주주 본인이 상대방 후보에서 빠진다 (영 §34의5②)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await expect(dialog.getByTestId("sc-cp-ruling")).toHaveCount(1);
    await dialog.getByTestId("sc-tt-capital").click();
    // 영 §34의5②은 「지배주주의 특수관계인」으로 한정한다 — 본인 선택지가 사라진다
    await expect(dialog.getByTestId("sc-cp-ruling")).toHaveCount(0);
    await expect(dialog.getByTestId("sc-cp-related")).toHaveCount(1);
    // 준용 계산 안내가 뜬다 (나목 — 「시가 − 대가」가 아니다)
    await expect(dialog).toContainText("준용");
  });

  test("같은 입력 + 간접 포함 35% 신고 → 특정법인 성립, 580,000,000", async ({ page }) => {
    await fillTwentyNinePercentRoster(page, "35");

    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("580,000,000", { timeout: 15000 });
    await expect(page.getByTestId("sc-eligibility-notice")).toHaveCount(0);
    await expect(page.getByTestId("sc-multi-matrix")).not.toContainText("특정법인 아님");
  });
});
