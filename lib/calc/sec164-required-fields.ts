/**
 * §164④·⑥·⑤~⑦ opt-in 필수 필드 — **payload 빌더와 validate의 단일 소스**.
 *
 * 「소득세법 시행령」 §163⑨1호·2호의 ②(§164④~⑦ 취득당시 기준시가)는 **all-or-nothing opt-in**이다:
 * 필수 필드가 모두 채워지면 ①과 비교하고, 전부 비면 ① 단독으로 계산한다.
 *
 * ⚠️ **일부만 채우면 종전에는 조용히 무시됐다** — 빌더가 `{}`를 반환하는데(spread-safe) 그것을
 *    막는 검사가 상가 상속 한 곳에만 있었다. 사용자에게는 "입력했는데 반영되지 않는" 상태다.
 *    이 모듈이 「채움 상태」를 한 곳에서 정의해 **빌더는 완성 여부로, validate는 부분 입력 여부로**
 *    같은 판정을 공유한다 ⇒ 필드가 늘어도 한 곳만 고치면 양쪽이 따라온다.
 *
 * ⚠️ **client-safe여야 한다** — UI 안내가 `total`을 읽으므로 `use client` 컴포넌트에서 import된다.
 *    엔진(`lib/tax-engine/`)을 끌어오지 않는다.
 *
 * 계획서: docs/02-design/features/sec164-partial-input-silent-noop.plan.md §5.1
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isSec163_9Cause, deriveSec163_9BaseDate } from "./transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별공시지가 최초고시 — 이 날 前 상속·증여 토지가 §163⑨1호(§164④) 대상. */
const LAND_FIRST_DISCLOSURE = "1990-08-30";
/** 개별주택가격 최초공시 — 이 날 前 상속·증여 주택이 §163⑨2호(§164⑤~⑦) 대상. */
const HOUSE_FIRST_DISCLOSURE = "2005-04-30";
/** 상가·오피스텔 기준시가 최초고시 — 이 날 前 상속·증여 상가가 §163⑨2호(§164⑥) 대상. */
const COMMERCIAL_FIRST_DISCLOSURE = "2005-01-01";

/** 한 경로의 opt-in 충족 상태. `total`은 조합에 따라 가변이다(주택 택일 그룹). */
export interface Sec164FieldStatus {
  /** 조문 표기 — 안내·에러 메시지에 그대로 쓴다 */
  clause: string;
  filled: number;
  total: number;
  /** 비어 있는 항목의 사용자 표기 이름 */
  missing: string[];
}

interface FieldSpec {
  /** 값이 있으면 true */
  has: (a: AssetForm) => boolean;
  label: string;
}

const amountField = (key: keyof AssetForm, label: string): FieldSpec => ({
  has: (a) => parseAmount(String(a[key] ?? "")) > 0,
  label,
});

const decimalField = (key: keyof AssetForm, label: string): FieldSpec => ({
  has: (a) => (parseFloat(String(a[key] ?? "").replace(/,/g, "")) || 0) > 0,
  label,
});

function tally(a: AssetForm, specs: FieldSpec[]) {
  const missing = specs.filter((s) => !s.has(a)).map((s) => s.label);
  return { filled: specs.length - missing.length, total: specs.length, missing };
}

/**
 * 택일 그룹 판정 — **완성된 그룹이 하나라도 있으면 충족**으로 본다.
 *
 * ⚠️ 순서가 뒤바뀌면 「단가 완성 + 등급 2/3」에서 잘못 차단한다. 빌더
 * (`transfer-tax-api-inheritance.ts:206`)가 완성된 분기로 payload를 만들므로 validate가 더
 * 엄격하면 "칸은 다 있는데 차단"이 된다(memory `feedback_validation_sync_8th_point`).
 *
 * 어느 그룹도 완성되지 않았으면 **손댄 그룹**(filled가 큰 쪽)을 기준으로 누락을 안내한다.
 */
function oneOf(a: AssetForm, groups: FieldSpec[][]) {
  const tallies = groups.map((g) => tally(a, g));
  const complete = tallies.find((t) => t.filled === t.total);
  if (complete) return complete;
  return tallies.reduce((best, t) => (t.filled > best.filled ? t : best), tallies[0]);
}

function merge(clause: string, ...parts: ReturnType<typeof tally>[]): Sec164FieldStatus {
  return {
    clause,
    filled: parts.reduce((n, p) => n + p.filled, 0),
    total: parts.reduce((n, p) => n + p.total, 0),
    missing: parts.flatMap((p) => p.missing),
  };
}

/**
 * 주택 §164⑤~⑦ (§163⑨2호) — `buildInheritedHouseValuationPayload`와 같은 조건.
 *
 * 필수 4 + (1990.8.30. **前**이면 「등급 3종 + 1990 ㎡당가」와 「상속개시일·증여일 단가」 **택일**,
 * **後**면 단가 필수).
 */
