# 의뢰인 ↔ 계산 이력 생명주기 연동 (Cascade Delete + Restore) 계획서

> 작성일: 2026-06-29 · 상태: Plan (구현 전)
> 한 줄 요약: **의뢰인의 삭제·복원을 계산 이력에 종속**시킨다. 의뢰인 단독 삭제는 막고, 계산 이력의 마지막 1건이 삭제되면 의뢰인도 삭제하며, 백업 가져오기로 계산 이력이 복원되면 의뢰인도 함께 복원된다.

---

## 1. 배경 — 현행 동작과 문제점

세무사 모드는 `Client`(의뢰인)와 `CalculationRecord`를 **N:1**(의뢰인 1명 ↔ 계산 여러 건)로 연결한다 (`CalculationRecord.clientId`, `lib/storage/types.ts:76`).

| 동작 | 현행 | 문제 |
|---|---|---|
| 의뢰인 단독 삭제 | `app/profile/ClientsSection.tsx:60` → `clientRepository.remove` (hard delete, `client-repository.ts:65`) | 연결된 계산 이력의 `clientId`가 **dangling(orphan)** 으로 남음. 의뢰인이 사라졌는데 계산만 남음. |
| 계산 이력 삭제 | `app/history/HistoryClient.tsx:229` → `calculationRepository.remove` (`calculation-repository.ts:355`) | 의뢰인은 그대로 유지 → **cascade 없음**. 의뢰인을 정리하려면 별도로 직접 삭제해야 함. |
| 전체 이력 삭제 | `HistoryClient.tsx:303` → `clearAll` (`calculation-repository.ts:361`) | 의뢰인 전부 잔존. |
| 복원 | 없음(휴지통·soft delete·undo 미존재). **유일 경로 = 백업 Export/Import** (`HistoryBackupActions.tsx`). | 백업에는 이미 `clients`가 포함됨 (`backup-export.ts:27`, `backup-import.ts:68-84`) — 복원 시 의뢰인 동반 복원은 **이미 동작**하나 명시·검증 부재. |

**호출 지점 전수 (변경 범위 한정 확인)**
- `calculationRepository.remove` → `HistoryClient.tsx:229` **1곳뿐**
- `calculationRepository.clearAll` → `HistoryClient.tsx:303` **1곳뿐**
- `clientRepository.remove` → `ClientsSection.tsx:60` **1곳뿐**

---

## 2. 사용자 결정사항 (2026-06-29 확정)

| # | 질문 | 결정 |
|---|---|---|
| D1 | N:1에서 계산 삭제 시 의뢰인 삭제 시점 | **마지막 1건일 때만** — 그 의뢰인의 잔여 계산이 0이 될 때만 의뢰인 삭제. 다른 계산이 남으면 유지. |
| D2 | "복원"의 정의 | **백업 가져오기(Import)** — 현행 유일 경로. 의뢰인 동반 복원은 이미 동작 → **동작 확인·보강만**. 새 휴지통/undo 미구축. |
| D3 | 프로필의 의뢰인 단독 삭제 버튼 | **연결 계산이 있으면 차단** — 안내 후 차단. 연결 계산 0건이면 단독 삭제 허용. |

---

## 3. 설계

### 3-1. 핵심 불변식 (Invariant)

> **계산 이력에서 참조되는 `clientId`는 절대 dangling이 아니다.**
> 즉 의뢰인은 (a) ≥1건의 계산 이력을 가지거나, (b) "계산 0건으로 등록만 된 의뢰인"으로만 존재한다.

이 불변식을 깨는 단 하나의 현행 경로(의뢰인 단독 삭제)를 막고(D3), 계산 삭제 시 빈 의뢰인을 정리(D1)하면 일관성이 성립한다.

### 3-2. 메커니즘 4종

| 경로 | 규칙 | 비고 |
|---|---|---|
| **M1. 계산 단건 삭제** (`remove`) | 삭제 후 `rec.clientId`의 잔여 계산이 0이면 의뢰인 삭제. `clientId === null`이면 no-op. | D1 |
| **M2. 전체 삭제** (`clearAll`) | 삭제 대상 계산이 참조한 distinct `clientId`들을 수집 → 계산 0건이 된 의뢰인 삭제. **계산 0건으로 등록만 된 의뢰인은 유지**(distinct 집합에 없음). | D1 |
| **M3. 의뢰인 단독 삭제 가드** (`ClientsSection`) | 삭제 전 연결 계산 count 조회. >0이면 **차단 + 안내 Dialog**. 0이면 허용. | D3 |
| **M4. 복원** (Import) | **현행 유지** — `importBackup`이 clients 선삽입 → calculations 삽입 (`backup-import.ts:68-84, 86-152`). 백업에 의뢰인 동반되므로 함께 복원. 검증 anchor만 추가. | D2 |

