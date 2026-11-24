/**
 * 주택부수토지 배율·면적 한도 판정 — **단일 소스** (NBL-STATE-HISTORY-E3-③ · 엔진 계획서 D-12).
 *
 * `housing-land.ts`(양도일 현재 상태)와 과거 주택 구간(`resolveHouseInterval` — 소유기간 중 신축·철거 이력)이 **같은 함수**로 배율을 정한다:
 *   `getHousingMultiplier`(영 §168의12 · 양도일 경과조치) → `areaTimes`(정수 곱) → `judgeAreaLimit`(정수 정확 비교).
 * 새 배율표·새 면적 비교를 만들지 않는다 — `housing-land.ts:84-101`을 **이동만** 했다(경고 문구·steps 바이트 동일).
 *
 * 배율 연혁 = **양도일 기준**(D-11): 영 부칙(제30395호, 2020.2.11.) 제1조 3호·제2조②·제39조 — 「2022년 1월 1일 전에 양도한 자산에 대해서는 종전의 규정」.
 * 소유기간 중 과거 구간에 «그 구간 당시 법령»을 쓰라는 규정은 없다 → 과거 주택 구간도 양도일 시행 배율로 판정한다.
 */
import { areaTimes, isAreaOver, judgeAreaLimit } from "../area-limit";
import type { AreaLimitJudgment } from "../area-limit";
import { houseFootprintBlankMessage, houseFootprintExceedsLandMessage, houseFootprintNotNumberMessage, houseFootprintNotPositiveMessage } from "./nbl-validation-messages";
import type { StateEventSubject } from "./nbl-validation-messages";
import { getHousingMultiplier } from "./urban-area";
import type { HouseCheck, HouseOutcome } from "./land-usage.types";
import type { ZoneType } from "./types";

/** 수도권 여부 미제공 시의 보수적 기본값(수도권) 경고 — `judgeHousingLand`가 싣는 문구(바이트 동일). */
export const HOUSING_METRO_DEFAULTED_WARNING =
  "수도권 여부(isMetropolitanArea) 미제공 — 보수적 기본값(수도권)으로 배율 산정. 수도권 여부를 명시하면 정확한 배율이 적용됩니다.";

export interface HousingLimitInput {
  zoneType: ZoneType;
  /** `undefined` = 미제공 → 보수적으로 수도권으로 본다(`metroDefaulted`). */
  isMetropolitanArea: boolean | undefined;
  /** 양도일 — 배율 경과조치(2022.1.1.)의 기준일. */
  transferDate: Date;
  /** 주택 정착면적(㎡). */
  footprint: number;
  landArea: number;
}

export interface HousingLimitJudgment {
  multiplier: number;
  multiplierDetail: string;
  /** 허용 면적 = 정착면적 × 배율(㎡). */
  allowedArea: number;
  limit: AreaLimitJudgment;
  /** 수도권 여부를 받지 못해 보수적 기본값(수도권)으로 계산했다. */
  metroDefaulted: boolean;
}

export function judgeHousingLimit(input: HousingLimitInput): HousingLimitJudgment {
  // isMetropolitanArea 미지정 시 수도권으로 보수적 처리 (납세자에게 불리한 쪽 적용)
  const metroDefaulted = input.isMetropolitanArea === undefined;
  const isMetropolitan = input.isMetropolitanArea ?? true;
  // 영 §168의12 배율 경과조치(2022.1.1., 부칙 §39) — 양도일 기준.
  const { multiplier, detail: multiplierDetail } = getHousingMultiplier(input.zoneType, isMetropolitan, input.transferDate);
  // NBL2611-V9-I — 한도·초과 면적은 정수 정확 비교(`area-limit.ts` 단일 소스).
  const allowedArea = areaTimes(input.footprint, multiplier);
  const limit = judgeAreaLimit(input.landArea, allowedArea);
  return { multiplier, multiplierDetail, allowedArea, limit, metroDefaulted };
}

/** 과거 주택 구간 판정에 필요한 카드 단위 사실 — 호출자(apply · ⑤ 미리보기 · ⑧)가 **같은 값**을 넘긴다(3중 패턴). */
export interface HouseIntervalCtx {
  zoneType: ZoneType;
  isMetropolitanArea: boolean | undefined;
  landArea: number;
  transferDate: Date;
}

export interface HouseIntervalResolution {
  houseOutcome: HouseOutcome;
  /** `within`·`exceeded`일 때만(계산한 근거). */
  houseCheck?: HouseCheck;
}

