/**
 * 건물 기준시가 스냅샷 키 유틸 (단일 출처).
 *
 * 키 규약: 상증 `bsp-estate-${id}` / 양도 `bsp-${assetId}-{gb|cb}-{acq|transfer}`
 *   · PHD 3시점 `bsp-${assetId}-phd-{acq|first|transfer}` (상가분은 `…-commercial` 접미).
 *
 * `idOfSnapshotKey`는 use-auto-save-calculation(이력 동봉 필터)·BuildingStdPriceReportSection
 * (결과탭 렌더 소속판정) 두 소비처가 공유한다(드리프트 방지).
 */

/** 스냅샷 키에서 자산/재산 id 추출 (소속 판정용). gb/cb/phd + first + -commercial 전부 환원. */
export function idOfSnapshotKey(key: string): string {
  return key.startsWith("bsp-estate-")
    ? key.slice("bsp-estate-".length)
    : key.replace(/^bsp-/, "").replace(/-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$/, "");
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
