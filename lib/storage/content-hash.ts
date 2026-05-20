/**
 * content-hash — 계산 이력 dedup용 안정적 해시 계산
 *
 * 같은 입력+같은 결과 조합이 항상 같은 hash를 만들어내도록
 * 키 정렬·undefined 제거·Date 정규화를 강제한다.
 *
 * 규약 (계획서 §2.2):
 * - 객체: 키 알파벳 오름차순 정렬
 * - undefined 값 키: 제거 (JSON.stringify 기본 동작 명시)
 * - null: 그대로 보존
 * - Date 인스턴스: toISOString() 사용
 * - NaN/Infinity: null로 치환
 * - 배열: 순서 보존
 * - 함수·Symbol: 제거
 * - 순환 참조: throw
 */

/** 안정적 직렬화 — 키 정렬·Date 정규화·NaN 치환 적용 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  function serialize(v: unknown): string | undefined {
    if (v === undefined) return undefined;
    if (v === null) return "null";

    // 원시 타입
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") {
      if (Number.isNaN(v) || !Number.isFinite(v)) return "null";
      return JSON.stringify(v);
    }
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "bigint") return JSON.stringify(v.toString());

    // 함수·Symbol 제거
    if (typeof v === "function" || typeof v === "symbol") return undefined;

    // Date — toISOString 으로 정규화
    if (v instanceof Date) {
      return JSON.stringify(Number.isNaN(v.getTime()) ? null : v.toISOString());
    }

    if (typeof v === "object") {
      if (seen.has(v as object)) {
        throw new Error("stableStringify: circular reference detected");
      }
      seen.add(v as object);

      // 배열 — 순서 보존
      if (Array.isArray(v)) {
        const parts = v.map((item) => serialize(item) ?? "null");
        seen.delete(v as object);
        return "[" + parts.join(",") + "]";
      }

      // 일반 객체 — 키 알파벳 정렬 + undefined 키 제거
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const child = serialize(obj[k]);
        if (child === undefined) continue;
        parts.push(JSON.stringify(k) + ":" + child);
      }
      seen.delete(v as object);
      return "{" + parts.join(",") + "}";
    }

    return undefined;
  }

  const result = serialize(value);
  return result ?? "null";
}

/**
 * SHA-1 hex 다이제스트 — Web Crypto API
 * 보안 목적이 아니라 dedup 키 — 충돌 확률 무시 가능
 */
export async function sha1Hex(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // Node 환경(테스트 등) 폴백 — node:crypto 동적 import
    const { createHash } = await import("node:crypto");
    return createHash("sha1").update(text).digest("hex");
  }
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 입력·결과 조합의 dedup 키 (16 hex chars).
 * final 저장 시 사용.
 */
export async function computeContentHash(
  input: Record<string, unknown>,
  result: Record<string, unknown>
): Promise<string> {
  const text = stableStringify(input) + "|" + stableStringify(result);
  const full = await sha1Hex(text);
  return full.slice(0, 16);
}

/**
 * 입력만의 dedup 키 (16 hex chars) — draft 매칭 + draft↔final 승격 추적용 (v4).
 *
 * - draft 저장 시 `saveDraftByContent`가 본 해시로 동일 input draft를 dedup
 * - final 자동저장 직전 `deleteDraftsByInput`이 본 해시로 동일 input draft 일괄 삭제
 * - final 저장 시에도 record에 함께 부여하여 history "수정" prefill 흐름 일관성 보장
 *
 * `computeContentHash`와 다른 값임을 명시 (input vs input+"|"+result).
 */
export async function computeInputHash(
  input: Record<string, unknown>
): Promise<string> {
  const text = stableStringify(input);
  const full = await sha1Hex(text);
  return full.slice(0, 16);
}
