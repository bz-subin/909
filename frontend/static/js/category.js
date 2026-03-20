// 서버로부터 받은 원본 상점 데이터를 저장하는 전역 변수입니다.
let rawShopData = [];
// 현재 필터링된 상점 데이터를 저장하는 전역 변수입니다.
let filteredShopData = [];

/**
 * [목적]
 * 현재 설정된 내비게이션 경로(좌표들)를 기반으로 FAST API 서버에
 * 대전 상점 데이터를 요청합니다.
 */
async function coordinateInsert() {
    // 경로를 구성하는 좌표 배열 (currentPolyline은 navigation.js에서 생성된 전역 변수)
    if (!currentPolyline || !currentPolyline.getPath()) {
        // 경로 정보가 없으면 콘솔에 경고를 출력하고 함수를 종료합니다.
        console.warn("경로 정보가 없습니다. 경로를 먼저 탐색해주세요.");
        // 함수 실행을 중단합니다.
        return;
    }
    // Polyline으로부터 경로 좌표 배열을 가져옵니다.
    const routeCoordinates = currentPolyline.getPath();

    // // TODO: 로딩 중임을 알리는 스피너(Spinner) UI를 활성화하는 로직이 필요합니다.
    // document.getElementById('loading-spinner').style.display = 'block';

    try {
        // 서버의 '/api/shops' 엔드포인트에 POST 요청을 보냅니다.
        const response = await fetch('/api/shops', {
            method: 'POST', // HTTP 메소드는 POST 입니다.
            headers: {
                'Content-Type': 'application/json', // 요청 본문의 타입은 JSON 입니다.
            },
            // [최적화] 경로의 모든 좌표 대신 샘플링된 좌표를 보낼 수 있습니다.
            // 여기서는 전체 좌표를 보내는 것으로 구현합니다.
            body: JSON.stringify({ coordinates: routeCoordinates }), // 좌표 데이터를 JSON으로 변환하여 전송합니다.
        });

        // 서버 응답이 성공적인지 확인합니다.
        if (!response.ok) {
            // 응답이 실패하면 에러를 발생시킵니다.
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 응답 데이터를 JSON 형태로 파싱하여 전역 변수에 저장합니다.
        rawShopData = await response.json();

        // 성공적으로 데이터를 수신했음을 알리기 위해 수신된 데이터 객체를 반환합니다.
        return rawShopData;

    } catch (error) {
        // API 통신 중 에러가 발생하면 콘솔에 에러를 출력합니다.
        console.error("상점 데이터를 가져오는 중 에러 발생:", error);
        // 실패 시 빈 배열을 반환합니다.
        return [];
    } finally {
        // // TODO: 로딩 스피너 UI를 비활성화하는 로직이 필요합니다.
        // document.getElementById('loading-spinner').style.display = 'none';
    }
}

/**
 * [목적]
 * 카테고리 버튼 클릭 시 UI 활성 상태를 변경하고, 해당 카테고리에 맞춰 상점 데이터를 필터링합니다.
 * @param {string} categoryName - 선택된 카테고리 이름 (예: '맛집', '쇼핑')
 * @param {HTMLElement} buttonElement - 클릭된 HTML 버튼 요소
 */
function setCategory(categoryName, buttonElement) {
    // 모든 카테고리 버튼에서 'active' 클래스를 제거합니다.
    const categoryButtons = document.querySelectorAll('.category-btn');
    categoryButtons.forEach(btn => btn.classList.remove('active'));

    // 클릭된 버튼에만 'active' 클래스를 추가합니다.
    buttonElement.classList.add('active');

    // 카테고리 필터링 로직을 호출합니다.
    filterShopsByCategory(categoryName);
}

/**
 * [목적]
 * 사용자가 선택한 카테고리에 해당하는 상점들만 실시간으로 필터링하여 지도에 표시합니다.
 * (이전 categorySelect 함수)
 * @param {string} categoryName - 사용자가 클릭한 카테고리 버튼의 값 (예: '맛집', '쇼핑')
 * @returns {number} - 필터링된 상점 리스트의 개수를 반환합니다.
 */
function filterShopsByCategory(categoryName) {
    // 원본 상점 데이터가 없으면 함수를 종료합니다.
    if (!rawShopData || rawShopData.length === 0) {
        // 0을 반환합니다.
        return 0;
    }

    // 카테고리 이름이 '전체'이거나 지정되지 않은 경우, 모든 상점 데이터를 사용합니다.
    if (!categoryName || categoryName === '전체') {
        // 필터링된 데이터에 원본 데이터 전체를 할당합니다.
        filteredShopData = rawShopData;
    } else {
        // 원본 상점 데이터 배열에서 `category` 속성이 `categoryName`과 일치하는 항목만 추출합니다.
        filteredShopData = rawShopData.filter(shop => shop.category === categoryName);
    }

    // 필터링된 결과를 사용하여 지도에 마커를 갱신하는 함수를 호출합니다.
    pathShop(filteredShopData);

    // 필터링된 상점의 개수를 반환합니다.
    return filteredShopData.length;
}


/**
 * [목적]
 * 주어진 상점 데이터를 지도에 마커로 표시합니다.
 * (원래 명세의 pathShop은 경로 주변 상점을 '필터링'하는 역할이었으나, 여기서는 '표시'하는 역할로 재정의합니다.)
 * @param {Array} shopList - 지도에 표시할 상점 데이터 배열
 */
function pathShop(shopList) {
    // 기존에 표시된 상점 마커들을 먼저 제거합니다.
    resetCategory();

    // 표시할 상점 리스트가 없으면 함수를 종료합니다.
    if (!shopList || shopList.length === 0) {
        // 함수 실행을 중단합니다.
        return;
    }

    // 상점 리스트를 순회하며 각 상점에 대한 마커를 생성합니다.
    shopList.forEach(shop => {
        // 상점의 좌표로 LatLng 객체를 생성합니다.
        const position = new kakao.maps.LatLng(shop.lat, shop.lng);

        // // TODO: 커스텀 마커 이미지를 사용하려면 아래 코드를 활성화하세요.
        // const imageSrc = 'http://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_number_blue.png', // 마커 이미지 url
        //       imageSize = new kakao.maps.Size(36, 37), // 마커 이미지 크기
        //       imgOptions = {
        //           offset: new kakao.maps.Point(15, 37) // 마커 좌표에 일치시킬 이미지 내에서의 좌표
        //       },
        //       markerImage = new kakao.maps.MarkerImage(imageSrc, imageSize, imgOptions);

        // 마커 객체를 생성합니다.
        const marker = new kakao.maps.Marker({
            map: window.kakaoMap, // 마커를 표시할 지도 객체
            position: position,   // 마커의 위치
            title: shop.name,     // 마커에 마우스를 올렸을 때 표시될 툴팁
            // image: markerImage // 커스텀 마커 이미지
        });

        // 생성된 마커를 `markersArray`에 추가하여 관리합니다.
        markersArray.push(marker);

        // // TODO: 마커 클릭 시 정보(인포윈도우 또는 커스텀 오버레이)를 표시하는 로직이 필요합니다.
        // const overlayContent = `<div class="shop-overlay">... ${shop.name} ...</div>`;
        // const overlay = new kakao.maps.CustomOverlay({ content: overlayContent, position: position });
        // kakao.maps.event.addListener(marker, 'click', function() {
        //     overlay.setMap(window.kakaoMap);
        // });
    });
}


/**
 * [목적]
 * 현재 지도에 표시된 모든 상점 마커를 초기화합니다.
 * (원래 명세와 달리 UI, 데이터 초기화는 categorySelect에서 처리하고, 이 함수는 마커 제거에 집중합니다)
 * @returns {boolean} - 초기화 성공 여부를 반환합니다.
 */
function resetCategory() {
    // `clearMarker` 함수를 호출하여 지도 위의 모든 마커를 제거합니다.
    // `clearMarker`는 map.js에 정의되어 있으며, markersArray를 비웁니다.
    // 이 프로젝트에서는 상점 마커와 출발/도착 마커를 구분하지 않으므로,
    // 상점 마커만 지우려면 별도의 마커 배열(예: shopMarkersArray) 관리가 필요합니다.
    // 현재 구현에서는 모든 마커를 지우는 clearMarker를 그대로 사용합니다.
    clearMarker();

    // 초기화가 성공했음을 나타내는 true를 반환합니다.
    return true;
}