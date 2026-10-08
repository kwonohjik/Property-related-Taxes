/**
 * 거주기간 입력 — 신규 기본값(구간 + 빈 구간 1개) · 개월 수 직접 입력 상한 (2026-10-08).
 *
 * 종전 기본값은 `direct`라 Step4 「거주 기간 입력」 토글이 꺼진 채 개월 칸만 보였고, 그 칸에는
 * 상한이 없었다 — 보유 12개월인데 71개월이 그대로 엔진에 실렸다(평가셋 F259).
 * 구간 모드는 입주일 ≥ 취득일 · 퇴거일 ≤ 양도일 · 겹침 금지로 이미 막혀 있으므로, 직접 입력도
 * 같은 최댓값(취득일~양도일, §154⑥ 초일 산입)을 넘지 못하게 한다(소령 §154① 「그 보유기간 중」).
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { directResidenceMonthsOverflowError } from "@/lib/calc/residence-interval-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const ACQ = "2023-06-01";
const TRANSFER = "2024-06-01";
/** 2023-06-01 ~ 2024-06-01 초일 산입 — 12개월(응당일 전날 2024-05-31이 12개월째 완성) */
const MAX = 12;

const housing = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: ACQ,
    acquisitionPrice: "300000000",
    actualSalePrice: "900000000",
    ...over,
  }) as AssetForm;

const direct = (months: string): Partial<AssetForm> => ({
  residenceInputMode: "direct",
  residencePeriods: [],
  residencePeriodMonthsAsset: months,
});

const calcForm = (assetOver: Partial<AssetForm>) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER,
    filingDate: "2024-08-31",
    assets: [housing(assetOver)],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "900000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "0",
  }) as unknown as TransferFormData;

const jForm = (assetOver: Partial<AssetForm>) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [housing(assetOver)],
    transferDate: TRANSFER,
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    houses: [],
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

const calcMsgs = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);
const jMsgs = (f: OneHouseJudgmentFormData) =>
  validateStep3(f).filter((e) => e.severity === "error").map((e) => e.message);
const overflow = (m: string) => m.startsWith("거주기간:") && m.includes("개월이 취득일(");

describe("RD-1 신규 자산 기본값 — 구간 입력 + 빈 구간 1개", () => {
  it("[RD-1a] makeDefaultAsset은 interval 모드와 빈 구간 1개로 시작한다", () => {
    const a = makeDefaultAsset(1);
    expect(a.residenceInputMode).toBe("interval");
    expect(a.residencePeriods).toEqual([{ moveInDate: "", moveOutDate: "" }]);
  });

  it("[RD-1b] 자산끼리 구간 배열·객체를 공유하지 않는다", () => {
    const a = makeDefaultAsset(1);
    const b = makeDefaultAsset(2);
    expect(a.residencePeriods).not.toBe(b.residencePeriods);
    expect(a.residencePeriods[0]).not.toBe(b.residencePeriods[0]);
  });

  it("[RD-1c] 빈 구간을 그대로 두면 ⑧이 입주일을 요구한다(거주하지 않았으면 구간을 삭제)", () => {
    expect(calcMsgs(calcForm({}))).toContain("거주 구간 #1: 입주일을 입력하세요.");
    expect(jMsgs(jForm({}))).toContain("거주 구간 #1: 입주일을 입력하세요.");
    // 짝 — 구간을 지우면 통과한다
    expect(calcMsgs(calcForm({ residencePeriods: [] })).some((m) => m.startsWith("거주 구간 #1"))).toBe(false);
    expect(jMsgs(jForm({ residencePeriods: [] })).some((m) => m.startsWith("거주 구간 #1"))).toBe(false);
  });
});

describe("RD-2 구 기록 — 모드 키가 없으면 direct로 남는다(개월 수가 버려지지 않는다)", () => {
  it("[RD-2a] 키 없는 구 기록 → direct · 구간 [] · 개월 수 보존", () => {
    const legacy = { ...makeDefaultAsset(1), residencePeriodMonthsAsset: "30" } as Record<string, unknown>;
    delete legacy.residenceInputMode;
    delete legacy.residencePeriods;
    const a = migrateAsset(legacy);
    expect(a.residenceInputMode).toBe("direct");
    expect(a.residencePeriods).toEqual([]);
    expect(a.residencePeriodMonthsAsset).toBe("30");
  });

  it("[RD-2b] 짝 — 저장된 interval 기록은 interval 그대로", () => {
    const saved = {
      ...makeDefaultAsset(1),
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2020-01-01", moveOutDate: "2022-01-01" }],
    };
    const a = migrateAsset(saved);
    expect(a.residenceInputMode).toBe("interval");
    expect(a.residencePeriods).toEqual([{ moveInDate: "2020-01-01", moveOutDate: "2022-01-01" }]);
  });
});

