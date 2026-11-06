/**
 * 조특법 §99의4 — **면적 요건**(종전 ①1호나목·2호다목)·**수도권 행 모순**(①1호가목1)·2호나목1))·**해석 칸 고지**
 * (엔진 평가기·⑤ 입력 화면·⑧ validate·⑫ Zod 공용 — 리뷰 NH-05 PR-2b · NH-20, 계획서 `new-housing-99-review-fixes.plan.md` §3-6).
 *
 * ## 면적 요건 (2026-11-06 시행본 실독 — 조특법 MST 177204·217957, 조특령 MST 183033)
 * - 대지 660㎡: 「대지면적이 660제곱미터 이내일 것」 — 법률 제17759호(2021.1.1.)가 삭제, 부칙 제21조② 「이 법 시행 이후
 *   양도하는 경우부터」 ⇒ **2021.1.1. 전 양도분**에 묻는다(취득 시기 무관 — 계획서 격자 전 행 × C1·C2 〔명확〕).
 * - 주택 150㎡: 「주택의 면적이 대통령령으로 정하는 기준 이내」 + 조특령 §99의4⑤(2016.5.10. 시행본) 「주택의 연면적이
 *   150제곱미터(공동주택의 경우에는 전용면적 116제곱미터) 이내」 — 법률 제14390호(2017.1.1.)가 삭제, 부칙 제2조③
 *   양도분 ⇒ **2017.1.1. 전 양도분**에 묻는다. 2009.1.1. 이후 취득분(R3·R4)만 〔명확〕이다.
 * - 2009.1.1. 전 취득분(R1·R2)의 주택 면적 · 2021.1.1. 이후 양도분의 면적: 개정 적용 여부가 해석 칸이다(계획서 Q-4 (c)) —
 *   **현행 판정**(주택 면적 미적용 · 2021 이후 대지 미적용) + 「확인 필요」 고지.
 *
 * ## 수도권 행 모순 (NH-20 · 리뷰 Q-7 (b))
 * 명부 행 법정동코드가 수도권인데 소재지 요건을 「충족」으로 켰으면 ⑧·⑫가 막는다. 예외는 ①1호가목1) 단서 지역뿐이다.
 * - 2023.2.28. 전 양도: 조특령 §99의4③(구) 「경기도 연천군, 인천광역시 옹진군」(유사지역 부령 지정은 2005~2022 시행규칙에 없음)
 * - 2023.2.28. 이후 양도(대통령령 제33264호 부칙 제13조 — 시행 전 양도는 종전): 접경지역이면서 인구감소지역으로서 부령 지역 —
 *   조특칙 §45① 2023.3.20. 신설 「연천군 / 강화군·옹진군」. 2023.2.28.~3.19.(부령 신설 전)은 판정하지 않고 강화군까지 예외로 둔다.
 * - 2025.3.21. 이후 양도(기획재정부령 제1119호 부칙 제4조): 가평군 추가.
 * - 고향주택(①2호나목1))은 수도권 예외가 없다.
 * - 기회발전특구(①1호가목 본문 — 2024.1.1. 이후 양도분, 법률 제19936호 부칙 제16조)는 「취득 당시」 특구 소재면 충족이라
 *   행 주소만으로 판정할 수 없다. 근거법(지방자치분권 및 지역균형발전에 관한 특별법) 시행일 2023.7.10. 이후 취득분은 막지 않는다.
 */

import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import {
  NEW_99_4_AREA_ADDENDA,
  NEW_99_4_STD_PRICE_ADDENDA,
  NEW_HOUSING_SUB_ARTICLE,
} from "../legal-codes/transfer";
import type { New994IneligibleReason } from "./types";

const T_2009 = new Date("2009-01-01").getTime();
const T_2014 = new Date("2014-01-01").getTime();
const T_2017 = new Date("2017-01-01").getTime();
const T_2021 = new Date("2021-01-01").getTime();
const T_2023 = new Date("2023-01-01").getTime();
const T_DECREE_2023 = new Date("2023-02-28").getTime();
const T_GAPYEONG = new Date("2025-03-21").getTime();
const T_ZONE_LAW = new Date("2023-07-10").getTime();
const T_ZONE_TRANSFER = new Date("2024-01-01").getTime();

/** 대지면적 한도(㎡) — 종전 ①1호나목·2호다목 */
export const NEW_99_4_LAND_AREA_LIMIT = 660;
/** 주택 연면적 한도(㎡) — 종전 조특령 §99의4⑤ */
export const NEW_99_4_HOUSE_FLOOR_AREA_LIMIT = 150;
/** 공동주택 전용면적 한도(㎡) — 종전 조특령 §99의4⑤ 괄호 */
export const NEW_99_4_MULTI_UNIT_AREA_LIMIT = 116;

