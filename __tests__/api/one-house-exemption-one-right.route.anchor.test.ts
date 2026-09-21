/**
 * P4-3b 앵커 — 판정 메뉴의 §89①4호 1세대1입주권 비과세
 *
 * 계획서 Q-7. §155⑳(P4-3a)과 **방향이 반대**다 — 여기는 비과세를 **켠다**.
 * `checkExemption`의 자산 게이트(`propertyType !== "housing"` — `transfer-tax-exemption.ts:197`)가
 * 입주권을 항상 과세로 돌려보내므로, 켜 주지 않으면 판정 메뉴는 §89①4호를 영원히 말하지 못한다.
 *
 * ## 🔴 주택 수 축이 갈린다
 *
 * 가목은 「다른 주택을 보유하지 **아니할** 것」 = 0채를 요구한다. `buildHousesPayload`가 붙이는
 * `selling` 행을 주택으로 세면 **명부가 비어도 1채**가 되어 가목이 절대 성립하지 않는다.
 * OR-8·OR-9가 그 두 축(주택 수·입주권 수)을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import {
  deriveHouseholdHousingCount,
  deriveHouseholdRightCount,
} from "@/lib/tax-engine/one-house/house-count";
import { applyOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const BASE = {
  propertyType: "right_to_move_in",
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
  householdHousingCount: 0,
  residencePeriodMonths: 60,
  annualBasicDeductionUsed: 0,
  reductions: [],
  oneRightExemptionFacts: { eligibleAtApproval: true },
} as const;

async function post(over: Record<string, unknown> = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  return { status: res.status, json: await res.json() };
}

/** 명부 행(본문 형태) — `houseBody`와 같은 최소 형상. */
const houseBody = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  region: "capital",
  acquisitionDate: "2023-01-01",
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

const rightBody = (id: string, type: "presale_right" | "redevelopment_right") => ({
  id,
  type,
  acquisitionDate: "2022-01-01",
  region: "capital",
});

describe("판정 메뉴 §89①4호 — route", () => {
  it("[OR-1] 주택 양도면 이 축을 묻지 않는다", async () => {
    const { status, json } = await post({
      propertyType: "housing",
      oneRightExemptionFacts: undefined,
    });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption).toBeUndefined();
  });

  /** 🔴 주택 수 파생의 두 번째 갈래 — 명부가 비면 **0채**다(1채가 아니다). */
  it("[OR-2] 입주권 양도 + 가목 → 전액 비과세, 주택 수 0채", async () => {
    const { status, json } = await post();
    expect(status).toBe(200);
    expect(json.data.houseCount.total).toBe(0);
    expect(json.data.oneRightExemption.clause).toBe("ga");
    expect(json.data.judgment.isExempt).toBe(true);
    expect(json.data.judgment.isPartialExempt).toBe(false);
  });

  it("[OR-3] 12억 초과면 부분 비과세다 (각 목 외의 부분 단서)", async () => {
    const { status, json } = await post({ transferPrice: 1_500_000_000 });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption.clause).toBe("ga");
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.isPartialExempt).toBe(true);
  });

  it("[OR-4] 인가일 요건 자기선언이 없으면 미성립이고 사유가 나온다", async () => {
    const { status, json } = await post({
      oneRightExemptionFacts: { eligibleAtApproval: false },
    });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption.clause).toBeNull();
    expect(json.data.oneRightExemption.reasons.join(" ")).toContain("인가일");
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[OR-5] 나목 — 1주택 취득일부터 3년 이내면 성립한다", async () => {
    const { status, json } = await post({
      houses: [houseBody("h1", { acquisitionDate: "2023-01-01" })],
      oneRightExemptionFacts: {
        eligibleAtApproval: true,
        otherHouseAcquisitionDate: "2023-01-01",
      },
    });
    expect(status).toBe(200);
    expect(json.data.houseCount.total).toBe(1);
    expect(json.data.oneRightExemption.clause).toBe("na");
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[OR-6] 나목 — 3년을 넘기면 미성립이고 사유가 나온다", async () => {
    const { status, json } = await post({
      houses: [houseBody("h1", { acquisitionDate: "2019-01-01" })],
      oneRightExemptionFacts: {
        eligibleAtApproval: true,
        otherHouseAcquisitionDate: "2019-01-01",
      },
    });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption.clause).toBeNull();
    expect(json.data.oneRightExemption.reasons.join(" ")).toContain("3년");
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[OR-7] 세대가 분양권을 보유하면 두 목 모두 미성립이다", async () => {
    const { status, json } = await post({
      presaleRights: [rightBody("p1", "presale_right")],
    });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption.clause).toBeNull();
    expect(json.data.oneRightExemption.reasons.join(" ")).toContain("분양권");
  });

  /** 🔴 입주권 수 파생 — 명부 입주권 1건 + 양도 대상 = **2개**라 본문이 깨진다. */
  it("[OR-8] 명부에 다른 입주권이 있으면 「1개 보유」가 아니다", async () => {
    const { status, json } = await post({
      presaleRights: [rightBody("r1", "redevelopment_right")],
    });
    expect(status).toBe(200);
    expect(json.data.oneRightExemption.clause).toBeNull();
    expect(json.data.oneRightExemption.reasons.join(" ")).toContain("1개");
  });
});

