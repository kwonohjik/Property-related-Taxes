/**
 * 다주택 중과세 — 영 §167의3①12호 가~라목 주택 판정 (Layer 2 내부 모듈)
 *
 * 12호는 주택 수 불산입(①본문 괄호)이면서 중과 배제 각 호의 하나다. 2주택 §167의10①12호, 주택+권리
 * §167의11①11호·②2호·§167의4②2호·③6호가 「제167조의3제1항제12호에 해당하는 주택」을 그대로 받는다.
 * 그래서 주택 수 산정(`countEffectiveHouses`)과 양도 주택 자체의 배제(`determineSurchargeExclusion`)가
 * 이 파일의 같은 술어를 쓴다.
 *
 * multi-house-surcharge-count.ts 800줄 정책 분리(2026-10-20).
 * 의존: 단방향(-count·-exclusion → 본 파일). 본 파일은 둘을 import하지 않는다.
 */

import { MULTI_HOUSE } from "./legal-codes";
import { classifyPopulationDeclineArea, toSigunguCode } from "./data/population-decline-areas";
import type { HouseInfo, PresaleRight } from "./types/multi-house-surcharge.types";

// ============================================================
// 소형 신축/미분양 주택 판정 (⑬)
// ============================================================

/**
 * ⑬ 소형 신축주택 또는 비수도권 준공 후 미분양 특례 해당 여부.
 * 해당 시 주택 수 산정 배제 AND 중과세 배제 동시 적용.
 */
/**
 * §167의3①12호 가·나목의 **양도일** 경계 — 2024.2.29 개정(대통령령 제34265호) 부칙 §11①
 * 「제167조의3제1항 각 호 외의 부분 및 같은 항 제12호의 개정규정은 이 영 시행 이후 주택을 양도하는
 * 경우부터 적용한다」. 그 전 시행본의 12호는 「삭제<2023.2.28>」이고 괄호도 「제1호」뿐이다(F-11).
 */
const SMALL_NEW_HOUSE_TRANSFER_FROM = new Date("2024-02-29");
/** §167의3①12호 다·라목(인구감소지역·관심지역 세컨드홈) — 2026.2.27 시행본 신설 · 2026.1.1 이후 취득분 */
const SECOND_HOME_TRANSFER_FROM = new Date("2026-02-27");
const SECOND_HOME_ACQ_FROM = new Date("2026-01-01");
/**
 * §167의3①12호 나목2) 취득가액 6억 → 7억 — 2026.2.27 개정 부칙 §11 「이 영 시행 이후 준공 후
 * 미분양주택을 **취득**하는 경우부터 적용」. 그 전 취득분은 6억이다(F-11).
 */
const UNSOLD_NEW_HOUSE_7EOK_ACQ_FROM = new Date("2026-02-27");

export function isSmallNewHouseSpecial(house: HouseInfo, transferDate: Date): boolean {
  if (!house.acquisitionDate || !house.acquisitionPrice) return false;
  if (transferDate < SMALL_NEW_HOUSE_TRANSFER_FROM) return false;

  const acqDate = house.acquisitionDate;
  const isCapital = house.isCapitalArea ?? house.region === "capital";

  // 소형 신축주택 (소령 §167의3①12가목: 취득·준공 모두 2024.1.10~2027.12.31, 전용 60㎡ 이하, 아파트 제외, 취득가 수도권 6억/비수도권 3억 이하)
  // 가목 3호 준공일 검증 — completionDate 미제공 시 미발동(보수적)
  if (
    acqDate >= new Date("2024-01-10") &&
    acqDate <= new Date("2027-12-31") &&
    !!house.completionDate &&
    house.completionDate >= new Date("2024-01-10") &&
    house.completionDate <= new Date("2027-12-31") &&
    (house.exclusiveArea ?? 0) <= 60 &&
    !house.isApartment &&
    house.acquisitionPrice <= (isCapital ? 600_000_000 : 300_000_000)
  ) {
    return true;
  }

  // 비수도권 준공 후 미분양 (소령 §167의3①12나목: 2024.1.10 ~ 2027.12.31, 전용 85㎡ 이하,
  // 취득가 6억 이하 — 2026.2.27 이후 취득분은 7억 이하). 취득기간 끝은 대통령령 제36737호
  // (2026.10.1. 시행)로 2026.12.31. → 2027.12.31. 연장(별도 적용례 없음).
  const unsoldNewPriceCap = acqDate >= UNSOLD_NEW_HOUSE_7EOK_ACQ_FROM ? 700_000_000 : 600_000_000;
  if (
    acqDate >= new Date("2024-01-10") &&
    acqDate <= new Date("2027-12-31") &&
    !isCapital &&
    (house.exclusiveArea ?? 0) <= 85 &&
    house.acquisitionPrice <= unsoldNewPriceCap &&
    house.isUnsoldNewHouse
  ) {
    return true;
  }

  return false;
}

