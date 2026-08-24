/**
 * anchor — F30 · §168의8⑤1호 편입유예 요건의 기산점은 **도시지역 편입일 소급 1년**이다
 *
 * # 결함 (정정 전)
 *
 * `farmland.ts`의 `hasAtLeastOneYearSelfFarming(combined)`은 인자가 구간 배열뿐이라
 * **보유기간 아무 곳**에 연속 365일 재촌·자경 구간이 있으면 true를 반환했다.
 * 호출부 스코프에는 `input.urbanIncorporationDate`가 있었고 바로 뒤의
 * `checkIncorporationGrace`가 이미 그 값을 쓰고 있었는데도 전달되지 않았다.
 *
 * 법문은 "「국토의 계획 및 이용에 관한 법률」에 따른 도시지역에 편입된 날부터 **소급하여**
 * 1년 이상 재촌하면서 자경하던 농지"다 — 기산점이 명시돼 있다.
 *
 * ⇒ "편입 직전 1년엔 자경 공백이었으나 과거에 1년 이상 자경했던" 도시지역 농지가
 *   ⑤1호를 충족한 것으로 처리되어 편입유예(⑥ 3년) 경로로 **사업용** 판정을 받았다.
 *
 * # 시나리오 (엔진 실측값)
 *
 * 도시지역(상업) 농지 · 2014-01-01 취득 → 2024-01-01 양도 · 재촌 전 기간 ·
 * 편입일 2021-06-01(유예 3년 창 안) · 자경 2021-12-31~2024-01-01(소급 1년 구간에 공백).
 *
 * # 범위 밖 (같은 PR에서 손대지 않은 것)
 *
 * `mode === "deemed"` 우회는 ⑤**2호**(제3항 각 호)에 대응하는 **별개 경로**다.
 * `checkFarmlandDeeming`의 주말·체험영농이 §168의8③ 각 호에 있는지는 별도 쟁점이며
 * 이 anchor의 범위가 아니다 — F30-6이 그 경로가 **건드려지지 않았음**만 고정한다.
 */
import { describe, it, expect } from "vitest";
import { judgeFarmland } from "@/lib/tax-engine/non-business-land/farmland";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (iso: string) => new Date(iso);

/** 소급 1년 구간에 공백이 있는 자경 이력 (편입일 2021-06-01 → 창 2020-06-01~2021-06-01) */
const SELF_FARMING_WITH_GAP = [
  { startDate: d("2021-12-31"), endDate: d("2024-01-01"), usageType: "self_farming" },
];
/** 소급 1년 창을 정확히 덮는 자경 이력 */
const SELF_FARMING_COVERING = [
  { startDate: d("2020-06-01"), endDate: d("2024-01-01"), usageType: "self_farming" },
];

const mk = (over: Partial<Record<string, unknown>> = {}): NonBusinessLandInput =>
  ({
    landType: "farmland",
    landArea: 1000,
    zoneType: "commercial", // 도시지역 — 편입유예 경로 진입
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    farmingSelf: true,
    businessUsePeriods: SELF_FARMING_WITH_GAP,
    gracePeriods: [],
    farmerResidenceDistance: 5, // 재촌 fallback (전 보유기간)
    urbanIncorporationDate: d("2021-06-01"),
    ...over,
  }) as unknown as NonBusinessLandInput;

const graceReqStep = (r: ReturnType<typeof judgeFarmland>) =>
  r.steps.find((s) => s.id === "region_grace_requirement");

