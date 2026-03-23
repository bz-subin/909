/**
 * @file navigation.js
 * @brief Kakao Maps API를 활용한 장소 검색 자동완성 및 길찾기 기능을 담당하는 JavaScript 파일입니다.
 *
 * 이 스크립트는 다음 주요 기능을 제공합니다:
 * 1. 사용자가 출발지/도착지 입력 필드에 키워드를 입력할 때 카카오 장소 검색 API를 이용하여 장소 목록을 자동 완성합니다.
 * 2. 자동 완성 목록에서 장소를 선택하면 해당 장소의 이름과 좌표를 저장합니다.
 * 3. 저장된 출발지/도착지 좌표를 기반으로 백엔드 API를 통해 최단 경로를 조회하고 지도에 표시합니다.
 * 4. 지도에 그려진 경로 주변의 상점 정보를 `category.js`의 함수와 연동하여 가져옵니다.
 *
 * `map.js`와의 연동을 통해 카카오맵 API가 완전히 로드된 후에 모든 내비게이션 관련 기능이 안전하게 초기화됩니다.
 */

// 내비게이션 경로 탐색 상태를 관리하는 전역 변수입니다.
let isNavigating = false;
// 출발지와 도착지 정보를 저장하는 전역 상태 객체입니다.
// 각 지점은 {name: "장소명", coords: kakao.maps.LatLng} 형태를 가집니다.
let routeState = {
    start: null, // 출발지 정보
    end: null,   // 도착지 정보
};

/**
 * [기능] 내비게이션 관련 기능(이벤트 리스너 등)을 초기화합니다.
 * 이 함수는 `map.js`에서 카카오맵 API 및 필요한 라이브러리(`services`)가 완전히 로드된 후 호출됩니다.
 * 이렇게 함으로써 `kakao.maps.services.Places` 객체를 안전하게 사용할 수 있습니다.
 */
function initializeNavigation() {
    // 출발지 및 도착지 입력 필드 요소를 가져옵니다.
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');

    // 입력 필드가 존재하는지 확인 후 이벤트 리스너를 추가합니다.
    if (originInput && destinationInput) {
        // 사용자가 키를 누르거나 떼는(`keyup`) 이벤트 발생 시 `searchPlaces` 함수를 호출하여 장소 검색을 수행합니다.
        originInput.addEventListener('keyup', (e) => searchPlaces(e.target, 'origin'));
        destinationInput.addEventListener('keyup', (e) => searchPlaces(e.target, 'destination'));
    }
}

/**
 * [기능] 입력 필드의 키워드를 기반으로 장소를 검색하고, 자동완성 목록을 표시합니다.
 * `kakao.maps.services` 라이브러리가 로드되지 않았을 경우를 대비하여 재시도 로직을 포함한 예외 처리를 수행합니다.
 *
 * @param {HTMLInputElement} inputElement - 현재 입력 중인 input 요소 (`#origin` 또는 `#destination`)
 * @param {'origin' | 'destination'} type - 입력 필드의 종류 (출발지 또는 도착지)
 * @param {number} [retryCount=0] - 재시도 횟수. 5번 이상 실패하면 사용자에게 알림.
 */
function searchPlaces(inputElement, type, retryCount = 0) {
    // kakao.maps.services 객체가 로드되었는지 확인합니다.
    if (typeof kakao.maps.services === 'undefined' || typeof kakao.maps.services.Places === 'undefined') {
        // 5번 이상 재시도했다면 에러 알림 후 종료
        if (retryCount >= 5) {
            alert('장소 검색 서비스를 불러오는 데 실패했습니다. 페이지를 새로고침해주세요.');
            return;
        }
        // 100ms 후 자기 자신을 다시 호출하여 재시도합니다.
        setTimeout(() => {
            searchPlaces(inputElement, type, retryCount + 1);
        }, 100);
        return;
    }

    // Places 서비스 객체를 함수 내부에서 안전하게 생성합니다.
    const ps = new kakao.maps.services.Places();
    
    const keyword = inputElement.value; // 현재 입력 필드의 값
    const resultsContainerId = `${type}-results`; // 결과를 표시할 자동완성 컨테이너의 ID
    const resultsContainer = document.getElementById(resultsContainerId); // 자동완성 컨테이너 요소

    // 키워드가 비어있으면 자동완성 목록을 숨깁니다.
    if (!keyword.trim()) {
        resultsContainer.style.display = 'none';
        return;
    }

    // 카카오 장소 검색 API를 호출하여 키워드에 해당하는 장소를 검색합니다.
    ps.keywordSearch(keyword, (data, status) => {
        // 검색 결과가 성공적이면 자동완성 목록을 표시합니다.
        if (status === kakao.maps.services.Status.OK) {
            displayAutocompleteResults(data, resultsContainer, type);
        } else {
            // 검색 실패 시 목록을 숨깁니다.
            resultsContainer.style.display = 'none';
        }
    });
}


