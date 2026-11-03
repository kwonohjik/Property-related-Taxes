/**
 * anchor — §97의4 자진말소일 입력의 클라이언트·API 파이프라인 (2026-11-03)
 *
 * ② initial · ③ normalize(구 세션) · ④ API 변환(토글 + 날짜 · 사목이면 ⑪ 연장 사실 미전송) · ⑫ Zod(침묵 stripping 없음) ·
 * ⑭ Route(Date 변환) · 엔진 도달(router 명시 매핑) · ⑧ validate(엔진과 같은 기한 판정 · 자동말소와 배타).
 */
import { describe, it, expect } from "vitest";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { evaluateRental97Lthd } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
import { rental974PeriodSegmentsString } from "@/lib/calc/rental-97-effective-start";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

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
const VOL = { isVoluntaryCancelled974: true, voluntaryCancelledDate974: "2024-03-04" };

const toEngine = (r: AssetReductionForm) => {
  const [api] = toEngineReductions([r], owner) as Any[];
  const parsed = reductionSchema.safeParse(JSON.parse(JSON.stringify(api)));
  expect(parsed.success).toBe(true);
  return { api, zod: (parsed as Any).data, engine: (mapReductionsToEngine([(parsed as Any).data]) as Any[])[0] };
};
const evaluate = (engine: Any, transferDate: string) =>
  evaluateRental97Lthd([engine], { transferDate: new Date(transferDate), acquisitionDate: new Date("2016-06-01") } as Any) as Any;

describe("② initial · ③ normalize", () => {
  it("② 기본값 — 자진말소 아님", () => {
    const d = getReductionDefault("rental_97_4") as Any;
    expect(d.isVoluntaryCancelled974).toBe(false);
    expect(d.voluntaryCancelledDate974).toBe("");
  });
  it("③ 구 세션(필드 없음) → 해당 없음, 이미 있으면 보존", () => {
    const run = (r: Record<string, unknown>) => {
      const a: Record<string, unknown> = { reductions: [{ type: "rental_97_4", rental974Category: "purchase_a", ...r }] };
      normalizeRentalAndSplitFields(a);
      return (a.reductions as Any[])[0];
    };
    expect(run({})).toMatchObject({ isVoluntaryCancelled974: false, voluntaryCancelledDate974: "" });
    expect(run(VOL)).toMatchObject(VOL);
  });
});

describe("④ API → ⑫ Zod → ⑭ Route → 엔진", () => {
  it("자진말소일이 벗겨지지 않고 Date로 엔진에 닿아 종점·사목 기한이 된다", () => {
    const { api, zod, engine } = toEngine(reduction({ ...VOL, isApartment974: "yes" }));
    expect(api.voluntaryCancelledDate974).toBe("2024-03-04");
    expect(zod.voluntaryCancelledDate974).toBe("2024-03-04"); // ⑫ stripping 없음
    expect(engine.voluntaryCancelledDate974).toBeInstanceOf(Date); // ⑭ string 미도달
    const r = evaluate(engine, "2026-06-01");
    expect(r.isEligible).toBe(false); // 사목 기한 2025.3.4. 경과 (router 명시 매핑)
  });

  it("토글 OFF면 날짜가 남아 있어도 싣지 않는다", () => {
    const { api } = toEngine(reduction({ isVoluntaryCancelled974: false, voluntaryCancelledDate974: "2024-03-04" }));
    expect(api.voluntaryCancelledDate974).toBeUndefined();
  });

  it("사목이면 숨은 ⑪ 연장 입력(미완 3호 포함)을 싣지 않는다 — ⑫ 400 방지", () => {
    const { api } = toEngine(
      reduction({ ...VOL, isApartment974: "yes", aptDeadlineExtension974: { status: "has", relocationAuthorizationDate: "2024-01-02" } }),
    );
    expect(api.aptDeadlineExtension974).toBeUndefined();
  });

  it("2020.8.18. 전 자진말소는 사목이 아니라 ⑪ 연장 사실을 그대로 싣는다", () => {
    const { api } = toEngine(
      reduction({ isVoluntaryCancelled974: true, voluntaryCancelledDate974: "2020-06-01", isApartment974: "yes", aptDeadlineExtension974: { status: "none" } }),
    );
    expect(api.aptDeadlineExtension974).toEqual({ confirmedNone: true });
  });

  it("⑤ 임대기간 미리보기도 자진말소일에서 끝난다", () => {
    expect(rental974PeriodSegmentsString(reduction(VOL) as Any, "2026-06-01").own).toEqual({ start: "2017-01-02", end: "2024-03-04" });
  });
});

describe("⑧ validate — 엔진과 같은 조건", () => {
  const check = (transferDate: string, over: Record<string, unknown> = {}) => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2016-06-01", reductions: [reduction(over)] };
    return validateStep2Reductions(2, { assets: [asset], transferDate } as unknown as TransferFormData)?.message ?? "";
  };

  it("자진말소 날짜 빈 칸 → 차단", () => {
    expect(check("2026-06-01", { isVoluntaryCancelled974: true, voluntaryCancelledDate974: "" })).toContain("자진말소일을 입력");
  });
  it("자진말소일 > 양도일 → 차단", () => {
    expect(check("2026-06-01", { isVoluntaryCancelled974: true, voluntaryCancelledDate974: "2026-07-01" })).toContain("양도일 이전");
  });
  it("자동말소와 함께 → 차단", () => {
    expect(check("2026-06-01", { ...VOL, isAutoCancelled974: true, autoCancelledDate974: "2024-03-04" })).toContain("하나만");
  });
  it("🔴 사목 기한(2025.3.4.) 뒤 양도 + 아파트 미선택 → 차단 (엔진 MISSING_APARTMENT_974 — 2027.12.31. 전이어도)", () => {
    expect(check("2026-06-01", VOL)).toContain("아파트(도시형 생활주택 제외)인지 선택");
  });
  it("사목 기한 안 양도 + 아파트 미선택 → 통과", () => {
    expect(check("2025-03-04", VOL)).toBe("");
  });
  it("사목이면 숨은 ⑪ 「연장 사유 있음」 미완도 막지 않는다 (⑤ 숨김과 같은 범위)", () => {
    expect(check("2025-03-04", { ...VOL, isApartment974: "yes", aptDeadlineExtension974: { status: "has" } })).toBe("");
  });
  it("⑪1호 연동 — 자동말소 2027.6.1. + 2028.5.1. 양도 + 아파트 미선택 → 기한 안이라 통과", () => {
    expect(check("2028-05-01", { isAutoCancelled974: true, autoCancelledDate974: "2027-06-01" })).toBe("");
  });
});
