export function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number).reverse();
    return parts.reduce((total, part, index) => total + part * Math.pow(60, index), 0);
}

export function formatDuration(totalSeconds, lang = 'ja') {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let durationStr = "";
    if (lang === 'en') {
        if (hours > 0) {
            durationStr += `${hours}h `;
        }
        if (minutes > 0) {
            durationStr += `${minutes}m `;
        }
        if (seconds > 0 || durationStr === "") {
            durationStr += `${seconds}s`;
        }
    } else { // Default to Japanese
        if (hours > 0) {
            durationStr += `${hours}時間`;
        }
        if (minutes > 0) {
            durationStr += `${minutes}分`;
        }
        if (seconds > 0 || durationStr === "") {
            durationStr += `${seconds}秒`;
        }
    }
    return durationStr.trim();
}

export function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

export function getBasePath() {
    const repoName = 'live-stream-summarizer';
    if (location.hostname === 'github.io' || location.hostname.endsWith('.github.io')) {
        return `/${repoName}/`;
    }
    return '/';
}

export function goToHomeAndResetHistory() {
    const lang = document.documentElement.lang || 'ja';
    const basePath = getBasePath();
    const homeUrl = lang === 'en' ? new URL('en/', location.origin + basePath).pathname : basePath;

    // Try to go back in history smartly to clear the detail page and its related entries.
    if (window.location.pathname.includes('/pages/')) {
        const entryHistoryLengthStr = sessionStorage.getItem('entryHistoryLength');
        sessionStorage.removeItem('entryHistoryLength'); // Clean up

        if (entryHistoryLengthStr) {
            const entryHistoryLength = parseInt(entryHistoryLengthStr, 10);
            if (!isNaN(entryHistoryLength) && history.length > entryHistoryLength) {
                const delta = history.length - entryHistoryLength;
                history.go(-(delta + 1));
                return; // Exit after navigating
            }
        }
    }

    // Fallback for the main page or if the smart history navigation fails.
    // This ensures a reliable return to the correct language's home page.
    location.replace(homeUrl);
}