describe("판정 메뉴 §89①4호 — 파생 leaf", () => {
  const h = (id: string): HouseInfo =>
    ({ id, region: "capital", acquisitionDate: new Date("2020-01-01") }) as HouseInfo;

  it("[OR-9] 주택 수 — 양도 대상이 주택이 아니면 `selling` 행을 빼고 센다", () => {
    // 명부 없음: 주택 양도 1채 / 입주권 양도 0채
    expect(deriveHouseholdHousingCount(undefined, true)).toBe(1);
    expect(deriveHouseholdHousingCount(undefined, false)).toBe(0);
    // `selling` + 다른 1채: 주택 양도 2채 / 입주권 양도 1채
    const list = [h("selling"), h("h1")];
    expect(deriveHouseholdHousingCount(list, true)).toBe(2);
    expect(deriveHouseholdHousingCount(list, false)).toBe(1);
  });

  it("[OR-10] 입주권 수 — 양도 대상을 포함하고 분양권은 세지 않는다", () => {
    const rights = [
      { type: "redevelopment_right" as const },
      { type: "presale_right" as const },
    ];
    expect(deriveHouseholdRightCount(rights, true)).toBe(2);
    expect(deriveHouseholdRightCount(rights, false)).toBe(1);
    expect(deriveHouseholdRightCount(undefined, true)).toBe(1);
    expect(deriveHouseholdRightCount(undefined, false)).toBe(0);
  });

  it("[OR-11] 기본값은 종전 동작이다 (주택 양도 전제)", () => {
    expect(deriveHouseholdHousingCount(undefined)).toBe(1);
    expect(deriveHouseholdHousingCount([h("selling"), h("h1")])).toBe(2);
  });

  it("[OR-12] 미성립이면 판정을 건드리지 않는다 (이미 과세)", () => {
    const judgment = {
      isExempt: false,
      isPartialExempt: false,
      appliedExceptions: [],
      pending: [],
      undetermined: [],
      legalBasis: [],
    } as unknown as OneHouseJudgment;
    const verdict = {
      clause: null,
      isExempt: false,
      isPartialExempt: false,
      reasons: ["x"],
      legalBasis: "소득세법 §89 ① 4호",
    };
    expect(applyOneRightVerdict(judgment, verdict)).toBe(judgment);
  });

  it("[OR-13] 성립하면 새 객체로 비과세를 켜고 특례를 덧붙인다 (원본 불변)", () => {
    const judgment = {
      isExempt: false,
      isPartialExempt: false,
      appliedExceptions: [],
      pending: [],
      undetermined: [],
      legalBasis: [],
    } as unknown as OneHouseJudgment;
    const out = applyOneRightVerdict(judgment, {
      clause: "ga",
      isExempt: true,
      isPartialExempt: false,
      reasons: [],
      legalBasis: "소득세법 §89 ① 4호",
    });
    expect(out).not.toBe(judgment);
    expect(out.isExempt).toBe(true);
    expect(out.appliedExceptions).toHaveLength(1);
    expect(judgment.isExempt).toBe(false);
  });
});
