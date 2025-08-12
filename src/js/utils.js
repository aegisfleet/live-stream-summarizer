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
    const entryHistoryLengthStr = sessionStorage.getItem('entryHistoryLength');

    // Ensure the session storage is cleaned up regardless of the navigation path.
    sessionStorage.removeItem('entryHistoryLength');

    if (entryHistoryLengthStr) {
        const entryHistoryLength = parseInt(entryHistoryLengthStr, 10);
        // Calculate how many pages have been pushed since entering the detail page.
        const delta = history.length - entryHistoryLength;
        // The number of steps to go back is the delta plus one more to leave the detail page.
        const backSteps = -(delta + 1);

        // As a safeguard, check if we can actually go back that many steps.
        if (history.length > Math.abs(backSteps)) {
             history.go(backSteps);
        } else {
            // If not, fall back to the homepage.
            const homeUrl = getBasePath();
            window.location.href = homeUrl;
        }
    } else {
        // Fallback to original behavior if session storage is not set for some reason.
        if (history.length > 1) {
            history.back();
        } else {
            const homeUrl = getBasePath();
            window.location.href = homeUrl;
        }
    }
}
