/**
 * 다건 양도소득세 변환·검증 동기화 회귀 (H-2 · M-2)
 *
 * 2026-06-11 review-autofix:
 *   M-2 — buildPropertyPayload가 deprecated 폼-전역 form.acquisitionMethod/appraisalValue에
 *         의존하던 결함 → 자산-수준 isAppraisalAcquisition/useEstimatedAcquisition으로 전환.
 *   H-2 — 합산 경로가 구조적으로 처리 못 하는 sub-object 모드(부담부증여·재개발·겸용·이월과세·
 *         PHD·일반/상업건물·다필지·가업상속·토지건물분리·companion)를 명시 차단.
 *         (1990 환산은 2026-07-06 route ⑭·엔진 지원으로 차단 해제 — multi-transfer-pre1990-support.test.ts)
 *         per-asset 단건 엔진이 honor하는 단순 스칼라(assetContractDate·capitalExpenditure·
 *         transferExpense·householdRightCount)는 build에서 전송.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildPropertyPayload,
  mergePriorReductionUsage,
  callMultiTransferTaxAPI,
} from "@/lib/calc/multi-transfer-tax-api";
import {
  validateMultiSupportedMode,
  validateMultiSettings,
} from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

function baseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-01";
  form.contractTotalPrice = "500,000,000";
  form.assets[0] = {
    ...form.assets[0],
    acquisitionDate: "2020-01-01",
    fixedAcquisitionPrice: "300,000,000",
  };
  return form;
}

function makeProperty(form: PropertyItem["form"], label = "건1"): PropertyItem {
  return { propertyId: "p1", propertyLabel: label, form, completionPercent: 100 };
}

function makeMultiForm(props: PropertyItem[]): MultiTransferFormData {
  return {
    taxYear: 2026,
    properties: props,
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
    priorPaidTax: "0",
    priorPaidLocalTax: "0",
    priorPaidTaxEdited: false,
    // 정정(수정신고·경정청구) 기본값
    amendmentMode: false,
    correctionKind: "amend",
    originalDeterminedTax: "",
    amendmentSourceId: "",
    statutoryFilingDeadline: "",
    amendedFilingDate: "",
    applyUnderReportingPenalty: false,
    underReportingReason: "normal",
    underReductionMode: "exempt",
    priorAssessmentNotified: false,
    applyLatePaymentPenalty: false,
    amendedPaymentDate: "",
    claimReasonType: "ordinary",
    posteriorEventDate: "",
    originalPaymentDate: "",
  };
}

// ─────────────────────────────────────────────────────────
// M-2: 자산-수준 취득방식 도출
// ─────────────────────────────────────────────────────────

describe("[M-2] buildPropertyPayload 자산-수준 취득방식 도출", () => {
  it("M-2-1: 감정가 모드는 자산 isAppraisalAcquisition에서 도출 (폼-전역 미사용)", () => {
    const form = baseForm();
    form.assets[0] = { ...form.assets[0], isAppraisalAcquisition: true, fixedAcquisitionPrice: "420,000,000" };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.acquisitionMethod).toBe("appraisal");
    expect(payload.appraisalValue).toBe(420_000_000);
    expect(payload.acquisitionPrice).toBe(0); // 감정가 모드 → 취득가 0, 엔진이 appraisalValue 사용
  });

  it("M-2-2: 환산취득가 모드는 자산 useEstimatedAcquisition에서 도출", () => {
    const form = baseForm();
    form.assets[0] = {
      ...form.assets[0],
      useEstimatedAcquisition: true,
      standardPriceAtAcq: "100,000,000",
      standardPriceAtTransfer: "200,000,000",
    };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.acquisitionMethod).toBe("estimated");
    expect(payload.useEstimatedAcquisition).toBe(true);
    expect(payload.standardPriceAtAcquisition).toBe(100_000_000);
    expect(payload.standardPriceAtTransfer).toBe(200_000_000);
  });

  it("M-2-3: 실가 모드(기본) → actual", () => {
    const payload = buildPropertyPayload(baseForm()) as Record<string, unknown>;
    expect(payload.acquisitionMethod).toBe("actual");
    expect(payload.useEstimatedAcquisition).toBe(false);
    expect(payload.acquisitionPrice).toBe(300_000_000);
  });

  it("M-2-4 [A-multi]: 상속 취득가액 — fixedAcq 우선, 공란 시 publishedValue ((b) 단일화)", () => {
    // 현행 직접입력(fixedAcq) 우선 → 동작 불변
    const withFixed = baseForm();
    withFixed.assets[0] = {
      ...withFixed.assets[0],
      acquisitionCause: "inheritance",
      fixedAcquisitionPrice: "500,000,000",
      publishedValueAtInheritance: "300,000,000",
    };
    expect((buildPropertyPayload(withFixed) as Record<string, unknown>).acquisitionPrice).toBe(500_000_000);

    // 통합 UI(P2b) 후 fixedAcq 제거 → publishedValue(신고가액)로 자동 전환
    const withPublished = baseForm();
    withPublished.assets[0] = {
      ...withPublished.assets[0],
      acquisitionCause: "inheritance",
      fixedAcquisitionPrice: "",
      publishedValueAtInheritance: "300,000,000",
    };
    expect((buildPropertyPayload(withPublished) as Record<string, unknown>).acquisitionPrice).toBe(300_000_000);
  });
});

// ─────────────────────────────────────────────────────────
// H-2(지원): per-asset 단건 엔진 honor 스칼라 전송
// ─────────────────────────────────────────────────────────

describe("[H-2] 지원 스칼라 필드 전송", () => {
  it("H2-S1: assetContractDate·householdRightCount 전송", () => {
    const form = baseForm();
    form.householdRightCount = "2";
    form.assets[0] = { ...form.assets[0], assetContractDate: "2025-12-01" };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.assetContractDate).toBe("2025-12-01");
    expect(payload.householdRightCount).toBe(2);
  });

  it("H2-S2: §97② swap — capitalExpenditure/transferExpense 둘 중 하나라도 입력 시 분리 전송", () => {
    const form = baseForm();
    form.assets[0] = { ...form.assets[0], capitalExpenditure: "5,000,000", transferExpense: "0" };
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.capitalExpenditure).toBe(5_000_000);
    expect(payload.transferExpense).toBeUndefined();
  });

  it("H2-S3: 둘 다 0이면 swap 비활성 (undefined)", () => {
    const payload = buildPropertyPayload(baseForm()) as Record<string, unknown>;
    expect(payload.capitalExpenditure).toBeUndefined();
    expect(payload.transferExpense).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// 일시적 2주택 §155① — 종전취득일 = 양도 자산 취득일 단일소스 (다건 경로)
// 단건(transfer-tax-api.ts)과 대칭 변경의 다건 커버리지(계획 TT-7).
// ─────────────────────────────────────────────────────────

describe("[§155①] 다건 일시적 2주택 종전취득일 단일소스", () => {
  it("TT-7: temporaryTwoHouse.previousAcquisitionDate = 양도 자산 취득일", () => {
    const form = baseForm(); // assets[0].acquisitionDate = "2020-01-01"
    form.temporaryTwoHouseSpecial = true;
    form.newHouseAcquisitionDate = "2021-06-01";
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.temporaryTwoHouse).toEqual({
      previousAcquisitionDate: "2020-01-01",
      newAcquisitionDate: "2021-06-01",
    });
  });

  it("TT-7b: 신규취득일 미입력 → temporaryTwoHouse 미조립(침묵 누락 방지는 validation 담당)", () => {
    const form = baseForm();
    form.temporaryTwoHouseSpecial = true;
    form.newHouseAcquisitionDate = "";
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.temporaryTwoHouse).toBeUndefined();
  });

  it("TT-7c: 자산 취득일 미입력 → temporaryTwoHouse 미조립", () => {
    const form = baseForm();
    form.assets[0] = { ...form.assets[0], acquisitionDate: "" };
    form.temporaryTwoHouseSpecial = true;
    form.newHouseAcquisitionDate = "2021-06-01";
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.temporaryTwoHouse).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// H-2(차단): 고급 sub-object 모드 명시 차단
// ─────────────────────────────────────────────────────────

describe("[H-2] 미지원 고급 모드 명시 차단", () => {
  const cases: Array<[string, (f: ReturnType<typeof baseForm>) => void]> = [
    ["부담부증여", (f) => { f.assets[0] = { ...f.assets[0], transferType: "burdened_gift" }; }],
    ["재개발", (f) => { f.assets[0] = { ...f.assets[0], assetKind: "redevelopment_apt" }; }],
    ["겸용주택", (f) => { f.assets[0] = { ...f.assets[0], assetKind: "housing", isMixedUseHouse: true }; }],
    ["일반건물", (f) => { f.assets[0] = { ...f.assets[0], assetKind: "general_building" }; }],
    ["이월과세", (f) => { f.assets[0] = { ...f.assets[0], acquisitionCause: "carryover_gift" }; }],
    ["PHD", (f) => { f.assets[0] = { ...f.assets[0], usePreHousingDisclosure: true }; }],
    // "1990토지"는 2026-07-06 지원 전환 — 아래 별도 통과 테스트로 이동.
    ["다필지", (f) => { f.assets[0] = { ...f.assets[0], assetKind: "land", parcelMode: true }; }],
    ["토지건물분리", (f) => { f.assets[0] = { ...f.assets[0], hasSeperateLandAcquisitionDate: true }; }],
    // [리뷰 H-1] 차감형·세액감면형·세율특칙 감면 — 다건 합산 미지원
    ["§98의7 미분양(차감/세액감면)", (f) => { f.assets[0] = { ...f.assets[0], reductions: [{ type: "unsold_98_7" } as never] }; }],
    ["§99의2 신축등(하이브리드)", (f) => { f.assets[0] = { ...f.assets[0], reductions: [{ type: "unsold_99_2" } as never] }; }],
    ["§98 미분양(세율 20% 특칙)", (f) => { f.assets[0] = { ...f.assets[0], reductions: [{ type: "unsold_98" } as never] }; }],
    ["§99 신축주택(차감)", (f) => { f.assets[0] = { ...f.assets[0], reductions: [{ type: "new_99" } as never] }; }],
  ];

  it.each(cases)("%s 자산은 validateMultiSupportedMode가 차단 사유 반환", (_label, mutate) => {
    const form = baseForm();
    mutate(form);
    expect(validateMultiSupportedMode(form)).not.toBeNull();
  });

  it("companion(자산 2건) 차단", () => {
    const form = baseForm();
    form.assets = [form.assets[0], { ...form.assets[0] }];
    expect(validateMultiSupportedMode(form)).not.toBeNull();
  });

  it("일반 매매 단일 주택은 통과(null)", () => {
    expect(validateMultiSupportedMode(baseForm())).toBeNull();
  });

  it("validateMultiSettings가 차단 모드 포함 시 라벨과 함께 에러 반환", () => {
    const form = baseForm();
    form.assets[0] = { ...form.assets[0], transferType: "burdened_gift" };
    const multi = makeMultiForm([makeProperty(form, "강남APT")]);
    const err = validateMultiSettings(multi);
    expect(err).toContain("강남APT");
    expect(err).toContain("부담부증여");
  });

  it("validateMultiSettings 정상 단일주택 2건은 통과(null)", () => {
    const multi = makeMultiForm([
      makeProperty(baseForm(), "건1"),
      makeProperty(baseForm(), "건2"),
    ]);
    expect(validateMultiSettings(multi)).toBeNull();
  });

  it("[R2-H1] 상속 auto + 신고가액 확정 → 통과 ((b) 취득가액 단일화)", () => {
    // P2a: 다건은 신고가액(publishedValueAtInheritance)을 취득가액으로 직접 사용 →
    // auto여도 신고가액이 있으면 통과(과거 '무조건 차단'에서 정밀화, plan §5.2 (b)).
    const form = baseForm();
    form.assets[0] = {
      ...form.assets[0],
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2000-01-01",
      inheritanceAssetKind: "house_apart",
      publishedValueAtInheritance: "300,000,000",
      fixedAcquisitionPrice: "",
    };
    expect(validateMultiSupportedMode(form)).toBeNull();
  });

  it("[R2-H1] 상속 auto + 신고가액 공란 → 차단 (단건 전용 산정 필요)", () => {
    const form = baseForm();
    form.assets[0] = {
      ...form.assets[0],
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2000-01-01",
      inheritanceAssetKind: "house_apart",
      publishedValueAtInheritance: "",
      fixedAcquisitionPrice: "",
    };
    const msg = validateMultiSupportedMode(form);
    expect(msg).not.toBeNull();
    expect(msg).toContain("신고가액");
  });

  it("[R2-H1] 상속 fixedAcquisitionPrice 폐기 — 신고가액 없으면 차단 (P2c 통합)", () => {
    const form = baseForm();
    form.assets[0] = {
      ...form.assets[0],
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2000-01-01",
      fixedAcquisitionPrice: "300,000,000", // P2c: 상속 fixedAcq 미사용 → 신고가액 없어 차단
      publishedValueAtInheritance: "",
    };
    const msg = validateMultiSupportedMode(form);
    expect(msg).not.toBeNull();
  });

  it("[리뷰 H-1] 모드 2 — 보유 감면주택 주택수 제외(specialHouseExclusions) 차단", () => {
    const form = baseForm();
    form.specialHouseExclusions = [
      { article: "unsold_98_8", houseAcquisitionDate: "2015-06-01", houseContractDate: "", requirementsConfirmed: true },
    ];
    const msg = validateMultiSupportedMode(form);
    expect(msg).not.toBeNull();
    expect(msg).toContain("주택수 제외");
  });

  it("[리뷰 H-1 대조군] 다건 지원 감면(자경 §69·§97 시리즈)은 통과", () => {
    const farming = baseForm();
    farming.assets[0] = { ...farming.assets[0], reductions: [{ type: "self_farming" } as never] };
    expect(validateMultiSupportedMode(farming)).toBeNull();

    const rental = baseForm();
    rental.assets[0] = { ...rental.assets[0], reductions: [{ type: "rental_97_main" } as never] };
    expect(validateMultiSupportedMode(rental)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// R2-H2: 다건 priorReductionUsage 전송 (⑬) + merge dedup
// ─────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("[R2-H2] 다건 priorReductionUsage 합성·전송", () => {
  it("mergePriorReductionUsage — 건 간 동일 항목은 1건으로 dedup, 상이 항목은 모두 유지", () => {
    const f1 = baseForm();
    f1.priorReductionUsage = [
      { year: 2024, type: "self_farming", amount: 50_000_000 },
      { year: 2023, type: "self_farming", amount: 30_000_000 },
    ];
    const f2 = baseForm();
    f2.priorReductionUsage = [
      { year: 2024, type: "self_farming", amount: 50_000_000 }, // f1과 동일 → dedup
      { year: 2022, type: "public_expropriation", amount: 20_000_000 },
    ];
    const merged = mergePriorReductionUsage([
      makeProperty(f1, "건1"),
      makeProperty(f2, "건2"),
    ]);
    expect(merged).toEqual([
      { year: 2024, type: "self_farming", amount: 50_000_000 },
      { year: 2023, type: "self_farming", amount: 30_000_000 },
      { year: 2022, type: "public_expropriation", amount: 20_000_000 },
    ]);
  });

  it("multi fetch body에 priorReductionUsage가 포함된다", async () => {
    const form = baseForm();
    form.priorReductionUsage = [{ year: 2024, type: "self_farming", amount: 150_000_000 }];
    const prop = makeProperty(form, "건1");
    const multi = makeMultiForm([prop]);

    let captured: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    }));
    await callMultiTransferTaxAPI(multi, [prop]);
    expect(captured!.priorReductionUsage).toEqual([
      { year: 2024, type: "self_farming", amount: 150_000_000 },
    ]);
  });

  it("이력 미입력 시 빈 배열 전송 (Zod default와 동일)", async () => {
    const prop = makeProperty(baseForm(), "건1");
    const multi = makeMultiForm([prop]);
    let captured: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    }));
    await callMultiTransferTaxAPI(multi, [prop]);
    expect(captured!.priorReductionUsage).toEqual([]);
  });
});
