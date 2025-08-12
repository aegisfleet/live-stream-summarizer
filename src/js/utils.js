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
    if (history.length > 1) {
        history.back();
    } else {
        const homeUrl = getBasePath();
        window.location.href = homeUrl;
    }
}
