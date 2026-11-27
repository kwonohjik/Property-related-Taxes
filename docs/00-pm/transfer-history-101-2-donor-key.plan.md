# 양도세 이력 — §101② 증여자 기준 계산이 수증자 기준 이력을 덮어쓰는 결함

- 작성일: 2026-11-27 · 검증 깊이 **L2**(세액 불변 — 이력 저장 키·화면 표지만)
- 선행: §101② 판정 화면 #3684(`docs/00-pm/transfer-101-2-gift-resale.plan.md`)

## 1. 현상·원인 (실측)

- 같은 물건·같은 양도일로 ① 수증자 기준 → ② 증여자 기준을 차례로 계산하면 이력이 1건만 남고 ②로 바뀐다.
- `lib/storage/business-key.ts` `case "transfer"` 키 = `addr:{첫 자산 주소}|{양도일}` (+ `|multi`·`|amend`·`|refund`).
  취득원인·취득일·양도자는 키에 없다.
- `calculation-repository.ts` `saveOrUpdateByBusinessKey`는 같은 키가 있으면 `update`(새 record 없음).
- probe 실측: 두 입력 키 모두 `addr:서울특별시 종로구 세종대로 1|2026.04.05` → 두 번째 저장 `created:false`·같은 id → record 1건.

## 2. 결정 (사용자 선택 2026-11-27 — 안 1)

양도세 폼에 **증여자 기준 계산 표지** `giftResaleDonorBasis: boolean`(폼 전용·엔진 미전송)을 두고, 켜져 있으면 키 끝에 `|101-2-donor`를 붙인다.
수정신고 `|amend`와 같은 방식이다. 일반 계산의 «같은 물건은 1건» 동작은 그대로다.

기각한 안: 키에 취득일·취득원인 추가(취득일 수정마다 이력이 쌓이고 기존 키 재계산 필요) · 「새 이력으로 저장」 부활(의도적으로 제거된 기능).

## 3. 변경

| # | 위치 | 내용 |
|---|---|---|
| C-1 | `lib/stores/calc-wizard-form.types.ts` · `calc-wizard-store.ts` | ① 타입 · ② initial `false`. ③ normalize는 `migratePersistedTransferForm`의 default spread로 구 세션 `false` |
| C-2 | `lib/storage/business-key.ts` | 표지 true면 `|101-2-donor` (다건 접미 뒤·정정 접미 앞) |
| C-3 | `lib/storage/title-generator.ts` | 제목 라벨 «양도소득세 (증여자 기준)» — 이력 목록에서 구별 |
| C-4 | `lib/calc/gift-resale-101-2-donor-basis.ts` (신규) | 진입 쿼리 `basis=101-2-donor` 상수·판별 함수 |
| C-5 | `components/calc/gift-resale/Clause2Card.tsx` | «양도세 계산기로» 링크에 쿼리 추가 |
| C-6 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | `?new=1` 리셋 직후 쿼리가 있으면 표지 켬 · 첫 단계 상단에 토글(다건 편집 화면에서는 숨김 — 다건 키는 이 표지를 읽지 않는다) |

14 동기화 지점: 엔진 input 아님 → ④⑤…⑭ 중 해당은 ①②③⑤뿐. API body에 넣지 않는다(Zod가 어차피 strip).

정정(수정신고·경정청구) 진입은 `record.inputData`를 통째로 복사하므로 표지가 승계된다 → 증여자 기준 수정신고 키 `…|101-2-donor|amend`(수증자 기준 수정신고와 분리).

## 4. 범위 밖

- 다건(합산) 신고서의 증여자 기준 구분 — 다건 키는 `|multi`로 별도이고, §101② 판정은 자산 1건 단위다.
- 이미 덮어써진 과거 이력 복구 — 원본이 남아 있지 않다.
- 판정 화면 이력 불러오기 모달의 표지별 필터 — 두 이력이 공존하면 사용자가 제목으로 고른다.

## 5. 검증

- anchor: 수증자/증여자 키가 다르고, IndexedDB에 두 번 저장하면 record 2건 · 증여자 정정 키 분리 · 제목 라벨 · 진입 쿼리 판별.
- mutation: C-2 접미 제거 → anchor 실패 확인.
- 브라우저: 판정 화면 2호 링크 → 계산기 토글 켜짐 확인(Playwright).
