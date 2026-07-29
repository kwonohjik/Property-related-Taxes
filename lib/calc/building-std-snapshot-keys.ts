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
        .replace(/-(?:gb|cbinh|cb|phd|split)-(?:acq|first|transfer)(?:-commercial)?$/, "")
        .replace(/-mx-commercial$/, "")
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
  if (/-(?:phd|gb|cbinh|cb|split)-acq(?:-commercial)?$/.test(key)) return "acquisition";
  if (/-(?:gb|cb|split)-transfer$/.test(key)) return "transfer";
  return null;
}

/** PHD 시점 라벨(계산서 헤딩용). phd 키가 아니면 null. */
export function phdTimepointLabel(
  key: string,
): { timepoint: string; category: "housing" | "commercial" } | null {
  const m = key.match(/-phd-(acq|first|transfer)(-commercial)?$/);
  if (!m) return null;
  const timepoint = m[1] === "acq" ? "취득시" : m[1] === "first" ? "최초공시일" : "양도시";
  return { timepoint, category: m[2] ? "commercial" : "housing" };
}
