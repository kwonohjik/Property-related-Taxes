/**
 * anchor — #29(S04-6) · 「소득세법 시행령」 §155⑯ 지방이전 5년은 「3년」 기한에만 적용한다
 *
 * 결정 문서 #29 권고 A(+ 조건 + 하위 1 가). 원문으로 확인한 근거:
 *  - §155⑯ 「…제1항 중 "3년"을 "5년"으로 본다. 이 경우 … 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 아니한다」
 *    (MST 242735 시행본 실독). 치환 대상은 §155① 본문의 "3년"이다 — 조정→조정 단축 기한(2호 2년·가나목 1년·2026 개정 1호 2년)은 "3년"이 아니다.
 *  - 기획재정부 재산세제과-884(2021.10.12.) — 쟁점1(2018.9.13. 이전 계약) 5년 · 쟁점2(2018.9.14.~2019.12.16.) 2년 · 쟁점3(2019.12.17. 이후) 1년.
 *  - 서면-2022-부동산-2848[부동산납세과-707](2023.3.15.) — 「일시적 2주택 허용기간이 3년인 경우에는 … 5년으로 보는 것」.
 *  - 2012.6.29. 전 양도분은 ⑯이 당시 1년·2년 기한도 5년으로 바꿨다(결정 #29 조건) — 현행 5년 유지.
 *  - 하위 1 가) 제32654호 부칙 제3조는 2호 개정규정 적용 시기만 정하고 제29242호 부칙 제2조②(2018.9.13. 이전 취득·계약 → 종전 3년)를
 *    끊는 규정이 없다 — 정면 해석례는 없다(확인 필요).
 *
 * ⚠️ 프로덕션 seed 값으로 돈다. 기대값 중 세액은 실제 엔진 호출로 관측했다.
 */
import { describe, it, expect } from "vitest";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import {
  describePublicInstitutionRelocationEffects,
  relocationEffectsLabel,
  resolveTemporaryTwoHouseDeadline,
} from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";

const seedRules = transferTaxSeeds.find(
  (s) => s.category === "special" && s.sub_category === "one_house_exemption",
)!.special_rules as unknown as OneHouseSpecialRulesData;
const twoHouseRule = seedRules.temporary_two_house!;

function seedRates(): TaxRatesMap {
  const m = makeMockRatesWithHouseEngine();
  const k = "transfer:special:one_house_exemption" as TaxRateKey;
  const cur = m.get(k) as unknown as Record<string, unknown>;
  m.set(k, {
    ...cur,
    specialRules: { ...(cur.specialRules as Record<string, unknown>), temporary_two_house: twoHouseRule },
  } as never);
  return m;
}

const D = (s: string) => new Date(s);
type TT = NonNullable<TransferTaxInput["temporaryTwoHouse"]>;

/** 두 주택 모두 조정대상지역(선언) */
const BOTH: Partial<TT> = { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: true };
/** 신규 주택이 비조정(선언) → 한쪽만 조정 → 본문 3년 */
const NOT_BOTH: Partial<TT> = { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: false };
const RELOCATION: Partial<TT> = { publicInstitutionRelocation: true };

function deadlineOf(newAcq: string, transfer: string, extra: Partial<TT>) {
  return resolveTemporaryTwoHouseDeadline(
    {
      isRegulatedArea: false,
      transferDate: D(transfer),
      temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D(newAcq), ...extra },
    },
    twoHouseRule,
  );
}

