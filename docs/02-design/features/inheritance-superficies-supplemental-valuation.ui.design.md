# 지상권(地上權) 보충적 평가 — UI 설계

> feature-id: `inheritance-superficies-supplemental-valuation`
> engine: [`inheritance-superficies-supplemental-valuation.engine.design.md`](./inheritance-superficies-supplemental-valuation.engine.design.md)
> 적용: 상속·증여 자산 카드 공통 (EstateItem 공유)

## 1. 진입점·dispatch

`AssetCategory`에 `superficies` 추가 → 자산 카드 종류 선택지에 "지상권" 노출.

| 위치 | 작업 |
|---|---|
| category→body 분기 (상위) | `superficies` → `<EstateBodySuperficies>` 분기 추가. ⚠️ **실제 dispatch 위치 Do에서 grep 확인** — `EstateBodySection.tsx`는 공용 래퍼(EstateBodySimple/Deposit/RealEstate 적용)이지 dispatch 아님. 분기는 상위 자산카드(EstateBodyRealEstate 인근 또는 카드 컨테이너) |
| `components/calc/inheritance/estate-card/variants/EstateBodySuperficies.tsx` | **신규** body 컴포넌트 (EstateBodySection 래퍼 재사용 가능) |
| `components/calc/inheritance/estate-card/variants/index.ts` | export 추가 |
| `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:35,47,57` | 라벨 맵(`superficies: "지상권"`) + 카테고리 배열에 추가 (UI 동기화 — TS 부분 미감지) |

## 2. 입력 위젯 레이아웃 (EstateBodySuperficies)

```
┌─ 지상권 평가 (상증법 §61③) ─────────────────────────────┐
│                                                          │
│ ① 지상권 설정 토지                                        │
│   [공시지가 LandPriceLookupField]  개별공시지가 자동조회   │
│   면적(㎡)            [DecimalInput            990.00]    │
│   → 토지가액 = 공시지가 × 면적 = 2,475,000,000 (자동표시)  │
│                                                          │
│ ② 존속기간                                                │
│   [ToggleCard] 존속기간 약정 여부   (ON: 약정 / OFF: 미약정)│
│   ┌ 약정 ON 시 ─────────────────┐                        │
│   │ 약정 존속기간(년) [숫자  40 ] │                        │
│   └──────────────────────────────┘                        │
│   [RadioCardGroup] 건물·공작물 종류                        │
│     ㉠ 견고건물·수목 (최단 30년)                           │
│     ㉡ 그 외 건물 (최단 15년)         ●                    │
│     ㉢ 공작물 (최단 5년)                                   │
│     종류 미정 (15년 간주)                                  │
│   설정일          [DateInput   2026-06-26]                │
│                                                          │
│ ③ 잔존연수                                                │
│   [숫자  15 ] 🔵자동   (← 자동 계산값, 수정 시 배지 제거)  │
│   ⓘ 민법 §280·§281: 약정 시 max(약정,최단), 미약정 시 최단 │
│      ㉠30 / ㉡15 / ㉢5년 · 설정일~평가기준일 절상           │
│                                                          │
│ ▸ 평가액 376,500,929 (자동, 엔진 result echo)             │
└──────────────────────────────────────────────────────────┘
```

## 3. 잔존연수 — 3중 패턴 (mirror-pattern 강제)

`useEffect → store` 미러링 **금지**. 자동값은 derive, override만 store.

```tsx
// 표시: useMemo derive (엔진 단일진실 헬퍼 import — dual-truth 금지)
const autoYears = useMemo(() => {
  if (!setDate || structureType == null) return undefined;
  return resolveSuperficiesTenureYears({
    agreed: !!superficiesAgreed,
    structureType,
    agreedYears: superficiesAgreedYears,
    setDate: parseISO(setDate),
    valuationDate: parseISO(deathDate ?? giftDate),   // 전역 평가기준일
  });
}, [setDate, structureType, superficiesAgreed, superficiesAgreedYears, deathDate, giftDate]);

const displayYears = superficiesRemainingYearsOverride ?? autoYears;   // override 우선
const isAuto = superficiesRemainingYearsOverride == null;
// 입력 onChange: setField("superficiesRemainingYearsOverride", v)  ← store엔 override만
// "자동" 배지: isAuto일 때만. 사용자 입력 시 자동 제거.
```

