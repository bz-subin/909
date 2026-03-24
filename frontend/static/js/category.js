// 경로 주변 POI(Point of Interest) 데이터를 저장하는 전역 변수입니다.
let rawAllPoiData = [];
// 현재 필터링된 POI 데이터를 저장하는 전역 변수입니다.
let filteredPoiData = [];
// 지도에 표시된 POI(Point of Interest) 마커들을 저장하는 배열입니다.
let poiMarkersArray = [];

// 카테고리별 검색 키워드 및 코드 매핑 정의
// **사용자 참고: 카카오 Place API의 `category_group_code` (예: FD6 - 음식점)를 활용하면 더 정확한 분류가 가능합니다.**
// **성능 개선을 위해 '전체' 검색 시 keywordSearch의 키워드를 묶었습니다.**
const CATEGORY_KEYWORDS = {
    '전체': {
        keywords: ['음식점,카페', '관광명소,문화시설,상점,공원,여행'], // keywordSearch에 사용할 키워드를 묶어 API 호출 수 감소
        codes: ['FD6', 'CE7', 'AT4', 'CT1', 'CS2', 'MT1'] // categorySearch는 개별 호출 필요 (여러 코드 동시 검색 불가)
    },
    '여행지': { keywords: ['관광명소', '문화시설', '여행'], codes: ['AT4', 'CT1'] },
    '맛집': { keywords: ['음식점'], codes: ['FD6'] },
    '쇼핑': { keywords: ['상점', '백화점', '마트', '편의점'], codes: ['CS2', 'MT1', 'AG2'] }, // AG2: 백화점, 상점, 기타
    '카페': { keywords: ['카페'], codes: ['CE7'] },
    '자연/공원': { keywords: ['공원', '산', '자연휴양림'], codes: ['AT4'] }, // AT4: 관광명소 (공원 포함)
};

// 카카오 Places 서비스 객체를 초기화합니다. `map.js`에서 `libraries=services`가 로드되었으므로 사용 가능합니다.
let placesService = null;
if (typeof kakao !== 'undefined' && typeof kakao.maps !== 'undefined' && typeof kakao.maps.services !== 'undefined') {
    placesService = new kakao.maps.services.Places();
} else {
    // **사용자 참고: 카카오맵 API 로드가 완료된 후에만 이 스크립트가 실행되도록 `map.js`에서 호출 순서를 확인해야 합니다.**
    console.error("카카오맵 Places 서비스가 로드되지 않았습니다. `map.js`의 `connectKakaomap` 함수를 확인하세요.");
}


/**
 * [목적]
 * 사용자가 새로운 경로를 탐색하거나 카테고리를 변경할 때, 기존에 지도에 표시된 POI 마커들을 제거합니다.
 * @returns {boolean} - 성공적으로 제거되었음을 알리는 true를 반환합니다.
 */
function clearPoiMarkers() {
    console.log("clearPoiMarkers: POI 마커 제거 시작"); // DEBUG
    if (!poiMarkersArray || poiMarkersArray.length === 0) {
        console.log("clearPoiMarkers: 제거할 POI 마커 없음"); // DEBUG
        return true;
    }

    for (let i = 0; i < poiMarkersArray.length; i++) {
        poiMarkersArray[i].setMap(null);
    }
    poiMarkersArray = [];
    console.log("clearPoiMarkers: POI 마커 제거 완료"); // DEBUG
    return true;
}

/**
 * [목적]
 * 현재 설정된 내비게이션 경로(좌표들)를 기반으로 카카오 Places API를 사용하여
 * 경로 주변의 상점/장소 데이터를 검색합니다.
 * **사용자 참고: 이 함수는 `navigation.js`의 `runNavigation` 함수에서 경로 탐색 완료 후 호출됩니다.**
 */
