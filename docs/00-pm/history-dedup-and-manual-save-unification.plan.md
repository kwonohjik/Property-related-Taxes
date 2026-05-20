# 계산 이력 중복 저장 방지 + 자동·수동 저장 통합 계획서 (v2)

> 작성: 2026-05-21
> v1 → v2: §검토 후 4가지 핵심 결정 변경 — Dexie 스키마 변경 폐기 / 미계산 저장 비활성화 / 수동 저장은 "스냅샷" 의미로 재정의 / 자동저장 토스트 가시화
> 대상: 6대 세목 결과 화면 + `useAutoSaveCalculation` + 수동 "저장하기" 버튼
> 우선 적용: 증여세(`GiftTaxForm` / `GiftTaxResultView`) — 동일 패턴 후속 PR로 5세목 확장

---

## 0. v1 → v2 변경 요약

| # | 항목 | v1 | v2 (수정) | 변경 이유 |
|---|---|---|---|---|
| 0-1 | 저장소 스키마 | Dexie v5 + `[userId+taxType+contentHash]` 복합 인덱스 + upgrade backfill | **스키마 변경 없음** — in-memory dedup (200건 상한 내 full scan ~μs) | 마이그레이션 데이터 손실 위험 회피 |
| 0-2 | 미계산 상태 저장 | `resultData={}` 적재 | **저장 비활성화** — 토스트 "결과 계산 후 저장 가능합니다" | 미계산↔계산 record가 다른 해시로 중복 재발 차단 |
| 0-3 | "저장하기" 버튼 의미 | 동일 record 갱신 (사실상 no-op) | **"현재 시점 스냅샷"** — `updatedAt` 갱신 + 신규/갱신 토스트 분기 | 사용자에게 명시적 가치 제공 |
| 0-4 | 자동저장 가시화 | silent | **결과 화면 진입 시 자동 토스트 1회** ("✓ 이력에 저장되었습니다") | 저장 여부 즉시 확인 가능 |

---

## 1. 문제 정의

### 1.1. 사용자 신고 현상

`/history`에 동일 입력·동일 결과(예: 납부세액 165,191,000)의 중복 레코드 2건이 6분 간격(06:20, 06:26)으로 노출됨.

### 1.2. 재현 시나리오

| # | 사용자 행동 | 시스템 동작 (현행) | 결과 |
|---|---|---|---|
| 1 | 입력 완료 후 "계산하기" | 결과 화면 마운트 → `useAutoSaveCalculation` 자동 1건 저장 | record A |
| 2 | 결과 화면에서 "저장하기" 클릭 | `handleManualSave()` → 신규 `save()` | **record B (중복)** |
| 3 | "저장하기" 한 번 더 클릭 | 또 신규 save | **record C (중복)** |
| 4 | "다시 계산" → 같은 데이터 재계산 | `setResult(data.result)` 새 객체 → `lastSavedResultRef !== resultData` → 자동저장 또 발생 | **record D (중복)** |

### 1.3. 근본 원인

**자동 저장과 수동 저장이 서로의 존재를 모름.** 두 경로가 독립적으로 `calculationRepository.save()`를 호출하여 동일 내용을 N건 적재. `lastSavedResultRef` 참조 비교는 새 객체마다 재실행되어 dedup 역할을 못 함.

---

## 2. 해결 전략

### 2.1. 핵심 원칙

> **"같은 입력 + 같은 결과 + 같은 의뢰인" 조합은 단일 레코드 1건만 존재.** 후속 저장 호출은 `updatedAt` 갱신으로 흡수.
> **미계산 상태는 저장하지 않는다.** 결과 미계산 시 "저장하기"는 비활성화.

### 2.2. Dedup 키 — `contentHash`

`contentHash` = `sha1Hex(stableStringify(inputData) + "|" + stableStringify(resultData))` 의 첫 16 hex chars.

#### `stableStringify` 규약 (`lib/storage/content-hash.ts` 신규)

```typescript
/**
 * 키 정렬 + undefined 제거 + Date ISO 변환을 강제한 안정적 직렬화.
 *
 * 규약:
 * - 객체: 키를 알파벳 오름차순 정렬 후 직렬화
 * - undefined 값을 가진 키: 출력에서 제거 (JSON.stringify 기본 동작과 동일하지만 명시)
 * - null: 그대로 보존
 * - Date 인스턴스: toISOString() 사용
 * - NaN/Infinity: null로 치환 (JSON.stringify 동작 보존)
 * - 배열: 순서 보존 (자산-수준 배열 순서가 의미를 가짐)
 * - 함수/Symbol: 제거
 * - 순환 참조: throw (CalculationRecord에는 없어야 함)
 */
export function stableStringify(value: unknown): string;
export function sha1Hex(text: string): string;  // Web Crypto API 사용
export function computeContentHash(input: Record<string, unknown>, result: Record<string, unknown>): string;
```

