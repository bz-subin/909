// Supabase 클라이언트 초기화

const supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_KEY
);

// 이메일 로그인 함수
async function login(email, password) {
const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
});

if (error) {
    throw error;
}

if (data.session) {
    document.cookie = 'sb-access-token=' + data.session.access_token + '; path=/; max-age=3600; SameSite=Lax';
}

// 성공 시 지도로 이동
window.location.href = '/map';
return data;
}


// 회원가입 함수  (플랫폼으로 로그인된 내역을 가져다가 DB-profiles에 넣음)
async function signup(email, password, nickname) {
// 1단계: supabaseClient Auth 회원가입
const { data: authData, error: authError } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
        data: { nickname: nickname } // 트리거가 사용할 닉네임 데이터 전달  (SQL Editor에 트리거 추가)
    }
});

if (authError) {
    throw authError;
}


if (authData.session) {
    document.cookie = 'sb-access-token=' + authData.session.access_token + '; path=/; max-age=3600; SameSite=Lax';
}

return authData;
}


// 로그아웃 함수
async function logout() {
    await supabaseClient.auth.signOut();
    // 쿠키 삭제
    document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
    window.location.href = '/';
}

// 현재 사용자 가져오기
async function getCurrentUser() {
const { data: { user } } = await supabaseClient.auth.getUser();
return user;
}


// 구글 로그인
async function loginWithGoogle() {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'http://localhost:5909/map'
            }
        });
        
        if (error) {
            console.error('구글 로그인 에러:', error);
            alert('구글 로그인 실패: ' + error.message);
        }
        
        // OAuth는 자동으로 리다이렉트되므로 여기서 추가 처리 불필요
        
    } catch (error) {
        console.error('구글 로그인 에러:', error);
        alert('구글 로그인 중 오류 발생');
    }
}

// OAuth 콜백 후 세션 확인 및 리다이렉트
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🔍 페이지 로드 - 세션 확인 시작');
    
    // 현재 세션 확인
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    console.log('🔍 세션 확인 결과:', session);
    if (error) console.log('🔍 에러:', error);
    
    const path = window.location.pathname;
    const isPublicPath = path === '/' || path === '/signup' || path === '/login.html'; // login.html 추가 (필요시)
    
    if (session) {
        console.log('✅ 로그인되어 있음!');
        
        // 쿠키에 토큰 저장
        document.cookie = 'sb-access-token=' + session.access_token + 
                        '; path=/; max-age=3600; SameSite=Lax';
        
        console.log('✅ 쿠키 저장 완료');
        
        // 현재 페이지가 로그인 페이지거나 가입 페이지면 /map으로 이동
        if (isPublicPath) {
            console.log('🚀 /map으로 리다이렉트');
            window.location.href = '/map';
        }
    } else {
        console.log('❌ 세션 없음 - 로그인 필요');
        // 세션이 없는데 보호된 페이지(/map, /community 등)에 있으면 로그인 페이지(/)로 이동
        if (!isPublicPath) {
            console.log('🚀 로그인 페이지로 리다이렉트');
            window.location.href = '/';
        }
    }
});

// 이렇게 변경하면 HTML 어디서든 확실하게 인식합니다.
window.loginWithKakao = async function() {
    console.log("🔗 카카오 로그인 버튼 클릭됨!");
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: 'http://localhost:5909/map' 
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('카카오 로그인 에러:', error.message);
        alert('카카오 로그인 실패: ' + error.message);
    }
}