/**
 * E2E: 1985.1.1.~1990.8.30. 상속 **토지**의 §164④ 등급환산 — dead-end 해소 (소령 §163⑨1호).
 *
 * ## 배경
 *
 * 개별공시지가 최초고시(1990.8.30.) 前 상속 토지는 화면에서 취득가액을 만들 방법이 **없었다**.
 *   · ① 보충적평가 보조계산(개별공시지가 × 면적)은 `isPreDisclosure`로 숨겨진다 —
 *     그 시점에 공시지가가 존재하지 않으므로 옳은 동작이다.
 *   · ② §164④ 등급환산 위젯은 **매매**·pre-deemed 상속·일반건물 경로에만 있었다.
 * 미공시 상속 **주택**은 `showHouseValuation`으로 독립 섹션을 이미 갖고 있었다 — **토지만** 없었다.
 *
 * ## 이 spec이 지키는 것
 *
 * `__tests__/calc/post-deemed-land-164-4-visibility.test.tsx`(RTL)는 컴포넌트 단위로 **노출**만 본다.
 * 여기서는 **화면 → API → 엔진 → 결과**의 전 구간을 실제 브라우저로 관통시킨다:
 *   1. 상속 토지 자산에서 §164④ 섹션이 **보인다**   ← 이 기능이 연 문
 *   2. 그 섹션에 입력한 값이 실제로 **엔진에 도달**한다 (pre1990Land payload)
 *   3. 취득가액이 max(① 상증법 평가액, ② §164④)로 결정되고 **결과에 표시**된다
 *
 * ⚠️ pre1990* 필드는 **시드에 넣지 않는다** — 화면 입력만으로 채워져야 dead-end 해소가 증명된다.
 *
 * ## 수치
 *
 * 등급 3종이 모두 같으면 분모 = 취득시 등급가액이라 비율 = 1.0 (Case ②).
 *   ㎡당 가액 = 1990.1.1. 개별공시지가 100,000 × 1.0 = 100,000
 *   ② §164④ 취득당시 기준시가 = 100,000 × 1,000㎡ = 100,000,000
 *   ① 상속세 신고가액 50,000,000 < ② ⇒ **② 채택** (max 동작을 세액으로 실증)
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/transfer-inheritance-post-deemed-land-164-4.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** ① 상증법 평가액 — ②보다 작게 두어 max 선택을 관찰 가능하게 만든다. */
const REPORTED_VALUE = 50_000_000;
/** ② §164④ 환산 결과 (100,000/㎡ × 1,000㎡) */
const SEC164_4_VALUE = 100_000_000;

/**
 * 상속 토지 자산 — §164④ 입력(pre1990*)은 **비운 채** 시드한다.
 * 상속개시일 1987-05-01: 의제취득일(1985.1.1.) **이후**(post-deemed) + 고시일(1990.8.30.) **전**.
 */
function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            landNature: "standalone",
            assetLabel: "상속 토지",
            acquisitionCause: "inheritance",
            acquisitionDate: "1987-05-01",
            inheritanceStartDate: "1987-05-01",
            // 상속은 피상속인 취득일이 필수다 (미입력 시 계산 API가 400으로 차단한다)
            decedentAcquisitionDate: "1975-03-01",
            inheritanceAssetKind: "land",
            inheritanceValuationMethod: "supplementary",
            publishedValueAtInheritance: String(REPORTED_VALUE),
            acquisitionArea: "1000",
            actualSalePrice: "500000000",
            standardPriceAtTransfer: "200000000",
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

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // ③ 취득 정보 — 취득원인·상속 의제 섹션이 여기 있다
  await expandAssetSection(page, 3);
}

test.describe("post-deemed 상속토지 §164④ 등급환산 (소령 §163⑨1호)", () => {
  test("§164④ 섹션에서 입력한 등급환산액이 취득가액으로 채택된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // ── 1. 문이 열려 있다 — 이 기능 이전에는 이 섹션 자체가 없었다
    await expect(
      page.getByText(/개별공시지가 미공시\(1990\.8\.30\. 이전 상속·증여\)/),
    ).toBeVisible();
    const sec164Toggle = page.getByRole("switch", {
      name: /1990\.8\.30\. 이전 취득 토지 기준시가 환산/,
    });
    await expect(sec164Toggle).toBeVisible();

    // ── 2. 입력 — 토글 ON 후 1990.8.30. 개별공시지가 + 토지등급 3종
    await sec164Toggle.click();
    await page.getByPlaceholder("㎡당 가액 입력").fill("100000");
    // 등급 3칸은 같은 placeholder("등급 번호")를 쓰므로 순서로 구분한다.
    // 렌더 순서 = 현재 / 직전 / 취득시 (Pre1990LandValuationInput 그리드 정의 순).
    const gradeInputs = page.getByPlaceholder("등급 번호");
    await expect(gradeInputs).toHaveCount(3);
    for (let i = 0; i < 3; i++) await gradeInputs.nth(i).fill("100");

    // 등급번호 → 등급가액 환산 미리보기가 3칸 모두에 뜨면 입력이 유효하다는 뜻
    await expect(page.getByText(/등급가액 [\d,]+/)).toHaveCount(3);

    // ── 3. 계산 — API 응답으로 엔진 도달을 직접 확인한다
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const response = await responsePromise;
    expect(
      response.ok(),
      `계산 API 비정상 응답 ${response.status()} — ${await response.text()}`,
    ).toBe(true);

    const body = await response.json();
    expect(body.data?.mode, "단건 모드 응답이 아니다").toBe("single");
    const detail = body.data.result?.inheritedAcquisitionDetail;
    expect(detail, "상속 취득가액 의제 상세가 결과에 없다 — pre1990Land가 엔진에 도달하지 않았다")
      .toBeTruthy();
    // 핵심: max(① 50,000,000, ② 100,000,000) = ② — 화면 입력이 세액을 실제로 움직였다
    expect(detail.acquisitionPrice).toBe(SEC164_4_VALUE);
    expect(detail.formula).toContain("§164④ 취득당시 기준시가");
    expect(detail.formula).toContain("§164④ 채택");

    // ── 4. 결과 화면에도 산출근거가 보인다 (인쇄용 숨김 사본이 있어 가시성으로 한정)
    const visible = (re: RegExp) => page.getByText(re).filter({ visible: true }).first();
    await expect(visible(/상속 취득가액 의제 계산/)).toBeVisible({ timeout: 20_000 });
    await expect(visible(/§164④ 취득당시 기준시가 100,000,000/)).toBeVisible();
  });

  test("회귀: 1990.8.30. 이후 상속 토지에는 §164④ 섹션이 없다", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => {
      const seed = JSON.parse(s) as ReturnType<typeof seedForm>;
      seed.state.formData.assets[0].acquisitionDate = "1991-01-01";
      seed.state.formData.assets[0].inheritanceStartDate = "1991-01-01";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, JSON.stringify(seedForm()));
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    // 상속 섹션 자체는 떠 있어야 한다 — 없는 것은 §164④ 부분뿐임을 확인
    await expect(page.getByText(/의제취득일 이후 상속/)).toBeVisible();
    await expect(
      page.getByText(/개별공시지가 미공시\(1990\.8\.30\. 이전 상속·증여\)/),
    ).toHaveCount(0);
  });
});
