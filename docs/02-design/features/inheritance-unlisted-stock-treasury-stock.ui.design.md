# 비상장주식 자기주식 보유 평가 — UI 설계 (UI Design)

> Feature: `inheritance-unlisted-stock-treasury-stock`
> Plan / Engine: [`*.plan.md`](./inheritance-unlisted-stock-treasury-stock.plan.md) · [`*.engine.design.md`](./inheritance-unlisted-stock-treasury-stock.engine.design.md)
> 디렉터리: `components/calc/inheritance/unlisted-stock-v2/`
> UI 표시 순서 = 계산 로직 순서. 모드 토글은 영향 필드 직전.

---

## 1. 입력 위젯 — `CorporateInfoSection.tsx`

발행주식총수 입력 **직후**(자기주식이 발행주식총수에 종속)에 배치.

```
┌─ 자기주식 보유 ───────────────────────────[ ToggleCard ⦿OFF ]─┐
│ 평가대상 법인이 자기주식을 보유한 경우 켜세요.                 │   (OFF=현행 동작, tone 유지)
└────────────────────────────────────────────────────────────────┘
   ▼ (ON일 때만 노출 — useMemo 파생, useEffect 미러링 금지)
┌─ 자기주식 정보 ────────────────────────────────────────────────┐
│  자기주식 수            [   6,000        ] 주                    │  CurrencyInput, onFocus 전체선택
│  hint: 평가기준일 현재 보유한 자기주식 수 (발행주식총수 이하)    │
│                                                                  │
│  보유 목적                                  [ RadioCardGroup ]   │
│   ◉ 일시보유목적   취득~평가시점 기업가치 변동분 반영(자기주식을 │
│                    1주당 평가액으로 재평가해 자산 가산)           │
│   ○ 소각·감자목적  발행주식총수에서 차감, 자산 미포함            │
│  (기본 선택 없음 — 명시 선택 강제)                               │
└────────────────────────────────────────────────────────────────┘
```

- 토글 OFF → `treasuryStock = undefined` (3-state). ON → `{ shares, purpose }` 객체 생성.
- `purpose` 기본값 **없음**(파생 금지) — 미선택 시 validation 차단.
- placeholder 숫자예시 금지 — 형식 설명은 `hint`.

---

## 2. 결과 카드 — `PerShareValuationResultCard.tsx`

자기주식 적용 시 ⑥ 산출 영역에 **목적별** 산식 블록 삽입. **result 필드만 표시 — 재계산 금지(dual-truth 회피).**

### 2-1. 일시보유 (예시값 = C-02; 80% 라인만 C-05)
```
③ 1주당 평가액 (자기주식 일시보유 — 자기참조 평가)               근거: 재재산-1494·자본거래-2616 [모달]
  ├ 자기주식을 1주당 평가액으로 재평가해 순자산에 가산
  ├ 1주당 순자산가치(자기주식 재평가 반영)  …………  74,347원   ← netAssetPerShare (self-ref ④)
  ├ 1주당 순손익가치 ……………………………………………  70,000원   ← netIncomePerShare ⑤
  ├ 가중평균(자기참조) → 1주당 평가액 …………………  71,739원   ← weightedAvgPerShare = finalPerShareValue ⑥
  └ [80% 하한 재계산 적용 시 — 별도 사례 C-05(p=0)]
     가중평균(26,086)이 순자산가치의 80% 미만 → 순자산가치를 80%
     자기참조로 재계산 → 1주당 평가액 …………………  57,142원   ← floor80NetAssetValue·finalPerShareValue
```
> ⚠️ 두 산식 라인은 동일 사례가 아님 — 상단 4줄은 C-02(71,739, 80% 미적용), 마지막 블록은 C-05(57,142, 80% 적용).
> 실제 렌더는 `treasuryStockApplied.floor80SelfReferentialApplied` 분기로 둘 중 하나만 표시.

### 2-2. 소각·감자 (C-04·C-08)
```
③ 1주당 평가액 (자기주식 소각·감자 — 발행주식총수 차감)          근거: 재산-240 [모달]
  ├ 발행주식총수에서 자기주식 차감: 30,000 − 6,000 = 24,000주     ← treasuryStockApplied.effectiveTotalShares
  ├ 1주당 순자산가치 ……………  75,000원
  ├ 1주당 순손익가치 ……………  70,000원
  └ 가중평균 → 1주당 평가액 …  72,000원
```

- 모든 수치는 `result` / `result.treasuryStockApplied` 필드 직접 표시. 산식은 한국어 풀어쓰기(약어·`floor()` 금지).
- 근거 해석례는 `LawArticleModal` 패턴 링크.

---

## 3. 8 클라이언트 동기화 지점

| 지점 | 파일/위치 | 내용 |
|---|---|---|
| ① 폼 상태 | unlisted-stock-v2 form data 타입 | `treasuryStock?: {shares,purpose}` |
| ② initial | 폼 factory | `treasuryStock: undefined` (보유 안 함) |
| ③ normalize | 폼 normalize | undefined 보존 (length>0 파생 금지) |
| ④ API 변환 | `lib/calc/*` 평가 입력 변환 | `treasuryStock` 그대로 전파 |
| ⑤ UI 위젯 | `CorporateInfoSection` (§1) | 토글 + CurrencyInput + RadioCardGroup |
| ⑥ 사이드바 합계 | 평가 단계 | 합계 영향 없음 (N/A) |
| ⑦ 결과 카드 | `PerShareValuationResultCard` (§2) | 목적별 산식 블록 |
| ⑧ validation | `validateStep` | 토글 ON: `shares>0` AND `purpose` 선택 AND `0<shares<totalShares`. 위반 시 차단(자동 fallback 금지) |

> ⑤ UI 통과 조건 ↔ ⑧ validation 차단 조건 **동일**(모순 금지). 토글 ON+미선택을 UI가 허용하면 validate도 동일 차단.

---

## 4. testid (E2E)

| 요소 | testid |
|---|---|
| 자기주식 보유 토글 | `treasury-stock-toggle` (role=switch — 메모리 e2e ToggleCard=switch) |
| 자기주식 수 입력 | `treasury-stock-shares` |
| 목적 라디오 (일시보유) | `treasury-purpose-temporary` |
| 목적 라디오 (소각·감자) | `treasury-purpose-cancellation` |
| 결과 자기주식 산식 블록 | `result-treasury-block` |

E2E: 토글 ON → 6,000 입력 → 일시보유 선택 → 계산 → `result-treasury-block`에 71,739 표시 확인 (메모리 `browser_verify_with_playwright` — 수동 안내 금지).

---

## 5. 3중 패턴 검증 (factory=normalize=UI)

| layer | 값 |
|---|---|
| factory(initial) | `treasuryStock: undefined` |
| normalize | undefined → undefined (그대로) |
| UI display | 토글 OFF = 미보유 표시 |

토글 ON 후 `purpose`는 **명시 선택 강제** — 3 layer 어디서도 기본값 파생 금지(메모리 `three_state_optional_mode_toggle`·`store_default_vs_ui_display_fallback`).
