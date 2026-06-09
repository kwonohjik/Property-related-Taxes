# 데이터/저장 설계 — 계산 이력 비즈니스 키 dedup

> 계획서: `docs/01-plan/calc-history-business-key-dedup.plan.md`
> 성격: 저장 계층(IndexedDB/Dexie) dedup 키를 content 해시 → 업무 식별 키로 전환. 엔진·UI 무변경.

## 1. 목표 / 비목표

**목표**: 세목별 업무 식별 키(business key)로 1건을 update. 상속세는 피상속인(주민번호 13자리 또는 이름+상속개시일) 기준 1건 유지. 키 도출 불가 세목·상태는 현행 content dedup 폴백(무회귀).

**비목표**: 기존 중복 record 자동 통합(수동 삭제), 키 변경 추적, 증여·종부세 인적 키, 엔진/UI/결과뷰 로직.

## 2. 데이터 모델

```ts
// lib/storage/types.ts — CalculationRecord 확장
export interface CalculationRecord {
  // ... 기존 ...
  contentHash?: string;   // 폴백 경로 dedup
  inputHash?: string;     // draft 폴백 dedup
  businessKey?: string;   // 신규 — 세목 업무 식별 키 (null이면 content 폴백)
}
```
- Dexie 스키마 버전 bump·인덱스 추가 **불필요**: businessKey는 비인덱스 필드(스키마 외 필드 저장 허용), dedup 후보는 `[userId+taxType+createdAt]` 범위 스캔(≤200건) 후 in-memory 매칭(contentHash와 동일 패턴).

## 3. extractBusinessKey (신규 순수 함수)

```ts
// lib/storage/business-key.ts
import type { LocalTaxType } from "./types";
import {
  formatDate, extractAddress, extractTransferDate,
  extractStockSecurityName, extractStockTransferDate,
} from "./title-generator"; // 비-export 헬퍼 4종 export 승격

export function extractBusinessKey(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>,
): string | null {
  switch (taxType) {
    case "inheritance": {
      const rrn = String(inputData.decedentResidentNumber ?? "").replace(/\D/g, "");
      if (rrn.length === 13) return `rrn:${rrn}`;
      const name = String(inputData.decedentName ?? "").trim();
      const death = formatDate(inputData.deathDate as string) ?? "";
      return name || death ? `nd:${name}|${death}` : null;
    }
    case "transfer": {
      const addr = extractAddress(inputData);
      const date = extractTransferDate(inputData);
      return addr || date ? `addr:${addr ?? ""}|${date ?? ""}` : null;
    }
    case "acquisition": {
      // jibun/road는 acquisition FormState top-level(shared.ts:177-178) → extractAddress 동작
      const addr = extractAddress(inputData);
      const date = formatDate(inputData.acquisitionDate as string);
      return addr || date ? `addr:${addr ?? ""}|${date ?? ""}` : null;
    }
    case "property": {
      const addr = extractAddress(inputData); // 연도 입력 필드 없음 → 주소만
      return addr ? `addr:${addr}` : null;
    }
    case "stock_transfer": {
      const sec = extractStockSecurityName(inputData);
      const date = extractStockTransferDate(inputData);
      return sec || date ? `sec:${sec ?? ""}|${date ?? ""}` : null;
    }
    default:
      return null; // gift·comprehensive_property → content 폴백(인적 식별 필드 부재, 실측 확정)
  }
}
```

> **title-generator 헬퍼 export 승격**: `formatDate`·`extractAddress`·`extractTransferDate`(현재 비-export, `title-generator.ts:13·27·43`)를 `export function`으로. `extractStockSecurityName`·`extractStockTransferDate`는 이미 export. **동작 불변**(시그니처 동일). → title ↔ businessKey 단일 소스.

## 4. saveOrUpdateByBusinessKey (신규 repo 메서드)

