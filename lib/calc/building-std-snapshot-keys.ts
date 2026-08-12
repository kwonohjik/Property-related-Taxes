/**
 * 건물 기준시가 스냅샷 키 유틸 (단일 출처).
 *
 * 키 규약: 상증 `bsp-estate-${id}` / 양도 `bsp-${assetId}-{gb|cb}-{acq|transfer}`
 *   · PHD 3시점 `bsp-${assetId}-phd-{acq|first|transfer}` (상가분은 `…-commercial` 접미).
 *   · 겸용 asset-major 상가 통합 모달 `bsp-${assetId}-mx-commercial` — 취득·양도 2시점을 한 폼에서
 *     계산하므로 시점 세그먼트가 없다(gb/cb와 같은 transfer 모드 단일 스냅샷).
 *     ⚠️ phd prefix를 쓰면 배치 모달의 replaceSnapshotsByPrefix(`bsp-{id}-phd`)에 삭제된다 → `mx` 분리.
 *
 * `idOfSnapshotKey`는 use-auto-save-calculation(이력 동봉 필터)·BuildingStdPriceReportSection
 * (결과탭 렌더 소속판정) 두 소비처가 공유한다(드리프트 방지).
 */

/** 스냅샷 키에서 자산/재산 id 추출 (소속 판정용). gb/cb/phd + first + -commercial + mx + red-phd 전부 환원. */
export function idOfSnapshotKey(key: string): string {
  return key.startsWith("bsp-estate-")
    ? key.slice("bsp-estate-".length)
    : key
        .replace(/^bsp-/, "")
        // ⚠️ 접두는 **전수 열거**한다 — 누락되면 id가 잘리지 않아 inputData 매칭이 실패하고
        //    그 자산의 계산서가 **조용히 미출력**된다(2026-07-29 실측: split·cbinh 3종이 그 상태였다).
        //    긴 접두(cbinh)를 짧은 것(cb)보다 앞에 둔다. 신규 키 규약 추가 시 여기도 함께 갱신할 것.
        // 🪤 `gb-ext`(증축분 건물2)는 **`gb`보다 앞**이어야 한다 — 짧은 것이 먼저 매칭되면
        //    `-gb-ext-acq`가 통째로 걸리지 않아 id가 `{assetId}-gb-ext`로 잘못 환원되고,
        //    inputData 매칭이 실패해 **증축분 계산서가 조용히 미출력**된다(2026-08-12 실측).
        .replace(/-(?:gb-ext|gb|cbinh|cb|phd|split)-(?:acq|first|transfer)(?:-commercial)?$/, "")
        .replace(/-mx-commercial$/, "")
        // 별개취득 건물분 취득·양도 **통합 모달**(2026-07-30) — 한 폼에서 2시점을 계산하므로
        // 시점 세그먼트가 없다(mx-commercial과 같은 구조). 시점 필터도 적용하지 않는다.
        .replace(/-split-both$/, "")
        // 감면 조문 PHD 환산 통합 모달(취득시+최초공시시 단일 스냅샷) — 규약 편입.
        .replace(/-red-phd$/, "");
}

/**
 * 시점 전용 스냅샷 키가 요구하는 인스턴스 시점 — 없으면 null(2시점 유지).
 *
 * 엔진 transfer **2시점** 모드는 취득+양도 2벌을 내므로, 한 시점 필드에만 연결된 스냅샷은
 * 반대 시점 인스턴스를 걸러야 한다(한 자산이 -acq·-transfer 2스냅샷을 가지면 각 2벌 → 4벌 중복).
 * 단일 시점 모드(`singleTimePoint`) 스냅샷은 엔진이 애초에 1벌만 내지만, **그 이전 저장분**은
 * 여전히 2벌이므로 이 필터가 필요하다.
 *
 * ⚠️ 화면(BuildingStdPriceReportSection)과 PDF(building-std-pdf-data) **양쪽이 이 함수를 쓴다** —
 * 한쪽에만 필터가 있으면 같은 계산의 화면과 PDF가 어긋난다(2026-07-30 실측: PDF에만 필터가 없어
 * 구버전 스냅샷이 PDF에서 2벌로 나왔다). 접두는 `idOfSnapshotKey`와 같은 집합으로 유지할 것.
 */