describe("#29 처분기한 — ⑯ 5년은 「3년」일 때만, 조정→조정 단축 기한(2년·1년)은 덮지 않는다", () => {
  it("S1 재산세제과-884 쟁점2 — 2018.9.14.~2019.12.16. 취득·조정→조정은 ⑯이어도 2년 (종전 5년)", () => {
    const e = deadlineOf("2019-03-10", "2021-03-01", { ...BOTH, ...RELOCATION });
    expect(e.years).toBe(2);
    expect(e.relocationFiveYearApplied).toBe(false);
  });

  it("S1 긍정 짝 — 신규 주택이 비조정이면 같은 날짜에 ⑯ 5년이 그대로 적용된다", () => {
    const e = deadlineOf("2019-03-10", "2021-03-01", { ...NOT_BOTH, ...RELOCATION });
    expect(e.years).toBe(5);
    expect(e.relocationFiveYearApplied).toBe(true);
  });

  it("S2 쟁점1 — 2018.9.13. 이전 취득·조정→조정은 종전 3년이라 ⑯ 5년 (양도 2019-06-01)", () => {
    const e = deadlineOf("2018-09-13", "2019-06-01", { ...BOTH, ...RELOCATION });
    expect(e.years).toBe(5);
    expect(e.relocationFiveYearApplied).toBe(true);
  });

  it("S3 쟁점3 — 2019.12.17. 이후 취득·조정→조정은 1년 + 전입 요건(⑯ 5년이 덮지 않는다)", () => {
    const e = deadlineOf("2020-01-10", "2020-06-01", { ...BOTH, ...RELOCATION });
    expect(e.years).toBe(1);
    expect(e.relocationFiveYearApplied).toBe(false);
    // 전입일 미입력은 가목 불성립(모름 = 혜택 불성립) — 결론을 가를 때만 확인 필요를 고지한다(#30).
    expect(e.moveInRequirementPending).toBe(true);
    expect(e.moveInMet).toBe(false);
  });

  it("S4 2026 개정 1호(조정→조정 2년)도 같은 논리 — 신규 2026-08-10 · 양도 2026-10-15", () => {
    const shortened = deadlineOf("2026-08-10", "2026-10-15", { ...BOTH, ...RELOCATION });
    expect(shortened.years).toBe(2);
    expect(shortened.relocationFiveYearApplied).toBe(false);
    const notBoth = deadlineOf("2026-08-10", "2026-10-15", { ...NOT_BOTH, ...RELOCATION });
    expect(notBoth.years).toBe(5);
  });

  it("S5 2012.6.29. 전 양도분은 ⑯이 당시 2년 기한도 5년으로 바꿨다 — 현행 5년 유지(결정 #29 조건)", () => {
    // 연혁 leaf는 이 양도일에 2년이다.
    expect(
      resolveTemporaryTwoHouseDeadlineEra({
        bothRegulated: true,
        baseDeadlineYears: 3,
        newAcquisitionDate: D("2009-03-01"),
        transferDate: D("2010-06-01"),
      }).years,
    ).toBe(2);
    const e = deadlineOf("2009-03-01", "2010-06-01", { ...BOTH, ...RELOCATION });
    expect(e.years).toBe(5);
    expect(e.relocationFiveYearApplied).toBe(true);
  });

  it("S6 2023.1.12. 이후 양도분은 조정 구분이 없어 ⑯ 5년 (조정→조정 선언이어도)", () => {
    const e = deadlineOf("2022-03-10", "2023-02-01", { ...BOTH, ...RELOCATION });
    expect(e.years).toBe(5);
    expect(e.relocationFiveYearApplied).toBe(true);
  });
});

