# 다건 양도세 계산 이력 저장 누락 수정 — businessKey 다건 식별자 추가

> 작성일: 2026-07-06 · 대상: `lib/storage/business-key.ts` (+ 라벨 optional)
> 증상: "다건 양도 계산 결과를 확인했는데 계산 이력에 없다."

## 1. 배경·증상

사용자가 다건(multi) 양도 계산을 수행하고 결과까지 확인했으나, 계산 이력 목록에 별도 항목으로 나타나지 않는다. 조사 결과 **저장은 시도되지만 첫 번째 자산의 기존 단건 이력 record를 덮어쓰기(update)** 되어 신규 항목으로 남지 않는 것이 원인이다. (관찰 `3652` "multi 경로 저장소 dedup 갭 버그 S3"와 동일 사안)

## 2. 근본 원인 (코드 실증)

### 2.1 저장 자체는 정상 진입

- 다건도 `taxType: "transfer"`로 `useAutoSaveCalculation` → `saveOrUpdateByBusinessKey` 를 탄다.
  `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:352-362`
  (`inputData: { __multiTransfer: true, ...form }`, `resultData: AggregateTransferResult`)
- result가 비어있지 않아 skip guard도 통과. → 저장 로직에 도달함.

### 2.2 dedup 키에 다건 식별자가 없다 (진짜 결함)

`extractBusinessKey`의 transfer 분기 — `lib/storage/business-key.ts:37-50`

```ts
case "transfer": {
  const addr = extractAddress(inputData);
  const date = extractTransferDate(inputData);
  if (!addr && !date) return null;
  const suffix =
    inputData.amendmentMode === true
      ? inputData.correctionKind === "refund_claim" ? "|refund" : "|amend"
      : "";
  return `addr:${addr ?? ""}|${date ?? ""}${suffix}`;   // ← __multiTransfer 미반영
}
```

주소·양도일 추출 함수는 다건 폼의 **첫 번째 자산 내부까지 파고든다** — `lib/storage/title-generator.ts:42-47, 60-62`
- `extractAddress` → `properties[0].form.assets[0].addressRoad/Jibun`
- `extractTransferDate` → `properties[0].form.transferDate`

결과: 첫 자산이 주소 A·양도일 D인 다건 계산 → businessKey `addr:A|D`. 같은 물건 단건 record와 **바이트 단위 동일**.

### 2.3 동일 키 → 덮어쓰기

`saveOrUpdateByBusinessKey` — `lib/storage/calculation-repository.ts:216-236`.
동일 `businessKey`+`clientId` record 발견 시 신규 add 대신 **기존 record를 update**. 다건 결과가 단건 record 위에 덮어써져 별도 다건 항목이 생기지 않는다.

### 2.4 재현 조건 (흔한 정상 흐름에서 항상 발생)

지배적 워크플로가 정확히 이 함정을 밟는다: 단건 계산(→ `addr:A|D` 저장) → "이력에서 불러오기"로 `properties[0]` 적재 → 자산 추가 → 다건 계산 → businessKey `addr:A|D` 충돌 → 원본 단건 덮어씀.
(예외: `properties[0]`에 주소·양도일이 없으면 키 `null` → content-hash fallback으로 정상 신규 저장. 즉 첫 자산이 기존 transfer record와 매칭될 때만 증상 발생.)

## 3. 수정 방향

기존 `|amend`/`|refund` 접미가 수정신고·경정청구 record를 당초 record와 공존시키는 것과 **동일 패턴**으로, 다건에 `|multi` 접미를 추가한다. 마커 `__multiTransfer: true`는 이미 저장 input에 실려 있으나(현재 read 없음) 이 지점에서 활용한다.

### 3.1 접미 합성 (핵심)

다건 record도 `amendmentMode`를 가질 수 있으므로(`MultiTransferTaxCalculator.tsx:640`) 접미가 **합성**되어야 한다.

```ts
case "transfer": {
  const addr = extractAddress(inputData);
  const date = extractTransferDate(inputData);
  if (!addr && !date) return null;
  const multiSuffix = inputData.__multiTransfer === true ? "|multi" : "";
  const amendSuffix =
    inputData.amendmentMode === true
      ? inputData.correctionKind === "refund_claim" ? "|refund" : "|amend"
      : "";
  return `addr:${addr ?? ""}|${date ?? ""}${multiSuffix}${amendSuffix}`;
}
```

키 네임스페이스 (모두 distinct):

