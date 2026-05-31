# 사전증여 Phase 2 — UI 디자인 문서

> Plan: `docs/00-pm/inheritance-prior-gift-donee-phase2.plan.md`
> Design: `docs/02-design/features/inheritance-prior-gift-donee-phase2.design.md`
> 대상: `HeirComposition.tsx`(Step1) + `GiftRowEditor.tsx`(사전증여 행) + 헬퍼

---

## 0. 디자인 원칙

- 엔진 산식 변경 0. Heir.isForProfit 타입 1개 + 순수 헬퍼 2종 + UI 재구성.
- 영리법인 토글·CorporateGiftFields **폐지** → Step1 영리법인 체크로 이전.
- 수증인 = Step1 heirs 전체 드롭다운(영리법인 포함). 자연인·영리법인 동일 UX.
- 기납부 증여세 자동계산(수정 가능) — userTouchedTax 단일 플래그(자연인·영리법인 공통).
- 부표1 메타 = 기본 접힘(print 자동 펼침).

---

## 1. 사용자 시나리오

### S1 — 배우자 사전증여 (자동계산 핵심)
1. 사전증여 행 → 증여일 2022-6-10
2. 수증자 드롭다운 "배우자 (김마누라)" 선택 → ④ 요약 "배우자·상속인·§13①1호 10년"
3. 증여재산가액 760,000,000 입력
4. → **기납부 증여세 자동 22,000,000** 표시 + "🧮 자동계산 (수정 가능)" 배지
5. (선택) 사용자가 20,000,000으로 수정 → 배지 사라지고 20m 고정

### S2 — 영리법인 사전증여 (토글 폐지·드롭다운 통일)
1. 증여일 2021-8-10
2. 수증자 드롭다운 "영리법인 (M주식회사)" 선택 (Step1에서 법인+영리 체크된 Heir)
3. 증여재산가액 700,000,000 입력
4. → "§3의2② 산출세액 상당액 (자동·수정 가능)" **150,000,000** 자동 (corporateGiftComputedTax)
5. 기납부 증여세는 0(§4의2③) — 별도 표시 안 함. 과세표준 입력란 없음(엔진 자동)

### S3 — Step1 영리법인 여부 체크
1. Step1 상속인 구성 → "법인" relation 선택
2. → "영리법인 여부" 체크박스 노출 (기본 ON=영리)
3. 체크 해제 시 비영리법인 → 사전증여에서 §3의2② 미적용(legatee 동등)

### S4 — 자녀 사전증여
1. 수증자 "자녀(홍맏아들)" → 가액 500m → 자동 (500m−5천만)×§56 = 80,000,000

### S5 — 수증자 미선택 + 관계 수동 (P6)
1. 수증자 "선택 안 함" → ⑤ isHeir 토글 + ⑥ 관계 select "기타친족"
2. 가액 300m → 경로2 자동 (300m−1천만)×§56 = 48,000,000

### S6 — 부표1 접힘
1. 기본: "▸ 신고서 부표1 표시 (선택 입력)" 닫힘
2. 클릭 펼침 → 재산종류코드·자산명칭·소재지 입력
3. print 시 자동 펼침

### S7 — 회귀: 영리법인 토글 부재
1. 사전증여 행에 "수증인 = 영리법인" 토글 **없음** (폐지 확인)

---

## 2. UI 위젯 명세

### 2-1. `HeirComposition.tsx` — corporate Heir "영리법인 여부" 체크 (S3)

`CorporateHeirFields`(`:189`, props `{ heir, set }`) **상단**(부표5 영리법인 명세 위)에 신규 — "영리법인 여부 → ON이면 부표5 명세" 흐름. `set`은 `HeirEditor.set`(`:83 (patch)=>onUpdate({...heir,...patch})`)이 CorporateHeirFields로 전달됨.
```tsx
// CorporateHeirFields 내부 최상단 (부표5 명세 카드 앞)
<ToggleCard
  tone="violet"
  size="sm"
  title="영리법인 여부"
  description="ON: 영리법인 (§3의2② 면제·산출세액 상당액 자동) / OFF: 비영리법인"
  checked={heir.isForProfit !== false}        /* 기본 ON(=영리, 기존 호환) */
  onCheckedChange={(v) => set({ isForProfit: v ? undefined : false })}
  data-testid="heir-is-for-profit"
/>
```
> `isForProfit !== false`로 표시: undefined(기존)·true → ON. `false`만 OFF. 기존 sessionStorage corporate Heir(isForProfit 없음) → ON 표시(영리, 기존 동작 보존).
> ⚠️ OFF(비영리) 시 부표5(영리법인 면제 명세)는 의미 없으므로 `isForProfit !== false`일 때만 부표5 명세 렌더(또는 안내). D 단계 확인.

