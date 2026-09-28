/**
 * anchor — OH-38 삭제된 소득세법 시행령 §154①4호(임대사업자 등록 주택 거주기간 제한 면제) 경과조치
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.5 · §9.7 L-3 · §9.2 I-2·I-3.
 * 원문(DRF eflaw 2026-09-28): 종전 §154① 단서(MST 212809) 「제4호 및 제5호에 해당하는 경우에는 거주기간의
 * 제한을 받지 아니한다」 · 부칙<제30395호> 제38조①② · 부칙<제29523호> 제6조.
 * 국세청: 법규과-1810(자동말소 5% 불문) · 법령해석과-779·법규과-1427(자진말소) · 법규과-824(멸실 말소) ·
 * 사전-2025-법규재산-0117(분양권 상태 등록) · 사전-2024-법규재산-0747(증여 포괄승계 후 별도세대 부적용).
 *
 * 금액: mock 세율. 1주택 · 양도가 9억(12억 이하) → 요건 충족이면 전액 비과세.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { Rental4hoRegistrationFacts } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const RULES = mockRates.get("transfer:special:one_house_exemption")!
  .specialRules as unknown as OneHouseSpecialRulesData;
const d = (s: string) => new Date(s);

/** 리뷰 OH-38 실패 시나리오의 사실 — 2018-06-01 사업자·임대사업자 등록, 임대의무 준수, 5% 이내 */
const COMPLIANT: Rental4hoRegistrationFacts = {
  businessRegistrationApplicationDate: d("2018-06-01"),
  rentalRegistrationApplicationDate: d("2018-06-01"),
  regulatedOneHouseAtApplication: true,
  statusAtTransfer: "maintained",
  transferredDuringMandatoryPeriod: false,
  rentIncreaseOver5Percent: false,
};

/** 서울(조정) 다세대 1주택 2018-03-01 취득 · 거주 0 · 2026-07-01 양도 · 9억 */
function scenario(
  facts: Rental4hoRegistrationFacts | null,
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 900_000_000,
    acquisitionDate: d("2018-03-01"),
    transferDate: d("2026-07-01"),
    residencePeriodMonths: 0,
    wasRegulatedAtAcquisition: true,
    isRegulatedArea: true,
    ...(facts
      ? {
          oneHouseExemptionProviso: {
            reason: "rental_registration_4ho",
            rentalRegistration4ho: facts,
          },
        }
      : {}),
    ...over,
  });
}
const calc = (i: TransferTaxInput) => calculateTransferTax(i, mockRates);
const judge = (i: TransferTaxInput) => judgeOneHouseExemptionFromInput(i as OneHouseJudgeInput, RULES);
const NOTICE = "154-1-4ho-rental-registration-unverified";
const UNMET = "154-1-4ho-rental-registration";

describe("OH-38 리뷰 시나리오 — 종전 4호로 거주기간 제한 면제", () => {
  it("★ 4호 사실 입력 → 비과세, 근거는 종전 4호 + 부칙<제30395호> 제38조②", () => {
    const i = scenario(COMPLIANT);
    const r = calc(i);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    const j = judge(i);
    expect(j.isExempt).toBe(true);
    const applied = j.appliedExceptions.find((e) => e.id === "154-1-proviso:rental_registration_4ho");
    expect(applied?.legalBasis).toBe(
      "소득세법 시행령 §154 ① 4호(2020.2.11. 삭제 전) · 대통령령 제30395호 부칙 제38조 ②",
    );
    expect(j.undetermined.map((u) => u.id)).not.toContain(NOTICE);
  });
  it("대조군 — 사유 미선택이면 과세(거주 2년 미충족) + 판정 보류 고지", () => {
    const i = scenario(null);
    expect(calc(i).isExempt).toBe(false);
    expect(judge(i).undetermined.map((u) => u.id)).toContain(NOTICE);
  });
});

describe("신청일 경계 — 2019-12-16 이전 신청(부칙 제38조②)", () => {
  it.each([
    ["rentalRegistrationApplicationDate", "2019-12-16", true],
    ["rentalRegistrationApplicationDate", "2019-12-17", false],
    ["businessRegistrationApplicationDate", "2019-12-16", true],
    ["businessRegistrationApplicationDate", "2019-12-17", false],
  ] as const)("%s %s → 비과세 %s", (field, date, exempt) => {
    const i = scenario({ ...COMPLIANT, [field]: d(date) });
    expect(calc(i).isExempt).toBe(exempt);
    const j = judge(i);
    if (!exempt) {
      const u = j.unmetExceptions.find((x) => x.id === UNMET);
      expect(u?.reasons.join(" ")).toContain("2019년 12월 16일 뒤");
      expect(calc(i).warnings?.join("\n")).toContain("2019년 12월 16일 뒤");
    }
  });
});

describe("양도일 경계 — 2020-02-11 시행(부칙 제38조① vs ②)", () => {
  // 2017-09-01 조정 취득 · 신청 2019-12-20(기한 후) · 거주 0
  const late = (t: string) =>
    scenario(
      {
        ...COMPLIANT,
        businessRegistrationApplicationDate: d("2019-12-20"),
        rentalRegistrationApplicationDate: d("2019-12-20"),
      },
      { acquisitionDate: d("2017-09-01"), transferDate: d(t) },
    );
  it("2020-02-10 양도 → 부칙 제38조①(종전 규정 그대로) → 비과세", () => {
    const i = late("2020-02-10");
    expect(calc(i).isExempt).toBe(true);
    expect(judge(i).appliedExceptions.find((e) => e.id === "154-1-proviso:rental_registration_4ho")?.legalBasis)
      .toContain("부칙 제38조 ①");
  });
  it("2020-02-11 양도 → 부칙 제38조② 신청 기한 미충족 → 과세", () => {
    expect(calc(late("2020-02-11")).isExempt).toBe(false);
  });
  it("2020-02-10 양도에는 신청 당시 1주택 선언을 묻지 않는다(②에만 있는 요건)", () => {
    const i = scenario(
      { ...COMPLIANT, regulatedOneHouseAtApplication: undefined },
      { acquisitionDate: d("2017-09-01"), transferDate: d("2020-02-10") },
    );
    expect(calc(i).isExempt).toBe(true);
  });
});

