/**
 * anchor: §155⑯ 공공기관 지방이전(3년→5년 + 1년 요건 면제) · §155⑱ 3년 기한 예외 5사유.
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md §1.1·§1.2 (E-1·E-2)
 *
 * 두 조항 모두 **§155①의 변형**이라 새 의제 슬롯을 만들지 않는다. §155① 판정 정본
 * (`resolveTemporaryTwoHouseDeadlineYears` + `judgeTemporaryTwoHouseTiming`)이 앞 계획서
 * Phase A에서 **비과세·중과 단일 소스**가 됐으므로, 여기만 고치면 양쪽에 함께 반영된다.
 *
 * ⚠️ **프로덕션 seed 값으로 돈다** — mock↔seed 드리프트가 판정을 가리지 않도록.
 */
import { describe, it, expect } from "vitest";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import {
  resolveTemporaryTwoHouseDeadlineYears,
  judgeTemporaryTwoHouseTiming,
} from "@/lib/tax-engine/transfer-tax-exemption";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
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

// ============================================================
// E-1 — §155⑯ 공공기관 지방이전
// ============================================================

describe("E-1 — §155⑯ 공공기관 지방이전", () => {
  it("G-1a 처분기한이 3년 → 5년", () => {
    // 비조정(§155① 본문 3년) 기준. ⑯이 그 3년을 5년으로 치환한다.
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        { isRegulatedArea: false, transferDate: D("2026-06-01") },
        twoHouseRule,
      ),
    ).toBe(3);
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        {
          isRegulatedArea: false,
          transferDate: D("2026-06-01"),
          temporaryTwoHouse: {
            previousAcquisitionDate: D("2018-01-01"),
            newAcquisitionDate: D("2021-06-01"),
            publicInstitutionRelocation: true,
          },
        },
        twoHouseRule,
      ),
    ).toBe(5);
  });

  it("G-1b W-4: 조정대상지역이어도 ⑯이 5년으로 덮는다", () => {
    // 「제1항 중 "3년"을 "5년"으로 본다」 — 조정지역 단축(DB 2년)보다 ⑯이 우선한다는 해석.
    // 🔶 조문 해석 미확정(계획서 W-4). 현행 구현을 명시적으로 고정해 둔다.
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        {
          isRegulatedArea: true,
          transferDate: D("2022-01-01"), // 완화 전 → 본래 2년
          temporaryTwoHouse: {
            previousAcquisitionDate: D("2018-01-01"),
            newAcquisitionDate: D("2019-06-01"),
            publicInstitutionRelocation: true,
          },
        },
        twoHouseRule,
      ),
    ).toBe(5);
  });

  it("🔴 G-1 후단: 1년 요건이 면제된다 (빠뜨리기 쉬운 효과)", () => {
    // 종전 2018-01-01 취득 → 신규 2018-06-01 취득 = 5개월. 본래는 요건 A 미충족.
    const base = {
      previousAcquisitionDate: D("2018-01-01"),
      newAcquisitionDate: D("2018-06-01"),
      transferDate: D("2020-01-01"),
      deadlineYears: 5,
    };
    expect(judgeTemporaryTwoHouseTiming({ ...base, oneYearWaived: false }).oneYearMet).toBe(false);
    expect(
      judgeTemporaryTwoHouseTiming({ ...base, oneYearWaived: false, publicInstitutionRelocation: true })
        .oneYearMet,
    ).toBe(true);
  });

  it("미입력 시 완전 불변 (회귀)", () => {
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        {
          isRegulatedArea: false,
          transferDate: D("2026-06-01"),
          temporaryTwoHouse: {
            previousAcquisitionDate: D("2018-01-01"),
            newAcquisitionDate: D("2021-06-01"),
          },
        },
        twoHouseRule,
      ),
    ).toBe(3);
  });
});

// ============================================================
// E-2 — §155⑱ 3년 기한 예외
// ============================================================

