# 임시저장(Draft) + 미결 이력 표시 + 200건 한도 경고 계획서 (v4)

> 작성: 2026-05-21
> v3 → v4 변경: 검토에서 발견된 오류 6건·모호점 2건 패치 + 200건 한도 경고 정책 신설
> 선행 계획서: [`history-dedup-and-manual-save-unification.plan.md` v2](./history-dedup-and-manual-save-unification.plan.md), [`history-dedup-phase3-expansion.plan.md`](./history-dedup-phase3-expansion.plan.md)
> 트리거:
>   - "입력 작업 중간에 저장하고 다른 작업을 할 수 있어야 한다. 계산이 종료되지 않은 이력은 '미결'로 표시."
>   - "190건 이상이면 200건이 한도이고 오래된 것부터 삭제된다는 경고문 출력"

---

## 0. v3 → v4 패치 요약

| # | 위치 | v3 | v4 (수정) |
|---|---|---|---|
| P1 | §1.2 | "draft 한정 inputHash === contentHash" 자기모순 | 삭제. draft는 inputHash만 부여, contentHash는 undefined |
| P2 | §1.4 | 빈 폼 = `length > 0`만 | length + 핵심 필드 채움 양쪽 조건 |
| P3 | §2.3 | `deleteDraftsByInput` 의사코드 누락 | draft 필터 의사코드 명시 |
| P4 | §5 Phase B-2 | "선택" | "필수"로 격상 + `promotedDraftCount` 반환 |
| P5 | §4 | title `+ " (미결)"` 접미사 + 배지 (중복 표시) | 배지만 사용, title 접미사 폐기 |
| P6 | §5 Phase C | `NO_RESULT_SENTINEL` 폐기 명시 누락 | `EMPTY_FORM_SENTINEL`로 교체 + 호환성 명시 |
| P7 | §2.4 | useAutoSaveCalculation 빈 result skip 가드 동작 모호 | "v2 가드 그대로 유지" 명시 |
| P8 | (모호점) | 빈 폼 저장 시 기존 draft 처리 미정 | **옵션 A 채택** — draft 보존, 토스트 명시 |
| **NEW** | §1.6·§3.6 신규 | — | **190건 이상 경고 배너** (≥ 190 시 사용자에게 한도 안내) |

---

## 1. 정책 정의

### 1.1. Draft 식별 — `resultData` 빈 객체 규약

```typescript
function isDraftRecord(rec: CalculationRecord): boolean {
  return Object.keys(rec.resultData).length === 0;
}
```

스키마 변경 0건. 기존 record와 호환.

### 1.2. 두 종류의 해시 — 명확화

| 키 | 산식 | 부여 시점 |
|---|---|---|
| `contentHash` | `sha1(stableStringify(input) + "|" + stableStringify(result)).slice(0,16)` | final 저장 시(`saveOrUpdateByContent`)만 |
| `inputHash` | `sha1(stableStringify(input)).slice(0,16)` | draft·final 양쪽 모두 부여 |

**중요 정정 (v3→v4)**: 두 해시는 절대 같은 값이 아님 (`stableStringify({})="{}"`, `"foo" ≠ "foo|{}"`). v3 §1.2의 "draft 한정 inputHash === contentHash" 문장은 자기모순 → **삭제**.

```typescript
// Draft record 상태
{ inputHash: "abc123...", contentHash: undefined, resultData: {} }

// Final record 상태
{ inputHash: "abc123...", contentHash: "def456...", resultData: { totalTax: 100 } }
```

draft↔final 매칭은 항상 `inputHash` 기준. final dedup은 `contentHash` 기준.

### 1.3. 저장 매트릭스

| 사용자 행동 | result 상태 | clientId | 호출 | 동작 |
|---|---|---|---|---|
| 폼 입력 중 "저장하기" | `null` | A | `saveDraftByContent(input, A)` | 동일 inputHash+A draft 있으면 updatedAt 갱신, 없으면 신규 draft 추가 |
| 결과 화면 마운트 (자동) | 있음 | A | `deleteDraftsByInput(input, A)` → `saveOrUpdateByContent(input, result, A)` | draft 있으면 모두 삭제 후 final 신규 (= 승격) |
| 결과 화면 "저장하기" (수동) | 있음 | A | 동일 | draft 있으면 함께 삭제 |
| 빈 폼 "저장하기" | `null` | * | `isFormEmpty` 가드 → 차단 | 토스트 "저장할 입력이 없습니다. (기존 미결 이력은 보존됩니다)" — **기존 draft 유지** (옵션 A, P8) |

