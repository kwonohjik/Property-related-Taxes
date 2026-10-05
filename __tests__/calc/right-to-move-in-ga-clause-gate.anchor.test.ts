/**
 * anchor — 입주권 양도 §89①4호 가목(전액 비과세) 도달 경로 (PR-C, 2026-10-05)
 *
 * 계획서 `docs/00-pm/roster-required-other-assets.plan.md` §4-3·§4-6·Q-20.
 *
 * ## 무엇을 고정하는가
 *
 * PR-C 이전에는 계산기 화면에 `householdHousingCount === "0"`로 갈 입력 경로가 없어
 * (스칼라 버튼이 "1/2/3+"뿐, §2-2) 가목이 계산기에서 애초에 도달 불가였다. PR-C가 명부
 * 0행 + 확정 토글로 그 경로를 열었는데, 그 직전에 PR-D가 「세대 보유 분양권·입주권」 목록의
 * 「없음」 확인(`householdNoPresaleRightsConfirmed`)을 먼저 ⑧에 추가해 두어(§4-6 — 「모름 →
 * 유리」가 계산기에서 활성화되는 것을 막는 안전장치), 가목에 닿으려면 **두 확인(주택·분양권)이
 * 모두** 필요하다.
 *
 * | # | 주장 |
 * |---|---|
 * | GA-1 | 양성 — 명부 0행 + 주택·분양권 **둘 다** 확정 → ⑧ 통과 |
 * | GA-2 | 음성(주택만) — 주택 확정, 분양권 미확정 → ⑧이 분양권 확인 필드로 차단 |
 * | GA-3 | 음성(분양권만) — 분양권 확정, 주택 미확정 → ⑧이 주택 확인 필드로 차단 |
 * | GA-4 | ④ — 양성 조합이 엔진에 `householdHousingCount: 0`·`presaleRights` 없음(또는 빈 배열)으로 간다 |
 * | GA-5 | 엔진 — 그 입력 조합이 실제로 가목(전액 비과세)을 낸다(대조: 미확정 상당 입력은 과세) |
 */
import { describe, it, expect } from "vitest";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "right_to_move_in",
    acquisitionCause: "purchase",
    acquisitionDate: "2002-04-09",
  };
  return { ...f, transferDate: "2024-06-01", filingDate: "2024-08-31", houses: [], presaleRights: [], ...over };
}

function fieldsOf(f: TransferFormData, field: string): string[] {
  return collectStep1Issues(f)
    .filter((i) => i.field === field)
    .map((i) => i.message);
}

describe("GA-1~3 ⑧ — 가목 경로는 두 확인이 모두 필요하다", () => {
  it("[GA-1] 둘 다 확정 → 어느 쪽도 차단하지 않는다", () => {
    const f = form({ householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true });
    expect(fieldsOf(f, "householdNoOtherHousesConfirmed")).toEqual([]);
    expect(fieldsOf(f, "householdNoPresaleRightsConfirmed")).toEqual([]);
  });

  it("[GA-2] 주택만 확정 — 분양권 확인 필드가 차단한다", () => {
    const f = form({ householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: false });
    expect(fieldsOf(f, "householdNoOtherHousesConfirmed")).toEqual([]);
    expect(fieldsOf(f, "householdNoPresaleRightsConfirmed")).toHaveLength(1);
  });

  it("[GA-3] 분양권만 확정 — 주택 확인 필드가 차단한다", () => {
    const f = form({ householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: true });
    expect(fieldsOf(f, "householdNoOtherHousesConfirmed")).toHaveLength(1);
    expect(fieldsOf(f, "householdNoPresaleRightsConfirmed")).toEqual([]);
  });

  it("[GA-3b] 둘 다 미확정 — 둘 다 차단한다", () => {
    const f = form({ householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: false });
    expect(fieldsOf(f, "householdNoOtherHousesConfirmed")).toHaveLength(1);
    expect(fieldsOf(f, "householdNoPresaleRightsConfirmed")).toHaveLength(1);
  });
});

const mockRates = makeMockRates();

/** 사례 36 계열 — 입주권 양도 · 가목 요건(인가일 현재 기존주택 소유) 자기선언 충족. */
function rightInfo(over: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 90_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    exemptionEligibleAtApproval: true,
    ...over,
  } as RedevelopmentInfo;
}

function runEngine(over: Partial<TransferTaxInput> = {}) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 900_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: rightInfo(),
    ...over,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

describe("GA-5 엔진 — ⑧이 요구하는 조합이 실제로 가목(전액 비과세)을 낸다", () => {
  /**
   * 🔑 **양성** — GA-1의 두 확인이 ④로 번역하는 엔진 입력과 정확히 같다(명부 0행 →
   *    householdHousingCount 0, 분양권 목록 0행 → presaleRights 미지정 = 빈 배열과 동치,
   *    `oneRightPresaleGate`의 빈 배열 루프 미실행 → "clear").
   */
  it("[GA-5-00] householdHousingCount: 0 + presaleRights 없음 → 가목 전액 비과세", () => {
    const { result, detail } = runEngine();
    expect(detail.oneRightExemptionApplied).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  /**
   * 🔴 **부정 짝** — 주택 확인을 안 했다고 가정하면(= 다른 주택이 있다고 선언, 1채) 가목이
   *    아예 성립하지 않는다(나목으로 갈리거나 과세). GA-2가 ⑧에서 막는 바로 그 상태다.
   */
  it("[GA-5-01] 부정 짝 — householdHousingCount: 1(주택 미확정 상당) → 가목 불성립", () => {
    const { detail } = runEngine({ householdHousingCount: 1 });
    expect(detail.oneRightExemptionApplied).toBeFalsy();
  });

  /**
   * 🔴 **부정 짝** — 분양권을 보유 중인데도 명부를 확정만 하고 입력을 안 했다고 가정하면
   *    (= `presaleRights`에 미해소 분양권 1건) 가목·나목 모두 불성립한다. GA-3이 ⑧에서
   *    「분양권 없음」 확인을 **별도로** 요구하는 이유다.
   */
  it("[GA-5-02] 부정 짝 — 분양권 보유 중(미입력 가정) → 가목·나목 모두 불성립, 과세", () => {
    // 부칙 제7조②③(법률 제18578호) — 분양권 배제는 입주권 관리처분계획인가일·분양권 취득일이
    // **둘 다** 2022-01-01 이후일 때만 걸린다(`oneRightPresaleRightBlocks`). 대조군(approvalDate
    // 2018-10-23)은 이 창 밖이라 이 축만 2022-05-01로 올려 블록을 켠다.
    const { result, detail } = runEngine({
      redevelopment: rightInfo({ approvalDate: new Date("2022-05-01") }),
      presaleRights: [
        { id: "p1", type: "presale_right", acquisitionDate: new Date("2023-01-01"), region: "capital" },
      ],
    });
    expect(detail.oneRightExemptionApplied).toBeFalsy();
    expect(result.totalTax).toBeGreaterThan(0);
  });
});