describe("RD-3 직접 입력 상한 — 취득일~양도일 개월 수(구간 모드 최댓값과 같다)", () => {
  it("[RD-3a] leaf — 상한 12개월은 통과, 13개월은 차단(±1 동등성)", () => {
    const at = (months: number) =>
      directResidenceMonthsOverflowError({ months, acquisitionDate: ACQ, transferDate: TRANSFER, field: "residencePeriodMonthsAsset" });
    expect(at(MAX)).toBeNull();
    expect(at(MAX + 1)).toContain(`${MAX + 1}개월이 취득일(${ACQ})부터 양도일까지의 ${MAX}개월을 넘습니다`);
  });

  it("[RD-3b] leaf — 상한은 구간 모드 최댓값(입주=취득일 · 퇴거=양도일 한 구간)과 같다", () => {
    const f = calcForm({ residencePeriods: [{ moveInDate: ACQ, moveOutDate: TRANSFER }] });
    expect(calcMsgs(f).some((m) => m.startsWith("거주 구간"))).toBe(false);
    // 같은 개월 수를 직접 입력해도 통과
    expect(calcMsgs(calcForm(direct(String(MAX)))).some(overflow)).toBe(false);
  });

  it("[RD-3c] leaf — 날짜가 없거나 역전이면 판정하지 않는다", () => {
    const f = (acquisitionDate?: string, transferDate?: string) =>
      directResidenceMonthsOverflowError({ months: 999, acquisitionDate, transferDate, field: "residencePeriodMonthsAsset" });
    expect(f(undefined, TRANSFER)).toBeNull();
    expect(f(ACQ, undefined)).toBeNull();
    expect(f(TRANSFER, ACQ)).toBeNull();
  });

  it("[RD-3d] 계산기 ⑧ — 보유 12개월에 71개월 직접 입력은 막고, 12개월은 통과", () => {
    expect(calcMsgs(calcForm(direct("71"))).filter(overflow)).toHaveLength(1);
    expect(calcMsgs(calcForm(direct(String(MAX)))).some(overflow)).toBe(false);
  });

  it("[RD-3e] 판정 메뉴 ⑧ — 같은 leaf · 같은 경계", () => {
    expect(jMsgs(jForm(direct("71"))).filter(overflow)).toHaveLength(1);
    expect(jMsgs(jForm(direct(String(MAX)))).some(overflow)).toBe(false);
  });

  it("[RD-3f] 1세대가 아니면 계산기는 거주 입력을 그리지 않으므로 막지 않는다", () => {
    const f = { ...calcForm(direct("71")), isOneHousehold: false } as TransferFormData;
    expect(calcMsgs(f).some(overflow)).toBe(false);
  });

  it("[RD-3g] 승계조합원 완공APT는 더 구체적인 I-8 문구가 먼저이고 일반 문구는 겹치지 않는다", () => {
    const f = calcForm({
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevIsSuccessorMember: "yes",
      redevCompletionDate: "2024-01-01",
      ...direct("71"),
    } as Partial<AssetForm>);
    const m = calcMsgs(f);
    expect(m.some((x) => x.includes("승계조합원 신축주택 거주기간 71개월"))).toBe(true);
    expect(m.some(overflow)).toBe(false);
  });
});

describe("RD-4 신고서 표 — 빈 구간은 퇴거일 칸에 양도일을 찍지 않는다", () => {
  const mockRates = makeMockRates();
  const result = calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date(TRANSFER),
    }),
    mockRates,
  );
  const cell = (asset: AssetForm, label: string) => {
    const form = { ...createDefaultTransferFormData(), transferDate: TRANSFER, assets: [asset] } as TransferFormData;
    return buildRows(result, "single", form).find((r) => r.label === label)?.values.total;
  };

  it("[RD-4a] 토지(거주 입력 없음) + 기본 빈 구간 → 입주일·퇴거일 모두 「-」", () => {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionDate: "2010-01-01" } as AssetForm;
    expect(cell(land, "입주일")).toBe("-");
    expect(cell(land, "퇴거일")).toBe("-");
  });

  it("[RD-4b] 짝 — 입주일만 있고 퇴거일이 비면 종전대로 양도일로 마감한다", () => {
    const a = housing({ residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2023-07-01", moveOutDate: "" }] });
    expect(cell(a, "퇴거일")).not.toBe("-");
  });
});
