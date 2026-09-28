/**
 * anchor — OH-22(I-1) 「소득세법 시행령」 §154⑤ 단서: 다주택 처분 후 **최종 1주택** 보유기간 재기산
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.4 · §9.7 L-2.
 *
 * | 양도일 | 규칙 | 근거 |
 * |---|---|---|
 * | 2021-01-01~2021-02-16 | 다른 주택을 모두 **양도**한 날부터 기산 (§155·§155의2·§156의2 일시적 2주택 제외) | MST 207800 §154⑤ · 대통령령 제29523호 부칙 제1조3호·제2조② |
 * | 2021-02-17~2022-05-09 | 「처분」 = 양도·증여·용도변경 (증여·용도변경은 **2021-02-17 이후 행위분**), 제외에 §156의3 추가 | MST 229391 §154⑤ · 대통령령 제31442호 부칙 제9조 |
 * | 2022-05-10~ | 단서 삭제 | 대통령령 제32654호 부칙 제2조①② |
 *
 * 해석(taxlaw.nts 원문 실독, 2026-09-28):
 * - 기획재정부 재산세제과-1132(2020.12.24.) — 2021.1.1. 현재 1주택(그 전에 다른 주택 처분 완료)이면 **취득일** 기산
 * - 기획재정부 재산세제과-1058(2020.12.4.) — 최종 1주택이 된 날부터 **보유·거주 모두** 새로 기산(판례 아님)
 * - 사전-2021-법규재산-0957(법규과-1604, 2022.5.24.) — 2020.12.31. 이전 처분 + 그 뒤 취득 주택 멸실 → 취득일 기산(멸실은 처분이 아니다)
 * - 기획재정부 재산세제과-678(2023.5.10.) — 일시적 2주택 허용기간 안에 신규주택을 먼저 과세 양도 → 종전주택 **취득일**
 *
 * 🔑 이 구간의 재기산은 **언제나 과세로 이어진다** — 재기산일 ≥ 2021-01-01, 양도일 ≤ 2022-05-09라
 *    재기산 후 보유기간은 최장 1년 4개월 9일로 §154① 보유 2년에 못 미친다. 결론을 뒤집는 것은
 *    보유기간 제한을 면제하는 §154① 단서 1~3호뿐이다(그 경우 거주도 면제).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import {
  meetsOneHouseResidenceRequirement,
  resolveExemptionHoldingStartDate,
  resolveExemptionResidenceMonths,
} from "@/lib/tax-engine/transfer-tax-exemption";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const RULES = mockRates.get("transfer:special:one_house_exemption")!
  .specialRules as unknown as OneHouseSpecialRulesData;
const d = (s: string) => new Date(s);
const judge = (i: TransferTaxInput) => judgeOneHouseExemptionFromInput(i as OneHouseJudgeInput, RULES);
const ids = (i: TransferTaxInput) => judge(i).undetermined.map((u) => u.id);
const exempt = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).isExempt;
const warn = (i: TransferTaxInput) => (calculateTransferTax(i, mockRates).warnings ?? []).join("\n");
const UNVERIFIED = "154-5-final-one-house-restart-unverified";

type Kind = "transfer" | "gift" | "conversion" | "other";
const disposal = (kind: Kind, date: string, temporaryTwoHouseSpecial = false) => ({
  kind,
  date: d(date),
  temporaryTwoHouseSpecial,
});
/** 2015-03-01 취득 · 비조정 · 5억 1주택 — 재기산이 없으면 비과세 */
const house = (transferDate: string, disposals?: ReturnType<typeof disposal>[], over: Partial<TransferTaxInput> = {}) =>
  baseTransferInput({
    acquisitionDate: d("2015-03-01"),
    transferDate: d(transferDate),
    ...(disposals
      ? { finalOneHouseRestart: { hadOtherHouseDisposal: disposals.length > 0, disposals } }
      : {}),
    ...over,
  } as Partial<TransferTaxInput>);

