# 로컬 우선 저장 일원화 + 이력 백업(Export/Import) — 계획서 v2

> 작성 2026-06-25 · 상태: Plan(adversarial 검증 완료) · 영역: 저장 아키텍처(전 세목 공통)
> 목적: 이력을 **사용자 로컬(IndexedDB)에 단일 보관**해 개인정보 보관 책임에서 자유로워지되,
> 로컬-only의 약점(데이터 소실)을 **Export/Import 백업**으로 보완.
> **트랙 A — 백업 + 다건 양도세 로컬 저장 보강** · **트랙 B — Supabase 계산 저장(쓰기+읽기) 제거**.
>
> v2 변경: 병렬 6-lens adversarial 검증(495k 토큰)으로 49개 이슈 반영. 주요 정정은 §12 참조.

---

## 1. 배경 · 목적

- 방침: 이력은 각 기기에만 저장 → 서버 미보관으로 개인정보보호법상 수집·보관·유출 책임 최소화.
- 트레이드오프: 유출 리스크↓, **데이터 소실 리스크(브라우저 삭제·기기 변경)** 가 사용자에게 전가됨 → **백업 필수 동반**.
- A(백업)와 B(Supabase 제거)는 **함께** 진행해야 일관적(B만 → 소실 위험, A만 → 이중 시스템 잔존).

---

## 2. 현행 아키텍처 — 정밀 실측 (2026-06-25, 병렬 12-에이전트 조사·검증)

### 2-1. IndexedDB (Dexie) — 실질 주력

