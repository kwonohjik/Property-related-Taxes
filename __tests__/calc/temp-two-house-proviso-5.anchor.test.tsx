/**
 * anchor — 일시적 2주택 종전주택 × §154① 단서 5호(조정대상지역 공고 전 계약 · 거주요건만 면제)
 * (`docs/00-pm/temp-two-house-proviso-5.plan.md` · F-2 Q-F1 (a)·Q-F2 (b) 사용자 결정 2026-10-26).
 *
 * §155① 1문 「1세대1주택으로 보아 제154조제1항을 적용한다」 — 5호의 무주택은 계약금 지급일 현재라 그 뒤 일시적 2주택과 양립한다.
 * 5호는 §155① 2문 인용 밖이라 「1년 이상 지난 후 취득」 요건은 면제하지 않는다. 2026-07-19 배제 결정의 전제
 * (「무주택 모순」·「일시적 2주택 경로는 거주 미판정」)는 468d905b9(2026-07-29)가 E-3에 거주 판정을 넣으면서 무너졌다.
 *
 * 시료: 일반 주택 · 대전 유성(2020-06-19~2022-09-25 조정대상지역) 2020-08-01 취득 → 거주 2년 필요 · 거주 0 · 양도 10억 ·
 * 양도일 2023-06-01 · 명부에 다른 주택(경남 비조정) 1채. 수정 전에는 T5-1이 과세 190,366,000이었다.
 *
 * | # | 주장 |
 * |---|---|
 * | T5-1 | 계산기 — 일시적 2주택 + 5호 → ④ 본문에 5호 · 비과세 0 · 근거에 5호 · 확인 필요 고지 |
 * | T5-2 | 다른 주택을 1년 안에 취득 → 과세 그대로(5호는 1년 요건을 면제하지 않는다) |
 * | T5-3 | 단서 없음 → 과세(음성 짝) |
 * | T5-4 | 무주택 미확인 — 계산기 ④는 싣지 않아 과세(400 아님) · 판정 메뉴 ⑧은 막는다 |
 * | T5-5 | 정규화·집합 단위 — temp에서 5호 통과 · 나·다목·삭제 전 4호는 버림 · 1년 요건 집합엔 5호 없음 |
 * | T5-6 | 1주택 판정 메뉴 — 같은 사실관계가 같은 결론 · 적용 특례 행에 5호 |
 * | T5-7 | 화면 — temp 모드 옵션에 5호가 보이고 나·다목·4호는 안 보인다 |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";
import { runJudgment } from "./_one-house-pr6a-routes";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";
import { unconfirmedTempTwoHouseProviso5 } from "@/lib/calc/exemption-proviso-payload";
import { TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS, TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => cleanup());

const YUSEONG = "3020000000";
const NON_REGULATED = "4682025021";
const TAXED = 190_366_000;
const NOTICE = "§154① 단서 5호(조정대상지역 공고 전 계약)를 적용해 거주요건을 면제했습니다";
const PROVISO_5 = "pre_designation_contract" as const;

const other = (acq: string) =>
  houseRow("n1", acq, {
    region: "non_capital",
    regionCode: NON_REGULATED,
    officialPrice: "100000000",
    isApartment: false,
    acquisitionOrigin: "general",
  } as never);

function form(opts: { other?: string; proviso?: boolean; noHouse?: boolean }) {
  return redevAptForm({
    kind: "housing",
    houses: opts.other ? [other(opts.other)] : [],
    count: opts.other ? "2" : "1",
    price: "1000000000",
    assetOver: { acquisitionDate: "2020-08-01", regionCode: YUSEONG, residenceInputMode: "direct", residencePeriods: [] },
    formOver: {
      residencePeriodMonths: "0",
      transferDate: "2023-06-01",
      ...(opts.proviso ? { provisoReason: PROVISO_5, provisoPreContractNoHouse: opts.noHouse !== false } : {}),
    } as never,
  });
}

const warnings = (result: { warnings?: string[] }) => (result.warnings ?? []).join("\n");

describe("계산기 — 일시적 2주택 종전주택 × 5호", () => {
  it("T5-1 5호가 실려 거주요건을 면제 — 비과세 · 근거 · 확인 필요 고지", async () => {
    const f = form({ other: "2021-09-01", proviso: true });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.temporaryTwoHouse).toBeTruthy();
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: PROVISO_5, preContractNoHouse: true });
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("일시적 2주택 비과세 (§154① 단서 5호 공고전계약)");
    expect(warnings(r.result)).toContain(NOTICE);
  });

  it("T5-2 다른 주택을 1년 안에 취득하면 과세 — 5호는 1년 요건을 면제하지 않는다", async () => {
    const r = await runCalc(form({ other: "2021-03-01", proviso: true }));
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: PROVISO_5, preContractNoHouse: true });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED);
    expect(warnings(r.result)).not.toContain(NOTICE);
  });

  it("T5-3 단서 없음 — 거주요건 미충족 과세(음성 짝)", async () => {
    const r = await runCalc(form({ other: "2021-09-01" }));
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED);
  });

  it("T5-4 무주택 미확인 — 계산기 ④는 싣지 않아 과세(⑫ 400이 아니다) · 판정 메뉴 ⑧은 막는다", async () => {
    const f = form({ other: "2021-09-01", proviso: true, noHouse: false });
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.result.totalTax).toBe(TAXED);

    const m = await runJudgment(jForm({ proviso: true, noHouse: false }));
    expect(m.ve.some((e: string) => e.startsWith("error:provisoReason") && e.includes("무주택"))).toBe(true);
  });
});

describe("T5-5 정규화·집합", () => {
  it("일시적 2주택 맥락 — 5호는 통과, 나·다목·삭제 전 4호는 버린다", () => {
    expect(effectiveProvisoReason("temporary_two_house", PROVISO_5)).toBe(PROVISO_5);
    for (const r of ["overseas_migration", "overseas_residence", "rental_registration_4ho"]) {
      expect(effectiveProvisoReason("temporary_two_house", r), r).toBe("");
    }
    expect(effectiveProvisoReason("temporary_two_house", "expropriation")).toBe("expropriation");
  });
  it("1년 요건 면제 집합(§155① 2문)에는 5호가 없고, 받는 집합에는 있다", () => {
    expect(TEMP_TWO_HOUSE_PROVISO_REASONS.has(PROVISO_5)).toBe(false);
    expect(TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS.has(PROVISO_5)).toBe(true);
    for (const r of TEMP_TWO_HOUSE_PROVISO_REASONS) expect(TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS.has(r), r).toBe(true);
  });
  it("무주택 미확인 가드 — 일시적 2주택 맥락의 5호에만", () => {
    expect(unconfirmedTempTwoHouseProviso5("temporary_two_house", PROVISO_5, false)).toBe(true);
    expect(unconfirmedTempTwoHouseProviso5("temporary_two_house", PROVISO_5, true)).toBe(false);
    expect(unconfirmedTempTwoHouseProviso5("one_house", PROVISO_5, false)).toBe(false); // 1주택은 ⑧이 막는다
    expect(unconfirmedTempTwoHouseProviso5("temporary_two_house", "unavoidable", false)).toBe(false);
  });
});

function jForm(o: { proviso?: boolean; noHouse?: boolean; otherDate?: string }) {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2020-08-01",
        regionCode: YUSEONG,
        addressJibun: "대전 유성구 테스트동 1",
        residenceInputMode: "direct",
        residencePeriods: [],
      },
    ],
    transferDate: "2023-06-01",
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    residencePeriodMonths: "0",
    houses: [other(o.otherDate ?? "2021-09-01")],
    presaleRights: [],
    householdNoPresaleRightsConfirmed: true,
    ...(o.proviso ? { provisoReason: PROVISO_5, provisoPreContractNoHouse: o.noHouse !== false } : {}),
  } as unknown as OneHouseJudgmentFormData;
}

describe("T5-6 1주택 판정 메뉴 — 같은 결론", () => {
  it("일시적 2주택 + 5호 → 비과세 · 적용 특례에 5호 / 1년 안 취득 → 과세 / 단서 없음 → 과세", async () => {
    const yes = await runJudgment(jForm({ proviso: true }));
    expect(yes.status).toBe(200);
    expect(yes.ve.filter((e: string) => e.startsWith("error"))).toEqual([]);
    expect(yes.data.judgment.isExempt).toBe(true);
    expect(yes.data.judgment.appliedExceptions.map((e: { id: string }) => e.id)).toEqual([
      "155-1-temporary-two-house",
      `154-1-proviso:${PROVISO_5}`,
    ]);
    expect((await runJudgment(jForm({ proviso: true, otherDate: "2021-03-01" }))).data.judgment.isExempt).toBe(false);
    expect((await runJudgment(jForm({}))).data.judgment.isExempt).toBe(false);
  });
});

describe("T5-7 화면 — 일시적 2주택 맥락 옵션", () => {
  const props = {
    provisoReason: "" as const,
    provisoDepartureDate: "",
    provisoExpropriationDate: "",
    provisoBusinessApprovalDate: "",
    provisoRentalLeaseResidenceMonths: "",
    provisoPreContractNoHouse: false,
    provisoDepartureOnlyHouse: "" as const,
    mode: "temporary_two_house" as const,
    onChange: () => {},
  };
  it("5호가 보이고 나·다목·삭제 전 4호는 안 보인다 · 5호를 고르면 무주택 확인 칸", () => {
    render(<ExemptionProvisoSection {...props} />);
    expect(screen.getByTestId("proviso-reason-pre_contract")).toBeTruthy();
    expect(screen.getByTestId("proviso-reason-unavoidable")).toBeTruthy();
    for (const id of ["proviso-reason-overseas_migration", "proviso-reason-overseas_residence", "proviso-reason-rental_4ho"]) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    cleanup();
    render(<ExemptionProvisoSection {...props} provisoReason={PROVISO_5} />);
    expect(screen.getByText("계약금 지급일 현재 1세대 무주택")).toBeTruthy();
  });
});
