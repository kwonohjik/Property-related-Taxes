/**
 * anchor — §97의3 단기→장기 변경신고 입력의 클라이언트·API 파이프라인 (PR-C #3 — 14개 동기화 지점)
 *
 * ③ normalize(구 세션 boolean → 구분) · ④ API 변환(조건부 전송·플래그 파생) · ⑫ Zod(침묵 stripping 없음) ·
 * ⑭ Route 매핑(Date 변환) · ⑧ validate(필수·선후·제외 안내·등록일 선후) · ⑤⑧ 의제 개시일 단일 소스.
 */
import { describe, it, expect } from "vitest";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { rental973DeemedStartString } from "@/lib/calc/rental-97-effective-start";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function reduction(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    ...getReductionDefault("rental_97_3"),
    registrationDate: "2016-03-01", // 변경신고 주택 — 단기 지자체 등록일
    rentalStartDate: "2016-03-01",
    isTaxRegistered: true,
    taxRegistrationDate: "2016-03-01",
    rentIncreaseViolationMode: "none",
    rentalContinuesToTransfer: true,
    hasVacancyOverGrace: false,
    officialPriceAtStart: "300,000,000",
    isNationalHousingScale: true,
    shortTermConversionMode: "before",
    conversionReportedDate: "2019-05-01",
    conversionAcceptedDate: "2019-05-01",
    stdPriceAtAcquisition: "280,000,000",
    stdPriceAtTransfer: "600,000,000",
    ...over,
  } as AssetReductionForm;
}

describe("② initial · ③ normalize", () => {
  it("② 기본값은 변경신고 없음", () => {
    const d = getReductionDefault("rental_97_3") as Any;
    expect(d.shortTermConversionMode).toBe("none");
    expect(d.conversionReportedDate).toBe("");
    expect(d.conversionAcceptedDate).toBe("");
  });

  it("③ 구 세션 boolean true(2020.7.11 이후 = 제외) → after, false → none · 이미 있으면 보존", () => {
    const run = (r: Record<string, unknown>) => {
      const a: Record<string, unknown> = { reductions: [{ type: "rental_97_3", ...r }] };
      normalizeRentalAndSplitFields(a);
      return (a.reductions as Any[])[0];
    };
    expect(run({ isConvertedFromShortTerm: true }).shortTermConversionMode).toBe("after");
    expect(run({ isConvertedFromShortTerm: false }).shortTermConversionMode).toBe("none");
    const kept = run({ isConvertedFromShortTerm: false, shortTermConversionMode: "before", conversionReportedDate: "2019-05-01" });
    expect(kept.shortTermConversionMode).toBe("before");
    expect(kept.conversionReportedDate).toBe("2019-05-01");
  });
});

describe("④ API → ⑫ Zod → ⑭ Route", () => {
  const owner = { acquisitionCause: "purchase" } as Any;

  it("before — 객체를 싣고 플래그는 false · Zod가 벗기지 않고 Route가 Date로 바꾼다", () => {
    const [api] = toEngineReductions([reduction()], owner) as Any[];
    expect(api.isConvertedFromShortTerm).toBe(false);
    expect(api.shortTermConversion).toEqual({ reportedDate: "2019-05-01", acceptedDate: "2019-05-01" });
    const parsed = reductionSchema.safeParse(JSON.parse(JSON.stringify(api)));
    expect(parsed.success).toBe(true);
    const zod = (parsed as Any).data;
    expect(zod.shortTermConversion).toEqual({ reportedDate: "2019-05-01", acceptedDate: "2019-05-01" }); // ⑫ stripping 없음
    const [engine] = mapReductionsToEngine([zod]) as Any[];
    expect(engine.shortTermConversion.reportedDate).toBeInstanceOf(Date); // ⑭ string 미도달
    expect(engine.shortTermConversion.acceptedDate.toISOString().slice(0, 10)).toBe("2019-05-01");
  });

  it("after — 플래그 true · 객체 없음 / none — 둘 다 없음", () => {
    const [after] = toEngineReductions([reduction({ shortTermConversionMode: "after" })], owner) as Any[];
    expect(after.isConvertedFromShortTerm).toBe(true);
    expect(after.shortTermConversion).toBeUndefined();
    const [none] = toEngineReductions([reduction({ shortTermConversionMode: "none" })], owner) as Any[];
    expect(none.isConvertedFromShortTerm).toBe(false);
    expect(none.shortTermConversion).toBeUndefined();
  });

  it("구분 필드가 없는 구 폼도 boolean으로 파생한다", () => {
    const old = { ...reduction(), shortTermConversionMode: undefined, isConvertedFromShortTerm: true } as Any;
    const [api] = toEngineReductions([old], owner) as Any[];
    expect(api.isConvertedFromShortTerm).toBe(true);
  });
});

describe("⑧ validate", () => {
  const check = (over: Record<string, unknown> = {}) => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2016-02-01", reductions: [reduction(over)] };
    return validateStep2Reductions(2, { assets: [asset], transferDate: "2026-04-01" } as unknown as TransferFormData)?.message ?? "";
  };

  it("정상 입력은 통과", () => {
    expect(check()).toBe("");
  });

  it("before — 신고일·수리일 필수 (자동 대체 금지 — Q-2)", () => {
    expect(check({ conversionReportedDate: "" })).toMatch(/변경 신고한 날을 입력하세요/);
    expect(check({ conversionAcceptedDate: "" })).toMatch(/변경신고 수리일/);
  });

  it("before인데 신고일 ≥ 2020-07-11 → 「2020.7.11 이후 변경신고」로 안내", () => {
    expect(check({ conversionReportedDate: "2020-07-11", conversionAcceptedDate: "2020-07-11" })).toMatch(/2020\.7\.11 이후 변경신고/);
  });

  it("수리일 < 신고일 · 단기 등록일 ≥ 수리일 → 차단", () => {
    expect(check({ conversionAcceptedDate: "2019-04-01" })).toMatch(/같거나 그 뒤여야/);
    expect(check({ registrationDate: "2019-05-01" })).toMatch(/단기민간임대주택으로 등록한 날/);
  });

  it("none·after는 날짜를 묻지 않는다", () => {
    expect(check({ shortTermConversionMode: "none", conversionReportedDate: "" })).toBe("");
    expect(check({ shortTermConversionMode: "after", conversionReportedDate: "" })).toBe("");
  });
});

describe("⑤⑧ 의제 개시일 — 엔진 leaf 단일 소스", () => {
  it("before 2019.2.12 이후 신고 → 단기 개시일 / 2019.2.11 신고 → 50% 산입한 날 / 날짜 미입력 → ④ 전단 기준", () => {
    expect(rental973DeemedStartString(reduction() as Any)).toBe("2016-03-01");
    expect(
      rental973DeemedStartString(
        reduction({ registrationDate: "2015-02-11", rentalStartDate: "2015-02-11", taxRegistrationDate: "2015-02-11", conversionReportedDate: "2019-02-11", conversionAcceptedDate: "2019-02-11" }) as Any,
      ),
    ).toBe("2017-02-11");
    expect(rental973DeemedStartString(reduction({ conversionAcceptedDate: "" }) as Any)).toBe("2016-03-01");
  });
});
