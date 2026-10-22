/**
 * anchor(⑤⑧ 술어) — 계산기 양도 주택의 양도 당시 기준시가(계획서 `calc-selling-house-std-price-value-region.plan.md` §5.1·§5.3 · SP-1·SP-2).
 *
 * - SP-1 노출 = 주택 양도 ∧ 2018-04-01 이후 ∧ 양도일 현재 조정대상지역(주소 판정) / 필수 = 그중 가액기준
 * - SP-2 ⑧ — 가액기준·조정이면 비움을 막는다(앵커 `standardPriceAtTransfer`, PHD는 그 카드 칸) · 그 밖은 통과 · 다건도 건별로 막는다
 * - SP-2b ④ 양도 주택 행 값 — PHD·상속 주택 3시점 칸을 같은 사실로 읽는다
 * - V-5 판정 메뉴 M1 값이 넘기기로 계산기에 도착한다
 */
import { describe, it, expect } from "vitest";
import {
  sellingHouseStdPriceAtTransfer,
  sellingStdPriceInScope,
  sellingStdPriceIssue,
  sellingStdPriceRequired,
} from "@/lib/calc/selling-std-price-scope";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { notReadyPropertiesMessage } from "@/lib/calc/multi-transfer-tax-validate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

const JEONJU = "4511110100"; // 전주 완산구 — 가액기준 · 2020-12-18~2022-09-26 조정대상지역
const GANGNAM = "1168010100"; // 지역기준 · 조정대상지역
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", regionCode: JEONJU, addressJibun: "전북 전주시 완산구 중앙동1가 1", ...over }) as AssetForm;

describe("SP-1 노출·필수 격자", () => {
  const cases: [string, Partial<AssetForm>, string, boolean, boolean][] = [
    ["가액기준 · 조정", {}, "2021-06-01", true, true],
    ["가액기준 · 비조정(해제 뒤)", {}, "2023-06-01", false, false],
    ["가액기준 · 지정 전", {}, "2020-06-01", false, false],
    ["지역기준 · 조정 — 선택 입력", { regionCode: GANGNAM }, "2021-06-01", true, false],
    ["2018-04-01 전 — §104⑦ 시행 전", { regionCode: GANGNAM }, "2018-03-31", false, false],
    ["2018-04-01 당일", { regionCode: GANGNAM }, "2018-04-01", true, false],
    ["주소 없음 — 열지 않는다", { regionCode: "" }, "2021-06-01", false, false],
    ["입주권 양도", { assetKind: "right_to_move_in" }, "2021-06-01", false, false],
    ["완공 재개발 아파트", { assetKind: "redevelopment_apt" }, "2021-06-01", true, true],
    ["겸용 — 범위 밖(V-3)", { isMixedUseHouse: true } as Partial<AssetForm>, "2021-06-01", false, false],
    ["부담부증여 시가 모드 — 범위 밖", { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market" } as Partial<AssetForm>, "2021-06-01", false, false],
  ];
  it.each(cases)("%s", (_l, over, date, shown, required) => {
    expect([sellingStdPriceInScope(asset(over), date), sellingStdPriceRequired(asset(over), date)]).toEqual([shown, required]);
  });
});

function form(a: AssetForm, transferDate = "2021-06-01"): TransferFormData {
  return { ...createDefaultTransferFormData(), transferDate, contractTotalPrice: "1000000000", assets: [a] } as TransferFormData;
}
const stdIssues = (f: TransferFormData) => collectStepIssues(0, f).filter((i) => i.message.includes("양도 당시 기준시가(주택 공시가격)"));

describe("SP-2 ⑧", () => {
  it("가액기준·조정 + 비움 → 막는다 · 앵커 standardPriceAtTransfer", () => {
    const issues = stdIssues(form(asset()));
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("standardPriceAtTransfer");
    expect(issues[0].message).toContain("§167의3①1호");
  });
  it("값을 넣으면 통과 · 비조정·지역기준·2018 전은 비워도 통과", () => {
    expect(stdIssues(form(asset({ standardPriceAtTransfer: "400000000" })))).toEqual([]);
    expect(stdIssues(form(asset(), "2023-06-01"))).toEqual([]);
    expect(stdIssues(form(asset({ regionCode: GANGNAM })))).toEqual([]);
    expect(stdIssues(form(asset({ regionCode: GANGNAM }), "2018-03-31"))).toEqual([]);
  });
  it("PHD — 그 카드의 양도시 개별주택가격 칸이 앵커이고, 그 칸을 채우면 통과", () => {
    const phd = asset({ useEstimatedAcquisition: true, usePreHousingDisclosure: true });
    expect(sellingStdPriceIssue(phd, "2021-06-01")?.field).toBe("phdTransferHousingPrice");
    expect(sellingStdPriceIssue({ ...phd, phdTransferHousingPrice: "400000000" }, "2021-06-01")).toBeNull();
  });
  it("둘째 자산은 묻지 않는다 — ④는 첫 자산만 양도 주택 행으로 싣는다", () => {
    const f = { ...form(asset({ standardPriceAtTransfer: "400000000" })), assets: [asset({ standardPriceAtTransfer: "400000000" }), asset({ id: "a2" } as Partial<AssetForm>)] };
    expect(stdIssues(f as TransferFormData)).toEqual([]);
  });
  it("다건 — 건별 ⑧(자산 단계가 첫 차단)이 같은 메시지로 막는다", () => {
    const item = { id: "p1", propertyLabel: "전주 주택", form: form(asset()) } as unknown as PropertyItem;
    expect(notReadyPropertiesMessage([item]) ?? "").toContain("양도 당시 기준시가(주택 공시가격)");
  });
});

describe("SP-2b ④ 양도 주택 행 값", () => {
  it("일반 칸 · PHD 칸 · 상속 주택 3시점 칸", () => {
    expect(sellingHouseStdPriceAtTransfer(asset({ standardPriceAtTransfer: "400000000" }))).toBe(400_000_000);
    expect(
      sellingHouseStdPriceAtTransfer(
        asset({ useEstimatedAcquisition: true, usePreHousingDisclosure: true, phdTransferHousingPrice: "250000000", standardPriceAtTransfer: "999" }),
      ),
    ).toBe(250_000_000);
    expect(
      sellingHouseStdPriceAtTransfer(asset({ acquisitionCause: "inheritance", inhHouseValHousePriceAtTransfer: "350000000" } as Partial<AssetForm>)),
    ).toBe(350_000_000);
    expect(sellingHouseStdPriceAtTransfer(asset())).toBe(0);
  });
});

describe("V-5 판정 메뉴 → 계산기 넘기기", () => {
  it("M1에 넣은 양도 당시 기준시가가 계산기 첫 자산에 그대로 도착한다", () => {
    const judged = createInitialOneHouseJudgmentForm();
    const patch = toTransferFormPatch({
      ...judged,
      transferDate: "2021-06-01",
      assets: [{ ...judged.assets[0], assetKind: "housing", regionCode: JEONJU, standardPriceAtTransfer: "400000000" }],
    } as OneHouseJudgmentFormData);
    expect(patch.assets?.[0].standardPriceAtTransfer).toBe("400000000");
  });
});