export interface New994SizeScope {
  /** 대지 660㎡를 묻는가 (2021.1.1. 전 양도) */
  land: boolean;
  /** 주택 150㎡(공동주택 전용 116㎡)를 묻는가 (2017.1.1. 전 양도 · 2009.1.1. 이후 취득) */
  house: boolean;
}

/** 면적 요건 범위 — 양도일·취득일이 없으면 묻지 않는다(취득일 미입력은 평가기가 이미 불성립). */
export function resolveNew994SizeScope(input: { transferDate?: Date; ruralHouseAcquisitionDate?: Date }): New994SizeScope {
  const tr = input.transferDate?.getTime();
  const acq = input.ruralHouseAcquisitionDate?.getTime();
  if (tr === undefined || acq === undefined) return { land: false, house: false };
  return { land: tr < T_2021, house: tr < T_2017 && acq >= T_2009 };
}

/** 주택 면적 한도 — 공동주택이면 전용 116㎡, 그 밖은 연면적 150㎡ */
export const new994HouseAreaLimit = (type: "multi_unit" | "other") =>
  type === "multi_unit" ? NEW_99_4_MULTI_UNIT_AREA_LIMIT : NEW_99_4_HOUSE_FLOOR_AREA_LIMIT;

/** 면적 요건 불성립 사유 — 범위 밖이면 빈 배열. 미입력은 「불성립 + 확인 필요」(자동 fallback 금지). */
export function evaluateNew994Size(input: {
  isHometown: boolean;
  transferDate: Date;
  ruralHouseAcquisitionDate?: Date;
  ruralLandAreaSqm994?: number;
  ruralHouseType994?: "multi_unit" | "other";
  ruralHouseAreaSqm994?: number;
  legalBasis: string;
}): New994IneligibleReason[] {
  const scope = resolveNew994SizeScope(input);
  const item = input.isHometown ? "2호다목" : "1호나목";
  const reasons: New994IneligibleReason[] = [];
  if (scope.land) {
    const basis = `종전 조특법 §99의4①${item} — 2021.1.1. 전 양도분, ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2021_TRANSFER}`;
    const land = input.ruralLandAreaSqm994;
    if (land === undefined || !(land > 0)) {
      reasons.push({
        code: "AREA_UNCONFIRMED",
        message: `확인 필요: 대지면적이 입력되지 않아 적용하지 않았습니다 (${basis} — 660㎡ 이내).`,
        legalBasis: input.legalBasis,
      });
    } else if (land > NEW_99_4_LAND_AREA_LIMIT) {
      reasons.push({
        code: "LAND_AREA_EXCEEDED",
        message: `대지면적 ${land}㎡가 660㎡를 초과합니다 (${basis}).`,
        legalBasis: input.legalBasis,
      });
    }
  }
  if (scope.house) {
    const basis = `종전 조특법 §99의4①${item} · 종전 조특령 §99의4⑤ — 2017.1.1. 전 양도분, ${NEW_99_4_AREA_ADDENDA.AMEND_2017_TRANSFER}`;
    const type = input.ruralHouseType994;
    const area = input.ruralHouseAreaSqm994;
    if (!type || area === undefined || !(area > 0)) {
      reasons.push({
        code: "AREA_UNCONFIRMED",
        message: `확인 필요: 주택 유형·면적이 입력되지 않아 적용하지 않았습니다 (${basis} — 연면적 150㎡, 공동주택은 전용면적 116㎡ 이내).`,
        legalBasis: input.legalBasis,
      });
    } else if (area > new994HouseAreaLimit(type)) {
      reasons.push({
        code: "HOUSE_AREA_EXCEEDED",
        message: `${type === "multi_unit" ? `공동주택 전용면적 ${area}㎡가 116㎡` : `주택 연면적 ${area}㎡가 150㎡`}를 초과합니다 (${basis}).`,
        legalBasis: input.legalBasis,
      });
    }
  }
  return reasons;
}

/**
 * 적격 판정의 「해석례 없음, 확인 필요」 고지 — 계획서 Q-4·Q-5 (c). 결론을 가를 수 있는 칸에서만 낸다.
 *
 * - Q-4: 2009.1.1. 전 취득분(법률 제9272호 부칙 제22조 — 2009 개정은 그 뒤 취득분부터)에 그 뒤의 양도분 개정(2017 주택 면적
 *   삭제·2021 대지 삭제와 가액 목 이동·2023 3억원)이 미치는가. 현행 판정은 「미친다」 쪽(가장 넓은 한도·면적 미적용)이다.
 * - Q-5: 2014.1.1. 전 구입한 등록 한옥을 2021.1.1. 이후 양도할 때 4억원(법률 제12173호 부칙 제32조 — 구입분부터) 적용 여부.
 *   현행 4억원 판정 — 기준시가가 일반 한도를 넘을 때만 결론이 갈린다.
 */
