/**
 * D-46 · D-59 anchor — ⑳ 「명부 장기임대 행」 술어는 양도 주택 행을 세지 않고(`rosterRentalRows`), 6.55 재판정은 뺀 행에 연결된 선언을
 * 함께 걷어낸다(`withoutRosterRows`).
 *
 * D-46: 판정 메뉴와 중과 메뉴는 같은 store를 쓴다. 중과 메뉴에서 양도 주택 자신의 §167의3①2호(장기임대) 선언을 켜면 그 선언이 중과 메뉴
 *   본문·핸드오프 계산기에 실린다. 종전 술어(`houses.some(h => h.isLongTermRental)`)가 그 행을 명부 장기임대 행으로 읽어 ⑳ 불성립 과세
 *   사안(사전-2016-법령해석재산-0584 E193-era 등)이 중과 메뉴 요약·계산기에서 비과세가 됐다. 1주택 메뉴는 그 선언을 싣지 않아 과세였다.
 *   「소득세법 시행령」 §155⑳ 「장기임대주택 … 과 그 밖의 1주택을 … 소유하고 있는 1세대가 … 해당 1주택(거주주택)을 양도하는 경우」 —
 *   양도하는 거주주택은 장기임대주택 축이 아니다. 같은 영 §167의3①2호는 중과 배제 축이고 주택 수 불산입은 1·12호뿐이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { POST as surchargePOST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, runCalc, runJudgment, withToday } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const caseById = (file: string, id: string): RulingCase =>
  ([] as RulingCase[])
    .concat(JSON.parse(fs.readFileSync(path.join(__dirname, "one-house-rulings/cases", file), "utf8")))
    .find((c) => c.id === id)!;

const with2ho = (form: OneHouseJudgmentFormData): OneHouseJudgmentFormData =>
  ({
    ...form,
    sellingHouseExclusion: {
      ...(form.sellingHouseExclusion ?? {}),
      longTermRental: { isLongTermRental: true, isRegisteredRental: true, rentalRegistrationDate: "2012-01-02", businessRegistrationDate: "2012-01-02" },
    },
  }) as OneHouseJudgmentFormData;

async function threeRoutes(c: RulingCase) {
  return withToday(c.today, async () => {
    const form = with2ho(buildCaseForm(c));
    const menu = await runJudgment(form);
    const res = await surchargePOST(
      new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildMultiHouseSurchargeApiBody(form)),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sur = ((await res.json()) as any).data;
    const t = handoff(form);
    t.assets[0] = { ...t.assets[0], fixedAcquisitionPrice: t.assets[0].fixedAcquisitionPrice || "100000000" };
    const calc = await runCalc(t);
    return { menu: menu.data?.judgment?.isExempt, surcharge: sur?.exemption?.judgment?.isExempt, calc: calc.result?.isExempt, headline: sur?.headline };
  });
}

describe("D-46 「양도 주택 2호 ON」 — 1주택 메뉴 · 중과 메뉴 요약 · 계산기가 같은 결론(과세)", () => {
  for (const [file, id] of [["E193.json", "E193-era"], ["E193.json", "E193-current"], ["E132.json", "E132-era"]] as const) {
    it(`${id} — 세 경로 모두 과세(수정 전: 중과 요약·계산기 비과세)`, async () => {
      const r = await threeRoutes(caseById(file, id));
      expect([r.menu, r.surcharge, r.calc]).toEqual([false, false, false]);
    });
  }
});
