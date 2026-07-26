# 임대 구분 등록시기별 활성 판정 — UI 설계

> 계획서: `transfer-rental-category-availability-by-reg-date.plan.md`. 엔진: 동명 `.engine.design.md`.
> 대상 컴포넌트: `components/calc/transfer/RentalUnitCard.tsx`(§155⑳ 임대주택 1호 카드).
> 신규 엔진 타입 없음 → **8 클라이언트 동기화 지점 중 ⑤(위젯)만 실질 변경**.

## 사용자 시나리오

| # | 상황 | 기대 UI |
|---|------|--------|
| S1 | 등록일 미입력(초기) | 5개 유형 전부 활성. 사유 캡션 없음. |
| S2 | 세무서 2009-08-12·지자체 2009-08-31 입력 (화면 케이스) | `단기 6년`·`기존사업자(나목)` 회색(disabled)·클릭 불가. `장기일반`·`미분양(라목)`·`구 임대주택법` 활성. 하단 사유 캡션 2줄. |
| S3 | `단기 6년` 선택 상태에서 2009 날짜 입력 | **auto-reset** → 선택이 `장기일반`으로 복원. `단기 6년`은 회색. |
| S4 | 이력/마이그레이션으로 `단기 6년`+2009 날짜가 **로드된 채 mount** | `단기 6년` 라디오는 **회색 아님**(선택-제외 가드) + checked 유지 + 사유 캡션 노출 → limbo 없음. 사용자가 다른 유형 클릭 or 날짜 변경 시 정상화. |
| S5 | 날짜를 2026-07-01 등으로 변경 | `단기 6년` 활성화(effTs ≥ 2025-06-04). `기존사업자(나목)`은 여전히 회색(biz > 2003-10-29). |

---

## 위젯 배치 (변경 없음 — 기존 "임대 구분" FieldCard 내부)

RentalUnitCard.tsx:159-183 "임대 구분" `FieldCard` + `RadioCardGroup layout="inline"` 유지. **옵션 배열만 파생 매핑으로 교체** + 사유 캡션 추가.

```
┌ 임대 구분 * ────────────────────────────────────────────────┐
│  ○ 장기일반   ⊘ 단기 6년   ⊘ 기존사업자(나목)   ○ 미분양(라목) │   ⊘ = disabled(회색)
│  ○ 구 임대주택법                                              │
│  ※ 단기 6년(아·자목)은 2025.6.4 이후 등록분만 해당합니다.       │ ← text-caption muted, 사유별 개별 <p>
│  ※ 기존사업자(나목)는 세무서 사업자등록 2003.10.29 이전…       │
└──────────────────────────────────────────────────────────────┘
```

- 회색 처리는 `RadioCardGroup`의 기존 `opt.disabled`(→ `opacity-60 cursor-not-allowed` + `input disabled`, RadioCardGroup.tsx:181-192) 재사용 — 신규 스타일 없음.
- 사유 캡션 클래스 = 기존 카드 캡션과 동일 `text-caption text-muted-foreground`(RentalUnitCard.tsx:140·382 선례) · 컨테이너 `px-1 space-y-0.5`.
- **판정배지(ToneCard, :186-210)와 중복 아님**: 배지는 "선택된 유형의 도출 목·의무기간·cap" 요약, 캡션은 "왜 특정 유형이 비활성인가"의 사전 안내 — 역할 분리.

---

## 상태·바인딩

```tsx
// ⑤ 파생 (표시 전용 useMemo — store 미러링 금지)
const categoryAvail = useMemo(
  () => deriveCategoryAvailability(
    unit.businessRegistrationDate ? new Date(unit.businessRegistrationDate) : null,
    unit.rentalRegistrationDate ? new Date(unit.rentalRegistrationDate) : null,
  ),
  [unit.businessRegistrationDate, unit.rentalRegistrationDate],
);

// disabled = !available && 현재선택 아님 (mount-limbo 가드)
options={CATEGORY_OPTS.map((o) => ({
  value: o.value, label: o.label,
  testId: `rental-category-${o.value}-${index}`,
  disabled: !categoryAvail[o.value].available && o.value !== unit.rentalCategory,
}))}
```

- 기존 `onChange`(나·라목 매입 고정 로직, :173-181) **그대로 유지** — 옵션 배열 교체가 onChange에 영향 없음.
- `CATEGORY_OPTS` `as const`의 `value` 리터럴은 `RadioCardGroup<T>` 제네릭에 `RentalCategory` 유니온으로 정상 추론(기존 inline 배열과 동일 패턴). 구현 시 `tsc` 경고가 나면 `value: o.value as RentalCategory` 명시(무해·현재는 불필요 예상).
- **auto-reset**: 두 DateInput `onChange`(:125·133)를 `setRegDate(...)` 래퍼로 교체 — 무효화된 rentalCategory만 `long_general`로 복원(§4-3 계획, onChange 이벤트 구동·useEffect 아님).

---

## 8 클라이언트 동기화 지점

| # | 지점 | 변경 | 내용 |
|---|------|------|------|
| ① | 폼 타입 | 무 | `rentalCategory` 유니온·등록일 2필드 기존 그대로 |
| ② | initial | 무 | `makeDefaultAsset` rentalUnit 기본 `long_general`(항상 활성) |
| ③ | normalize | 무 | 마이그레이션 stale 선택은 **가드+auto-reset**로 런타임 흡수(데이터 무변경 → reload 결과 일관) |
| ④ | API 변환 | 무 | rentalCategory 그대로 전달 |
| ⑤ | **UI 위젯** | **변경** | 파생 disabled·testId·사유 캡션 + `setRegDate` auto-reset |
| ⑥ | 사이드바 합계 | 무 | 임대 특례는 합계 항목 아님 |
| ⑦ | 결과 카드 | 무 | REG_DATE_GATE failReason은 엔진이 기존대로 결과에 표시 |
| ⑧ | validation | 무 | `transfer-tax-validate-rental-exception.ts`는 필드존재만 검사(REG_DATE_GATE 미차단) → UI disabling과 층 분리·충돌 불가. auto-reset로 선택은 항상 유효 유형 → article 분기 정합 |

**⑨~⑭(API/Route)**: 신규 엔진 타입 없음 → 전부 N/A.

---

## testid·검증

- 옵션 라디오: `data-testid="rental-category-{value}-{index}"` (신규 — 기존 옵션엔 testid 전무했음).
- 판정배지: `rental-verdict-badge-{index}`(기존, :187) 유지.
- 검증(계획 §6): auto-reset 단언(S3) + mount-limbo 가드 단언(S4) + 경계 포함/인접 단위 테스트. 브라우저 확인은 Playwright E2E(`feedback_browser_verify_with_playwright`).

---

## 공용 컴포넌트·정책 준수

- `RadioCardGroup`(native radio 금지)·`FieldCard`·`DateInput` 기존 사용 유지 — 신규 위젯 0.
- 색상 톤 `emerald`(임대 카드) 유지 — 인라인 하드코딩 없음.
- 라벨 타이포: 사유 캡션 `text-caption`(11px, 오프스케일 정본) — 임의 px 금지(pre-push 게이트).
- `useEffect → store` 미러링 0(auto-reset은 onChange·categoryAvail은 useMemo 표시전용).
