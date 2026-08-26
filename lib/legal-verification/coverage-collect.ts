/**
 * legal-codes 인용 수집 (server-only)
 *
 * lib/tax-engine/legal-codes/* 의 모든 export를 순회해 법령 인용 문자열을 모은다.
 * legal-codes 전체를 import하므로 client에서 직접 사용하지 말 것
 * (커버리지 결과는 API route를 통해 받는다). 스크립트·route 공용.
 */

import * as transfer from "@/lib/tax-engine/legal-codes/transfer";
import * as inheritanceGift from "@/lib/tax-engine/legal-codes/inheritance-gift";
import * as acquisition from "@/lib/tax-engine/legal-codes/acquisition";
import * as property from "@/lib/tax-engine/legal-codes/property";
import * as comprehensive from "@/lib/tax-engine/legal-codes/comprehensive";
import * as stock from "@/lib/tax-engine/legal-codes/stock";
import * as burdenedGift from "@/lib/tax-engine/legal-codes/burdened-gift";
import * as common from "@/lib/tax-engine/legal-codes/common";
// ⚠️ legal-codes 에 모듈이 추가되면 **여기에도** 넣어야 한다 — 빠진 조문은 모수에서도 사라져
//    uncovered 에 뜨지 않고 게이트가 100% 로 통과한다(F-39).
//    `transfer.ts` 가 `export *` 로 재수출하는 `transfer-nbl`·`transfer-house` 는 구제된다.
//    열거 누락은 `legal-coverage-module-enumeration.anchor.test.ts` 가 디렉터리와 대조해 잡는다.
import * as buildingStandardPrice from "@/lib/tax-engine/legal-codes/building-standard-price";
import * as surchargeTransition from "@/lib/tax-engine/legal-codes/surcharge-transition";
import * as incomeTax from "@/lib/tax-engine/legal-codes/income-tax";
import * as localTax from "@/lib/tax-engine/legal-codes/local-tax";
import * as transferMixedUse from "@/lib/tax-engine/legal-codes/transfer-mixed-use";

import { isLegalCitation } from "./coverage";
import { parseCitations, LAW_ALIAS } from "./citation-parser";

const MODULES: unknown[] = [
  transfer,
  inheritanceGift,
  acquisition,
  property,
  comprehensive,
  stock,
  burdenedGift,
  common,
  buildingStandardPrice,
  surchargeTransition,
  incomeTax,
  localTax,
  transferMixedUse,
];

/** 객체/배열을 재귀 순회하며 모든 문자열 leaf를 수집한다. */
function collectStrings(value: unknown, out: string[], seen: WeakSet<object>) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v) => collectStrings(v, out, seen));
    } else {
      Object.values(value as Record<string, unknown>).forEach((v) =>
        collectStrings(v, out, seen),
      );
    }
  }
}

/**
 * legal-codes 전 모듈에서 법령 인용처럼 파싱되는 문자열만 수집한다.
 */
export function collectCitedCitations(): string[] {
  const seen = new WeakSet<object>();
  const allStrings: string[] = [];
  for (const mod of MODULES) {
    collectStrings(mod, allStrings, seen);
  }
  return allStrings.filter(isLegalCitation);
}

/**
 * 조문 인용처럼 파싱되지만 **법령명이 `LAW_ALIAS`에 없어 커버리지 모수에서 빠지는**
 * 인용을 법령명별로 모은다.
 *
 * `collectCitedCitations`의 여집합이다. 모수에서 빠지는 것 자체는 정상일 수 있지만
 * (부칙·훈령은 조문 API로 조회 불가), **빠지는 줄도 모르는 상태**는 정상이 아니다 —
 * `legal-verification-unverifiable.test.ts`가 이 결과를 `UNVERIFIABLE_LAW_NAMES`와
 * 대조해 새로 새는 법령을 잡는다.
 */
export function collectUnknownLawCitations(): Map<string, string[]> {
  const seen = new WeakSet<object>();
  const allStrings: string[] = [];
  for (const mod of MODULES) {
    collectStrings(mod, allStrings, seen);
  }

  const known = new Set(Object.keys(LAW_ALIAS));
  const byLaw = new Map<string, string[]>();
  for (const s of allStrings) {
    for (const parsed of parseCitations(s)) {
      if (known.has(parsed.lawAbbr)) continue;
      const list = byLaw.get(parsed.lawAbbr) ?? [];
      if (!list.includes(s)) list.push(s);
      byLaw.set(parsed.lawAbbr, list);
    }
  }
  return byLaw;
}
