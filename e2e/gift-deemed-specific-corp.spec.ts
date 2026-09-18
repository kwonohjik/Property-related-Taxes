import { test, expect, type Page } from "@playwright/test";
import { captureSessionHandoff, readSessionHandoff } from "./_helpers/session-handoff";

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
    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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
    // 🔴 X-1-k: 종전엔 한도표 6값 중 ㈛(`sc-limit-amount`) **한 칸만** 보았다.
    //    `Min(㈚, ㈛)` 선택도, §69 신고세액공제 3%도, 자진납부세액도 화면에서는 검증되지 않았다.
    await expect(page.getByTestId("sc-limit-final-tax")).toContainText("189,000,000"); // Min(㈚, ㈛)
    await expect(page.getByTestId("sc-limit-self-pay-tax")).toContainText("183,330,000"); // − §69 3%
  });

  test("사례1 roster+direct → 장남 과세·직원 비특수관계 제외", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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
    await dialog.getByTestId("sc-sh-shares-1").fill("30000");

    // 행 2: 장남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-2").fill("장남");
    await dialog.getByTestId("sc-sh-relation-2").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-2").fill("25000");

    // 행 3: 차남(직계비속, 25000)
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-3").fill("차남");
    await dialog.getByTestId("sc-sh-relation-3").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-3").fill("5000"); // 교재 사례1 — 5%라 below_threshold 분기를 만든다

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    const matrix = page.getByTestId("sc-multi-matrix");
    await expect(matrix).toBeVisible({ timeout: 15000 });
    // 🔴 X-1-b·X-1-j·SC-7-i: 종전엔 `matrix.toContainText("250,000,000")` 한 줄이었다.
    //    그때 지분 구성은 장남·차남이 **둘 다 25%**라 두 행이 같은 문자열을 렌더했고,
    //    카드 전체 부분일치라 **어느 행인지 가르지 못했다** — 한쪽이 통째로 빠져도 통과한다.
    //    지분을 교재 사례1(부 40%·직원 30%·장남 25%·차남 5%)로 되돌려 **과세제외 3종이
    //    한 화면에 모이게** 하고, 행 단위 testid와 총액을 같이 단언한다.
    await expect(page.getByTestId("sc-multi-gain-2")).toHaveText("250,000,000"); // 장남 25% — 과세
    await expect(page.getByTestId("sc-multi-gain-3")).toHaveText("50,000,000"); //  차남 5% — 1억 미만
    await expect(page.getByTestId("deemed-result-value")).toContainText("250,000,000"); // 총액 = 장남 1인분

    // 과세제외 3종 배지가 전부 렌더된다 — 「1억 미만 제외」은 e2e 전체에 0건이었다
    await expect(matrix).toContainText("비특수관계인 제외");
    await expect(matrix).toContainText("본인증여 제외");
    await expect(matrix).toContainText("1억 미만 제외");
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

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

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

  /**
   * §53 수증자별 공제 · §57 세대생략 할증 — 한도 패널이 둘 다 반영한다.
   * 손자(미성년) 100% · 거래이익 50억 ⇒ 공제 2천만 · 할증 40%(세대생략 재산 20억 초과).
   */
  test("§53 수증자별 공제 + §57 세대생략 할증이 한도표에 반영된다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

    await dialog.getByTestId("sc-mode-roster").click();
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("5000000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-total-shares").fill("100000");

    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId("sc-sh-name-0").fill("손자");
    await dialog.getByTestId("sc-sh-relation-0").selectOption("lineal_descendant");
    await dialog.getByTestId("sc-sh-shares-0").fill("100000");
    await dialog.getByTestId("sc-sh-donor-relation-0").selectOption("lineal_ascendant_minor");
    await dialog.getByTestId("sc-sh-generation-skip-0").getByRole("switch").click();

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    await expect(page.getByTestId("sc-limit-deduction")).toContainText("20,000,000", { timeout: 15000 });
    await expect(page.getByTestId("sc-limit-generation-skip")).toContainText("812,000,000");
    await expect(page.getByTestId("sc-limit-computed-tax")).toContainText("2,842,000,000");
  });

  test("증여자 본인 chip은 1명만 켜진다 (§45의5① — 증여자 2인은 별개 거래)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("sc-mode-roster").click();
    await dialog.getByTestId("sc-total-shares").fill("100000");
    for (const [i, name] of [["0", "갑"], ["1", "을"]] as const) {
      await dialog.getByTestId("sc-sh-add").click();
      await dialog.getByTestId(`sc-sh-name-${i}`).fill(name);
      await dialog.getByTestId(`sc-sh-shares-${i}`).fill("50000");
    }
    await dialog.getByTestId("sc-sh-is-donor-0").getByRole("switch").click();
    await expect(dialog.getByTestId("sc-sh-is-donor-0").getByRole("switch")).toBeChecked();
    // 두 번째를 켜면 첫 번째가 꺼진다
    await dialog.getByTestId("sc-sh-is-donor-1").getByRole("switch").click();
    await expect(dialog.getByTestId("sc-sh-is-donor-1").getByRole("switch")).toBeChecked();
    await expect(dialog.getByTestId("sc-sh-is-donor-0").getByRole("switch")).not.toBeChecked();
  });

  test("토지등 양도소득 법인세액 1억 제외 → 갑 1,449,000,000 → 1,494,000,000 (영 §34의5④2호가목)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

    await dialog.getByTestId("sc-mode-roster").click();
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("3000000000");

    await dialog.getByTestId("sc-corp-tax-auto").click();
    await dialog.getByTestId("sc-corp-tax-assessed").fill("780000000");
    // 「법인세법」 §55① 산출세액은 §55의2 토지등 양도소득 법인세액을 «포함»한 값이다
    await dialog.getByTestId("sc-corp-tax-land-transfer").fill("100000000");
    await dialog.getByTestId("sc-corp-tax-deduction").fill("0");
    await dialog.getByTestId("sc-corp-income").fill("4000000000");

    await dialog.getByTestId("sc-total-shares").fill("100000");
    for (const [i, name, rel, shares] of [
      ["0", "갑", "lineal_descendant", "60000"],
      ["1", "부", "lineal_ascendant", "20000"],
      ["2", "병", "other", "20000"],
    ] as const) {
      await dialog.getByTestId("sc-sh-add").click();
      await dialog.getByTestId(`sc-sh-name-${i}`).fill(name);
      await dialog.getByTestId(`sc-sh-relation-${i}`).selectOption(rel);
      await dialog.getByTestId(`sc-sh-shares-${i}`).fill(shares);
    }
    await dialog.getByTestId("sc-sh-is-donor-1").getByRole("switch").click();
    await dialog.getByTestId("sc-gift-deduction").fill("50000000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    // 안분 585,000,000 → 510,000,000 ⇒ 갑 60% 증여재산가액이 45,000,000원 늘어난다
    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("1,494,000,000", { timeout: 15000 });
    await expect(page.getByTestId("sc-limit-amount")).toContainText("234,000,000");
  });

  test("single 모드에도 §45의5② 한도표가 뜬다 — 증여재산공제가 결과를 바꾼다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

    // 기본 모드(single) 그대로 — 지분율 직접 입력
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("3000000000");
    await dialog.getByTestId("sc-corp-tax-auto").click();
    await dialog.getByTestId("sc-corp-tax-assessed").fill("780000000");
    await dialog.getByTestId("sc-corp-tax-deduction").fill("0");
    await dialog.getByTestId("sc-corp-income").fill("4000000000");
    await dialog.getByTestId("sc-shareholder-ratio").fill("60");
    await dialog.getByTestId("sc-gift-deduction").fill("50000000");
    await dialog.getByTestId("sc-group-ratio").fill("60");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    // 종전에는 이 표가 roster 전용이라 기본 모드 사용자는 한도를 볼 수 없었다
    await expect(page.getByTestId("sc-single-limit")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("sc-limit-computed-tax")).toContainText("399,600,000");
    await expect(page.getByTestId("sc-limit-amount")).toContainText("189,000,000");
    await expect(page.getByTestId("sc-limit-self-pay-tax")).toContainText("183,330,000");
    // 증여재산공제가 ㉮에 반영된다 — 종전에는 값을 넣어도 결과가 1원도 바뀌지 않았다
    await expect(page.getByTestId("sc-limit-deduction")).toContainText("50,000,000");
  });

  test("§43² 1년 합산 — 5천만 + 7천만이 각각은 비과세, 합산하면 120,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2026");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("2");

    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("70000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-shareholder-ratio").fill("100");
    await dialog.getByTestId("sc-group-ratio").fill("100");

    // 소급 1년 이내 같은 호(1호 무상) 선행거래 5천만
    await dialog.getByTestId("sc-pt-add").click();
    const ptDate = dialog.getByTestId("sc-pt-date-0");
    await ptDate.getByLabel("연도").fill("2025");
    await ptDate.getByLabel("월").fill("9");
    await ptDate.getByLabel("일", { exact: true }).fill("2");
    await dialog.getByTestId("sc-pt-benefit-0").fill("50000000");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    // 합산 내역이 화면에 드러난다 — 합산은 조용히 일어나면 안 된다
    await expect(page.getByTestId("sc-aggregation")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("sc-aggregation-total")).toContainText("120,000,000");
    // 영 §34의5⑤ 1억원 문턱을 넘어 과세된다
    await expect(page.getByTestId("sc-single-limit")).toBeVisible();
  });

  test("증여시기 라벨이 조문 문언이고 결과에 적용 법령 기준일이 뜬다 (§45의5① 거래한 날)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);
    const dialog = page.getByTestId("deemed-detail-dialog");

    // 종전에는 두 조문 모두 「증여일」로만 물어 사용자가 신고일을 넣어도 막히지 않았다
    await expect(dialog.getByText("증여시기 — 거래한 날")).toBeVisible();

    await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2026");
    await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
    await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("2");
    await dialog.getByTestId("sc-cp-ruling").click();
    await dialog.getByTestId("sc-transaction-benefit").fill("1000000000");
    await dialog.getByTestId("sc-corp-tax-direct").click();
    await dialog.getByTestId("sc-corporate-tax").fill("0");
    await dialog.getByTestId("sc-shareholder-ratio").fill("100");
    await dialog.getByTestId("sc-group-ratio").fill("100");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();

    const banner = page.getByTestId("deemed-applied-law-date");
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText("2026-03-02");
    await expect(banner).toContainText("상증법 §45의5①");
  });

  test("행위시법 — 2021년 거래는 net 기준(93,000,000), 2019년 거래는 차단", async ({ page }) => {
    const fill = async (y: string, m: string, d: string) => {
      await page.goto("/calc/gift-deemed");
      await openDetail(page);
      const dialog = page.getByTestId("deemed-detail-dialog");
      await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill(y);
      await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill(m);
      await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill(d);
      await dialog.getByTestId("sc-cp-ruling").click();
      await dialog.getByTestId("sc-transaction-benefit").fill("3000000000");
      await dialog.getByTestId("sc-corp-tax-auto").click();
      await dialog.getByTestId("sc-corp-tax-assessed").fill("500000000");
      await dialog.getByTestId("sc-corp-tax-deduction").fill("0");
      await dialog.getByTestId("sc-corp-income").fill("5000000000");
      await dialog.getByTestId("sc-shareholder-ratio").fill("30");
      await dialog.getByTestId("sc-group-ratio").fill("50");
      await closeDetail(page);
    };

    // 2021-06-01 — 영 §34의5⑨ net 본(대통령령 제32414호 시행 前)
    await fill("2021", "6", "1");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("sc-limit-final-tax")).toContainText("93,000,000", { timeout: 15000 });
    await expect(page.getByTestId("sc-single-limit")).toContainText("증여의제이익을 직접 증여한 것으로 가정");

    // 2019-06-30 — 구 체계(3분류·한도 없음)는 미구현이므로 ⑧이 차단한다.
    //   ⑧은 「계산」에서 돌고, 실패하면 모달이 다시 열리며 사유를 보여준다(detail-modal spec와 같은 흐름).
    await fill("2019", "6", "30");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
    await expect(page.getByTestId("deemed-detail-error")).toContainText("구 §45의5");
  });

  test("같은 입력 + 간접 포함 35% 신고 → 특정법인 성립, 580,000,000", async ({ page }) => {
    await fillTwentyNinePercentRoster(page, "35");

    await expect(page.getByTestId("sc-multi-gain-0")).toContainText("580,000,000", { timeout: 15000 });
    await expect(page.getByTestId("sc-eligibility-notice")).toHaveCount(0);
    await expect(page.getByTestId("sc-multi-matrix")).not.toContainText("특정법인 아님");
  });
});

