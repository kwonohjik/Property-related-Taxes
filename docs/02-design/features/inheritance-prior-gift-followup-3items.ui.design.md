# 상속세 사전증여 후속 3건 — UI 설계

> 계획서: `docs/00-pm/inheritance-prior-gift-followup-3items.plan.md`
> 엔진 설계: `docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 12

## Context

3개 항목의 UI 영향. **A=거의 무변경**(hint 보강·validation), **B=신규 토글+입력 위젯**(중심), **C=미성년 토글+결과 라벨**. 공통 진입: `components/calc/prior-gift/GiftRowEditor.tsx`(상속세 모드 `showIsHeir`).

---

## 항목별 UI 영향 요약

| 항목 | 14지점 핵심 | 신규 위젯 | 위험 |
|------|------------|----------|------|
| A | ⑤(hint)·⑧(validation 안내) | 없음 | 낮음 |
| B | ①②④⑤⑦⑧⑫ | 자동/직접 RadioCardGroup + giftTaxBase CurrencyInput | 낮음 |
| C | ①②④⑤⑦⑧⑨⑩⑫ | "증여 당시 미성년" ToggleCard(조건부) + 결과 §53 라벨 | 중 |

---

## A. per-donee 캡 — UI

- **⑤ hint 보강**: 기존 §53의2 입력 카드(`GiftRowEditor.tsx:350~`) hint에 "동일 수증자(수증자 선택)의 혼인·출산 증여는 합산 1억 한도" 추가.
- **⑧ validation 안내**: 동일 doneeId 합산 1억 초과 시 차단 아닌 **안내**(엔진이 캡으로 자동 처리, 납세자 안전). 수동 경로(doneeId 없는 다건)는 "동일 수증자는 수증자 선택으로 입력" sky 안내(MBC-07 한계).
- 위젯 신규 없음.

---

## B. 상속세 모드 giftTaxBase 직접 입력

### ① 폼 상태 (`components/calc/prior-gift/meta.ts` PriorGift 폼 타입)
- `priorGiftTaxBaseInputMode?: "auto" | "manual"` (per-gift, UI 메타). `makeEmptyGift`에 미설정(=auto).
- `giftTaxBase` 기존 필드 재사용.

### ② initial / ③ normalize
- `makeEmptyGift`: mode 미설정. `giftTaxBase` undefined.
- normalize: enum/number string round-trip 안전 → ③ 불요(Date 아님).

### ④ API 변환 (`inheritance-api.ts`)
- spread 유지(`preGiftsWithin10Years` 통째). manual 시 giftTaxBase 포함, auto 시 undefined(엔진 자동도출).
- `priorGiftTaxBaseInputMode`는 엔진 미사용 — 전달돼도 무해(엔진 무시) 또는 strip.

### ⑤ UI 위젯 (`GiftRowEditor.tsx` 상속세 모드, `showIsHeir`)
```
[과세표준 산정]  ← RadioCardGroup (emerald, inline)
 ( • ) 자동 도출 (§53 관계공제)      ← 기본
 (   ) 직접 입력 (증여세 신고서 과세표준)
    └ <CurrencyInput label="증여 과세표준 (giftTaxBase)" hint="증여세 신고서 과세표준 ⑤"/>