#### Dedup 키 4-tuple

`(userId, taxType, clientId ?? null, contentHash)` — 의뢰인별 별도 record 유지를 위해 `clientId` 포함. `taxLawVersion`·`title`·`createdAt`·`updatedAt`은 키에서 제외.

### 2.3. 단일 저장 경로 — `saveOrUpdateByContent()`

`calculation-repository.ts`에 새 메서드 (Dexie 스키마는 **변경하지 않음**):

```typescript
async saveOrUpdateByContent(input: CalculationInput): Promise<{ id: string; created: boolean }> {
  const hash = computeContentHash(input.inputData, input.resultData);

  // in-memory dedup — 사용자당 200건 상한 내에서 full scan은 μs 단위
  const candidates = await db.calculations
    .where("[userId+taxType+createdAt]")
    .between([uid, input.taxType, Dexie.minKey], [uid, input.taxType, Dexie.maxKey])
    .toArray();

  const existing = candidates.find(
    (r) => r.contentHash === hash && (r.clientId ?? null) === (input.clientId ?? null)
  );

  if (existing) {
    await db.calculations.update(existing.id, {
      // 입력·결과는 동일하다고 dedup 키로 검증된 상태 — title·updatedAt만 갱신
      title: input.title,
      taxLawVersion: input.taxLawVersion,  // 동일 입력이라도 호출 시점이 다르면 버전 갱신
      updatedAt: new Date().toISOString(),
    });
    return { id: existing.id, created: false };
  }

  // 신규 record 추가 — 기존 save() 로직 (200건 상한·oldest 삭제·add) 재사용
  const id = crypto.randomUUID();
  await db.transaction("rw", db.calculations, async () => {
    const count = await db.calculations.where("userId").equals(uid).count();
    if (count >= MAX_CALCULATIONS_PER_USER) {
      const oldest = await db.calculations
        .where("[userId+createdAt]")
        .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
        .first();
      if (oldest) await db.calculations.delete(oldest.id);
    }
    const now = new Date().toISOString();
    await db.calculations.add({ ...input, id, userId: uid, contentHash: hash, createdAt: now, updatedAt: now });
  });
  return { id, created: true };
}
```

#### `CalculationRecord.contentHash` 필드 정책

- 타입에 `contentHash: string` optional 추가 — **인덱스 없음**, 단순 컬럼.
- 기존 레코드는 `contentHash === undefined` 그대로 둠 (backfill 불필요).
- `saveOrUpdateByContent` 호출 시점에만 `contentHash`를 계산해 저장.
- 기존 `save()` 메서드는 deprecated 표시 후 호출처 모두 `saveOrUpdateByContent`로 마이그레이션.

### 2.4. 미계산 저장 비활성화

`resultData`가 빈 상태(`{}` 또는 `null`)에서는 저장 자체를 차단:

```typescript
// GiftTaxForm.handleManualSave 진입부
if (!result) {
  setSaveMessage({
    kind: "info",
    text: "결과를 먼저 계산하시면 자동으로 이력에 저장됩니다.",
  });
  return;
}
```

UI 측면:
- 결과 미계산 시 "저장하기" 버튼은 **disabled + tooltip** (헤더·하단 양쪽)
- 결과 화면에서는 정상 활성화

### 2.5. "저장하기" 버튼 의미 재정의

| 호출 시점 | 동작 | 토스트 |
|---|---|---|
| 첫 클릭 (자동저장 후 동일 contentHash) | `updatedAt`만 갱신 | "✓ 현재 시점 스냅샷으로 갱신되었습니다 (ID: xxxxxxxx)" |
| 입력 수정 후 재계산 → 다시 클릭 | 새 contentHash → 신규 record | "✓ 새 이력으로 저장되었습니다 (ID: xxxxxxxx)" |
| 미계산 상태 클릭 | 차단 + 안내 | "결과를 먼저 계산하시면 자동으로 이력에 저장됩니다." |

### 2.6. 자동저장 토스트 가시화

`useAutoSaveCalculation`이 반환하는 `savedId`·`created`·`error` 상태를 결과 화면에서 토스트로 1회 표시:

```typescript
// GiftTaxResultView 진입 시
const { savedId, autoSaveStatus } = useAutoSaveCalculation({ ... });
useEffect(() => {
  if (autoSaveStatus === "saved" && savedId) {
    showToast({ kind: "success", text: `✓ 이력에 자동 저장되었습니다 (ID: ${savedId.slice(0,8)})` });
  } else if (autoSaveStatus === "error") {
    showToast({ kind: "error", text: "자동 저장 실패 — 우상단 저장하기 버튼으로 재시도하세요." });
  }
}, [autoSaveStatus, savedId]);
```

