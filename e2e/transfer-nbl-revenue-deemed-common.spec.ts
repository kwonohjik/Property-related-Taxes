/**
 * transfer-nbl-revenue-deemed-common.spec.ts
 *
 * §168의11③1호 간주임대료 + §168의11③2호 공통수입 안분 — 입력→계산→결과 풀플로우.
 *
 * 검증:
 *  1) ⑫⑬⑭ — 계산 요청 body.nonBusinessLandRaw 에 신규 nbl* 필드가 실려 엔진에 도달(침묵 strip 방지).
 *  2) 결과 — NonBusinessLandResultCard 에 간주임대료·공통수입 안분 echo 노출.
 *
 * 실행: E2E_PORT=3003 npx playwright test e2e/transfer-nbl-revenue-deemed-common.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { setupAddress } from "./_helpers/fill-address";

/**
 * **hydration이 끝날 때까지 기다린다 — 이 spec 불안정의 근원이다.**
 *
 * 🔴 hydration 전에는 React 리스너가 아직 붙지 않아 클릭도 `fill()`도 **조용히 유실된다**.
 *    DOM에는 값이 들어가고 라디오는 checked가 되지만 React 상태는 그대로다. 그 어긋남이
 *    한참 뒤 전혀 다른 증상으로 나타난다 — 실측된 것만 넷이다:
 *    ⓐ combobox 30초 타임아웃 ⓑ 옵션이 「resolved … not visible」 ⓒ 상세 섹션 미출현
 *    ⓓ 양도일이 반영되지 않아 **무조건 사업용 의제**로 빠져 입력칸이 `aria-hidden`이 됨.
 *    전건 병렬 실행처럼 dev 서버가 붐빌 때만 드러나므로 「부하 의존 flake」로 보였다.
 *
 * 🔑 React는 hydration 시점에 host DOM 노드에 `__reactFiber$…`/`__reactProps$…`를 붙인다.
 *    그 키의 존재가 「이 노드에 리스너가 붙었다」는 직접 증거다.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

/** FieldCard/CurrencyInput 라벨 → 내부 input (scope 한정 가능) */
function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

/**
 * Select를 **제 라벨로** 한정한다 — 페이지 전역 인덱스(`getByRole("combobox").nth(n)`)를 쓰지 않는다.
 *
 * 🔑 이 화면의 combobox 개수는 흐름 중에 **변한다**(실측): ①에서 3개(면적 시나리오 + 취득 연도 2개) →
 *    「보유 상황」 진입 시 0개 → 「판정 도움 필요」로 2개 → **지목을 고르면 4개**(재산세·업종이 생김).
 *    인덱스는 그 변화 어디서든 밀린다.
 *
 * 🔑 이 Select들에는 **accessible name이 없다**(실측 — `getByRole("combobox",{name})` 전부 0개).
 *    FieldCard 라벨이 컨트롤에 연결돼 있지 않아서다. 그래서 라벨을 품은 카드로 스코프한다 —
 *    `div.rounded-lg` 필터는 네 라벨 모두 **정확히 1개**를 집는다(실측).
 */
function selectByCardLabel(page: Page, cardLabel: string): Locator {
  return page.locator("div.rounded-lg").filter({ hasText: cardLabel }).getByRole("combobox").first();
}

/**
 * 열고 → 고르고 → **골라졌는지 확인**한다.
 *
 * 🔴 옵션을 `page.getByRole("option", …)`로 **전역** 조회하면 안 된다. 다른 Select의 포털이
 *    마운트돼 있으면 **보이지 않는 옵션에 걸려** 「resolved … waiting for element to be visible」
 *    상태로 30초를 버린다(전건 실행에서 실제로 밟은 모드). 방금 열린 listbox 안으로 한정한다.
 *
 * 🔑 마지막 `toContainText`가 **settle 장벽 겸 오진 방지**다. 선택이 먹지 않았을 때 여기서
 *    바로 터지므로, 한참 뒤 엉뚱한 줄에서 타임아웃 나던 것이 사라진다.
 *
 * 🔴 그리고 **트리거 클릭은 유실된다.** 전건 병렬 실행처럼 dev 서버에 부하가 걸리면 hydration이
 *    늦어 핸들러가 붙기 전에 클릭이 떨어지고, **아무 일도 일어나지 않는다**. 한 번만 누르고
 *    넘어가면 그 유실이 한참 뒤 엉뚱한 줄의 30초 타임아웃으로 나타난다(원래 증상).
 *    `aria-expanded`가 정본 상태라(실측 `false`↔`true`) 열릴 때까지 **멱등하게** 다시 누른다.
 */
