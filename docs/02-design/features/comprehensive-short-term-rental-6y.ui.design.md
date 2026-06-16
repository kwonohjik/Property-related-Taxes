# 종합부동산세 단기민간임대주택(6년형) 합산배제 — UI 설계

> 계획서: `comprehensive-short-term-rental-6y.plan.md` · 엔진설계: `comprehensive-short-term-rental-6y.engine.design.md`
> 동기화 지점 ⑤a(`PropertyListInput`)·⑤b(`ExclusionInfoInput`)·store(옵션값) · worktree E2E_PORT=3102

---

## 1. 사용자 시나리오

1. 주택 추가 → 공시가격·**전용면적(㎡)**·**수도권 여부**(`PropertyListInput.tsx:423·453`) 입력
2. 합산배제 유형 드롭다운(`:470`)에서 **"민간건설 단기민간임대 6년"** 또는 **"민간매입 단기민간임대 6년"** 선택
3. `ExclusionInfoInput` → `RentalExclusionDetail`: 등록유형(단기 자동 선택)·임대사업자 등록일·임대개시일·실제 경과연수(선택)·말소(선택) 입력
4. 계산 → 결과: 합산배제 건수·금액 반영. 경과연수 < 6년이면 "의무임대기간 확인 필요(6년)" 경고(`ComprehensiveTaxResultView:160-177`)

---

## 2. 위젯 변경

### 2.1 `EXCLUSION_TYPE_OPTIONS` (`PropertyListInput.tsx:35-50`) — 임대 그룹 끝(42행 뒤) 2종 추가
```ts
  ["private_short_term_rental_6y_construction", "민간건설 단기민간임대 6년 (시행령 §3①10호)"],
  ["private_short_term_rental_6y_purchase",     "민간매입 단기민간임대 6년 (시행령 §3①11호)"],
```

### 2.2 `RENTAL_REG_TYPE_OPTIONS` (`ExclusionInfoInput.tsx:27-34`) — 2종 추가
```ts
  ["private_short_term_6y_construction", "민간건설 단기민간임대 (6년)"],
  ["private_short_term_6y_purchase",     "민간매입 단기민간임대 (6년)"],
```

### 2.3 `RENTAL_EXCLUSION_TYPES` Set (`ExclusionInfoInput.tsx:37-44`) — `ExclusionType` 2종 추가
(임대 분기 진입 — 누락 시 RentalExclusionDetail 미렌더 → 침묵. §6 grep 대상)

---

## 3. 이중 선택 정합 (★ useEffect 미러링 금지 — memory `mirror-pattern`)

`exclusionType`(⑤a)와 `rentalRegistrationType`(⑤b)는 별도 드롭다운 → 불일치 가능. 정합 처리:

- **`exclusionType` onChange**(`PropertyListInput.tsx:471`)에서 단기 선택 시 `rentalRegistrationType`을 **같은 onChange로 직접 set**(useEffect 금지). 매핑은 **`toRegistrationType` 재사용**(엔진 §4.7 · memory `single-source-engine-helper` — 별도 매핑 정의 금지):
  ```ts
  // toRegistrationType이 comprehensive-api에 비공개면 공용 위치로 export 이동 후 import
  onChange={(e) => {
    const v = e.target.value;
    const isShort =
      v === "private_short_term_rental_6y_construction" ||
      v === "private_short_term_rental_6y_purchase";
    onUpdate(isShort
      ? { exclusionType: v, rentalRegistrationType: toRegistrationType(v) }
      : { exclusionType: v });
  }}
  ```
  단기 2종만 자동 set — **기존 6종은 현행 독립선택 동작 유지(회귀 0)**.
- 사용자가 `RentalExclusionDetail`에서 등록유형 수동 변경 시 그 값 우선(엔진은 `rentalRegistrationType` 사용). 자동 set은 **초기 선택 편의**용.

---

## 4. 안내 hint (`RentalExclusionDetail` — 등록유형 드롭다운 아래)