export function new994InterpretationNotices(input: {
  transferDate: Date;
  ruralHouseAcquisitionDate: Date;
  ruralHouseStdPrice: number;
  isRegisteredHanok?: boolean;
}): string[] {
  const tr = input.transferDate.getTime();
  const acq = input.ruralHouseAcquisitionDate.getTime();
  const notices: string[] = [];
  if (acq < T_2009) {
    const tail = `2009.1.1. 전 취득분은 ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2009_ACQUISITION}에 따라 종전 규정이 적용된다고 읽을 여지가 있습니다`;
    notices.push(
      tr < T_2021
        ? `확인 필요: 주택 연면적 150㎡(공동주택 전용면적 116㎡) 요건을 적용하지 않고 판정했습니다 — ${tail}(그 경우 이 요건을 갖춰야 합니다). 해석례를 찾지 못했습니다.`
        : `확인 필요: 2021.1.1. 이후 양도분의 개정(대지면적 요건 삭제·가액 한도 — ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2021_TRANSFER}${tr >= T_2023 ? `·${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2023_TRANSFER}` : ""})을 적용해 판정했습니다 — ${tail}(그 경우 가액 7천만원(2008년 취득 1억5천만원)·대지 660㎡·주택 150㎡ 요건). 해석례를 찾지 못했습니다.`,
    );
  }
  if (input.isRegisteredHanok === true && acq < T_2014 && tr >= T_2021) {
    const general = tr >= T_2023 ? 300_000_000 : 200_000_000;
    if (input.ruralHouseStdPrice > general) {
      notices.push(
        `확인 필요: 2014.1.1. 전 구입한 등록 한옥에 한도 4억원을 적용해 판정했습니다 — 4억원은 ${NEW_99_4_STD_PRICE_ADDENDA.HANOK_2014_PURCHASE}에 따라 2014.1.1. 이후 구입분부터라고 읽으면 한도가 ${general === 300_000_000 ? "3억" : "2억"}이고 이 주택은 적용되지 않습니다. 해석례를 찾지 못했습니다.`,
      );
    }
  }
  return notices;
}

/** ①1호가목1) 단서 예외 군(시군구 5자리) — 양도일별(위 머리말). 양도일을 모르면 모든 시기의 합집합(막지 않는 쪽). */
function capitalExceptionSigungu(transferDate: Date | undefined): ReadonlySet<string> {
  const tr = transferDate?.getTime();
  if (tr === undefined || tr >= T_GAPYEONG) return new Set(["41800", "41820", "28710", "28720"]);
  if (tr < T_DECREE_2023) return new Set(["41800", "28720"]);
  return new Set(["41800", "28710", "28720"]);
}

/**
 * NH-20 — 명부 행 법정동코드가 **예외 아닌 수도권**인데 소재지 요건을 「충족」으로 답한 모순. 모순이면 안내 문장, 아니면 `undefined`.
 * ⑧(`house-count-exclusion-reduction-validate.ts`)·⑫(`transfer-tax-schema-reduction-refines.ts`)·⑤가 같은 함수를 부른다.
 */
export function new994CapitalRegionConflict(input: {
  isHometown: boolean;
  meetsLocationRequirement?: boolean;
  regionCode?: string;
  transferDate?: Date;
  ruralHouseAcquisitionDate?: Date;
}): string | undefined {
  if (input.meetsLocationRequirement !== true) return undefined;
  if (isCapitalAreaByRegionCode(input.regionCode) !== true) return undefined;
  const fix = "주소를 확인하거나 「소재지 요건 충족 확인」을 끄세요.";
  if (input.isHometown) {
    return `이 주택의 주소가 수도권으로 조회됩니다 — 고향주택은 수도권에 있으면 적용되지 않습니다 (조특법 §99의4①2호나목1)). ${fix}`;
  }
  const acq = input.ruralHouseAcquisitionDate?.getTime();
  const tr = input.transferDate?.getTime();
  if (acq !== undefined && acq >= T_ZONE_LAW && (tr === undefined || tr >= T_ZONE_TRANSFER)) return undefined;
  if (capitalExceptionSigungu(input.transferDate).has((input.regionCode ?? "").slice(0, 5))) return undefined;
  return (
    `이 주택의 주소가 수도권으로 조회됩니다 — 농어촌주택은 수도권에 있으면 적용되지 않습니다(접경지역 중 예외 지역 — 연천군·옹진군, ` +
    `2023.2.28. 이후 양도분은 강화군, 2025.3.21. 이후 양도분은 가평군 — 만 제외) ` +
    `(조특법 §99의4①1호가목1) · ${NEW_HOUSING_SUB_ARTICLE.NEW_99_4_CAPITAL_EXCEPTION_DECREE} · ${NEW_HOUSING_SUB_ARTICLE.NEW_99_4_CAPITAL_EXCEPTION_RULE}). ${fix}`
  );
}
