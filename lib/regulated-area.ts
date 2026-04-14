/**
 * 조정대상지역 판별 — 국토교통부 고시 이력 기반 정적 판별 로직
 *
 * 양도소득세 중과·장기보유특별공제 배제 등 세법 적용을 위해,
 * 지정·해제일 이력을 날짜별로 조회하여 양도일·취득일 기준 조정대상지역 여부를 반환.
 *
 * 단순화 정책:
 *   - 시군구 단위까지만 판별 (동 단위 예외는 수동 오버라이드로 보정)
 *   - 주요 시기별 지정 스냅샷을 보관하고, 주어진 날짜 이전의 가장 최근 스냅샷을 적용
 *
 * 출처: 국토교통부 주거정책심의위원회 조정대상지역 지정/해제 고시
 *   - 2020-11-19, 2020-12-18, 2022-06-30, 2022-09-26, 2022-11-10, 2023-01-05
 */

/** 스냅샷 — 해당 effectiveDate 이후부터 다음 스냅샷 직전까지 유효한 지정 지역 */
interface RegulatedAreaSnapshot {
  effectiveDate: string; // YYYY-MM-DD
  regions: Array<{
    sido: string; // 시도 전체명 (예: "서울특별시", "경기도")
    sigungu?: string[]; // 시군구명 (생략 시 해당 시도 전체)
    /** 일부 동만 지정된 경우 (정확한 적용은 사용자 수동 확인 필요) */
    partial?: boolean;
  }>;
}

/**
 * 스냅샷은 시간 순으로 정렬 (오래된 것 → 최신)
 * 주어진 날짜 <= effectiveDate 인 마지막 스냅샷을 적용
 */
const SNAPSHOTS: RegulatedAreaSnapshot[] = [
  // 2017-08-03 초기 지정 (이전은 지정 없음 가정)
  {
    effectiveDate: "2017-08-03",
    regions: [
      {
        sido: "서울특별시",
        sigungu: [
          "강남구", "서초구", "송파구", "강동구", "용산구", "성동구",
          "노원구", "마포구", "양천구", "영등포구", "강서구",
        ],
      },
      { sido: "경기도", sigungu: ["과천시", "성남시 분당구"], partial: true },
      { sido: "세종특별자치시" },
    ],
  },
  // 2020-06-19 대규모 확대
  {
    effectiveDate: "2020-06-19",
    regions: [
      { sido: "서울특별시" }, // 서울 전체
      {
        sido: "경기도",
        sigungu: [
          "과천시", "성남시", "하남시", "고양시", "남양주시", "수원시",
          "안양시", "의왕시", "의정부시", "군포시", "부천시", "광명시",
          "구리시", "용인시", "동탄2", "안산시 단원구",
        ],
        partial: true,
      },
      { sido: "인천광역시", partial: true },
      { sido: "세종특별자치시" },
      { sido: "대전광역시", partial: true },
      { sido: "청주시", partial: true },
    ],
  },
  // 2020-11-19 추가 확대
  {
    effectiveDate: "2020-11-19",
    regions: [
      { sido: "서울특별시" },
      { sido: "경기도", partial: true },
      { sido: "인천광역시", partial: true },
      { sido: "세종특별자치시" },
      { sido: "대전광역시" },
      { sido: "부산광역시", partial: true },
      { sido: "대구광역시", partial: true },
      { sido: "광주광역시", partial: true },
      { sido: "울산광역시", partial: true },
      { sido: "청주시", partial: true },
      { sido: "천안시", partial: true },
      { sido: "전주시", partial: true },
      { sido: "포항시", partial: true },
      { sido: "창원시", partial: true },
    ],
  },
  // 2022-06-30 일부 해제
  {
    effectiveDate: "2022-07-05",
    regions: [
      { sido: "서울특별시" },
      { sido: "경기도", partial: true },
      { sido: "인천광역시", partial: true },
      { sido: "세종특별자치시" },
      { sido: "대전광역시" },
      { sido: "부산광역시", partial: true },
      { sido: "대구광역시", partial: true },
      { sido: "광주광역시", partial: true },
      { sido: "울산광역시", partial: true },
    ],
  },
  // 2022-09-26 수도권 외 대부분 해제, 수도권 일부 해제
  {
    effectiveDate: "2022-09-26",
    regions: [
      { sido: "서울특별시" },
      {
        sido: "경기도",
        sigungu: [
          "과천시", "성남시 분당구", "성남시 수정구", "하남시", "광명시",
        ],
      },
      { sido: "세종특별자치시" },
    ],
  },
  // 2022-11-10 세종 해제, 수도권 일부 유지
  {
    effectiveDate: "2022-11-14",
    regions: [
      { sido: "서울특별시" },
      {
        sido: "경기도",
        sigungu: ["과천시", "성남시 분당구", "성남시 수정구", "하남시", "광명시"],
      },
    ],
  },
  // 2023-01-05 강남3구 + 용산구만 유지 (현재)
  {
    effectiveDate: "2023-01-05",
    regions: [
      {
        sido: "서울특별시",
        sigungu: ["강남구", "서초구", "송파구", "용산구"],
      },
    ],
  },
];