| record | businessKey |
|---|---|
| 단건 당초 | `addr:A\|D` |
| 단건 수정신고 | `addr:A\|D\|amend` |
| 단건 경정청구 | `addr:A\|D\|refund` |
| 다건 당초 | `addr:A\|D\|multi` |
| 다건 수정신고 | `addr:A\|D\|multi\|amend` |
| 다건 경정청구 | `addr:A\|D\|multi\|refund` |

### 3.2 라벨 (확정: 이번 범위 포함)

현재 다건도 저장 taxType이 `transfer`라 이력 카드 라벨이 "양도소득세"로 표시된다("(다건)" 배지 없음). `generateTitle` transfer 분기(`title-generator.ts:118-129`)에 `__multiTransfer === true`면 라벨을 `양도소득세 (다건)`로 붙여 목록에서 단건/다건을 구분한다.
- 수정신고·경정청구 라벨과 합성: 예) `양도소득세 (다건) 수정신고 — A (양도 D)`.
- 목록 카드 라벨은 `generateTitle` 결과를 쓰므로 이 한 곳 수정으로 반영됨.

## 4. 케이스 매트릭스

| # | 시나리오 | 기대 |
|---|---|---|
| C1 | 단건 A 계산 → 이력 1건(`addr:A\|D`) | 기존 동작 유지 |
| C2 | C1 후 같은 A·D 재계산 | 동일 키 update(중복 없음) — 유지 |
| C3 | 단건 A 저장 후, A 포함 다건 계산 | **다건이 신규 record(`addr:A\|D\|multi`)로 별도 저장, 단건 보존** ← 버그 수정 대상 |
| C4 | 다건(첫 자산 A·D) 재계산 | `addr:A\|D\|multi` 동일 키 update(중복 없음) |
| C5 | 다건 수정신고(첫 자산 A·D) | `addr:A\|D\|multi\|amend` — 다건 당초와 공존 |
| C6 | 다건 경정청구 | `addr:A\|D\|multi\|refund` — 공존 |
| C7 | 첫 자산 주소·양도일 미입력 다건 | 키 `null` → content-hash fallback(기존 동작 유지) |
| C8 | bundled(§166⑥) 다건 | (검증 필요) inputData가 `__multiTransfer` 마커·properties 구조를 갖는지 확인 후 C3 동일 취급 |

## 5. Pre-Do Anchor (Do 진입 전 우선 작성·실행)

> ⚠️ 날짜 포맷: `formatDate`(title-generator.ts:14)는 **점 구분** `YYYY.MM.DD` 반환. anchor 예상값은 `2024.05.01` 형식(하이픈 아님).
>
> 테스트 위치(기존 파일 확장 — 신규 파일 생성 금지):
> - 다건 키: **`__tests__/storage/multi-amendment-dedup.test.ts`** (M-A7 — 이미 존재)
> - 단건 회귀: **`__tests__/lib/storage/business-key-dedup.test.ts`** (B-1 — 이미 존재)

- **A1 (C3, 핵심 갭)**: `multi-amendment-dedup.test.ts`에 신규 it 추가 —
  다건 original 키(`{ __multiTransfer:true, properties:[{form:{assets:[{addressJibun:"강남1-1"}], transferDate:"2026-02-15"}]} }`)가
  **동일 물건 단건 키(`{ assets:[{addressJibun:"강남1-1"}], transferDate:"2026-02-15" }`)와 달라야 함**(`≠`). 수정 전 실패(현재 둘 다 `addr:강남1-1|2026.02.15`) 확인 → 이것이 진짜 버그.
  수정 후 다건 = `addr:강남1-1|2026.02.15|multi`, 단건 = `addr:강남1-1|2026.02.15`.
- **A2 (C5 회귀 유지)**: M-A7 기존 "3키 상이" 테스트가 `|multi` 추가 후에도 통과해야 함(다건 당초 `|multi` / 수정신고 `|multi|amend` / 경정청구 `|multi|refund` → set size 3 유지). 기존 assertion 무수정 통과 확인.
- **A3 (C1 단건 회귀)**: `business-key-dedup.test.ts` B-1 "양도: addr|양도일" (`{ assets:[{addressRoad:"서울로1"}], transferDate:"2024-05-01" }` → `"addr:서울로1|2024.05.01"`) 접미 없이 **무변경 통과** 확인. (단건은 `__multiTransfer` 부재 → `|multi` 미부여)

repository 레벨 통합 anchor 1건(C3: 단건 저장 → 같은 물건 다건 저장 후 `list()` count === 2)도 추가해 "덮어쓰기 안 함"을 실증. (`createCalculationRepository` + `fake-indexeddb` — 기존 `business-key-dedup.test.ts` B-2~B-6 패턴 차용)

