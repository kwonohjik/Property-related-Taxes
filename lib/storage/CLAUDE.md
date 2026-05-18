# lib/storage/ — 로컬 데이터 저장소

IndexedDB(Dexie.js) 기반 로컬 저장소. 향후 Supabase 도입 시 **데이터 폐기 후 새로 시작** (마이그레이션 코드 불필요).

## 파일 구조

```
constants.ts              # LOCAL_USER_ID 상수
types.ts                  # UserProfile · CalculationRecord · LocalTaxType
db.ts                     # Dexie v1 + 복합 인덱스 3종
current-user.ts           # getCurrentUserId() — Supabase 교체 단일 지점
user-repository.ts        # createUserRepository(uid) 클로저 패턴
calculation-repository.ts # createCalculationRepository(uid)
title-generator.ts        # 세목별 자동 title 생성
use-auto-save-calculation.ts  # 결과 화면 마운트 시 자동 저장 훅
migrations/
  reduction-reclassification.ts  # 기존 이력의 §99의3 'unsold_housing' → 'new_99_3' 재분류
                                 # ⚠️ 함수만 작성됨 — db.ts v4 스키마 연결은 Phase 2 활성화 대기
```

## 핵심 규칙

- **`LOCAL_USER_ID` 상수 필수**: `constants.ts` import. 문자열 `"local-user"` 직접 사용 금지.
- **userId 필터 강제**: 모든 SELECT는 `where("userId").equals(uid)` — `getCurrentUserId()` 경유.
- **수정 vs 신규 구분**: `sessionStorage["editingCalculationId"]` 있으면 `update()` (덮어쓰기), 없으면 `save()` (신규).
- **자동 저장 시점**: 결과 화면 마운트 1회. `useAutoSaveCalculation` 훅 사용 — 직접 `save()` 호출 금지.
- **200건 상한**: `save()` 내부 자동 관리 (oldest 삭제).

## Dexie 복합 인덱스

```ts
calculations: "id, userId, taxType, createdAt,
  [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId]"
```

## 세목별 결과 화면에 자동 저장 통합

```ts
useAutoSaveCalculation({
  taxType: "transfer",
  inputData: formData as unknown as Record<string, unknown>,
  resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
  taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
});
```

구현 완료: 양도세(`TransferTaxCalculator.tsx`), 주식 양도세(`StockTransferTaxCalculator.tsx`). 타 세목 UI 완성 시 동일 패턴.

## resultData 구조 주의

`TransferAPIResult`는 `{ mode: "single", result: TransferTaxResult }` 구조. `totalTax`는 최상위가 아닌 `resultData.result.totalTax`. 이력 화면 추출 시 `mode`별 분기 필수.

## `/history` 라우트

- `proxy.ts` 보호 없음 (인증 불필요). Supabase 도입 시 `PROTECTED_ROUTES`에 재추가.
- 데이터 소스: `calculationRepository.list()` (IndexedDB). Server Action 미사용.
- 세목별 날짜 필드명: `transferDate`(양도세, top-level), `targetDate`(취득세), `deathDate`(상속세), `giftDate`(증여세), `targetDate`/`assessmentYear`(재산세·종부세), `transferDate`(주식 양도세 top-level — 분할 lot 모드는 `transferLots` 마지막 요소의 `transferDate`, `extractStockTransferDate` 헬퍼 사용).

## Supabase 전환 체크리스트

1. `current-user.ts`의 `getCurrentUserId()` → `auth.uid()` 반환으로 교체
2. `proxy.ts`에 `/history` 재추가
3. `HistoryClient` 데이터 소스 → Server Action으로 전환
4. 로컬 DB 폐기 안내 모달 (첫 로그인 시)