- `lib/storage/db.ts` — **v6, 테이블 5개**: `userProfile`·`calculations`·`clients`·`reverseGeocodeCache`·`rtmsSalesCache`.
- `calculationRepository` — save/saveOrUpdateByContent/**saveOrUpdateByBusinessKey**(자동저장 실제 경로)/saveDraftByContent/list/get/update/remove/clearAll. userId 필터 강제, 200건 상한(`MAX_CALCULATIONS_PER_USER=200`, 경고 190). 상한은 repository 내부 자동 관리(초과 시 oldest 삭제).
- `useAutoSaveCalculation`(결과화면 마운트 1회) → `saveOrUpdateByBusinessKey`. **메인 `/history`(HistoryClient)는 IndexedDB만 읽음**(L202).
- `CalculationRecord` 19필드. ⚠️ **`createdAt`/`updatedAt`은 `string`(ISO 8601, `new Date().toISOString()`)** — epoch 아님(types.ts L100-101 실측). JSON.stringify 시 그대로 보존.
- `contentHash`/`inputHash`/`businessKey`는 **optional**(legacy 레코드엔 없음). `linkedCalculationId`(재산세↔종부세 연동)·`clientId`(세무사 의뢰인) 포함.
- `buildingStdSnapshots`는 `useAutoSaveCalculation`이 inputData에 **임베드** → calculations만 백업하면 따라옴.

### 2-2. Supabase — 이중 병존 (제거 대상)

- `actions/calculations.ts` 5함수: `saveCalculation`(insert+oldest delete)·`listCalculations`·`getCalculation`·`deleteCalculation`(**함수 자체는 호출처 0 dead**, 단 삭제는 아래 [id] 라우트가 직접 쿼리)·`migratePendingResult`.
- **쓰기 호출처**: `app/api/calc/property/route.ts:126`·`comprehensive/route.ts:302`(둘 다 non-blocking `.catch`) · `TransferTaxCalculator`(동적 import + 수동저장 + clearPendingMigration) · `MultiTransferTaxCalculator:386` · `AuthMigrationListener`(migratePendingResult).
- **읽기 호출처**: `app/api/history/route.ts`(GET, listCalculations) · `app/api/history/[id]/route.ts`(GET=getCalculation, **DELETE=직접 `supabase.from().delete()`** — deleteCalculation 미경유) · `app/api/pdf/history/route.ts`(listCalculations + `TaxType` import) · `app/api/pdf/result/[id]/route.ts`(getCalculation) · `app/result/[id]/page.tsx`(getCalculation, 보호 라우트).
- ⚠️ `listCalculations`/`getCalculation`은 **PDF·result 페이지가 사용 중** → 단순 함수 삭제 불가, 호출 라우트와 함께 제거해야 함.

### 2-3. ⚠️ 다건 양도세(transfer_multi) 저장 공백 — Critical

- `MultiTransferTaxCalculator`는 **`useAutoSaveCalculation`을 쓰지 않고 `saveCalculation`(Supabase)으로만 저장**(L386). `transfer_multi`는 `LocalTaxType`에도 없음.
- → **B 트랙(Supabase 쓰기 제거) 시 다건 양도세는 어디에도 저장 안 됨**. A 트랙에서 **다건 양도세 로컬 자동저장을 먼저 보강**해야 함(§4-0).

### 2-4. Auth — 저장과 분리

- `lib/supabase/server.ts`·`client.ts`·`middleware.ts` — 로그인/세션. `proxy.ts` `PROTECTED_ROUTES=['/api/history','/api/pdf']`가 의존.
- 세무사 모드(`use-user-profile`, IndexedDB userProfile)는 Auth와 무관 → Auth 제거해도 동작. ⚠️ proxy.ts 주석 L4-5("로컬 단계: /history는 IndexedDB")는 outdated(실제 Supabase 읽기 다수).

### 2-5. 보안 현황

- IndexedDB **전부 평문**. PII: 주소(도로명/지번)·공시가격·세액·거래일자·대상자(피상속인/증여자)·세무사 의뢰인 `phone`/`email`/`memo`.
- `contentHash`는 SHA-1(dedup용 약한 해시) — 백업 무결성 검증엔 부적합.
- 범위 외(§9): HistoryClient sessionStorage 평문 저장 · ResultDetailClient `<pre>JSON.stringify</pre>` DOM 노출.

### 2-6. 재사용 인프라

- 다운로드: `URL.createObjectURL + a.download`(ResultDetailClient 등). 전용 유틸 없음 → 신규.
- **파일 입력(FileReader): 미구현** → 신규(`<input type=file accept=".json">`, SelectOnFocusProvider 자동 제외).
- Dialog: `components/ui/dialog.tsx`(BaseUI). 토스트: **`SaveToast` 존재**(`components/calc/shared/SaveToast.tsx`, success/error/info 3초). HistoryClient는 error state만.
- `jszip`·`xlsx` 존재(미사용) — 단일 JSON이면 불요.

---

## 3. 결정 사항 — ✅ 확정 (2026-06-25 사용자 승인)

| # | 결정 | 확정 | 비고 |
|---|---|---|---|
| **D1** | Supabase 제거 범위 | ✅ **(b) 쓰기+읽기 제거, Auth 유지** | lib/supabase·proxy는 향후 E2E 암호화 동기화 토대로 존치 |
| **D2** | 백업 암호화 | ✅ **(a) MVP 평문 + 경고** | AES-GCM 암호화는 Phase 2(§9) |
| **D3** | 기존 Supabase 데이터 | ✅ **(a) 아카이브 후 폐기** | §5-2 3단계 |
| **D4** | 다건 양도세 로컬 저장 | ✅ **(a) `useAutoSaveCalculation` 추가** | §4-0, B 전 선결 |
| **D5** | 백업 범위 필터 | ✅ **(a) MVP 전체만** | 세목·의뢰인 필터는 Phase 2(§9) |

---

## 4. 트랙 A — 다건 저장 보강 + Export/Import 백업

### 4-0. (선결) 다건 양도세 로컬 자동저장 보강 [D4=a]

- `MultiTransferTaxCalculator`에 `useAutoSaveCalculation` 추가(taxType는 `transfer`로 단건과 통합 저장 또는 신규 `transfer_multi`).
- ⚠️ `transfer_multi`를 신규 LocalTaxType로 추가 시: `lib/storage/types.ts` LocalTaxType union + Supabase CHECK 마이그레이션 동반(메모리 `feedback_taxtype_enum_supabase_migration`) — 단, Supabase 제거(B) 예정이므로 **`transfer`로 통합 저장 권장**(enum 미추가).
- B 트랙 전 완료 필수.

### 4-1. 백업 대상 (테이블별)

| 테이블 | 백업 | 근거 |
|---|---|---|
| `calculations` | ✅ | 핵심 이력. buildingStdSnapshots 임베드 동반 |
| `clients` | ✅ | 의뢰인 마스터. `calculations.clientId` 참조 무결성 |
| `userProfile` | ✅(경량) | 모드·표시명. 단일 사용자라 의미 제한 — 포함하되 복원 시 덮어쓰기 |
| `reverseGeocodeCache`·`rtmsSalesCache` | ❌ | 캐시(TTL 7일 재생성) |
| sessionStorage 마법사 6종·professional-store | ❌ | 진행 중 폼·메모리 전용 |

> 철학: **완료된 이력만 백업, 진행 중 상태는 제외**.

### 4-2. 백업 파일 포맷

```jsonc
{
  "format": "korean-tax-calc-backup",
  "version": 1,        // 백업 스키마 버전(앱 db 버전과 별개). 알고리즘 변경 시만 증가
  "dbVersion": 6,      // 호환성 검증용
  "exportedAt": "2026-06-25T...",  // backup-export.ts(storage 유틸=UI 범위)에서 new Date().toISOString() 허용
  "userProfile": { ... } | null,
  "clients": [ ... ],
  "calculations": [ ... ]   // CalculationRecord 전체. resultData={}(draft)도 그대로. createdAt/updatedAt=ISO string 보존
}
```

- **userId**: 백업 파일에 **저장하되 복원 시 무시** — 항상 현재 `getCurrentUserId()`로 재태깅(현 단계 LOCAL_USER_ID 단일). 향후 Supabase multi-user 재태깅은 본 계획 범위 밖.
- **호환성 정책**: import 시 `version` 불일치 → 차단. `dbVersion` 불일치(≤6) → 경고 후 진행(캐시 테이블은 어차피 제외라 v5↔v6 무해). 미래 `dbVersion>6` → 차단+안내.

### 4-3. Export 구현

- 신규 `lib/utils/file-download.ts`: `downloadJson(data, filename)` · `formatIsoStamp()`.
- 신규 `lib/storage/backup-export.ts`: `buildBackup(): Promise<BackupFile>` — calculations/clients/userProfile(where userId) 직접 읽기, 캐시 제외, 메타 주입.
- 파일명: `korean-tax-calc-backup_${YYYY-MM-DD}.json`.
- **MVP[D5=a]: 전체 내보내기만**. (Phase 2: 세목·의뢰인 필터 — 세무사 모드 `clientMap[activeClientFilter]`로 clientName 조회해 파일명에 포함, `null`이면 `_미지정`.)
- **단건 내보내기**: HistoryDetailDrawer 하단 액션에 "이 계산 내보내기" 버튼(단일 record JSON).

### 4-4. Import 구현

- 신규 `lib/storage/backup-import.ts` + `backup-validate.ts`(Zod) + `<input type=file>`/FileReader(프로젝트 최초).
- **검증(악성 JSON 방어 포함)**:
  - Zod: `format`·`version`·각 레코드 필수 필드(taxType ∈ LocalTaxType, inputData/resultData object).
  - **`__proto__` 오염 차단**: `JSON.parse` 후 `Object.create(null)` 기반 재구성 또는 키 화이트리스트 매핑.
  - **크기 제한**: calculations ≤ 10,000건, 레코드 inputData/resultData 각 ≤ 1MB(`.refine`). 초과 차단.
- **복원 전략(Dialog 선택)**:
  - **병합(기본)**: `contentHash` 기준 중복 스킵. contentHash 없는 legacy는 `computeContentHash` 재계산 후 비교. clients는 `id` 기준 중복 스킵(충돌+다른 내용이면 `(userId,name)` 보조 판정).
  - **덮어쓰기**: `clearAll` + clients/userProfile clear → 백업 clients 삽입 → calculations 삽입(순서 고정).
- **참조 무결성(핵심)** — `id 보존` 우선 전략:
  1. 백업의 `id` 보존 삽입(같은 기기 복원이면 충돌 없음).
  2. **병합 중 id 충돌 + 내용 다름**: 신규 `crypto.randomUUID` 부여 + **`{oldId→newId}` 매핑 테이블**(메모리, 복원 후 폐기).
  3. 모든 삽입 후 **`linkedCalculationId` 재매핑**(매핑 테이블 적용) → 참조 대상 없으면 **`null`로 정규화**(orphan 정리). 정리 건수 토스트 표시.
  4. clients 먼저 삽입 → `calculations.clientId` 유효.
- **userId 재태깅**: 백업 userId 무시, 현재 `getCurrentUserId()` 적용.
- **200건 상한**: 복원 후 초과 시 oldest 자동 삭제(기존 정책). 복원 직후 카운트 경고.
- **화면 갱신**: import 완료 후 `loadRecords()` 재호출. 토스트에 **신규 N건 / 중복 스킵 M건 / 링크 정리 K건** 표시.
- **buildingStdSnapshots**: MVP는 inputData 원본 보존(복원 중 재임베드·contentHash 재계산 안 함) — 단순화.

### 4-5. 보안 [D2=a: 평문 + 경고]

- **Export 경고 Dialog**(BaseUI): "주소(도로명·지번)·공시가격·세액·거래일자·계산 대상자 정보·의뢰인 연락처·이메일·메모 등 **모든 계산 입출력이 평문**으로 저장됩니다. 안전한 곳에 보관하세요." (개인정보보호법 안내)
- **세무사 모드 추가 고지**: "선택한 의뢰인의 개인정보가 포함됩니다. 동의 없이 공유·저장하지 마세요."
- **Import 경고**: "신뢰할 수 있는 출처의 백업만 가져오세요(평문)."
- Phase 2[D2=b]: `crypto.subtle` AES-GCM + PBKDF2 선택 암호화(비밀번호 분실 시 복구 불가 경고).

### 4-6. UI 통합 (HistoryClient)

- 상단 액션 영역: 세목 필터(좌) ↔ 전체삭제(우) 사이에 **[내보내기] [가져오기]**(전체삭제 좌측, `flex gap-2`, 모바일 wrap).
- 확인·선택은 **BaseUI `components/ui/dialog.tsx`**(window.confirm 금지 — 메모리 `feedback_dialog_data_discard_confirm`):
  - Export: 평문 경고 Dialog(+세무사 고지) → 확인 시 다운로드.
  - Import: 파일 선택 → 검증 → **병합/덮어쓰기 라디오 Dialog** → 실행 → `SaveToast`(신규/스킵/정리 건수).
- 피드백: `SaveToast`(기존) 재사용. HistoryClient `error` state는 로드 실패용 유지.
- HistoryDetailDrawer: 단건 내보내기 버튼 추가.

---

## 5. 트랙 B — Supabase 계산 저장 제거 [D1=b]

### 5-1. 제거 체크리스트 (의존 역순)

> ⚠️ 실행 직전 전수 grep 재확인: `grep -rn "listCalculations\|getCalculation\|saveCalculation\|migratePendingResult\|from(['\"]calculations" app lib components actions`

1. **쓰기 함수**: `actions/calculations.ts`의 `saveCalculation`·`migratePendingResult`·`deleteCalculation`(dead) 삭제.
2. **클라이언트 쓰기**: `TransferTaxCalculator`(동적 import + 수동저장 + `clearPendingMigration` 제거, 로컬 `useAutoSaveCalculation`은 **유지**) · `MultiTransferTaxCalculator`(saveCalculation 제거 — **§4-0에서 로컬 저장 선보강 완료 전제**).
3. **API 쓰기**: `app/api/calc/property/route.ts:126`·`comprehensive/route.ts:302` saveCalculation import + 호출 + `.catch` 제거(non-blocking이라 응답 무영향).
4. **마이그레이션 컴포넌트**: `AuthMigrationListener.tsx` 삭제 + `app/layout.tsx` import/사용 제거(migratePendingResult 의존 자동 폐기).
5. **읽기 함수**: `actions/calculations.ts`의 `listCalculations`·`getCalculation` 삭제.
6. **API/페이지 읽기 라우트 삭제**: `app/api/history/route.ts`(GET) · `app/api/history/[id]/route.ts`(GET+**DELETE 직접쿼리** — 라우트 통째 삭제로 정리) · `app/api/pdf/history/route.ts`(+`TaxType` import 동반 제거) · `app/api/pdf/result/[id]/route.ts` · `app/result/[id]/page.tsx`+`ResultDetailClient`(→ 로컬 `HistoryDetailDrawer`로 대체, 중복).
7. **타입 정리**: `actions/calculations.ts`의 `TaxType`·`CalculationRecord`는 위 라우트 삭제 후 잔여 import 0건 확인하고 함께 제거(grep 검증).
8. **proxy.ts**: `PROTECTED_ROUTES`에서 `/api/history`·`/api/pdf` 제거 → 배열 빈 상태 → AUTH_ROUTES만 남기고 보호 로직 단순화. outdated 주석(L4-5) 제거. `lib/supabase/middleware.ts`에 calculations 관련 로직 없음 확인(Auth 세션 유지 로직만 — 유지).
9. **Auth 유지 사유 명시**: lib/supabase/* + middleware는 향후 E2E 암호화 동기화(Phase 2) 토대로 존치.

### 5-2. 기존 Supabase 데이터 처리 [D3=a] — 3단계

1. 배포 N일 전: HistoryClient 배너 "이력을 로컬로 내보낸 뒤 전환하세요" + 내보내기 유도.
2. 배포일: 운영자가 Supabase `calculations` 테이블 JSON 덤프 아카이브 후 폐기.
3. 사후: 미전환 사용자용 안내. (담당·일정은 배포 시 확정)

### 5-3. 영향·회귀

- `/api/calc/*`는 계산만(저장 제거) — 응답 무영향(쓰기 이미 non-blocking).
- 로컬 자동저장(`useAutoSaveCalculation`) 유지. 다건 양도세는 §4-0 보강으로 로컬 저장.
- `/api/pdf/*` 삭제 = 서버 이력 PDF 기능 공백 → **클라이언트 react-pdf 대체는 §9 후속**(MVP는 기능 제거 + 안내).
- `/result/[id]` 삭제 → 내부 링크/네비게이션 grep 확인(깨진 링크 제거).

### 5-4. IndexedDB 인프라 재검증 (A·B 병행)

- `calculationRepository` save/list/get/remove userId 필터 재확인.
- db.ts v6 인덱스 ↔ backup-import 참조 무결성 매핑 검증.
- content-hash·business-key dedup 로직과 Import 병합 전략 일치 검증.

---

## 6. 작업 순서 (Phase) — 안전 우선

> A를 완성·검증한 뒤 B. 백업 없이 저장 경로를 건드리지 않는다.

1. **Pre-Do anchor**: `buildBackup`·`backup-validate`·병합 dedup·linkedCalculationId 재매핑 순수 로직 anchor(§8) 우선 작성·실행(실패 확보).
2. **A-0**: 다건 양도세 `useAutoSaveCalculation` 보강(transfer 통합 저장) + 회귀.
3. **A-1**: `file-download.ts` + `backup-export.ts` → anchor green.
4. **A-2**: `backup-import.ts` + `backup-validate.ts`(악성 JSON 방어·id 매핑·clients dedup).
5. **A-3 UI**: HistoryClient 버튼 + BaseUI Dialog(경고·병합선택) + SaveToast + loadRecords 갱신 + Drawer 단건 export. clearAll/delete의 window.confirm도 **본 PR에서 Dialog 전환**(정책 일관).
6. **A-4 E2E**: 전 세목(transfer·**transfer_multi**·inheritance·gift·acquisition·property·comprehensive·stock_transfer·stock_valuation) round-trip + 병합 중복 스킵 + 덮어쓰기 + linkedCalculationId 보존 spec.
7. **B-1~B-9**: §5-1 체크리스트(의존 역순).
8. **검증**: `tsc` 0 · `npm test` 전체 · 전 세목 계산→로컬 자동저장→/history 표시 회귀 · 백업 round-trip E2E.

---

## 7. 정책 점검

- 신규 엔진 input/result 필드 **없음** → 14 동기화 지점 비해당(단, §4-0에서 transfer 통합 저장 시 자동저장 경로만 추가).
- **파괴적 액션 Dialog**: Import 덮어쓰기·clearAll·delete 모두 BaseUI Dialog(window.confirm 금지) — A-3에서 일괄 전환(정책 일관).
- **useEffect→store 미러링 금지**: 백업/복원은 버튼 핸들러 직접 호출(useEffect 미사용).
- 파일 입력 type=file은 SelectOnFocusProvider 자동 제외(정책 무관).
- 800줄 정책: backup-export/import/validate 분리.

## 8. 테스트 anchor (`__tests__/storage/backup.test.ts`, fake-indexeddb)

- `buildBackup`: calculations/clients/userProfile 포함 · 캐시 2종 **제외**.
- `backup-validate`: 정상 통과 · format/version 불일치 차단 · taxType 오류·필드 누락 차단 · **`__proto__` 주입 차단** · 크기 초과 차단.
- 병합 dedup: 동일 contentHash 스킵 · 다른 내용 신규 · **legacy(contentHash 없음) 재계산 후 비교** · legacy+신규 혼재.
- 참조 무결성: clients 선삽입 후 clientId 유효 · **linkedCalculationId 보존(transfer A ↔ property B 양방향)** · id 충돌 시 재매핑 · orphan link → null 정규화.
- clients dedup: id 보존 · 동일 id 다른 내용 시 (userId,name) 보조.
- 200건 상한: 기존 200 full + import 150(신규 id) → 복원 후 list().length===200.
- dbVersion: v5 백업을 v6에서 import(캐시 제외라 무해) · v7 백업 차단.
- round-trip: buildBackup → import(덮어쓰기) → list가 원본과 **필드별 동일**(id·contentHash·linkedCalculationId 포함).
- 성능: legacy 500건 contentHash 재계산 측정(임계 초과 시 진행 표시 검토).

`e2e/history-backup.spec.ts`: `setInputFiles`로 파일 주입 + 병합/덮어쓰기 Dialog + SaveToast 건수 검증 + 전 세목(다건 포함) round-trip.

## 9. 범위 제외 (후속)

- AES-GCM 백업 암호화[D2=b] · 세목/의뢰인 필터 내보내기[D5=b] — Phase 2.
- 로컬 이력 PDF 클라이언트 react-pdf 대체(서버 /api/pdf 제거 공백) — B 후속.
- sessionStorage 평문·ResultDetailClient DOM 노출 보안 — 별도 보안 PR.
- E2E 암호화 클라우드 동기화(Auth 활용) · Auth 완전 제거[D1=c] — 향후.

## 10. 핵심 리스크

- **백업 미완성·다건 저장 미보강 상태로 B 진행 금지** → 데이터 소실. 순서 A-0→A→B 엄수.
- 복원 시 id/linkedCalculationId 끊김 → **id 보존 + 매핑 + orphan null 정규화** anchor 보증.
- Supabase 읽기 경로 다수 — 제거 누락 시 404/타입 오류. §5-1 전수 grep 검증.
- 다건 양도세 Supabase-only 저장 — B 전 §4-0 미완료 시 저장 공백.

## 11. 정정 이력 (v1→v2, adversarial 6-lens 반영)

- **오류**: createdAt/updatedAt = ISO string(epoch 아님) 정정.
- **Critical 누락**: 다건 양도세 로컬 저장 공백(§2-3·§4-0) · listCalculations/getCalculation의 PDF 의존(§5-1) · Import 후 loadRecords 갱신 · 악성 JSON 방어 · Import 단건/화면갱신.
- **모순 해소**: id 충돌 vs linkedCalculationId(매핑+orphan null) · clients dedup 키 · proxy.ts 빈 배열 처리.
- **보안 강화**: 평문 경고 전 PII 확장 · 세무사 타인 PII 고지 · Import 경고.
- **정책**: clearAll window.confirm을 본 PR Dialog 전환(일관성).
- **구조**: 제거 순서 의존 역순 · §5-4 인프라 재검증 · §8 anchor 대폭 확장(legacy·200상한·dbVersion·orphan·성능).