describe("5% 단서 — 2019-02-12 이후 체결·갱신 계약분부터(부칙<제29523호> 제6조)", () => {
  const over5 = (c: string) =>
    scenario({ ...COMPLIANT, rentIncreaseOver5Percent: true, rentIncreaseContractDate: d(c) });
  it("2019-02-11 계약 5% 초과 → 단서 미적용 → 비과세", () => {
    expect(calc(over5("2019-02-11")).isExempt).toBe(true);
  });
  it("2019-02-12 계약 5% 초과 → 제외 → 과세", () => {
    const i = over5("2019-02-12");
    expect(calc(i).isExempt).toBe(false);
    expect(judge(i).unmetExceptions.find((x) => x.id === UNMET)?.reasons.join(" ")).toContain("연 5%를 초과");
  });
});

describe("분양권 상태 등록(사전-2025-법규재산-0117) — 취득일이 2019-12-16 뒤여도 신청일로 본다", () => {
  const presale = (acq: string, t: string, facts: Rental4hoRegistrationFacts | null = {
    ...COMPLIANT,
    businessRegistrationApplicationDate: d("2018-08-01"),
    rentalRegistrationApplicationDate: d("2018-08-01"),
  }) => scenario(facts, { acquisitionDate: d(acq), transferDate: d(t) });
  it("★ 2021-01-15 준공 취득 · 2018-08-01 분양권 상태 신청 · 2025-02-01 양도 → 비과세", () => {
    expect(calc(presale("2021-01-15", "2025-02-01")).isExempt).toBe(true);
  });
  it("I-3 — 사유를 고르지 않았으면 취득일이 2019-12-17 이후여도 고지한다(종전 게이트는 놓쳤다)", () => {
    expect(judge(presale("2021-01-15", "2025-02-01", null)).undetermined.map((u) => u.id)).toContain(NOTICE);
  });
  it("보유 2년은 그대로 — 2025-03-01 취득 · 2026-07-01 양도(1년 4개월) → 과세", () => {
    const i = presale("2025-03-01", "2026-07-01");
    expect(calc(i).isExempt).toBe(false);
    // 4호는 성립했다(거주만 면제) — 과세 원인은 보유기간이므로 「적용되지 않은 특례」로 적지 않는다.
    expect(judge(i).unmetExceptions.map((x) => x.id)).not.toContain(UNMET);
  });
});

describe("말소 후에는 단서(임대의무기간·5%)를 따지지 않는다", () => {
  it.each(["auto_cancelled", "voluntary_cancelled", "demolition_cancelled"] as const)(
    "%s + 임대의무기간 중 양도 + 5%% 초과(2020 계약) → 비과세",
    (status) => {
      const i = scenario({
        ...COMPLIANT,
        statusAtTransfer: status,
        transferredDuringMandatoryPeriod: true,
        rentIncreaseOver5Percent: true,
        rentIncreaseContractDate: d("2020-05-01"),
      });
      expect(calc(i).isExempt).toBe(true);
    },
  );
  it("유지 + 임대의무기간 중 양도 → 제외 → 과세", () => {
    const i = scenario({ ...COMPLIANT, transferredDuringMandatoryPeriod: true });
    expect(calc(i).isExempt).toBe(false);
    expect(judge(i).unmetExceptions.find((x) => x.id === UNMET)?.reasons.join(" ")).toContain("임대의무기간");
  });
});

describe("선언·승계 요건(부칙 제38조② · 사전-2024-법규재산-0747)", () => {
  it("신청 당시 조정대상지역 1주택이 아니었다 → 과세", () => {
    expect(calc(scenario({ ...COMPLIANT, regulatedOneHouseAtApplication: false })).isExempt).toBe(false);
  });
  it("증여 포괄승계 후 증여자와 별도 세대 → 과세", () => {
    expect(calc(scenario({ ...COMPLIANT, giftSuccessionSeparatedHousehold: true })).isExempt).toBe(false);
  });
});

describe("미입력 → 판정 보류(면제로 추정하지 않는다)", () => {
  it.each([
    "statusAtTransfer",
    "regulatedOneHouseAtApplication",
    "transferredDuringMandatoryPeriod",
    "rentalRegistrationApplicationDate",
  ] as const)("%s 미입력 → 과세 + 보류 고지", (field) => {
    const i = scenario({ ...COMPLIANT, [field]: undefined });
    expect(calc(i).isExempt).toBe(false);
    const j = judge(i);
    expect(j.undetermined.map((u) => u.id)).toContain(NOTICE);
    expect(j.unmetExceptions.map((x) => x.id)).not.toContain(UNMET);
  });
  it("5% 초과인데 계약일 미입력 → 보류", () => {
    const i = scenario({ ...COMPLIANT, rentIncreaseOver5Percent: true });
    expect(calc(i).isExempt).toBe(false);
    expect(judge(i).undetermined.map((u) => u.id)).toContain(NOTICE);
  });
  it("그 밖의 말소 → 보류(직접 선례 미확보)", () => {
    const i = scenario({ ...COMPLIANT, statusAtTransfer: "other" });
    expect(calc(i).isExempt).toBe(false);
    expect(calc(i).warnings?.join("\n")).toContain("직접 선례를 확보하지 못했습니다");
  });
});