async function chooseFromSelect(page: Page, cardLabel: string, optionName: string, shown: string) {
  const trigger = selectByCardLabel(page, cardLabel);
  await expect(trigger, `«${cardLabel}» Select가 보여야 함`).toBeVisible();

  const listbox = page.getByRole("listbox");
  await expect(async () => {
    // 이미 열려 있으면 누르지 않는다 — 다시 누르면 닫힌다.
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(listbox, `«${cardLabel}» 드롭다운이 열려야 함`).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 20_000 });

  await listbox.getByRole("option", { name: optionName }).click();
  await expect(trigger, `«${cardLabel}» = ${shown}`).toContainText(shown);
}

/**
 * 스위치를 ON으로 만든다 — **이미 ON이면 누르지 않는다**(다시 누르면 꺼진다).
 * `aria-checked`는 React가 렌더하는 값이라 상태 판정에 쓸 수 있다(native radio의 `checked`와 다르다).
 */
async function turnSwitchOn(sw: Locator, what: string) {
  await expect(async () => {
    if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    await expect(sw, what).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  }).toPass({ timeout: 25_000 });
}

/**
 * 「비사업용 토지 여부 검토」 ON + 「판정 도움 필요」 선택.
 *
 * 🔴 **재시도로 라디오를 다시 누르면 안 된다** — 실측:
 *
 * | 동작 | 스위치 | 상세 섹션 |
 * |---|---|---|
 * | 스위치 ON | `true` | — |
 * | 「판정 도움 필요」 클릭 | `true` | 1개 |
 * | **같은 라디오 재클릭** | **`false`** | **0개** |
 *
 * 이미 선택된 라디오를 다시 누르면 그 클릭이 바깥 `ToggleCard`까지 올라가 **스위치가 꺼지고
 * 섹션이 통째로 사라진다**. 「클릭이 유실됐나 보다」며 다시 누르는 재시도 헬퍼를 넣었다가
 * 스스로 이 상태를 만들었고, 전건 실행에서 그 실패를 봤다(2026-09-25). 그래서 **한 번만
 * 누르고 넉넉히 기다린다** — 유실 자체는 위 `waitForHydration`이 막는다.
 *
 * 🔴 `isChecked()`로 「이미 골랐나」를 가르는 것도 안 된다. native radio의 `checked`는 브라우저가
 *    바로 세우는 값이라 React에 도달하지 않은 클릭도 `true`로 보인다 — 교착이 된다(실측).
 */
