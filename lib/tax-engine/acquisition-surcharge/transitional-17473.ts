/**
 * 법률 제17473호(2020.8.12.) 부칙 제6조 — 법인의 주택 취득 등 중과에 대한 경과조치 (계획서 E-6)
 *
 * 부칙 제6조 (DRF target=law MST 220927 부칙단위 실독 2026-09-30):
 *  「제13조제2항 및 제13조의2의 개정규정을 적용할 때 법인 및 국내에 주택을 1개 이상 소유하고 있는
 *   1세대가 2020년 7월 10일 이전에 주택에 대한 매매계약(공동주택 분양계약을 포함한다)을 체결한
 *   경우에는 그 계약을 체결한 당사자의 해당 주택의 취득에 대하여 종전의 규정을 적용한다. 다만,
 *   해당 계약이 계약금을 지급한 사실 등이 증빙서류에 의하여 확인되는 경우에 한정한다.」
 *
 * 「종전의 규정」 = 법률 제16855호(2020.1.1. 시행, MST 213055):
 *  - §11①8호 — 주택 유상거래 1~3%(6~9억 산식은 현행과 같은 문언)
 *  - §11④2호 — 「대통령령으로 정하는 1세대 4주택 이상에 해당하는 주택」은 §11①8호 미적용 → §11①7호나목 4%.
 *    종전 시행령 §22의2①(MST 220529): 「국내에 주택을 3개 이상 소유하고 있는 1세대가 추가로 취득하는
 *    모든 주택」(공유지분·부속토지 포함 — 입주권·분양권·오피스텔 가산·제외 규정 없음)
 *  - §13② 괄호 — 대도시 법인이 §11①8호 주택을 취득하면 「같은 조 제1항의 표준세율과 중과기준세율의
 *    100분의 200을 합한 세율」
 *  - §13의2 — 없음(법률 제17473호 신설)
 *
 * 조세심판원 선례(적용 방향 확인):
 *  - 조심 2021지5664(2023.1.11.) — 법인이 2020.7.10. 이전 계약(판결로 확인)한 주택: 「§11①8호에 따른 세율」로 경정
 *  - 조심 2023지3609(2023.11.23.) — 동·호 지정계약(2020.7.6.)을 계약일로 보아 1세대 2주택에 종전 §11①8호가목 1%
 *  - 조심 2021지2963(2021.11.29.) — 계약금 지급이 2020.7.15.로 확인 → 단서 불충족(기각)
 *
 * 적용 범위(이 모듈):
 *  - 유상거래 중 **매매**(`purchase`)만 — 부칙 문언이 「매매계약(공동주택 분양계약 포함)」이다.
 *  - 취득일(§20)이 2020.8.12. 이후일 때만 — 그 전 취득은 부칙 제2조(시행 후 납세의무 성립분부터)로
 *    처음부터 종전 규정 대상이다. 이 계산기는 그 시기의 종전 세율을 계산하지 않으므로 **고지만** 한다.
 *  - 「국내에 주택을 1개 이상 소유하고 있는 1세대」는 계약 당시 보유 여부를 **자기선언**으로 받는다
 *    (그 뒤 처분한 주택은 보유 주택 목록에 없어 목록으로는 판정할 수 없다).
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import type { HouseCountInput } from "../house-count/types";

export interface Transitional17473Input {
  propertyType: string;
  acquisitionCause: string;
  acquiredBy: string;
  /** §20 확정 취득일 (YYYY-MM-DD) */
  acquisitionDate: string;
  /** 매매계약일(공동주택 분양계약일 포함) */
  saleContractDate?: string;
  /** 계약금 지급 사실이 증빙서류로 확인되는지 (부칙 제6조 단서) */
  hasContractDepositProof?: boolean;
  /** 계약 당시 1세대가 국내에 주택을 1개 이상 소유했는지 (개인만) */
  ownedHouseAtSaleContract?: boolean;
}

export interface Transitional17473Result {
  applies: boolean;
  warnings: string[];
}

/** 부칙 제6조 적용 여부 */
export function resolveTransitional17473(input: Transitional17473Input): Transitional17473Result {
  const warnings: string[] = [];
  if (input.propertyType !== "housing" || input.acquisitionCause !== "purchase") {
    return { applies: false, warnings };
  }
  if (input.acquisitionDate < ACQUISITION_CONST.SURCHARGE_17473_FROM) {
    warnings.push(
      `취득일(${input.acquisitionDate})이 2020.8.12. 전입니다 — §13의2(다주택·법인 주택 중과)는 법률 제17473호 시행(2020.8.12.) 이후 취득분부터 적용됩니다(같은 법 부칙 제2조). 이 계산기는 그 전 취득분의 종전 세율을 계산하지 않고 현행 규정으로 계산했습니다 — 확인이 필요합니다.`
    );
    return { applies: false, warnings };
  }
  const contractDate = input.saleContractDate;
  if (!contractDate || contractDate > ACQUISITION_CONST.SURCHARGE_17473_CONTRACT_CUTOFF) {
    return { applies: false, warnings };
  }
  const basis = ACQUISITION.SURCHARGE_17473_TRANSITION;
  if (!input.hasContractDepositProof) {
    warnings.push(
      `매매계약일(${contractDate})이 2020.7.10. 이전이지만 계약금 지급 사실이 증빙서류로 확인되지 않아 ${basis} 단서에 따라 종전 규정을 적용하지 않았습니다.`
    );
    return { applies: false, warnings };
  }
  if (input.acquiredBy === "individual" && !input.ownedHouseAtSaleContract) {
    warnings.push(
      `매매계약일(${contractDate})이 2020.7.10. 이전이지만 계약 당시 국내에 주택을 1개 이상 소유한 1세대가 아니어서 ${basis}(「법인 및 국내에 주택을 1개 이상 소유하고 있는 1세대」)를 적용하지 않았습니다.`
    );
    return { applies: false, warnings };
  }
  return { applies: true, warnings };
}