/**
 * [기능] 검색된 장소 목록을 자동완성 UI (`<ul>` 태그)에 표시합니다.
 * 각 장소는 클릭 시 해당 장소를 선택하는 이벤트 리스너를 가집니다.
 *
 * @param {Array<kakao.maps.services.Places.Place>} places - 검색된 장소 데이터 배열 (카카오 API 응답)
 * @param {HTMLElement} resultsContainer - 결과를 표시할 `div.autocomplete-list` 요소
 * @param {'origin' | 'destination'} type - 입력 필드의 종류
 */
function displayAutocompleteResults(places, resultsContainer, type) {
    resultsContainer.innerHTML = ''; // 이전 검색 결과 제거
    const ul = document.createElement('ul'); // 새로운 목록을 생성

    // 검색된 각 장소에 대해 `<li>` 요소를 생성하고 목록에 추가합니다.
    places.forEach(place => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="place-name">${place.place_name}</div>
            <div class="address-name">${place.road_address_name || place.address_name}</div>
        `;
        // `<li>` 클릭 시 `selectPlace` 함수를 호출하여 선택된 장소 정보를 저장합니다.
        li.addEventListener('click', () => selectPlace(place, type));
        ul.appendChild(li);
    });

    resultsContainer.appendChild(ul); // 완성된 목록을 컨테이너에 추가
    resultsContainer.style.display = 'block'; // 컨테이너를 보이도록 설정
}

/**
 * [기능] 자동완성 목록에서 특정 장소를 선택했을 때 처리합니다.
 * 선택된 장소의 이름으로 입력 필드를 채우고, 전역 `routeState`에 좌표를 저장하며, 자동완성 목록을 숨깁니다.
 *
 * @param {object} place - 선택된 장소의 카카오맵 데이터 객체 (예: `place.place_name`, `place.y`, `place.x`)
 * @param {'origin' | 'destination'} type - 선택이 이루어진 입력 필드의 종류
 */
function selectPlace(place, type) {
    const inputElement = document.getElementById(type); // 해당 입력 필드 요소
    const resultsContainer = document.getElementById(`${type}-results`); // 해당 자동완성 컨테이너 요소
    
    // 입력 필드에 선택된 장소의 이름 설정
    inputElement.value = place.place_name;

    // 카카오맵 LatLng 객체로 좌표를 생성하여 전역 `routeState`에 저장
    const coords = new kakao.maps.LatLng(place.y, place.x);
    if (type === 'origin') {
        routeState.start = { name: place.place_name, coords: coords };
    } else {
        routeState.end = { name: place.place_name, coords: coords };
    }

    // 자동완성 목록을 숨기고 내용을 비웁니다.
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
}

/**
 * [기능] '경로 검색 하기' 버튼 클릭 시 최종 경로 탐색을 시작합니다.
 * 전역 `routeState`에 저장된 출발지/도착지 정보를 기반으로 유효성 검사를 수행한 후 `runNavigation`을 호출합니다.
 */
function searchRoute() {
    // 1. 출발지 또는 도착지 정보가 `routeState`에 없는 경우 경고 메시지를 표시합니다.
    if (!routeState.start || !routeState.end) {
        alert("출발지와 도착지를 목록에서 선택해주세요.");
        return;
    }
    
    // 2. 입력 필드의 현재 값과 `routeState`에 저장된 장소 이름이 일치하는지 확인합니다.
    // 이는 사용자가 장소를 선택한 후 입력 필드를 수동으로 변경한 경우를 방지합니다.
    if (document.getElementById('origin').value !== routeState.start.name) {
        alert('출발지를 목록에서 다시 선택해주세요.');
        return;
    }
    if (document.getElementById('destination').value !== routeState.end.name) {
        alert('도착지를 목록에서 다시 선택해주세요.');
        return;
    }

    // 모든 유효성 검사를 통과하면 경로 탐색을 시작합니다.
    runNavigation();
}

/**
 * [기능] 설정된 출발지와 도착지 좌표를 기반으로 백엔드 서버(`/api/route`)와 통신하여 최단 경로 데이터를 가져오고,
 * 이 데이터를 활용하여 지도에 경로(`Polyline`)를 시각화합니다.
 * 경로는 Kakao 길찾기 API를 통해 계산됩니다.
 */
async function runNavigation() {
    // 1. 출발지 또는 도착지 좌표가 유효한지 다시 한번 확인합니다.
    if (!routeState.start.coords || !routeState.end.coords) {
        console.warn("경로 탐색 시작 실패: 좌표가 유효하지 않습니다.");
        return;
    }

    // 2. 중복 실행 방지: 이미 경로 탐색이 진행 중이면 새로운 요청을 무시합니다.
    if (isNavigating) {
        console.warn("경로 탐색 중: 이미 경로 탐색이 진행 중이므로 새로운 요청을 무시합니다.");
        return;
    }

    // 3. 내비게이션 상태를 '실행 중'으로 변경하고, 이전 지도 요소를 초기화합니다.
    isNavigating = true; // 플래그 설정
    clearMarker();      // `map.js`에 정의된 함수로 지도상의 모든 마커 제거
    clearMapLines();    // `map.js`에 정의된 함수로 지도상의 모든 경로 선 제거

    // 4. 백엔드(`/api/route`)로 보낼 경로 요청 데이터 준비
    // Kakao 길찾기 API는 경도(longitude)를 먼저, 위도(latitude)를 나중에 사용합니다.
    const routeData = {
        startX: routeState.start.coords.getLng(), // 출발지 경도
        startY: routeState.start.coords.getLat(), // 출발지 위도
        endX: routeState.end.coords.getLng(),     // 도착지 경도
        endY: routeState.end.coords.getLat(),       // 도착지 위도
    };

    try {
        // 5. 백엔드 `/api/route` 엔드포인트에 최단 경로를 요청합니다.
        // 클라이언트에서 직접 Kakao API 키를 노출하지 않고 백엔드를 프록시로 활용합니다.
        const response = await fetch('/api/route', {
            method: 'POST', // 경로 정보를 요청하기 위해 POST 메소드 사용
            headers: { 'Content-Type': 'application/json' }, // 요청 본문이 JSON임을 명시
            body: JSON.stringify(routeData), // JavaScript 객체를 JSON 문자열로 변환하여 전송
        });

        // HTTP 응답이 성공적이지 않으면 에러를 발생시킵니다.
        if (!response.ok) {
            throw new Error(`경로 API 호출 실패. 상태: ${response.status}`);
        }

        const res = await response.json(); // 서버 응답을 JSON 형태로 파싱

        // 6. 응답 데이터에서 경로 정보를 확인하고 지도에 `Polyline`으로 그립니다.
        // Kakao 길찾기 API 응답 구조를 따르며, `routes` 배열 내에 경로 정보가 있는지 확인합니다.
        if (res && res.routes && res.routes.length > 0 && res.routes[0].sections.length > 0) {
            const sections = res.routes[0].sections; // 경로의 각 구간 정보
            const linePath = []; // `Polyline`을 구성할 좌표 배열

            // 각 구간과 도로 데이터를 순회하며 경로를 구성하는 모든 좌표를 추출합니다.
            sections.forEach(s => {
                s.roads.forEach(road => {
                    // Kakao API는 좌표를 [경도, 위도, 경도, 위도, ...] 형태로 제공하므로 2개씩 묶어 처리합니다.
                    for (let i = 0; i < road.vertex.length; i += 2) {
                        linePath.push(new kakao.maps.LatLng(road.vertex[i + 1], road.vertex[i]));
                    }
                });
            });

            // 추출된 좌표들로 `Polyline` 객체를 생성하고 지도에 표시합니다.
            currentPolyline = new kakao.maps.Polyline({
                path: linePath,           // `Polyline`을 구성하는 좌표 배열
                strokeWeight: 5,          // 선의 두께 (픽셀)
                strokeColor: '#FF0000',   // 선의 색상 (빨간색)
                strokeOpacity: 0.7,       // 선의 불투명도
                strokeStyle: 'solid'      // 선의 스타일
            });
            currentPolyline.setMap(window.kakaoMap); // 지도에 `Polyline` 그리기

            // 7. 경로 탐색 완료 후, `category.js`의 `coordinateInsert()` 함수를 호출하여
            // 해당 경로 주변의 상점 데이터를 자동으로 가져오도록 연동합니다.
            coordinateInsert();

        } else {
            console.error('경로 API로부터 유효한 경로 데이터를 받지 못했습니다.', res);
            alert("요청하신 경로를 찾을 수 없습니다. 출발지와 도착지를 다시 확인해주세요.");
        }
    } catch (error) {
        console.error('경로 탐색 중 에러 발생:', error);
        alert("경로 탐색 중 네트워크 또는 서버 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
        isNavigating = false; // 내비게이션 종료 플래그 해제
    }
}