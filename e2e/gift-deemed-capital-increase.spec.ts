import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/**
 * E2E: 증자에 따른 이익의 증여 §39 — cap-table (다수증자·다증여자).
 * 교재 사례4(고가 재배정): 병 300,000,000(부225M+모75M)·정 100,000,000. 검증내역 증감 합계 0.
 * 계획서: docs/00-pm/gift-capital-increase-section39.plan.md
 */

async function openDetail(page: Page) {
  await page.getByTestId("deemed-type-capital_increase_allocation").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("7");
  await dialog.getByLabel("일", { exact: true }).fill("1");
}

async function fillRow(
  page: Page,
  idx: number,
  name: string,
  pre: string,
  entitled: string,
  subscribed: string,
  realloc: string,
) {
  const row = page.getByTestId(`ci-alloc-row-${idx}`);
  await page.getByTestId(`ci-alloc-name-${idx}`).fill(name);
  await row.getByPlaceholder("증자 전 보유 주식수").fill(pre);
  await row.getByPlaceholder("균등 배정 신주수").fill(entitled);
  await row.getByPlaceholder("실제 인수 신주수").fill(subscribed);
  await row.getByPlaceholder("재배정/제3자/초과 신주수").fill(realloc);
}

test.describe("§39 증자 이익 cap-table", () => {
  test("사례4 고가 재배정 → 병 300,000,000(부225M+모75M)·정 100,000,000·검증내역 0", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    // 증자 개요: 고가발행, ㉮ 10,000 / ㉰ 30,000
    await page.getByTestId("ci-alloc-direction-high").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("30000");

    // 4행 (INITIAL 2행 + 2 추가)
    await page.getByTestId("ci-alloc-add-row").click();
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "갑", "50000", "50000", "80000", "30000"); // 父 인수자(증여자)
    await fillRow(page, 1, "을", "10000", "10000", "20000", "10000"); // 母 인수자(증여자)
    await fillRow(page, 2, "병", "30000", "30000", "0", "0"); // 子 포기자(수증자)
    await fillRow(page, 3, "정", "10000", "10000", "0", "0"); // 子 포기자(수증자)

    // 특수관계인: 병·정 ← 갑(sh-1)·을(sh-2)
    await page.getByTestId("ci-alloc-related-2-sh-1").click();
    await page.getByTestId("ci-alloc-related-2-sh-2").click();
    await page.getByTestId("ci-alloc-related-3-sh-1").click();
    await page.getByTestId("ci-alloc-related-3-sh-2").click();

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    // 🔴 정밀 testid 단언 — `deemed-result` 전체 substring 매칭은 포섭으로 구별력이 0이다:
    //    "25,000,000" ⊂ "225,000,000" 이라 정(sh-4) 관련 값이 전부 0이 되어도 초록이었다.
    //    수증자 합계는 ci-alloc-total-{id}, 증여자별 분할은 ci-alloc-split-value-{수증자}-{증여자}.
    await expect(page.getByTestId("ci-alloc-total-sh-3")).toHaveText("300,000,000"); // 병 합계
    await expect(page.getByTestId("ci-alloc-split-value-sh-3-sh-1")).toHaveText("225,000,000"); // 병 ← 갑(부)
    await expect(page.getByTestId("ci-alloc-split-value-sh-3-sh-2")).toHaveText("75,000,000"); // 병 ← 을(모)
    await expect(page.getByTestId("ci-alloc-total-sh-4")).toHaveText("100,000,000"); // 정 합계
    await expect(page.getByTestId("ci-alloc-split-value-sh-4-sh-1")).toHaveText("75,000,000"); // 정 ← 갑(부)
    await expect(page.getByTestId("ci-alloc-split-value-sh-4-sh-2")).toHaveText("25,000,000"); // 정 ← 을(모)

    // 검증내역 증감 합계 0
    await expect(page.getByTestId("ci-alloc-reconciliation")).toContainText("증감 합계 = 0");

    // 증여세 마법사 이관
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  test("수증자 선택 → 선택 1명만 이관 + 증여자 미선택 차단 (§4의2①·§68① · §53)", async ({ page }) => {
    // 「상증법」§4의2①·§68① — 증여세는 **수증자별**로 납세의무가 성립하고 신고도 수증자별이다.
    //   전원을 한 마법사 세션에 합치면 누진구간이 올라가고 §53 공제가 1회만 적용된다(실측 +24,250,000).
    // 「상증법」§53은 **한정 열거 요건규정**이라 증여자 관계를 모르면 공제를 확정할 수 없다.
    //   종전에는 이관 payload에 `donor`가 없어 마법사 기본값 「부」가 그대로 남아
    //   §53 제2호 5천만원 공제가 묻지도 않고 붙었다(실측 −3,880,000).
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    await page.getByTestId("ci-alloc-direction-high").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("30000");
    await page.getByTestId("ci-alloc-add-row").click();
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "갑", "50000", "50000", "80000", "30000");
    await fillRow(page, 1, "을", "10000", "10000", "20000", "10000");
    await fillRow(page, 2, "병", "30000", "30000", "0", "0");
    await fillRow(page, 3, "정", "10000", "10000", "0", "0");
    await page.getByTestId("ci-alloc-related-2-sh-1").click();
    await page.getByTestId("ci-alloc-related-2-sh-2").click();
    await page.getByTestId("ci-alloc-related-3-sh-1").click();
    await page.getByTestId("ci-alloc-related-3-sh-2").click();

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    // 과세 수증자 2명(병 300,000,000 · 정 100,000,000) → 선택 UI 노출
    await expect(page.getByTestId("ci-alloc-donee-select")).toBeVisible();
    await page.getByTestId("ci-alloc-donee-selector").selectOption("1"); // 정

    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);

    // 증여자는 미선택으로 넘어온다 — 기본값 「부」가 조용히 선택돼 있지 않다
    await expect(page.getByTestId("gift-donor-select")).toHaveValue("");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("증여자를 선택하세요.")).toBeVisible();

    // 관계를 고르면 통과하고, 이관된 항목은 **선택한 정 1명분**이다
    await page.getByTestId("gift-donor-select").selectOption("other_relative");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("정 증자이익(§39)")).toBeVisible();
    await expect(page.getByText("병 증자이익(§39)")).toHaveCount(0);
  });

  test("영리법인 주주는 증여세 납세의무자가 아니다 — 450,000,000 → 0 (검증내역은 보존)", async ({ page }) => {
    // 「상증법」§2 9호·§4의2① — 수증자 범위는 거주자·비거주자(각 **비영리법인 포함**)뿐이고
    //   영리법인은 어디에도 없다. 같은 조 ③이 「법인세가 부과되는 경우에는 증여세를 부과하지
    //   아니한다」로 보강한다. 그 이익은 「법인세법 시행령」§89⑥이 §39·§29②를 준용해 계산하는
    //   익금으로 그대로 쓰이므로 **검증내역(zero-sum)은 지우지 않는다**.
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    await page.getByTestId("ci-alloc-direction-low").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("20000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "갑", "60000", "60000", "0", "0"); // 개인 · 전량 포기
    await fillRow(page, 1, "㈜을", "20000", "20000", "80000", "60000"); // 실권주 인수
    await fillRow(page, 2, "병", "20000", "20000", "20000", "0");

    // ① 개인 수증자 기준 — 450,000,000
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("450,000,000");

    // ② ㈜을 행을 영리법인으로 표시 → 과세분만 0
    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("ci-alloc-corp-1").click();
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("0");
    await expect(page.getByTestId("deemed-result")).toContainText("영리법인 수증자");
    // 이익 자체는 부정되지 않는다 — 검증내역 zero-sum 유지
    await expect(page.getByTestId("ci-alloc-reconciliation")).toContainText("증감 합계 = 0");
  });

  test("§39② 소액주주 1인 의제 — 증여자 2행(각 50,000,000) → 1행 100,000,000 (총액 불변)", async ({ page }) => {
    // 「상증법」§39② — 「제1항제1호를 적용할 때 이익을 증여한 자가 … 소액주주로서 2명 이상인
    //   경우에는 이익을 증여한 소액주주가 **1명인 것으로 보고 이익을 계산한다**」
    // 「상증령」§29⑤ — 100분의 1 **미만** AND 액면가액 합계 3억원 **미만**(둘 다 strict).
    //   지분율은 「증자 전 보유」로 구해지지만 **액면 요건은 입력이 없으면 판정할 수 없다**
    //   ⇒ 미입력 상태에서는 의제가 걸리지 않고, 입력하는 순간 걸린다. 그 전환을 여기서 고정한다.
    // ㉮ 200,000 · 인수가 50,000 · A 198,000주(99%) · s1·s2 각 1,000주(0.5%) 전량 포기
    //   ⇒ ㉯ 150,000 · A delta +100,000,000 · s_i delta −50,000,000(각 50%)
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    await page.getByTestId("ci-alloc-direction-low").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("200000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("50000");
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "A", "198000", "99000", "100000", "1000"); // 대주주 — 실권주 전량 인수
    await fillRow(page, 1, "s1", "1000", "500", "0", "0"); // 소액주주 — 전량 포기
    await fillRow(page, 2, "s2", "1000", "500", "0", "0"); // 소액주주 — 전량 포기

    // ① 액면가액 합계 미입력 → §29⑤ 판정 불가 ⇒ 의제 없음, 증여자 2행
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-1")).toHaveText("100,000,000");
    await expect(page.getByTestId("ci-alloc-split-value-sh-1-sh-2")).toHaveText("50,000,000");
    await expect(page.getByTestId("ci-alloc-split-value-sh-1-sh-3")).toHaveText("50,000,000");
    await expect(page.getByTestId("deemed-result")).not.toContainText("1인 의제");

    // ② 액면가액 합계 입력(각 5,000,000 < 3억) → 소액주주 2명 ⇒ 1인 의제로 **1행**
    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("ci-alloc-face-1").fill("5000000");
    await page.getByTestId("ci-alloc-face-2").fill("5000000");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result")).toContainText("§39② 1인 의제");
    await expect(page.getByTestId("ci-alloc-split-value-sh-1-sh-2")).toHaveText("100,000,000");
    await expect(page.getByTestId("ci-alloc-split-value-sh-1-sh-3")).toHaveCount(0);
    // 🔑 긍정 짝 — 의제는 **분할 단위만** 바꾼다. 총액도 검증내역도 그대로다.
    await expect(page.getByTestId("ci-alloc-total-sh-1")).toHaveText("100,000,000");
    await expect(page.getByTestId("ci-alloc-reconciliation")).toContainText("증감 합계 = 0");
  });

  test("혼합 증자 — 재배정분(§39①1호 가목)은 특수관계가 없어도 과세 → 을 125,000,000", async ({ page }) => {
    // 교재 사례2 구조에서 **특수관계 칩을 하나도 켜지 않는다**.
    //   가목(실권주 배정)은 법문에 특수관계 문언이 없어 을의 재배정 10,000주분은 그대로 과세된다.
    //   반면 병·소액주주는 재배정분이 없어 순수 나목분이므로 0이 법령상 정답 — 같은 화면에서
    //   두 성격이 갈리는 것을 확인해 ⑤ 재배정 칸이 엔진까지 도달하는지도 함께 고정한다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    await page.getByTestId("ci-alloc-direction-low").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("30000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("10000");

    await page.getByTestId("ci-alloc-add-row").click();
    await page.getByTestId("ci-alloc-add-row").click();

    await fillRow(page, 0, "갑", "30000", "30000", "0", "0"); // 전량 실권 (증여자)
    await fillRow(page, 1, "을", "10000", "10000", "20000", "10000"); // 자기분 + 재배정 10,000
    await fillRow(page, 2, "병", "5000", "5000", "5000", "0"); // 자기분만
    await fillRow(page, 3, "소액주주", "5000", "5000", "5000", "0");

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    // 가목분 = (㉯ 22,500 − 10,000) × 재배정 10,000 = 125,000,000
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("125,000,000");
    await expect(page.getByTestId("ci-alloc-total-sh-3")).toHaveText("0"); // 순수 나목분
    await expect(page.getByTestId("ci-alloc-total-sh-4")).toHaveText("0");
  });

  test("고가 공모 제외는 «배정받은 자»(증여자) 행으로 판정 — A 표시 0 ↔ B 표시 375,000,000", async ({ page }) => {
    // 「상증법」§39①2호 가목은 「그 실권주를 **배정받은 자**가 인수함으로써 **그의 특수관계인인
    //  신주 인수 포기자**가 얻은 이익」이라 배정을 받는 사람과 이익을 얻는 사람이 다르다.
    //  행별 배정방법 select(⑤)가 엔진의 증여자 행 판정까지 도달하는지 함께 고정한다.
    await page.goto("/calc/gift-deemed");
    await openDetail(page);

    await page.getByTestId("ci-alloc-direction-high").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("5000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("20000");
    await page.getByRole("switch", { name: /주권상장법인 \(공모 배정 제외 판정용\)/ }).click();

    await fillRow(page, 0, "A", "50000", "50000", "100000", "50000"); // 실권주를 배정받은 인수자
    await fillRow(page, 1, "B", "50000", "50000", "0", "0"); // 전량 포기 (수증자)
    await page.getByTestId("ci-alloc-related-0-sh-2").click();
    await page.getByTestId("ci-alloc-related-1-sh-1").click();

    // ① 배정방법 표시 없음 → B 375,000,000
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("375,000,000");

    // ② 실제로 실권주를 «배정받은» A 행에 공모 → 제외 발동 → B 0
    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("ci-alloc-method-row-0").selectOption("public_offering");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("0");

    // ③ 아무것도 배정받지 않은 포기자 B 행에 표시 → 제외 근거 없음 → 그대로 과세
    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("ci-alloc-method-row-0").selectOption("normal");
    await page.getByTestId("ci-alloc-method-row-1").selectOption("public_offering");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("ci-alloc-total-sh-2")).toHaveText("375,000,000");
  });

  test("§39① 공모 모집 배정 — 적용 제외로 증여재산가액 0 (상증령 §29③ 간주모집은 과세)", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await page.getByTestId("deemed-type-capital_increase").click();
    const d = page.getByTestId("deemed-detail-dialog");
    await d.getByLabel("연도").fill("2025");
    await d.getByLabel("월").fill("7");
    await d.getByLabel("일", { exact: true }).fill("1");
    await d.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("20000");
    await d.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await d.getByLabel("신주 1주당 인수가액", { exact: true }).fill("10000");
    await d.getByPlaceholder("증자 주식수").fill("100000");
    await d.getByPlaceholder("배정받은 실권주수").fill("60000");
    // 「상증법」§39① 괄호의 주어가 「주권상장법인이」라 공모 제외는 **상장이 AND 조건**이다(anchor PO-9).
    // 첫 단계에서 켜 둔다. ⑧ validate가 상장이면 종가평균을 요구하므로(gift-deemed-validate.ts:130)
    // 함께 입력하되, 이론 ㉯ 15,000보다 **큰** 20,000을 넣어 「상증령」§29②1가 단서 Min(종가, 이론)이
    // 이론값을 고르게 한다 ⇒ ①③의 300,000,000이 유지되어 **공모 제외 효과만** 분리 관측된다.
    await d.getByRole("switch", { name: /주권상장법인등/ }).click();
    await d.getByPlaceholder("평가기준일 전후 각 2개월 종가평균 (원)").fill("20000");

    // ① 기본(일반 배정) — 300,000,000
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");

    // ② 공모 배정 — 「배정」에서 제외되어 과세 요건 자체가 성립하지 않는다
    await page.getByTestId("deemed-edit-btn").click();
    await d.getByTestId("ci-alloc-method-public_offering").click();
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    // ⚠️ `toContainText("0")`을 쓰지 말 것 — **substring 매칭**이라 "300,000,000"도 통과해
    //    제외가 안 돼도 초록으로 남는다(실제로 그렇게 무력화된 적이 있다).
    //    ⇒ `toHaveText`로 **정확 일치**를 건다. 종전에는 이 단언을 아예 건너뛰고 배너만 봤는데,
    //       헤드라인도 함께 렌더되므로 건너뛸 이유가 없었다(리뷰 5단계 E-5).
    await expect(page.getByTestId("deemed-result-value")).toHaveText("0");
    await expect(page.getByTestId("deemed-exclusion")).toContainText("모집방법");
    // 5-A — 펼침 표의 결론 행이 헤드라인과 **같은 말**을 해야 한다. 종전에는 헤드라인 0원과
    //   표의 「증여재산가액 300,000,000」이 동시에 떴다. 산출값은 남기되 이름을 바꾼다.
    await expect(page.getByTestId("deemed-result")).toContainText("제외 전 산출 이익");
    await expect(page.getByTestId("deemed-result")).not.toContainText("증여재산가액 300,000,000");

    // ③ 간주모집(자시령 §11③) — 제외가 취소되어 다시 과세
    await page.getByTestId("deemed-edit-btn").click();
    await d.getByTestId("ci-alloc-method-deemed_public_offering").click();
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");
    await expect(page.getByTestId("deemed-result")).toContainText("간주모집");
  });
});
