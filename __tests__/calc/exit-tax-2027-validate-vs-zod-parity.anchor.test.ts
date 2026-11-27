/**
 * 국외전출세 2027.1.1. 개정 — ⑧ ↔ ⑫ 패리티 격자 (같은 폼이면 같은 판정)
 *
 * ⑧(`validateAllSteps` — 클라이언트)과 ⑫(`exitTaxInputSchema` — 서버 Zod)은 **같은 body**(④ `buildExitTaxApiBody`)를 보고
 * 입력 결함 판정을 **같은 엔진**(`findExitTaxInputProblem`)에 맡긴다. 이 격자는 그 합의를 케이스로 고정한다:
 * UI가 통과시키는데 API가 거부하는 모순(또는 반대)이 없어야 한다.
 *
 * 합의된 비대칭(⑧이 더 엄격 — 입력 완결성): 아래 `STRICTER` 목록. ⑧이 막고 ⑫가 허용하는 것은 의도이며,
 * 반대(⑫가 막는데 ⑧이 통과)는 어떤 케이스에도 없어야 한다.
 */
import { describe, it, expect } from "vitest";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-exit-tax-schema";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { exitActual as act, exitForm, F1, F1_SOLD, H1 } from "../_helpers/exit-tax-2027-form";

const ALL_CHECKS = {
  etForeignWorkerIsOfficerOrEmployee: true,
  etForeignWorkerIsNotDailyWorker: true,
  etForeignWorkerDomesticRatio80: true,
  etForeignWorkerDeparted6Months: true,
};

function client(form: StockTransferFormData) {
  return validateAllSteps(form).filter((e) => e.severity === "error");
}
function server(form: StockTransferFormData) {
  return exitTaxInputSchema.safeParse(buildExitTaxApiBody(form));
}

type Case = { name: string; form: StockTransferFormData; blocked: boolean };

