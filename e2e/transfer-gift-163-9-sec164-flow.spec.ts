/**
 * E2E: **증여** §163⑨1호 ②(§164④) 전 구간 관통 — #1103·#1106·#1108 통합 검증.
 *
 * ## 배경
 *
 * #1103 이전에는 증여에서 ②를 산정할 화면이 **없었다**(입력 UI가 전부 상속 전용). API payload
 * 트리거만 열려 있어 **세액이 전혀 달라지지 않는 상태**였다. RTL 테스트
 * (`__tests__/calc/gift-163-9-sec164-ui-reach.anchor.test.tsx`)는 컴포넌트 단위로 **노출**만 본다.
 *
 * 여기서는 실제 브라우저로 **화면 → API → 엔진 → 결과**를 관통시킨다:
 *   1. 증여 토지에서 §164④ 섹션이 **보인다**(#1103)
 *   2. 화면 입력이 실제로 **엔진에 도달**한다(`hasPre1990ForSec164` payload 분리)
 *   3. 취득가액이 max(① 증여 신고가액, ② §164④)로 결정되고 **결과에 표시**된다
 *   4. **부분 입력은 차단**된다(#1106)
 *   5. ①을 비운 채 추계로 가면 **안내가 뜬다**(#1108)
 *
 * ⚠️ pre1990* 필드는 **시드에 넣지 않는다** — 화면 입력만으로 채워져야 도달 가능이 증명된다.
 *
 * ## 수치
 *
 * 등급 3종이 같으면 비율 = 1.0 ⇒ ㎡당 100,000 × 1,000㎡ = ② **100,000,000**
 * ① 증여 신고가액 50,000,000 < ② ⇒ **② 채택**(max 동작을 세액으로 실증)
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/transfer-gift-163-9-sec164-flow.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** ① 증여 신고가액 — ②보다 작게 두어 max 선택을 관찰 가능하게 만든다. */
const REPORTED_VALUE = 50_000_000;
/** ② §164④ 환산 결과 (100,000/㎡ × 1,000㎡) */
const SEC164_4_VALUE = 100_000_000;

/**
 * 증여 토지 — §164④ 입력(pre1990*)은 **비운 채** 시드한다.
 * 증여일 1987-05-01: 의제취득일(1985.1.1.) **이후** + 개별공시지가 고시(1990.8.30.) **전**.
 * ⇒ `hasPre1990`이 명시적으로 배제하던 조합이라 #1103 전에는 payload조차 가지 않았다.
 */
function seedForm(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            landNature: "standalone",
            assetLabel: "증여 토지",
            acquisitionCause: "gift",
            acquisitionDate: "1987-05-01",
            // 증여는 증여자 취득일이 필수다(단기보유 통산 §104②2호)
            donorAcquisitionDate: "1975-03-01",
            inheritanceAssetKind: "land",
            fixedAcquisitionPrice: String(REPORTED_VALUE),
            acquisitionArea: "1000",
            actualSalePrice: "500000000",
            standardPriceAtTransfer: "200000000",
            ...overrides,
          },
        ],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "500000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page, overrides: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(overrides),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // ③ 취득 정보 — 취득원인·§164④ 섹션이 여기 있다
  await expandAssetSection(page, 3);
}

/** 마법사 끝까지 이동 후 계산 — API 응답을 그대로 돌려준다. */
async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return responsePromise;
}

/** §164④ 등급 3종 + 1990 ㎡당가 입력 (토글은 이미 켜진 상태여야 한다) */
async function fillGrades(page: Page, count = 3) {
  await page.getByPlaceholder("㎡당 가액 입력").fill("100000");
  const gradeInputs = page.getByPlaceholder("등급 번호");
  await expect(gradeInputs).toHaveCount(3);
  for (let i = 0; i < count; i++) await gradeInputs.nth(i).fill("100");
}

