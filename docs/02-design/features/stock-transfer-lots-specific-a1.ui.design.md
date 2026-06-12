# 취득 다건 + 양도 단건 개별법(specific) — UI 설계 (A-1)

> 엔진 설계: `stock-transfer-lots-specific-a1.engine.design.md` · 작성 2026-06-12

## 1. 사용자 시나리오

1. 취득가액 산정 "실가" + 취득가액 입력 "다건(lots)" + lotsMode "단건 양도" — 기존 흐름.
2. 산정방법 라디오에서 **개별법** 선택(기존 disabled 해제).
3. 각 매수 lot 카드에 "이 양도에 배정 수량" 입력란 노출 → 매도한 주식수를 lot별로 지정.
4. 상단 배너가 배정 합계 / 양도 주식수 일치 여부를 emerald(일치)·rose(불일치)로 표시.
5. 계산 → 결과는 fifo/moving_avg와 동일하게 `lotMatchingDetail` 기반(개별법 매칭 반영).

## 2. AcquisitionLotsMatrix 변경 (⑤)

### 2.1 산정방법 라디오
- specific 옵션 `disabled` 제거 · description "매수 lot별 매도 배정 수량을 직접 지정 (입증 가능 시)".
- FieldCard hint "개별법 선택 시 매수 lot별 배정 수량을 직접 지정".

### 2.2 매수 lot별 배정 입력 (specific 시)
```
┌─ 매수 #N ──────────────────────────────┐
│ 취득일 | 취득원인                        │
│ 주식수 | 1주당 단가                      │
│ 이 양도에 배정 수량 (DecimalInput) ←신규 │  // isSpecific 시에만
└────────────────────────────────────────┘
```
- `DecimalInput thousandSeparator` — 정수 주식수. select-on-focus는 전역 Provider 처리.
- 저장: `specificMatchings`에 `{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: lot.id, shareCount }` upsert. 빈값·0은 제거.
- lot 삭제 시 해당 배정 cascade 제거.

### 2.3 배정 합계 배너
```
[emerald 일치 / rose 불일치]
개별법: 각 매수 lot에 배정한 수량의 합계가 양도 주식수와 일치해야 합니다.
  배정 합계 {allocSum} / 양도 {transferShareCount}주
```

## 3. props 확장 (Step2 → Matrix)
| prop | 타입 | 출처 |
|---|---|---|
| `specificMatchings` | `SpecificMatchingForm[]` | `form.specificMatchings` |
| `onMatchingsChange` | `(m[]) => void` | `onChange({ specificMatchings })` |
| `transferShareCount` | `number` | `parseInt(form.shareCount)` |

## 4. 동기화 지점 (UI 측)
신규 입력 필드 0 — `specificMatchings` 기배선. 본 PR: ⑤ Matrix(활성·배정 입력·배너) + Step2 props. ⑦ 결과 카드 변경 0(기존 lotMatchingDetail 경로).

## 5. E2E — `e2e/stock-transfer-lots-specific.spec.ts` (신규)
| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | 실가·다건·개별법 선택 + 매수 2 lot 배정 + 계산 | 결과 `acquisitionPrice` = 매칭 합 |

- ToggleCard/라디오 클릭은 제목/라벨 텍스트 클릭. 포트 충돌 시 `E2E_PORT=3200`.

## 6. UI 자가 점검
- [ ] specific 비선택 시 배정 입력·배너 비노출 (fifo/moving_avg 동작 불변)
- [ ] 배정 합 = 양도 수량 시 emerald, 불일치 시 rose
- [ ] lot 삭제 시 배정 cascade 제거
- [ ] placeholder 숫자 예시 0건
