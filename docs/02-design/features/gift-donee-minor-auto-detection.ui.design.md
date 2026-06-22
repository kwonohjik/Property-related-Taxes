# 증여세 수증자 주민등록번호 입력으로 미성년 자동판정 — UI 설계

> Plan 참조: `docs/00-pm/gift-donee-minor-auto-detection.plan.md`
> Engine 설계 참조: `docs/02-design/features/gift-donee-minor-auto-detection.engine.design.md`
> 작성일: 2026-06-22
> 세목: 증여세(gift) · 단계: Step 0 "증여 정보"
> 법령: 민법 §4 · 상증법 §53②2호 · 상증법 §57①(40% 할증 본칙) · 상증법 §57②(계산방법 위임)

---

## 1. 사용자 시나리오

### 시나리오 A — 직계존속 증여 + 주민번호 입력 (자동판정 성공)

1. 사용자가 Step 0에서 증여일(giftDate)을 입력한다.
2. 증여자를 "아버지(부)", "어머니(모)", 또는 "조부모"로 선택한다.
3. 수증자 주민등록번호 입력란(신규, 선택)이 노출된다.
4. 주민번호를 입력하면 앞 6자리에서 생년월일을 파싱, 증여일 기준 만 나이를 계산한다.
5. 파싱 성공 + giftDate 존재 시 읽기전용 배지가 나타난다:
   - "생년월일 2010-05-01 · 증여일 기준 만 15세 → 미성년자 (§57① — 20억 초과 시 40% 할증 대상)"
6. 수동 ToggleCard(isMinorDonee)는 숨겨진다.
7. `resolveIsMinorDonee(form)` 이 `true`를 반환하여 API 변환·엔진 모두 자동 미성년 처리된다.

### 시나리오 B — 주민번호 미입력 · 파싱 실패 (수동 fallback, D-1)

1. 주민번호 입력 없음 또는 파싱 실패("abc" 등) 또는 giftDate 미입력.
2. 자동판정 배지 미표시, 수동 ToggleCard가 기존 위치에 노출된다.
3. 사용자가 토글로 isMinorDonee를 수동 설정 → 기존과 동일한 경로.

### 시나리오 C — 성년 자동판정

1. 주민번호 입력 시 만 19세 이상으로 판정되면 배지 표시:
   - "생년월일 2005-01-01 · 증여일 기준 만 21세 → 성년"
2. 수동 ToggleCard 숨김, isMinorDonee = false.

### 시나리오 D — 직계존속 외 증여자 선택

donor = `spouse` / `other_relative` / `other` 시 isMinorDonee ToggleCard는 기존에도 미노출.
주민번호 input도 직계존속(`father` / `mother` / `grandparent`) 조건부로 노출 — 이 경우 미노출.

---

## 2. 클라이언트 동기화 지점 (UI 관점)

plan §6 매트릭스 기반. ⑨~⑭(API/Zod/Route/엔진)는 무변경.

| # | 지점 | 파일 | 변경 내용 |
|---|---|---|---|
| ① | 폼 상태 타입 | `gift-tax-form-shared.tsx:56` 인근 (FormState) | `doneeResidentNumber: string` 신규 필드 추가 |
| ② | initial value | `gift-tax-form-shared.tsx:119` 인근 (INITIAL_FORM) | `doneeResidentNumber: ""` |
| ③ | normalize | — | pass-through (또는 `.trim()`). 자동 안분 fallback 아님 |
| ④ | API 변환 | `lib/calc/gift-api.ts:47·85·96` | `resolveIsMinorDonee(form)` 기준 3곳 전환 (donorRelation·isMinorDonee). 주민번호 자체 미포함 |
| ④' | API 변환 (부담부증여) | `lib/calc/gift-burdened-transfer-api.ts:117·119` | `form.donorRelation`·`form.isMinorDonee` 직접 read → derive 전환 |
| ④'' | 동시증여 seed | `GiftCreditChecklist.tsx:308` | `form.donorRelation` → `deriveDonorRelation(form.donor, resolveIsMinorDonee(form))` |
| ⑤ | UI 위젯 | `gift-tax-form-shared.tsx:559-570` (기존 ToggleCard 위치) | 주민번호 input + 자동 배지 + 수동 토글 fallback + §57① 라벨 정정 |
| ⑥ | 사이드바 | — | N/A (gift 사이드바 미사용) |
| ⑦ | 결과 카드 | `GiftResultView.tsx` 등 | 주민번호 결과/PDF 미노출 확인. §53 공제액 변화는 엔진 자동 반영 |
| ⑧ | validate | `gift-tax-form-shared.tsx:258 validateStep(step=0)` | D-2(선택 입력·차단 없음) → no-op. `gift-validate.ts` 부재(인라인). UI/validate 모순 없음 |

