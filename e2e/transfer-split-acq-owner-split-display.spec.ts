/**
 * E2E: 토지·건물 별개 취득(split) — **소유자 분리(selfOwns ≠ both)** 결과 표시 항등식 (Phase C Check 지적 · 표시 전용, 세액 불변)
 *
 * 짝: `transfer-split-acq-result-display.spec.ts`(같은 헬퍼 `_helpers/split-acq-display.ts`) · vitest anchor
 *     `split-acq-result-display.c.owner-split.{anchor,ui.anchor}.test.*`(수치 정본 — 이 스펙은 입력이 엔진을 거쳐 화면에 도달하는 배선 확인).
 *
 * 종전: 다건 breakdown 양도가액이 일괄 총액(900,000,000)이라 소유 파트만 센 취득가액·필요경비와 `양도가 − 취득 − 필요경비 = 양도차익`이 어긋났고
 *       (land_only), 단건 명세서 양도가액이 신고서(675,000,000)와 달랐으며, 비과세 gross가 양 파트 값이었다.
 *
 *   S11  단건 selfOwns 3종 × 과세·전액 비과세 — 신고서·명세서가 같은 소유 파트 값 · 항등식
 *   S12  전액 비과세 split 카드의 장특 행 설명(F6)
 *   M5   다건 land_only·building_only × 과세·전액 비과세 — 합산 신고서 · 요약 카드 · 명세서 · 건별 신고서 항등식
 *   M6   F1 — 합산 명세서 보유분·거주분 합계 = 합산 신고서 합계 열(엔진 echo)
 *   M7   F2 — stale 자산 단위 환산 플래그가 파트 echo를 덮지 않는다(요청 body 도달 확인)
 *
 * 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect } from "@playwright/test";
import { OWNER_KEYS, OWNER_SPLIT, calculate, card, formRow, housing, multiForm, multiProps, num, rowsIn, runMulti, seedWizard, singleSeed, stmtValue } from "./_helpers/split-acq-display";

test.describe("단건 — 소유자 분리 · 비과세 split 카드", () => {
  // 소유자 분리(selfOwns ≠ both) — 신고서·명세서가 같은 소유 파트 값으로 항등식을 이룬다. 종전: 명세서 양도가액이 일괄 총액(900,000,000)이라 신고서(675,000,000)와 어긋났다.
  for (const exempt of [false, true]) {
    for (const own of OWNER_KEYS) {
      test(`S11: 소유자 분리 ${own} · ${exempt ? "전액 비과세" : "과세"} — 신고서·명세서 양도가액·취득가액·필요경비·양도차익이 소유 파트 값으로 항등식`, async ({ page }) => {
        test.setTimeout(150_000);
        const e = OWNER_SPLIT[own];
        await seedWizard(
          page,
          singleSeed(
            [housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000", selfOwns: own })],
            exempt ? { householdHousingCount: "1", isOneHousehold: true } : {},
          ),
        );
        await calculate(page);
        const f = async (l: string) => num((await formRow(page, l))[1]);
        const form = { price: await f("양도가액"), acq: await f("취득가액"), exp: await f("필요경비"), gain: await f("전체 양도차익") };
        const stmt = {
          price: await stmtValue(page, "양도가액"),
          acq: await stmtValue(page, "취득가액"),
          exp: await stmtValue(page, "필요경비"),
          gain: await stmtValue(page, "전체 양도차익"),
        };
        expect(form, "신고서").toEqual(e);
        expect(stmt, "상세명세서").toEqual(e);
        expect(form.price - form.acq - form.exp, "신고서 항등식").toBe(form.gain);
        expect(stmt.price - stmt.acq - stmt.exp, "명세서 항등식").toBe(stmt.gain);
        if (exempt) {
          await expect(page.getByText("전액 비과세").first()).toBeVisible();
          expect(await f("비과세 양도차익")).toBe(e.gain);
        }
      });
    }
  }

  test("S12: 전액 비과세 split — 분리 카드의 장특 행에 「비과세 — 장기보유특별공제 없음」 설명이 붙는다 · 과세 결과에는 없다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      singleSeed([housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000" })], {
        householdHousingCount: "1",
        isOneHousehold: true,
      }),
    );
    await calculate(page);
    await expect(card(page, "split-card-exempt-lthd-note")).toContainText("비과세 — 장기보유특별공제 없음");
  });
});

test.describe("다건 — 소유자 분리 · 장특 합계 · stale 환산 플래그", () => {
  // 소유자 분리 — 다건 화면 5곳(합산 신고서 · 합산 요약 카드 · 명세서 · 건별 신고서)이 소유 파트 값으로 같은 항등식을 이룬다.
  // 종전: 양도가액이 일괄 총액이라 `양도가 − 취득 − 필요경비 ≠ 양도차익`(land_only: 900,000,000 − 200,000,000 − 0 ≠ 475,000,000).
  for (const exempt of [false, true]) {
    for (const own of ["land_only", "building_only"] as const) {
      test(`M5: 소유자 분리 ${own} · ${exempt ? "전액 비과세" : "과세"} — 합산 신고서·요약 카드·명세서·건별 신고서가 같은 항등식`, async ({ page }) => {
        test.setTimeout(180_000);
        const e = OWNER_SPLIT[own];
        const land = { price: 300_000_000, acq: 100_000_000 }; // 건2 — 평범한 토지
        const props = [
          {
            propertyId: "np1",
            propertyLabel: "건1",
            completionPercent: 100,
            form: multiForm(
              housing({ landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000", selfOwns: own }),
              exempt ? { isOneHousehold: true } : {},
            ),
          },
          multiProps((a) => multiForm(a))[1],
        ];
        await runMulti(page, `e2e-split-acq-m5-${own}-${exempt ? "x" : "t"}`, `소유자 분리 ${own} 다건 (E2E)`, props);

        // ① 합산 신고서 — 건1 열(2)·건2 열(3)·합계 열(1)
        const form = await rowsIn(page.locator('[data-print-id="form-table"]').first());
        for (const [col, label] of [[1, "합계"], [2, "건1"], [3, "건2"]] as const) {
          const [price, acq, exp, gain] = ["양도가액", "취득가액", "필요경비", "전체 양도차익"].map((l) => form[l][col - 1]);
          expect(price - acq - exp, `합산 신고서 ${label} 열 항등식`).toBe(gain);
        }
        expect(form["양도가액"].slice(0, 2)).toEqual([e.price + land.price, e.price]);
        expect(form["취득가액"][1]).toBe(e.acq);
        expect(form["필요경비"][1]).toBe(e.exp);
        expect(form["전체 양도차익"][1]).toBe(e.gain);

        // ② 합산 요약 카드
        const summary = page.locator('[data-print-id="summary"]').first();
        const sRow = async (label: string) =>
          summary.evaluate((el, l) => {
            for (const d of Array.from(el.querySelectorAll("div.flex"))) {
              const sp = d.querySelectorAll(":scope > span");
              if (sp.length === 2 && (sp[0].textContent ?? "").trim() === l) return sp[1].textContent ?? "";
            }
            return null;
          }, label);
        const sPrice = num((await sRow("전체 양도가액")) ?? "");
        const sAcq = num((await sRow("전체 취득가액")) ?? "");
        const sExp = num((await sRow("전체 필요경비")) ?? "");
        const sGain = num((await sRow("양도차익")) ?? "");
        expect(sPrice).toBe(e.price + land.price);
        expect(sPrice + sAcq + sExp, "요약 카드 항등식(취득·경비는 음수 표기)").toBe(sGain);

        // ③ 명세서 합계
        const t = {
          price: await stmtValue(page, "양도가액"),
          acq: await stmtValue(page, "취득가액"),
          exp: await stmtValue(page, "필요경비"),
          gain: await stmtValue(page, "전체 양도차익"),
        };
        expect(t.price).toBe(e.price + land.price);
        expect(t.price - t.acq - t.exp, "명세서 합계 항등식").toBe(t.gain);

        // ④ 건별 상세 신고서(단일 열) — 건1
        await page.locator('[data-print-id="per-property"]').getByText("펼치기").first().click();
        const per = await rowsIn(page.locator('[data-print-id="per-property"] [data-print-section="form-table"]').first());
        expect(per["양도가액"][0], "건별 신고서 양도가액").toBe(e.price);
        expect(per["취득가액"][0], "건별 신고서 취득가액").toBe(e.acq);
        expect(per["필요경비"][0], "건별 신고서 필요경비").toBe(e.exp);
        expect(per["양도가액"][0] - per["취득가액"][0] - per["필요경비"][0], "건별 신고서 항등식").toBe(per["전체 양도차익"][0]);
      });
    }
  }

  // F1 — 합산 명세서의 보유분·거주분(합계)이 합산 신고서 합계 열과 같다. 종전: 합계 공제액을 대표 자산의 폼값으로 한 번에 재안분해 어긋났다
  // (분리 자산 표2 · 거주 60개월: 명세서 합계 보유 197,632,000 · 거주 0 vs 신고서 보유 131,916,000 · 거주 65,716,000 계열).
  test("M6: 분리 자산(1세대1주택 고가주택 · 거주 60개월 · 실가/환산) + 평범한 토지 — 명세서 보유분·거주분 합계 = 합산 신고서 합계 열 (엔진 echo)", async ({ page }) => {
    test.setTimeout(180_000);
    const props = [
      {
        propertyId: "np1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: multiForm(
          housing({
            landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000",
            actualSalePrice: "1500000000", landStandardPriceAtTransfer: "450000000", buildingStandardPriceAtTransfer: "150000000",
            residencePeriodMonthsAsset: "60",
          }),
          { contractTotalPrice: "1500000000", isOneHousehold: true },
        ),
      },
      multiProps((a) => multiForm(a))[1],
    ];
    await runMulti(page, "e2e-split-acq-m6", "분리 자산 장특 보유·거주분 다건 (E2E)", props);

    const form = await rowsIn(page.locator('[data-print-id="form-table"]').first());
    const formHold = form["보유 기간분 장특"][0];
    const formRes = form["거주 기간분 장특"][0];
    const formTotal = form["장기보유특별공제"][0];
    expect(formRes, "표2 거주분이 있어야 이 케이스가 재안분 오차를 가른다").toBeGreaterThan(0);
    expect(formHold + formRes).toBe(formTotal);

    expect(await stmtValue(page, " 보유 기간분 장특")).toBe(formHold);
    expect(await stmtValue(page, " 거주 기간분 장특")).toBe(formRes);
    expect((await stmtValue(page, " 보유 기간분 장특")) + (await stmtValue(page, " 거주 기간분 장특"))).toBe(await stmtValue(page, "장기보유특별공제"));
  });

  // F2 — 별개 취득 ON 전에 고른 자산 단위 환산 플래그가 stale로 남아도(요청 body에 `useEstimatedAcquisition: true`가 실제로 도달한다)
  // 합산 신고서 분리 자산 열은 파트 echo를 읽는다. 종전: `filingDisplay.estimatedBase`(비소유 환산 건물 파트까지 더한 312,500,000)가 echo(200,000,000)를 덮었다.
  // (비소유 파트의 취득가액 입력은 API 변환이 비우므로 실가 파트로는 발산하지 않는다 — 비소유 파트가 환산일 때 발산한다.)
  test("M7: stale 자산 단위 환산 플래그 + 소유자 분리(land_only) + 토지 실가·건물(타인 소유) 환산 — 합산 신고서 건1 열 취득가액은 소유 파트 200,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    const props = [
      {
        propertyId: "np1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: multiForm(
          housing({
            landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200000000",
            selfOwns: "land_only", useEstimatedAcquisition: true, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "400000000",
          }),
        ),
      },
      multiProps((a) => multiForm(a))[1],
    ];
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST");
    await runMulti(page, "e2e-split-acq-m7", "stale 환산 플래그 다건 (E2E)", props);
    const body = (await reqP).postDataJSON() as { properties: Array<Record<string, unknown>> };
    expect(body.properties[0].useEstimatedAcquisition, "stale 플래그가 실제로 요청에 도달한다").toBe(true);

    const form = await rowsIn(page.locator('[data-print-id="form-table"]').first());
    expect(form["양도가액"][1]).toBe(675_000_000);
    expect(form["취득가액"][1]).toBe(200_000_000); // 종전 312,500,000
    expect(form["필요경비"][1]).toBe(0);
    expect(form["양도가액"][1] - form["취득가액"][1] - form["필요경비"][1]).toBe(form["전체 양도차익"][1]);
  });
});