describe("#29 하위 1 가) — 2022.5.10.~2023.1.11. 양도도 2018.9.13. 이전 취득·계약은 종전 3년", () => {
  const leaf = (n: string, t: string, contract?: string) =>
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated: true,
      baseDeadlineYears: 3,
      newAcquisitionDate: D(n),
      ...(contract ? { newContractDate: D(contract) } : {}),
      transferDate: D(t),
    }).years;

  it("L1 계약 2018-09-13(취득 2020-03-01) → 3년 / 계약 2018-09-14 → 2년 (양도 2022-06-15)", () => {
    expect(leaf("2020-03-01", "2022-06-15", "2018-09-13")).toBe(3);
    expect(leaf("2020-03-01", "2022-06-15", "2018-09-14")).toBe(2);
  });

  it("L2 취득 2018-09-13 → 3년 / 2018-09-14 → 2년 (양도 2022-06-15)", () => {
    expect(leaf("2018-09-13", "2022-06-15")).toBe(3);
    expect(leaf("2018-09-14", "2022-06-15")).toBe(2);
  });

  it("L3 구간 밖은 불변 — 양도 2022-05-09(종전 규정)은 원래 3년, 2023-01-12 이후는 본문 3년", () => {
    expect(leaf("2018-09-13", "2022-05-09")).toBe(3);
    expect(leaf("2018-09-14", "2023-01-12")).toBe(3);
  });

  it("L4 취득일 정보가 없으면(직접 호출) 종전대로 2년 — 근거 없이 3년을 주지 않는다", () => {
    expect(
      resolveTemporaryTwoHouseDeadlineEra({ bothRegulated: true, baseDeadlineYears: 3, transferDate: D("2022-06-15") }).years,
    ).toBe(2);
  });

  it("L5 엔진 — 계약 2018-09-01 · 취득 2020-03-01 · 양도 2022-06-15: 비과세 / 계약 2018-09-14: 과세 (⑯ 아닌 세대)", () => {
    const calc = (contract: string) =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 900_000_000,
          acquisitionPrice: 400_000_000,
          acquisitionDate: D("2015-01-01"),
          transferDate: D("2022-06-15"),
          householdHousingCount: 2,
          residencePeriodMonths: 36,
          temporaryTwoHouse: {
            previousAcquisitionDate: D("2015-01-01"),
            newAcquisitionDate: D("2020-03-01"),
            newHouseContractDate: D(contract),
            ...BOTH,
          },
        }),
        seedRates(),
      );
    expect(calc("2018-09-01").isExempt).toBe(true);
    expect(calc("2018-09-14").isExempt).toBe(false);
  });
});

describe("#29 엔진 — ⑯ 세대의 조정→조정 단축 기한", () => {
  const calc = (newAcq: string, transfer: string, extra: Partial<TT>) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: D("2015-01-01"),
        transferDate: D(transfer),
        householdHousingCount: 2,
        residencePeriodMonths: 36,
        temporaryTwoHouse: { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D(newAcq), ...extra },
      }),
      seedRates(),
    );

  it("E1 ★ 884 쟁점2 — 조정→조정 ⑯ 세대가 2년 뒤·5년 안에 양도(신규 2019-03-10 · 양도 2021-08-01)하면 과세 (종전 비과세)", () => {
    const r = calc("2019-03-10", "2021-08-01", { ...BOTH, ...RELOCATION });
    expect(r.isExempt).toBe(false);
    expect(r.exemptReason ?? "").not.toContain("§155⑯");
    expect(r.determinedTax).toBeGreaterThan(0);
  });

  it("E1 긍정 짝 — 신규 주택이 비조정이면 같은 양도가 ⑯ 5년으로 비과세 · 근거는 5년만 적는다(1년은 자연 충족)", () => {
    const r = calc("2019-03-10", "2021-08-01", { ...NOT_BOTH, ...RELOCATION });
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세 (§155⑯ 지방이전 처분기한 5년)");
  });

  it("E2 ★ 884 쟁점1 — 신규 2018-09-01(조정→조정)·양도 2022-06-15: ⑯ 5년으로 비과세 / ⑯ 아니면 종전 3년 도과로 과세", () => {
    const withRelocation = calc("2018-09-01", "2022-06-15", { ...BOTH, ...RELOCATION });
    expect(withRelocation.isExempt).toBe(true);
    expect(withRelocation.exemptReason).toBe("일시적 2주택 비과세 (§155⑯ 지방이전 처분기한 5년)");
    expect(calc("2018-09-01", "2022-06-15", { ...BOTH }).isExempt).toBe(false);
  });

  it("E3 쟁점3 — 신규 2020-01-10(조정→조정)·양도 2020-06-01·전입 2020-02-01: 1년 안이라 비과세, ⑯ 표시는 없다(기한도 1년 요건도 안 바꿨다)", () => {
    const r = calc("2020-01-10", "2020-06-01", { ...BOTH, ...RELOCATION, wholeHouseholdMoveInDate: D("2020-02-01") });
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
  });
});