### 1.4. 빈 폼 판정 — 양쪽 조건 (length + 핵심 필드)

| 세목 | 빈 폼 = 다음 모두 만족 |
|---|---|
| 증여세 | `giftDate === ""` AND (`giftItems` 모두 비어있음 OR `giftItems.length === 0`) AND `stockItems.length === 0` |
| 양도세 | `assets.length === 0` OR `assets.every(a => !a.transferPrice && !a.acquisitionDate && !a.fixedAcquisitionPrice)` |
| 주식양도세 | `lots.length === 0` OR `lots.every(l => !l.securityCode && !l.transferPrice)` |
| 상속세 | `deathDate === ""` AND `assets.length === 0` |
| 취득세 | `targetDate === ""` AND `acquisitionPrice === ""` AND `taxBase === ""` |
| 재산세 | `properties.length === 0` OR `properties.every(p => !p.assessedValue)` |
| 종부세 | `properties.length === 0` OR `properties.every(p => !p.assessedValue)` |

**핵심 보강 (v3→v4)**: zustand store 초기값에 빈 element 1개가 자동 생성되는 세목(양도세 `assets[0]`, 주식양도세 `lots[0]` 등) 대응. `length > 0` 단독은 false negative.

세목별 `isFormEmpty(form): boolean` 헬퍼를 `{tax}-save-handler.ts`에 정의.

### 1.5. Draft·승격 토스트 5분기

| 케이스 | 토스트 |
|---|---|
| 신규 draft | "📝 임시저장되었습니다 — '미결' 이력으로 등록 (ID: xxxxxxxx)" |
| draft 갱신 | "📝 미결 이력이 갱신되었습니다 (ID: xxxxxxxx)" |
| 빈 폼 | "저장할 입력이 없습니다. (기존 미결 이력은 보존됩니다)" |
| 자동저장(final) — draft 승격 (N≥1) | "✓ 미결 이력 N건이 최종 이력으로 승격되었습니다 (ID: xxxxxxxx)" |
| 자동저장(final) — 신규/갱신 | v2 §2.5 그대로 |

### 1.6. ★ 200건 한도 경고 정책 (신규)

#### 경고 임계값

- **≥ 190건** 시점부터 사용자에게 한도 안내 노출
- ≥ 200건 도달 시 oldest 자동 삭제는 기존 정책 유지 (silent eviction)

#### 노출 위치

1. **`/history` 페이지 상단 배너** (190건 이상 시 항상 노출)
2. **수동·자동 저장 토스트 보강** (190건 이상에서 저장 발생 시 토스트에 안내 라인 추가)

#### 경고 배너 — `/history` 상단

```tsx
{count >= 190 && (
  <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 mb-4">
    <p className="text-sm font-semibold text-amber-900">
      ⚠️ 저장 한도 안내 — 현재 {count}/200건
    </p>
    <p className="text-xs text-amber-800 mt-1">
      사용자당 최대 200건까지 저장 가능합니다. 200건 도달 시 가장 오래된 이력부터 자동으로 삭제됩니다.
      필요한 이력은 미리 PDF로 저장하거나 불필요한 이력은 직접 삭제해주세요.
    </p>
    {count >= 200 && (
      <p className="text-xs text-amber-900 font-semibold mt-1">
        ※ 한도에 도달했습니다. 새로 저장하면 가장 오래된 이력이 삭제됩니다.
      </p>
    )}
  </div>
)}
```

색상 단계:
- 190~199건: 노란색(`amber-400`) 경고 — 한도 근접
- 200건: 동일 배너 + 추가 라인 "한도에 도달했습니다"

#### 저장 토스트 보강

`SaveToastMessage`에 optional `subtext` 추가 또는 본문에 라인 추가:

```typescript
if (count >= 190) {
  msg.text += `\n⚠️ 저장 한도 ${count}/200건 — 한도 도달 시 오래된 이력부터 자동 삭제됩니다.`;
}
```

#### 임계값 상수화

```typescript
// lib/storage/types.ts
export const MAX_CALCULATIONS_PER_USER = 200;
export const HISTORY_WARNING_THRESHOLD = 190;  // 신규
```

---

## 2. 데이터 모델·인프라

### 2.1. `lib/storage/content-hash.ts` 확장