### 3-3. 단일 진실 — cascade는 repository 계층에 둔다

UI(`HistoryClient`)에서 cascade를 재구현하지 않고 **`calculation-repository.ts`에 내장**한다(메모리 `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper`). UI는 삭제 호출 후 의뢰인 목록만 새로고침한다.

---

## 4. 변경 파일별 작업

### 4-1. `lib/storage/calculation-repository.ts` — cascade 내장

- **헬퍼 추가** `deleteClientIfOrphaned(clientId)`:
  - `clientId == null` → return.
  - `db.calculations.where("userId").equals(uid).filter((r) => r.clientId === clientId).count()` — **in-memory 필터 count**. (≤200건 full scan, μs 단위.)
  - count === 0 → `db.clients.delete(clientId)`.
  - ⚠️ **`[userId+clientId+createdAt]` 인덱스를 쓰지 않는다**: 이 인덱스는 db.ts에 선언만 되고 어떤 쿼리에서도 미사용 — 기존 `list`도 clientId를 in-memory로 필터한다(`calculation-repository.ts:335`). `clientId === null` 레코드는 IndexedDB 유효 키가 아니라 compound 인덱스에서 제외되므로, codebase는 의도적으로 in-memory 필터를 쓴다. 이 선례를 따른다.
- **`remove(id)` 수정**: 트랜잭션 `db.transaction("rw", [db.calculations, db.clients], …)`. 기존 `if (!rec || rec.userId !== uid) return;` 가드 유지 → `clientId` 캡처 → 계산 삭제 → `deleteClientIfOrphaned(clientId)`. (동일 rw 트랜잭션 내 삭제는 후속 count에 반영됨.)
- **`clearAll()` 수정**: 트랜잭션 내에서 현재 user 계산을 toArray → distinct `clientId`(non-null) 수집 → 계산 전체 삭제 → 수집된 의뢰인 `bulkDelete`. (계산 0건 의뢰인은 집합에 없어 유지.)
- ⚠️ Dexie 트랜잭션 내 비-IDB await 금지(`PrematureCommit`). count/filter/delete 모두 IDB 연산이므로 안전.

### 4-2. `lib/storage/client-repository.ts` — 단독 삭제 가드 지원

- **메서드 추가** `countCalculations(id): Promise<number>` — `db.calculations.where("userId").equals(uid).filter((r) => r.clientId === id).count()` (4-1과 동일 in-memory 방식, 인덱스 미사용). UI가 차단 판정에 사용.
- `remove(id)`는 **순수 유지**(가드는 UI에서 호출). 또는 방어적으로 remove 내부에서도 count>0 시 early-return 가능(선택). → **기본: UI 가드 + remove는 그대로**(surgical).

### 4-3. `app/profile/ClientsSection.tsx` — 차단 Dialog

- `handleDelete(id)` 변경: 먼저 `clientRepository.countCalculations(id)` 호출.
  - count > 0 → **차단 안내 Dialog** 표시: "이 의뢰인은 계산 이력 N건과 연결되어 있어 삭제할 수 없습니다. 계산 이력을 모두 삭제하면 의뢰인도 함께 삭제됩니다." (확인 버튼만)
  - count === 0 → 기존 삭제 진행(필요 시 삭제 확인 Dialog).
- ⚠️ `window.confirm` 금지 — BaseUI `Dialog` 사용(메모리 `feedback_dialog_data_discard_confirm`). 기존에 confirm 없이 즉시 삭제하므로, 차단 Dialog 신규 추가.

### 4-4. `app/history/HistoryClient.tsx` — 삭제 후 의뢰인 목록 갱신 + active 의뢰인 정리

- `handleDelete`(`:228`)·`doClearAll`(`:302`) 후 `clientRepository.list().then(setClients)` 재호출 — cascade로 사라진 의뢰인을 필터 칩(`:515`)·목록에서 즉시 반영.
- **active 의뢰인 dangling 방지**(§5 참조): 삭제 후 갱신된 목록에 `useProfessionalStore.getState().activeClientId`가 없으면 `clearActiveClient()` 호출(`lib/stores/professional-store.ts:19`). 미정리 시 다음 계산 저장이 사라진 의뢰인을 다시 참조 → orphan 재발.
- 삭제 확인 Dialog(`:594`) 문구에 cascade 고지 1줄 추가: "연결된 의뢰인의 마지막 계산이면 의뢰인도 함께 삭제됩니다."

### 4-5. 복원(Import) — 변경 없음 + 검증