export function snapshotKeyTimepoint(key: string): "acquisition" | "transfer" | null {
  // 🔴 두 정규식은 **같은 접두 집합·같은 접미**여야 한다. 종전에는 양도 쪽에서 `phd`와
  //    `-commercial`이 빠져 있어, PHD 3시점 개별 모달·겸용 상가 양도시 모달이 저장한 키가
  //    필터를 통과하지 못했다 → `singleTimePoint` 플래그 이전에 저장된 스냅샷(이력 복원분)에서
  //    **양도시 계산서에 취득당시 인스턴스가 덤으로 실린다**(2026-08-11 실측).
  // `gb-ext`는 `gb`보다 앞 — `idOfSnapshotKey`와 **같은 접두 집합**이어야 한다(위 주석).
  if (/-(?:phd|gb-ext|gb|cbinh|cb|split)-acq(?:-commercial)?$/.test(key)) return "acquisition";
  if (/-(?:phd|gb-ext|gb|cbinh|cb|split)-transfer(?:-commercial)?$/.test(key)) return "transfer";
  return null;
}

/**
 * 증축분(건물2) 계산서인가 — 제목에 「증축분」을 붙이고 취득 시점을 「증축시」로 바꾼다.
 *
 * 원건물 계산서와 **같은 자산·같은 2시점**이라 구별 표기가 없으면 「양도시」 계산서가 두 장
 * 나란히 떠서 어느 쪽이 건물1인지 알 수 없다. 증축분의 취득 시점은 원건물 취득일이 아니라
 * **증축일**(「소득세법 시행령」 제162조 제1항 제4호)이므로 시점 이름도 다르다.
 *
 * ⚠️ 화면(`BuildingStdPriceReportSection`)과 PDF(`building-std-pdf-data`)가 **함께** 쓴다 —
 *    한쪽만 고치면 같은 계산의 화면과 PDF가 어긋난다(이 파일의 단일 출처 규약).
 */
export function isExtensionSnapshotKey(key: string): boolean {
  return /-gb-ext-(?:acq|transfer)$/.test(key);
}

/**
 * 배치(N시점 일괄) 스냅샷의 시점 라벨(계산서 헤딩용). 대상이 아니면 null.
 *
 * ## ⚠️ 대상은 **배치 전용 키**뿐이다
 *
 * `-gb-acq`·`-cb-acq`·`-cb-transfer`는 **시점별 1시점 모달과 키를 공유**한다
 * (`snapshotKey={bsp-${id}-cb-acq}` 등). 여기에 라벨 override를 붙이면 배치를 쓰지 않고
 * 시점별 계산기로 저장한 기존 스냅샷의 계산서 제목까지 바뀐다(2026-08-04 P4 실측 —
 * `building-std-report-phd-section.test.tsx` S9-d가 이 회귀를 잡았다).
 *
 * ⇒ 배치만 만드는 키에 한정한다:
 *   `-phd-{acq|first|transfer}` — PHD 배치 전용 접두(1시점 모달이 쓰지 않는다)
 *   `-cb-first`                — 상가 §164⑥ 최초고시(2005). 1시점 모달에는 `first` 시점이 없다
 *
 * 취득·양도는 기본 제목("취득당시/양도당시 기준시가 계산")이 이미 시점을 밝히므로 정보 손실이 없다.
 */
export function phdTimepointLabel(key: string): {
  timepoint: string;
  category: "housing" | "commercial";
  /**
   * 계산서 헤딩의 구분 표기. **`category`로 직접 만들지 말 것** —
   * 상가 §164⑥ 배치는 카테고리 구분이 없어 `housing` 슬롯을 재사용하므로
   * "주택분"으로 오표시된다(2026-08-04 P3 실측).
   */
  categoryLabel: string;
  /** 시점 정렬 순서(취득 0 · 최초 1 · 양도 2) — 라벨 문자열 매칭 금지(접두마다 다르다). */
  order: 0 | 1 | 2;
} | null {
  const m = key.match(/-(?:(phd)-(acq|first|transfer)|(cb)-(first))(-commercial)?$/);
  if (!m) return null;
  const isCommercialBuilding = m[3] === "cb";
  const seg = (m[2] ?? m[4]) as "acq" | "first" | "transfer";
  const category = m[5] ? ("commercial" as const) : ("housing" as const);
  const timepoint =
    seg === "acq"
      ? "취득시"
      : seg === "first"
        ? isCommercialBuilding
          ? "최초고시(2005)"
          : "최초공시일"
        : "양도시";
  const order = seg === "acq" ? 0 : seg === "first" ? 1 : 2;
  const categoryLabel = isCommercialBuilding
    ? "건물"
    : category === "commercial"
      ? "상가분"
      : "주택분";
  return { timepoint, category, categoryLabel, order };
}
