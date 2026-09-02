/**
 * anchor: 이력·세션 복원 자산에 `assetId`가 반드시 채워진다
 *
 * ## 발견 경위
 *
 * 신고서 정본 작업(PR #1407) 중 E2E에서 React 경고
 * 「Each child in a list should have a unique "key" prop … passed a child from TransferTaxCalculator」가
 * 16건 나왔다. master에서도 재현돼 기존 문제로 분류했고, 이후 결정적 재현을 잡아 원인을 좁혔다.
 *
 * 원인은 `migrateAsset`이 `assetId`를 채우지 않는 것이다(COV-6과 같은 부류 —
 * migrate는 `makeDefaultAsset`과 병합하지 않아 명시적으로 세우지 않은 필드가 undefined로 남는다).
 * 사이드바 요약이 `key={row.assetId}`를 쓰므로 `key={undefined}`가 된다.
 *
 * ## 경고보다 큰 문제
 *
 * `assetId`는 표시용이 아니라 **자산 식별자**다:
 *   · `transfer-tax-validate-asset.ts:712` — `other.assetId !== a.assetId`로 중복을 가른다.
 *     둘 다 undefined면 `undefined !== undefined`가 false라 **서로 같은 자산으로 취급**된다.
 *   · `transfer-per-asset-summary.ts:403` · `bundled-sale-apportionment.ts:241` —
 *     i>0 자산의 propertyId가 곧 `assetId`다. undefined면 일괄 안분 매칭이 깨진다.
 *   · `transfer-tax-schema.ts:659` — 컴패니언 id 집합.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset, makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const id = (raw: unknown) => (migrateAsset(raw) as unknown as Record<string, unknown>).assetId;

describe("[key-guard] migrateAsset — assetId", () => {
  it("🔴 빈 레코드를 복원해도 assetId가 채워진다", () => {
    expect(typeof id({})).toBe("string");
    expect(String(id({})).length).toBeGreaterThan(0);
  });

  it("🔴 부분 자산(이력·세션 시드)도 채워진다", () => {
    const v = id({ assetKind: "housing", addressJibun: "서울 강남구 대치동 1-1" });
    expect(typeof v).toBe("string");
    expect((v as string).length).toBeGreaterThan(0);
  });

  it("🔴 자산마다 서로 다른 id — 중복 판정·안분 매칭이 무너지지 않는다", () => {
    const a = id({ assetKind: "housing" });
    const b = id({ assetKind: "land" });
    expect(a).not.toBe(b);
  });

  it("기존 assetId는 덮어쓰지 않는다 (이력 매칭 보존)", () => {
    expect(id({ assetId: "asset-1700000000000-0" })).toBe("asset-1700000000000-0");
  });

  it("빈 문자열도 유효한 id로 채운다", () => {
    const v = id({ assetId: "" });
    expect(typeof v).toBe("string");
    expect((v as string).length).toBeGreaterThan(0);
  });

  it("factory 자산은 이미 id가 있어 그대로 통과한다 (대조군)", () => {
    const f = makeDefaultAsset(1) as unknown as Record<string, unknown>;
    expect(id(f)).toBe(f.assetId);
  });
});
