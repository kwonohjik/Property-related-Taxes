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
 * ## D1-11 — 레거시 `long_term_rental` 하나가 4개 조문을 뭉친다
 * `rental-housing-reduction.ts` 헤더가 네 유형을 §97·§97의3·§97의4·§97의5로 명시하는데
 * 후보 배열에서는 한 id로 합쳐진다. id만 보면 전부 「조특법 §97」이 되어
 * §97의3~§97의5 사안에서 틀린 조문 모달이 열린다.
 * ⇒ 후보 선택 시점에 `rentalHousingType`으로 조문을 확정해 override로 내보낸다.
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

describe("D1-11 — 레거시 임대 4유형은 override로 조문을 가른다", () => {
  it("🔴 override가 id 기반 결과보다 우선한다", () => {
    const base = getReductionLegalBasis("long_term_rental", undefined);
    const overridden = getReductionLegalBasis(
      "long_term_rental",
      undefined,
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3,
    );
    expect(base).not.toBe(overridden);
    expect(overridden).toBe("조특법 §97의3");
  });

  it("네 유형이 서로 다른 조문으로 갈린다 — 구별력", () => {
    const arts = [
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_MAIN,
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3,
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_4,
      TRANSFER_REDUCTION_ARTICLE.RENTAL_97_5,
    ].map((a) => getReductionLegalBasis("long_term_rental", undefined, a));
    expect(new Set(arts).size, "네 유형이 한 조문으로 뭉치면 안 된다").toBe(4);
  });

  it("override가 없으면 id 기반 결과를 쓴다 (종전 동작 보존)", () => {
    expect(getReductionLegalBasis("long_term_rental", undefined, undefined)).toBe(
      TRANSFER.REDUCTION_LONG_RENTAL,
    );
  });
});