/**
 * 과거 주택 구간(철거 행이 닫는 구간)의 배율 이내 판정.
 *
 *   · 정착면적이 **양수 수치이고 토지 면적 이하**이면 `judgeHousingLimit`로 허용 면적과 토지 면적을 비교한다 → 이내 = `within` · 초과 = `exceeded`.
 *   · 빈칸·0·음수·비수치(`undefined`·`NaN`) **그리고 정착면적 > 토지 면적** → `unconfirmed`(모름 = 혜택 불성립). 정착면적 > 토지 면적을 «이내»로 읽지 않는다 —
 *     허용 면적(정착 × 배율 ≥ 정착)이 토지 면적 이상이라 자동으로 이내가 되어 오입력이 사업용을 만든다(계획서 Y-31).
 *   UI 경로에서는 ⑧이 이 경우를 전부 먼저 차단한다(`houseFootprintIssue` · Q-10 (가)) — 엔진은 **직접 API 안전망**이라 던지지 않고 접는다(400 없음).
 */
export function resolveHouseInterval(footprint: number | undefined, ctx: HouseIntervalCtx): HouseIntervalResolution {
  if (footprint === undefined || !Number.isFinite(footprint) || footprint <= 0) return { houseOutcome: "unconfirmed" };
  if (isAreaOver(footprint, ctx.landArea)) return { houseOutcome: "unconfirmed" };
  const r = judgeHousingLimit({ zoneType: ctx.zoneType, isMetropolitanArea: ctx.isMetropolitanArea, transferDate: ctx.transferDate, footprint, landArea: ctx.landArea });
  return {
    houseOutcome: r.limit.within ? "within" : "exceeded",
    houseCheck: { footprint, multiplier: r.multiplier, multiplierDetail: r.multiplierDetail, allowedArea: r.allowedArea, landArea: ctx.landArea, excessArea: r.limit.excess },
  };
}

// ── ⑧ 입력 검증 (문자열 → 결함) ───────────────────────────────

/** 정착면적 입력 결함 — `blank`(빈칸) · `not_number`(비수치) · `not_positive`(0·음수) · `exceeds_land`(정착면적 > 토지 면적). */
export interface HouseFootprintIssue {
  kind: "blank" | "not_number" | "not_positive" | "exceeds_land";
  message: string;
}

/** 쉼표를 허용하는 수치 — `parseRawNumber`(⑭)보다 엄격하다(`12abc`·`1e2`는 비수치). ⑧만 쓰고 ⑫는 거울이 없다(엔진이 접는다). */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * 철거 행 «철거 직전 주택 정착면적» 입력의 결함 — **⑧ 공용 leaf**(Q-10 (가) · R-9). 빈칸·0·음수·비수치·정착면적 > 토지 면적을 전부 차단한다(housing E1-03 정합).
 * 직접 API(⑫·엔진)에는 거울이 없다 — UI 통과 ↔ API 400 모순을 만들지 않는다(⑫가 ⑧보다 엄격하지 않다). 엔진은 같은 경우를 `unconfirmed`로 접는다.
 *
 * @param index 사건 행 번호(0부터) — 문구는 1부터 적는다.
 * @param landArea 토지 면적(㎡) — 문자열(폼 값)·수치. 비어 있거나 읽을 수 없으면 «정착면적 > 토지 면적» 규칙은 건너뛴다(앞 단계 면적 검증 몫).
 * @param subject 문구의 사건 주체 — 기본 `house`(주택부수토지 카드 «주택 사건 N번째 행» — 종전과 바이트 동일). 기타토지 카드의 철거 행(B)은 `building`을 넘겨 행 제목(«건축물 사건 N번째 행»)과 같은 말을 쓴다(D-9).
 */
export function houseFootprintIssue(footprint: string | undefined, index: number, landArea: string | number | undefined, subject: StateEventSubject = "house"): HouseFootprintIssue | null {
  const text = (footprint ?? "").trim();
  if (text === "") return { kind: "blank", message: houseFootprintBlankMessage(index, subject) };
  const compact = text.replace(/,/g, "");
  if (!NUMERIC.test(compact)) return { kind: "not_number", message: houseFootprintNotNumberMessage(index, text, subject) };
  const value = parseFloat(compact);
  if (!Number.isFinite(value)) return { kind: "not_number", message: houseFootprintNotNumberMessage(index, text, subject) };
  if (value <= 0) return { kind: "not_positive", message: houseFootprintNotPositiveMessage(index, text, subject) };
  const land = typeof landArea === "number" ? landArea : parseFloat(String(landArea ?? "").replace(/,/g, ""));
  if (Number.isFinite(land) && land > 0 && isAreaOver(value, land)) return { kind: "exceeds_land", message: houseFootprintExceedsLandMessage(index, text, String(landArea).trim(), subject) };
  return null;
}