```typescript
/** input만의 해시 — draft 매칭·승격용 */
export async function computeInputHash(input: Record<string, unknown>): Promise<string>;

// computeContentHash는 v2 그대로 유지
```

### 2.2. `CalculationRecord` 보조 필드

```typescript
export interface CalculationRecord {
  // ... 기존 필드 ...
  contentHash?: string;     // final 저장 시 부여 (v2)
  inputHash?: string;       // draft·final 양쪽 부여 (v3)
}
```

인덱스 없음 (200건 상한 내 full scan).

### 2.3. `calculation-repository` 신규/확장 메서드

#### 인터페이스

```typescript
interface CalculationRepository {
  saveOrUpdateByContent(input): Promise<{ id: string; created: boolean }>;

  /** 신규 — draft 전용 저장. 동일 inputHash+clientId 조합 dedup */
  saveDraftByContent(input): Promise<{ id: string; created: boolean }>;

  /** 신규 — 동일 inputHash+clientId의 draft만 삭제. 반환 = 삭제 건수 */
  deleteDraftsByInput(
    input: Record<string, unknown>,
    clientId: string | null,
    taxType: LocalTaxType
  ): Promise<number>;
}
```

#### `saveDraftByContent` 의사코드

```typescript
async saveDraftByContent(input) {
  const inputHash = await computeInputHash(input.inputData);
  const candidates = await db.calculations
    .where("[userId+taxType+createdAt]")
    .between([uid, input.taxType, Dexie.minKey], [uid, input.taxType, Dexie.maxKey])
    .toArray();
  const existing = candidates.find(
    (r) => r.inputHash === inputHash 
      && (r.clientId ?? null) === (input.clientId ?? null)
      && Object.keys(r.resultData).length === 0  // ★ draft 한정 필터
  );
  if (existing) {
    await db.calculations.update(existing.id, {
      title: input.title,
      taxLawVersion: input.taxLawVersion,
      updatedAt: new Date().toISOString(),
    });
    return { id: existing.id, created: false };
  }
  // 신규 draft 추가 — 200건 상한·oldest 삭제 동일 적용
  const id = crypto.randomUUID();
  // ... transaction add { ...input, id, inputHash, resultData: {}, contentHash: undefined }
  return { id, created: true };
}
```

#### `deleteDraftsByInput` 의사코드 (v4 신규 명시)

```typescript
async deleteDraftsByInput(inputData, clientId, taxType): Promise<number> {
  const inputHash = await computeInputHash(inputData);
  const candidates = await db.calculations
    .where("[userId+taxType+createdAt]")
    .between([uid, taxType, Dexie.minKey], [uid, taxType, Dexie.maxKey])
    .toArray();
  const targets = candidates.filter(
    (r) => r.inputHash === inputHash
      && (r.clientId ?? null) === (clientId ?? null)
      && Object.keys(r.resultData).length === 0  // ★★ draft 한정 필터 — final 보호
  );
  for (const t of targets) {
    await db.calculations.delete(t.id);
  }
  return targets.length;
}
```

**핵심 보강 (P3)**: draft 필터(`Object.keys(r.resultData).length === 0`)를 의사코드에 명시하여 구현자가 누락하지 않도록 강제. 이 필터 없으면 동일 input의 final까지 삭제되는 데이터 손실 버그 발생.

#### `saveOrUpdateByContent` 보강

v2에서 `contentHash`만 부여. v4에서 `inputHash`도 자동 부여:

```typescript
async saveOrUpdateByContent(input) {
  const contentHash = await computeContentHash(input.inputData, input.resultData);
  const inputHash = await computeInputHash(input.inputData);  // 추가
  // ... 이하 v2 로직, add 시 inputHash 함께 저장
}
```

### 2.4. 자동저장 hook 통합 — `useAutoSaveCalculation`

```typescript
useEffect(() => {
  if (!resultData) return;
  // v2 가드 — 빈 객체는 자동저장 skip (draft는 hook이 아니라 수동 SaveButton만)
  if (Object.keys(resultData).length === 0) return;  // ★ v2 그대로 유지 (P7)
  if (lastSavedResultRef.current === resultData) return;
  // ...
  
  // ★ 신규 — final 저장 직전 동일 input draft 삭제
  const promotedDraftCount = await calculationRepository.deleteDraftsByInput(
    inputData, clientId ?? null, taxType
  );
  
  const { id, created } = await calculationRepository.saveOrUpdateByContent({ ... });
  
  setSavedId(id);
  setCreated(created);
  setPromotedDraftCount(promotedDraftCount);  // ★ 신규 반환 (P4)
  setStatus("saved");
}, [...]);
```

