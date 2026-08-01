/**
 * NBL 재촌 시·군·구 코드 복구 마이그레이션 (계획서 §6-C · Y-4).
 *
 * ## 무엇이 잘못됐나
 *
 * `nblLandSigunguCode`는 5종 코드 필드 중 **유일하게 PNU가 아닌 곳**에서 온다 —
 * 사용자가 `SigunguSelect`를 직접 조작하면 그 시점 테이블의 코드가 저장된다.
 * 그런데 그 테이블(`sigungu-codes.ts` 구 154건)이 **전면 낡아 있었고 43건은 아예
 * 다른 지역을 가리켰다**(계획서 D-3 — 서울은 도봉구부터 한 칸씩 밀려 `11680`이 「서초구」).
 *
 * ⇒ 이력을 복원해 **재계산**하면 재촌 1호(동일 시·군·구)·2호(연접)가 엉뚱한 집합으로
 *   판정된다. 구 테이블 154건 시뮬레이션에서 **82건이 재촌 부정**으로 뒤집혔다.
 *   (저장된 `resultData`는 불변이므로 과거 결과 자체는 그대로다.)
 *
 * ## 왜 코드가 아니라 **이름**으로 고치는가
 *
 * 저장값만 보고는 어느 체계인지 알 수 없다 — `11680`은 구 체계(서초구)와 현행(강남구)
 * **양쪽에 존재**한다. 코드를 일괄 변환하면 **정상 값을 망가뜨린다**(계획서 §6-C.3).
 *
 * 다행히 `SigunguSelect`가 `onChange(code, fullName)`으로 이름을 함께 넘기고 스토어가
 * `nblLandSigunguName`에 보관한다. **이름이 진실의 원천**이다 — 사용자가 목록에서 고른
 * 것은 「서초구」라는 이름이지 숫자가 아니다.
 *
 * ## 안전 규칙 — 애매하면 건드리지 않는다
 *
 *   1. 이름이 없으면 건너뛴다.
 *   2. 이름 = 코드면 건너뛴다 — 5자리 **직접 입력** 경로(`SigunguSelect.tsx`가
 *      `onChange(trimmed, trimmed)`로 넘긴다)라 이름에 정보가 없다(계획서 Y-8).
 *   3. 현행 테이블에서 이름이 **정확히 1건**에 매칭될 때만 코드를 바꾼다.
 *      0건(폐지·분할)이든 2건 이상(동명이인)이든 손대지 않는다.
 *   4. 이미 현행 코드면 아무것도 하지 않는다.
 *
 * 그래서 인천 자치구 재편(중구·동구 폐지 — N:M)이나 부천·화성 일반구 신설(1:N)처럼
 * **하나로 정해지지 않는 것은 자동 복구 대상이 아니다**. 잘못 고치느니 두는 편이 낫다.
 */

import type { Transaction } from "dexie";
import { SIGUNGU_CODES } from "@/lib/korean-law/sigungu-codes";

/** 시·도 개칭 — 저장된 이름이 개칭 전이면 현행 표기로 바꿔 한 번 더 찾는다. */
const SIDO_RENAMES: readonly [from: string, to: string][] = [
  ["강원도", "강원특별자치도"],
  ["전라북도", "전북특별자치도"],
  // 전남·광주 통합(시행 2026-07-01) — 두 시·도가 하나로 합쳐졌다.
  ["전라남도", "전남광주통합특별시"],
  ["광주광역시", "전남광주통합특별시"],
];

/** fullName → 현행 코드. 같은 이름이 둘 이상이면 값을 `null`로 두어 매칭을 포기한다. */
const BY_FULL_NAME: ReadonlyMap<string, string | null> = (() => {
  const m = new Map<string, string | null>();
  for (const s of SIGUNGU_CODES) {
    m.set(s.fullName, m.has(s.fullName) ? null : s.code);
  }
  return m;
})();

/**
 * 저장된 이름으로 현행 코드를 찾는다. 확정하지 못하면 `null`.
 * 내보내는 이유는 마이그레이션 없이도 단위 테스트로 규칙을 고정하기 위해서다.
 */
export function resolveCurrentSigunguCodeByName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const direct = BY_FULL_NAME.get(trimmed);
  if (direct !== undefined) return direct; // null이면 동명 충돌 — 포기

  for (const [from, to] of SIDO_RENAMES) {
    if (!trimmed.startsWith(`${from} `)) continue;
    const renamed = `${to} ${trimmed.slice(from.length + 1)}`;
    const hit = BY_FULL_NAME.get(renamed);
    if (hit !== undefined) return hit;
  }
  return null;
}

interface AssetPartial {
  nblLandSigunguCode?: string;
  nblLandSigunguName?: string;
  [key: string]: unknown;
}

interface CalcRecordPartial {
  inputData?: { assets?: AssetPartial[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** 자산 1건을 제자리 수정. 바꿨으면 true. */
export function recoverAssetSigunguCode(asset: AssetPartial): boolean {
  const code = asset.nblLandSigunguCode?.trim();
  const name = asset.nblLandSigunguName?.trim();
  if (!code || !name) return false;
  if (code === name) return false; // 5자리 직접 입력 — 이름에 정보 없음

  const current = resolveCurrentSigunguCodeByName(name);
  if (!current || current === code) return false;

  asset.nblLandSigunguCode = current;
  return true;
}

/**
 * Dexie upgrade 트랜잭션에서 호출. `calculations`의 자산별 NBL 시·군·구 코드를
 * **저장된 이름 기준**으로 현행 코드에 다시 맞춘다.
 *
 * @returns 코드를 바꾼 자산 수 (안내 토스트용)
 */
export async function migrateNblSigunguCodeRecovery(tx: Transaction): Promise<number> {
  let transformed = 0;
  await tx
    .table("calculations")
    .toCollection()
    .modify((r: CalcRecordPartial) => {
      const assets = r.inputData?.assets;
      if (!Array.isArray(assets)) return;
      for (const asset of assets) {
        if (asset && typeof asset === "object" && recoverAssetSigunguCode(asset)) transformed++;
      }
    });
  return transformed;
}