단기 선택 시 조건부 안내(`rentalRegistrationType`이 단기 2종일 때):

| 유형 | 안내 문구 |
|---|---|
| 건설(§3①10호) | "공시가격 **6억원 이하** · 전용 **149㎡ 이하** · **6년 이상** 임대 · 임대료 5% 초과 금지 · 2호 이상" |
| 매입(§3①11호) | "공시가격 **수도권 4억 / 비수도권 2억 이하** · **6년 이상** 임대 · 임대료 5% 금지 · ⚠️ **아파트 제외 · 조정대상지역 신규취득 제외**(자동판정 안 됨 — 직접 확인)" |

- 가격기준은 상단 **수도권 여부**(location)에 따라 자동 분기(매입). hint도 `property.location`에 따라 해당 금액(수도권 4억 / 비수도권 2억)을 강조. area·면적은 상단 전용면적 입력 사용 — RentalExclusionDetail에 면적/수도권 입력 신설 안 함.
- 아파트·조정대상지역 제외는 엔진 미판정(계획서 §10) → **안내문으로만** 보완.

---

## 5. ASCII 레이아웃

```
┌ 주택 N (PropertyListInput) ─────────────────────────┐
│ 공시가격 [____] 원   전용면적 [__] ㎡   수도권 [수도권▾]│
│ 합산배제 유형 [민간매입 단기민간임대 6년 (§3①11호) ▾]   │ ⑤a
└──────────────────────────────────────────────────────┘
┌ 합산배제 상세 (ExclusionInfoInput · 임대) ───────────┐
│ 임대등록 유형 [민간매입 단기민간임대 (6년) ▾]          │ ⑤b (자동매칭)
│ ⓘ 수도권 4억/비수도권 2억 이하·6년·아파트 제외…       │ hint
│ 임대사업자 등록일 [____]  임대개시일 [____]            │
│ 실제 임대 경과 연수 [__]년 (선택)                     │
│ [rose] 임대등록 말소  [violet] 최초 임대차 계약        │
└──────────────────────────────────────────────────────┘
```

---

## 6. 동기화 지점

| # | 파일:위치 | 변경 |
|---|---|---|
| ⑤a | `PropertyListInput.tsx:35` `EXCLUSION_TYPE_OPTIONS` | 2종 + onChange 자동매칭(§3) |
| ⑤b | `ExclusionInfoInput.tsx:27·37` | RENTAL_REG_TYPE_OPTIONS·RENTAL_EXCLUSION_TYPES 2종 + hint(§4) |
| ⑥ | 사이드바 | 무변경(합산배제는 과세표준 진입만) |
| ⑦ | `ComprehensiveTaxResultView` | 무변경(건수·금액·경고 자동) |
| store | `comprehensive-wizard-store.ts:34` | 옵션값만(필드 존재) |
| ⑧ | `lib/validators/comprehensive-input.ts`(Zod) | 합산배제는 **서버 Zod**가 검증(enum 2곳 추가로 통과). UI측 validate(`comprehensive-api.ts`)에 합산배제 유형 검증 없음 → 추가 작업 없음 |

---

## 7. E2E 시나리오 (`e2e/comprehensive-short-term-rental-6y.spec.ts`, E2E_PORT=3102)

1. 주택 1건: 공시 5억·면적 100㎡·수도권 → 유형 "민간건설 단기민간임대 6년" → 등록유형 자동 "민간건설 단기" 확인 → 계산 → 합산배제 1건·5억.
2. 공시 6.5억(가격초과) → 합산배제 0건(미배제).
3. 매입 단기·비수도권·공시 2.5억 → 미배제(비수도권 2억 초과).
4. 경과연수 4년 → 배제되나 "의무임대기간 확인 필요(6년)" 경고 표시.

---

## 8. STEP 13 검토 반영

(아래 자가 검토 표의 정정을 이 문서에 반영 — 완료 후 체크)
