# Plan: 프로필 2모드 — 일반 납세자 / 세무사·대리인

## Context

현재는 단일 로컬 사용자(`LOCAL_USER_ID`)가 본인의 계산 이력만 관리하는 구조다.
세무사·회계사 등 납세자 대리인이 여러 의뢰인(납세자)의 세액을 계산·관리할 수 있도록
**프로필 모드(일반 / 세무사)** 와 **의뢰인 엔티티** 를 추가한다.

사용자 요구사항:
- 의뢰인 정보: 이름(필수) + 생년월일 + 전화/이메일 + 메모
- 마법사 진입 시 **매번** 의뢰인을 선택(또는 새로 등록)
- 모드 전환 시 기존 이력은 **모두 유지** (clientId=null로 보존)

---

## 변경 파일 목록

| 파일 | 작업 |
|------|------|
| `lib/storage/types.ts` | UserMode·Client 타입 추가, UserProfile.mode, CalculationRecord.clientId |
| `lib/storage/db.ts` | `clients` 테이블 추가, 스키마 버전 업 |
| `lib/storage/client-repository.ts` | **신규** — CRUD |
| `lib/storage/index.ts` | clientRepository export 추가 |
| `lib/storage/use-auto-save-calculation.ts` | clientId 파라미터 추가 |
| `lib/stores/professional-store.ts` | **신규** — activeClientId zustand |
| `app/profile/ProfileClient.tsx` | 모드 토글 + ClientsSection |
| `app/profile/ClientsSection.tsx` | **신규** — 의뢰인 목록·추가·편집·삭제 |
| `app/profile/ClientForm.tsx` | **신규** — 의뢰인 입력 폼 |
| `components/calc/ClientSelectStep.tsx` | **신규** — 마법사 Step 0 의뢰인 선택 |
| `components/calc/StepWizard.tsx` | professional 모드 시 Step 0 자동 주입 |
| `app/history/HistoryClient.tsx` | 의뢰인 필터 + 의뢰인명 표시 |

---

## Step 1 — 타입 확장 (`lib/storage/types.ts`)

```ts
export type UserMode = "taxpayer" | "professional";

export interface Client {
  id: string;           // UUID
  userId: UserId;
  name: string;
  birthDate: string | null;   // YYYY-MM-DD
  phone: string | null;
  email: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

// UserProfile에 추가
export interface UserProfile {
  // ...기존 필드...
  mode: UserMode;   // default: "taxpayer"
}

// CalculationRecord에 추가
export interface CalculationRecord {
  // ...기존 필드...
  clientId: string | null;   // null = 본인 또는 미지정
}
```

---

## Step 2 — Dexie 스키마 (`lib/storage/db.ts`)

현재 버전 번호 확인 후 +1.

```ts
this.version(N + 1).stores({
  userProfile: "id, updatedAt",
  calculations: "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
  clients: "id, userId, name, [userId+name], [userId+createdAt]",
}).upgrade(tx => {
  // 기존 CalculationRecord에 clientId: null 채우기
  return tx.table("calculations").toCollection().modify(r => {
    if (r.clientId === undefined) r.clientId = null;
  });
});
```

---

## Step 3 — ClientRepository (`lib/storage/client-repository.ts`)

재사용 패턴: `lib/storage/user-repository.ts` 클로저 패턴 그대로 사용.

```ts
export function createClientRepository(uid: UserId) {
  return {
    list(): Promise<Client[]>
    get(id: string): Promise<Client | null>
    create(input: Omit<Client, "id"|"userId"|"createdAt"|"updatedAt">): Promise<Client>
    update(id: string, patch: Partial<Pick<Client, "name"|"birthDate"|"phone"|"email"|"memo">>): Promise<void>
    remove(id: string): Promise<void>
  }
}
```

`lib/storage/index.ts`에서 `clientRepository = createClientRepository(getCurrentUserId())` export.

---

## Step 4 — Professional Store (`lib/stores/professional-store.ts`)

