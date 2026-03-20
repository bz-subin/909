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


// 회원가입 함수
async function signup(email, password, nickname) {
// 1단계: supabaseClient Auth 회원가입
const { data: authData, error: authError } = await supabaseClient.auth.signUp({
    email: email,
    password: password
});

if (authError) {
    throw authError;
}


// 2단계: profiles 테이블에 추가
const { error: profileError } = await supabaseClient
    .from('profiles')
    .insert({
    id: authData.user.id,
    email: email,
    nickname: nickname
    });

if (profileError) {
    throw profileError;
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