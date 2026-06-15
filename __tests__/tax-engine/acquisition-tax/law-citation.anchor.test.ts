/**
 * 취득세 법조문 인용 Anchor (법령 링크 검증 2/2)
 *
 * KoreanLaw `get_law_text` 본문 대조로 확정한 조문 인용 정합 고정.
 * 지방세법 MST 282559 / 시행령 286395 (시행 20260424·20260601).
 *
 * 검증 시나리오:
 * [CITE-15-01] §15① 세율특례 7호 호번호 정합 (구 9종 → 7호)
 * [CITE-15-02] 가공 옵션(hoyu_division·leasing) 제거 — §15①에 근거 없음
 * [CITE-15-03] 유효 7종 isValidSpecialRateType true
 * [CITE-15-04] applySpecialRate(timber) → §15①7호 (시행령 §30① 벌채용 입목)
 * [CITE-15-05] 제거 상수(SPECIAL_RATE_HOYU_DIVISION·LEASING) undefined
 * [CITE-13-01] 사치성 = §13⑤ (구 §13① 드리프트 정정)
 * [CITE-13-02] §13⑥ = §13①+② / §13⑦ = §13②+⑤ 동시적용
 * [CITE-13-03] 본점·공장 §13① / 대도시 법인 §13②
 * [CITE-07-01] 간주취득 = §7 (구 §7의2 폐지·통합)
 * [CITE-07-02] 연부취득 정의 §6 제20호 / 취득시기 시행령 §20⑤
 */

import { describe, it, expect } from "vitest";
import { ACQUISITION } from "../../../lib/tax-engine/legal-codes";
import {
  applySpecialRate,
  isValidSpecialRateType,
} from "../../../lib/tax-engine/acquisition-tax-rate-special";

describe("취득세 법조문 인용 anchor — §15① 세율특례 7호", () => {
  it("[CITE-15-01] §15① 세율특례 상수 = 본문 호번호 정합", () => {
    expect(ACQUISITION.SPECIAL_RATE).toBe("지방세법 §15①");
    expect(ACQUISITION.SPECIAL_RATE_REDEMPTION).toBe("지방세법 §15①1호");
    expect(ACQUISITION.SPECIAL_RATE_INHERITANCE_1HOUSE).toBe("지방세법 §15①2호");
    expect(ACQUISITION.SPECIAL_RATE_CORP_MERGER).toBe("지방세법 §15①3호");
    expect(ACQUISITION.SPECIAL_RATE_CO_OWNERSHIP_SPLIT).toBe("지방세법 §15①4호");
    expect(ACQUISITION.SPECIAL_RATE_BUILDING_RELOCATION).toBe("지방세법 §15①5호");
    expect(ACQUISITION.SPECIAL_RATE_DIVORCE_DIVISION).toBe("지방세법 §15①6호");
    expect(ACQUISITION.SPECIAL_RATE_TIMBER).toBe("지방세법 §15①7호");
  });

  it("[CITE-15-02] 가공 옵션(hoyu_division·leasing) 제거 — §15①에 법적 근거 없음", () => {
    expect(isValidSpecialRateType("hoyu_division")).toBe(false);
    expect(isValidSpecialRateType("leasing")).toBe(false);
  });

  it("[CITE-15-03] 유효 7종 — isValidSpecialRateType true", () => {
    const valid = [
      "redemption",
      "inheritance_one_house",
      "corp_merger",
      "co_ownership_split",
      "building_relocation",
      "divorce_division",
      "timber",
    ];
    for (const t of valid) {
      expect(isValidSpecialRateType(t)).toBe(true);
    }
  });

  it("[CITE-15-04] applySpecialRate(timber) → §15①7호 (벌채용 입목·시행령 §30①)", () => {
    const r = applySpecialRate(0.04, "timber", {
      isCorpMetro: false,
      isHeadquarterOrFactorySurcharge: false,
    });
    expect(r.isApplied).toBe(true);
    expect(r.legalBasis).toBe("지방세법 §15①7호");
    expect(r.appliedRate).toBeCloseTo(0.02, 10); // 4% - 중과기준세율 2%
  });

  it("[CITE-15-05] 제거 상수(SPECIAL_RATE_HOYU_DIVISION·LEASING) undefined", () => {
    const acq = ACQUISITION as Record<string, unknown>;
    expect(acq.SPECIAL_RATE_HOYU_DIVISION).toBeUndefined();
    expect(acq.SPECIAL_RATE_LEASING).toBeUndefined();
  });
});

describe("취득세 법조문 인용 anchor — §13 중과", () => {
  it("[CITE-13-01] 사치성 = §13⑤ (구 §13① 드리프트 정정)", () => {
    expect(ACQUISITION.LUXURY_SURCHARGE).toBe("지방세법 §13⑤");
    expect(ACQUISITION.LUXURY_SURCHARGE_PROVISION).toBe("지방세법 §13⑤");
  });

  it("[CITE-13-02] §13⑥ = §13①+② 동시 / §13⑦ = §13②+⑤ 동시", () => {
    expect(ACQUISITION.LUXURY_AND_CORP_HQ).toBe("지방세법 §13⑥");
    expect(ACQUISITION.LUXURY_AND_CORP_METRO).toBe("지방세법 §13⑦");
  });

  it("[CITE-13-03] 본점·공장 §13① / 대도시 법인 §13②", () => {
    expect(ACQUISITION.HEADQUARTERS_SURCHARGE).toBe("지방세법 §13①");
    expect(ACQUISITION.FACTORY_SURCHARGE).toBe("지방세법 §13①");
    expect(ACQUISITION.METRO_CORP_SURCHARGE).toBe("지방세법 §13②");
  });
});

describe("취득세 법조문 인용 anchor — 간주취득 §7④⑤·§10의6 (구 §7의2 폐지)", () => {
  it("[CITE-07-01] 간주취득 = §7 (구 §7의2 §7로 통합)", () => {
    expect(ACQUISITION.DEEMED_ACQUISITION).toBe("지방세법 §7");
    expect(ACQUISITION.DEEMED_FOUNDING_EXEMPT).toBe("지방세법 §7⑤");
  });

  it("[CITE-07-02] 연부취득 정의 §6 제20호 / 취득시기 시행령 §20⑤", () => {
    expect(ACQUISITION.INSTALLMENT_DEFINITION).toBe("지방세법 §6 제20호");
    expect(ACQUISITION.INSTALLMENT_TIMING).toBe("지방세법 시행령 §20⑤");
  });
});
