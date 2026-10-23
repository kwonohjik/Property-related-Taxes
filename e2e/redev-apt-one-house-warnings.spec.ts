/**
 * 재개발 완공APT × 1세대1주택 판정 안내 — 브라우저 경로 (계획서 `docs/00-pm/redev-apt-one-house-warning-parity.plan.md` · Q-1 (a))
 *
 * 승계조합원 완공APT에서 삭제 전 §154①4호를 골랐지만 등록 신청일(2019-12-17)이 부칙 기한(2019-12-16) 뒤라 적용되지 않는 경우,
 * 종전에는 결과 화면에 아무 이유가 없었다. 일반 주택과 같은 문장이 결과 화면에 1건 보이는지를 본다.
 * 세액·경로별 단언은 anchor가 고정한다(`__tests__/calc/redev-apt-one-house-warnings.anchor.test.ts` RW-1).
 * 양도세 API는 모킹하지 않는다 — 결과 화면의 경고가 엔진에서 왔는지가 이 spec의 과녁이다.
 *
 * 시료: 입주권 승계 2019-06-01 · 인가 2019-03-15 · 사용승인 2021-02-15(대전 유성 — 조정) · 거주 0 · 1주택 · 2024-06-01 양도 · 10억.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const RENTAL_4HO_TEXT = /삭제 전 §154①4호 .*을 적용하지 않았습니다 — .*2019년 12월 16일 뒤/;

test("[RAW-1] 승계조합원 완공APT · 4호 미충족 — 결과 화면에 일반 주택과 같은 이유 1건", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: {
      assetKind: "redevelopment_apt",
      acquisitionCause: "purchase",
      acquisitionDate: "2019-06-01",
      addressJibun: "대전광역시 유성구 테스트동 1",
      regionCode: "3020010100",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "100000000",
      redevSubject: "apt",
      redevApprovalDate: "2019-03-15",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevIsSuccessorMember: "yes",
      redevCompletionDate: "2021-02-15",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "0",
    },
    formOver: {
      transferDate: "2024-06-01",
      contractTotalPrice: "1000000000",
      wasRegulatedAtAcquisition: true,
      provisoReason: "rental_registration_4ho",
      proviso4hoBusinessRegDate: "2019-12-17",
      proviso4hoRentalRegDate: "2019-12-17",
      proviso4hoRegulatedOneHouse: "yes",
      proviso4hoStatus: "maintained",
      proviso4hoDuringMandatory: "no",
      proviso4hoRentOver5: "no",
    },
  });
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; warnings?: string[] } } }).data.result;
  expect(result.isExempt).toBe(false);
  expect((result.warnings ?? []).filter((w) => RENTAL_4HO_TEXT.test(w))).toHaveLength(1);
  await expect(page.getByText(RENTAL_4HO_TEXT)).toHaveCount(1);
});
