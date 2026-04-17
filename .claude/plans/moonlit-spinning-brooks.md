# Plan: 주소 상세주소 동/호수 드롭다운 추가

## Context

`AddressSearch` 컴포넌트에서 아파트 주소 선택 후 상세주소(동/호수) 입력 필드가 단순 텍스트 입력만 제공됨.
Vworld NED API를 통해 아파트 단지의 동/호수 목록을 조회할 수 있는 `/api/address/standard-price` 엔드포인트가 이미 구현되어 있으나, 프론트엔드와 연결되지 않은 상태.

## Goal

아파트 주소 선택 시 동/호수 드롭다운 자동 표시.
토지·단독주택은 기존 텍스트 입력 유지.

## Files to Modify

- `components/ui/address-search.tsx` — 주 변경 파일

## Implementation Plan

### 1. `AddressValue` 인터페이스에 `pnu` 추가 (옵션, 하위 호환)

```typescript
export interface AddressValue {
  road: string;
  jibun: string;
  building: string;
  detail: string;
  lng: string;
  lat: string;
  pnu?: string;  // 추가 — 호출부는 기존 satisfies 사용 그대로 유지
}
```

### 2. 내부 상태 추가

```typescript
const [selectedPnu, setSelectedPnu] = useState<string>("");
const [units, setUnits] = useState<UnitItem[]>([]);         // 동/호 목록
const [unitsLoading, setUnitsLoading] = useState(false);
const [selectedDong, setSelectedDong] = useState<string>("");
const [selectedHo, setSelectedHo] = useState<string>("");
```

`UnitItem` 타입:
```typescript
interface UnitItem {
  dong: string;
  ho: string;
  floor: string;
  exclusiveArea?: number;
  price: number;
  year: string;
}
```

### 3. `handleSelect` 수정

```typescript
function handleSelect(r: AddressResult) {
  setSelectedPnu(r.id);          // PNU 저장
  setSelectedDong("");            // 이전 선택 초기화
  setSelectedHo("");
  setUnits([]);
  onChange({ ...r값, pnu: r.id, detail: "" });
  fetchUnits(r.id);              // 비동기 동/호 목록 조회
}
```

### 4. `fetchUnits` 함수 구현

```typescript
async function fetchUnits(pnu: string) {
  setUnitsLoading(true);
  try {
    const res = await fetch(
      `/api/address/standard-price?pnu=${pnu}&propertyType=housing`
    );
    if (!res.ok) { setUnits([]); return; }
    const data = await res.json();
    setUnits(data.units ?? []);
  } catch {
    setUnits([]);
  } finally {
    setUnitsLoading(false);
  }
}
```

### 5. 상세주소 UI 조건부 렌더링

`hasSelected && units.length > 0` 일 때:
1. **동 드롭다운** — unique dong values 정렬 표시
   - 동이 1개만 있거나 빈 문자열이면 skip
2. **호 드롭다운** — selectedDong에 해당하는 ho 목록 표시
3. 선택 완료 시 `onChange({ ...value, detail: "{dong} {ho}".trim() })` 호출

`hasSelected && units.length === 0 && !unitsLoading` 일 때:
- 기존 텍스트 input 표시 (현재와 동일)

`unitsLoading` 중:
- "동/호수 조회 중..." 표시 (disabled 상태 input 또는 텍스트)

### 6. 드롭다운 구현 (shadcn/ui Select 사용)

```tsx
<select>  또는 shadcn <Select>
```

shadcn/ui `Select` 컴포넌트 사용:
- `@/components/ui/select` (이미 설치됨 여부 확인 필요, 없으면 `npx shadcn@latest add select`)

동 선택 드롭다운:
```tsx
<Select value={selectedDong} onValueChange={(v) => { setSelectedDong(v); setSelectedHo(""); }}>
  <SelectTrigger><SelectValue placeholder="동 선택" /></SelectTrigger>
  <SelectContent>
    {uniqueDongs.map(d => <SelectItem key={d} value={d}>{d || "단동"}</SelectItem>)}
  </SelectContent>
</Select>
```

호 선택 드롭다운:
```tsx
<Select value={selectedHo} onValueChange={(v) => {
  setSelectedHo(v);
  onChange({ ...value, detail: [selectedDong, v].filter(Boolean).join(" ") });
}}>
  ...
</Select>
```

### 7. `handleClear` 수정

```typescript
function handleClear() {
  // 기존 초기화
  setSelectedPnu("");
  setUnits([]);
  setSelectedDong("");
  setSelectedHo("");
  onChange({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" });
}
```

## UX 동작 흐름

```
1. 사용자: 주소 검색 → "기흥역 센트럴 푸르지오" 선택
2. handleSelect 호출 → PNU 저장, fetchUnits 시작
3. 로딩 중: "동/호수 조회 중..." 표시
4. units 배열 반환됨
   ├── units.length > 0 → 동 드롭다운 표시
   │     └── 동 선택 → 호 드롭다운 표시
   │           └── 호 선택 → detail = "101동 1501호"
   └── units.length === 0 → 텍스트 input 표시 (토지/단독주택)
```

## 하위 호환성

- `AddressValue.pnu` is optional → 기존 `satisfies AddressValue` 호출부 변경 불필요
- 호출부(`AcquisitionTaxForm` 등)는 `v.jibun`, `v.road`, `v.building`만 사용 → 영향 없음
- `standard-price` API가 units 없이 응답하면 자동으로 텍스트 input fallback

## Verification

1. `npm run dev` 실행
2. 취득세 계산기 접속
3. "기흥역 센트럴 푸르지오" 검색 → 선택
4. 동/호수 드롭다운 표시 확인
5. 동 선택 → 호 목록 필터링 확인
6. 호 선택 → detail 값 설정 확인
7. 단독주택 주소 선택 → 텍스트 input fallback 확인
8. `npm run build` 오류 없음 확인
