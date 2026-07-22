/**
 * P2 조정대상지역 자동판정 — Step4(보유 상황) UI 흐름 E2E
 *
 * 검증: assets[0].regionCode(법정동코드) + 양도일이 있으면 Step4 진입 시
 *   useEffect가 /api/address/regulated-area를 호출(regionCode 우선·Vworld 무관)하여
 *   ① 자동판정 안내 박스 표시 ② 조정대상지역 토글(isRegulatedArea) 자동 체크.
 *
 * regionCode 직접 주입으로 Vworld 주소검색 의존 없이 실측 (자동판정 로직은 vitest로도 커버).
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-regulated-auto.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 양도세 마법사를 Step4(보유 상황)로 진입시키고 assets[0]·양도일을 주입 */
async function seedStep4(
  page: Page,
  asset: Record<string, unknown>,
  transferDate: string,
): Promise<boolean> {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // zustand persist는 첫 set 전 sessionStorage 미기록 → 완전한 state를 직접 생성.
  // merge가 defaultFormData와 병합하고 assets는 migrateAsset로 정규화하므로 부분 formData로 충분.
  // currentStep은 더 이상 persist되지 않음(항상 첫 스텝부터) → formData만 주입 후
  // 자산 목록(step 0)에서 "다음"으로 보유 상황(step 1)으로 이동한다.
  const seeded = await page.evaluate(
    ({ asset, transferDate }) => {
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: {
            formData: { assets: [asset], transferDate },
            pendingMigration: false,
          },
          version: 0,
        }),
      );
      return true;
    },
    { asset, transferDate },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 사이드바 "보유 상황" 스텝 직접 클릭 → 검증 없이 step 1로 점프
  // (currentStep 미persist로 reload 시 step 0부터 시작 → 사이드바 점프로 기존 셋업과 동등).
  await page.getByRole("button", { name: "보유 상황", exact: true }).click();
  await page.getByText("보유 상황 입력").waitFor({ timeout: 15000 });
  return seeded;
}

test.describe("P2 조정대상지역 자동판정 토글", () => {
  test("강남 regionCode → 조정대상지역 ✓ 자동판정 + 토글 자동 체크", async ({ page }) => {
    const ok = await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "1168010900", // 서울 강남구(11680) — 줄곧 지정
        acquisitionDate: "2018-06-01",
        addressJibun: "서울특별시 강남구 역삼동",
      },
      "2021-06-01",
    );
    expect(ok).toBe(true);

    // 자동판정 안내 박스 + '조정대상지역 ✓'
    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("조정대상지역 ✓").first()).toBeVisible({ timeout: 15000 });

    // isRegulatedArea 토글 자동 체크 (양도일 기준 조정대상지역)
    await expect(
      page.getByRole("switch", { name: /양도일 기준 조정대상지역/ }),
    ).toBeChecked({ timeout: 15000 });

    // 메시지① 중과 검토 안내 노출 (주택 + 양도시 조정)
    await expect(page.getByText("중과세 적용 여부를 검토하세요")).toBeVisible({ timeout: 15000 });
  });

  test("미수록 시도(제주) regionCode → 미지정 + 신뢰도 경고", async ({ page }) => {
    const ok = await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "5011010100", // 제주시(50110) — 데이터 미수록
        acquisitionDate: "2018-06-01",
        addressJibun: "제주특별자치도 제주시 이도동",
      },
      "2021-06-01",
    );
    expect(ok).toBe(true);

    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("미지정").first()).toBeVisible({ timeout: 15000 });
    // 미수록 → low 신뢰도 경고 노출
    await expect(page.getByText(/신뢰도: low/)).toBeVisible({ timeout: 15000 });
  });

  test("수동 조작한 토글은 스텝 재진입(재조회) 시 자동판별이 덮어쓰지 않음", async ({ page }) => {
    // 강남 2017-05-02 취득(지정 고시 2017-08-03 이전 → 취득일 기준 미지정) + 2021-06-01 양도(지정)
    const ok = await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "1168010900",
        acquisitionDate: "2017-05-02",
        addressJibun: "서울특별시 강남구 역삼동",
      },
      "2021-06-01",
    );
    expect(ok).toBe(true);

    // 자동판별: 양도일 ON · 취득일 OFF
    const acqSwitch = page.getByRole("switch", { name: /취득일 기준 조정대상지역/ });
    await expect(page.getByRole("switch", { name: /양도일 기준 조정대상지역/ })).toBeChecked({
      timeout: 15000,
    });
    await expect(acqSwitch).not.toBeChecked();

    // 사용자가 취득일 토글을 수동 ON
    await acqSwitch.click();
    await expect(acqSwitch).toBeChecked();

    // 다른 스텝으로 이탈 → 재진입(재마운트·재조회 발생)
    // 완료 스텝은 "✓ 자산 목록"으로 name 합쳐짐 → 부분 매칭 (e2e/CLAUDE.md §2)
    await page.getByRole("button", { name: "자산 목록" }).click();
    await page.getByRole("button", { name: "보유 상황", exact: true }).click();
    await page.getByText("보유 상황 입력").waitFor({ timeout: 15000 });
    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });

    // 수동 ON이 자동판별(미지정=OFF)에 덮여쓰이지 않고 유지
    await expect(page.getByRole("switch", { name: /취득일 기준 조정대상지역/ })).toBeChecked({
      timeout: 15000,
    });
  });
});