## 6. 회귀 검증 게이트

- [ ] Pre-Do anchor A1 수정 전 실패 확보 → 수정 후 통과 (A2·A3는 무변경 통과 = 회귀 가드)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/storage/ __tests__/lib/storage/` 통과 (기존 amendment-dedup·correction-claim-dedup·multi-amendment-dedup·business-key-dedup 회귀 0)
- [ ] 기존 다건·bundled 신고서 양식 E2E 회귀 0 (`e2e/transfer-multi-filing-form.spec.ts` 등)
- [ ] 브라우저 수동: 단건 저장 → 같은 물건 포함 다건 계산 → `/history`에 **2건** 표시, 다건 카드 라벨 "양도소득세 (다건)" 확인

## 7. 열린 설계 판단 (사용자 확정 2026-07-06)

1. **라벨 "(다건)" 표시(§3.2)** — ✅ **포함 확정**. `generateTitle`에 `양도소득세 (다건)` 라벨 분기 추가.
2. **서로 다른 두 다건 신고서가 같은 첫 자산을 공유** (예: 다건#1=[A,B], 다건#2=[A,C]) — ✅ **수용 확정**. 둘 다 `addr:A|D|multi` 동일 키 → 뒤엣것이 앞엣것 update. 단건 "물건+양도일 1 record" 규약과 대칭. 전체 자산 해시 키(범위 확대)는 채택 안 함.
3. **C8 bundled 케이스** (미확정 — Do 착수 시 실측): bundled 진입 경로의 inputData가 `__multiTransfer` 마커와 `properties` 구조를 갖는지 grep 실측 후 확정. 미보유면 bundled는 기존 fallback 경로(회귀 0)이며 별도 처리 불요.

## 8. 예상 변경 규모

- `lib/storage/business-key.ts`: transfer 분기 접미 합성 `multiSuffix`+`amendSuffix` (3~5줄)
- `lib/storage/title-generator.ts`: 라벨 분기 `양도소득세 (다건)` (§3.2, 2~3줄)
- `__tests__/storage/multi-amendment-dedup.test.ts`: A1(다건≠단건) 신규 it + repository 통합 anchor
- `__tests__/lib/storage/business-key-dedup.test.ts`: A3 단건 회귀 가드는 기존 B-1으로 충족(무변경 통과 확인만)
- 단일 브랜치 1회 ship 예상.

## 9. 전환(transition) 노트

배포 이전에 이미 `addr:A|D`로 단건 record를 덮어쓴 다건 record는, 수정 후 재계산 시 `addr:A|D|multi` 신규 키로 별도 저장된다(구 record와 공존). 단, 수정 이전에 이미 소실된 단건 원본 데이터는 복구되지 않는다 — 이는 본 수정으로 인한 회귀가 아니라 기존 버그의 잔존 결과다. 마이그레이션 코드 불요(로컬 우선 저장 정책: 데이터 폐기 후 새로 시작).

## 10. 검토 로그 (2026-07-06 자가 재검토, 코드 실증)

- ✅ **근본 원인 견고**: 단건·다건 모두 `activeClientId` 동일(`TransferTaxCalculator.tsx:104` / `MultiTransferTaxCalculator.tsx:360`) → clientId 미차별 → businessKey 충돌 성립. 진단 유효.
- ✅ **마커 보존**: `useAutoSaveCalculation`이 `inputData`를 그대로 `saveOrUpdateByBusinessKey`에 전달(`use-auto-save-calculation.ts:95-104`), `__multiTransfer` strip 없음.
- 🔧 **E1 정정**: anchor 날짜 포맷 하이픈 → 점(`formatDate` = `YYYY.MM.DD`).
- 🔧 **E2 정정**: 테스트 경로 `__tests__/storage/`(다건)·`__tests__/lib/storage/`(단건·범용) 이원화 반영.
- 🔧 **O1 반영**: 기존 M-A7(`multi-amendment-dedup.test.ts`)이 다건 properties[] 추출·amend/refund 접미를 이미 검증. `|multi` 추가는 M-A7 "3키 상이"를 깨지 않음(set size 3 유지). anchor는 이 파일에 "다건≠단건" it 추가로 진짜 갭 커버.
- 🔧 **O2 반영**: 단건 회귀 가드(B-1) 명시.
- 🔧 **O3 반영**: 전환 노트(§9) 추가.
- ✅ **모순 없음**: 라벨 "(다건)" 기존 부재(중복 아님), transfer용 generateTitle 테스트 부재(회귀 대상 없음, stock-transfer title 테스트는 무관).
