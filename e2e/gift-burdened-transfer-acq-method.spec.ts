/**
 * E2E: 부담부증여 양도소득세 — 취득가액 산정방식 K-4/K-5 · §114조의2 신축 가산세 (증여세 마법사)
 *
 * `gift-burdened-transfer.spec.ts`에서 분리(2026-10-12 — 800줄 정책). 셀렉터·모킹 정책은 원 spec 머리 주석과 같다.
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  giftStep0,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

// ─── 취득가액 산정방식 K-4/K-5 (실지·환산 모드) ──────────────────────────────────
test.describe("부담부증여 양도세 — 취득가액 산정방식 K-4/K-5 (증여세 마법사)", () => {
  test(
    "[AM-E2E-1] 증여재산을 시가로 평가 → 시가 평가(K-4/K-5) 자동 · 산정방식 노출·전환 + 조건부 필드 표시/숨김",
    async ({ page }) => {
      test.setTimeout(120_000);
      await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page); // 증여재산 평가: 시가 8억
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog, { acquisitionMethod: "none" });

      // 평가방식·양도 시 시가는 증여세 평가에서 파생(1h-G1-2) — 라디오·«양도시 시가» 입력 칸이 없다
      // ★ RadioCardGroup radio의 accessible name = label+description → testId로 셀렉트
      await expect(dialog.getByTestId("bg-valuation-basis-market")).toContainText("시가 평가 (K-4/K-5)");
      await expect(dialog.getByTestId("bg-valuation-mode-market")).toHaveCount(0);
      await expect(dialog.getByTestId("bg-valuation-mode-standard")).toHaveCount(0);
      await expect(dialog.getByRole("textbox", { name: "양도시 시가" })).toHaveCount(0);

      // 산정방식 라디오 노출
      const actualRadio = dialog.getByTestId("bg-acq-method-actual");
      const convertedRadio = dialog.getByTestId("bg-acq-method-converted");
      await expect(actualRadio).toBeVisible();
      await expect(convertedRadio).toBeVisible();

      // 산정방식 = 실지(K-4): 실지취득가액 박스 노출
      await actualRadio.check();
      const actualTotalInput = dialog.getByRole("textbox", { name: "실지취득가액 합계" });
      await expect(actualTotalInput).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "자본적 지출" })).toBeVisible();

      // 산정방식 = 환산(K-5): 실지 박스 숨김 + 환산 안내 노출
      await convertedRadio.check();
      await expect(actualTotalInput).toBeHidden();
      await expect(dialog.getByText(/환산취득가 =/)).toBeVisible();

      // 증여재산 평가의 시가 카드를 닫으면 보충적 평가(기준시가 안분)로 파생: 산정방식 숨김 (조건부 회귀)
      // 값이 있는 카드는 확인 Dialog 후 값을 지운다(2026-10-12) — 종전에는 닫아도 값이 남아 시가 평가가 유지됐다.
      const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
      await marketToggle.click();
      // 취소하면 카드·시가 평가가 그대로다
      await page.getByRole("button", { name: "취소" }).click();
      await expect(marketToggle).toHaveAttribute("aria-checked", "true");
      await expect(dialog.getByTestId("bg-valuation-basis-market")).toBeVisible();
      await marketToggle.click();
      await expect(page.getByText("시가 입력을 닫을까요?")).toBeVisible();
      await page.getByRole("button", { name: "지우고 닫기" }).click();
      await expect(marketToggle).toHaveAttribute("aria-checked", "false");
      await expect(dialog.getByTestId("bg-valuation-basis-standard")).toBeVisible();
      await expect(dialog.getByTestId("bg-valuation-basis-market")).toHaveCount(0);
      await expect(actualRadio).toBeHidden();
    },
  );

  test(
    "[AM-E2E-2] K-4 시가+실지 → 계산 → API body acquisitionMethod·valuationMode·실비 최상위 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가(증여재산 평가의 시가 8억에서 파생) + 실지(K-4) + 자본적지출 (라디오는 testId 셀렉트)
      await dialog.getByTestId("bg-acq-method-actual").check();
      await fillAndVerify(
        dialog.getByRole("textbox", { name: "실지취득가액 합계" }),
        "200000000",
      );
      await fillAndVerify(dialog.getByRole("textbox", { name: "자본적 지출" }), "5000000");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      // 부담부증여 양도세는 gift 결과 후 호출됨 → transfer 응답을 명시 대기 (타이밍 보장)
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      const gResp = await giftResponse;
      expect(gResp.ok(), `증여세 API 비정상 ${gResp.status()}`).toBe(true);
      await transferResponse;

      // API body 검증 — K-4 실지·환산 필드 + 실비 최상위
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      const bgInfo = body.burdenedGiftInfo as Record<string, unknown>;
      expect(bgInfo.valuationMode).toBe("sangjeungbeop_market");
      expect(bgInfo.acquisitionMethod).toBe("actual");
      expect(bgInfo.actualAcquisitionTotal).toBe(200_000_000);
      expect(bgInfo.marketValueAtTransfer).toBe(800_000_000); // 증여재산 평가의 시가(파생 — 별도 입력 칸 없음)
      // ★ 실비는 burdenedGiftInfo 밖 body 최상위 (엔진 top-level 소비)
      expect(body.capitalExpenditure).toBe(5_000_000);
    },
  );
});

// ─── §114조의2 신축·증축 환산 5% 가산세 ──────────────────────────────────────────
test.describe("부담부증여 양도세 — §114조의2 신축 가산세 (증여세 마법사)", () => {
  test(
    "[P114-E2E] K-5 환산 + 신축 토글 → 신축일 입력 → body isSelfBuilt·constructionDate·converted 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가(증여재산 평가의 시가에서 파생) + 환산(K-5)
      await dialog.getByTestId("bg-acq-method-converted").check();

      // 신축·증축 토글 ON → 신축 위젯 노출
      const selfBuiltToggle = dialog.getByRole("switch", { name: /신축·증축 건물/ });
      await expect(selfBuiltToggle).toBeVisible();
      await selfBuiltToggle.click();
      await expect(selfBuiltToggle).toHaveAttribute("aria-checked", "true");

      // 신축(new)이 기본 — buildingType=new로 body 전달 확인 (증축은 별도 테스트)
      // 신축일 입력 (K-5 박스 내 DateInput — 신축 토글 후 마지막 연/월/일 세트)
      await dialog.getByRole("textbox", { name: "연도" }).last().fill("2021");
      await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
      await dialog.getByRole("textbox", { name: "일" }).last().fill("10");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      await giftResponse;
      await transferResponse;

      // body 검증 — §114조의2 신축필드 최상위 전달 + K-5 converted
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.isSelfBuilt).toBe(true);
      expect(body.buildingType).toBe("new");
      expect(body.constructionDate).toBe("2021-01-10");
      expect((body.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBe(
        "converted",
      );
    },
  );

  test(
    "[P114-E2E-증축] K-5 환산 + 증축 선택 → 면적·증축기준시가 입력 → body buildingType=extension·extensionFloorArea·extensionStdPriceAtAcquisition 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가(증여재산 평가의 시가에서 파생) + 환산(K-5)
      await dialog.getByTestId("bg-acq-method-converted").check();

      // 신축·증축 토글 ON
      const selfBuiltToggle = dialog.getByRole("switch", { name: /신축·증축 건물/ });
      await selfBuiltToggle.click();
      await expect(selfBuiltToggle).toHaveAttribute("aria-checked", "true");

      // 증축 선택 (Phase 2 — 활성화됨). RadioCardGroup은 click으로 선택 + 위젯 노출 대기
      await dialog.getByTestId("bg-building-type-extension").click();
      await expect(dialog.getByTestId("bg-extension-floor-area")).toBeVisible();

      // 증축일 입력 (K-5 박스 내 DateInput — 토글 후 마지막 연/월/일 세트)
      await dialog.getByRole("textbox", { name: "연도" }).last().fill("2022");
      await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
      await dialog.getByRole("textbox", { name: "일" }).last().fill("1");

      // 증축 바닥면적(85㎡ 초과 게이트) + 증축부분 취득시 기준시가
      await fillAndVerify(dialog.getByTestId("bg-extension-floor-area"), "100");
      await fillAndVerify(dialog.getByTestId("bg-extension-std-price-at-acq"), "36000000");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      await giftResponse;
      await transferResponse;

      // body 검증 — §114조의2 증축필드 최상위 전달
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.isSelfBuilt).toBe(true);
      expect(body.buildingType).toBe("extension");
      expect(body.extensionFloorArea).toBe(100);
      expect(body.extensionStdPriceAtAcquisition).toBe(36_000_000);
      expect((body.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBe(
        "converted",
      );
    },
  );
});