test.describe("증여 §163⑨1호 — §164④ 전 구간 (#1103·#1106·#1108)", () => {
  test("① 화면 입력이 엔진에 도달해 max(①,②)로 취득가액이 결정된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // ── 1. 문이 열려 있다 — #1103 이전에는 증여에 이 섹션이 없었다
    await expect(
      page.getByText(/개별공시지가 최초고시\(1990\.8\.30\.\) 전 증여받은 토지는/),
    ).toBeVisible();
    const sec164Toggle = page.getByRole("switch", {
      name: /1990\.8\.30\. 이전 취득 토지 기준시가 환산/,
    });
    await expect(sec164Toggle).toBeVisible();

    // ── 2. 입력
    await sec164Toggle.click();
    await fillGrades(page);
    await expect(page.getByText(/등급가액 [\d,]+/)).toHaveCount(3);

    // ── 3. 계산 — payload가 실제로 엔진에 갔는지 응답으로 확인
    const response = await calculate(page);
    expect(
      response.ok(),
      `계산 API 비정상 응답 ${response.status()} — ${await response.text()}`,
    ).toBe(true);

    const body = await response.json();
    expect(body.data?.mode, "단건 모드 응답이 아니다").toBe("single");
    const detail = body.data.result?.inheritedAcquisitionDetail;
    expect(
      detail,
      "취득가액 의제 상세가 없다 — 증여 pre1990Land가 엔진에 도달하지 않았다(hasPre1990ForSec164 분리 실패)",
    ).toBeTruthy();

    // 핵심: max(① 50,000,000, ② 100,000,000) = ② — 화면 입력이 세액을 실제로 움직였다
    expect(detail.acquisitionPrice).toBe(SEC164_4_VALUE);
    expect(detail.formula).toContain("§164④");

    // ── 4. 결과 화면에도 산출근거가 보인다
    const visible = (re: RegExp) => page.getByText(re).filter({ visible: true }).first();
    await expect(visible(/§164④ 취득당시 기준시가 100,000,000/)).toBeVisible({ timeout: 20_000 });
  });

  test("② 부분 입력은 차단된다 — 등급 2/3만 채우면 계산이 막힌다 (#1106)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    const sec164Toggle = page.getByRole("switch", {
      name: /1990\.8\.30\. 이전 취득 토지 기준시가 환산/,
    });
    await sec164Toggle.click();
    // 등급 3칸 중 2칸만 — all-or-nothing opt-in 위반 상태
    await fillGrades(page, 2);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();

    // 차단 메시지 — 누락 항목까지 짚어준다.
    // ⚠️ 문구에 마크다운 강조(`**모두**`)가 들어 있어 `.`  하나로는 넘지 못한다. 누락 항목으로 잡는다.
    // ⚠️ 오류 메시지는 요약·인라인 두 곳에 나온다 — strict mode 회피(e2e/CLAUDE.md §3)
    await expect(page.getByText(/누락: 취득시 토지등급/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("③ 안내: 의제취득일 前 증여 + 추계 + ① 비움 → §163⑨ 미반영 경고 (#1108)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // stale 재현 — 매매로 환산을 켰다가 취득원인을 증여로 바꾼 상태(표준 자산은 UI로 못 켠다)
    await seedAndOpen(page, {
      acquisitionDate: "1980-03-01", // 의제취득일 前
      useEstimatedAcquisition: true,
      fixedAcquisitionPrice: "", // ① 비움
    });

    await expect(page.getByText(/계산에 등장하지 않습니다/)).toBeVisible();

    // ⭐ 안내가 **dead-end가 아님**을 함께 확인한다 — 추계 모드여도 ① 입력칸이 화면에 있다.
    //    「①을 입력하면 비교된다」고 안내하면서 넣을 칸이 없으면 그 안내는 무의미하다.
    //    (상태 변화 「①을 채우면 안내가 사라진다」는 RTL U2-3이 커버하므로 여기서 중복하지 않는다.)
    await expect(page.getByText("증여 신고가액 (원)")).toBeVisible();
  });
});