/**
 * 주소에서 시도·시군구 추출 (간이 파서)
 * 입력: "서울특별시 강남구 테헤란로 123"
 * 출력: { sido: "서울특별시", sigungu: "강남구" }
 */
function parseAddressRegion(address: string): { sido: string; sigungu: string } | null {
  if (!address) return null;
  const parts = address.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const sido = parts[0];
  let sigungu = parts[1];

  // "성남시 분당구" 같은 경우는 2-단어 시군구로 합침
  if (parts.length >= 3 && /^.+시$/.test(parts[1]) && /^.+구$/.test(parts[2])) {
    sigungu = `${parts[1]} ${parts[2]}`;
  }

  return { sido, sigungu };
}

/** 특정 날짜에 적용되는 스냅샷 조회 */
function findSnapshotForDate(date: string): RegulatedAreaSnapshot | null {
  let applied: RegulatedAreaSnapshot | null = null;
  for (const snap of SNAPSHOTS) {
    if (snap.effectiveDate <= date) {
      applied = snap;
    } else {
      break;
    }
  }
  return applied;
}

export interface RegulatedAreaResult {
  isRegulated: boolean;
  confidence: "high" | "medium" | "low";
  basis: string;
}

/**
 * 특정 주소가 특정 날짜 기준 조정대상지역인지 판별
 * @param address 주소 (도로명 또는 지번)
 * @param date YYYY-MM-DD
 */
export function checkRegulatedArea(address: string, date: string): RegulatedAreaResult {
  if (!address || !date) {
    return { isRegulated: false, confidence: "low", basis: "주소 또는 날짜가 비어있음" };
  }

  const parsed = parseAddressRegion(address);
  if (!parsed) {
    return { isRegulated: false, confidence: "low", basis: "주소 파싱 실패" };
  }

  const snapshot = findSnapshotForDate(date);
  if (!snapshot) {
    return {
      isRegulated: false,
      confidence: "high",
      basis: `${date} 기준 지정된 조정대상지역 없음 (2017-08-03 이전)`,
    };
  }

  for (const region of snapshot.regions) {
    if (region.sido !== parsed.sido) continue;

    // 시군구 목록이 없으면 시도 전체 지정
    if (!region.sigungu) {
      return {
        isRegulated: true,
        confidence: region.partial ? "medium" : "high",
        basis: `${snapshot.effectiveDate} 고시 — ${region.sido} ${region.partial ? "일부 지역" : "전체"} 지정`,
      };
    }

    // 시군구 매칭
    if (region.sigungu.some((sg) => parsed.sigungu.startsWith(sg) || sg.startsWith(parsed.sigungu))) {
      return {
        isRegulated: true,
        confidence: region.partial ? "medium" : "high",
        basis: `${snapshot.effectiveDate} 고시 — ${region.sido} ${parsed.sigungu} 지정`,
      };
    }
  }

  return {
    isRegulated: false,
    confidence: "high",
    basis: `${snapshot.effectiveDate} 고시 기준 ${parsed.sido} ${parsed.sigungu}는 미지정`,
  };
}