반환 시그니처:
```typescript
interface Return {
  savedId: string | null;
  created: boolean | null;
  /** 이번 저장으로 함께 승격(삭제)된 draft 수 (v4) */
  promotedDraftCount: number;
  status: AutoSaveStatus;
  error: string | null;
}
```

**핵심 변경 (P4)**: v3 §5 Phase B-2 "선택" → "필수"로 격상. §1.5 토스트 매트릭스 "draft 승격" 분기를 표시하려면 hook이 promotedDraftCount를 반환해야 함.

### 2.5. 200건 상한 정책 + 190 경고 (보강)

draft도 동일 카운트에 포함. 200건 도달 시 oldest 자동 삭제 정책 그대로. 신규 190건 경고는 §1.6에 정의.

200건 도달 시 추가 보호: oldest가 draft인지 final인지 무관하게 createdAt 기준 가장 오래된 1건 삭제 (v2 그대로). draft 우선 삭제 정책은 후속 PR로 미룸.

---

## 3. UI 변경

### 3.1. `SaveButton` — disabled 조건 변경

```tsx
<SaveButton
  onSave={handleManualSaveForForm}
  disabled={isFormEmpty(form)}  // 결과 유무가 아니라 폼 비어있음만 차단
  disabledReason="한 가지 이상 입력 후 저장해주세요."
/>
```

### 3.2. `gift-tax-save-handler.ts` v4 분기 (Phase 2 적용분 수정)

```typescript
export const EMPTY_FORM_SENTINEL = "EMPTY_FORM";
// NO_RESULT_SENTINEL: v3에서 폐기 — v4부터 EMPTY_FORM_SENTINEL로 대체 (P6)

export async function runGiftManualSave({ form, result, clientId }):
  Promise<{ id: string; created: boolean; isDraft: boolean }> {
  
  if (isFormEmpty(form)) {
    throw new Error(EMPTY_FORM_SENTINEL);
  }
  
  const inputData = form as Record<string, unknown>;
  const baseTitle = generateTitle("gift", inputData, new Date().toISOString());
  const taxLawVersion = form.giftDate || new Date().toISOString().split("T")[0];
  
  if (!result) {
    // Draft 경로 — title은 base만 (배지로 시각 구분, P5)
    const { id, created } = await calculationRepository.saveDraftByContent({
      taxType: "gift",
      title: baseTitle,  // ★ "(미결)" 접미사 폐기 (P5)
      inputData,
      resultData: {},
      taxLawVersion,
      linkedCalculationId: null,
      clientId,
    });
    return { id, created, isDraft: true };
  }
  
  // Final 경로 — saveOrUpdateByContent 내부에서 deleteDraftsByInput을 호출하지 않음.
  // hook(useAutoSaveCalculation)이 해당 호출을 담당. 수동 저장은 별도 명시:
  await calculationRepository.deleteDraftsByInput(inputData, clientId, "gift");
  const { id, created } = await calculationRepository.saveOrUpdateByContent({
    taxType: "gift", title: baseTitle, inputData,
    resultData: result as unknown as Record<string, unknown>,
    taxLawVersion, linkedCalculationId: null, clientId,
  });
  return { id, created, isDraft: false };
}

export function formatGiftSaveMessage(outcome, count?: number): SaveToastMessage {
  let msg: SaveToastMessage;
  if (outcome instanceof Error) {
    if (outcome.message === EMPTY_FORM_SENTINEL) {
      msg = { kind: "info", text: "저장할 입력이 없습니다. (기존 미결 이력은 보존됩니다)" };
    } else {
      msg = { kind: "error", text: `저장 실패: ${outcome.message}` };
    }
  } else if (outcome.isDraft) {
    msg = {
      kind: "info",
      text: outcome.created
        ? `📝 임시저장되었습니다 — '미결' 이력으로 등록 (ID: ${outcome.id.slice(0,8)})`
        : `📝 미결 이력이 갱신되었습니다 (ID: ${outcome.id.slice(0,8)})`,
    };
  } else {
    msg = {
      kind: "success",
      text: outcome.created
        ? `새 이력으로 저장되었습니다. (ID: ${outcome.id.slice(0,8)})`
        : `현재 시점 스냅샷으로 갱신되었습니다. (ID: ${outcome.id.slice(0,8)})`,
    };
  }
  // ★ 190 경고 라인 추가 (§1.6)
  if (count !== undefined && count >= 190) {
    msg.text += `\n⚠️ 저장 한도 ${count}/200건 — 한도 도달 시 오래된 이력부터 자동 삭제됩니다.`;
  }
  return msg;
}
```

