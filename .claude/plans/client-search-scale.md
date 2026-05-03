# Plan: 의뢰인 대량(수백명) 검색·선택 UX 개선

## Context

현재 세무사 모드에서 의뢰인 목록을 단순히 카드 리스트로 펼쳐 표시한다.
의뢰인이 수백 명일 경우:
- 마법사 진입 시 의뢰인 선택 화면이 무한 스크롤이 됨
- 프로필 페이지의 의뢰인 관리도 마찬가지
- 원하는 의뢰인을 빠르게 찾을 수단(검색·최근사용)이 없음

세무사 워크플로 가정:
- 동일 의뢰인의 다건 계산이 자주 발생(예: 양도세 후 같은 사람의 종부세 계산)
- 한글 이름 부분 일치, 전화번호 끝자리 검색이 가장 빈번

목표: 의뢰인이 500명 이상이어도 3초 이내에 원하는 의뢰인 찾기.

---

## 변경 파일 목록

| 파일 | 작업 |
|------|------|
| `lib/storage/types.ts` | `Client.lastUsedAt` 필드 추가 |
| `lib/storage/db.ts` | v3 스키마: `[userId+lastUsedAt]` 인덱스 추가 + 마이그레이션 |
| `lib/storage/client-repository.ts` | `search(query)` · `listRecent(limit)` · `touch(id)` 추가 |
| `lib/storage/use-auto-save-calculation.ts` | 저장 시 `clientRepository.touch(clientId)` 호출 |
| `components/calc/ClientSelectStep.tsx` | 검색창 + 최근사용 섹션 + 전체 목록 가상 스크롤 |
| `components/calc/ClientSearchInput.tsx` | **신규** — 공용 검색 입력(debounce·이름/전화 매칭) |
| `app/profile/ClientsSection.tsx` | 검색창 + 페이지네이션(20개/page) |

신규 파일: 1개 (`ClientSearchInput.tsx`)

---

## Step 1 — Client 타입 확장 (`lib/storage/types.ts`)

```ts
export interface Client {
  // ...기존 필드...
  /** 마지막 사용 일시 — 계산 저장 시 갱신. null = 한 번도 사용 안 됨 */
  lastUsedAt: string | null;
}
```

---

## Step 2 — Dexie v3 스키마 (`lib/storage/db.ts`)

```ts
this.version(3)
  .stores({
    userProfile: "id, updatedAt",
    calculations: "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
    clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
  })
  .upgrade((tx) =>
    tx.table("clients").toCollection().modify((c) => {
      if (c.lastUsedAt === undefined) c.lastUsedAt = null;
    })
  );
```

---

## Step 3 — ClientRepository 확장 (`lib/storage/client-repository.ts`)

```ts
export interface ClientRepository {
  // ...기존 메서드...
  /** 최근 사용 N명 (lastUsedAt DESC, null은 제외) */
  listRecent(limit: number): Promise<Client[]>;
  /** 이름·전화·이메일 부분 일치 검색 (대소문자·공백 무시) */
  search(query: string, limit?: number): Promise<Client[]>;
  /** 의뢰인 사용 기록 갱신 — 계산 저장 시 호출 */
  touch(id: string): Promise<void>;
}
```

**구현 세부**:

```ts
async listRecent(limit) {
  const arr = await db.clients
    .where("[userId+lastUsedAt]")
    .between([uid, Dexie.minString], [uid, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return arr.filter((c) => c.lastUsedAt !== null);
},

async search(query, limit = 50) {
  const q = query.trim().toLowerCase().replace(/\s/g, "");
  if (!q) return [];
  const all = await db.clients.where("userId").equals(uid).toArray();
  return all
    .filter((c) => {
      const hay = [c.name, c.phone, c.email]
        .filter(Boolean)
        .join("")
        .toLowerCase()
        .replace(/[\s-]/g, "");
      return hay.includes(q);
    })
    .slice(0, limit);
},

async touch(id) {
  await db.clients.update(id, { lastUsedAt: new Date().toISOString() });
}
```

**전체 스캔 정당화**: 의뢰인 1,000명 × 100 bytes ≈ 100KB. IndexedDB 전체 read는 1,000명 기준 < 50ms. Dexie LIKE 인덱스 미지원이므로 클라이언트 필터가 가장 단순하고 충분히 빠름.

---

## Step 4 — touch 자동 호출 (`lib/storage/use-auto-save-calculation.ts`)

저장 성공 후 `clientId`가 있으면 `clientRepository.touch(clientId)` 호출.

```ts
calculationRepository
  .save({ ..., clientId })
  .then((id) => {
    setSavedId(id);
    if (clientId) clientRepository.touch(clientId);
  });
```

업데이트 분기에서도 동일.

---

## Step 5 — ClientSearchInput 컴포넌트 (`components/calc/ClientSearchInput.tsx`)

```tsx
interface Props {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}
```

- 입력 클리어 버튼 ✕
- 200ms debounce (외부에 전달)
- `onFocus={(e) => e.target.select()}` 적용

---

## Step 6 — ClientSelectStep 개편

### UI 구조

