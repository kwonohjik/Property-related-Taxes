/**
 * 결정 #47 — 「양도일 현재도 배우자 쪽이 보유하나요」 질문이 **열리는** 폼을 시드한다.
 *
 * 질문은 혼인합가일만으로 열리지 않는다(`spouseHoldingQuestionApplies`): 혼인 5년 안 양도 · 혼인 뒤 새 취득 없음 ·
 * 주택+권리 3 이상 · 중과가 걸리는 양도(조정대상지역, 한시배제 밖). 양도 주택 2019-01-01 취득 · 혼인 2024-03-01 ·
 * 양도 2026-06-15(한시배제 종료 후) · 조정대상지역(사용자가 만진 값으로 시드해 자동 판별이 덮어쓰지 않게 한다).
 */
import type { Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./transfer-seed";

export async function gotoSpouseHoldingOpenForm(
  page: Page,
  opts: { houseCount: 1 | 2; presaleRights?: Record<string, unknown>[] } = { houseCount: 2 },
) {
  const rows = [1, 2].slice(0, opts.houseCount).map((n) =>
    otherHouse(`h${n}`, "2018-01-01", { region: "capital", mergeOrigin: "counterpart_side" }),
  );
  const rights = opts.presaleRights ?? [];
  await gotoTransferHoldingsStep(page, {
    houses: rows,
    assetOver: { acquisitionDate: "2019-01-01", addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100" },
    formOver: {
      transferDate: "2026-06-15",
      marriageDate: "2024-03-01",
      isRegulatedArea: true,
      isRegulatedAreaTouched: true,
      wasRegulatedAtAcquisition: false,
      wasRegulatedAtAcquisitionTouched: true,
      householdHousingCount: String(1 + rows.length),
      presaleRights: rights,
      householdNoPresaleRightsConfirmed: rights.length === 0,
    },
  });
}