/**
 * 영 §167의3①12호 다·라목(인구감소지역·관심지역 세컨드홈) 판정 — 주택 수 산정(`countEffectiveHouses`)과
 * 양도 주택 자체의 중과 배제(`determineSurchargeExclusion`)가 같은 술어를 쓴다.
 *
 * null = 다·라목 대상 아님(소재·시행 시기·취득일·가액 중 하나라도 불충족 — 한도 초과는 일반 산입).
 * `qualifies: false` = 가액까지 맞지만 취득 전 보유주택·권리와 같은 시·군·구(다·라목 2호).
 * 등록·신청 요건은 없다 — 다·라목 문언은 취득시기·소재·동일 시·군·구·가액만 요구하고, ⑩이 위임한
 * 시행규칙 §82(현행·2027.1.1. 시행예정본)에도 다·라목 확인 절차가 없다. 요건을 갖추면 당연 적용.
 */
export function resolvePopulationDeclineSecondHome(
  house: HouseInfo,
  houses: readonly HouseInfo[],
  presaleRights: readonly PresaleRight[],
  transferDate: Date,
): { qualifies: boolean; popCap: number; warnings: string[] } | null {
  const autoKind = house.regionCode ? classifyPopulationDeclineArea(house.regionCode).kind : null;
  const isPopDecline = house.isPopulationDeclineArea ?? (autoKind !== null);
  // 12호 다·라목은 2026.2.27 시행본에서 신설됐고, 호 본문이 「2026년 1월 1일 이후 취득하는 주택」이다(F-11).
  const secondHomeInForce =
    transferDate >= SECOND_HOME_TRANSFER_FROM && house.acquisitionDate >= SECOND_HOME_ACQ_FROM;
  if (!isPopDecline || !secondHomeInForce) return null;

  // 가액 한도: 다목(수도권 밖 인구감소지역) 9억 / 라목(관심지역)·수도권 접경·그 외 4억.
  // populationAreaType 미입력 시 regionCode 자동판정(autoKind)으로 다·라목 구분 도출 (N-6).
  const effectiveAreaType = house.populationAreaType ?? autoKind ?? undefined;
  const popCap =
    house.region === "non_capital" && effectiveAreaType === "decline"
      ? MULTI_HOUSE.POP_DECLINE_PRICE_CAP_NONCAPITAL
      : MULTI_HOUSE.POP_DECLINE_PRICE_CAP_DEFAULT;
  if (house.officialPrice > popCap) return null; // 한도 초과 → 배제 미적용, 일반 산입

  // 다목 2호·라목 2호: 해당 주택 취득 전에 보유한 주택과 동일한 시·군·구에
  // 소재하는 주택이 아닐 것. 동일 시·군·구 보유주택이 있으면 특례 미적용(산입).
  // regionCode 미제공(boolean override 경로)이면 비교 불가 → 제한 미적용(특례 유지).
  const warnings: string[] = [];
  const candidateSgg = toSigunguCode(house.regionCode);
  let hasSameSigunguPriorHouse = false;
  if (candidateSgg) {
    for (const other of houses) {
      if (other.id === house.id) continue;
      // "취득 전에 보유한 주택" — 후보 취득일 이전(또는 동일)에 취득한 주택만 비교
      if (other.acquisitionDate > house.acquisitionDate) continue;
      const otherSgg = toSigunguCode(other.regionCode);
      if (otherSgg && otherSgg === candidateSgg) {
        hasSameSigunguPriorHouse = true;
        break;
      }
    }
    // 다·라목 2호 괄호: 취득 전에 보유한 입주권/분양권을 통해 공급하는 주택도 비교 대상.
    // 권리 소재지(공급주택 시·군·구)를 후보와 비교. 주택 수 산입 여부와 무관(보유 사실 기준).
    if (!hasSameSigunguPriorHouse) {
      for (const right of presaleRights) {
        if (right.acquisitionDate > house.acquisitionDate) continue;
        const rightSgg = toSigunguCode(right.regionCode);
        if (rightSgg && rightSgg === candidateSgg) {
          hasSameSigunguPriorHouse = true;
          break;
        }
      }
    }
  } else {
    // regionCode 미제공(boolean override 경로) → 동일 시·군·구 요건 검증 불가.
    // 제한규정 미적용(특례 유지)하되 미검증 사실을 경고로 노출.
    warnings.push(
      `주택 ${house.id}: 인구감소지역 세컨드홈 특례 — 주소(시·군·구) 미입력으로 '취득 전 보유주택과 동일 시·군·구' 요건(소령 §167의3①12 다·라목 2호)을 검증하지 못했습니다.`,
    );
  }
  if (hasSameSigunguPriorHouse) {
    // 동일 시·군·구 보유주택 존재 → 다목·라목 2호 미충족 → 특례 미적용, 일반 산입
    warnings.push(
      `주택 ${house.id}: 취득 전 보유한 동일 시·군·구 주택이 있어 인구감소지역 세컨드홈 특례를 적용하지 않습니다(소령 §167의3①12 다·라목 2호).`,
    );
  }
  return { qualifies: !hasSameSigunguPriorHouse, popCap, warnings };
}