- `backup-export.ts` / `backup-import.ts` **코드 변경 없음**. 단건/필터 내보내기도 참조 의뢰인을 포함함을 확인(`backup-export.ts:75-79`).
- anchor 테스트로 round-trip 보장(§6 E).

---

## 5. 엣지 케이스 · 미적용 범위

| 케이스 | 처리 | 근거 |
|---|---|---|
| 200건 상한 자동 축출 (`save`의 oldest 삭제, `calculation-repository.ts:91-98` 등) | **cascade 미적용** — 저장 중 의뢰인이 조용히 사라지는 부작용 방지. 축출된 계산이 의뢰인의 마지막이면 "계산 0건 의뢰인"으로 남으며 무해(프로필에서 수동 삭제 가능, dangling 계산 아님). | 사용자 발화는 **명시적 삭제** 맥락. 자동 축출은 별개. |
| draft 삭제 (`deleteDraftsByInput`, `:296`) | **cascade 미적용** — draft→final 승격 중 호출되며 직후 final이 같은 `clientId`로 재삽입됨. 사용자 명시 삭제 아님. | 일시적 0건은 cascade 대상 아님. |
| 계산 0건으로 등록만 한 의뢰인 | 유지. 프로필에서 단독 삭제 허용(count 0). | D3 |
| `clientId === null`(본인·미지정) 계산 삭제 | cascade no-op. | 의뢰인 없음. |
| **active 의뢰인이 cascade 삭제됨** (세션 store `activeClientId`가 삭제된 의뢰인을 가리킴) | 삭제 후 목록에 없으면 `clearActiveClient()` (§4-4). | 미정리 시 다음 저장이 사라진 의뢰인 재참조 → orphan 재발. |
| **복원의 전제 — 사전 백업 필수** | per-action undo/휴지통 없음(D2). 삭제는 **사전에 Export한 백업이 있어야만** Import로 되돌릴 수 있음. 백업 없이 삭제 시 영구. | 차단/삭제 Dialog 문구에 "되돌리려면 사전 백업 필요" 고지 권장. |

---

## 6. 테스트 anchor (`__tests__/lib/storage/`)

> 하네스: `import "fake-indexeddb/auto"` + `beforeEach(resetLocalDB)` + `createCalculationRepository(UID)` / `createClientRepository(UID)` (기존 `calculation-repository.test.ts`·`backup.test.ts` 패턴 그대로). 신규 파일 예: `calculation-repository-client-cascade.test.ts`.

| ID | 시나리오 | 기대 |
|---|---|---|
| A | 의뢰인 X에 계산 2건 → 1건 삭제 | X 유지, 잔여 계산 1건 |
| B | 의뢰인 X에 계산 1건 → 그 1건 삭제 | **X 삭제**, 계산 0건 |
| C | 의뢰인 X(계산 2건) + 의뢰인 Y(계산 0건 등록) → `clearAll` | 계산 0건, **X 삭제 / Y 유지** |
| D1 | 의뢰인 X(계산 1건) `countCalculations` | 1 → UI 차단 |
| D2 | 의뢰인 Y(계산 0건) `countCalculations` | 0 → 단독 삭제 허용 |
| E | X+계산 백업 `buildBackup` → 계산 `remove`(X cascade 삭제) → `importBackup(_, "merge")` | **X·계산 모두 복원** (round-trip). `backup.test.ts:92` 패턴 재사용. |

---

## 7. 작업 순서 → 검증

```
1. calc-repository: deleteClientIfOrphaned + remove/clearAll 수정 → verify: anchor A·B·C 통과
2. client-repository: countCalculations 추가          → verify: anchor D1·D2 통과
3. ClientsSection: 차단 Dialog                         → verify: count>0 시 차단 동작(E2E/수동)
4. HistoryClient: setClients 갱신 + activeClientId 정리 + 고지 문구 → verify: cascade 후 칩 즉시 갱신
5. 복원 round-trip                                     → verify: anchor E 통과
6. npx tsc --noEmit 0건 · npx vitest run __tests__/lib/storage/
```

**완료 게이트**: tsc 0건 · storage 테스트 통과 · 브라우저 수동 확인(프로필 차단 Dialog / 이력 단건·전체 삭제 시 의뢰인 cascade / 백업 import 복원). E2E는 `e2e/*.spec.ts`로 작성(메모리 `feedback_browser_verify_with_playwright`).

---

## 8. 미해결 / 확인 필요

- **clearAll의 "전체"** = 현재 필터 무관 user 전체 계산 삭제(`clearAll`은 필터 미적용, `:361`). 의뢰인 cascade도 user 전체 기준. (현행 `clearAll` 동작 유지 — 필터별 부분 삭제는 범위 밖.)
- 200건 축출 cascade를 원하면 §5 1행 재논의 필요(현 계획: 미적용).
