/**
 * D-40 anchor — §89② 단서 §156의2③·④(§156의3②·③)는 「1주택을 가진 세대가 그 주택을 양도하기 전에 권리를 취득함으로써」의 모양만 받는다.
 *
 * 종전에는 `rightTimingCore`가 권리와 양도 주택의 취득 선후를 보지 않아, 권리를 먼저 산 세대도 1년 면제 사유(§154①3호 등)가 있거나
 * 3년 경과 예외를 선언하면 비과세였다. 서면-2021-법규재산-8011(법규과-1632)은 그 모양을 「국내에 1주택을 소유한 1세대가 조합원입주권을
 * 취득한 경우에 해당하지 않으므로」 적용하지 않았다. 같은 날 취득은 선후를 알 수 없어 불성립 + 확인 필요다(결정 #43 형제 규칙).
 *
 * | # | 사실 | 기대 |
 * |---|---|---|
 * | O-1 | 입주권 2021-03-15 → 양도 주택 2021-06-15 → 2024-06-14 양도 + ④ 신축주택 선언 | 과세 · 3년 경과 미선언 고지 없음 |
 * | O-2 | (대조) 양도 주택 2020-03-15 → 입주권 2021-06-15 → 같은 양도·선언 | 비과세(§156의2④) |
 * | O-3 | 같은 날(2021-06-15) 취득 | 과세 + 확인 필요 |
 * | O-4 | 분양권 2021-03-15 → 양도 주택 2021-06-15 → 2024-06-14 양도 + ④ 선언 | 과세 · (대조) 주택 2020-03-15 → 분양권 2021-06-15 비과세 |
 * | V-* | ⑤ 「3년 경과 예외」 카드 | 권리가 먼저(또는 같은 날)면 열지 않는다 · 주택이 먼저면 연다 |
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import { rightThreeYearExceptionVisible } from "@/lib/calc/right-three-year-exception-scope";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

const NEW_HOUSE_DECL = {
  rightThreeYearExceptionKind: "new_house",
  rightNewHouseCompletionDate: "2023-01-02",
  rightMovedInWithin3Years: true,
  rightResidedOneYearOrMore: true,
};

function menu(o: { houseAcq: string; rightAcq: string; type?: "redevelopment_right" | "presale_right"; decl?: boolean }): RulingCase {
  return {
    id: "d40", docNo: "-", docDate: "-", basis: "current", today: "2024-06-14", summary: "d40", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2024-06-14",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: o.houseAcq, residenceInputMode: "direct", residencePeriodMonthsAsset: "36" },
      presaleRights: [
        {
          id: "r",
          type: o.type ?? "redevelopment_right",
          acquisitionDate: o.rightAcq,
          region: "non_capital",
          ...(o.type === "presale_right" ? {} : { memberOrigin: "successor" }),
        },
      ],
      ...(o.decl === false ? {} : NEW_HOUSE_DECL),
    } as RulingCase["form"],
  };
}

describe("D-40 판정 메뉴 — 권리·양도 주택 취득 선후", () => {
  it("O-1 입주권을 먼저 산 세대 — ④ 선언이 있어도 과세 · 3년 경과 미선언 고지를 내지 않는다", async () => {
    const o = await observeCase(menu({ houseAcq: "2021-06-15", rightAcq: "2021-03-15" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    const undeclared = await observeCase(menu({ houseAcq: "2021-06-15", rightAcq: "2021-03-15", decl: false }));
    expect(undeclared.isExempt).toBe(false);
    expect(undeclared.undetermined.filter((id) => id.includes("three-year"))).toEqual([]);
  });

  it("O-2 대조 — 양도 주택을 먼저 산 세대는 같은 선언으로 비과세(§156의2④)", async () => {
    const o = await observeCase(menu({ houseAcq: "2020-03-15", rightAcq: "2021-06-15" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
  });

  it("O-3 같은 날 취득 — 선후를 알 수 없어 과세 + 확인 필요", async () => {
    const o = await observeCase(menu({ houseAcq: "2021-06-15", rightAcq: "2021-06-15" }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined.some((id) => id.startsWith("89-2-confirm:"))).toBe(true);
  });

  it("O-4 분양권을 먼저 산 세대도 같다(§156의3②·③)", async () => {
    const o = await observeCase(menu({ houseAcq: "2021-06-15", rightAcq: "2021-03-15", type: "presale_right" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    const ctl = await observeCase(menu({ houseAcq: "2020-03-15", rightAcq: "2021-06-15", type: "presale_right" }));
    expect(ctl.isExempt).toBe(true);
  });
});

describe("D-40 ⑤ 「3년 경과 예외」 카드 — 엔진과 같은 선후 술어", () => {
  const form = (houseAcq: string, rightAcq: string) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-06-14";
    f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: houseAcq };
    f.presaleRights = [{ id: "r", type: "redevelopment_right", acquisitionDate: rightAcq, region: "non_capital", memberOrigin: "successor" } as never];
    return f;
  };
  it("V-1 권리가 먼저·같은 날이면 열지 않는다 · 주택이 먼저면 연다", () => {
    expect(rightThreeYearExceptionVisible(form("2021-06-15", "2021-03-15"))).toBe(false);
    expect(rightThreeYearExceptionVisible(form("2021-06-15", "2021-06-15"))).toBe(false);
    expect(rightThreeYearExceptionVisible(form("2020-03-15", "2021-03-15"))).toBe(true);
  });
});