/** ⑧·⑫가 **같이** 통과/차단해야 하는 격자 */
const GRID: Case[] = [
  { name: "G-1 국외 F1 단독(외화) 2027-01-01", form: exitForm(), blocked: false },
  { name: "G-2 국내 H1 단독(2027 출국)", form: exitForm({ etHoldings: [H1()] }), blocked: false },
  { name: "G-3 H1+F1 배분 없음 → 구분 둘 이상은 배분 필수", form: exitForm({ etHoldings: [H1(), F1()] }), blocked: true },
  {
    name: "G-4 H1+F1 배분 (2,500,000 / 0) 합계 일치",
    form: exitForm({ etHoldings: [H1(), F1()], etBasicDeductionAllocClause1: "2,500,000", etBasicDeductionAllocClause2b: "0" }),
    blocked: false,
  },
  {
    name: "G-5 H1+F1 배분 합계 불일치",
    form: exitForm({ etHoldings: [H1(), F1()], etBasicDeductionAllocClause1: "1,000,000", etBasicDeductionAllocClause2b: "0" }),
    blocked: true,
  },
  {
    name: "G-6 H1+F1 배분 한 구분만 입력(다른 과세 구분 비움 — 0 자동 채움 없음)",
    form: exitForm({ etHoldings: [H1(), F1()], etBasicDeductionAllocClause1: "2,500,000" }),
    blocked: true,
  },
  {
    name: "G-7 출국일 환율 소수 5자리",
    form: exitForm({ etHoldings: [F1({ departureExchangeRate: "1300.12345" })] }),
    blocked: true,
  },
  {
    name: "G-8 가족 외국인근로자 — 가족 구분 미선택",
    form: exitForm({ etForeignWorkerStatus: "foreign_worker_family", ...ALL_CHECKS, etForeignWorkerStartDate: "2024-01-01" }),
    blocked: true,
  },
  {
    name: "G-9 가족 외국인근로자 — 근로 개시일 미입력",
    form: exitForm({ etForeignWorkerStatus: "foreign_worker_family", ...ALL_CHECKS, etForeignWorkerFamilyKind: "spouse" }),
    blocked: true,
  },
  {
    name: "G-10 가족 외국인근로자 — 구분·근로 개시일 모두 입력 (취득일 2018 < 개시일 2024 → 제외, 전부 제외 → 납세의무 없음)",
    form: exitForm({
      etForeignWorkerStatus: "foreign_worker_family",
      ...ALL_CHECKS,
      etForeignWorkerFamilyKind: "spouse",
      etForeignWorkerStartDate: "2024-01-01",
    }),
    blocked: false,
  },
  {
    name: "G-11 외국인근로자 본인 — 요건 체크 없이(모두 false) 선택해도 통과(과세 계산) · 자동 제외하지 않음",
    form: exitForm({ etForeignWorkerStatus: "foreign_worker" }),
    blocked: false,
  },
  {
    name: "G-12 era 밖(2026-12-31) + 완성된 국외 행 → 제외·고지로 통과",
    form: exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1(), F1()] }),
    blocked: false,
  },
  {
    name: "G-13 era 밖 + 외화 환율 빈값 → 엔진이 환산 단계에서 거부(제외 전)",
    form: exitForm({ etDepartureDate: "2026-12-31", etHoldings: [F1({ departureExchangeRate: "" })] }),
    blocked: true,
  },
  {
    name: "G-14 era 밖 + status family는 숨은 값이라 무시(미전송) → 통과",
    form: exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1()], etForeignWorkerStatus: "foreign_worker_family" }),
    blocked: false,
  },
  {
    name: "G-15 구분 간 손실(국외 차익 + 국내 손실) → 차단",
    form: exitForm({
      etHoldings: [
        H1({ perShareAcquisitionPrice: "60,000" }), // 국내 시가 50,000 < 취득 60,000 → 손실
        F1(),
      ],
      etBasicDeductionAllocClause1: "0",
      etBasicDeductionAllocClause2b: "2,500,000",
    }),
    blocked: true,
  },
  {
    name: "G-16 2호 과세 종목 + 종목별 실제 양도(전량) → 통과 (PR-7b: 종목별 입력이 «미지원 차단»을 대신한다)",
    form: exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] }),
    blocked: false,
  },
  {
    name: "G-17 국내 행에 외화 모드(깨진 상태) → 차단",
    form: exitForm({ etHoldings: [H1({ departureDayValuationMode: "foreign_market_price" })] }),
    blocked: true,
  },
  {
    name: "G-18 국외 행에 국내 비상장 평가 모드 → 2027에서는 차단",
    form: exitForm({ etHoldings: [F1({ departureDayValuationMode: "unlisted_std", unlistedStdPricePerShare: "1,000,000" })] }),
    blocked: true,
  },
  {
    name: "G-19 거주 3년(납세의무 없음) — 국외 행이 완성돼 있으면 통과",
    form: exitForm({ etYearsResidentLast10: "3" }),
    blocked: false,
  },
  // ── PR-7b 종목별 실제 양도 ──
  {
    name: "G-20 F1 부분 양도(400주) 통과",
    form: exitForm({ etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, shareCount: "400" }) })] }),
    blocked: false,
  },
  {
    name: "G-21 F1 양도 주수가 보유 주수 초과 → 엔진 차단",
    form: exitForm({ etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, shareCount: "1,001" }) })] }),
    blocked: true,
  },
  {
    name: "G-22 F1 외화 양도가 비움 → 차단",
    form: exitForm({ etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, priceForeign: "" }) })] }),
    blocked: true,
  },
  {
    name: "G-23 F1 실제 양도일 기준환율 비움 → 차단(대체 환율 없음)",
    form: exitForm({ etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, exchangeRate: "" }) })] }),
    blocked: true,
  },
  {
    name: "G-24 F1 외국납부세액(외화)인데 납세일 환율 비움 → 차단",
    form: exitForm({
      etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, foreignTaxInput: "foreign", foreignTaxPaidForeign: "10000" }) })],
    }),
    blocked: true,
  },
  {
    name: "G-25 F1 외국납부세액(원화) 통과",
    form: exitForm({
      etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, foreignTaxInput: "krw", foreignTaxPaid: "5,000,000" }) })],
    }),
    blocked: false,
  },
  {
    name: "G-26 F1 실제 양도일이 출국일보다 앞 → 엔진 차단",
    form: exitForm({ etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, transferDate: "2026-12-31" }) })] }),
    blocked: true,
  },
  {
    name: "G-27 H1 단독 · 종목별 방식 선택 · 부분 양도 통과(1호뿐이면 선택 가능)",
    form: exitForm({
      etActualTransferMode: "per_holding",
      etHoldings: [H1({ actualTransfer: act({ shareCount: "5,000", pricePerShare: "40,000" }) })],
    }),
    blocked: false,
  },
  {
    name: "G-28 H1+F1 배분 + 두 종목 모두 양도 통과",
    form: exitForm({
      etHoldings: [
        H1({ actualTransfer: act({ shareCount: "10,000", pricePerShare: "40,000" }) }),
        F1({ actualTransfer: F1_SOLD }),
      ],
      etBasicDeductionAllocClause1: "2,500,000",
      etBasicDeductionAllocClause2b: "0",
    }),
    blocked: false,
  },
  {
    name: "G-29 제외 종목(5억 이하 국외)에 실제 양도 입력 + 종목별 방식 → 엔진 차단",
    form: exitForm({
      etActualTransferMode: "per_holding",
      etHoldings: [
        H1(),
        F1({
          departureDayPriceForeign: "100",
          perShareAcquisitionPriceForeign: "40",
          actualTransfer: act({ shareCount: "10", priceForeign: "90", exchangeRate: "1200" }),
        }),
      ],
    }),
    blocked: true,
  },
  {
    name: "G-30 H1 단독 · 종목 공통(전역) 방식 · 전역 입력 통과(1호 단일 구분 현행)",
    form: exitForm({
      etHoldings: [H1()],
      etDeferralRequested: true,
      etActualTransferDate: "2027-06-01",
      etActualTransferPricePerShare: "40,000",
    }),
    blocked: false,
  },
];