---

## 3. 신규 헬퍼 파일

`lib/calc/gift-donee-minor.ts` (신규 — 엔진 설계 §3 동일):

- `computeAutoMinor(residentNumber, baseDate)` — `boolean | null`
- `resolveIsMinorDonee(form)` — `boolean` (3중 패턴 단일 진실)

재사용: `lib/calc/resident-number.ts` `parseResidentNumber` (앞 7자리, 체크섬 검증 생략).

**3중 패턴 강제** (memory `mirror-pattern`):
UI 표시(⑤) · API 변환(④·④'·④'') · validate(⑧) — 세 곳 모두 `resolveIsMinorDonee` 단일 호출.

**useEffect → store 미러링 금지** (memory `feedback_useeffect_store_mirror_forbidden`):
자동판정 결과를 store `isMinorDonee`에 쓰지 않는다. 미성년 여부·배지는 `useMemo`로 derive만.

---

## 4. Step 0 UI 배치 — 위젯 순서 (로직 순서와 동일)

현재 Step 0 구조(`components/calc/gift-tax-form-shared.tsx`):

```
[증여일 DateInput]          ← :540-551, giftDate — 미성년 판정 기준일
[증여자 select]              ← :513-534, donor 선택
  └ [§57① 단서 ToggleCard]  ← :543-551, grandparent 시에만
[★ 수증자 주민등록번호 input] ← 신규 — 직계존속(father/mother/grandparent) 조건부
[★ 자동판정 배지 OR 수동 ToggleCard fallback]
```

**신규 주민번호 input 노출 조건**: `form.donor === "father" || form.donor === "mother" || form.donor === "grandparent"` — 기존 ToggleCard 노출 조건과 동일하여 일관성 유지.

**배치 원칙 (UI 순서 = 로직 순서)**:
- 증여일(판정 기준일) → 증여자 → **수증자 주민번호(파싱 후 자동판정)** → 판정 결과(배지 or 토글).
- 영향 필드(미성년 판정 결과) 직전에 입력 위젯을 배치한다.

---

## 5. 주민번호 input 위젯 명세

```tsx
{/* 직계존속 조건부 */}
{(form.donor === "father" ||
  form.donor === "mother" ||
  form.donor === "grandparent") && (
  <FieldCard
    label="수증자 주민등록번호 (선택)"
    hint="앞 6자리-뒤 7자리 형식 — 생년월일만 사용하며 체크섬 검증은 하지 않습니다"
  >
    <input
      type="text"
      inputMode="numeric"
      value={form.doneeResidentNumber}
      onChange={(e) => set({ doneeResidentNumber: e.target.value })}
      placeholder="예: YYMMDD-GXXXXXX"
      data-testid="donee-resident-number"
      className="..."
    />
  </FieldCard>
)}
```

### 상세 명세

| 속성 | 값 | 이유 |
|---|---|---|
| `type` | `"text"` | 주민번호는 숫자+하이픈 혼합 → 문자열 처리 |
| `inputMode` | `"numeric"` | 모바일 숫자 키패드 표시 |
| `onFocus` 전체 선택 | **추가 불필요** | `SelectOnFocusProvider`가 `app/layout.tsx`에 전역 등록됨 (`components/providers/SelectOnFocusProvider.tsx`, `app/layout.tsx` import 확인) |
| `placeholder` | `"예: YYMMDD-GXXXXXX"` | 형식 안내 (숫자 예시 금지 — placeholder 정책 예외: 포맷 자체가 형식 설명) |
| `hint` (FieldCard) | `"앞 6자리-뒤 7자리 형식 — 생년월일만 사용하며 체크섬 검증은 하지 않습니다"` | 사용자 불안 해소 |
| `data-testid` | `"donee-resident-number"` | E2E 셀렉터 |
| `onChange` | `set({ doneeResidentNumber: e.target.value })` 만 | cross-field set 금지. 미성년 derive는 useMemo |
| 라벨 "(선택)" | label에 포함 | D-2 선택 입력, 차단 없음 |

> **SelectOnFocusProvider 확인**: `components/providers/SelectOnFocusProvider.tsx` 존재, `app/layout.tsx`에 `<SelectOnFocusProvider>` 래퍼로 전역 등록됨 — 별도 `onFocus={(e) => e.target.select()}` 추가 불필요.

---

## 6. 자동판정 배지 (읽기전용) 명세

### 노출 조건

`computeAutoMinor(form.doneeResidentNumber, form.giftDate) !== null` — 파싱 성공 + giftDate 있음.

### 배지 문구

```
생년월일 {YYYY-MM-DD} · 증여일 기준 만 {N}세 → {미성년자 / 성년}
{미성년자인 경우 추가}: (§57① — 세대생략 증여재산가액 20억 초과 시 40% 할증 대상)
```

예시:
- 미성년: "생년월일 2010-05-01 · 증여일 기준 만 15세 → **미성년자** (§57① — 20억 초과 시 40% 할증 대상)"
- 성년: "생년월일 2005-01-01 · 증여일 기준 만 21세 → **성년**"

### 배지 스타일

```tsx
const autoMinorResult = useMemo(
  () => computeAutoMinor(form.doneeResidentNumber, form.giftDate),
  [form.doneeResidentNumber, form.giftDate]
);
const resolvedMinor = useMemo(
  () => resolveIsMinorDonee(form),
  [form.doneeResidentNumber, form.giftDate, form.isMinorDonee]
);

{autoMinorResult !== null && (
  <div className={`rounded-md border px-3 py-2 text-sm ${
    resolvedMinor
      ? "border-violet-300 bg-violet-50/70 text-violet-800"
      : "border-sky-200 bg-sky-50/50 text-sky-700"
  }`}>
    {/* 배지 문구 */}
  </div>
)}
```

- 미성년: violet 톤 (§57① 할증 연관 — 동일 tone 유지)
- 성년: sky 톤 (일반 정보)

### 자동판정 시 수동 ToggleCard 숨김

```tsx
{autoMinorResult === null && (
  form.donor === "father" || form.donor === "mother" || form.donor === "grandparent"
) && (
  <ToggleCard
    tone="violet"
    title="수증자 미성년자 (§57① — 40% 할증 판정)"  {/* ← §57② → §57① 정정 */}
    description="수증자가 미성년자이고 세대생략 증여재산가액이 20억을 초과하면 30% 대신 40% 할증 적용 (상증법 §57①)"
    checked={form.isMinorDonee}
    onCheckedChange={(v) => {
      const newDonorRelation = deriveDonorRelation(form.donor, v);
      set({ isMinorDonee: v, donorRelation: newDonorRelation });
    }}
  />
)}
```

---

## 7. ★ §57② → §57① 라벨 정정 (mustFix)

### 현황 (실측)

`gift-tax-form-shared.tsx:561`:
```tsx
title="수증자 미성년자 (§57 ② 40% 할증 판정)"
```

### 오류 근거

- 상증법 §57①: "미성년자인 경우로서 증여재산가액이 20억원을 초과하는 경우에는 100분의 40" — **40% 할증 본칙 조항**
- 상증법 §57②: "할증과세액의 계산방법 등 필요한 사항은 대통령령으로 정한다" — 계산방법 위임 조항 (할증과 직접 관련 없음)
- 엔진 상수 `GIFT_LAW.SURCHARGE_MINOR_OVER_2B` = "상증법 §57 ① 본문 · 단서" (KoreanLaw MCP MST 276123 검증 완료)

### Do 단계 정정 대상

1. **수동 ToggleCard title**: `"§57 ②"` → `"§57①"`
2. **자동판정 배지 문구**: `"§57①"` 단일 인용 (위 §6 배지 문구 기준)
3. **ToggleCard description**: `"(상증법 §57①)"` 법령 인용 명확화

---

## 8. derive 거동 — store 정합 (채택안 A)

### onChange 설계

```tsx
// 주민번호 input onChange — cross-field set 금지
onChange={(e) => set({ doneeResidentNumber: e.target.value })}

// donor onChange — 기존 유지 (:518 derive·:524 set)
// isMinorDonee 수동 toggle onChange — 기존 유지 (:567 set)
//   (자동판정 성공 시 ToggleCard 숨김이므로 사용자가 직접 조작 불가)
```

### useMemo derive

```tsx
// 자동판정 결과 — 배지 표시 여부 결정
const autoMinorResult = useMemo(
  () => computeAutoMinor(form.doneeResidentNumber, form.giftDate),
  [form.doneeResidentNumber, form.giftDate]
);

// 미성년 단일 진실 — API 변환에서도 동일 함수 호출 (3중 패턴)
const resolvedMinor = useMemo(
  () => resolveIsMinorDonee(form),
  [form.doneeResidentNumber, form.giftDate, form.isMinorDonee]
);
```

### store.donorRelation 유지 (채택안 A)

store `donorRelation` set (`gift-tax-form-shared.tsx:524`(donor onChange)·`:567`(isMinorDonee 토글))은 **유지**:
- `④'` `gift-burdened-transfer-api.ts:117`이 `form.donorRelation` store를 직접 read
- `④''` `GiftCreditChecklist.tsx:308`이 `form.donorRelation` store를 직접 seed

단, 엔진 전송 경로 (`④ gift-api.ts:47·85·96` · `④'` · `④''`) 전부를 `resolveIsMinorDonee(form)` 기반 derive로 통일하여 **헬퍼 레벨 단일 진실** 확보.

**금지**: `useEffect` 내부에서 `set({ isMinorDonee: autoMinorResult })` 호출 — 무한 루프 위험 (memory `feedback_useeffect_store_mirror_forbidden`).

---

## 9. 결과/PDF 주민번호 미노출 (⑦)

- `GiftResultView.tsx` 및 모든 PDF 생성 경로에서 `doneeResidentNumber` 필드 출력 금지
- `buildGiftTaxInput` 반환값에 주민번호 포함 불필요 (④ 설계 확인)
- grep 점검: `doneeResidentNumber` 가 결과 카드·별지 PDF 렌더 경로에 노출되지 않음을 Do 단계에서 확인
- §57 할증 표시 (`generationSkipSurchargeDetail`) · §53 공제액 변화는 기존 경로 그대로 자동 반영

---

## 10. validate 검토 (⑧)

- 위치: `gift-tax-form-shared.tsx:258 validateStep(step=0)` (인라인, `lib/calc/gift-validate.ts` 미존재)
- D-2(선택 입력·차단 없음) → `doneeResidentNumber` / `isMinorDonee` 관련 차단 추가 안 함
- 3중 패턴: `resolveIsMinorDonee` 를 validate 내부에서도 호출 가능하나 차단 로직이 없으므로 변경 불필요
- **UI 통과 ↔ validate 차단 모순 없음** (memory `feedback_validation_sync_8th_point`)
- 추후 차단 정책 추가 시 이 헬퍼를 그대로 호출하면 됨

---

## 11. 공통 UI 규칙 준수 확인

| 규칙 | 적용 |
|---|---|
| `DateInput` 사용 (type="date" 금지) | 증여일 입력: `DateInput` 기존 유지 |
| `FieldCard` 외부 감싸기 | 주민번호 input: `FieldCard`로 감쌈 |
| `ToggleCard` 사용 (native checkbox 금지) | 수동 fallback 토글: 기존 `ToggleCard` 유지 |
| OFF 상태에도 tone 배경 유지 | tone="violet" 그대로 |
| `onFocus` 수동 추가 금지 | `SelectOnFocusProvider` 전역 등록 확인 |
| placeholder 숫자 예시 금지 | hint로 형식 안내. placeholder는 포맷 패턴(YYMMDD-GXXXXXX)만 |
| UI 순서 = 로직 순서 | 증여일→증여자→주민번호→판정결과 순서 유지 |
| 결과 카드 내부 id 노출 금지 | 주민번호 결과/PDF 미노출 확인 필수 |
| "원" 단위 표기 금지 | 해당 없음 (금액 입력 없음) |
| 800줄 정책 | gift-tax-form-shared.tsx 현행 줄수 확인 필요 — 신규 추가분이 적어 정책 내 예상 |

---

## 12. E2E 테스트 명세

파일: `e2e/gift-minor-auto-detection.spec.ts` (신규) — 또는 기존 `e2e/gift-tax-*.spec.ts`에 추가

### 시나리오 T-1: 자동판정 미성년 + §57 40% 결과

1. donor = "grandparent" 선택
2. giftDate = "2026-02-09" 입력
3. `data-testid="donee-resident-number"` 에 미성년 주민번호 입력 (예: "1005013XXXXXX")
4. 자동판정 배지 표시 확인: "→ 미성년자" 문자열 포함
5. 수동 ToggleCard 미표시 확인
6. 증여재산 20억 초과 입력 후 계산
7. 결과: generationSkipSurchargeDetail.surchargeRate = 0.4 확인

### 시나리오 T-2: 수동 fallback (파싱 실패)

1. donor = "father" 선택
2. 주민번호 란에 "abc" 입력
3. 자동판정 배지 미표시 확인
4. 수동 ToggleCard 노출 확인

### 시나리오 T-3: 직계존속 외 — 주민번호 란 미노출

1. donor = "spouse" 선택
2. 주민번호 input `data-testid="donee-resident-number"` 미존재 확인

---

## 13. 구현 순서 (Do 단계)

엔진 설계서 §도 구현 순서 기준, UI 측 세분화:

1. `lib/calc/gift-donee-minor.ts` 신규 — `computeAutoMinor` + `resolveIsMinorDonee`
   - verify: Pre-Do anchor A-1~A-7 통과 (A-3/A-4 경계 최우선)
2. ① `doneeResidentNumber: string` FormState 추가 + ② INITIAL_FORM `""`
   - verify: `npx tsc --noEmit` 0건
3. ⑤ UI 위젯 구현 — Step 0에 주민번호 input + useMemo derive + 배지 + 토글 fallback
   - **§57② → §57① 라벨 정정** (`gift-tax-form-shared.tsx:561` title 수정)
   - verify: 렌더 확인
4. ④ `gift-api.ts` 업데이트 — `:47·:85·:96` 세 곳 `resolveIsMinorDonee(form)` 전환
   - verify: A-8·A-9·A-11 anchor 통과
5. ④'·④'' `gift-burdened-transfer-api.ts:117·119` + `GiftCreditChecklist.tsx:308` derive 전환
   - verify: A-12 anchor 통과
6. ⑧ validate 검토 — step0 무변경 확인 (D-2 no-op)
7. ⑦ 결과/PDF 주민번호 미노출 grep 확인
8. E2E — T-1·T-2·T-3 시나리오 실행
9. 회귀 — `npx vitest run __tests__/tax-engine/gift/` + `npm test` 전체
10. `/code-review` High/Medium 0 → 커밋

---

## 14. Definition of Done

- [ ] `lib/calc/gift-donee-minor.ts` 신규 + Pre-Do anchor A-1~A-12 통과
- [ ] ① `doneeResidentNumber: string` FormState + ② initial `""`
- [ ] ⑤ 주민번호 input + 배지 + 수동 토글 fallback + **§57① 라벨 정정**(:561)
- [ ] ④ `gift-api.ts:47·85·96` 세 경로 `resolveIsMinorDonee` 전환 (`:96 isMinorDonee` 누락 시 §57 40% 미발동)
- [ ] ④'·④'' 부담부증여·동시증여 seed derive 전환 (`form.donorRelation`·`form.isMinorDonee` 직접 read 잔존 grep 0건)
- [ ] ⑦ 주민번호 결과·PDF 미노출 grep 확인
- [ ] ⑧ validate 무변경 확인 (D-2·no-op)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift/` 통과
- [ ] `npm test` 전체 회귀 0
- [ ] gift E2E 신규 T-1 + 기존 gift E2E green
- [ ] `/code-review` High/Medium 0
- [ ] (권장) `ui-engine-sync-checker` 호출 결과 첨부

---

## 15. SCOPE OUT

- 주민번호 체크섬 검증 (사용자 명시 생략)
- 외국인등록번호 별도 처리
- 주민번호 암호화 저장 (상속세 `HeirEditor`와 동일 수준 — sessionStorage 평문)
- 상속세 `HeirEditor.autoIsMinor`와의 공용 추출 `isMinorAt(birthDate, baseDate)` — 향후 후보

---

## 16. plan/engine 정합 확인

| 항목 | plan §§ | engine §§ | UI 설계 §§ | 정합 |
|---|---|---|---|---|
| 채택안 A (store set 유지) | plan §5.5 | engine Phase 4 | UI §8 | 일치 |
| §57① 라벨 정정 | plan §9 | engine 법령검증 | UI §7 | 일치 (mustFix) |
| 주민번호 클라이언트 전용 | plan §5.1 | engine §원칙 | UI §9 | 일치 |
| resolveIsMinorDonee 3중 패턴 | plan §5.2 | engine §신규헬퍼 | UI §3 | 일치 |
| ⑨~⑭ 무변경 | plan §6 | engine §14지점 | UI §2 | 일치 |
| D-1 수동 fallback | plan §2 | engine Phase 5 | UI §6 | 일치 |
| D-2 선택 입력·차단 없음 | plan §2 | engine Phase 6 | UI §10 | 일치 |
| isMinorDonee store 수동값 유지 | plan §5.4 | engine Phase 4 | UI §8 | 일치 |
| SelectOnFocusProvider 전역 | — | — | UI §5 | 실측 확인 |
| ToggleCard 노출조건 유지 | plan §5.4 | engine Phase 5 | UI §4 | 일치 |
