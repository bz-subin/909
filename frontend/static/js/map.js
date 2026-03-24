// 전역 변수로 지도 인스턴스를 저장하여 다른 파일에서 접근할 수 있도록 합니다.
window.kakaoMap = null;
// 현재 그려진 Polyline을 저장하는 변수입니다.
let currentPolyline = null;
// 지도에 표시된 마커들을 저장하는 배열입니다.
let markersArray = [];

/**
 * [목적]
 * 카카오맵 API 스크립트를 동적으로 로드하고, 대전역을 초기 중심으로 하여 지도를 화면에 렌더링합니다.
 * 이후 다른 JS 파일에서 이 지도 객체를 공유할 수 있도록 설정합니다.
 */
async function connectKakaomap() {
    try {
        const response = await fetch('/api/kakaomap-key');
        if (!response.ok) {
            throw new Error('API 키를 가져오는 데 실패했습니다.');
        }
        const data = await response.json();
        const KAKAO_MAP_KEY = data.kakao_map_key;

        if (!KAKAO_MAP_KEY) {
            console.error("Kakao map key is not loaded.");
            return;
        }

        // 'script' 태그를 동적으로 생성합니다.
        const script = document.createElement('script');
        // 스크립트의 타입을 'text/javascript'로 설정합니다.
        script.type = 'text/javascript';
        // API 로딩이 완료되면 자동으로 실행되지 않도록 `autoload=false` 파라미터를 추가합니다.
        // `libraries=services`는 Kakao Maps Places (장소 검색) 기능을 사용하기 위해 필수적입니다.
        // 이 라이브러리가 로드되어야 `kakao.maps.services.Places` 객체를 사용할 수 있습니다.
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&libraries=services&autoload=false`;

        // 생성된 스크립트 태그를 문서의 'head'에 추가합니다.
        document.head.appendChild(script);

        // 스크립트 로딩이 완료되면 실행될 콜백 함수를 정의합니다.
        script.onload = () => {
            // 카카오맵 API를 로드합니다.
            kakao.maps.load(() => {
                // 지도를 표시할 HTML 요소를 가져옵니다.
                const mapContainer = document.getElementById('map');
                // 지도의 초기 중심 좌표입니다. (예: 대전역)
                const center = new kakao.maps.LatLng(36.3326, 127.4342);

                // 지도 생성 옵션을 설정합니다.
                const mapOption = {
                    center: center, // 지도의 중심 좌표를 설정합니다.
                    level: 3,       // 지도의 초기 확대 레벨을 설정합니다.
                };

                // 지도 객체를 생성하고 전역 변수에 할당합니다.
                window.kakaoMap = new kakao.maps.Map(mapContainer, mapOption);

                // 지도 객체 생성 직후 대전 지역 제한 함수를 호출합니다.
                deajeonlimit();

                // 내비게이션 기능 초기화
                // `navigation.js`의 initializeNavigation 함수를 호출하여 장소 검색 및 경로 관련 이벤트 리스너를 설정합니다.
                // 이 호출은 `kakao.maps` 객체와 필요한 라이브러리(`services`)가 모두 로드된 후에 실행되므로,
                // `Uncaught TypeError: Cannot read properties of undefined (reading 'Places')`와 같은 오류를 방지합니다.
                initializeNavigation();
                initPlacesService();
            });
        };
    } catch (error) {
        console.error('Error fetching Kakao map key:', error);
    } 
}

/**
 * [목적]
 * 지도 우측 상단 커스텀 컨트롤 바의 버튼 클릭에 따라 지도를 확대, 축소하거나 출발지로 화면을 이동시킵니다.
 * @param {string} actionType - 'zoomIn', 'zoomOut', 'goOrigin' 중 하나의 동작 타입
 */
function expandMap(actionType) {
    // 전역으로 선언된 지도 객체를 가져옵니다.
    const map = window.kakaoMap;
    // 지도 객체가 없으면 함수를 종료합니다.
    if (!map) return;

    // 동작 타입에 따라 분기합니다.
    switch (actionType) {
        case 'zoomIn':
            // 현재 지도 레벨을 가져옵니다.
            const currentLevelIn = map.getLevel();
            // 최소 레벨(1)보다 클 경우에만 지도를 확대합니다.
            if (currentLevelIn > 1) {
                // 부드러운 애니메이션 효과와 함께 지도를 한 단계 확대합니다.
                map.setLevel(currentLevelIn - 1, { animate: true });
            }
            break; // switch 문을 빠져나옵니다.
        case 'zoomOut':
            // 현재 지도 레벨을 가져옵니다.
            const currentLevelOut = map.getLevel();
            // 최대 레벨(8)보다 작을 경우에만 지도를 축소합니다.
            if (currentLevelOut < 8) {
                // 부드러운 애니메이션 효과와 함께 지도를 한 단계 축소합니다.
                map.setLevel(currentLevelOut + 1, { animate: true });
            }
            break; // switch 문을 빠져나옵니다.
        case 'goOrigin':
            // // TODO: 'originLatLng'는 출발지 좌표로, navigation.js 등에서 설정된 변수를 사용해야 합니다.
            // const originLatLng = new kakao.maps.LatLng(36.3326, 127.4342); // 예시: 대전역
            // // 설정된 출발지 좌표로 지도의 중심을 부드럽게 이동시킵니다.
            // map.panTo(originLatLng);
            break; // switch 문을 빠져나옵니다.
    }
}

/**
 * [목적]
 * 지도가 멈췄을 때 현재 위치가 대전 지역을 벗어났는지 확인하고,
 * 벗어났다면 사용자에게 거부감을 주지 않고 부드럽게 대전 중심으로 복귀시킵니다.
 */
function deajeonlimit() {
    // [설정 필요] 대전의 중심 좌표를 설정합니다. (예: 대전 시청)
    const daejeonCenter = new kakao.maps.LatLng(36.3504, 127.3845);
    // [설정 필요] 대전 지역의 경계를 설정합니다. (남서쪽, 북동쪽 좌표)
    const daejeonBoundary = new kakao.maps.LatLngBounds(
        new kakao.maps.LatLng(36.2, 127.2), // 남서쪽 좌표
        new kakao.maps.LatLng(36.5, 127.6)  // 북동쪽 좌표
    );

    /**
     * 지도의 중심이 대전 경계 내에 있는지 확인하는 독립 함수입니다.
     */
    const checkDaejeon = () => {
        // 현재 지도의 중심 좌표를 가져옵니다.
        const currentCenter = window.kakaoMap.getCenter();
        // 설정된 대전 경계에 현재 중심 좌표가 포함되는지 확인합니다.
        if (!daejeonBoundary.contain(currentCenter)) {
            // 경계를 벗어났다면, 대전 중심 좌표로 부드럽게 지도를 이동시킵니다.
            window.kakaoMap.panTo(daejeonCenter);
        }
    };

    // 지도의 움직임이 멈췄을 때('idle' 이벤트)마다 checkDaejeon 함수를 실행하도록 이벤트 리스너를 추가합니다.
    kakao.maps.event.addListener(window.kakaoMap, 'idle', checkDaejeon);
}


/**
 * [목적]
 * 사용자가 새로운 경로를 탐색하거나 초기화할 때, 기존에 지도에 표시된 모든 마커를 제거하여 지도를 깨끗하게 만듭니다.
 * @returns {boolean} - 성공적으로 제거되었음을 알리는 true를 반환합니다.
 */
function clearMarker() {
    // 제거할 마커가 담긴 배열(markersArray)이 비어있는지 확인합니다.
    if (!markersArray || markersArray.length === 0) {
        // 제거할 마커가 없으면 조용히 함수를 종료하고 true를 반환합니다.
        return true;
    }

    // 배열에 저장된 모든 마커를 순회합니다.
    for (let i = 0; i < markersArray.length; i++) {
        // 각 마커 객체의 setMap(null)을 호출하여 지도에서 제거합니다.
        markersArray[i].setMap(null);
    }

    // 모든 마커를 제거한 후, 배열을 빈 배열로 초기화하여 메모리를 관리합니다.
    markersArray = [];

    // 성공적으로 마커가 제거되었음을 알리기 위해 true를 반환합니다.
    return true;
}

/**
 * [목적]
 * 지도 위에 그려진 기존의 최단거리 빨간색 선(Polyline)을 제거하고 메모리를 정리하여,
 * 새로운 경로가 겹쳐 보이지 않게 합니다.
 * @returns {boolean} - 성공적으로 지워졌다면 true를 반환합니다.
 */
function clearMapLines() {
    // currentPolyline 객체가 존재하는지 확인합니다.
    if (currentPolyline) {
        // Polyline 객체의 setMap(null)을 호출하여 지도에서 선을 제거합니다.
        currentPolyline.setMap(null);
        // 참조를 완전히 제거하여 데이터 정리 및 메모리 누수를 방지합니다.
        currentPolyline = null;
    }
    // 성공적으로 선이 지워졌음을 알리기 위해 true를 반환합니다.
    return true;
}
