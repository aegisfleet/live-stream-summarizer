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
    let homeUrl = basePath;

    // The Japanese version is at the root, English is under /en/
    if (lang === 'en') {
        homeUrl = `${basePath}en/`;
    }

    // Use location.replace to navigate to the home page, which replaces the
    // current page in the history stack. This ensures that when the user
    // presses the back button from the home page, they exit the app as expected.
    location.replace(homeUrl);
}
