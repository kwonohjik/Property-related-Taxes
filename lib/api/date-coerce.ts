/**
 * API Route Date 직렬화 헬퍼.
 *
 * 클라이언트가 `new Date()` 객체를 fetch 페이로드로 전달해도 JSON 직렬화 후 라우트는
 * string으로 받는다. 엔진 타입이 `Date`인데 string이 도달하면:
 *   - `Date < string` 비교는 silent false (조용한 버그)
 *   - `date.getTime()` 호출 시 TypeError
 *   - `compareDates(a, b)` 의 `<`/`>` 연산이 lexicographic string 비교로 falsy
 *
 * 모든 라우트 핸들러는 엔진 호출 직전 string→Date 명시 변환을 강제해야 한다.
 * 이 헬퍼는 그 변환 패턴을 표준화하고 누락을 사전 차단한다.
 *
 * ## 사용 예
 *
 * ### 단일 값 (필수)
 *   const transferDate = toDate(data.transferDate, "transferDate");
 *
 * ### 단일 값 (옵션)
 *   const constructionDate = toOptionalDate(data.constructionDate);
 *
 * ### 객체 in-place 변환 (선언형)
 *   const coerced = coerceDates(data, [
 *     "transferDate",
 *     "acquisitionDate",
 *     "partialUsageChange.usageChangeDate",
 *     "preHousingDisclosure.firstDisclosureDate",
 *   ]);
 *
 * ## 새 Date 필드 추가 시
 *
 * 1. 엔진 input 타입에 `Date` 필드 추가
 * 2. 라우트 핸들러에서 `toDate()` / `toOptionalDate()` / `coerceDates()` 중 하나 사용
 * 3. 사용하지 않으면 silent false 비교로 이어질 수 있으므로 review 시 차단할 것
 */

/** 엄격 변환 — string|Date|number 입력. invalid 시 에러. */
export function toDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new Error(`Invalid Date for "${fieldName}"`);
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date string for "${fieldName}": ${String(value)}`);
    }
    return d;
  }
  throw new Error(`Expected Date|string|number for "${fieldName}", got ${typeof value}`);
}

/** 옵션 변환 — null/undefined/빈문자열 → undefined. invalid 문자열은 에러. */
export function toOptionalDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * 선언형 bulk 변환. dot-notation path 지원, 배열 요소는 `[]` 표기.
 *
 * 예) `"assets[].acquisitionDate"` → `obj.assets[i].acquisitionDate` 모든 요소 변환
 *
 * 원본 객체를 변경하지 않고 새 객체를 반환 (얕은 복사 + 경로상 노드 복사).
 * 경로가 없거나 값이 null/undefined/""이면 건너뜀 (옵션 필드 안전).
 * 값이 invalid 문자열이면 에러를 throw 한다 — silent false 차단이 목적이므로.
 */
export function coerceDates<T extends Record<string, unknown>>(
  obj: T,
  paths: readonly string[]
): T {
  // deep-ish clone: paths 상의 노드만 복사
  const result = structuredClone(obj);
  for (const path of paths) {
    coercePath(result as unknown as Record<string, unknown>, path.split("."), path);
  }
  return result;
}

function coercePath(node: unknown, segments: string[], fullPath: string): void {
  if (node === null || node === undefined || segments.length === 0) return;
  const [head, ...rest] = segments;

  // 배열 요소 표기: "assets[]"
  if (head.endsWith("[]")) {
    const key = head.slice(0, -2);
    const arr = (node as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      coercePath(item, rest, fullPath);
    }
    return;
  }

  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (rest.length === 0) {
    // 잎 노드 — 변환
    const v = obj[head];
    if (v === null || v === undefined || v === "") return;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) {
        throw new Error(`Invalid Date for "${fullPath}"`);
      }
      return;
    }
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date string for "${fullPath}": ${String(v)}`);
      }
      obj[head] = d;
      return;
    }
    return;
  }

  // 중간 노드 — 재귀
  coercePath(obj[head], rest, fullPath);
}