/**
 * 종전 §11④2호 — 「1세대 4주택 이상」 주택 수 (취득하는 주택 포함).
 *
 * 보유 주택 목록이 있으면 **주택 행만** 센다 — 종전 시행령 §22의2①은 「주택」(공유지분·부속토지 포함)만
 * 세고 입주권·분양권·오피스텔 가산이나 현행 §28의4⑥ 제외 규정이 없다. 목록이 없으면 직접 입력한
 * 주택 수(현행 산정 기준)를 쓰고 고지한다.
 */
export function countHousesForPre17473(
  houseCountInput: HouseCountInput | undefined,
  houseCountAfter: number | undefined
): { count: number; warning?: string } {
  if (houseCountInput) return { count: houseCountInput.houses.length + 1 };
  return {
    count: houseCountAfter ?? 1,
    warning:
      "보유 주택 목록 없이 입력한 주택 수를 종전 시행령 §22의2(1세대 4주택 이상 — 주택만, 공유지분·부속토지 포함) 기준으로 그대로 썼습니다 — 조합원입주권·주택분양권·오피스텔은 종전 규정상 주택 수에 들어가지 않습니다.",
  };
}

export interface Pre17473Rate {
  /** 개인 종전 §11④2호 — 4주택 이상이면 4% (아니면 undefined → 종전 §11①8호 = 현행 기본세율 산식) */
  fourHouseRate?: number;
  /** 대도시 법인 종전 §13② 괄호 — 표준세율 + 중과기준세율×200% */
  metroCorpHousingRate?: number;
  /** 결과 화면(중과 판정 사유)에 쓸 설명 */
  exception: string;
  warnings: string[];
  legalBasis: string[];
}

/** 부칙 제6조가 적용될 때의 종전 세율 */
export function resolvePre17473Rate(args: {
  acquiredBy: string;
  basicRate: number;
  saleContractDate: string;
  houseCount: { count: number; warning?: string };
  isCorpMetro: boolean;
}): Pre17473Rate {
  const warnings: string[] = [];
  const legalBasis: string[] = [ACQUISITION.SURCHARGE_17473_TRANSITION];
  const head = `${args.saleContractDate} 매매계약(계약금 증빙) — ${ACQUISITION.SURCHARGE_17473_TRANSITION}에 따라 §13②·§13의2 개정규정 대신 종전 규정 적용`;
  const pct = (r: number) => `${(r * 100).toFixed(4).replace(/\.?0+$/, "")}%`;

  if (args.acquiredBy === "individual") {
    if (args.houseCount.warning) warnings.push(args.houseCount.warning);
    if (args.houseCount.count >= ACQUISITION_CONST.PRE_17473_FOUR_HOUSE_COUNT) {
      legalBasis.push(ACQUISITION.PRE_17473_FOUR_HOUSE_RATE);
      return {
        fourHouseRate: ACQUISITION_CONST.PRE_17473_FOUR_HOUSE_RATE,
        exception: `${head}: 1세대 ${args.houseCount.count}주택(4주택 이상) → 종전 §11④2호로 §11①8호 미적용 → §11①7호나목 4%`,
        warnings,
        legalBasis,
      };
    }
    return {
      exception: `${head}: 1세대 ${args.houseCount.count}주택(4주택 미만) → 종전 §11①8호 ${pct(args.basicRate)}`,
      warnings,
      legalBasis,
    };
  }

  if (args.isCorpMetro) {
    legalBasis.push(ACQUISITION.PRE_17473_METRO_CORP_HOUSING);
    const rate = args.basicRate + ACQUISITION_CONST.HEAVY_TAX_BASE_RATE * 2;
    return {
      metroCorpHousingRate: rate,
      exception: `${head}: 대도시 법인 주택 → 종전 §13② 괄호 — 표준세율 ${pct(args.basicRate)} + 중과기준세율×200% 4% = ${pct(rate)}`,
      warnings,
      legalBasis,
    };
  }
  return {
    exception: `${head}: 법인 주택 → 종전 §11①8호 ${pct(args.basicRate)} (§13의2①1호 12% 미적용)`,
    warnings,
    legalBasis,
  };
}
