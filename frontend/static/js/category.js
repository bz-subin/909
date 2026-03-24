// =====================================================
// category.js - 경로 주변 POI(Point of Interest) 검색 및 마커 관리
// =====================================================

// [전역 변수 선언]
let rawAllPoiData = [];    // API로부터 수집된 전체 중복 제거 POI 데이터 저장소
let filteredPoiData = [];  // 카테고리 필터링이 적용된 POI 데이터
let poiMarkersArray = [];  // 현재 지도에 생성되어 있는 카카오맵 마커 객체 배열

// [카테고리 설정] - 검색 코드 및 필터링을 위한 키워드 정의
const CATEGORY_KEYWORDS = {
    '전체': { codes: ['FD6', 'CE7', 'AT4', 'CT1', 'MT1'] }, // 음식점, 카페, 관광명소, 문화시설, 대형마트
    '여행지': { codes: ['AT4', 'CT1'], keywords: ['관광', '명소', '박물관', '미술관', '역사'] },
    '맛집': { codes: ['FD6'], keywords: ['음식점', '식당', '레스토랑'] },
    '도서관': { codes: ['CT1'], keywords: ['도서관'] },
    '카페': { codes: ['CE7'], keywords: ['카페', '커피'] },
    '자연/공원': { codes: ['AT4'], keywords: ['공원', '산', '자연', '숲', '호수'] },
};

let placesService = null; // 카카오맵 장소 검색 서비스 객체

/**
 * 1. 서비스 초기화
 * 카카오맵 SDK가 로드된 후 장소 검색(Places) 서비스를 사용할 수 있도록 설정합니다.
 */
function initPlacesService() {
    if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.services) {
        placesService = new kakao.maps.services.Places();
        console.log("Places 서비스 초기화 완료");
    } else {
        console.error("카카오맵 Places 서비스 로드 실패");
    }
}

/**
 * 2. 지도 위 마커 제거
 * 새로운 검색을 수행하거나 카테고리를 바꿀 때 기존 마커를 지도에서 지우고 배열을 비웁니다.
 */
function clearPoiMarkers() {
    poiMarkersArray.forEach(function(marker) { 
        marker.setMap(null); // 지도에서 제거
    });
    poiMarkersArray = [];
}

/**
 * 3. 경로 샘플링 (핵심 로직)
 * 경로의 모든 좌표에서 검색하면 API 부하가 크므로, 설정된 간격(meters)마다 검색 지점을 추출합니다.
 * @param {Array} routeCoordinates - 경로를 구성하는 LatLng 배열
 * @param {Number} intervalMeters - 검색 지점 간의 간격 (기본 500m)
 */