### 3.3. `/history` 미결 배지

```tsx
const isDraft = Object.keys(record.resultData).length === 0;

<div className={isDraft ? "opacity-80 border-amber-300 bg-amber-50/30" : ""}>
  <span>증여세</span>
  {isDraft && (
    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300 font-semibold">
      미결
    </span>
  )}
  ...
  납부세액: {isDraft ? <span className="text-muted-foreground italic">— (계산 미완료)</span> : extractTotalTax(record.resultData)}
</div>
```

### 3.4. history "수정" 흐름 — draft도 prefill로 재개

기존 `handleResume`이 record.inputData를 prefill. draft도 동일하게 동작. 별도 코드 변경 없음. **회귀 검증 항목으로 명시** (Phase D-3, Phase F-2).

### 3.5. SaveButton 라벨 — 통일

미계산/계산 후 무관하게 라벨 "저장하기". 토스트로 draft/final 구분 명시.

### 3.6. ★ `/history` 200건 한도 경고 배너 (§1.6 UI 구현)

```tsx
function HistoryClient() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    calculationRepository.count().then(setCount);
  }, []);
  
  return (
    <div>
      {count >= HISTORY_WARNING_THRESHOLD && (
        <HistoryQuotaBanner count={count} />
      )}
      {/* 기존 이력 목록 */}
    </div>
  );
}
```

`HistoryQuotaBanner` 컴포넌트 신규 (`components/calc/shared/HistoryQuotaBanner.tsx`):

- 색상: `amber-400` 보더 + `amber-50` 배경
- 본문: "⚠️ 저장 한도 안내 — 현재 N/200건"
- 부 본문: "200건 도달 시 가장 오래된 이력부터 자동 삭제됩니다. PDF로 저장하거나 직접 삭제해주세요."
- 200건 도달 시: 추가 라인 "※ 한도에 도달했습니다. 새로 저장하면 가장 오래된 이력이 삭제됩니다."

---

## 4. title 정책 (P5 단순화)

**v3 의도 폐기 (P5)**: draft title `+ " (미결)"` 접미사는 history 배지와 중복. 의미 없는 시각 잡음.

**v4 결정**: title은 항상 base만 (`generateTitle()` 기존 로직). draft 식별은 **배지로만** 표시. 사용자 요구 "미결 이라고 표시"는 §3.3 배지가 충족.

```
v3: "증여세 2026-05-21 (미결)"  + [미결] 배지 ← 중복
v4: "증여세 2026-05-21"  + [미결] 배지 ← 단일
```

---

## 5. 작업 항목

### Phase A — 인프라 확장 (0.35d, +0.05d for 190 threshold)

| # | 작업 | 파일 |
|---|---|---|
| A-1 | `computeInputHash` 추가 | `lib/storage/content-hash.ts` |
| A-2 | `CalculationRecord.inputHash?: string` 추가 | `lib/storage/types.ts` |
| A-3 | `HISTORY_WARNING_THRESHOLD = 190` 상수 | `lib/storage/types.ts` |
| A-4 | `saveDraftByContent` + `deleteDraftsByInput` 의사코드 그대로 구현 | `lib/storage/calculation-repository.ts` |
| A-5 | `saveOrUpdateByContent` — `inputHash` 함께 부여 | 상동 |
| A-6 | 단위 테스트 — 6+ anchor (saveDraft / dedup / 승격 / deleteDrafts draft-filter / 200건 상한 / 190 threshold) | `__tests__/lib/storage/calculation-repository-draft.test.ts` 신규 |

### Phase B — 자동저장 hook 확장 (0.2d, P4 반영)

| # | 작업 | 파일 |
|---|---|---|
| B-1 | `deleteDraftsByInput` 호출 + `promotedDraftCount` 반환 (필수) | `lib/storage/use-auto-save-calculation.ts` |
| B-2 | `AutoSaveStatus`에 `promoted` 의미 통합 — `promotedDraftCount` 별도 필드로 | 상동 |
| B-3 | v2 가드 "빈 result skip" 유지 명시 (주석 추가) | 상동 |
| B-4 | 테스트 갱신 — draft 승격 anchor (count ≥ 1 / count = 0 양쪽) | `__tests__/lib/storage/use-auto-save-calculation.test.tsx` |

