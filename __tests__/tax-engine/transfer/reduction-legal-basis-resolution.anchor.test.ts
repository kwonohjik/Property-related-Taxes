/**
 * anchor — 감면세액 step의 법령 근거 해석 (D1-12 · D1-11)
 *
 * ## D1-12 — 조회 키가 **화면 라벨**이었다
 * `getReductionLegalBasis`가 표시 라벨 문자열로 조문을 찾았는데, 라벨 단일 소스
 * (`transfer-reduction-type-labels.ts`)가 조문 병기·괄호 표기로 표준화되면서 키와 어긋나
 * **31개 라벨 중 28개가 undefined**로 떨어졌다.
 *
 * 살아 있던 3개(`장기임대주택`·`신축주택`·`미분양주택`)조차 레거시 type 경로에 대응했고,
 * 실제 주 경로인 §69 자경농지(`"자경농지 (§69)"` vs 키 `"자경농지"`)·§77 공익수용
 * (괄호 앞 **공백 1칸** 차이)도 MISS였다. `useLegacyRates` 분기는 도달 불가 dead branch였다.
 *
 * ⇒ 조회 키를 **내부 id**로 바꾸고 id 기반 `resolveTypeLegalBasis`에 위임했다.
 *   그 resolver의 default가 `REDUCTION_METADATA[type].article`이라 신규 조문도 자동으로 잡힌다.
 *
 * ## D1-11 — (삭제) 레거시 `rentalReductionDetails`의 네 유형을 override로 가르던 축
 * 그 입력과 엔진(`rental-housing-reduction.ts`)을 삭제하며 override도 지웠다(§155⑳ 리뷰 V-6 후속).
 * 정본 `rental_97_*`는 id마다 조문이 따로 있다.
 */
import { describe, it, expect } from "vitest";
import { getReductionLegalBasis } from "@/lib/tax-engine/transfer-tax-helpers";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { TRANSFER_REDUCTION_ARTICLE } from "@/lib/tax-engine/legal-codes/transfer-house";

describe("D1-12 — id를 키로 쓴다 (라벨 아님)", () => {
  it("🔴 §97 본문·단서·§97의2가 근거를 반환한다", () => {
    expect(getReductionLegalBasis("rental_97_main", undefined)).toBe(
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_MAIN,
    );
    expect(getReductionLegalBasis("rental_97_proviso", undefined)).toBe(
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_PROVISO,
    );
    expect(getReductionLegalBasis("rental_97_2", undefined)).toBeTruthy();
  });

  it("🔴 표시 라벨을 넘기면 안 된다 — 라벨은 키가 아니다", () => {
    // 종전 구현은 이 문자열이 키였다. 이제는 id가 아니므로 metadata 조회도 실패한다.
    const byLabel = getReductionLegalBasis("장기임대주택 (§97 ① 본문)", undefined);
    const byId = getReductionLegalBasis("rental_97_main", undefined);
    expect(byId).toBeTruthy();
    expect(byLabel).not.toBe(byId);
  });

  it("🔴 주 경로 §69·§77도 근거를 반환한다 — 종전에는 공백 1칸 차이로 MISS였다", () => {
    expect(getReductionLegalBasis("self_farming", undefined)).toBe(
      TRANSFER.REDUCTION_SELF_FARMING,
    );
    expect(getReductionLegalBasis("public_expropriation", undefined)).toBe(
      TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
    );
  });

  it("§77 경과규정 병기 분기가 살아 있다 — 종전에는 dead branch였다", () => {
    const legacy = getReductionLegalBasis("public_expropriation", true);
    expect(legacy).toContain(TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION);
    expect(legacy).not.toBe(getReductionLegalBasis("public_expropriation", false));
  });

  it("🔴 라벨 목록 전건이 근거를 갖는다 — 「28개 undefined」 재발 방지", () => {
    const ids = Object.keys(REDUCTION_TYPE_LABELS);
    const missing = ids.filter((id) => !getReductionLegalBasis(id, undefined));
    expect(missing, `근거가 없는 감면 id: ${missing.join(", ")}`).toEqual([]);
    expect(ids.length).toBeGreaterThan(20); // 목록이 비어 통과하는 것을 막는다
  });

  it("빈 값은 undefined", () => {
    expect(getReductionLegalBasis(undefined, undefined)).toBeUndefined();
    expect(getReductionLegalBasis("", undefined)).toBeUndefined();
  });
});

describe("D1-11 이후 — 레거시 임대 입력·override 삭제(§155⑳ 리뷰 V-6 후속)", () => {
  it("long_term_rental은 id 기반 결과를 쓴다", () => {
    expect(getReductionLegalBasis("long_term_rental", undefined)).toBe(TRANSFER.REDUCTION_LONG_RENTAL);
  });
});
