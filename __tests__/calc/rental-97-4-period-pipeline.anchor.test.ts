/**
 * anchor — §97의4 임대기간 입력(사업자등록일·상속·자동말소)의 클라이언트·API 파이프라인 (리뷰 2026-11-02 R-1·R-3·R-4)
 *
 * ② initial · ③ normalize(구 세션) · ④ API 변환(조건부 전송) · ⑫ Zod(침묵 stripping 없음) · ⑭ Route(Date 변환) ·
 * 엔진 도달(router 명시 매핑) · ⑧ validate · ⑤ 구간 미리보기(엔진과 같은 축).
 */
import { describe, it, expect } from "vitest";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { rental974PeriodSegmentsString } from "@/lib/calc/rental-97-effective-start";
import { evaluateRental97Lthd } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const TRANSFER = "2020-07-01";

function reduction(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    ...getReductionDefault("rental_97_4"),
    registrationDate: "2016-07-01",
    rentalStartDate: "2016-07-01",
    isTaxRegistered: true,
    taxRegistrationDate: "2016-07-01",
    rentIncreaseViolationMode: "none",
    rentalContinuesToTransfer: true,
    hasVacancyOverGrace: false,
    rental974Category: "purchase_a",
    region: "capital",
    officialPriceAtStart: "300,000,000",
    isInherited974: true,
    inheritanceDate974: "2016-01-01",
    decedentRegistrationDate974: "2012-01-01",
    decedentRentalStartDate974: "2012-01-01",
    isAutoCancelled974: false,
    autoCancelledDate974: "",
    ...over,
  } as AssetReductionForm;
}
const owner = { acquisitionCause: "purchase" } as Any;

describe("② initial · ③ normalize", () => {
  it("② 기본값 — 사업자등록일 빈칸 · 상속·자동말소 OFF", () => {
    const d = getReductionDefault("rental_97_4") as Any;
    expect(d.taxRegistrationDate).toBe("");
    expect(d.isInherited974).toBe(false);
    expect(d.inheritanceDate974).toBe("");
    expect(d.isAutoCancelled974).toBe(false);
    expect(d.autoCancelledDate974).toBe("");
  });

  it("③ 구 세션(필드 없음) → 빈칸·OFF로 채우고, 이미 있으면 보존", () => {
    const run = (r: Record<string, unknown>) => {
      const a: Record<string, unknown> = { reductions: [{ type: "rental_97_4", rental974Category: "purchase_a", ...r }] };
      normalizeRentalAndSplitFields(a);
      return (a.reductions as Any[])[0];
    };
    const old = run({});
    expect(old.taxRegistrationDate).toBe("");
    expect(old.isInherited974).toBe(false);
    expect(old.decedentRentalStartDate974).toBe("");
    expect(old.isAutoCancelled974).toBe(false);
    const kept = run({ taxRegistrationDate: "2016-07-01", isInherited974: true, inheritanceDate974: "2016-01-01", isAutoCancelled974: true, autoCancelledDate974: "2020-01-01" });
    expect(kept.taxRegistrationDate).toBe("2016-07-01");
    expect(kept.inheritanceDate974).toBe("2016-01-01");
    expect(kept.autoCancelledDate974).toBe("2020-01-01");
  });
});

