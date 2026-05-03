# 로컬 데이터 저장소 — 사용자 프로필 + 계산 이력

**작성일**: 2026-05-03
**상태**: Plan
**목표**: 인증·원격 DB 도입 전, 브라우저 로컬에 사용자 프로필 1건과 계산 이력 N건을 저장·조회·수정·삭제. 향후 Supabase + 소셜 로그인(Google·Kakao) 도입 시 **데이터 폐기 후 새로 시작**하는 단순 마이그레이션 경로.

---

## 1. 사용자 결정 사항 (확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 데이터 구조 | **사용자 1 : 계산 N** (프로필 1개 + 이력 다수) |
| 2 | 사용자 식별 | **단일 사용자 가정** (브라우저 1대 = 1명) |
| 3 | 저장 매체 | **IndexedDB (Dexie.js)** — 향후 Supabase 스키마와 1:1 매핑 |
| 4 | 마이그레이션 | **로컬 데이터 폐기**, 로그인 시 새로 시작 (마이그레이션 코드 불필요) |
| 5 | UI | **`/history` 라우트 그대로 사용**, 데이터 소스만 IndexedDB |
| 6 | 저장 시점 | **계산 완료 즉시 자동 저장** (각 세목 결과 화면 진입 시) |

---

## 2. 데이터 스키마

향후 `supabase/migrations/` 의 `users` / `calculations` 테이블과 **컬럼명·타입을 일치**시켜 마이그레이션 시 코드 변경 최소화.

### 2.0 사용자 ID 상수 (LOCAL_USER_ID)

로컬 단계에서도 모든 레코드에 `userId` 컬럼을 두고, 모든 INSERT/SELECT에서 동일 값으로 필터링한다. 향후 Supabase `auth.uid()`로 갈아끼울 때 **이 상수 1곳만 교체**하면 되도록 설계.

```ts
// lib/storage/constants.ts
/** 로컬 단계 단일 사용자 식별자. 향후 Supabase auth.uid()로 대체 */
export const LOCAL_USER_ID = "local-user" as const;
export type UserId = typeof LOCAL_USER_ID | string;  // 향후 uuid 수용
```

**규칙**:
- `userProfile.id` = `LOCAL_USER_ID` (고정).
- `calculations.userId` = `LOCAL_USER_ID` (모든 INSERT 시 자동 주입).
- 모든 SELECT 쿼리는 `where("userId").equals(currentUserId)` 필터 강제.
- 문자열 리터럴 `"local-user"` 직접 사용 금지 — 항상 `LOCAL_USER_ID` import.

### 2.1 `userProfile` (단일 레코드)

```ts
interface UserProfile {
  id: UserId;                      // = LOCAL_USER_ID (단일 사용자), 향후 auth.users.id (uuid)
  displayName: string;             // 사용자 이름
  birthDate: string | null;        // 'YYYY-MM-DD' (생년월일 — 60세 이상 장기보유공제·세대원 판정용)
  createdAt: string;               // ISO timestamp
  updatedAt: string;
}
```

**참고**: 생년월일은 양도세(고령자 공제)·종부세(고령자 세액공제)에서 활용 가능. 추후 자동 채움 옵션의 기반.

### 2.2 `calculations` (N 레코드)

```ts
type LocalTaxType =
  | "transfer" | "inheritance" | "gift"
  | "acquisition" | "property" | "comprehensive_property";

interface CalculationRecord {
  id: string;                      // crypto.randomUUID()
  userId: UserId;                  // = LOCAL_USER_ID (현 단계), 향후 auth.uid() — 모든 쿼리 필터 키
  taxType: LocalTaxType;           // 세목 구분
  title: string;                   // 사용자가 식별할 수 있는 라벨 (자동 생성, 수정 가능)
  inputData: Record<string, unknown>;   // 마법사 폼 전체 (zustand 상태 직렬화)
  resultData: Record<string, unknown>;  // 엔진 계산 결과 (TransferTaxResult 등)
  taxLawVersion: string;           // 적용된 세율 effective_date (세율 추적용)
  linkedCalculationId: string | null;   // 재산세↔종부세 연동 (nullable)
  createdAt: string;
  updatedAt: string;
}
```

**제약**: 사용자당 최대 200건 (Supabase 정책과 동일). 초과 시 가장 오래된 1건 자동 삭제.

**title 자동 생성 규칙**:
- 양도세: `"양도소득세 — {대표자산 주소} ({양도일})"`
- 취득세: `"취득세 — {취득물건 주소}"`
- 미입력 필드는 `"양도소득세 — 임시"` 등 기본값.

---