### Phase C — 증여세 v4 적용 (참조 구현, 0.35d)

| # | 작업 | 파일 |
|---|---|---|
| C-1 | `isFormEmpty` + `EMPTY_FORM_SENTINEL` 추가, `NO_RESULT_SENTINEL` 폐기 (P6) | `components/calc/gift-tax-save-handler.ts` |
| C-2 | `runGiftManualSave` 분기 — draft/final + `deleteDraftsByInput` 호출 | 상동 |
| C-3 | `formatGiftSaveMessage` 5분기 + 190 경고 라인 (count 인자) | 상동 |
| C-4 | `GiftTaxForm.tsx` — SaveButton disabled 조건 `isFormEmpty(form)` | `components/calc/GiftTaxForm.tsx` |
| C-5 | `autoSaveToast` 변환 — 승격 분기 추가 | 상동 |
| C-6 | manual save 호출 시 record count 조회 → `formatGiftSaveMessage(outcome, count)` 전달 | 상동 |

### Phase D — /history UI (0.3d, 미결 배지 + 190 경고 배너)

| # | 작업 | 파일 |
|---|---|---|
| D-1 | `isDraft` 판정 + 미결 배지 + 납부세액 placeholder + 행 톤 | `app/history/HistoryClient.tsx` |
| D-2 | "수정" 버튼 draft prefill 동작 검증 (코드 변경 0건) | 상동 |
| D-3 | `HistoryQuotaBanner` 컴포넌트 신규 | `components/calc/shared/HistoryQuotaBanner.tsx` |
| D-4 | `HistoryClient`에 banner 통합 — count 조회 후 ≥ 190 시 노출 | `app/history/HistoryClient.tsx` |

### Phase E — Phase 3 6세목 확장 갱신 (0.6d, P2 빈 폼 양쪽 조건 반영)

Phase 3 계획서(`history-dedup-phase3-expansion.plan.md`) §3 절차에 추가:

- 세목별 `isFormEmpty(form)` 헬퍼 — §1.4 매트릭스 양쪽 조건(length + 핵심 필드) 적용
- SaveButton `disabled={isFormEmpty(form)}` 변경
- `{tax}-save-handler.ts`의 5분기 토스트 + 190 경고 라인 적용
- 6세목 ResultView의 `formatSaveMessage` 호출 시 record count 인자 전달

각 세목 +15줄 (이전 +10줄 → 빈 폼 매트릭스 보강). 6세목 작업 시간 +0.1d.

### Phase F — Playwright 검증 (0.4d, +0.1d for 190 시나리오)

| # | 시나리오 | 검증 |
|---|---|---|
| F-1 | 폼 입력 중간 "저장하기" → /history 미결 1건 | 배지·count·납부세액 "—" |
| F-2 | F-1 → 수정 진입 → 무변경 계산 → 자동저장 | draft 삭제, final 1건, 배지 사라짐 |
| F-3 | 두 번 임시저장 (같은 입력) → 1건 dedup | count=1 |
| F-4 | 빈 폼 "저장하기" → 차단 토스트 + 기존 draft 보존 | record 불변 |
| F-5 | 의뢰인 A draft + B 동일 input draft → 2건 | clientId 분리 |
| F-6 | record 190건 적재 → /history 진입 → 경고 배너 노출 | banner 표시·문구·count |
| F-7 | record 200건 적재 → 새 final 저장 → oldest 삭제 + 토스트에 한도 안내 라인 | count=200 유지, oldest 변경 |

### Phase G — 통합 검증 (0.2d)

- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 vitest 회귀 0건 (4098 → 동일·+ 6 신규 storage anchor → ~4104)
- [ ] Playwright F-1~F-7 PASS
- [ ] 800줄 정책 모든 파일 통과

---

## 6. 위험·트레이드오프 (v4 갱신)