- **API 합성과 동일 헬퍼** (`resolveSuperficiesTenureYears`) → UI 표시 = 엔진 계산 일치(`buildInput`이 같은 헬퍼로 합성).
- override 비우면 자동값으로 복귀.

## 4. 결과 카드 (⑦)

`source-summary` breakdown 행 — 엔진 `breakdown: CalculationStep[]` 그대로 한국어 풀어쓰기 표시:

```
지상권 (상증법 §61③ 보충적 평가)
  지상권 설정 토지가액 (개별공시지가 × 면적)      2,475,000,000
  각 연도 수입금액 (토지가액 × 2%)                   49,500,000
  잔존연수 15년 · 할인율 10% 현재가치 환산 합계       376,500,929
  ─────────────────────────────────────────────
  평가액                                          376,500,929
```

- 금액 칸 `font-mono` + `tabular-nums` 우측정렬(amount-column-align).
- 산식은 변수 약어·`floor()` 금지 — 한국어 풀어쓰기(result_view_korean_formula).

## 5. 사이드바 (⑥) — echo만

- 엔진 result 도착 후 `resolveEngineValuatedAmount` 값 echo. **BigInt 환산 재계산 금지**(dual-truth — `tax-summary-sidebar-pattern`·`engine_result_display_drift`).
- 입력 도중(result 전)엔 미표시 또는 토지가액×참고 수준(금액 환산 재구현 금지). 0원 미표시 규칙.

## 6. Validation 안내 (⑧)

| 조건 | 안내 |
|---|---|
| 공시지가 ≤ 0 또는 면적 ≤ 0 | "지상권 설정 토지의 공시지가·면적을 입력하세요" (미입력 차단 — 자동 fallback 금지) |
| 설정일 미입력 | "지상권 설정일을 입력하세요" |
| 건물종류 미선택 | "건물·공작물 종류를 선택하세요" |
| 약정 ON + 약정기간 미입력 | "약정 존속기간(년)을 입력하세요" |
| 합성 잔존연수 = 0 (만료) | "지상권 존속기간이 만료되어 평가액이 0입니다" (경고 — UI 표시 0 허용, validate↔UI 모순 금지) |

## 7. testid (besshi-form-replica 동결 패턴)

`superficies-land-price` · `superficies-land-area` · `superficies-agreed-toggle` · `superficies-structure-radio` · `superficies-agreed-years` · `superficies-set-date` · `superficies-remaining-years` · `superficies-auto-badge` · `superficies-valuated-amount`.

## 8. 14 동기화 지점 — UI측 (①②⑤⑥⑦)

| # | 작업 | 파일 |
|---|---|---|
| ① 폼상태 | EstateItem 신규 필드 폼 바인딩 | EstateBodySuperficies |
| ② initial | 신규 필드 기본값(undefined) | estate-card factory + `types.ts` |
| ⑤ UI위젯 | §2 위젯 8종 | EstateBodySuperficies |
| ⑥ 사이드바 | echo만 | InheritanceSidebar |
| ⑦ 결과카드 | breakdown 표시 | source-summary |

> 엔진측(③④⑧⑨~⑭ + 6 Record)은 engine.design §6·§6-1 참조.

## 9. E2E (Playwright, 포트 3101)

`e2e/superficies-valuation.spec.ts`:
- 자산 종류 "지상권" 선택 → 공시지가 2,500,000·면적 990·미약정·㉡·설정일=상속개시일 입력
- 잔존연수 자동 "15" + "자동" 배지 확인
- 계산 → 결과 카드 평가액 **376,500,929** 확인
- override 20 입력 → 배지 사라짐 + 재계산 확인