export function sec164HouseStatus(asset: AssetForm): Sec164FieldStatus | null {
  const isHouse = asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt";
  if (!isHouse || !isSec163_9Cause(asset.acquisitionCause)) return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  if (!baseDate || baseDate >= HOUSE_FIRST_DISCLOSURE) return null;

  const base = tally(asset, [
    decimalField("inhHouseValLandArea", "토지 면적"),
    amountField("inhHouseValLandPricePerSqmAtTransfer", "양도시 개별공시지가"),
    amountField("inhHouseValLandPricePerSqmAtFirst", "최초공시 개별공시지가"),
    amountField("inhHouseValHousePriceAtFirst", "최초공시 주택가격"),
  ]);

  const atBaseDate = amountField("inhHouseValLandPricePerSqmAtInheritance", "취득당시 개별공시지가");
  const gradeGroup: FieldSpec[] = [
    { has: (a) => gradeFilled(a.pre1990Grade_current), label: "1990.8.30. 현재 토지등급" },
    { has: (a) => gradeFilled(a.pre1990Grade_prev), label: "1990.8.30. 직전 토지등급" },
    { has: (a) => gradeFilled(a.pre1990Grade_atAcq), label: "취득시 토지등급" },
    amountField("pre1990PricePerSqm_1990", "1990.1.1. 개별공시지가"),
  ];

  const second =
    baseDate < LAND_FIRST_DISCLOSURE
      ? oneOf(asset, [gradeGroup, [atBaseDate]])
      : tally(asset, [atBaseDate]);

  return merge("§164⑤~⑦", base, second);
}

/** 상가 §164⑥ (§163⑨2호) — `buildCommercialInheritanceValuationPayload`와 같은 8필드. */
export function sec164CommercialStatus(asset: AssetForm): Sec164FieldStatus | null {
  if (asset.assetKind !== "commercial_building" || !isSec163_9Cause(asset.acquisitionCause)) {
    return null;
  }
  const baseDate = deriveSec163_9BaseDate(asset);
  if (!baseDate || baseDate >= COMMERCIAL_FIRST_DISCLOSURE) return null;

  return merge(
    "§164⑥",
    tally(asset, [
      decimalField("cbExclusiveArea", "전용면적"),
      decimalField("cbSharedArea", "공유면적"),
      decimalField("cbLandArea", "대지면적"),
      amountField("cbUnitPriceAtFirstOrAcq", "최초고시 ㎡당 호별고시가"),
      amountField("cbLandPricePerSqmAtAcq", "취득시 개별공시지가"),
      amountField("cbLandPricePerSqmAtFirst", "최초고시 개별공시지가"),
      amountField("cbBuildingStdPriceAtAcq", "취득시 건물 기준시가"),
      amountField("cbBuildingStdPriceAtFirst", "최초고시 건물 기준시가"),
    ]),
  );
}

/** 토지 §164④ (§163⑨1호) — `buildPre1990LandPayload`와 같은 5필드. */
export function sec164LandStatus(asset: AssetForm): Sec164FieldStatus | null {
  if (asset.assetKind !== "land" || !isSec163_9Cause(asset.acquisitionCause)) return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  if (!baseDate || baseDate >= LAND_FIRST_DISCLOSURE) return null;

  return merge(
    "§164④",
    tally(asset, [
      decimalField("acquisitionArea", "취득 당시 면적"),
      { has: (a) => gradeFilled(a.pre1990Grade_current), label: "1990.8.30. 현재 토지등급" },
      { has: (a) => gradeFilled(a.pre1990Grade_prev), label: "1990.8.30. 직전 토지등급" },
      { has: (a) => gradeFilled(a.pre1990Grade_atAcq), label: "취득시 토지등급" },
      amountField("pre1990PricePerSqm_1990", "1990.1.1. 개별공시지가"),
    ]),
  );
}

/** 등급은 번호(정수)·등급가액 두 모드 공통으로 "양수면 채움" — `buildGrade`와 같은 판정. */
function gradeFilled(raw: string | undefined): boolean {
  const n = Number(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0;
}

/** 부분 입력 여부 — 「하나라도 손댔는데 끝까지 가지 않았다」. */
export function isPartiallyFilled(s: Sec164FieldStatus | null): s is Sec164FieldStatus {
  return !!s && s.filled > 0 && s.filled < s.total;
}

/** opt-in 충족 — 빌더가 payload를 만들 조건. */
export function isFullyFilled(s: Sec164FieldStatus | null): s is Sec164FieldStatus {
  return !!s && s.filled === s.total;
}