토스트 컴포넌트는 `components/calc/shared/SaveToast.tsx`로 분리 (6세목 공유 준비).

### 2.7. History "수정" 흐름 상세

```
[/history 행 "수정" 클릭]
  ↓
prefill — 폼 상태 복원 (sessionStorage "giftTaxResumeInput")
  ↓
[사용자가 폼 진입]
  ↓
A. 입력 무변경 → 다시 "계산하기"
     ↓
   동일 contentHash → saveOrUpdateByContent → updatedAt 갱신 → 원본 record 보존
B. 입력 변경 → "계산하기"
     ↓
   다른 contentHash → 신규 record 추가 (원본은 그대로)
```

기존 `sessionStorage.editingCalculationId` 플래그·`saveAsUpdate`·`saveAsNew` API는 **모두 폐기**. contentHash 기반 dedup이 의미를 자동 결정.

### 2.8. clientId 분리 정책

- 의뢰인 A + 동일 입력 → 1 record
- 의뢰인 B + 동일 입력 → 1 record (별개)
- 본인 모드 (clientId=null) + 동일 입력 → 1 record (별개)

자동저장과 수동저장 사이에 의뢰인 전환 시 → 다른 dedup 키 → 별도 record (의도된 동작).

### 2.9. taxLawVersion 일관성

현행 `form.giftDate || new Date().toISOString().split("T")[0]` 패턴은 입력 없을 때 호출 시각을 사용 — 미계산 저장을 §2.4로 차단했으므로 `form.giftDate`는 항상 채워진 상태에서만 도달. 안전.

---

## 3. 작업 항목 (단계별)

### Phase 1 — 인프라 (Storage Layer, 0.5d)

| # | 작업 | 파일 | 산출 |
|---|---|---|---|
| 1-1 | `stableStringify` + `sha1Hex` + `computeContentHash` 헬퍼 | `lib/storage/content-hash.ts` (신규) | export 3종 + 단위 테스트 |
| 1-2 | `CalculationRecord.contentHash?: string` optional 필드 추가 | `lib/storage/types.ts` | 필드 추가 (인덱스 없음) |
| 1-3 | `saveOrUpdateByContent()` 메서드 + 200건 상한 회귀 | `lib/storage/calculation-repository.ts` | 신규 메서드 |
| 1-4 | 기존 `save()` deprecated 주석 | 상동 | JSDoc `@deprecated` |
| 1-5 | Dexie 스키마 v4 유지 — 변경 없음 | `lib/storage/db.ts` | 무변경 검증 |

### Phase 2 — Hook · UI 통합 (0.5d)

| # | 작업 | 파일 | 산출 |
|---|---|---|---|
| 2-1 | `useAutoSaveCalculation` → `saveOrUpdateByContent` 사용 + `autoSaveStatus`·`created` 반환 추가 | `lib/storage/use-auto-save-calculation.ts` | `pendingEditId`·`saveAsUpdate`·`saveAsNew` 제거 |
| 2-2 | `editingCalculationId` sessionStorage 플래그 grep 후 모두 제거 | 전 코드베이스 | history "수정"은 prefill만 |
| 2-3 | `SaveToast.tsx` 공통 컴포넌트 분리 | `components/calc/shared/SaveToast.tsx` (신규) | fixed bottom-right z-50 |
| 2-4 | `GiftTaxForm.handleManualSave` → `saveOrUpdateByContent` + 신규/갱신 분기 | `components/calc/GiftTaxForm.tsx` | 미계산 차단 가드 + 토스트 분기 |
| 2-5 | `GiftTaxResultView`에 자동저장 토스트 1회 노출 | `components/calc/results/GiftTaxResultView.tsx` | autoSaveStatus → SaveToast |
| 2-6 | `SaveButton` disabled prop + tooltip | `components/calc/shared/SaveButton.tsx` | 미계산 시 disabled + `title` |

### Phase 3 — 5세목 확장 (각 0.25d × 5 = 1.25d, 후속 PR)

| 세목 | 진입 파일 | 비고 |
|---|---|---|
| 양도세 | `TransferTaxCalculator.tsx` | 자동저장 통합 확인 후 수동 SaveButton 2개 + 토스트 |
| 주식 양도세 | `StockTransferTaxCalculator.tsx` | 동상 |
| 상속세 | `InheritanceTaxForm.tsx` | UI 완성도 확인 |
| 취득세·재산세·종부세 | UI 완성 시점 적용 | 동일 패턴 |