```
┌──────────────────────────────────┐
│ 의뢰인 선택                      │
│ ┌────────────────────────────┐  │
│ │ 🔍 이름·전화로 검색         │  │  ← 검색창 (autoFocus)
│ └────────────────────────────┘  │
│                                  │
│ 검색 결과 N명             ← OR  │
│ ─────                            │
│ ⭐ 최근 사용                     │
│ [김성실] [박지혜] [이수민]      │
│                                  │
│ 전체 (가나다 순) — 234명         │
│ ┌──────────────────────────┐    │
│ │ 가상 스크롤 영역 (max-h)  │    │
│ │ 김민지 1959-07-11        │    │
│ │ 김성실 010-1234-4567     │    │
│ │ 김영수 ...               │    │
│ └──────────────────────────┘    │
│                                  │
│ + 새 의뢰인 등록                 │
│ [선택한 의뢰인으로 시작]         │
└──────────────────────────────────┘
```

### 동작

- 마운트 시: `listRecent(5)` + `list()` 병렬 로드
- 검색어 입력 시: debounce 후 `search(q)` 호출 → 결과만 표시 (최근사용·전체 섹션 숨김)
- 검색어 비우면: 최근사용 + 전체 다시 표시
- 가상 스크롤: 100명 초과 시 `react-window` 도입 검토 (현재 미설치)
  - **간단 fallback**: 검색 결과 50개 제한, 전체는 max-h-96 + overflow-y-auto. 100~200명은 native scroll로도 충분.

### 정렬

- 최근사용: `lastUsedAt DESC`, 5명
- 전체: 한글 이름 가나다순 (`localeCompare("ko")`)

---

## Step 7 — ClientsSection 개편 (프로필 페이지)

```
┌──────────────────────────────────┐
│ 의뢰인 관리          [+ 추가]    │
│ 위임받은 ...                     │
│                                  │
│ ┌──────────────────────────┐    │
│ │ 🔍 이름·전화로 검색       │    │
│ └──────────────────────────┘    │
│ 234명 중 1-20 표시               │
│                                  │
│ [의뢰인 카드 × 20]               │
│                                  │
│ < 1 2 3 ... 12 >                │
└──────────────────────────────────┘
```

- 검색어 없음: 전체 목록 가나다순 페이지네이션 (20개/page)
- 검색어 있음: 검색 결과만 페이지 없이 표시 (max 50)
- 페이지네이션: 단순 prev/next + 페이지 번호

---

## Step 8 — 결과 화면 의뢰인 배너 갱신

`ProfessionalClientGate`의 `ActiveClientBanner`에 `의뢰인 변경` 버튼 동작 시:
- `clearActiveClient()` → ClientSelectStep 재진입 → 검색창에서 다른 의뢰인 빠르게 선택

---

## 성능 검토

| 항목 | 100명 | 1,000명 | 10,000명 |
|------|-------|---------|----------|
| 전체 read | <10ms | <50ms | ~500ms |
| search() 필터 | <5ms | ~20ms | ~200ms |
| 렌더(가상X) | OK | 느림 | 동결 |

→ 1,000명까지는 가상 스크롤 없이 가능. 10,000명 대비 시 추가 최적화 필요.
이번 PR은 1,000명 기준 충분한 UX를 제공하고, 가상 스크롤은 후속 과제로 분리.

---

## 검증 방법

1. `npm run typecheck` — 0 오류
2. **수동 시드 스크립트**: 콘솔에서 임시 의뢰인 200명 생성 후 검색 응답성 확인
   ```js
   for (let i = 0; i < 200; i++) {
     await window.clientRepository.create({
       name: `테스트${i.toString().padStart(3, "0")}`,
       birthDate: null, phone: `010-${1000 + i}-0000`,
       email: null, memo: null,
     });
   }
   ```
3. ClientSelectStep:
   - 검색창에 "김" 입력 → 김씨 의뢰인만 즉시 필터
   - 검색창 비움 → 최근사용 + 전체 표시
4. 양도세 계산 완료 → 해당 의뢰인이 다음 진입 시 "최근사용" 최상단
5. `npx vitest run __tests__/lib/storage/` — 회귀 0건
6. 브라우저 수동 확인

---

## 구현 순서

1. `types.ts` (Client.lastUsedAt) → `db.ts` v3 마이그레이션
2. `client-repository.ts` (search·listRecent·touch)
3. `use-auto-save-calculation.ts` (touch 자동 호출)
4. `ClientSearchInput.tsx` (공용 컴포넌트)
5. `ClientSelectStep.tsx` 개편 (검색·최근사용)
6. `ClientsSection.tsx` 개편 (검색·페이지네이션)
7. 수동 시드 → 200명 시나리오 확인 → 커밋·푸시

---

## 후속 과제 (이번 PR 범위 외)

- 즐겨찾기(★) 기능: `Client.isFavorite` 필드
- CSV import (대량 의뢰인 일괄 등록)
- 의뢰인 그룹/태그 (예: "법인", "고액자산가")
- 가상 스크롤(react-window) — 10,000명+ 대응
- 한글 초성 검색(예: "ㄱㅁㅈ" → "김민지")
