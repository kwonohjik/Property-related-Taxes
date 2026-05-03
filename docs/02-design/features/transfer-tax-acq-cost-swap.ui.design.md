# 양도세 §97② 단서 swap — UI 통합 설계

## Context

엔진 PR(`transfer-tax-acq-cost-swap.engine.design.md`)에서 `capitalExpenditure` + `transferExpense` 분리 입력 + swap 발동 로직 완성. UI도 단일 `directExpenses` → 두 필드 분리 입력으로 전환하고, 결과 화면에 swap 발동 여부·비교 산식 노출.

## 8개 동기화 지점 사전 명세

| # | 지점 | 위치 | 변경 내용 |
|---|------|------|----------|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts` `AssetForm` | `capitalExpenditure: string`·`transferExpense: string` 추가, `directExpenses` deprecated 표시(읽기 호환) |
| ② | initial value | 같은 파일 `createInitialAssetForm` | 두 신규 필드 `"0"` 초기화 |
| ③ | normalize fallback | 같은 파일 `normalizeAsset` | sessionStorage 마이그레이션 — 신규 필드 미존재 시 `"0"` 채움. legacy `directExpenses`만 있는 자산은 기존 필드 유지(엔진은 합산으로 처리). |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` | 자산-수준 두 필드 → 엔진 input의 `capitalExpenditure`·`transferExpense`. 두 필드 합 = 0 + legacy `directExpenses` > 0 → `expenses` legacy로 전송 (backward-compat) |
| ⑤ | UI 입력 위젯 | `components/calc/transfer/AssetForm.tsx` (또는 자산 카드 내 필요경비 섹션) | 단일 입력 → 2-필드 카드. 라벨: "자본적 지출액 (§97① 가목)" / "양도비 (§97① 나목)". `LawArticleModal` 배지 |
| ⑥ | 사이드바 합계 | `lib/stores/calc-wizard-store.ts` `computeTransferSummary` | 자산별 (capExp + transferExpense) 합산. 미입력 자산은 `directExpenses` 사용 (호환) |
| ⑦ | 결과 카드 산식 | `components/calc/results/TransferTaxResultView.tsx` + 양도차익 카드 | swap 발동 시 별도 노출 — "필요경비 swap 적용 (§97② 단서) — 환산+개산 ₩X < 자본+양도비 ₩Y → 자본+양도비 ₩Y 적용" |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | 두 필드 음수 차단, 환산 모드에서 두 필드가 모두 입력 안 됐을 때 경고(swap 비활성 안내), 경고는 차단 아닌 정보성 |

## 정책 준수

- **(a) useEffect→store 미러링 금지**: 두 필드는 사용자 직접 입력. legacy `directExpenses` ↔ 신규 두 필드 동기화 없음(별도 필드로 공존).
- **(b) 자동 안분 fallback 금지**: 단일 expenses 값을 자본/양도비로 자동 분배 금지. 사용자가 빈값으로 두면 두 필드 0 → swap 비활성.
- **(c) validation 동기화 ⑧**: API에서 자산-수준 두 필드 미입력 시 legacy `directExpenses`로 fallback하므로 validate에서도 두 가지 fallback 모두 통과 인정.

## 작업 범위

### 본 PR (UI)
- 8개 동기화 지점 일괄 적용 (위 표대로)
- 기존 `directExpenses` 필드 유지 (다건 양도·multi-parcel UI 일관성을 위해 deprecated 마킹만)

### 별도 PR (multi-parcel UI)
- `ParcelFormItem.expenses` → 두 필드 분리는 다음 PR (multi-parcel은 단건 모드와 별개 UI 흐름)

## 케이스 인벤토리 (UI 시나리오)

| # | 시나리오 | 화면 동작 |
|---|---------|----------|
| 1 | 환산 모드 + 두 필드 입력 + swap 발동 | 결과 카드에 "필요경비 swap (§97② 단서)" 강조 카드 노출 |
| 2 | 환산 모드 + 두 필드 입력 + swap 미발동 | 결과 카드에 "swap 비교: 본문 적용" 정보 카드 (작게) |
| 3 | 환산 모드 + 두 필드 미입력 (legacy) | swap 비교 노출 안 함, 본문(개산공제만) 적용 |
| 4 | 실가 모드 + 두 필드 입력 | swap 무관, 자본+양도비 직접 차감 노출 |
| 5 | 토지/건물 분리 + 자산별 입력 | 자산별 swap 결과 표시 (토지·건물 각 라인) |

## Verification

- `npm run typecheck` 통과
- 양도세 마법사에서 두 필드 분리 입력 가능
- 환산 모드에서 자본+양도비 합 > 환산+개산 시 결과 화면에 swap 카드 노출
- legacy `directExpenses`만 있는 sessionStorage 데이터도 정상 로드 (normalize fallback)