### 2-2. `GiftRowEditor.tsx` — 영리법인 토글·CorporateGiftFields 제거 (S2·S7)

- "수증인 = 영리법인" ToggleCard(`185~196`) **삭제**.
- `import CorporateGiftFields` + 렌더 **삭제** → 파일 삭제.
- `handleCorporateToggle`·`prevRef`·`isCorporate` **삭제**.
- `isCorporate` 의존 가드 전부 제거 → 모든 수증자가 드롭다운 경로.

### 2-3. 수증자 드롭다운 — corporate 포함 (Phase 1 제외 해제)

```tsx
{showIsHeir && (heirs ?? []).length > 0 && (() => {
  const matchedHeir = (heirs ?? []).find((h) => h.id === gift.doneeId);
  return (
    <select data-testid="gift-donee-select" value={matchedHeir ? gift.doneeId : ""}
            onChange={(e) => handleDoneeSelect(e.target.value)}>
      <option value="">선택 안 함 (인별 배부 생략)</option>
      {(heirs ?? []).map((h) => (        /* corporate 포함 — filter 제거 */
        <option key={h.id} value={h.id}>
          {heirOptionLabel(h)}            /* 영리법인/비영리법인/배우자/… */
        </option>
      ))}
    </select>
  );
})()}
```
- `heirOptionLabel(h)`: corporate면 `isForProfit===false ? "비영리법인" : "영리법인"` + name, 그 외 HEIR_RELATION_LABEL + 비상속인 표기.
- ④ 요약 배지: corporate → "영리법인 (M주식회사) · 비상속인 · §13①2호 5년 합산".

### 2-4. handleDoneeSelect — 4필드 + 자동계산 라우팅 단일 set (S1·S2·S4)

```tsx
function handleDoneeSelect(heirId: string) {
  if (!heirId) { set({ doneeId: undefined }); return; }
  const heir = (heirs ?? []).find((h) => h.id === heirId);
  if (!heir) { set({ doneeId: heirId }); return; }
  const corePatch: Partial<PriorGift> = {
    doneeId: heirId,
    isHeir: deriveIsHeirFromHeir(heir),
    beneficiaryType: deriveBeneficiaryTypeFromHeir(heir),
    doneeRelation: deriveDoneeRelationFromHeir(heir.relation),
  };
  const merged = { ...gift, ...corePatch };
  set({ ...corePatch, ...computeTaxPatch(merged) });   // 단일 set (4필드 + 세액, mirror)
}
```
> `computeTaxPatch`(2-5)는 `userTouchedTax` 미터치 시 세액 라우팅 patch 반환, 터치 시 `{}`(보호). 한 번의 `set`으로 corePatch + 세액 동시 반영 → useEffect 미러링 금지 준수.

### 2-5. applyAutoTax — 자동계산 적용 (mirror, S1·S2·D1)

```tsx
// userTouchedTax: useRef<boolean> (카드-local). 세액 입력란 수동 수정 시 true.
function computeTaxPatch(next: PriorGift): Partial<PriorGift> {
  if (userTouchedTax.current) return {};                  // 사용자 수정 보호
  const tax = autoComputePriorGiftTax(next.giftAmount ?? 0, next.doneeRelation);
  if (next.beneficiaryType === "corporate")
    return { corporateGiftComputedTax: tax, giftTaxPaid: 0, giftTaxBase: undefined };
  return { giftTaxPaid: tax };
}
```
- handleDoneeSelect·giftAmount onChange·doneeRelation 수동 변경 시 `set({ ...patch, ...computeTaxPatch(merged) })`.
- 세액 입력란 onChange: `userTouchedTax.current = true; set({ [field]: v })`.

### 2-6. 세액 입력란 라벨 전환 (S1·S2·D1)

