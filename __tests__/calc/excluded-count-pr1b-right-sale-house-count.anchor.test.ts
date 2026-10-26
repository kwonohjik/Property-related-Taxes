/**
 * S03-6 anchor 초안 — 입주권 양도의 주택 수 명세는 §89①4호 판정과 같은 수를 보인다.
 * 근거: 소득세법 §89①4호 가목 「양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것」,
 *       시행령 §155②③은 「일반주택을 양도하는 경우」 §154①을 적용하는 규정 — 입주권의 「다른 주택」 수를 줄이지 않는다
 *       (엔진도 그 입장: judgment-pipeline `oneRightInputAfterSpecialActExclusion`은 조특 조문만 뺀다).
 * 경로: 판정 메뉴 ⑧ → ④ → one-house-exemption route 응답 houseCount.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { POST as JPOST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { hrow } from "./_owned-at-transfer-pr1a-helpers";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

async function judge(kind: string, houses: HouseEntry[]) {
  const f = createInitialOneHouseJudgmentForm();
  f.isOneHousehold = true; f.transferDate = "2024-06-01"; f.contractTotalPrice = "900000000";
  Object.assign(f.assets[0], { assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2010-04-09", redevExemptionEligibleAtApproval: "yes", residenceInputMode: "direct", residencePeriods: [], rentalHousingException: RH_ANSWERED_NO });
  f.houses = houses;
  expect(validateAllSteps(f).filter((e) => e.severity === "error")).toEqual([]);
  const res = await JPOST(new NextRequest("http://localhost/api/calc/one-house-exemption", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(buildOneHouseExemptionApiBody(f)) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as any).data as { houseCount: { countedForExemption: number; excluded: { legalBasis: string }[] }; judgment: { isExempt: boolean } };
}
const inh = (over: Partial<HouseEntry> = {}) => hrow({ id: "INH", acquisitionDate: "2015-03-01", isInherited: true, inheritedDate: "2015-03-01", isCoInherited: false, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, parentalCareMergeInheritedHouse: false, ...over } as Partial<HouseEntry>);

describe("S03-6 입주권 양도 — §155②③ 상속주택은 명세에서도 다른 주택으로 센다", () => {
  it("§155② 단독상속 → countedForExemption 1 · excluded에 §155② 없음 · 과세", async () => {
    const d = await judge("right_to_move_in", [inh()]);
    expect(d.judgment.isExempt).toBe(false);
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.houseCount.excluded.some((e) => e.legalBasis.includes("§155"))).toBe(false);
  });
  it("§155③ 공동상속 소수지분 → 같은 규칙", async () => {
    const d = await judge("right_to_move_in", [inh({ isCoInherited: true, coInheritedShareRatio: "0.3", isMajorityCoInheritor: false } as Partial<HouseEntry>)]);
    expect(d.houseCount.countedForExemption).toBe(1);
  });
  it("[형제 짝] 주택 양도 + §155② → 명세에서 제외(countedForExemption 1 = 양도 주택만) · 비과세", async () => {
    const d = await judge("housing", [inh()]);
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.houseCount.excluded.some((e) => e.legalBasis.includes("§155②"))).toBe(true);
    expect(d.judgment.isExempt).toBe(true);
  });
});
