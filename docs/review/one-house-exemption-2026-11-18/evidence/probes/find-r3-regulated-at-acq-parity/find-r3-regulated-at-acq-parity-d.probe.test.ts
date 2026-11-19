/**
 * PROBE (find-r3-regulated-at-acq-parity) — D: 판정 메뉴 취득일 칸 안내(「재개발로 받은 신축주택이면 사용승인일」) × 주택 출자 원조합원
 * 판정 메뉴(사용승인일 입력 · 종전주택 취득일 입력) ↔ 계산기 원조합원 완공APT
 */
import { describe, it, vi, beforeEach } from "vitest";
import { writeFileSync, appendFileSync } from "node:fs";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  RATE_LIMIT_BYPASS_HEADER: "x-test-bypass",
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "../calc/_helpers/redev-one-house-route";
import { runJudgment } from "../calc/_one-house-pr6a-routes";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { RH_ANSWERED_NO } from "../calc/_helpers/phrp-154-10-answer";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const OUT = "<session>/scratchpad/probes/find-r3-regulated-at-acq-parity/d.txt";
const log = (s: string) => appendFileSync(OUT, s + "\n");
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const jForm = (acq: string): OneHouseJudgmentFormData =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        rentalHousingException: RH_ANSWERED_NO,
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: acq,
        regionCode: GANGNAM,
        addressJibun: "서울특별시 강남구 역삼동 1",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "12",
      } as AssetForm,
    ],
    transferDate: "2025-03-04",
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

describe("probe D", () => {
  it("grid", async () => {
    writeFileSync(OUT, "");
    for (const acq of ["2021-06-01", "2015-03-01"]) {
      const r = await runJudgment(jForm(acq));
      const d = r.data ?? {};
      log(
        `D judgment acq=${acq} status=${r.status} ve=${JSON.stringify(r.ve.filter((v) => v.startsWith("error")))} verdict=${JSON.stringify(d.verdict ?? d.result?.verdict ?? d.isExempt ?? null)} reason=${JSON.stringify(d.exemptReason ?? d.result?.exemptReason ?? "").slice(0, 200)} keys=${Object.keys(d).join(",")} err=${r.status !== 200 ? JSON.stringify(r.json).slice(0, 300) : ""}`,
      );
      log("  raw=" + JSON.stringify(d).slice(0, 900));
    }
    // 계산기 원조합원(주택 출자) 완공APT
    const f = redevAptForm({
      kind: "redevelopment_apt",
      price: "1000000000",
      assetOver: {
        acquisitionDate: "2015-03-01",
        regionCode: GANGNAM,
        addressJibun: "서울특별시 강남구 역삼동 1",
        redevApprovalDate: "2018-01-01",
        redevCompletionDate: "2021-06-01",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "12",
        redevPriorHouseResidenceMonths: "0",
        redevNewHouseResidenceMonths: "12",
      },
      formOver: { transferDate: "2025-03-04", filingDate: "2025-05-31", residencePeriodMonths: "12" } as never,
    });
    const r = await runCalc(f);
    log(`D calc original-member APT status=${r.status} exempt=${r.result?.isExempt} tax=${r.result?.determinedTax} issues=${JSON.stringify(r.issues.map((i) => i.field + ":" + i.message.slice(0, 60)))} reason=${r.result?.exemptReason}`);
    // 계산기 일반 주택(판정 메뉴 핸드오프 모양) 사용승인일 취득
    const g = redevAptForm({
      kind: "housing",
      price: "1000000000",
      assetOver: {
        acquisitionDate: "2021-06-01",
        regionCode: GANGNAM,
        addressJibun: "서울특별시 강남구 역삼동 1",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "12",
      },
      formOver: { transferDate: "2025-03-04", filingDate: "2025-05-31", residencePeriodMonths: "12" } as never,
    });
    const rg = await runCalc(g);
    log(`D calc housing acq=2021-06-01 status=${rg.status} exempt=${rg.result?.isExempt} tax=${rg.result?.determinedTax}`);
  });
});
