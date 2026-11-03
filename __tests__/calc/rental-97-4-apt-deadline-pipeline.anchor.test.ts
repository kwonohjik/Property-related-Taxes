/**
 * anchor — §97의4 가목2) 아파트 양도기한 입력의 클라이언트·API 파이프라인 (리뷰 2026-11-02 R-2)
 *
 * ② initial · ③ normalize(구 세션) · ④ API 변환(가목일 때만 · 연장 사실은 아파트일 때만) · ⑫ Zod(침묵 stripping 없음) ·
 * ⑭ Route(Date 변환) · 엔진 도달(router 명시 매핑) · ⑧ validate(엔진 `MISSING_APARTMENT_974`와 같은 조건).
 */
import { describe, it, expect } from "vitest";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { evaluateRental97Lthd } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const LATE = "2028-07-03";

function reduction(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    ...getReductionDefault("rental_97_4"),
    registrationDate: "2017-01-02",
    rentalStartDate: "2017-01-02",
    isTaxRegistered: true,
    taxRegistrationDate: "2017-01-02",
    rentIncreaseViolationMode: "none",
    rentalContinuesToTransfer: true,
    hasVacancyOverGrace: false,
    rental974Category: "purchase_a",
    region: "capital",
    officialPriceAtStart: "300,000,000",
    ...over,
  } as AssetReductionForm;
}
const owner = { acquisitionCause: "purchase" } as Any;

const toEngine = (r: AssetReductionForm) => {
  const [api] = toEngineReductions([r], owner) as Any[];
  const parsed = reductionSchema.safeParse(JSON.parse(JSON.stringify(api)));
  expect(parsed.success).toBe(true);
  return { api, zod: (parsed as Any).data, engine: (mapReductionsToEngine([(parsed as Any).data]) as Any[])[0] };
};
const evaluate = (engine: Any, transferDate: string) =>
  evaluateRental97Lthd([engine], { transferDate: new Date(transferDate), acquisitionDate: new Date("2016-06-01") } as Any) as Any;

describe("② initial · ③ normalize", () => {
  it("② 기본값 — 아파트 여부 미선택 · 연장 사실 없음(모름)", () => {
    const d = getReductionDefault("rental_97_4") as Any;
    expect(d.isApartment974).toBe("");
    expect(d.aptDeadlineExtension974).toBeUndefined();
  });
  it("③ 구 세션(필드 없음) → 미선택, 이미 있으면 보존", () => {
    const run = (r: Record<string, unknown>) => {
      const a: Record<string, unknown> = { reductions: [{ type: "rental_97_4", rental974Category: "purchase_a", ...r }] };
      normalizeRentalAndSplitFields(a);
      return (a.reductions as Any[])[0];
    };
    expect(run({}).isApartment974).toBe("");
    expect(run({ isApartment974: "yes" }).isApartment974).toBe("yes");
  });
});

describe("④ API → ⑫ Zod → ⑭ Route → 엔진", () => {
  it("아파트 + ⑪1호 날짜가 벗겨지지 않고 Date로 엔진에 닿아 기한을 늘린다", () => {
    const { api, zod, engine } = toEngine(
      reduction({ isApartment974: "yes", aptDeadlineExtension974: { status: "has", dutyPeriodEndCancellationDate: "2027-09-01" } }),
    );
    expect(api.isApartment974).toBe(true);
    expect(zod.isApartment974).toBe(true); // ⑫ stripping 없음
    expect(zod.aptDeadlineExtension974.dutyPeriodEndCancellationDate).toBe("2027-09-01");
    expect(engine.aptDeadlineExtension974.dutyPeriodEndCancellationDate).toBeInstanceOf(Date); // ⑭ string 미도달
    expect(evaluate(engine, LATE).isEligible).toBe(true); // 기한 2028.9.1.
  });

  it("🔴 아파트 + 「연장 사유 없음」 → 2028.7.3. 양도는 엔진에서 불적용 (router 명시 매핑)", () => {
    const { engine } = toEngine(reduction({ isApartment974: "yes", aptDeadlineExtension974: { status: "none" } }));
    expect(engine.aptDeadlineExtension974).toEqual(expect.objectContaining({ confirmedNone: true }));
    const r = evaluate(engine, LATE);
    expect(r.isEligible).toBe(false);
  });

  it("다목이면 아파트 값이 남아 있어도 싣지 않는다 · 아파트 아님이면 연장 사실을 싣지 않는다", () => {
    const c = toEngine(reduction({ rental974Category: "construction_c", isApartment974: "yes" })).api;
    expect(c.isApartment974).toBeUndefined();
    const n = toEngine(reduction({ isApartment974: "no", aptDeadlineExtension974: { status: "none" } })).api;
    expect(n.isApartment974).toBe(false);
    expect(n.aptDeadlineExtension974).toBeUndefined();
  });
});

describe("⑧ validate — 엔진과 같은 조건", () => {
  const check = (transferDate: string, over: Record<string, unknown> = {}) => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2016-06-01", reductions: [reduction(over)] };
    return validateStep2Reductions(2, { assets: [asset], transferDate } as unknown as TransferFormData)?.message ?? "";
  };

  it("2027.12.31.까지 양도면 아파트 여부 미선택도 통과 (엔진도 결론과 무관)", () => {
    expect(check("2027-12-31")).toBe("");
  });
  it("🔴 2028년 양도 + 미선택 → 차단 (엔진 MISSING_APARTMENT_974)", () => {
    expect(check(LATE)).toContain("아파트(도시형 생활주택 제외)인지 선택");
  });
  it("다목은 미선택이어도 통과", () => {
    expect(check(LATE, { rental974Category: "construction_c" })).toBe("");
  });
  it("아파트 + 「연장 사유 있음」인데 사실 없음 → 차단 (보내면 「모름」으로 조용히 바뀐다)", () => {
    expect(check("2026-06-01", { isApartment974: "yes", aptDeadlineExtension974: { status: "has" } })).toContain("§167의3⑪");
  });
  it("아파트 + 3호 인가일만 있고 이전고시 정보 없음 → 차단 (⑫ refine 400과 짝)", () => {
    expect(
      check(LATE, { isApartment974: "yes", aptDeadlineExtension974: { status: "has", relocationAuthorizationDate: "2027-03-01" } }),
    ).toContain("이전고시");
  });
});
