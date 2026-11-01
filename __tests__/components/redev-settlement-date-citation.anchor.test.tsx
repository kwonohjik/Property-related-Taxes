/**
 * 재개발 청산금 양도시기 — 화면 근거 인용 anchor (`docs/02-design/features/redev-transfer-date-citation.plan.md`).
 *
 * 근거 원문:
 *   · 사전-2022-법규재산-1282 — 「도시 및 주거환경정비법」제86조 및 「소득세법 시행령」제162조제1항제9호 **단서**
 *   · 양도소득세 집행기준 98-162-14 — 소유권 이전고시가 있은 날의 다음 날
 *   · 소득세법 §95④는 보유기간 조항이라 양도일의 근거가 아니다.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReceiveOnlyToggleCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { SettlementAnnouncementDateField } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const DECREE = "소득세법 시행령 §162①9호 단서";
const GUIDELINE = "양도소득세 집행기준 98-162-14";
const ERROR_BASIS = `(${DECREE} · ${GUIDELINE})`;

const asset = (patch: Partial<AssetForm>) => patch as AssetForm;
const textOf = (ui: React.ReactElement) => render(ui).container.textContent ?? "";

const noDateAsset = (patch: Partial<AssetForm>) =>
  asset({
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    redevSettlementSaleDate: "",
    redevSettlementAmount: "100000000",
    redevApprovalDate: "2020-01-01",
    redevRightsValue: "500000000",
    acquisitionDate: "2015-01-01",
    ...patch,
  } as Partial<AssetForm>);

describe("청산금 양도시기 근거 문구", () => {
  it("고시일 힌트 — 도시정비법 §86②·시행령 단서·집행기준 번호·해석례를 모두 적는다", () => {
    const text = textOf(
      <SettlementAnnouncementDateField asset={asset({ redevSettlementSaleDate: "" })} onChange={() => {}} />,
    );
    expect(text).toContain(
      `도시 및 주거환경정비법 §86② 소유권이전 고시일을 입력합니다. 양도일은 그 다음날로 자동 산정됩니다 (${DECREE} · ${GUIDELINE} · 사전-2022-법규재산-1282).`,
    );
    expect(text).not.toContain("NTS 집행기준");
  });

  it("단독 신고 카드 — 집행기준 번호를 적는다", () => {
    const text = textOf(
      <ReceiveOnlyToggleCard asset={asset({ redevReceiveOnlyMode: "yes" })} onChange={() => {}} />,
    );
    expect(text).toContain(`양도일은 소유권이전 고시일의 익일로 입력하세요 (${GUIDELINE}).`);
  });

  it.each([
    ["토지 출자", "land"],
    ["주택 출자", "housing"],
  ])("검증 오류(%s) — 양도일 근거로 §95④를 들지 않는다", (_name, redevOriginalAssetType) => {
    const issue = validateRedevelopmentAsset(
      noDateAsset({ redevOriginalAssetType } as Partial<AssetForm>),
      "자산 1",
    );
    expect(issue).toBe(`자산 1: 청산금 수령 시 소유권이전 고시일의 다음날을 입력하세요. ${ERROR_BASIS}`);
  });
});
