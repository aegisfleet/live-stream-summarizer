export function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number).reverse();
    return parts.reduce((total, part, index) => total + part * Math.pow(60, index), 0);
}

export function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let durationStr = "";
    if (hours > 0) {
        durationStr += `${hours}時間`;
    }
    if (minutes > 0) {
        durationStr += `${minutes}分`;
    }
    if (seconds > 0 || durationStr === "") {
        durationStr += `${seconds}秒`;
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
    const homeUrl = getBasePath();

    // If we are on a detail page, try to go back in history smartly.
    if (window.location.pathname.includes('/pages/')) {
        const entryHistoryLengthStr = sessionStorage.getItem('entryHistoryLength');
        sessionStorage.removeItem('entryHistoryLength');

        if (entryHistoryLengthStr) {
            const entryHistoryLength = parseInt(entryHistoryLengthStr, 10);
            const delta = history.length - entryHistoryLength;
            const backSteps = -(delta + 1);

            if (history.length > Math.abs(backSteps)) {
                 history.go(backSteps);
                 return; // Important to exit here
            }
        }
    }

    // For the main page, or as a fallback for detail pages, just navigate to the home URL.
    // This will effectively reload the page if already there.
    window.location.href = homeUrl;
}