/**
 * X-1-b · X-1-k · SC-7-i — 과세 수증자가 **2명**일 때의 세 축.
 *
 * 사례1은 교재 구성으로 되돌려 과세제외 3종을 덮는 대신 과세자가 1명이 됐다. 그래서 다음 세 축이
 * 그 테스트로는 덮이지 않는다 — 여기서 별도로 잰다:
 *   ① 총액이 과세 수증자 **전원의 합**인가 (「첫 1명만 합산」류 결함 검출)
 *   ② `sc-multi-donee-selector`로 수증자를 바꾸면 한도표가 실제로 바뀌는가 (e2e 0건이었다)
 *   ③ 마법사 이관이 **선택한 1인분**인가 (전원 합계를 1인 증여로 넣으면 누진세율상 언제나 과다)
 *
 * 지분: 부 40%(증여자) · 장남 30% · 차남 30% — 거래이익 10억, 법인세 0.
 * 장남·차남 각 300,000,000 과세 → 총 600,000,000. 두 값을 일부러 **다르게** 두지 않고
 * 같게 두되 행 단위 testid로 가른다(부분일치 함정은 testid가 이미 없앤다).
 */
test("§45의5 과세 2인 — 총액 합산 · 수증자 전환 · 1인분 이관", async ({ page }) => {
  await captureSessionHandoff(page, "giftTaxResumeInput");
  await page.goto("/calc/gift-deemed");
  await openDetail(page);
  const dialog = page.getByTestId("deemed-detail-dialog");

  await dialog.getByTestId("deemed-gift-date").getByLabel("연도").fill("2025");
  await dialog.getByTestId("deemed-gift-date").getByLabel("월").fill("3");
  await dialog.getByTestId("deemed-gift-date").getByLabel("일", { exact: true }).fill("15");

  await dialog.getByTestId("sc-mode-roster").click();
  await dialog.getByTestId("sc-cp-ruling").click();
  await dialog.getByTestId("sc-transaction-benefit").fill("1000000000");
  await dialog.getByTestId("sc-corp-tax-direct").click();
  await dialog.getByTestId("sc-corporate-tax").fill("0");
  await dialog.getByTestId("sc-total-shares").fill("100000");

  const rows: [string, string, string, boolean][] = [
    ["부", "lineal_ascendant", "40000", true],
    ["장남", "lineal_descendant", "30000", false],
    ["차남", "lineal_descendant", "30000", false],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [name, rel, shares, isDonor] = rows[i];
    await dialog.getByTestId("sc-sh-add").click();
    await dialog.getByTestId(`sc-sh-name-${i}`).fill(name);
    await dialog.getByTestId(`sc-sh-relation-${i}`).selectOption(rel);
    await dialog.getByTestId(`sc-sh-shares-${i}`).fill(shares);
    if (isDonor) await dialog.getByTestId(`sc-sh-is-donor-${i}`).getByRole("switch").click();
  }

  await closeDetail(page);
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("sc-multi-matrix")).toBeVisible({ timeout: 15000 });

  // ① 행 단위 + 총액 — 한쪽이 빠지면 총액이 갈린다
  await expect(page.getByTestId("sc-multi-gain-1")).toHaveText("300,000,000");
  await expect(page.getByTestId("sc-multi-gain-2")).toHaveText("300,000,000");
  await expect(page.getByTestId("deemed-result-value")).toContainText("600,000,000");

  // ② 수증자 전환 — 과세자 2명이므로 option도 2개다
  const selector = page.getByTestId("sc-multi-donee-selector");
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption("1"); // 차남
  await expect(page.getByTestId("sc-limit-amount")).toBeVisible();

  // ③ 이관은 선택한 1인분이다 (600,000,000이 아니라 300,000,000)
  await page.getByTestId("deemed-to-wizard").click();
  await page.waitForURL(/\/calc\/gift-tax/);
  const payload = JSON.parse(await readSessionHandoff(page, "giftTaxResumeInput"));
  expect(payload.giftItems).toHaveLength(1);
  expect(payload.giftItems[0].marketValue).toBe(300_000_000);
});
