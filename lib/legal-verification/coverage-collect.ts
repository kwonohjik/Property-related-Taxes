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

import { isLegalCitation } from "./coverage";

const MODULES: unknown[] = [
  transfer,
  inheritanceGift,
  acquisition,
  property,
  comprehensive,
  stock,
  burdenedGift,
  common,
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