```ts
async saveOrUpdateByBusinessKey(input: CalculationSaveInput): Promise<{ id: string; created: boolean }> {
  const key = extractBusinessKey(input.taxType, input.inputData);

  // 키 도출 불가 → 현행 동작 폴백 (무회귀)
  if (!key) {
    const hasResult = input.resultData && Object.keys(input.resultData).length > 0;
    return hasResult ? this.saveOrUpdateByContent(input) : this.saveDraftByContent(input);
  }

  const candidates = await db.calculations
    .where("[userId+taxType+createdAt]")
    .between([uid, input.taxType, Dexie.minKey], [uid, input.taxType, Dexie.maxKey])
    .toArray();
  const targetClientId = input.clientId ?? null;
  const existing = candidates.find(
    (r) => r.businessKey === key && (r.clientId ?? null) === targetClientId,
  );

  if (existing) {
    const incoming = input.resultData ?? {};
    const hasIncoming = Object.keys(incoming).length > 0;
    // ★ 결과 보존 가드: draft(빈 결과)는 기존 계산 결과를 덮어쓰지 않음
    const nextResult = hasIncoming ? incoming : existing.resultData;
    await db.calculations.update(existing.id, {
      inputData: input.inputData,
      resultData: nextResult,
      title: input.title,
      taxLawVersion: input.taxLawVersion,
      linkedCalculationId: input.linkedCalculationId,
      businessKey: key,
      contentHash: await computeContentHash(input.inputData, nextResult),
      inputHash: await computeInputHash(input.inputData),
      updatedAt: new Date().toISOString(),
    });
    return { id: existing.id, created: false };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.transaction("rw", db.calculations, async () => {
    const count = await db.calculations.where("userId").equals(uid).count();
    if (count >= MAX_CALCULATIONS_PER_USER) { /* oldest 삭제 — 기존 패턴 */ }
    await db.calculations.add({
      ...input, id, userId: uid, businessKey: key,
      contentHash: await computeContentHash(input.inputData, input.resultData ?? {}),
      inputHash: await computeInputHash(input.inputData),
      createdAt: now, updatedAt: now,
    });
  });
  return { id, created: true };
}
```

### 4.1 결과 보존 규칙 (핵심)
- 키 매칭 update: 항상 inputData·title·businessKey·updatedAt 갱신.
- resultData: 들어온 게 비어있으면(draft) **기존 결과 유지**(`nextResult = existing.resultData`), 있으면 덮어쓰기.
- → 중간 저장(납부세액 "-") 여러 번 = 1건 입력 갱신, 계산 완료 시 같은 1건에 result 반영. draft가 final 결과를 지우지 않음.

### 4.2 draft 식별 무해성 (실측)
draft 식별은 코드 전역에서 **`Object.keys(resultData).length === 0`**(repo:33·166·216)로만 판정 — `contentHash` 부재 신호(repo:195 주석)는 식별에 미사용. → byBusinessKey가 draft 레코드(resultData {})에 contentHash를 부여해도 draft 판정·`deleteDraftsByInput`·history "미결" 표시에 **영향 없음**. 분기 단순화를 위해 contentHash 항상 계산.

## 5. 라우팅 (저장 2경로 단일화)

| 경로 | 현행 | 변경 |
|---|---|---|
| 자동저장 `use-auto-save-calculation.ts:73` | `saveOrUpdateByContent` | `saveOrUpdateByBusinessKey` |
| 수동저장 `save-handler-builders.ts:72-94` | result有 `saveOrUpdateByContent` / result無 `saveDraftByContent` + `deleteDraftsByInput` | **`saveOrUpdateByBusinessKey` 단일 호출**(내부에서 키無 폴백). `deleteDraftsByInput`은 폴백(키無) 세목에서만 의미 — 키有는 1건 update라 불필요 |

> 자동저장은 result 있을 때만 호출(기존 가드 `:57-59` 유지) → 키有면 result로 update. 수동저장은 draft(result無)도 호출 → 키有면 입력만 갱신(결과 보존).

## 6. 케이스 인벤토리

| # | 시나리오 | businessKey | 결과 |
|---|---|---|---|
| C1 | 상속 RRN13 중간저장 ×3 | `rrn:...` 동일 | 1건 update |
| C2 | 상속 RRN無, 이름+상속개시일, ×3 | `nd:이름|날짜` 동일 | 1건 |
| C3 | 상속 부분 RRN("8001") 저장 → 이름키로 | RRN<13 → `nd:` | 1건(churn 방지) |
| C4 | draft(result無) → final(result有) → draft | 동일 키 | 1건, final 결과 보존(§4.1) |
| C5 | RRN 다른 피상속인 2명 | 키 2종 | 2건 |
| C6 | 같은 피상속인·다른 clientId | 키 동일·client 다름 | 2건 |
| C7 | 이름·RRN 전무 | null | content 폴백 |
| C8 | 증여/종부세 | null | content 폴백(무회귀) |
| C9 | 양도 같은 물건+양도일 ×N | `addr:..|..` | 1건 |

