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
    const currentLang = document.documentElement.lang || 'ja';
    const basePath = getBasePath();
    const homeUrl = currentLang === 'en' ? new URL('en/', location.origin + basePath).pathname : basePath;

    if (window.location.pathname.includes('/pages/')) {
        const entryPointStr = sessionStorage.getItem('entryPoint');
        sessionStorage.removeItem('entryPoint'); // Clean up

        if (entryPointStr) {
            const entryPoint = JSON.parse(entryPointStr);
            // If the language has not changed since entering the detail page, use history.go()
            if (entryPoint.lang === currentLang) {
                const delta = history.length - entryPoint.length;
                const backSteps = -(delta + 1);

                if (history.length > Math.abs(backSteps)) {
                    history.go(backSteps);
                    return; // Exit after navigating
                }
            }
        }
    }

    // Fallback: navigate directly if not on a detail page, if entryPoint is missing,
    // or if the language has changed.
    window.location.href = homeUrl;
}