```
- manual 선택 시에만 CurrencyInput 노출. auto 시 §53 자동 안내 문구.
- **§53의2 카드 상호작용**: manual + giftTaxBase 입력 시 §53의2 위젯 자동 숨김(`GiftRowEditor.tsx:361` `gift.giftTaxBase != null` 이미 처리). auto 복귀 시 marriageBirthDeduction 보존(GTB-03).
- 위치: 수증자 select·관계 직후, giftAmount 다음 (계산 로직 순서 = §53 도출 직전).

### ⑥ 사이드바
- 해당 없음(사전증여는 사이드바 합계 미표시).

### ⑦ 결과 카드
- 사전증여 요약/부표1에 출처 라벨: "직접 입력 과세표준" vs "자동 도출(§53)".

### ⑧ validation (`inheritance-validate.ts` validatePriorGift)
- manual 모드인데 giftTaxBase 미입력·0 미만 → 검증 오류(빈값 차단, 자동 안분 금지 정책).
- auto 모드 → 검증 없음(엔진 도출).

### ⑫⑬⑭
- `giftTaxBase` strip 없음 확정(STEP 1). `priorGiftTaxBaseInputMode` UI 메타 → Zod optional 추가만(`prior-gift-schema.ts`), 엔진 매핑 불요.

---

## C. perspective 정정 — UI

### ① 폼 상태
- `doneeWasMinorAtGift?: boolean` (per-gift, birthDate 미입력 시 fallback). `makeEmptyGift` 미설정.

### ② initial / ③ normalize
- 미설정(undefined). boolean → ③ 불요.

### ④ API 변환
- spread 유지. `doneeWasMinorAtGift` 엔진 전달(perspective 미성년 분기용).
- **단 birthDate 우선**: API가 매칭 Heir.birthDate를 엔진에 전달하는 경로 확인(이미 heirs 전달) → 엔진이 birthDate+giftDate 도출. 토글은 birthDate 부재 시만.

### ⑤ UI 위젯 (`GiftRowEditor.tsx`)
- 자녀(doneeRelation=lineal_descendant) 수증 + **매칭 Heir.birthDate 미입력** 시에만 "증여 당시 미성년이었음" ToggleCard(amber) 노출.
- birthDate 있으면 토글 숨김(자동 도출) + "증여 당시 만 N세 (자동 판정)" 안내.

### ⑦ 결과 카드 (deduction-breakdown)
- **Check 환류 (2026-06-07)**: 당초 "§53 관계 라벨을 직계존속(미성년/성년)으로 갱신" 설계는 **DP-06(표시=피상속인 관점)과 충돌** — `PriorGiftSummaryTable`·부표1이 모두 doneeRelation을 "직계비속"으로 표시하는데 §53 관계만 수증자 관점으로 바꾸면 화면 내 불일치·혼선. **결정: 관계 표시 라벨은 피상속인 관점("직계비속") 그대로 유지**(전 화면 일관). 미성년 §53 2천 효과는 **giftTaxBase 값에 정확히 반영**(자동/직접 라벨 + 과세표준 숫자로 검증 가능). 별도 "§53 직계존속 미성년" 라벨은 v1 미추가(후속: 사전증여 §53 per-gift breakdown 카드 신설 시 표기).
- **표시 무변경 영역**: 신고서 부표1 `RELATION_LABEL[doneeRelation]`는 피상속인 관점 "직계비속" 유지(DP-06).

### ⑧ validation
- 토글은 boolean → 검증 불요. birthDate·토글 모두 없으면 성년(현행 동일, 회귀 0).

### ⑨⑩⑫⑬⑭
- `doneeWasMinorAtGift` Zod optional(`prior-gift-schema.ts` 메인+컴패니언). 엔진 input 매핑(⑭) — perspective 헬퍼 인자.
- **게이트 교체 (STEP 13 실측 정정)**: 직접 호출 2곳만 — ① `prior-gift-marriage-birth-rule.ts:48` `checkMarriageBirthGiftRule` 내부 predicate, ② `GiftRowEditor.tsx:351`. **Zod(`prior-gift-schema.ts`)·validate(`inheritance-validate.ts`)는 `checkMarriageBirthGiftRule` 경유 → ①의 predicate 정정 시 자동 전파**(별도 교체 불요). perspective 변환 + `isMarriageBirthEligibleRelation` 적용 후 grep 재확인.

---

## 위젯 ASCII (B 핵심)

```
┌─ 사전증여 #1 ──────────────────────────────┐
│ 증여일 [2020-03-15]   증여재산가액 [1.5억]   │
│ 수증자 [장남 ▼]  (직계비속·상속인)           │
│ ┌ 과세표준 산정 (emerald) ────────────────┐ │
│ │ (•) 자동 도출 (§53)   ( ) 직접 입력      │ │
│ └──────────────────────────────────────┘ │
│   ※ 직접 입력 선택 시:                       │
│   증여 과세표준 [_______] (신고서 ⑤)         │
│ ┌ §53의2 혼인·출산 (sky) ─────────────────┐ │
│ │ 적용액 [______] (합산 최대 1억)          │ │  ← giftTaxBase 입력 시 숨김
│ └──────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 14지점 동기화 체크 (Do 완료 전)

- [ ] ① 폼 상태: `priorGiftTaxBaseInputMode`(B)·`doneeWasMinorAtGift`(C) — `meta.ts`
- [ ] ② initial: `makeEmptyGift` 미설정
- [ ] ③ normalize: boolean/enum → 불요(확인)
- [ ] ④ API: spread 유지 + C birthDate 전달 경로
- [ ] ⑤ 위젯: B RadioCardGroup+CurrencyInput, C 조건부 ToggleCard
- [ ] ⑥ 사이드바: 해당 없음
- [ ] ⑦ 결과: B 출처 라벨, C §53 관계 라벨(표시 부표1 불변)
- [ ] ⑧ validation: B manual 빈값 차단
- [ ] ⑨⑩ Zod enum: `priorGiftTaxBaseInputMode`·`doneeWasMinorAtGift` 메인+컴패니언
- [ ] ⑪ acqDate fallback: 해당 없음
- [ ] ⑫ Zod 입력 객체: `prior-gift-schema.ts` 2필드
- [ ] ⑬ body spread: spread 유지 확인
- [ ] ⑭ route 매핑: C `doneeWasMinorAtGift` 엔진 input 도달, B giftTaxBase 기존
- [ ] 게이트 교체 grep 전수(C)
- [ ] `npx tsc --noEmit` 0 + vitest inheritance + E2E

---

## UI 위험·중단 사전 적용 (memory `feedback_pdca_session_efficiency`)

- **800줄 (STEP 13 실측)**: `GiftRowEditor.tsx` = **646줄**. B+C 약 100줄 추가 시 초과 → **사전 sub-component 추출 계획**: `GiftTaxBaseModeBlock`(B 자동/직접 토글+입력), `MinorAtGiftToggleBlock`(C). 기존 §53의2 카드도 추출 후보. 외부 export 보존(memory `feedback_800line_split_export_preservation`).
- 14지점: ⑫⑬⑭ grep 자가 점검(신규 2 enum `priorGiftTaxBaseInputMode`·`doneeWasMinorAtGift`).
- **게이트 교체(C)**: 직접 2곳(`rule.ts:48` predicate·`GiftRowEditor:351`). Zod/validate 자동 전파(STEP 13). 누락 시 §53의2 동작 분기.

## tone 매핑 (STEP 13)

| 위젯 | tone | 근거 |
|------|------|------|
| B 과세표준 산정(자동/직접) RadioCardGroup | emerald | 확정·평가 정보 |
| B giftTaxBase CurrencyInput | (emerald 카드 내) | |
| C "증여 당시 미성년" ToggleCard | amber | 취득·분리 시점 정보 |
| A §53의2 적용액(기존) | sky | 일반 정보(기존 유지) |