### Phase 4 — 검증 (0.5d)

| # | 검증 항목 | 방법 | anchor |
|---|---|---|---|
| 4-1 | 동일 입력+동일 결과 반복 저장 → record 1건 | vitest | `count === 1`, `updatedAt` 갱신, `created === false` |
| 4-2 | 입력 변경 후 저장 → 새 record | vitest | `count === 2`, 두 hash 다름 |
| 4-3 | 의뢰인 A·B 동일 입력 → 2건 (clientId 분리) | vitest | `count === 2` |
| 4-4 | 미계산 상태 "저장하기" → 차단 + info 토스트 | 브라우저 수동 | 토스트 문구 확인 |
| 4-5 | history "수정" → 입력 무변경 재계산 → 원본 update | vitest + 브라우저 | 원본 id 유지, count 무변동 |
| 4-6 | history "수정" → 입력 변경 재계산 → 신규 record | vitest + 브라우저 | count +1 |
| 4-7 | 200건 상한 회귀 — saveOrUpdate에서도 oldest 삭제 | vitest | 기존 anchor 보존 |
| 4-8 | §1.2 시나리오 1~4 모두 record 1건 | 브라우저 수동 | `/history` count 확인 |
| 4-9 | `stableStringify` 키 순서 안정성 | vitest | `stableStringify({b:1,a:2}) === stableStringify({a:2,b:1})` |
| 4-10 | `stableStringify` undefined·Date·NaN·null 처리 | vitest | 각 케이스 anchor |

---

## 4. 위험·트레이드오프

| 위험 | 영향 | 완화 |
|---|---|---|
| **stableStringify 키 순서 불안정** | 같은 객체 다른 해시 → dedup 실패 | 재귀 정렬 + 단위 테스트 4-9·4-10 anchor |
| **기존 record `contentHash === undefined`** | 기존 데이터 dedup 안 됨 | 의도된 동작 — 첫 saveOrUpdate 호출 시 자동 hash 부여, 이후 dedup 정상 작동 |
| **자동저장 토스트가 시각적 노이즈** | 모든 결과 화면에서 토스트 노출 | 3초 자동 사라짐 + opacity transition + 사용자 명시 닫기 X 버튼 |
| **수동 "저장하기" 의미 혼동** | "이미 자동 저장됐는데 또?" 의문 | 토스트 문구 "현재 시점 스냅샷으로 갱신되었습니다" 명시 |
| **clientId 전환 race** | 자동저장과 수동저장 사이에 의뢰인 전환 시 별도 record 적재 | 의도된 동작 — 의뢰인별 분리는 비즈니스 요구사항 |
| **200건 상한 도달 시 oldest 삭제** | 사용자가 의도한 record 손실 가능 | 기존 동작 보존 — 별도 UX 알림은 후속 PR |

---

## 5. Definition of Done

- [ ] `lib/storage/content-hash.ts` + 단위 테스트 (안정성·키 순서·undefined·Date·NaN·null 6 anchor)
- [ ] `CalculationRecord.contentHash?: string` optional 필드 추가
- [ ] `saveOrUpdateByContent()` 메서드 + 200건 상한 회귀 anchor
- [ ] `save()` deprecated 마킹
- [ ] `useAutoSaveCalculation` 리팩토링 + `autoSaveStatus` 반환 추가
- [ ] `editingCalculationId` sessionStorage 플래그 grep 0건
- [ ] `SaveToast.tsx` 공통 컴포넌트 (fixed bottom-right z-50)
- [ ] 결과 화면 진입 시 자동저장 토스트 1회 노출
- [ ] 미계산 상태 "저장하기" disabled + tooltip + info 토스트
- [ ] 수동 저장 토스트 — 신규/갱신/미계산 3분기 문구
- [ ] 브라우저 수동 확인: §1.2 시나리오 1~4 모두 record 1건
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run lib/storage/` 통과 (회귀 0)
- [ ] 5세목 확장은 후속 PR 명시

---

## 6. 후속 (별도 PR)

- 5세목 확장 (양도·주식양도·상속·취득·재산·종부) — `useManualSave(taxType)` 훅 추출
- `/history` 페이지에 "동일 입력 그룹화" 토글 (UI dedup, 데이터는 그대로)
- 200건 상한 도달 시 사용자 알림 (`/history`에 경고 배너)
- 기존 중복 record 일괄 cleanup 스크립트 (`npm run db:dedup-history`) — opt-in
- 자동저장 토스트 사용자 설정 (`설정 > 알림 > 자동저장 토스트 표시`) — 노이즈 회피 옵션