describe("④ API → ⑫ Zod → ⑭ Route → 엔진", () => {
  it("상속·자동말소·사업자등록일이 벗겨지지 않고 Date로 엔진에 닿는다", () => {
    const [api] = toEngineReductions(
      [reduction({ isAutoCancelled974: true, autoCancelledDate974: "2020-03-01" })],
      owner,
    ) as Any[];
    expect(api.taxRegistrationDate).toBe("2016-07-01");
    expect(api.inheritance974).toEqual({
      inheritanceDate: "2016-01-01",
      decedentRegistrationDate: "2012-01-01",
      decedentRentalStartDate: "2012-01-01",
    });
    expect(api.autoCancelledDate974).toBe("2020-03-01");
    const parsed = reductionSchema.safeParse(JSON.parse(JSON.stringify(api)));
    expect(parsed.success).toBe(true);
    const zod = (parsed as Any).data;
    expect(zod.inheritance974.decedentRentalStartDate).toBe("2012-01-01"); // ⑫ stripping 없음
    expect(zod.autoCancelledDate974).toBe("2020-03-01");
    expect(zod.taxRegistrationDate).toBe("2016-07-01");
    const engine = mapReductionsToEngine([zod]) as Any[];
    expect(engine[0].inheritance974.inheritanceDate).toBeInstanceOf(Date); // ⑭ string 미도달
    expect(engine[0].autoCancelledDate974).toBeInstanceOf(Date);
    expect(engine[0].taxRegistrationDate).toBeInstanceOf(Date);

    // router 명시 매핑 — 엔진 결과에 피상속인 분·자동말소 종점이 반영된다
    const r = evaluateRental97Lthd(engine, { transferDate: new Date(TRANSFER), acquisitionDate: new Date("2016-01-01") } as Any) as Any;
    expect(r.rentalPeriod974).toEqual({
      heir: { start: "2016-07-01", end: "2020-03-01" },
      decedent: { start: "2012-01-01", end: "2016-01-01" },
      endReason: "auto_cancel",
    });
  });

  it("토글 OFF면 날짜가 남아 있어도 싣지 않는다 · 사업자등록 미확인이면 날짜를 싣지 않는다", () => {
    const [api] = toEngineReductions(
      [reduction({ isInherited974: false, isAutoCancelled974: false, autoCancelledDate974: "2020-03-01", isTaxRegistered: false })],
      owner,
    ) as Any[];
    expect(api.inheritance974).toBeUndefined();
    expect(api.autoCancelledDate974).toBeUndefined();
    expect(api.taxRegistrationDate).toBeUndefined();
  });
});

describe("⑧ validate", () => {
  const check = (over: Record<string, unknown> = {}) => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2016-01-01", reductions: [reduction(over)] };
    return validateStep2Reductions(2, { assets: [asset], transferDate: TRANSFER } as unknown as TransferFormData)?.message ?? "";
  };

  it("다 채우면 통과", () => {
    expect(check()).toBe("");
  });
  it("사업자등록 확인 + 날짜 없음 → 차단 (조특령 §97의4②)", () => {
    expect(check({ taxRegistrationDate: "" })).toContain("§97의4②");
  });
  it("상속 ON + 날짜 빈칸 → 각각 차단", () => {
    expect(check({ inheritanceDate974: "" })).toContain("상속개시일");
    expect(check({ decedentRegistrationDate974: "" })).toContain("피상속인의 사업자등록등일");
    expect(check({ decedentRentalStartDate974: "" })).toContain("피상속인의 임대개시일");
  });
  it("피상속인 날짜가 상속개시일 이후 → 차단 (엔진 INVALID_INHERITANCE_DATES와 같은 조건)", () => {
    expect(check({ decedentRentalStartDate974: "2016-01-01" })).toContain("상속개시일보다 앞서야");
  });
  it("상속개시일이 양도일 뒤 → 차단 (엔진 INVALID_INHERITANCE_DATES와 같은 조건)", () => {
    expect(check({ inheritanceDate974: "2021-01-01" })).toContain("상속개시일은 양도일 이전");
  });
  it("자동말소 ON + 날짜 없음 / 양도일 이후 → 차단", () => {
    expect(check({ isAutoCancelled974: true, autoCancelledDate974: "" })).toContain("자동말소일");
    expect(check({ isAutoCancelled974: true, autoCancelledDate974: "2021-01-01" })).toContain("양도일 이전");
  });
});

describe("⑤ 구간 미리보기 — 엔진과 같은 축", () => {
  it("상속: 상속인 분은 의제 개시일(늦은 날), 피상속인 분은 [늦은 날, 상속개시일]", () => {
    expect(rental974PeriodSegmentsString(reduction({ taxRegistrationDate: "2016-09-01" }) as Any, TRANSFER)).toEqual({
      own: { start: "2016-09-01", end: TRANSFER },
      decedent: { start: "2012-01-01", end: "2016-01-01" },
    });
  });
  it("자동말소일이 양도일 전이면 종점", () => {
    const s = rental974PeriodSegmentsString(
      reduction({ isInherited974: false, isAutoCancelled974: true, autoCancelledDate974: "2019-12-31" }) as Any,
      TRANSFER,
    );
    expect(s).toEqual({ own: { start: "2016-07-01", end: "2019-12-31" }, decedent: undefined });
  });
});