describe("OH-22 ① 2021-01-01 기준 — 그 전에 처분을 끝낸 세대는 재기산 없음 (재산세제과-1132)", () => {
  it("★ 다른 주택 양도 2020-12-31 → 취득일 기산 · 비과세 · 판정 보류 고지 없음", () => {
    const i = house("2021-11-10", [disposal("transfer", "2020-12-31")]);
    expect(exempt(i)).toBe(true);
    expect(ids(i)).not.toContain(UNVERIFIED);
    expect(resolveExemptionHoldingStartDate(i).toISOString().slice(0, 10)).toBe("2015-03-01");
  });
  it("★ 쌍둥이 — 다른 주택 양도 2021-01-01 → 그날부터 재기산 · 보유 2년 미달 과세", () => {
    const i = house("2021-11-10", [disposal("transfer", "2021-01-01")]);
    expect(resolveExemptionHoldingStartDate(i).toISOString().slice(0, 10)).toBe("2021-01-01");
    expect(exempt(i)).toBe(false);
    expect(ids(i)).not.toContain(UNVERIFIED);
    expect(warn(i)).toContain("2021-01-01부터");
    // 재기산일 + 2년(2023-01-01)에 양도하면 단서가 삭제돼 재기산이 없다 — 「보유 충족 예정일」 약속을 내지 않는다.
    expect(judge(i).pending.map((p) => p.id)).not.toContain("154-1-holding-years");
  });
  it("대조 — 재기산 없이 보유 2년 미달이면 보유 충족 예정일을 낸다(형제 축 보존)", () => {
    const i = house("2021-11-10", [disposal("transfer", "2020-12-31")], { acquisitionDate: d("2020-06-01") });
    expect(judge(i).pending.map((p) => p.id)).toContain("154-1-holding-years");
  });
  it("여러 채를 처분했으면 마지막 처분일 — 1주택이 된 날", () => {
    const i = house("2022-03-01", [disposal("transfer", "2021-03-01"), disposal("transfer", "2021-09-01")]);
    expect(resolveExemptionHoldingStartDate(i).toISOString().slice(0, 10)).toBe("2021-09-01");
    expect(judge(i).finalOneHouseRestart?.restartDate?.toISOString().slice(0, 10)).toBe("2021-09-01");
  });
});

describe("OH-22 ② 증여·용도변경은 2021-02-17 이후 행위분만 「처분」 (제31442호 부칙 제9조)", () => {
  it("★ 증여 2021-02-16 → 처분 아님 · 비과세", () => {
    expect(exempt(house("2022-03-01", [disposal("gift", "2021-02-16")]))).toBe(true);
  });
  it("★ 쌍둥이 — 증여 2021-02-17 → 재기산 · 과세", () => {
    expect(exempt(house("2022-03-01", [disposal("gift", "2021-02-17")]))).toBe(false);
  });
  it("용도변경 2021-02-16 비과세 / 2021-02-17 과세", () => {
    expect(exempt(house("2022-03-01", [disposal("conversion", "2021-02-16")]))).toBe(true);
    expect(exempt(house("2022-03-01", [disposal("conversion", "2021-02-17")]))).toBe(false);
  });
  it("2021-02-16 이전 양도분(제29523호 문언 「모두 양도」) — 증여는 처분이 아니고 양도만 재기산", () => {
    expect(exempt(house("2021-02-10", [disposal("gift", "2021-01-20")]))).toBe(true);
    expect(exempt(house("2021-02-10", [disposal("transfer", "2021-01-20")]))).toBe(false);
  });
});

describe("OH-22 ③ 양도일 구간 — 2022-05-10 이후 양도는 단서 삭제 (제32654호 부칙 제2조)", () => {
  it("★ 양도 2022-05-09 → 재기산 과세 / 2022-05-10 → 취득일 기산 비과세 · 고지·안내 없음", () => {
    const facts = [disposal("transfer", "2021-06-01")];
    expect(exempt(house("2022-05-09", facts))).toBe(false);
    const after = house("2022-05-10", facts);
    expect(exempt(after)).toBe(true);
    expect(judge(after).finalOneHouseRestart).toBeUndefined();
    expect(warn(after)).not.toContain("다시 셉니다");
  });
  it("양도 2020-12-31은 구간 밖(시행 전) — 사실이 있어도 재기산 없음", () => {
    const i = house("2020-12-31", [disposal("transfer", "2020-06-01")]);
    expect(exempt(i)).toBe(true);
    expect(judge(i).finalOneHouseRestart).toBeUndefined();
  });
});