### 6.1 배포 전환 동작 (기존 record)
기존 record는 `businessKey === undefined`(content-dedup 시대 생성) → byBusinessKey 스캔의 `r.businessKey === key`에 **절대 매칭 안 됨**. 따라서:
- 배포 후 같은 피상속인 **첫 저장** → 매칭 후보 없음 → **canonical 키 record 신규 1건 생성**(businessKey 부여).
- 이후 저장 → 그 키 record를 update(1건 유지).
- **기존 중복 3건은 잔존**(자동 통합 안 함) → 사용자가 삭제 버튼으로 정리(인터뷰 확정 R-2).
- → 무회귀·점진 전환. 기존 데이터 마이그레이션 코드 불요.

## 7. Pre-Do probe
- **P-1 (RED→GREEN)**: 같은 RRN13 inputData로 `saveDraftByContent` ×3 → 현행 **3건** → `saveOrUpdateByBusinessKey` ×3 → **1건**.
- **P-2 (결과 보존)**: draft→final(result)→draft 순서 → 최종 record.resultData = final 결과(빈 draft가 안 덮음).
- **P-3 (폴백)**: 증여세 inputData → key null → `saveOrUpdateByContent` 경로(기존 동작).

## 8. 테스트 anchor

`__tests__/lib/storage/business-key-dedup.test.ts`:
- B-1 extractBusinessKey: inheritance(rrn13/nd/null)·transfer(addr)·acquisition(addr+acqDate)·property(addr)·stock(sec)·gift→null·comprehensive→null.
- B-2 (C1): RRN13 ×3 → 1건.
- B-3 (C3): RRN<13 → nd: 키, ×3 → 1건.
- B-4 (C4): draft→final→draft → 1건 + final 결과 보존.
- B-5 (C5): RRN 2종 → 2건.
- B-6 (C6): 같은 키·다른 clientId → 2건.
- B-7 (C7/C8): key null → content 폴백(saveOrUpdateByContent 동작 동일).
- 회귀: `content-hash-id-normalization`·기존 dedup 테스트 통과.

## 9. DoD
- [x] CalculationRecord.businessKey 추가, db 스키마 bump 불필요 확인.
- [x] extractBusinessKey 5세목 키 + 2세목 null, title-generator 헬퍼 export 재사용.
- [x] saveOrUpdateByBusinessKey 결과 보존 가드.
- [x] 자동·수동 저장 라우팅 전환.
- [x] B-1~B-7 + 전체 `npm test` + E2E(상속 중간저장 ×3 → 이력 1건).

## 10. ✅ 구현 결과 (2026-06-09)

**Pre-Do probe**: 같은 피상속인 RRN(입력 증가) ×3 저장 → **RED: 3건**(`saveDraftByContent`) → **GREEN: 1건**(`saveOrUpdateByBusinessKey`, `rrn:` 키). draft→final→draft 시 final 결과 보존 확인.

**Do 단계 deviation (환류)**:
- **PrematureCommitError**: 신규-record `db.transaction` 내부에서 `await computeContentHash`(비-IndexedDB async) 호출 시 Dexie 트랜잭션 조기 커밋. → 해시를 **트랜잭션 진입 전 계산**(`saveOrUpdateByContent` 패턴과 동일)으로 수정.
- **자동저장 테스트 mock**: `use-auto-save-calculation.test.tsx`가 `saveOrUpdateByContent` spy → 라우팅 전환에 맞춰 `saveOrUpdateByBusinessKey` spy로 갱신.
- **draft→final 승격**: `deleteDraftsByInput`을 핸들러에서 제거하고 byBusinessKey **폴백(키無) final 경로로 이관** — 키有 세목에서 승격 로직이 update 대상 record를 잘못 삭제하는 것 방지.

**검증**: anchor `business-key-dedup.test.ts` **B-1~B-7(12 케이스) 통과**. storage 79·전체 vitest **6,844 passed/0**. `tsc` 0·`lint` 0. E2E `inheritance-history-business-key-dedup` **H-1·H-2 통과**.
