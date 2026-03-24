// [주석: 백엔드에서 전달받은 진짜 설정값으로 교체!]
const SUPABASE_URL = window.SUPABASE_CONFIG.url; 
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.key;

// 전역 변수 생성 (이름 통일)
// [주의] HTML에 supabase-js CDN이 먼저 로드되어 있어야 'supabase' 객체를 쓸 수 있어요!
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 다른 파일(저장 버튼 로직 등)에서도 쓸 수 있게 등록
window.supabase = supabase;

console.log("백엔드 환경변수를 통해 Supabase 연결 완료! 🚀");