```ts
interface ProfessionalState {
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  clearActiveClient: () => void;
}
```

zustand persist 없이 메모리만 — 마법사 진입 시 매번 선택하므로 세션 내 임시 유지면 충분.

---

## Step 5 — 의뢰인 선택 Step (`components/calc/ClientSelectStep.tsx`)

- professional 모드일 때 **StepWizard가 Step 0으로 자동 주입**
- 의뢰인 목록(ClientCard 리스트) + "새 의뢰인" 인라인 추가
- 선택 시 `professionalStore.setActiveClientId(id)` 호출
- "본인 계산(의뢰인 없음)" 옵션 없음 — professional 모드에선 항상 의뢰인 필수

StepWizard 주입 방식:
```tsx
// components/calc/StepWizard.tsx
const { mode } = useUserProfile();
const steps = mode === "professional"
  ? [<ClientSelectStep />, ...props.steps]
  : props.steps;
```

`useUserProfile()` — profile 로드 훅 신규 작성 또는 기존 ProfileClient 로직 추출.

---

## Step 6 — 자동 저장 clientId 연동 (`lib/storage/use-auto-save-calculation.ts`)

```ts
// 변경: clientId 파라미터 추가
export function useAutoSaveCalculation({
  taxType, inputData, resultData, taxLawVersion,
  clientId,   // 추가
}: { ... clientId?: string | null }) {
  // save() 호출 시 clientId 포함
}
```

호출부는 각 calculator result 컴포넌트에서 `professionalStore.activeClientId` 전달.
- `components/calc/results/TransferTaxResultView.tsx` — 이미 변경된 파일 (git status 확인됨)
- 기타 세목 결과 컴포넌트들도 동일 패턴

---

## Step 7 — 프로필 페이지 (`app/profile/ProfileClient.tsx`)

1. **모드 토글** (RadioCardGroup: 일반 납세자 / 세무사·대리인)
   - 전환 시 `userRepository.upsertProfile({ mode })` 저장
   - 모드 전환 확인 다이얼로그 불필요 (이력 유지이므로)

2. **ClientsSection** (professional 모드 시 노출)
   - 의뢰인 목록 (이름·연락처·생년월일 요약)
   - 추가/편집/삭제

---

## Step 8 — 이력 페이지 (`app/history/HistoryClient.tsx`)

- professional 모드 시 의뢰인 필터 드롭다운 추가
- 각 계산 카드에 의뢰인명 배지 표시 (clientId → Client.name lookup)
- 기존 clientId=null 항목은 "미지정" 또는 표시 생략

---

## 신규 파일 크기 가이드 (800줄 정책)

| 파일 | 예상 줄수 |
|------|----------|
| `client-repository.ts` | ~80줄 |
| `professional-store.ts` | ~30줄 |
| `ClientSelectStep.tsx` | ~120줄 |
| `ClientsSection.tsx` | ~150줄 |
| `ClientForm.tsx` | ~100줄 |

---

## 검증 방법

1. `npm run typecheck` — 0 오류
2. `npm run dev` 실행 후 수동 확인:
   - `/profile` → 모드 토글 확인
   - 세무사 모드 → 의뢰인 추가/편집/삭제
   - 양도세 계산기 진입 → Step 0 의뢰인 선택 화면 확인
   - 계산 완료 → `/history`에서 의뢰인명 표시 확인
   - 일반 납세자 모드 전환 → 기존 이력 유지 확인
3. `npx vitest run __tests__/tax-engine/` — 기존 엔진 테스트 회귀 없음

---

## 구현 순서

1. `types.ts` → `db.ts` (스키마)
2. `client-repository.ts` → `index.ts`
3. `professional-store.ts`
4. `ProfileClient.tsx` + `ClientsSection.tsx` + `ClientForm.tsx`
5. `ClientSelectStep.tsx` → `StepWizard.tsx` 주입
6. `use-auto-save-calculation.ts` + 결과 컴포넌트 clientId 전달
7. `HistoryClient.tsx` 의뢰인 필터·표시