function getSamplingPoints(routeCoordinates, intervalMeters) {
    if (intervalMeters === undefined) intervalMeters = 500;
    if (!routeCoordinates || routeCoordinates.length === 0) return [];

    // [내부 함수] 하버사인(Haversine) 공식을 이용한 두 좌표 사이의 거리 계산
    function getDistance(lat1, lng1, lat2, lng2) {
        var R = 6371000; // 지구 반지름 (미터)
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    var points = [routeCoordinates[0]]; // 시작점 포함
    var lastLat = routeCoordinates[0].getLat();
    var lastLng = routeCoordinates[0].getLng();

    // 경로를 따라가며 누적 거리가 intervalMeters를 넘을 때마다 샘플링 포인트로 지정
    for (var i = 1; i < routeCoordinates.length; i++) {
        var curLat = routeCoordinates[i].getLat();
        var curLng = routeCoordinates[i].getLng();
        var dist = getDistance(lastLat, lastLng, curLat, curLng);

        if (dist >= intervalMeters) {
            points.push(routeCoordinates[i]);
            lastLat = curLat;
            lastLng = curLng;
        }
    }

    // 도착점 유실 방지
    var last = routeCoordinates[routeCoordinates.length - 1];
    if (last !== points[points.length - 1]) {
        points.push(last);
    }

    console.log("샘플링 포인트 " + points.length + "개 생성");
    return points;
}

/**
 * 4. 단일 카테고리 검색 (Promise 기반)
 * 특정 위치 주변의 특정 카테고리를 비동기로 검색합니다.
 */
function searchByCategory(location, categoryCode, radius) {
    return new Promise(function(resolve) {
        placesService.categorySearch(categoryCode, function(data, status) {
            if (status === kakao.maps.services.Status.OK) {
                resolve(data); // 검색 성공 시 결과 반환
            } else {
                resolve([]); // 결과가 없거나 오류 시 빈 배열 반환
            }
        }, { location: location, radius: radius });
    });
}

/**
 * 5. 경로 기반 POI 수집 실행 (메인 실행 함수)
 * 경로상의 샘플링 지점들을 돌며 모든 카테고리의 장소를 API로 요청합니다.
 */
async function coordinateInsert() {
    // [방어 코드] 서비스 및 맵, 경로 데이터 존재 여부 확인
    if (!placesService) { console.error("Places 서비스 미초기화"); return; }
    if (!window.kakaoMap) { console.error("window.kakaoMap 없음"); return; }
    if (!currentPolyline || !currentPolyline.getPath()) { console.warn("경로 없음"); return; }

    var routeCoordinates = currentPolyline.getPath();
    clearPoiMarkers(); // 기존 마커 초기화
    rawAllPoiData = []; // 데이터 초기화

    var SEARCH_RADIUS = 500;    // 각 지점당 검색 반경 (500m)
    var SAMPLING_INTERVAL = 500; // 경로 샘플링 간격 (500m)

    // 1단계: 샘플링 포인트 생성
    var samplingPoints = getSamplingPoints(routeCoordinates, SAMPLING_INTERVAL);
    var searchCodes = CATEGORY_KEYWORDS['전체'].codes;
    var uniquePois = new Map(); // 중복 제거를 위한 Map 객체
    var allSearchPromises = [];

    // 2단계: 모든 샘플링 지점 + 카테고리 코드 조합으로 Promise 생성
    samplingPoints.forEach(function(point) {
        searchCodes.forEach(function(code) {
            allSearchPromises.push(searchByCategory(point, code, SEARCH_RADIUS));
        });
    });

    console.log("총 " + allSearchPromises.length + "개 API 요청 시작");

    try {
        // 3단계: 모든 검색 요청을 병렬로 처리하여 속도 최적화
        var allResults = await Promise.all(allSearchPromises);

        // 4단계: 결과 통합 및 중복 제거(ID 기준)
        allResults.flat().forEach(function(place) {
            if (uniquePois.has(place.id)) return;

            uniquePois.set(place.id, {
                id: place.id,
                name: place.place_name,
                category: assignCategory(place), // 자체 로직으로 카테고리 재분류
                kakaoCategoryName: place.category_name,
                lat: parseFloat(place.y),
                lng: parseFloat(place.x),
                address: place.address_name,
                roadAddress: place.road_address_name,
                phone: place.phone,
                placeUrl: place.place_url
            });
        });

        rawAllPoiData = Array.from(uniquePois.values());
        console.log("최종 고유 POI " + rawAllPoiData.length + "개 수집");
        
        // 5단계: 기본값으로 '전체' 마커 표시
        filterShopsByCategory('전체');

    } catch (error) {
        console.error("POI 검색 중 에러:", error);
    }
}

/**
 * 6. 카테고리 재분류 로직
 * 카카오의 기본 카테고리 명칭과 장소 이름을 분석하여 프로젝트 정의 카테고리로 매핑합니다.
 */
function assignCategory(place) {
    var code = place.category_group_code || '';
    var combinedText = (place.category_name || '') + (place.place_name || '');

    if (code === 'CT1' || combinedText.includes('도서관')) return '도서관';
    if (code === 'CE7') return '카페';
    if (code === 'FD6') return '맛집';
    if (code === 'AT4') {
        var natureKeywords = ['공원', '산', '자연', '숲', '호수', '계곡', '해변', '바다'];
        for (var i = 0; i < natureKeywords.length; i++) {
            if (combinedText.includes(natureKeywords[i])) return '자연/공원';
        }
        return '여행지';
    }
    if (code === 'MT1' || code === 'CS2') return '쇼핑';
    return '기타';
}

/**
 * 7. 카테고리 버튼 선택 처리
 * UI 버튼 클릭 시 호출되어 버튼 상태를 변경하고 필터링을 트리거합니다.
 */
function setCategory(categoryName, buttonElement) {
    // 모든 버튼에서 active 클래스 제거
    document.querySelectorAll('.category-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    // 클릭된 버튼에 active 클래스 추가
    if (buttonElement) buttonElement.classList.add('active');
    
    filterShopsByCategory(categoryName);
}

/**
 * 8. 데이터 필터링 및 출력 요청
 * 선택된 카테고리에 맞는 데이터만 추출하여 지도에 그리는 함수를 호출합니다.
 */
function filterShopsByCategory(categoryName) {
    if (!rawAllPoiData || rawAllPoiData.length === 0) {
        clearPoiMarkers();
        return 0;
    }

    if (categoryName === '전체') {
        filteredPoiData = rawAllPoiData;
    } else {
        filteredPoiData = rawAllPoiData.filter(function(poi) {
            return poi.category === categoryName;
        });
    }

    console.log("[" + categoryName + "] 필터링 결과: " + filteredPoiData.length + "개");
    pathShop(filteredPoiData); // 실제 마커 생성 함수 호출
    return filteredPoiData.length;
}

/**
 * 9. 마커 및 오버레이 렌더링
 * 필터링된 POI 리스트를 기반으로 실제 지도에 마커를 배치하고 클릭 이벤트를 등록합니다.
 */
function pathShop(poiList) {
    clearPoiMarkers(); // 기존 마커 삭제
    if (!poiList || poiList.length === 0) return;

    poiList.forEach(function(poi) {
        var position = new kakao.maps.LatLng(poi.lat, poi.lng);
        
        // 마커 객체 생성
        var marker = new kakao.maps.Marker({
            map: window.kakaoMap,
            position: position,
            title: poi.name,
        });

        // 마커 클릭 시 오버레이 표시 이벤트
        kakao.maps.event.addListener(marker, 'click', function() {
            showPoiOverlay(poi);
        });

        poiMarkersArray.push(marker);
    });

    console.log("마커 " + poiMarkersArray.length + "개 지도에 표시");
}

/**
 * POI 오버레이를 닫는 함수
 */
function closePoiOverlay() {
    var overlay = document.getElementById('poi-overlay-container');
    if (overlay) overlay.remove();
}

function showPoiOverlay(poi) {
    closePoiOverlay();

    var overlayContainer = document.createElement('div');
    overlayContainer.id = 'poi-overlay-container';
    overlayContainer.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'background:rgba(0,0,0,0.5)',
        'display:flex',
        'justify-content:center',
        'align-items:center',
        'z-index:9999'
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
        'background:#fff',
        'border-radius:16px',
        'width:320px',
        'overflow:hidden',
        'box-shadow:0 8px 32px rgba(0,0,0,0.2)',
        'font-family:sans-serif'
    ].join(';');

    // 카테고리별 이모지 매핑
    var categoryEmoji = {
        '맛집': '🍽️',
        '카페': '☕',
        '여행지': '🏛️',
        '도서관': '📚',
        '자연/공원': '🌲',
        '기타': '📍'
    };
    var emoji = categoryEmoji[poi.category] || '📍';

    // 사진 영역 (카카오 API 사진 미제공 → 카테고리 이모지로 대체)
    var imgArea = document.createElement('div');
    imgArea.style.cssText = [
        'width:100%',
        'height:140px',
        'background:linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-size:56px'
    ].join(';');
    imgArea.textContent = emoji;

    // 정보 영역
    var info = document.createElement('div');
    info.style.cssText = 'padding:16px';

    // 카테고리 배지
    var badge = document.createElement('span');
    badge.style.cssText = [
        'background:#f0f0f0',
        'color:#666',
        'font-size:11px',
        'padding:3px 8px',
        'border-radius:20px'
    ].join(';');
    badge.textContent = poi.category;

    // 장소명
    var title = document.createElement('h3');
    title.style.cssText = 'margin:8px 0 4px;font-size:18px;font-weight:700;color:#222';
    title.textContent = poi.name;

    // 주소
    var address = document.createElement('p');
    address.style.cssText = 'margin:0 0 4px;font-size:13px;color:#888';
    address.textContent = poi.roadAddress || poi.address || '주소 정보 없음';

    // 전화번호
    var phone = document.createElement('p');
    phone.style.cssText = 'margin:0 0 12px;font-size:13px;color:#888';
    phone.textContent = poi.phone ? '📞 ' + poi.phone : '';

    // 버튼 영역
    var btnArea = document.createElement('div');
    btnArea.style.cssText = 'display:flex;gap:8px';

    // 카카오맵 바로가기 버튼
    var kakaoBtn = document.createElement('a');
    kakaoBtn.href = poi.placeUrl || '#';
    kakaoBtn.target = '_blank';
    kakaoBtn.style.cssText = [
        'flex:1',
        'padding:10px',
        'background:#FEE500',
        'color:#3C1E1E',
        'border-radius:8px',
        'text-align:center',
        'font-size:13px',
        'font-weight:600',
        'text-decoration:none'
    ].join(';');
    kakaoBtn.textContent = '카카오맵';

    // 커뮤니티 버튼
    var communityBtn = document.createElement('button');
    communityBtn.style.cssText = [
        'flex:1',
        'padding:10px',
        'background:#ff6b35',
        'color:#fff',
        'border:none',
        'border-radius:8px',
        'font-size:13px',
        'font-weight:600',
        'cursor:pointer'
    ].join(';');
    communityBtn.textContent = '커뮤니티';
    

    // 조립
    btnArea.appendChild(kakaoBtn);
    btnArea.appendChild(communityBtn);

    info.appendChild(badge);
    info.appendChild(title);
    info.appendChild(address);
    if (poi.phone) info.appendChild(phone);
    info.appendChild(btnArea);

    card.appendChild(imgArea);
    card.appendChild(info);
    overlayContainer.appendChild(card);

    // 배경 클릭 시 닫기
    overlayContainer.addEventListener('click', function(e) {
        if (e.target === overlayContainer) closePoiOverlay();
    });

    document.body.appendChild(overlayContainer);
}

/**
 * 10. 초기화 기능
 * 마커를 모두 지우고 상태를 리셋합니다.
 */
function resetCategory() {
    clearPoiMarkers();
    return true;
}