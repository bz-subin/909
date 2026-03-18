// Supabase Mock Initializer
// Once you register at Supabase.com, replace these with your actual details.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// For now, this file just exists so the project is prepared for real implementation
console.log("Supabase Mock Connected! Replace keys in static/js/supabase.js to go live.");

// Mock functions to simulate DB behavior
const supabaseMock = {
    fetchPlaces: async () => {
        return [
            { id: 1, name: "Starfield Library", category: "도서관" },
            { id: 2, name: "대전 고", category: "교육" }
        ];
    },
    login: async (username, password) => {
        if(username && password) {
            return { user: { username }, error: null };
        }
        return { user: null, error: "Invalid credentials" };
    }
};

window.supabaseMock = supabaseMock;