async function coordinateInsert() {
    console.log("coordinateInsert: POI 검색 시작"); // DEBUG
    if (!placesService) {
        console.error("coordinateInsert: 카카오 Places 서비스가 초기화되지 않았습니다.");
        return [];
    }
    if (!window.kakaoMap) {
        console.error("coordinateInsert: Kakao Map 객체가 초기화되지 않았습니다."); // DEBUG
        return [];
    }
    if (!currentPolyline || !currentPolyline.getPath()) {
        console.warn("coordinateInsert: 경로 정보가 없습니다. 경로를 먼저 탐색해주세요.");
        return [];
    }
    const routeCoordinates = currentPolyline.getPath();
    console.log(`coordinateInsert: 경로 좌표 수 = ${routeCoordinates.length}`); // DEBUG

    // // TODO: 로딩 중임을 알리는 스피너(Spinner) UI를 활성화하는 로직이 필요합니다.
    // document.getElementById('loading-spinner').style.display = 'block';

    clearPoiMarkers(); // 기존 POI 마커 모두 제거
    rawAllPoiData = []; // 이전 검색 결과 초기화

    const searchRadius = 300; // 검색 반경 300m
    const minDistanceBetweenSamples = 50; // 경로를 따라 50m 간격으로 샘플링하여 검색 (성능과 정확도 타협점)
    const searchPromises = [];
    const uniquePois = new Map(); // 중복 POI 제거를 위한 Map (ID 기준)

    // 샘플링 포인트 생성
    let lastSamplePoint = null;
    const samplingPoints = [];
    // 첫 번째 경로 좌표를 샘플링 포인트에 추가
    if (routeCoordinates.length > 0) {
        samplingPoints.push(routeCoordinates[0]);
        lastSamplePoint = routeCoordinates[0];
    }

    for (let i = 1; i < routeCoordinates.length; i++) {
        const currentPoint = routeCoordinates[i];
        if (currentPoint.getDistanceFrom(lastSamplePoint) >= minDistanceBetweenSamples) {
            samplingPoints.push(currentPoint);
            lastSamplePoint = currentPoint;
        }
    }
    console.log(`coordinateInsert: 총 ${samplingPoints.length}개의 샘플링 포인트 생성`); // DEBUG


    // 각 샘플링 포인트에서 POI 검색 예약
    samplingPoints.forEach(currentPoint => {
        // console.log(`Sampling: Searching around LatLng(${currentPoint.getLat()}, ${currentPoint.getLng()})`); // DEBUG

        // '전체' 카테고리에 정의된 키워드 묶음을 이용한 keywordSearch
        CATEGORY_KEYWORDS['전체'].keywords.forEach(keywordQuery => {
            searchPromises.push(new Promise(resolve => {
                placesService.keywordSearch(keywordQuery, (data, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        resolve(data);
                    } else {
                        // console.warn(`keywordSearch 실패 (${keywordQuery}):`, status); // DEBUG
                        resolve([]); // 실패 시 빈 배열 반환
                    }
                }, {
                    location: currentPoint,
                    radius: searchRadius
                });
            }));
        });

        // '전체' 카테고리에 정의된 코드들을 이용한 categorySearch (개별 호출)
        CATEGORY_KEYWORDS['전체'].codes.forEach(codeQuery => {
            searchPromises.push(new Promise(resolve => {
                placesService.categorySearch(codeQuery, (data, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        resolve(data);
                    } else {
                        // console.warn(`categorySearch 실패 (${codeQuery}):`, status); // DEBUG
                        resolve([]); // 실패 시 빈 배열 반환
                    }
                }, {
                    location: currentPoint,
                    radius: searchRadius
                });
            }));
        });
    });
    console.log(`coordinateInsert: 총 ${searchPromises.length}개의 Places API 검색 예약`); // DEBUG

    try {
        const allResults = await Promise.all(searchPromises);
        console.log("coordinateInsert: 모든 Places API 검색 완료."); // DEBUG
        // console.log("coordinateInsert: 모든 검색 결과 (flat):", allResults.flat()); // DEBUG

        allResults.flat().forEach(place => {
            if (!uniquePois.has(place.id)) {
                let assignedCategory = '기타'; // 기본 카테고리

                // 사용자 정의 카테고리 매핑 로직 (category_group_code 우선, 그 다음 keyword)
                for (const catName in CATEGORY_KEYWORDS) {
                    if (catName === '전체') continue;

                    const catDef = CATEGORY_KEYWORDS[catName];
                    
                    // 1. category_group_code 매칭 시도
                    if (place.category_group_code && catDef.codes && catDef.codes.includes(place.category_group_code)) {
                        assignedCategory = catName;
                        break;
                    }
                    // 2. category_name 또는 place_name에 키워드 포함 시 매칭 시도
                    // keywords가 배열로 되어있을 경우를 대비하여 some 사용
                    if (catDef.keywords && catDef.keywords.some(k => {
                        // keywordQuery가 콤마로 구분된 여러 키워드일 수 있으므로 분리하여 확인
                        const individualKeywords = k.split(',');
                        return individualKeywords.some(singleK => 
                            (place.category_name && place.category_name.includes(singleK)) || 
                            (place.place_name && place.place_name.includes(singleK))
                        );
                    })) {
                        assignedCategory = catName;
                        break;
                    }
                }
                uniquePois.set(place.id, {
                    id: place.id,
                    name: place.place_name,
                    category: assignedCategory, // 사용자 정의 카테고리
                    kakaoCategoryName: place.category_name, // Kakao에서 제공하는 전체 카테고리 이름
                    lat: place.y,
                    lng: place.x,
                    address: place.address_name,
                    roadAddress: place.road_address_name,
                    phone: place.phone,
                    placeUrl: place.place_url
                });
            }
        });

        rawAllPoiData = Array.from(uniquePois.values());
        console.log(`coordinateInsert: 최종 고유 POI 수 = ${rawAllPoiData.length}`); // DEBUG
        
        filterShopsByCategory('전체'); // 초기에는 '전체' 카테고리로 필터링하여 모두 표시
        console.log("coordinateInsert: 초기 POI 필터링 및 표시 완료"); // DEBUG

    } catch (error) {
        console.error("coordinateInsert: POI 데이터를 가져오는 중 에러 발생:", error); // DEBUG
    } finally {
        // // TODO: 로딩 스피너 UI를 비활성화하는 로직이 필요합니다.
        // document.getElementById('loading-spinner').style.display = 'none';
        console.log("coordinateInsert: POI 검색 종료"); // DEBUG
    }
}

