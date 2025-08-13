(function() {
    const PREFERRED_LANGUAGE_KEY = 'preferredLanguage';
    const isEnglishPage = window.location.pathname.includes('/en/');

    // If the user explicitly navigates to a language-specific page,
    // set their preference and do not redirect.
    if (isEnglishPage) {
        localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'en');
        return; // Stop further execution
    }

    // When on the default (Japanese) page, check for preference.
    const preferredLanguage = localStorage.getItem(PREFERRED_LANGUAGE_KEY);

    // If no preference is set, default to Japanese.
    if (!preferredLanguage) {
        localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'ja');
        return;
    }

    // If preference is English, but user is on the Japanese page, redirect.
    if (preferredLanguage === 'en') {
        const basePath = window.location.pathname.includes('/live-stream-summarizer/')
            ? '/live-stream-summarizer'
            : '';
        const targetPath = basePath ? `${basePath}/en/` : '/en/';
        location.replace(targetPath);
    }
})();
