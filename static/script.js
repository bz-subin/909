// 버튼 클릭 시 실행될 함수
async function getData(type) {
    const displayDiv = document.getElementById('display');
    displayDiv.innerText = '서버에 요청 중...';
    const url = type === 'success' ? '/api/hello' : '/api/fail';
    
    try {
        const response = await fetch(url);
        
        // response.ok는 상태 코드가 200~299일 때 true입니다.
        if (!response.ok) {
            throw new Error(`서버 에러 발생! (상태 코드: ${response.status})`);
        }

        const data = await response.json();
        displayDiv.style.color = 'blue';
        displayDiv.innerText = `성공 메시지: ${data.message}`;
        
    } catch (error) {
        displayDiv.style.color = 'red';
        displayDiv.innerText = `에러 내용: ${error.message}`;
        console.error('상세 에러:', error);
    }
}