/**
 * P2-b 전체 흐름: 소재지 주소검색·선택 → PNU 앞10 = regionCode 자동 추출
 *   (CompanionAssetCard.tsx onChange) → Step4 진입 시 조정대상지역 자동 판정.
 *
 * 위 P2와 달리 regionCode를 직접 주입하지 않는다. AddressSearch에서 강남 PNU를
 * 가진 결과를 선택하는 것만으로 regionCode가 추출되어 자동 판정까지 이어지는지 검증.
 * /api/address/search만 mock하고 /api/address/regulated-area는 실제 로컬 판정(REGULATED_REGIONS)을 사용.
 */
const ADDR_PLACEHOLDER = "도로명 또는 지번 주소 입력 (예: 테헤란로 123)";

test.describe("P2-b 소재지 검색 → regionCode 자동추출 → 자동판정", () => {
  test("강남 주소 선택만으로 regionCode 추출 + 조정대상지역 자동 판정 + 토글 체크", async ({
    page,
  }) => {
    // 강남구 PNU(앞5 = 11680 = 강남구, 줄곧 지정). 좌표는 비워 reverse-geocode 부수호출 회피.
    await page.route("**/api/address/search**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              pnu: "1168010100107360000",
              title: "역삼동 736",
              road: "서울 강남구 테헤란로 152",
              jibun: "서울 강남구 역삼동 736",
              building: "",
              zipcode: "",
              lng: "",
              lat: "",
            },
          ],
        }),
      }),
    );
    // 부수 네트워크 호출 차단(둘 다 silent catch 대상이라 실패 무방)
    await page.route("**/api/address/standard-price**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );
    await page.route("**/api/address/reverse-geocode**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );

    // assetKind(housing) + 양도일만 주입 — regionCode·주소는 비움(주소검색으로 채울 대상).
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(() => {
      // 완전한 asset 형태로 주입(assetLabel·assetId 포함) — 부분 asset이면 AddressSearch
      // onChange 경로의 asset.assetLabel.trim()에서 TypeError가 나 store 반영이 막힌다.
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: {
            formData: {
              assets: [{ assetId: "seed-asset-1", assetKind: "housing", assetLabel: "" }],
              transferDate: "2021-06-01",
            },
            pendingMigration: false,
          },
          version: 0,
        }),
      );
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 점진적 노출 — 기본정보(① 소재지 검색) 펼침
    await expandAssetSection(page, 1);

    // 자산 목록(step 0)에서 소재지 검색 → 결과 선택 (이 시점에 regionCode 추출됨)
    const addrInput = page.getByPlaceholder(ADDR_PLACEHOLDER);
    await addrInput.fill("역삼동 736");
    await page.getByRole("button", { name: /역삼동 736/ }).click();
    // 선택 성공 확인 — 입력란이 선택 결과(도로명)로 교체됨(이 시점 onChange로 regionCode 추출)
    await expect(addrInput).toHaveValue("서울 강남구 테헤란로 152", { timeout: 15000 });

    // 보유 상황(step 1)으로 이동 → 자동 판정 발동
    await page.getByRole("button", { name: "보유 상황", exact: true }).click();
    await page.getByText("보유 상황 입력").waitFor({ timeout: 15000 });

    // regionCode 직접 주입 없이도 자동 판정되어야 한다
    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("조정대상지역 ✓").first()).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("switch", { name: /양도일 기준 조정대상지역/ }),
    ).toBeChecked({ timeout: 15000 });
  });
});

/**
 * P2-c 거주요건 미충족 메시지(②) — 엔진 §154① meetsOneHouseResidenceRequirement와 단일 진실.
 * regionCode 강남(취득 2018 조정) + 거주기간 자산 주입. isOneHousehold는 기본값 true.
 * 단서면제(proviso) 케이스는 엔진 단위(regulated-area-residence.test.ts R-req3/4)가 커버.
 */
test.describe("P2-c 조정대상지역 거주요건 메시지(②)", () => {
  const MSG2 = "조정대상지역 거주요건(2년) 불충족";

  test("취득조정 + 거주 12개월 → 메시지② 노출", async ({ page }) => {
    await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "1168010900", // 강남(11680)
        acquisitionDate: "2018-06-01", // 2017.8.3 이후(경과규정 비적용)
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "12", // 1년 < 2년
        addressJibun: "서울특별시 강남구 역삼동",
      },
      "2021-06-01",
    );
    await expect(page.getByText(MSG2)).toBeVisible({ timeout: 15000 });
  });

  test("취득조정 + 거주 24개월 → 메시지② 미노출", async ({ page }) => {
    await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "1168010900",
        acquisitionDate: "2018-06-01",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "24", // 2년 충족
        addressJibun: "서울특별시 강남구 역삼동",
      },
      "2021-06-01",
    );
    // 보유 상황 진입 확인 후 메시지② 없음
    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(MSG2)).toHaveCount(0);
  });
});
