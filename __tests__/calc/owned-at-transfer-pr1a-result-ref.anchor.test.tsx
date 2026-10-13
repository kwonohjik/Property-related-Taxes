/**
 * @vitest-environment jsdom
 *
 * PR1a-④ (S03-8) — 판정 메뉴 결과 「주택 수 산정」의 「보유 주택 N」은 명부 화면 No.(`form.houses` 순번)와 같다.
 *
 * 엔진의 `houseNo`는 `housesOwnedAtTransfer`로 거른 **엔진 명부** 순번이라(D2), 양도일 당일·이후 행이 앞에 있으면
 * 화면 No.와 어긋난다. 결과뷰는 폼 명부를 받으면 계산기 형제(`countExclusionHouseRef`)와 같은 정의로 번호를 매기고,
 * 폼이 없는 화면(이력 상세)에서만 엔진 `houseNo`로 후퇴한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const T = "2024-06-01";
const house = (id: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    isSpouseOwned: false,
    isCoInherited: false,
    ...over,
  }) as HouseEntry;

function form(houses: HouseEntry[]): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: T,
    contractTotalPrice: "1000000000",
    residencePeriodMonths: "60",
    assets: [{ ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionDate: "2019-06-01" }],
    houses,
  };
}
const INH = house("inh", { acquisitionDate: "2020-03-01", isInherited: true, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, inheritedDate: "2020-03-01" });

async function resultText(f: OneHouseJudgmentFormData, withForm = true) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const { container } = render(<OneHouseJudgmentResultView result={json.data} transferDate={T} houses={withForm ? f.houses : undefined} />);
  return container.textContent ?? "";
}

describe("S03-8 판정 결과 「보유 주택 N」 = 명부 화면 No.", () => {
  it("[P(같은 날), INH] — 명부 No.2인 상속주택은 결과에서도 「보유 주택 2」", async () => {
    const t = await resultText(form([house("p", { acquisitionDate: T }), INH]));
    expect(t).toContain("보유 주택 2 (2020-03-01 취득)");
    expect(t).not.toContain("보유 주택 1 (2020-03-01 취득)");
  });
  it("[짝] [P(양도일 전), INH] → 2로 일치", async () => {
    const t = await resultText(form([house("p", { acquisitionDate: "2023-01-01" }), INH]));
    expect(t).toContain("보유 주택 2 (2020-03-01 취득)");
  });
  it("[짝] [INH, P(양도일 뒤)] → 1로 일치", async () => {
    const t = await resultText(form([INH, house("p", { acquisitionDate: "2024-12-01" })]));
    expect(t).toContain("보유 주택 1 (2020-03-01 취득)");
  });
  it("폼 명부가 없는 화면(이력 상세) — 엔진 순번으로 후퇴한다(종전 그대로)", async () => {
    const t = await resultText(form([house("p", { acquisitionDate: T }), INH]), false);
    expect(t).toContain("보유 주택 1 (2020-03-01 취득)");
  });
});
