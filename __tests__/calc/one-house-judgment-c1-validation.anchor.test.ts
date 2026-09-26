/**
 * anchor(⑧·④) — 1세대1주택 판정 메뉴 **입력 게이트·검증** 결함 (리뷰 C1 레인)
 *
 * `docs/reviews/one-house-exemption-review-2026-09.md`의 OH-05·OH-06·OH-07·OH-33·OH-53.
 * 화면(⑤) 축은 `one-house-judgment-c1-display.ui.test.tsx`가 본다.
 *
 * | # | 결함 | 무엇을 고정하나 |
 * |---|---|---|
 * | OH-05 | §156의2⑤ 대체주택 게이트가 「2주택 이상」 | 1주택 + 조합원입주권이면 ⑧이 막고 ④가 보낸다 · 숨겨진 stale 값은 ④가 보내지 않는다 |
 * | OH-06 | §154① 단서 사유별 필수 검증이 판정 메뉴에 없다 | 5호 무주택 확인 · 2호나·다목 출국일을 ③ 단계 ⑧이 막는다 |
 * | OH-07 | 거주 구간 검증 부재 | 취득 전 입주 · 퇴거일 누락 · 구간 겹침을 ② 단계 ⑧이 막는다 |
 * | OH-33 | 수용일 미입력 → 엔진은 단서 불성립인데 ⑧은 통과 | 판정 메뉴·계산기 ⑧ 둘 다 수용일을 요구한다 |
 * | OH-53 | §155⑳ 미충족인데 「1세대1주택 비과세」 사유가 남는다 | 판정을 과세로 뒤집을 때 사유·적용 특례도 함께 지운다 |
 *
 * 모든 부정형 단언에 **긍정 짝**을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { validateStep2, validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { POST } from "@/app/api/calc/one-house-exemption/route";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-01-01",
    ...over,
  }) as AssetForm;

/** 판정 메뉴 폼 — 명부 0행이면 파생 주택 수 1(양도 대상), §154① 단서 카드는 `one_house` 모드다. */
const jForm = (over: Record<string, unknown> = {}, assetOver: Partial<AssetForm> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset(assetOver)],
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    houses: [],
    presaleRights: [],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

const msgs2 = (f: OneHouseJudgmentFormData) => validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message);
const msgs3 = (f: OneHouseJudgmentFormData) => validateStep3(f).filter((e) => e.severity === "error").map((e) => e.message);

/** 조합원입주권 1개 — 종전주택이 관리처분인가로 바뀐 것. */
const REDEV_RIGHT = {
  id: "r1",
  type: "redevelopment_right",
  acquisitionDate: "2012-01-01",
  region: "capital",
};

/** 대체주택 특례 4필드를 모두 채운 선언. */
const REPL_FILLED = {
  replacementHouseSpecial: true,
  replBusinessApprovalDate: "2020-01-01",
  replCompletionDate: "2026-12-31",
  replResidenceMonths: "14",
  replWillResideNewHouse: true,
};

