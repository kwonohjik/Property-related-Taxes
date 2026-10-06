/**
 * 겸용주택 — 「건물 취득일 기준 ㎡당 공시지가」 **필수 판정 술어** (Phase B0 · 단일 소스).
 *
 * 설계: `docs/02-design/features/mixed-use-acq-std-date-mismatch.engine.design.md` §5.2.
 *
 * 결함: 주택 건물분 취득시 기준시가는 개별주택가격(건물 취득일 공시)에서 나온다. 두 취득일이 다르면
 *   토지 취득일 가목과 건물 취득일 H가 서로 다른 날짜의 값이 된다 → 별개 취득이면 **건물 취득일 기준
 *   공시지가**를 따로 받아야 한다(토지 취득일 기준 값으로 대체 금지).
 *   S3-2 이후 이 값은 H에서 빼는 감수가 아니라 가목:나목 **비례 분모의 가목**이다(`mixed-use-housing-std.ts`).
 *
 * 엔진(`transfer-tax-mixed-use-housing.ts`)·⑫ Zod(`transfer-tax-schema-mixed-use.ts`)·UI 어댑터
 * (`lib/calc/mixed-use-acq-date-split.ts` — ⑤ 노출·④ 전송·⑧ 필수)가 **모두 이 함수 한 곳**을 호출한다.
 * 규칙을 두 곳에 쓰면 UI 통과 ↔ 서버 차단 모순이 생긴다(dual-truth).
 */

export interface BuildingDayLandPriceInput {
  /** 토지 취득일 (ISO 날짜 문자열 또는 Date) — 비어 있으면 별개 취득이 아니다. */
  landDate: Date | string | undefined | null;
  /** 건물 취득일 */
  buildingDate: Date | string | undefined | null;
  /** 미공시 주택 §164⑦ 3시점 환산(PHD) 사용 여부 — ON이면 개별주택가격 분할(가목:나목 비례) 경로를 타지 않는다(PHD가 자체 3시점 분할). */
  usePhd?: boolean;
  /** 보유 중 용도변경 방향 — `commercial_to_house`는 개별주택가격을 쓰지 않는다. */
  partialDirection?: "house_to_commercial" | "commercial_to_house";
  /** 취득시 개별주택가격 — 비례 분할의 분자(H). 0·미입력이면 소비처가 없다. */
  housingPrice?: number | undefined;
}

/** 날짜 단위 키 (YYYY-MM-DD). 비어 있거나 무효면 "". */
function dateKey(d: Date | string | undefined | null): string {
  if (d === undefined || d === null || d === "") return "";
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

/** 두 취득일이 (날짜 단위로) 다른가 — 둘 다 있어야 한다. */
export function areMixedAcqDatesSeparate(
  landDate: Date | string | undefined | null,
  buildingDate: Date | string | undefined | null,
): boolean {
  const l = dateKey(landDate);
  const b = dateKey(buildingDate);
  return l !== "" && b !== "" && l !== b;
}

/**
 * 건물 취득일 기준 ㎡당 공시지가가 **필수**인가.
 *
 * 겸용 ∧ 두 취득일 다름 ∧ PHD OFF ∧ 용도변경이 `commercial_to_house` 아님 ∧ 취득시 개별주택가격 > 0.
 * (겸용 여부는 호출부 컨텍스트 — 이 함수는 겸용 payload에서만 부른다.)
 */
export function isBuildingDayLandPriceRequired(input: BuildingDayLandPriceInput): boolean {
  return (
    areMixedAcqDatesSeparate(input.landDate, input.buildingDate) &&
    input.usePhd !== true &&
    input.partialDirection !== "commercial_to_house" &&
    (input.housingPrice ?? 0) > 0
  );
}