## 3. 기술 선택

### 3.1 IndexedDB 라이브러리: **Dexie.js**

- 의존성 추가: `npm install dexie`
- 이유: 타입 안전 + Promise API + 트랜잭션 + 인덱스 쿼리 지원. localStorage 대비 5MB 한계 없음 (수백 MB).
- 대안 검토: `idb`(low-level), `localforage`(KV only) — Dexie가 쿼리·인덱스 지원으로 적합.

### 3.2 Dexie 스키마 + 복합 인덱스

```ts
// lib/storage/db.ts
import Dexie, { type Table } from "dexie";
import type { UserProfile, CalculationRecord } from "./types";

class LocalTaxDB extends Dexie {
  userProfile!: Table<UserProfile, string>;
  calculations!: Table<CalculationRecord, string>;

  constructor() {
    super("KoreanTaxCalcLocal");

    this.version(1).stores({
      // PK: id, 단일 레코드지만 향후 다중 프로필 대비
      userProfile: "id, updatedAt",

      // PK: id
      // 단일 인덱스: userId, taxType, createdAt
      // 복합 인덱스:
      //   [userId+createdAt]            → 최신순 목록 (기본 화면)
      //   [userId+taxType+createdAt]    → 세목별 필터 + 최신순
      //   [userId+linkedCalculationId]  → 재산세↔종부세 연동 조회
      calculations:
        "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId]",
    });
  }
}

export const db = new LocalTaxDB();
```

**쿼리 예시** (모두 `userId` 키 선두):
```ts
// 최신순 전체
db.calculations.where("[userId+createdAt]").between([uid, Dexie.minKey], [uid, Dexie.maxKey]).reverse().toArray();

// 세목별 + 최신순
db.calculations.where("[userId+taxType+createdAt]").between([uid, "transfer", Dexie.minKey], [uid, "transfer", Dexie.maxKey]).reverse().toArray();

// 200건 상한 카운트
db.calculations.where("userId").equals(uid).count();
```

### 3.3 추상화 레이어: **Repository 패턴 + currentUserId 주입**

```
lib/storage/
  ├── constants.ts             # LOCAL_USER_ID
  ├── db.ts                    # Dexie 인스턴스 (위 3.2)
  ├── types.ts                 # UserProfile, CalculationRecord, LocalTaxType, UserId
  ├── current-user.ts          # getCurrentUserId() — 향후 교체 지점
  ├── user-repository.ts       # createUserRepository(uid)
  ├── calculation-repository.ts # createCalculationRepository(uid)
  └── index.ts                 # barrel + 기본 인스턴스 export
```

**핵심: `currentUserId` 주입을 단일 함수로 고정**

```ts
// lib/storage/current-user.ts
import { LOCAL_USER_ID, type UserId } from "./constants";

/**
 * 현재 활성 사용자 ID 반환.
 * 로컬 단계: LOCAL_USER_ID 고정.
 * 향후 Supabase 도입 시: 이 함수 1곳만 교체 → `(await supabase.auth.getUser()).data.user?.id`.
 * Repository 외 다른 곳에서 LOCAL_USER_ID를 직접 import하지 말 것.
 */
export function getCurrentUserId(): UserId {
  return LOCAL_USER_ID;
}
```

**Repository 인터페이스 — 생성자에 uid 주입**

```ts
// lib/storage/calculation-repository.ts
export interface CalculationRepository {
  save(record: Omit<CalculationRecord, "id" | "userId" | "createdAt" | "updatedAt">): Promise<string>;
  list(filter?: { taxType?: LocalTaxType }): Promise<CalculationRecord[]>;
  get(id: string): Promise<CalculationRecord | null>;
  update(id: string, patch: Partial<Omit<CalculationRecord, "id" | "userId">>): Promise<void>;
  remove(id: string): Promise<void>;
  clearAll(): Promise<void>;
  count(): Promise<number>;
}

/**
 * uid를 클로저로 캡처. 모든 메서드는 자동으로 userId 필터 적용.
 * 호출 측은 uid를 의식하지 않음.
 */
export function createCalculationRepository(uid: UserId): CalculationRepository {
  return {
    async save(input) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await db.calculations.add({ ...input, id, userId: uid, createdAt: now, updatedAt: now });
      return id;
    },
    async list(filter) {
      if (filter?.taxType) {
        return db.calculations
          .where("[userId+taxType+createdAt]")
          .between([uid, filter.taxType, Dexie.minKey], [uid, filter.taxType, Dexie.maxKey])
          .reverse().toArray();
      }
      return db.calculations
        .where("[userId+createdAt]")
        .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
        .reverse().toArray();
    },
    async get(id) {
      const rec = await db.calculations.get(id);
      return rec && rec.userId === uid ? rec : null;   // userId 일치 검증 (방어)
    },
    async update(id, patch) {
      const rec = await db.calculations.get(id);
      if (!rec || rec.userId !== uid) return;          // 타 사용자 레코드 보호
      await db.calculations.update(id, { ...patch, updatedAt: new Date().toISOString() });
    },
    async remove(id) {
      const rec = await db.calculations.get(id);
      if (!rec || rec.userId !== uid) return;
      await db.calculations.delete(id);
    },
    async clearAll() {
      await db.calculations.where("userId").equals(uid).delete();
    },
    async count() {
      return db.calculations.where("userId").equals(uid).count();
    },
  };
}

// barrel — 일반 호출용 기본 인스턴스
export const calculationRepository = createCalculationRepository(getCurrentUserId());
```