describe("OH-05 §156의2⑤ 대체주택 — 게이트가 법령 기본 사례를 포함한다", () => {
  it("[C1-05a] 1주택 + 조합원입주권 1개 · 토글 ON · 4필드 미입력 → ⑧이 4건을 막는다", () => {
    const f = jForm({ presaleRights: [REDEV_RIGHT], replacementHouseSpecial: true }, { acquisitionDate: "2023-03-01" });
    expect(msgs2(f).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(4);
  });

  it("[C1-05b] 같은 세대 · 4필드 입력 → ④가 `replacementHouse`를 보낸다(유일 입력 경로가 엔진에 닿는다)", () => {
    const f = jForm({ presaleRights: [REDEV_RIGHT], ...REPL_FILLED }, { acquisitionDate: "2023-03-01" });
    expect(msgs2(f).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(0);
    expect(buildOneHouseExemptionApiBody(f).replacementHouse).toBeTruthy();
  });

  it("[C1-05c] 입주권 없는 1주택 — 숨겨진 stale 선언은 ④가 **보내지 않는다**", () => {
    const f = jForm({ ...REPL_FILLED }, { acquisitionDate: "2023-09-01" });
    expect(buildOneHouseExemptionApiBody(f).replacementHouse).toBeUndefined();
  });

  it("[C1-05d] 긍정 짝 — 2주택이면 종전대로 보낸다", () => {
    const f = jForm(
      { houses: [{ id: "h1", region: "capital", acquisitionDate: "2018-01-01", officialPrice: "300000000", isInherited: false }], ...REPL_FILLED },
      { acquisitionDate: "2023-09-01" },
    );
    expect(buildOneHouseExemptionApiBody(f).replacementHouse).toBeTruthy();
  });

  it("[C1-05e] 분양권(입주권 아님)만 있으면 열리지 않는다 — §156의2는 조합원입주권 조문이다", () => {
    const f = jForm(
      { presaleRights: [{ ...REDEV_RIGHT, type: "presale_right" }], ...REPL_FILLED },
      { acquisitionDate: "2023-09-01" },
    );
    expect(buildOneHouseExemptionApiBody(f).replacementHouse).toBeUndefined();
  });
});

describe("OH-06 §154① 단서 사유별 필수 검증 — 판정 메뉴 ③ 단계", () => {
  it("[C1-06a] 5호 선택 · 계약금 지급일 무주택 미확인 → 막는다", () => {
    const f = jForm({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: false });
    expect(msgs2(f).some((m) => m.includes("계약금 지급일 현재 무주택"))).toBe(true);
  });

  it("[C1-06b] 긍정 짝 — 무주택 확인하면 통과", () => {
    const f = jForm({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true });
    expect(msgs2(f).some((m) => m.includes("계약금 지급일 현재 무주택"))).toBe(false);
  });

  it("[C1-06c] 2호나목 해외이주 · 출국일 미입력 → 막는다 / 입력하면 통과", () => {
    const miss = jForm({ provisoReason: "overseas_migration", provisoDepartureDate: "" });
    expect(msgs2(miss).some((m) => m.includes("출국일을 입력하세요"))).toBe(true);
    const ok = jForm({ provisoReason: "overseas_residence", provisoDepartureDate: "2024-01-01" });
    expect(msgs2(ok).some((m) => m.includes("출국일을 입력하세요"))).toBe(false);
  });

  it("[C1-06d] 카드가 숨는 3주택 세대의 stale 사유는 막지 않는다(영구 차단 방지)", () => {
    const row = (id: string) => ({ id, region: "capital", acquisitionDate: "2015-01-01", officialPrice: "300000000", isInherited: false });
    const f = jForm({ houses: [row("h1"), row("h2")], provisoReason: "pre_designation_contract" });
    expect(msgs2(f).some((m) => m.includes("계약금 지급일 현재 무주택"))).toBe(false);
  });
});

describe("OH-07 거주 구간 검증 — 판정 메뉴 ② 단계", () => {
  const interval = (periods: Array<{ moveInDate: string; moveOutDate: string }>) =>
    jForm({ transferDate: "2024-01-02" }, { residenceInputMode: "interval", residencePeriods: periods });

  it("[C1-07a] 취득일 전 입주(전세 시절 거주) → 막는다", () => {
    const f = interval([{ moveInDate: "2019-01-01", moveOutDate: "2022-06-01" }]);
    expect(msgs3(f).some((m) => m.includes("취득일(2021-01-01)보다 빠릅니다"))).toBe(true);
  });

  it("[C1-07b] 같은 구간 두 번(겹침) → 막는다", () => {
    const p = { moveInDate: "2021-01-01", moveOutDate: "2022-01-01" };
    expect(msgs3(interval([p, p])).some((m) => m.includes("겹칩니다"))).toBe(true);
  });

  it("[C1-07c] 퇴거일 미입력 → 막는다(0개월로 들어가 과세가 되는 것을 차단)", () => {
    const f = interval([{ moveInDate: "2021-01-01", moveOutDate: "" }]);
    expect(msgs3(f).some((m) => m.includes("퇴거일을 입력하세요"))).toBe(true);
  });

  it("[C1-07d] 긍정 짝 — 보유기간 안의 겹치지 않는 구간은 통과", () => {
    const f = interval([
      { moveInDate: "2021-01-01", moveOutDate: "2021-12-31" },
      { moveInDate: "2022-01-01", moveOutDate: "2024-01-02" },
    ]);
    expect(msgs3(f).filter((m) => m.startsWith("거주 구간"))).toHaveLength(0);
  });

  it("[C1-07e] 직접 입력 모드는 구간을 보지 않는다(위젯이 구간을 쓰지 않는다)", () => {
    const f = jForm({}, {
      residenceInputMode: "direct",
      residencePeriods: [{ moveInDate: "2019-01-01", moveOutDate: "" }],
    });
    expect(msgs3(f).filter((m) => m.startsWith("거주 구간"))).toHaveLength(0);
  });

  it("[C1-07f] 입주권 양도는 거주 위젯이 없으므로 구간을 보지 않는다", () => {
    const f = jForm({}, {
      assetKind: "right_to_move_in",
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2019-01-01", moveOutDate: "" }],
    });
    expect(msgs3(f).filter((m) => m.startsWith("거주 구간"))).toHaveLength(0);
  });
});

describe("OH-33 §154①2호가목 수용 — 수용일은 필수다(엔진이 미입력을 불성립으로 본다)", () => {
  it("[C1-33a] 판정 메뉴 — 수용 선택 · 수용일 미입력 → 막는다 / 입력하면 통과", () => {
    const miss = jForm({ provisoReason: "expropriation", provisoExpropriationDate: "" });
    expect(msgs2(miss).some((m) => m.includes("수용일을 입력하세요"))).toBe(true);
    const ok = jForm({ provisoReason: "expropriation", provisoExpropriationDate: "2024-06-01" });
    expect(msgs2(ok).some((m) => m.includes("수용일을 입력하세요"))).toBe(false);
  });

  const calcForm = (over: Record<string, unknown>) =>
    ({
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      assets: [asset({ acquisitionPrice: "300000000", actualSalePrice: "900000000" } as Partial<AssetForm>)],
      houses: [],
      presaleRights: [],
      contractTotalPrice: "900000000",
      totalTransferExpense: "0",
      householdHousingCount: "1",
      isOneHousehold: true,
      residencePeriodMonths: "0",
      ...over,
    }) as unknown as TransferFormData;
  const calcMsgs = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);

  it("[C1-33b] 계산기 — 같은 안내를 쓰는 카드라 같은 검증을 한다 / 입력하면 통과", () => {
    expect(calcMsgs(calcForm({ provisoReason: "expropriation" })).some((m) => m.includes("수용일을 입력하세요"))).toBe(true);
    expect(
      calcMsgs(calcForm({ provisoReason: "expropriation", provisoExpropriationDate: "2024-06-01" })).some((m) =>
        m.includes("수용일을 입력하세요"),
      ),
    ).toBe(false);
  });
});

describe("OH-33 부정 짝 — 계산기는 카드를 그리지 않는 맥락에서 수용일을 요구하지 않는다", () => {
  /**
   * 🔴 계산기 Step4는 `one_house` 맥락 카드만 그린다(일시적 2주택 맥락 카드는 판정 메뉴로 갔다).
   *    수용은 그 맥락의 화이트리스트 **안**이라, 게이트 없이 막으면 채울 칸이 없는 영구 차단이다.
   */
  it("[C1-33c] 일시적 2주택 맥락(2채 · 신규주택 도출) · 수용 선택 · 수용일 없음 → 계산기는 막지 않는다", () => {
    const f = {
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      assets: [asset({ acquisitionPrice: "300000000", actualSalePrice: "900000000" } as Partial<AssetForm>)],
      houses: [{ id: "h-new", region: "capital", acquisitionDate: "2022-06-01", officialPrice: "300000000", isInherited: false }],
      presaleRights: [],
      contractTotalPrice: "900000000",
      totalTransferExpense: "0",
      householdHousingCount: "2",
      isOneHousehold: true,
      residencePeriodMonths: "0",
      provisoReason: "expropriation",
    } as unknown as TransferFormData;
    expect(collectStepIssues(1, f).some((i) => i.message.includes("수용일을 입력하세요"))).toBe(false);
  });

  it("[C1-33d] 판정 메뉴는 같은 맥락에서 막는다 — 그 카드가 이 메뉴에 있다", () => {
    const f = jForm({
      houses: [{ id: "h-new", region: "capital", acquisitionDate: "2022-06-01", officialPrice: "300000000", isInherited: false }],
      provisoReason: "expropriation",
    });
    expect(msgs2(f).some((m) => m.includes("수용일을 입력하세요"))).toBe(true);
  });
});

describe("OH-53 §155⑳ 미충족 — 과세로 뒤집으면 비과세 사유도 남기지 않는다", () => {
  const BASE = {
    propertyType: "housing",
    transferDate: "2024-06-01",
    acquisitionDate: "2019-06-01",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    annualBasicDeductionUsed: 0,
    reductions: [],
  } as const;
  const unit = {
    businessRegistrationDate: "2015-01-01T00:00:00.000Z",
    rentalRegistrationDate: "2015-01-01T00:00:00.000Z",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    isExcluded918Rule: false,
    hasContractDepositProof: true,
    isExcludedShortToLongChange: false,
    standardPriceAtRentalStart: 500_000_000,
    acquisitionOfficialPrice: 500_000_000,
    isNationalSizeHousing: true,
    hasMinimum2Units: true,
    hasMinimum5UnitsInCity: true,
    rentalMonths: 120,
    rentalAutoTermination: false,
    requirementsConfirmed: true,
  };
  async function post(residencePeriodMonths: number) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
        body: JSON.stringify({
          ...BASE,
          residencePeriodMonths,
          rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unit] },
        }),
      }),
    );
    return (await res.json()).data;
  }

  it("[C1-53a] 거주 12개월(미충족) → 과세이고 exemptReason·적용 특례가 비어 있다", async () => {
    const data = await post(12);
    expect(data.rentalHousingException.passed).toBe(false);
    expect(data.judgment.isExempt).toBe(false);
    expect(data.judgment.exemptReason).toBeUndefined();
    expect(data.judgment.appliedExceptions).toEqual([]);
  });

  it("[C1-53b] 긍정 짝 — 거주 60개월(충족)이면 비과세 사유가 그대로 있다", async () => {
    const data = await post(60);
    expect(data.rentalHousingException.passed).toBe(true);
    expect(data.judgment.isExempt).toBe(true);
    expect(data.judgment.exemptReason).toBe("1세대1주택 비과세");
  });
});