describe("#29 ⑯ 표시 — 「5년 적용」과 「1년 요건 면제만 적용」을 나눈다", () => {
  const eff = (prev: string, newAcq: string, transfer: string, extra: Partial<TT>) => {
    const tt: TT = { previousAcquisitionDate: D(prev), newAcquisitionDate: D(newAcq), ...extra };
    const era = resolveTemporaryTwoHouseDeadline({ isRegulatedArea: false, transferDate: D(transfer), temporaryTwoHouse: tt }, twoHouseRule);
    return relocationEffectsLabel(describePublicInstitutionRelocationEffects(tt, D(transfer), era, false));
  };

  it("D1 비조정 · 1년 자연 충족 → 5년만", () => {
    expect(eff("2015-01-01", "2020-01-01", "2024-06-01", { ...NOT_BOTH, ...RELOCATION })).toBe("지방이전 처분기한 5년");
  });
  it("D2 비조정 · 1년 미경과 → 5년·1년요건 면제", () => {
    expect(eff("2018-01-01", "2018-06-01", "2020-01-01", { ...NOT_BOTH, ...RELOCATION })).toBe("지방이전 처분기한 5년·1년요건 면제");
  });
  it("D3 조정→조정 단축 기한 · 1년 미경과 → 1년요건 면제만(5년은 덮지 않았다)", () => {
    expect(eff("2018-12-01", "2019-03-01", "2020-06-01", { ...BOTH, ...RELOCATION })).toBe("지방이전 1년요건 면제");
  });
  it("D4 조정→조정 단축 기한 · 1년 자연 충족 → 표시 없음(기한도 1년 요건도 안 바꿨다)", () => {
    expect(eff("2015-01-01", "2019-03-10", "2020-06-01", { ...BOTH, ...RELOCATION })).toBeUndefined();
  });
  it("D5 ⑯ 지역 요건 미충족(선언 없음) → 표시 없음", () => {
    expect(eff("2015-01-01", "2020-01-01", "2024-06-01", { ...NOT_BOTH })).toBeUndefined();
  });
});

describe("#29 판정 카드 — ⑯이 단축 기한을 덮지 않으면 조정 여부·전입 칸이 열린다", () => {
  const card = (newAcq: string, transfer: string, extra: Record<string, unknown> = {}) =>
    judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2015-01-01",
      newHouseAcquisitionDate: newAcq,
      transferDate: transfer,
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "0",
      publicInstitutionRelocation: true,
      ...extra,
    });

  it("C1 ⑯ + 조정→조정 단축 기한이 있는 양도 시기(2021) → regulated.relevant true (종전 false — 칸이 닫혀 있었다)", () => {
    const v = card("2019-03-10", "2021-03-01");
    expect(v.status).not.toBe("pending");
    if (v.status === "pending") return;
    expect(v.regulated.relevant).toBe(true);
  });

  it("C2 긍정 짝 — 단축 기한이 없는 양도 시기(2025)는 ⑯ 5년이 덮어 칸이 닫힌 채 (조정 여부와 무관)", () => {
    const v = card("2022-03-10", "2025-03-01");
    if (v.status === "pending") throw new Error("pending");
    expect(v.regulated.relevant).toBe(false);
    expect(v.deadlineYears).toBe(5);
  });

  it("C3 ⑯ 아닌 세대는 종전과 같다(2021 → relevant true)", () => {
    const v = card("2019-03-10", "2021-03-01", { publicInstitutionRelocation: false });
    if (v.status === "pending") throw new Error("pending");
    expect(v.regulated.relevant).toBe(true);
  });
});