**불변 규칙**:
- 호출 측은 `calculationRepository.list()` 형태로만 사용. uid를 직접 다루지 않음.
- 인증 도입 시점에는 `getCurrentUserId()`를 async로 바꾸고, barrel을 `createCalculationRepositoryAsync()` 패턴으로 변경 → 호출 측 변경 최소화.
- `userRepository`도 동일 패턴 (`createUserRepository(uid)`).

`actions/calculations.ts` (Server Action)는 그대로 두고, 클라이언트에서는 `lib/storage/`를 직접 호출. 나중에 인증이 들어오면 `if (user) Server Action else Repository` 분기.

---

## 4. 자동 저장 통합 (각 세목 결과 화면)

### 4.1 발화 지점

각 세목의 마지막 마법사 단계 완료 → 결과 화면 마운트 시.

| 세목 | 위치 | 발화 시점 |
|---|---|---|
| 양도세 | `app/calc/transfer-tax/steps/Step4.tsx` | result 진입 시 useEffect |
| 취득세 | `app/calc/acquisition-tax/steps/Step{N}.tsx` (UI 작업 후) | 동일 |
| 재산세·종부세·상증세 | UI 구현 후 동일 패턴 |

### 4.2 자동 저장 훅

```ts
// lib/storage/use-auto-save-calculation.ts
export function useAutoSaveCalculation(params: {
  taxType: LocalTaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  taxLawVersion: string;
}): { savedId: string | null; error: string | null } { ... }
```

- result가 null이거나 변경 없으면 skip.
- 같은 세션에서 동일 calc 재계산 시 **새 레코드 생성 (덮어쓰지 않음)** — 이력 의미 보존.
- 사용자가 결과 화면에서 "이름 수정" → `update(id, { title })`.

### 4.3 중복 저장 방지

`useEffect` 의존성으로 `result` 객체 식별 시 ref + 플래그로 1회만 저장.

---

## 5. `/history` UI 변경

### 5.1 현재 상태

- `app/history/page.tsx` → `HistoryClient.tsx`가 `actions/calculations.ts`의 `listCalculations()` 호출.
- `proxy.ts`에서 `/history`는 인증 보호 → 미로그인 시 `/auth/login` 리다이렉트.

### 5.2 변경

1. **`proxy.ts` 보호 해제** (로컬 단계 한정): `/history` 접근 자유화.
2. **`HistoryClient.tsx` 데이터 소스 변경**: Server Action → `calculation-repository.list()`.
3. **수정 UI 추가**: 행 클릭 → 상세 패널 → title 수정 / 마법사 재진입(입력값 복원) / 삭제.
4. **삭제 확인 모달** + **전체 삭제** 버튼 (개발 단계 편의).

### 5.3 신규 컴포넌트

```
components/history/
  ├── HistoryList.tsx         # 카드/테이블 목록 (세목별 필터)
  ├── HistoryDetailDrawer.tsx # 우측 슬라이드 — 입력값/결과 요약 + 액션
  ├── EditTitleDialog.tsx
  └── DeleteConfirmDialog.tsx
```

### 5.4 마법사 재진입 (Resume)

- "수정" 클릭 → `inputData`를 zustand store에 hydrate → `/calc/{taxType}/step1` 이동.
- 각 세목 store에 `hydrateFromRecord(inputData)` 메서드 추가.

---

## 6. 사용자 프로필 화면

### 6.1 신규 라우트: `/profile`

- 단일 폼: 이름·생년월일.
- 저장 시 `userRepository.upsertProfile()`.
- `proxy.ts` 보호 미적용 (로컬 단계).

### 6.2 헤더 노출

- 상단 헤더에 displayName 표시. 미설정 시 "프로필 설정" 링크.