async function openNblDetailedJudgment(page: Page) {
  const sw = page.getByRole("switch", { name: /비사업용 토지/ });
  await expect(async () => {
    if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    await expect(sw, "비사업용 토지 토글 ON").toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  }).toPass({ timeout: 20_000 });

  await page.getByRole("radio", { name: /판정 도움 필요/ }).click();
  await expect(
    page.getByText("비사업용 토지 정밀 판정"),
    "「판정 도움 필요」 상세 섹션이 떠야 함",
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("§168의11③1·2호 간주임대료·공통수입 안분 — 풀플로우", () => {
  test("입력 → 계산 요청 body 신규필드 도달 + 결과 echo", async ({ page }) => {
    /*
      🔴 이 spec은 **저장소에서 가장 긴 풀플로우 중 하나**(입력 30여 단계 → 계산 → 결과)인데
         종전에는 명시 예산 없이 기본 30초로 돌았다. 단독 6.5초라 평소엔 남지만, 전건 병렬
         실행처럼 dev 서버가 붐비면 **여유가 0**이 된다. 같은 무게의 풀플로우들은 이미
         60~120초를 쓴다(`burdened-gift-std-price-calculator` · `building-stdprice-apply-timepoint`).
         ⚠️ 단언을 약화시키는 것이 아니다 — 틀린 결과는 120초를 줘도 틀리다.
    */
    test.setTimeout(120_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await waitForHydration(page);

    // 양도일 2026-02-18
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");

    // 점진적 노출 — 기본정보(①)·양도정보(②)·취득정보(③) 펼침
    await expandAssetSection(page, 1);
    await setupAddress(page); // ⑧ 소재지 필수
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 토지·농지 → 독립 나대지 → 면적
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("314.1");

    // 양도가액
    await inputByLabel(page, "양도가액 (원)").fill("2000000000");

    // 취득원인 매매 → 환산취득가
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();

    // 취득일 1997-02-03 (세 번째 DateInput 그룹)
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1997");
    await page.getByLabel("월", { exact: true }).nth(2).fill("02");
    await page.getByLabel("일", { exact: true }).nth(2).fill("03");

    // 취득시/양도시 기준시가 단가
    await page.getByPlaceholder("공시지가 단가").first().fill("637000");
    await page.waitForTimeout(150);
    await page.getByPlaceholder("공시지가 단가").nth(1).fill("893300");
    await page.waitForTimeout(150);

    // 보유 상황(Step4)
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    /*
      🔴 종전에는 토글·라디오를 각각 **확인 없이** 한 번씩 누르고 넘어갔다. 라디오가 먹지 않으면
         `NblSectionContainer`가 아예 렌더되지 않는데(`SpecialSituationSection.tsx:186` —
         `nblUseDetailedJudgment` 게이트), 그 결과가 **다음 줄의 combobox 조회 30초 타임아웃**으로
         나타나 범인이 늘 엉뚱한 줄로 지목됐다. 여기서 섹션이 실제로 떴는지 확인하고 넘어간다.
    */
    await openNblDetailedJudgment(page);

    // 토지 지목 → 기타 토지 (이것을 고르면 재산세·업종 Select가 **새로 생긴다** — 실측)
    await chooseFromSelect(page, "토지 지목", "기타 토지 (나대지·잡종지)", "기타 토지");

    // 용도지역 (NBL detailed 필수 — 미설정 시 raw 미전송·검증 차단)
    await chooseFromSelect(page, "용도지역", "일반주거지역", "일반주거지역");

    // 재산세 과세 분류 (기타토지 필수 — PR-1/A1-01. 미선택 시 매퍼가 「종합합산」으로 접어
    // 조용히 비사업용 중과가 붙던 것을 ⑧에서 차단하도록 바꿨다)
    await chooseFromSelect(page, "재산세 과세 분류", "종합합산", "종합합산");

    // §168의11② 업종 → 주차장운영업(3%)
    const revenueSection = page
      .locator("div.rounded-lg")
      .filter({ hasText: "§168의11② 수입금액비율" });
    await chooseFromSelect(page, "§168의11② 수입금액비율", "주차장운영업 (3%)", "주차장운영업");

    // 당해 수입금액·토지가액 (validation 필수)
    await page.getByLabel("당해 수입금액", { exact: true }).fill("50000000");
    await page.getByLabel("당해 토지가액", { exact: true }).fill("1000000000");

    // §168의11③1호 간주임대료 — 보증금·임대일수
    await page.getByLabel("당해 보증금", { exact: true }).fill("500000000");
    await inputByLabel(revenueSection, "당해 임대 과세대상기간").fill("365");

    // §168의11③2호 공통수입 안분 토글 ON + 당해 쌍
    await turnSwitchOn(page.getByRole("switch", { name: /공통수입 안분/ }), "§168의11③2호 공통수입 안분 토글 ON");
    await page.getByLabel("당해 공통수입금액", { exact: true }).fill("30000000");
    await page.getByLabel("당해 그 밖의 토지가액", { exact: true }).fill("200000000");

    // ── 계산 요청 body 캡처 (⑫⑬⑭) ──
    let capturedRaw: Record<string, unknown> | undefined;
    await page.route("**/api/calc/transfer", async (route) => {
      const body = route.request().postDataJSON?.() as { nonBusinessLandRaw?: Record<string, unknown> } | undefined;
      capturedRaw = body?.nonBusinessLandRaw;
      await route.continue();
    });

    // 가산세 단계까지 이동 후 계산
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });

    // ── 1) body 신규필드 도달 단언 ──
    expect(capturedRaw, "nonBusinessLandRaw 가 요청 body 에 있어야 함").toBeTruthy();
    expect(capturedRaw?.nblRevenueCurrentDeposit, "당해 보증금 필드 도달").toBeTruthy();
    expect(String(capturedRaw?.nblRevenueCurrentRentDays)).toContain("365");
    expect(capturedRaw?.nblRevenueCommonApportion, "공통안분 토글 도달").toBe(true);
    expect(capturedRaw?.nblRevenueCommonRevenue, "공통수입금액 도달").toBeTruthy();
    expect(capturedRaw?.nblRevenueOtherLandValue, "그 밖의 토지가액 도달").toBeTruthy();

    // ── 2) 결과 카드 echo 노출 ──
    await expect(page.getByText("§168의11③1호 간주임대료 합산")).toBeVisible();
    await expect(page.getByText("§168의11③2호 공통수입 안분")).toBeVisible();

    console.log("✅ 간주임대료·공통안분 body 도달 + 결과 echo 확인");
  });
});