describe("OH-22 ④ 처분이 아니거나 괄호로 제외되는 경우", () => {
  it("★ 처분 당시 일시적 2주택 관계(§155 등 괄호 — 재산세제과-678) → 제외 · 비과세", () => {
    expect(exempt(house("2022-03-01", [disposal("transfer", "2021-06-01", true)]))).toBe(true);
  });
  it("쌍둥이 — 같은 날짜·일시적 2주택 아님 → 재기산 과세", () => {
    expect(exempt(house("2022-03-01", [disposal("transfer", "2021-06-01", false)]))).toBe(false);
  });
  it("멸실 등(양도·증여·용도변경 외) → 처분 아님 · 비과세", () => {
    expect(exempt(house("2022-03-01", [disposal("other", "2021-06-01")]))).toBe(true);
  });
  it("「처분한 적 없음」 → 재기산 없음 · 판정 보류 고지 없음", () => {
    const i = house("2022-03-01", []);
    expect(exempt(i)).toBe(true);
    expect(ids(i)).not.toContain(UNVERIFIED);
  });
  it("미답(사실 없음) → 종전과 같이 비과세 + 판정 보류 고지", () => {
    const i = house("2022-03-01");
    expect(exempt(i)).toBe(true);
    expect(ids(i)).toContain(UNVERIFIED);
  });
  it("처분일이 이 주택 취득일 이전이면 재기산일이 되지 않는다(1주택이 된 뒤에 취득)", () => {
    const i = house("2023-03-01", [disposal("transfer", "2021-02-01")], { acquisitionDate: d("2021-03-01") });
    // 구간 밖 양도라 영향 없음 — 구간 안에서는 취득 후 2년이 안 돼 어차피 과세라 결론 축으로 볼 수 없다.
    expect(resolveExemptionHoldingStartDate(i).toISOString().slice(0, 10)).toBe("2021-03-01");
    const inEra = house("2022-05-01", [disposal("transfer", "2021-02-01")], { acquisitionDate: d("2021-03-01") });
    expect(resolveExemptionHoldingStartDate(inEra).toISOString().slice(0, 10)).toBe("2021-03-01");
    expect(judge(inEra).finalOneHouseRestart?.applied).toBe(false);
  });
});

describe("OH-22 ⑤ 거주기간도 재기산 (재산세제과-1058) — §154① 거주요건에만, 표2 거주 개월은 불변", () => {
  // 2017-08-03 이후(거주요건 경과규정 밖) 조정대상지역 취득 · 실거주 40개월
  const regulated = (disposals?: ReturnType<typeof disposal>[]) =>
    house("2022-03-01", disposals, {
      acquisitionDate: d("2018-01-01"),
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 40,
    });
  it("★ 재기산이 있으면 §154① 거주요건 미충족(재기산일 이후 최장 14개월)", () => {
    const rule = RULES.one_house_exemption;
    expect(meetsOneHouseResidenceRequirement(regulated([]), rule)).toBe(true);
    expect(meetsOneHouseResidenceRequirement(regulated([disposal("transfer", "2021-01-10")]), rule)).toBe(false);
  });
  it("표2 거주 개월(§95② — 취득일부터, 서면-2022-부동산-1386)은 그대로 40", () => {
    expect(resolveExemptionResidenceMonths(regulated([disposal("transfer", "2021-01-10")]))).toBe(40);
  });
});

describe("OH-22 ⑥ §154① 단서 1~3호는 보유기간 제한 자체를 면제한다 — 재기산이 결론을 바꾸지 못한다", () => {
  it("해외이주(2호 나목) 출국 2021-10-01 · 양도 2022-03-01 → 재기산이 있어도 비과세", () => {
    const i = house("2022-03-01", [disposal("transfer", "2021-06-01")], {
      oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: d("2021-10-01") },
    });
    expect(exempt(i)).toBe(true);
  });
});