---

## 7. 마이그레이션 경로 (향후)

사용자 결정 4-B에 따라 **마이그레이션 코드 불필요**:

1. Google·Kakao OAuth 도입 (Supabase Auth).
2. 로그인 성공 시 `localStorage.setItem("hasMigrated", "true")` 표시.
3. 첫 로그인 시 모달: "로컬 데이터를 삭제하고 클라우드 동기화로 전환합니다" → 사용자 동의 → `db.delete()`.
4. 이후 모든 저장은 Supabase Server Action으로.

**스키마 호환 보장**: 컬럼명·타입을 Supabase와 일치시켜, 동일 zustand store / 결과 컴포넌트가 양쪽 데이터를 동일하게 소비.

---

## 8. 구현 단계 (Do)

### Phase 1 — 인프라 (반나절)

- [ ] `npm install dexie fake-indexeddb`
- [ ] `lib/storage/constants.ts` — `LOCAL_USER_ID`
- [ ] `lib/storage/types.ts` — `UserId`, `UserProfile`, `CalculationRecord`(`userId` 필드 포함), `LocalTaxType`
- [ ] `lib/storage/db.ts` — Dexie v1 + 복합 인덱스 `[userId+createdAt]` / `[userId+taxType+createdAt]` / `[userId+linkedCalculationId]`
- [ ] `lib/storage/current-user.ts` — `getCurrentUserId()` (교체 지점 1곳)
- [ ] `lib/storage/user-repository.ts` + `calculation-repository.ts` — `createXxxRepository(uid)` 클로저 패턴
- [ ] 단위 테스트 (vitest + fake-indexeddb): userId 필터 격리, 복합 인덱스 쿼리, 200건 상한, 타 uid 레코드 보호

### Phase 2 — 자동 저장 (반나절)

- [ ] `lib/storage/use-auto-save-calculation.ts` 훅
- [ ] 양도세 `Step4.tsx`에 통합 (선행 사례)
- [ ] title 자동 생성 헬퍼 (`lib/storage/title-generator.ts`)

### Phase 3 — `/history` 리워크 (1일)

- [ ] `proxy.ts` `/history` 보호 해제
- [ ] `HistoryClient.tsx` Repository 호출로 변경
- [ ] `HistoryDetailDrawer` + 편집·삭제 다이얼로그
- [ ] 마법사 hydrate (양도세 우선)

### Phase 4 — 프로필 (반나절)

- [ ] `/profile` 페이지 + 폼
- [ ] 헤더 displayName 노출

### Phase 5 — 회귀·문서화 (반나절)

- [ ] 양도세 계산 → 자동 저장 → `/history` 조회 → 수정·삭제 e2e 수동 확인
- [ ] CLAUDE.md에 로컬 저장소 섹션 추가
- [ ] `MEMORY.md`에 정책 메모리 등록 (자동 저장 시점·중복 저장 방지·title 규칙)

### Phase 6 — 타 세목 확장 (UI 구현 시점에 점진)

취득세·재산세·종부세·상증세 UI가 완성될 때마다 Step{N}.tsx에서 `useAutoSaveCalculation` 한 줄 추가.

---

## 9. 위험 및 대응

| 위험 | 대응 |
|---|---|
| IndexedDB 사용 불가 환경(시크릿 모드 일부) | try/catch 후 사용자에게 토스트로 안내, 저장 skip |
| 동일 결과 중복 저장 (useEffect 재실행) | savedRef 플래그 + result 객체 reference 비교 |
| 200건 초과 저장 실패 | 가장 오래된 1건 자동 삭제 (Supabase 정책과 동일) |
| 스키마 변경 시 기존 로컬 데이터 깨짐 | Dexie versioning + migration 콜백. 단, 4-B 정책상 깨지면 폐기해도 무방 |
| zustand hydrate 시 Date 직렬화 | inputData 저장 시 toISOString, hydrate 시 new Date() — 각 세목 store에 변환 헬퍼 |

---

## 10. 비범위 (Out of Scope)

- Google·Kakao OAuth 구현 (별도 PRD)
- Supabase 데이터 동기화 (4-B 결정으로 마이그레이션 코드 작성 안 함)
- 다중 프로필 / 가족 단위 (2-A 결정)
- PDF 일괄 다운로드 (별도 작업)
- 검색·정렬 고급 기능 — 1차는 세목별 필터 + 최신순만

---

## 11. 다음 단계

1. 이 계획서 검토 후 승인.
2. Phase 1부터 순차 구현.
3. Phase 2 양도세 적용 시 사용자 브라우저 수동 확인 후 진행.