```tsx
<CurrencyInput
  label={isCorporateDonee ? "§3의2② 산출세액 상당액 (자동·수정 가능)" : "기납부 증여세 (자동·수정 가능)"}
  value={isCorporateDonee ? gift.corporateGiftComputedTax : gift.giftTaxPaid}
  onChange={(v) => { userTouchedTax.current = true; set(isCorporateDonee ? { corporateGiftComputedTax: parseAmount(v) } : { giftTaxPaid: parseAmount(v) }); }}
  hint={isCorporateDonee ? "§3의2② 면제 한도 분자 (자동계산). 영리법인 증여세는 비과세(§4의2③)." : "§28 증여세액공제 계산 (자동계산·수정 가능)."}
/>
{!userTouchedTax.current && (자동값 > 0) && <배지>🧮 자동계산 (수정 가능)</배지>}
```
- `isCorporateDonee = matchedHeir?.relation === "corporate" && matchedHeir.isForProfit !== false`.

### 2-7. 부표1 기본 접힘 (S6)

```tsx
const [besshiOpen, setBesshiOpen] = useState(false);
<button type="button" onClick={() => setBesshiOpen(o => !o)} className="print:hidden ...">
  ▸ 신고서 부표1 표시 (선택 입력) {besshiOpen ? "▲" : "▼"}
</button>
<div className={besshiOpen ? "block" : "hidden print:block"}>
  {/* 기존 재산종류코드·자산명칭·소재지 입력란 그대로 */}
</div>
```
- [[print-only-css-toggle]] — print 자동 펼침.

---

## 3. 14 동기화 지점 매트릭스

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `Heir.isForProfit` | ★ 타입 추가 |
| ② initial | corporate Heir | isForProfit 기본 undefined(=영리) |
| ③ normalize | — | 무영향(optional) |
| ④ API 변환 | callInheritanceTaxAPI | heirs 그대로(isForProfit 포함) |
| ⑤ UI 위젯 | HeirComposition·GiftRowEditor | ★ 핵심(2-1~2-7) |
| ⑥ 사이드바 | — | 무영향 |
| ⑦ 결과 카드 | ⑩a/b/c 비영리 안내 배지 | A2 |
| ⑧ validation | — | 무영향 |
| ⑫ Zod | heirSchema isForProfit | ★ 추가 |
| ⑨⑩⑪⑬⑭ | — | 무영향 |

---

## 4. 케이스 매트릭스 (입력 분기 전수)

| # | 수증자 | isForProfit | 세액 라벨 | 자동값 | testid |
|---|---|---|---|---|---|
| U1 | 배우자 | — | 기납부 증여세 | 22,000,000 | gift-donee-select·gift-donee-summary |
| U2 | 영리법인 | ON/미설정 | §3의2② 산출세액 상당액 | 150,000,000 | (corporate option) |
| U3 | 비영리법인 | OFF | 기납부 증여세 | 150,000,000 | heir-is-for-profit |
| U4 | 자녀 | — | 기납부 증여세 | 80,000,000 | — |
| U5 | 미선택+기타친족 수동 | — | 기납부 증여세 | 48,000,000 | gift-donee-select |
| U6 | 자동값 수정(자연인) | — | — | 사용자값 고정 | — |
| U7 | 자동값 수정(영리법인) | ON | — | 사용자값 고정(공유 플래그) | — |
| U8 | 부표1 펼침 | — | — | — | 부표1 토글 |
| U9 | 영리법인 토글 부재 | — | — | — | queryByText("수증인 = 영리법인")=null |

---

## 5. 접근성·UX

- 영리법인 여부 ToggleCard: violet tone, OFF도 tone 유지(토글 가시성 원칙).
- 세액 입력란 라벨 동적 전환 — aria-label 동기화.
- 자동계산 배지: 수정 시 제거(사용자 인지).
- 부표1 접힘 버튼: print:hidden, 내용 hidden print:block.
- SelectOnFocusProvider 전역 — 개별 onFocus 불필요.

---

## 6. anchor (디자인 A1~A10 + UI 위젯)

| anchor | 대상 | 검증 |
|---|---|---|
| A1·A2 | autoComputePriorGiftTax | P1 22m·P3 150m (이미지) |
| A3·A4·A9 | autoComputePriorGiftTax | P2/P5/P6/P8 + §55 단서 |
| A5 | deriveBeneficiaryTypeFromHeir | 영리/비영리 분기 |
| A6·A7 | 라우팅 | corporate/자연인 |
| A8·A10 | mirror | 자연인·영리법인 userTouchedTax 공유 |
| U2 | corporate 드롭다운 옵션 | 영리법인 select 노출 |
| U9 | 토글 폐지 | "수증인 = 영리법인" 부재 |
| U8 | 부표1 | 기본 닫힘·펼침 |
| heir-is-for-profit | HeirComposition | 영리법인 체크 |