| 위험 | 영향 | 완화 |
|---|---|---|
| draft 폭증으로 200건 도달 시 final 손실 | 사용자 의도 final 삭제 | **190 경고 배너로 사용자 자율 정리 유도** (v4 신규) + draft TTL 후속 PR |
| `inputHash` 부재 record(기존 데이터) 매칭 실패 | 자동 승격 동작 안 함 | 의도된 동작 — 기존 record는 그대로, 신규 저장만 inputHash 부여 |
| 빈 폼 판정 7세목 차이 | 각각 다른 헬퍼 | §1.4 매트릭스 양쪽 조건(length + 핵심 필드)로 표준화 |
| draft 재개 후 계산 미실행 | draft 그대로 남음 — 사용자 혼란 가능 | SaveButton 활성으로 사용자가 명시 저장 가능 |
| draft 재개 후 빈 폼으로 만든 뒤 저장 시도 | 정책 결정 필요 | **옵션 A 채택** — 기존 draft 보존, 토스트에 명시 (P8) |
| info 토스트(draft)와 success(final) 색상 혼동 | UX 노이즈 | sky 색 + 📝 이모지로 시각 구분 |
| `deleteDraftsByInput` draft 필터 누락 시 final 손실 | 데이터 손실 | §2.3 의사코드에 필터 명시 강제 (P3) + Phase F-4·F-7 회귀 anchor |
| 190 경고 배너가 사용자에게 노이즈로 인식 | UX 불만 | 배너 닫기 버튼 추가 또는 sessionStorage 임시 dismiss (후속) |
| oldest 자동 삭제가 user 의도 draft가 아닌 final을 삭제 | 데이터 손실 | draft 우선 삭제 정책은 후속 PR — 현재는 200건 경고로 자율 정리 유도 |

---

## 7. Definition of Done

### v4 1차 (증여세 적용)

- [ ] `computeInputHash` + 단위 테스트
- [ ] `saveDraftByContent` + `deleteDraftsByInput`(draft 필터 보장) + 단위 테스트 6+ anchor
- [ ] `HISTORY_WARNING_THRESHOLD = 190` 상수
- [ ] `useAutoSaveCalculation` 승격 통합 + `promotedDraftCount` 반환 + 빈 result skip 가드 유지
- [ ] `gift-tax-save-handler.ts` v4 분기 (`EMPTY_FORM_SENTINEL` + 5분기 + 190 경고 라인)
- [ ] `GiftTaxForm.tsx` SaveButton disabled 조건 변경 + count 인자 전달
- [ ] `/history` 미결 배지 + 납부세액 placeholder + 행 톤
- [ ] `HistoryQuotaBanner` 컴포넌트 + 190 시 노출 통합
- [ ] Playwright F-1 ~ F-7 PASS
- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 vitest 회귀 0건

### v4 후속 (Phase 3 6세목 동시 적용)

- [ ] 세목별 `isFormEmpty(form)` 헬퍼 6개 (§1.4 양쪽 조건)
- [ ] 6세목 `format*SaveMessage` 5분기 + 190 경고
- [ ] 6세목 SaveButton disabled 조건 변경
- [ ] Playwright 7세목 × 7 시나리오 = 49건 PASS

---

## 8. 작업 순서

**Phase A → B → C → D → F → G → E** 순서 권장.

1. **Phase A** 인프라 + 190 threshold
2. **Phase B** hook 확장 + 빈 result skip 가드 유지 명시
3. **Phase C** 증여세 v4 적용
4. **Phase D** /history UI (미결 배지 + 190 경고 배너)
5. **Phase F** Playwright F-1~F-7
6. **Phase G** 통합 검증
7. **Phase E** Phase 3 6세목 확장 (별개 PR)

---

## 9. v2 계획서 §0 갱신 안

[`history-dedup-and-manual-save-unification.plan.md`](./history-dedup-and-manual-save-unification.plan.md) §0 표에 v4 행 추가:

| # | 항목 | v1 | v2 | v3 | v4 (본 문서) |
|---|---|---|---|---|---|
| 0-2 | 미계산 상태 저장 | `{}` 적재 | 저장 비활성화 | draft 허용 | draft 허용 + 200건 경고 |

v2 §2.4 "미계산 저장 비활성화" 절은 deprecate 마커 + 본 문서 참조.

---

## 10. 후속 (별개 PR)

- draft 자동 만료(30일) — `db:cleanup-drafts` 스크립트 + opt-in
- `/history` "미결만 보기" 토글
- draft 재개 시 마지막 작업 step 복원
- 200건 도달 시 oldest 삭제 시 draft 우선 정책
- 경고 배너 닫기 버튼 + sessionStorage 임시 dismiss
- 사용자 설정 — "자동저장 토스트 표시" / "한도 경고 임계값"
