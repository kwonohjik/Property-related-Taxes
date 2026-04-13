import { createClient } from "@/lib/supabase/server";

/**
 * 특정 법정동코드·기준일에 조정대상지역 여부 판정.
 *
 * - 비과세 판정: referenceDate = 취득일
 * - 중과세 판정: referenceDate = 양도일
 *
 * 시군구 단위(법정동코드 앞 5자리)로 매칭.
 */
export async function isRegulatedArea(
  areaCode: string,
  referenceDate: Date,
): Promise<boolean> {
  const supabase = await createClient();
  const dateStr = referenceDate.toISOString().split("T")[0];
  const cityDistrictCode = areaCode.substring(0, 5);

  const { data, error } = await supabase
    .from("regulated_areas")
    .select("id")
    .eq("area_code", cityDistrictCode)
    .lte("designation_date", dateStr)
    .or(`release_date.is.null,release_date.gte.${dateStr}`)
    .limit(1);

  if (error) {
    // 오류 시 보수적으로 false 반환 (계산 진행 허용)
    console.error("isRegulatedArea 조회 오류:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
