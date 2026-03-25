/**
 * [메인 함수] FastAPI 백엔드로부터 실시간 날씨 데이터를 가져와 UI를 업데이트합니다.
 */
async function updateWeatherUI() {
    // 1. [DOM 요소 사전 확보] 날씨 정보를 표시할 HTML 요소를 미리 선택합니다.
    const titleP = document.querySelector('.weather-title');
    const descP = document.querySelector('.weather-desc');
    const emojiSpan = document.querySelector('.weather-emoji');

    console.log("❄️ PenPing 날씨 시스템: 데이터 로드를 시작합니다.");

    try {
        // 2. [네트워크 요청] FastAPI 백엔드 엔드포인트에 날씨 데이터를 요청합니다.
        const response = await fetch('/api/weather'); 
        
        // 3. [응답 검증] 서버 응답이 실패(500, 404 등)했을 경우 즉시 에러를 발생시켜 catch 블록으로 이동합니다.
        if (!response.ok) {
            throw new Error(`서버 응답 오류 (Status: ${response.status})`);
        }

        const data = await response.json();

        // 4. [기상청 데이터 유효성 검사] 응답 구조가 올바른지 확인합니다.
        if (!data.response || !data.response.body) {
            // API 키 오류나 기상청 서버 점검 시 데이터가 비어있을 수 있습니다.
            throw new Error("기상청 응답 형식이 올바르지 않거나 데이터가 없습니다.");
        }

        // 5. [데이터 추출] 전체 예보 리스트에서 필요한 정보만 필터링합니다.
        const items = data.response.body.items.item;
        
        // 6. [시간 동기화] 기상청 배열의 첫 번째 요소 시간을 기준으로 현재 시점 예보만 골라냅니다.
        // (단기예보는 미래 시간 데이터까지 함께 오기 때문에 필터링이 필수입니다.)
        const targetTime = items[0].fcstTime; 
        const currentItems = items.filter(i => i.fcstTime === targetTime);
        
        // 7. [항목별 값 할당] 온도(TMP), 하늘상태(SKY), 강수형태(PTY)를 추출합니다.
        // Optional Chaining(?.)과 기본값(||)을 사용하여 런타임 에러를 방지합니다.
        const tmp = currentItems.find(i => i.category === "TMP")?.fcstValue || "0";
        const sky = currentItems.find(i => i.category === "SKY")?.fcstValue || "1";
        const pty = currentItems.find(i => i.category === "PTY")?.fcstValue || "0";

        // 8. [UI 업데이트] 추출된 데이터를 기반으로 화면 문구를 교체합니다.
        if (titleP && descP) {
            // 날씨 테마 함수를 호출하여 이모지와 메시지를 결정합니다.
            const theme = getWeatherTheme(tmp, sky, pty);

            titleP.innerHTML = `현재 ${tmp}°C ${theme.emoji}`;
            emojiSpan.innerHTML = theme.emoji;
            descP.innerHTML = `${theme.message}<br>대전으로 탐험하러 갈까요? 👍`;
            console.log("✅ PenPing 날씨 시스템: 업데이트 성공!");
        }

    } catch (error) {
        // 9. [에러 핸들링] 무한 로딩 방지 및 사용자에게 에러 상태를 알립니다.
        console.error("❌ PenPing 날씨 시스템 오류:", error);
        
        if (titleP && descP) {
            titleP.innerHTML = "날씨 정보 오류 ⚠️";
            descP.innerHTML = "데이터를 불러오는 데 실패했습니다.<br>서버 상태를 확인해 주세요. 🐧";
        }
    }
}

/**
 * [로직 함수] 기상청 날씨 코드를 분석하여 적절한 이모지와 펭귄 메시지를 반환합니다.
 * @param {string} tmp 기온
 * @param {string} sky 하늘 상태 코드 (1: 맑음, 3: 구름많음, 4: 흐림)
 * @param {string} pty 강수 형태 코드 (0: 없음, 1: 비, 2: 비/눈, 3: 눈, 4: 소나기)
 */
function getWeatherTheme(tmp, sky, pty) {
    let emoji = "🐧";
    let message = "오늘 날씨가 멋져요!";

    // [판단 1순위] 강수 여부: 눈이나 비가 오면 가장 먼저 표시합니다.
    if (pty !== "0") {
        if (pty === "1" || pty === "4") { 
            emoji = "☔"; 
            message = "비가 내려요! 우산 꼭 챙기세요."; 
        } else if (pty === "3") { 
            emoji = "❄️"; 
            message = "눈이 와요! 펭귄이 제일 좋아하는 날이에요!"; 
        } else { 
            emoji = "🌨️"; 
            message = "진눈깨비가 내려요. 미끄러지지 않게 조심하세요!"; 
        }
    } 
    // [판단 2순위] 하늘 상태: 비가 오지 않을 때 구름의 양을 판단합니다.
    else { 
        if (sky === "1") { 
            emoji = "☀️"; 
            message = "햇살 가득한 맑은 날! 산책하기 완벽해요."; 
        } else if (sky === "3") { 
            emoji = "🌤️"; 
            message = "구름이 조금 있네요. 탐험하기 좋은 날씨예요!"; 
        } else { 
            emoji = "☁️"; 
            message = "조금 흐린 날씨네요. 운치 있게 걸어볼까요?"; 
        }
    }

    // [판단 3순위] 기온 특이점: 기온이 영하권이면 경고 메시지를 추가합니다.
    if (parseInt(tmp) <= 0) {
        message = "무척 추워요! 따뜻하게 입고 빙산 조심하세요 🧊";
    }
    
    return { emoji, message };
}

/**
 * [이벤트 리스너] 브라우저가 HTML 문서를 모두 읽으면 즉시 날씨 업데이트를 시도합니다.
 */
document.addEventListener('DOMContentLoaded', updateWeatherUI);