describe("F30 · 편입유예 요건은 편입일 소급 1년만 본다", () => {
  it("F30-1: 🔴 소급 1년에 자경 공백이면 요건 미충족 — 과거 2년 자경으로 통과하지 않는다", () => {
    // 정정 전: region_grace_requirement 스텝 자체가 없고 isBusiness=true(사업용)였다.
    const r = judgeFarmland(mk(), R);
    expect(r.isBusiness).toBe(false); // 정정 전 true
    expect(graceReqStep(r)?.status).toBe("FAIL");
    expect(graceReqStep(r)?.detail).toContain("2021-06-01부터 소급 1년");
    expect(r.reason).toContain("편입유예 요건");
    // 요건에서 끊겼으므로 유예 창 판정(region_urban_grace)까지 가지 않는다.
    expect(r.steps.find((s) => s.id === "region_urban_grace")).toBeUndefined();
  });

  it("F30-2: 🛡️ 대조군 — 소급 1년 창을 덮으면 종전대로 통과한다 (과도 차단 방지)", () => {
    // 이 단언이 깨지면 「무조건 FAIL」로 잘못 고친 것이다.
    const r = judgeFarmland(mk({ businessUsePeriods: SELF_FARMING_COVERING }), R);
    expect(r.isBusiness).toBe(true);
    expect(graceReqStep(r)).toBeUndefined(); // 요건 통과 → FAIL 스텝 미기록
    expect(r.steps.find((s) => s.id === "region_urban_grace")?.status).toBe("PASS");
  });

  it("F30-3: 경계 — 창 시작보다 하루 늦게 시작한 자경은 미충족 (2020-06-02)", () => {
    const r = judgeFarmland(
      mk({
        businessUsePeriods: [
          { startDate: d("2020-06-02"), endDate: d("2024-01-01"), usageType: "self_farming" },
        ],
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(graceReqStep(r)?.status).toBe("FAIL");
  });

  it("F30-4: 편입일 미제공 → 기산점 부재로 미충족 (자동 통과 fallback 금지)", () => {
    // 판정(isBusiness=false)은 정정 전후 같다 — 정정 전에는 checkIncorporationGrace가 끊었다.
    // 달라진 것은 **어느 단계에서 왜 끊겼는지**이며, 자동 통과로 새는 경로가 없음을 고정한다.
    const r = judgeFarmland(mk({ urbanIncorporationDate: undefined }), R);
    expect(r.isBusiness).toBe(false);
    expect(graceReqStep(r)?.status).toBe("FAIL");
    expect(graceReqStep(r)?.detail).toContain("편입일 미제공");
  });

  it("F30-5: 취득 전 이미 편입된 농지 → 소급 1년이 소유 개시 전이라 미충족 (법문대로)", () => {
    const r = judgeFarmland(
      mk({
        urbanIncorporationDate: d("2013-01-01"), // 취득 2014-01-01 이전
        businessUsePeriods: [
          { startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "self_farming" },
        ],
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(graceReqStep(r)?.status).toBe("FAIL");
  });

  it("F30-6: 🛡️ 사용의제(⑤2호) 경로는 요건을 타지 않는다 — 범위 밖 유지 확인", () => {
    const r = judgeFarmland(
      mk({ businessUsePeriods: [], farmlandDeeming: { isReclaimed: true } }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "farmland_deeming")?.status).toBe("PASS");
    expect(graceReqStep(r)).toBeUndefined();
    expect(r.steps.find((s) => s.id === "region_urban_grace")?.status).toBe("PASS");
  });
});

// ────────────────────────────────────────────────────────────
describe("F30 · 세액", () => {
  const tax = (nbl: NonBusinessLandInput) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        isOneHousehold: false,
        nonBusinessLandDetails: nbl,
      }),
      makeMockRates(),
    );

  it("F30-7: 공백 케이스 261,240,000원 (정정 전 204,090,000원) · 대조군은 204,090,000원 유지", () => {
    const gap = tax(mk());
    expect(gap.calculatedTax).toBe(261_240_000); // 정정 전 204,090,000 (차 57,150,000 과소)
    expect(gap.surchargeType).toBe("non_business_land");

    const ctrl = tax(mk({ businessUsePeriods: SELF_FARMING_COVERING }));
    expect(ctrl.calculatedTax).toBe(204_090_000); // 정정 전후 불변
  });
});
