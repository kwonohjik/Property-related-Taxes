import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/** E2E: 증여로 보는 경우 — 자본거래 (Phase 2 핵심 + sub-case 토글). 상세 입력은 모달 안. */

async function openDetail(page: Page, type: string, date: [string, string, string] = ["2025", "3", "15"]) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill(date[0]);
  await dialog.getByLabel("월").fill(date[1]);
  await dialog.getByLabel("일", { exact: true }).fill(date[2]);
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 — 자본거래", () => {
  test("§40 전환사채 저가인수 시가10억·인수6억 → 4억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    await page.getByLabel("전환사채등 시가", { exact: true }).fill("1000000000");
    await page.getByLabel("인수·취득가액", { exact: true }).fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  test("§40①1호 나목 + 상장 + 공모 발행 → 적용 제외(0)", async ({ page }) => {
    // 「상증법」§40①1호나목 괄호 — 주권상장법인으로서 자시법 §9⑦ 모집방법으로 발행한 법인은 제외.
    // 목·상장·발행방법 3요건이 **모두 UI에서 엔진까지 도달**해야 0이 된다(⑤ 배선 전수 확인).
    // AND 조건 자체(비상장이면 과세)는 anchor CB-PO-4가 고정한다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    const dialog = page.getByTestId("deemed-detail-dialog");
    await page.getByTestId("cb-clause-major_excess").click();
    await dialog.getByRole("switch", { name: /주권상장법인/ }).click();
    await page.getByTestId("cb-issuance-public_offering").click();
    await page.getByLabel("전환사채등 시가", { exact: true }).fill("1000000000");
    await page.getByLabel("인수·취득가액", { exact: true }).fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§40① 적용 제외");
  });

  test("§40①1호 **가목**은 같은 입력에서 그대로 과세 (4개 목뿐)", async ({ page }) => {
    // 「이하 이 항에서 같다」는 「전환사채등을 발행한 법인」이라는 용어에 붙어 나·다목에만 걸린다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    const dialog = page.getByTestId("deemed-detail-dialog");
    await dialog.getByRole("switch", { name: /주권상장법인/ }).click();
    await page.getByLabel("전환사채등 시가", { exact: true }).fill("1000000000");
    await page.getByLabel("인수·취득가액", { exact: true }).fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
  });

  test("§39 증자 저가발행·실권주 재배정 → 33,330,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("33,330,000");
  });

  test("§39 단건 — 수증자가 영리법인이면 33,330,000이 배제된다 (§2 9호·§4의2①·③)", async ({ page }) => {
    // 「상증법」§4의2① 수증자 범위에 영리법인이 없다. 산출근거는 남고 과세분만 0이 된다 —
    //   그 금액은 「법인세법 시행령」§89⑥이 §39·§29②를 준용해 계산하는 익금으로 쓰인다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await page.getByRole("switch", { name: /수증자가 영리법인/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    // 배제 상태에서는 값 대신 배제 배너가 렌더된다 — `deemed-result-value`에 "0"을 쓰면
    //   substring 매칭이라 "33,330,000"도 통과한다(이 저장소에서 실제로 그렇게 무력화된 적이 있다).
    await expect(page.getByTestId("deemed-exclusion")).toContainText("영리법인");
  });

  // 「상증법」§4의2④ — 영리법인의 «수증이익»에 법인세가 부과되면 그 법인의 «주주등»에는
  //   증여세를 부과하지 아니한다. 위 §4의2①·③(수증자 자신이 영리법인)과 **수범자가 다르다**.
  //   ⑤ 토글이 실제로 엔진까지 도달하는지를 본다 — 단위 anchor는 배선을 증명하지 못한다.
  test("§39 단건 — 발행법인 수증이익에 법인세가 부과되면 주주등에는 과세하지 않는다 (§4의2④)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    // 고가(§39①2호)는 이익을 얻는 자가 조문상 「주주등」으로 확정된다 → 주주 토글이 뜨지 않는다.
    // 픽스처는 위 「고가 나목 → 75,006,000」과 같은 수치다 — 게이트가 없으면 그 값이 나온다.
    await page.getByTestId("ci-direction-high").click();
    await page.getByTestId("ci-subtype-no_realloc").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("20000");
    await page.getByPlaceholder("증자 주식수").fill("20000");
    await page.getByPlaceholder("실권주수").fill("30000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("15000");
    await page.getByPlaceholder("분모 신주수").fill("50000");
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    // 조문이 확정하는 목이므로 주주 여부는 묻지 않고 그 사실을 고지한다.
    await expect(page.getByTestId("ci-shareholder-fixed-note")).toContainText("조문상 확정");
    await expect(page.getByTestId("ci-donee-shareholder")).toHaveCount(0);
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§4의2④");
  });

  // 긍정 짝 — §39①1호 «다목»은 이익을 얻는 자가 조문상 「주주등이 **아닌** 자」다.
  //   법인세가 부과돼도 §4의2④가 미치지 않는다. 일괄 배제 구현이었다면 여기서 0이 됐을 것이다.
  test("§39 단건 — 1호 다목(제3자 직접배정)은 법인세가 부과돼도 배제되지 않는다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByTestId("ci-subtype-third_party").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("직접배정 신주수").fill("20000");
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    await expect(page.getByTestId("ci-shareholder-fixed-note")).toContainText("적용되지 않습니다");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toHaveText("66,660,000");
  });

  // 7-5 뮤테이션이 연 구멍 — 위 두 건은 **목이 주주 여부를 확정하는** 경우만 본다(고가=주주,
  //   1호 다목=비주주). 그래서 `doneeIsShareholderOfIssuer`를 ④에서 통째로 빼도 전건 초록이었다
  //   (M2 SURVIVED). §39①1호 «가목»(실권주 재배정)은 이익을 얻는 자가 주주인지 조문이 정하지
  //   않아 **사실관계로 판단**한다 — 그 축이 엔진까지 가는지는 여기서만 증명된다.
  //   픽스처는 위 「저가·실권주 재배정 → 33,330,000」과 같은 수치다.
  test("§39 단건 — 1호 가목(사안 의존)은 주주 여부를 물어 배제한다 (§4의2④)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    // 확정하는 목과 반대다 — 고지문이 아니라 **토글**이 떠야 한다.
    await expect(page.getByTestId("ci-shareholder-fixed-note")).toHaveCount(0);
    await page.getByRole("switch", { name: /이익을 얻은 자가 발행법인의 주주등/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§4의2④");
  });

  // 긍정 짝 — 같은 목에서 주주 토글만 끈다. §4의2④는 「해당 법인의 주주등」에만 미치므로
  //   법인세가 부과됐어도 요건이 미입증이면 배제하지 않는다. 이 단언이 없으면
  //   「법인세 ON이면 무조건 배제」로 구현해도 위 건이 초록으로 통과한다.
  test("§39 단건 — 1호 가목에서 주주 요건이 미입증이면 배제되지 않는다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toHaveText("33,330,000");
  });

  // 🔄 픽스처 정합화(리뷰 6단계 #23) — 「증자 주식수」(실제 증가)와 「분모 신주수」(균등증자 가정
  //    총수)에 같은 50,000을 넣고 있었다. 나목은 실권주 **미배정**이라 그만큼 발행되지 않으므로
  //    실제 증가 = 50,000 − 30,000 = 20,000이 법문에 맞다. 엔진이 아니라 입력이 바뀐 것이다.
  test("§39 증자 고가발행 나목(실권주 미배정·비율가중) → 75,006,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByTestId("ci-direction-high").click();
    await page.getByTestId("ci-subtype-no_realloc").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("20000");
    await page.getByPlaceholder("증자 주식수").fill("20000");
    await page.getByPlaceholder("실권주수").fill("30000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("15000");
    await page.getByPlaceholder("분모 신주수").fill("50000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toHaveText("75,006,000");
  });

  test("§39 ⑤ 라벨·안내가 direction·상장 토글을 따라간다 (리뷰 4단계)", async ({ page }) => {
    // ⚠️ 라이브러리 anchor는 **배선을 증명하지 않는다** — 상수를 고쳐도 화면이 옛 값을 쓰면
    //    그대로 초록이다. 그래서 같은 축을 화면에서 한 번 더 고정한다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");

    // ① 저가 라목 — 「초과배정 신주수」
    await page.getByTestId("ci-direction-low").click();
    await page.getByTestId("ci-subtype-excess").click();
    await expect(page.getByPlaceholder("초과배정 신주수")).toBeVisible();

    // ② 고가 라목 — 손해자(미달 배정된 주주) 기준으로 바뀐다
    //    「상증령」§29②5호의 곱셈 인자는 인수자의 초과분이 아니라 **주주의 미달분**이다.
    await page.getByTestId("ci-direction-high").click();
    await expect(page.getByPlaceholder("미달 배정된 부분의 신주수")).toBeVisible();
    await expect(page.getByPlaceholder("초과배정 신주수")).toHaveCount(0);

    // ③ 고가 다목 — 「배정받지 못한 부분의 신주수」
    await page.getByTestId("ci-subtype-third_party").click();
    await expect(page.getByPlaceholder("배정받지 못한 부분의 신주수")).toBeVisible();

    // ④ 고가 가목은 종전 라벨 유지(§29②3호 다목 — 대수적 동일)
    await page.getByTestId("ci-subtype-forfeited_realloc").click();
    await expect(page.getByPlaceholder("배정받은 실권주수")).toBeVisible();

    // ⑤ 공모 배정 + **비상장** → 「0이 됩니다」라고 말하면 안 된다(§39① 괄호는 AND 조건)
    const dlg = page.getByTestId("deemed-detail-dialog");
    await page.getByTestId("ci-alloc-method-public_offering").click();
    await expect(dlg).toContainText("제외가 적용되지 않고 그대로 과세됩니다");
    await expect(dlg).not.toContainText("증여재산가액이 0이 됩니다");

    // ⑥ 상장 토글을 켜면 종전 안내로 돌아온다 (긍정 짝)
    await dlg.getByRole("switch", { name: /주권상장법인등/ }).click();
    await expect(dlg).toContainText("증여재산가액이 0이 됩니다");
  });

  // ── 2-F-1 §29③ 시기 게이트가 ⑤→④→⑫→⑭→엔진까지 도달하는지 실증 ──────────────
  //   증여일은 폼이 이미 수집하고 있었지만 엔진까지 배선돼 있지 않았다(1-C).

  test("§39 간주모집 시기 게이트 — 2016-02-04 제외 유지 ↔ 2016-02-05 제외 취소 (경계 짝)", async ({ page }) => {
    // 「상증령」§29③ 〈신설 2016.2.5〉 — 그 전에는 「대통령령으로 정하는 경우」가 공집합이라
    // 간주모집이어도 §39① 괄호로 제외된다. 증여일은 폼이 이미 받고 있었으나 엔진에 안 갔다(1-C).
    const fill = async (y: string, m: string, d: string) => {
      await page.goto("/calc/gift-deemed");
      await openDetail(page, "capital_increase", [y, m, d]);
      const dlg = page.getByTestId("deemed-detail-dialog");
      await dlg.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("20000");
      await dlg.getByPlaceholder("증자 전 발행주식총수").fill("100000");
      await dlg.getByLabel("신주 1주당 인수가액", { exact: true }).fill("10000");
      await dlg.getByPlaceholder("증자 주식수").fill("100000");
      await dlg.getByPlaceholder("배정받은 실권주수").fill("60000");
      // §39① 괄호의 주어가 「주권상장법인이」라 상장이 AND 조건(PO-9). ⑧이 종가평균을 요구하므로
      // 이론 ㉯ 15,000보다 큰 20,000을 넣어 §29②1가 단서 Min이 이론값을 고르게 한다.
      await dlg.getByRole("switch", { name: /주권상장법인등/ }).click();
      await dlg.getByPlaceholder("평가기준일 전후 각 2개월 종가평균 (원)").fill("20000");
      await dlg.getByTestId("ci-alloc-method-deemed_public_offering").click();
      await closeDetail(page);
      await page.getByTestId("deemed-calc-btn").click();
    };

    // 시행 전날 — 제외가 유지된다. ⚠️ `deemed-result-value`에 toContainText("0")을 쓰면
    //   substring이라 "300,000,000"도 통과한다 ⇒ 제외 배너를 직접 단언한다.
    await fill("2016", "2", "4");
    await expect(page.getByTestId("deemed-exclusion")).toContainText("모집방법");

    // 시행 당일 — 제외가 취소되어 과세로 돌아온다 (긍정 짝)
    await fill("2016", "2", "5");
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");
    await expect(page.getByTestId("deemed-result")).toContainText("간주모집");
  });

  // ── 2-A 다목 가중이 ⑤→④→⑫→⑭→엔진 전 구간을 통과하는지 실증 ─────────────────
  //   leaf anchor는 Zod(⑫)와 route 매핑(⑭)을 건너뛴다 — 여기서만 전 구간이 증명된다.

  test("§39 증자 저가 나목 — 균등 ㉯ 7,500(§29②2호 가목) × 지분비율 1/2 가중(다목) → 37,500,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByTestId("ci-subtype-no_realloc").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("실권주수").fill("30000");
    await page.getByLabel("균등증자 가정 증가주식수", { exact: true }).fill("100000");
    await page.getByPlaceholder("특수관계인 실권주 주식수").fill("30000");
    await page.getByLabel("증자 후 신주인수자 보유주식수", { exact: true }).fill("75000");
    await page.getByLabel("증자 후 발행주식총수", { exact: true }).fill("150000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    // 두 축이 동시에 걸린다: ㉯가 실제 8,333 → 균등 7,500 · 귀속 3만 → 1.5만
    await expect(page.getByTestId("deemed-result-value")).toContainText("37,500,000");
  });

  test("§39 증자 고가 가목 §29②3호 다목 — 1만÷3만 가중 → 66,670,000 (가중 없으면 200,010,000)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "capital_increase");
    await page.getByTestId("ci-direction-high").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("20000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("30000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("10000");
    await page.getByPlaceholder("분모 신주수").fill("30000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("66,670,000");
  });

  test("§40 전환사채 양도 양도6억·시가5억 → 1억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_bond");
    await page.getByTestId("cb-case-transfer").click();
    await page.getByLabel("전환사채등 시가", { exact: true }).fill("500000000");
    await page.getByLabel("양도가액", { exact: true }).fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
  });

  test("§39①3호 전환주식 전환 33,330,000 − 발행 20,000,000 → 13,330,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    // 전환 시점 (증자후 8333 − 전환 5000 = 3333 × 1만 = 33,330,000)
    await page.getByPlaceholder("전환 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("전환 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("전환 1주당 전환가액등 (원)").fill("5000");
    await page.getByPlaceholder("전환 증자 주식수").fill("50000");
    await page.getByPlaceholder("전환 배정받은 실권주수").fill("10000");
    // 발행 시점 (증자후 9000 − 인수 7000 = 2000 × 1만 = 20,000,000)
    await page.getByPlaceholder("발행 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("발행 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("발행 신주 1주당 인수가액 (원)").fill("7000");
    await page.getByPlaceholder("발행 증자 주식수").fill("50000");
    await page.getByPlaceholder("발행 배정받은 실권주수").fill("10000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("13,330,000");
  });

  // 7-5 뮤테이션 M6 — ④는 전환주식 `side()`에도 §4의2④를 싣고 있었지만 **이 화면에 토글이
  //   없어** 그 줄을 통째로 지워도 전건 초록이었다. 게이트가 최상위에서 한 번만 판정하고
  //   두 leg에는 false를 강제하는지(차감항에서 발동하면 기준선이 사라져 결과가 부푼다)도
  //   함께 본다 — 픽스처는 위 「33,330,000 − 20,000,000 = 13,330,000」과 같다.
  const fillConvertible = async (page: Page) => {
    await page.getByPlaceholder("전환 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("전환 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("전환 1주당 전환가액등 (원)").fill("5000");
    await page.getByPlaceholder("전환 증자 주식수").fill("50000");
    await page.getByPlaceholder("전환 배정받은 실권주수").fill("10000");
    await page.getByPlaceholder("발행 증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("발행 증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("발행 신주 1주당 인수가액 (원)").fill("7000");
    await page.getByPlaceholder("발행 증자 주식수").fill("50000");
    await page.getByPlaceholder("발행 배정받은 실권주수").fill("10000");
  };

  test("§39①3호 전환주식 — 발행법인 수증이익에 법인세가 부과되면 주주등에는 과세하지 않는다 (§4의2④)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    await fillConvertible(page);
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    // 3호 가목(저가·실권주 재배정)은 사안 의존이므로 고지문이 아니라 토글이 떠야 한다.
    await expect(page.getByTestId("cs-shareholder-fixed-note")).toHaveCount(0);
    await page.getByRole("switch", { name: /이익을 얻은 자가 발행법인의 주주등/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§4의2④");
  });

  // 긍정 짝 — 주주 요건이 미입증이면 배제하지 않는다. 동시에 **차감항 전파 금지**의
  //   증인이기도 하다: 게이트가 발행 시점 leg에도 퍼지면 기준선 20,000,000이 사라져
  //   13,330,000이 아니라 33,330,000이 나온다.
  test("§39①3호 전환주식 — 주주 요건이 미입증이면 배제되지 않고 차감항도 살아 있다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    await fillConvertible(page);
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toHaveText("13,330,000");
  });

  // 술어를 공유해도 **인자가 어긋나면** 단일 소스가 아니다. 전환주식 ⑤는 `cs*`로 목을
  //   판정해야 한다 — `side()`가 엔진에 넘기는 것이 `csDirection`·`csSubType`이기 때문이다.
  //   두 축의 초기값이 똑같이 low/forfeited_realloc이라, 위 두 건만으로는 `ci*`로 바꿔치기해도
  //   결과가 같아 구별되지 않았다(7-5 M9 SURVIVED — 픽스처 한정 등가). 여기서 갈라놓는다.
  test("§39①3호 전환주식 고가 — 목 판정은 전환주식 축(cs*)을 따른다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    // 자본증자 축(ci*)은 손대지 않는다 — 초기값 저가·실권주재배정(=사안 의존)에 머문다.
    await page.getByTestId("cs-direction-high").click();
    await page.getByRole("switch", { name: /발행법인 수증이익에 법인세 부과/ }).click();
    // 고가(3호 나목)는 이익을 얻는 자가 조문상 「주주등」이다 → 묻지 않고 고지한다.
    await expect(page.getByTestId("cs-shareholder-fixed-note")).toContainText("조문상 확정");
    await expect(page.getByTestId("cs-donee-shareholder")).toHaveCount(0);
  });

  // 형제 축 §4의2①·③ — ④는 진작 `side()`에 실려 있었지만 **이 화면에 토글이 없었다**.
  //   7-5에서 §4의2④가 같은 형태(M6)로 측정돼 고쳤고, 그때 기록만 해 둔 항목이다.
  //   입력 경로를 열자 잠복 결함이 드러났다 — 두 leg에 플래그가 각각 실려 **산출근거가 통째로
  //   0으로 소실**됐다. 이 파일의 규칙은 「과세분만 0, 이익의 존재는 부정하지 않는다」다.
  test("§39①3호 전환주식 — 수증자가 영리법인이면 배제되지만 산출근거는 보존된다 (§4의2①·③)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "convertible_stock");
    await fillConvertible(page);
    await page.getByRole("switch", { name: /수증자가 영리법인/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("영리법인");
    // 「상증법」§31①이 「증여재산가액」을 과세대상 가액에 한정 정의하므로 라벨이 전환된다.
    //   그 금액은 「법인세법 시행령」§89⑥ 준용 익금이라 화면에서 되읽을 수 있어야 한다.
    await expect(page.getByTestId("deemed-result")).toContainText("제외 전 산출 이익");
    await expect(page.getByTestId("deemed-result")).toContainText("13,330,000");
  });
});