/** ⑧이 더 엄격한 합의된 케이스 — ⑫(엔진 판정만)는 통과시킨다 */
const STRICTER: Case[] = [
  // ── PR-7b — 방식 충돌: ④가 모드가 다른 값을 body에 싣지 않으므로 ⑫(body)는 보지 못한다. 직접 API 호출은 엔진이 동시 입력을 거부한다 ──
  {
    name: "S-4 2호 과세 종목(종목별 방식 강제) + 전역 실양도 입력이 남음 — 숨은 전역 값은 ④가 싣지 않고 ⑧이 막는다",
    form: exitForm({ etDeferralRequested: true, etActualTransferDate: "2027-06-01", etActualTransferPricePerShare: "1,000,000" }),
    blocked: true,
  },
  {
    name: "S-5 전역 방식(H1 단독·기본)인데 종목별 입력이 남음 — ④가 싣지 않고 ⑧이 막는다",
    form: exitForm({ etHoldings: [H1({ actualTransfer: act({ shareCount: "5,000", pricePerShare: "40,000" }) })] }),
    blocked: true,
  },
  {
    name: "S-6 2026 출국 + 종목별 입력이 남음 — 전역만 쓰는 구간",
    form: exitForm({
      etDepartureDate: "2026-12-31",
      etHoldings: [H1({ actualTransfer: act({ shareCount: "5,000", pricePerShare: "40,000" }) })],
    }),
    blocked: true,
  },
  {
    name: "S-7 외국법인 발행 국외주식에 비거주자 원천징수액 — ④가 싣지 않고 ⑧이 막는다(엔진 V-14와 같은 사유)",
    form: exitForm({
      etHoldings: [F1({ actualTransfer: act({ ...F1_SOLD, domesticSourceTaxWithheld: "1,000,000" }) })],
    }),
    blocked: true,
  },
  {
    name: "S-1 취득일이 출국일보다 늦음(국외 행) — 입력 일관성 검사는 ⑧만",
    form: exitForm({ etHoldings: [F1({ acquisitionDate: "2027-06-01" })] }),
    blocked: true,
  },
  {
    name: "S-2 가족 근로 개시일이 출국일보다 늦음 — ⑧만",
    form: exitForm({
      etForeignWorkerStatus: "foreign_worker_family",
      ...ALL_CHECKS,
      etForeignWorkerFamilyKind: "spouse",
      etForeignWorkerStartDate: "2028-01-01",
    }),
    blocked: true,
  },
  {
    name: "S-3 출국일 시가 0 — 국내 원화 경로와 같은 규칙(시가 > 0)",
    form: exitForm({ etHoldings: [F1({ departureDayPriceForeign: "0" })] }),
    blocked: true,
  },
];

describe("⑧ ↔ ⑫ 패리티 격자", () => {
  for (const c of GRID) {
    it(c.name, () => {
      const c8 = client(c.form);
      const s12 = server(c.form);
      // 같은 판정
      expect(c8.length > 0, `⑧ ${JSON.stringify(c8.map((e) => e.message))}`).toBe(c.blocked);
      expect(!s12.success, `⑫ ${s12.success ? "통과" : JSON.stringify(s12.error.issues.map((i) => i.message))}`).toBe(c.blocked);
    });
  }

  for (const c of STRICTER) {
    it(`${c.name} — ⑧만 차단, ⑫는 통과 (⑫가 막는데 ⑧이 통과하는 반대 모순은 없다)`, () => {
      expect(client(c.form).length > 0).toBe(true);
      expect(server(c.form).success).toBe(true);
    });
  }

  it("엔진 판정 문구는 ⑧과 ⑫가 같다 (G-7 환율 자릿수)", () => {
    const form = exitForm({ etHoldings: [F1({ departureExchangeRate: "1300.12345" })] });
    const msg8 = client(form).map((e) => e.message);
    const s12 = server(form);
    expect(s12.success).toBe(false);
    const msg12 = s12.success ? [] : s12.error.issues.map((i) => i.message);
    expect(msg8.some((m) => msg12.includes(m))).toBe(true);
  });
});