/**
 * [목적]
 * 카테고리 버튼 클릭 시 UI 활성 상태를 변경하고, 해당 카테고리에 맞춰 상점 데이터를 필터링합니다.
 * @param {string} categoryName - 선택된 카테고리 이름 (예: '맛집', '쇼핑')
 * @param {HTMLElement} buttonElement - 클릭된 HTML 버튼 요소
 */
function setCategory(categoryName, buttonElement) {
    console.log(`setCategory: 카테고리 변경 요청 - ${categoryName}`); // DEBUG
    const categoryButtons = document.querySelectorAll('.category-btn');
    categoryButtons.forEach(btn => btn.classList.remove('active'));

    if (buttonElement) {
        buttonElement.classList.add('active');
    }

    filterShopsByCategory(categoryName);
}

/**
 * [목적]
 * 사용자가 선택한 카테고리에 해당하는 상점들만 실시간으로 필터링하여 지도에 표시합니다.
 * @param {string} categoryName - 사용자가 클릭한 카테고리 버튼의 값 (예: '맛집', '쇼핑')
 * @returns {number} - 필터링된 상점 리스트의 개수를 반환합니다.
 */
function filterShopsByCategory(categoryName) {
    console.log(`filterShopsByCategory: 카테고리 필터링 시작 - ${categoryName}`); // DEBUG
    if (!rawAllPoiData || rawAllPoiData.length === 0) {
        console.log("filterShopsByCategory: 원본 POI 데이터 없음. 마커 제거."); // DEBUG
        clearPoiMarkers();
        return 0;
    }

    if (categoryName === '전체') {
        filteredPoiData = rawAllPoiData;
    } else {
        filteredPoiData = rawAllPoiData.filter(poi => poi.category === categoryName);
    }
    console.log(`filterShopsByCategory: 필터링된 POI 수 = ${filteredPoiData.length}`); // DEBUG

    pathShop(filteredPoiData);
    return filteredPoiData.length;
}


/**
 * [목적]
 * 주어진 POI 데이터를 지도에 마커로 표시합니다.
 * @param {Array} poiList - 지도에 표시할 POI 데이터 배열
 */
function pathShop(poiList) {
    console.log("pathShop: 마커 표시 시작"); // DEBUG
    clearPoiMarkers();

    if (!poiList || poiList.length === 0) {
        console.log("pathShop: 표시할 POI 리스트 없음."); // DEBUG
        return;
    }

    poiList.forEach(poi => {
        const position = new kakao.maps.LatLng(poi.lat, poi.lng);
        const marker = new kakao.maps.Marker({
            map: window.kakaoMap,
            position: position,
            title: poi.name,
        });
        poiMarkersArray.push(marker);

        // **사용자 참고: 마커 클릭 시 정보(인포윈도우 또는 커스텀 오버레이)를 표시하는 로직을 추가할 수 있습니다.**
        // 예시: 클릭 시 해당 POI의 이름과 주소를 보여주는 인포윈도우
        // const infowindow = new kakao.maps.InfoWindow({
        //     content: `<div style="padding:5px;font-size:12px;">${poi.name}<br>${poi.roadAddress || poi.address}</div>`
        // });
        // kakao.maps.event.addListener(marker, 'click', function() {
        //     infowindow.open(window.kakaoMap, marker);
        // });
    });
    console.log(`pathShop: ${poiMarkersArray.length}개의 마커 지도에 표시 완료`); // DEBUG
}


/**
 * [목적]
 * 카테고리 필터링 후, 지도에 표시된 POI 마커들을 초기화합니다.
 * 이 함수는 `pathShop`에서 새로운 POI 목록을 그리기 전에 호출됩니다.
 * **사용자 참고: 기존 `clearMarker()` (map.js)는 출발/도착 마커도 함께 지우므로,**
 * **POI 마커만 지우기 위해 `clearPoiMarkers()`를 새로 정의하여 사용합니다.**
 * @returns {boolean} - 초기화 성공 여부를 반환합니다.
 */
function resetCategory() {
    console.log("resetCategory: 호출됨"); // DEBUG
    clearPoiMarkers(); // POI 마커만 제거
    return true;
}