describe("E-2 — §155⑱ 처분기한 예외 5사유", () => {
  const base = {
    previousAcquisitionDate: D("2018-01-01"),
    newAcquisitionDate: D("2020-01-01"),
    transferDate: D("2026-06-01"), // 신규취득 + 6년 → 3년 기한 크게 초과
    deadlineYears: 3,
    oneYearWaived: false,
  };

  it("사유 없으면 기한 초과 → 요건 B 미충족 (회귀)", () => {
    const t = judgeTemporaryTwoHouseTiming(base);
    expect(t.threeYearMet).toBe(false);
    expect(t.overall).toBe(false);
  });

  it.each([
    "kamco",
    "auction",
    "public_sale",
    "cash_settlement_suit",
    "expropriation_suit",
  ] as const)("🔴 %s 사유 → 기한 초과여도 요건 B 충족", (reason) => {
    const t = judgeTemporaryTwoHouseTiming({ ...base, disposalDelayReason: reason });
    expect(t.threeYearMet).toBe(true);
    expect(t.overall).toBe(true);
  });

  it("⑱ 사유가 요건 A(1년)까지 면제하지는 않는다 — 본문 괄호는 3년 기한에만 걸린다", () => {
    const t = judgeTemporaryTwoHouseTiming({
      ...base,
      newAcquisitionDate: D("2018-06-01"), // 종전 + 5개월 → 요건 A 미충족
      disposalDelayReason: "auction",
    });
    expect(t.threeYearMet).toBe(true);
    expect(t.oneYearMet).toBe(false);
    expect(t.overall).toBe(false);
  });
});

// ============================================================
// 엔진 통합 — 비과세·중과 배제 양쪽에 함께 반영되는가
// ============================================================

function calc(tth: Record<string, unknown>) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 700_000_000,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2026-06-01"),
      isRegulatedArea: false,
      householdHousingCount: 2,
      isOneHousehold: true,
      residencePeriodMonths: 36,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2018-01-01"),
        newAcquisitionDate: D("2020-01-01"),
        ...tth,
      },
    }),
    seedRates(),
  );
}

describe("E-1·E-2 엔진 통합 — 단일 소스라 비과세에 그대로 반영된다", () => {
  it("기한 초과 + 사유 없음 → 일시적 2주택 비과세 미적용 (회귀)", () => {
    expect(calc({}).exemptReason).toBeUndefined();
  });

  it("기한 초과 + ⑱ 경매 신청 → 고가주택 부분 비과세 + 근거 표시", () => {
    // 어느 조항으로 요건이 완화됐는지 결과에 남아야 한다(계획서 G-2). 내부 id("auction")가 아니라
    // 한국어 호 라벨이어야 한다(memory `feedback_no_internal_id_in_result`).
    const r = calc({ disposalDelayReason: "auction" });
    expect(r.exemptReason).toBe("일시적 2주택 고가주택 (§155⑱ 2호 법원 경매 신청)");
  });

  it("기한 초과(6년) + ⑯ 공공기관 이전(5년)은 여전히 초과 → 미적용", () => {
    expect(calc({ publicInstitutionRelocation: true }).exemptReason).toBeUndefined();
  });

  it("기한 4년 + ⑯ → 5년 기한 안이라 적용", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 2_000_000_000,
        acquisitionPrice: 700_000_000,
        acquisitionDate: D("2018-01-01"),
        transferDate: D("2026-06-01"),
        isRegulatedArea: false,
        householdHousingCount: 2,
        isOneHousehold: true,
        residencePeriodMonths: 36,
        temporaryTwoHouse: {
          previousAcquisitionDate: D("2018-01-01"),
          newAcquisitionDate: D("2022-06-01"), // 양도까지 4년 → 3년 초과, 5년 이내
          publicInstitutionRelocation: true,
        },
      }),
      seedRates(),
    );
    expect(r.exemptReason).toBe(
      "일시적 2주택 고가주택 (§155⑯ 지방이전 처분기한 5년·1년요건 면제)",
    );
  });

  it("근거 둘이 동시에 적용되면 함께 표시된다", () => {
    const r = calc({ publicInstitutionRelocation: true, disposalDelayReason: "kamco" });
    expect(r.exemptReason).toBe(
      "일시적 2주택 고가주택 (§155⑯ 지방이전 처분기한 5년·1년요건 면제 · §155⑱ 1호 한국자산관리공사 매각 의뢰)",
    );
  });
});
