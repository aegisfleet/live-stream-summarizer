(function() {
    const PREFERRED_LANGUAGE_KEY = 'preferredLanguage';
    const preferredLanguage = localStorage.getItem(PREFERRED_LANGUAGE_KEY);
    const isEnglishPage = window.location.pathname.includes('/en/');

    if (!preferredLanguage) {
        return;
    }

    const basePath = window.location.pathname.includes('/live-stream-summarizer/')
        ? '/live-stream-summarizer'
        : '';

    // User prefers English but is on the Japanese page.
    if (preferredLanguage === 'en' && !isEnglishPage) {
        // Correctly handle the base path for the en page.
        const targetPath = basePath ? `${basePath}/en/` : '/en/';
        location.replace(targetPath);
    }
    // User prefers Japanese but is on the English page.
    else if (preferredLanguage === 'ja' && isEnglishPage) {
        // Correctly handle the base path for the ja page (root).
        const targetPath = basePath ? `${basePath}/` : '/';
        location.replace(targetPath);
    }
})();
