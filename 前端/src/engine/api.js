let API_BASE = "http://localhost:8000"; // Default
let API_KEY = "";

export function configureApi(url, key) {
    if (url) API_BASE = url;
    if (key) API_KEY = key;
}

function getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    return headers;
}


/**
 * Start or reset the game
 * @param {string} settings - Initialization settings for AI
 * returns { state: GameState, options: GameOption[] }
 */
export async function initGame(settings = "") {
    try {
        const response = await fetch(`${API_BASE}/api/init`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ settings })
        });
        if (!response.ok) throw new Error("Failed to init game");
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

/**
 * Send player action to backend
 * action: { label: string, customText?: string, effects?: object }
 * returns { state: GameState, options: GameOption[] }
 */
export async function sendAction(action) {
    try {
        const response = await fetch(`${API_BASE}/api/action`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(action)
        });
        if (!response.ok) throw new Error("Failed to send action");
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}
