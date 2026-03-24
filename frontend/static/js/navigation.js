/**
 * @file navigation.js
 * @brief Kakao Maps API + Kakao Mobility Directions API를 활용한
 * 장소 검색, 자동완성, 실제 도로 기반 길찾기 기능을 담당합니다.
 *
 * 🔥 주요 변경 사항:
 * - Python(Folium) 로직을 JS로 변환하여 "vertexes 기반 실제 도로 경로" 구현
 * - 기존 /api/route 호출 제거 (직접 Kakao Mobility API 호출)
 * - vertex → vertexes 구조로 수정
 *
 * ⚠️ 주의:
 * - REST API 키는 프론트에 노출됨 (테스트용)
 * - 실서비스에서는 반드시 백엔드로 이동 필요
 */

// ==============================
// 🔥 전역 상태 관리
// ==============================

let isNavigating = false;

let routeState = {
    start: null,
    end: null,
};


// ==============================
// 🔥 초기화
// ==============================

function initializeNavigation() {
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');

    if (originInput && destinationInput) {
        originInput.addEventListener('keyup', (e) => searchPlaces(e.target, 'origin'));
        destinationInput.addEventListener('keyup', (e) => searchPlaces(e.target, 'destination'));
    }
}


// ==============================
// 🔥 장소 검색 (자동완성)
// ==============================

function searchPlaces(inputElement, type, retryCount = 0) {

    // Kakao services 로딩 체크
    if (typeof kakao.maps.services === 'undefined') {
        if (retryCount >= 5) {
            alert('장소 검색 로딩 실패');
            return;
        }
        setTimeout(() => searchPlaces(inputElement, type, retryCount + 1), 100);
        return;
    }

    const ps = new kakao.maps.services.Places();
    const keyword = inputElement.value;
    const container = document.getElementById(`${type}-results`);

    if (!keyword.trim()) {
        container.style.display = 'none';
        return;
    }

    ps.keywordSearch(keyword, (data, status) => {
        if (status === kakao.maps.services.Status.OK) {
            displayAutocompleteResults(data, container, type);
        } else {
            container.style.display = 'none';
        }
    });
}


// ==============================
// 🔥 자동완성 UI
// ==============================

function displayAutocompleteResults(places, container, type) {

    container.innerHTML = '';
    const ul = document.createElement('ul');

    places.forEach(place => {

        const li = document.createElement('li');

        li.innerHTML = `
            <div class="place-name">${place.place_name}</div>
            <div class="address-name">${place.road_address_name || place.address_name}</div>
        `;

        li.addEventListener('click', () => selectPlace(place, type));

        ul.appendChild(li);
    });

    container.appendChild(ul);
    container.style.display = 'block';
}


// ==============================
// 🔥 장소 선택
// ==============================

function selectPlace(place, type) {

    const input = document.getElementById(type);
    const container = document.getElementById(`${type}-results`);

    input.value = place.place_name;

    const coords = new kakao.maps.LatLng(place.y, place.x);

    if (type === 'origin') {
        routeState.start = { name: place.place_name, coords };
    } else {
        routeState.end = { name: place.place_name, coords };
    }

    container.innerHTML = '';
    container.style.display = 'none';
}


// ==============================
// 🔥 경로 검색 버튼
// ==============================

function searchRoute() {

    if (!routeState.start || !routeState.end) {
        alert("출발지와 도착지를 선택하세요");
        return;
    }

    if (document.getElementById('origin').value !== routeState.start.name) {
        alert("출발지 다시 선택");
        return;
    }

    if (document.getElementById('destination').value !== routeState.end.name) {
        alert("도착지 다시 선택");
        return;
    }

    runNavigation();
}


// ==============================
// 🚀 핵심: 길찾기 (Python → JS 변환)
// ==============================

async function runNavigation() {

    if (!routeState.start || !routeState.end) return;
    if (isNavigating) return;

    isNavigating = true;

    clearMarker();
    clearMapLines();

    // ==============================
    // 🔥 좌표 생성 (경도, 위도 순서 중요)
    // ==============================

    const origin = `${routeState.start.coords.getLng()},${routeState.start.coords.getLat()}`;
    const destination = `${routeState.end.coords.getLng()},${routeState.end.coords.getLat()}`;

    try {

        // ==============================
        // ❗❗❗ 반드시 수정해야 하는 부분 ❗❗❗
        // ==============================
        // 👉 .env는 프론트에서 못 읽는다
        // 👉 테스트용이면 직접 넣고
        // 👉 실서비스는 백엔드로 옮겨라
        // ==============================

        const KAKAO_REST_API = "9d24a7ce098f8471df6a3f1802dde837";

        // ==============================
        // 🔥 Kakao Mobility API 호출
        // ==============================

        const response = await fetch(
            `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}`,
            {
                method: "GET",
                headers: {
                    "Authorization": `KakaoAK ${KAKAO_REST_API}`
                }
            }
        );

        if (!response.ok) {
            throw new Error("API 호출 실패");
        }

        const data = await response.json();

        // ==============================
        // 🔥 Python 로직 그대로: vertexes 추출
        // ==============================

        const linePath = [];

        data.routes.forEach(route => {
            route.sections.forEach(section => {
                section.roads.forEach(road => {

                    const v = road.vertexes; // ⭐ 핵심

                    for (let i = 0; i < v.length; i += 2) {
                        linePath.push(
                            new kakao.maps.LatLng(v[i + 1], v[i])
                        );
                    }

                });
            });
        });

        // ==============================
        // 🔥 지도에 실제 도로 경로 그리기
        // ==============================

        currentPolyline = new kakao.maps.Polyline({
            path: linePath,
            strokeWeight: 5,
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });

        currentPolyline.setMap(window.kakaoMap);

        // ==============================
        // 🔥 지도 자동 줌 조정
        // ==============================

        const bounds = new kakao.maps.LatLngBounds();
        linePath.forEach(p => bounds.extend(p));
        window.kakaoMap.setBounds(bounds);

        // ==============================
        // 🔥 추가 기능 (상점 연동)
        // ==============================

        coordinateInsert();

    } catch (err) {
        console.error(err);
        alert("경로 생성 실패");
    } finally {
        isNavigating = false;
    }
}