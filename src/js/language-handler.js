(function() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang');

    if (lang === 'ja') {
        localStorage.setItem('preferredLanguage', 'ja');
        // Remove the query parameter and reload
        const newUrl = window.location.pathname;
        window.location.replace(newUrl);
        return; // Stop execution to prevent conflicts with the logic below
    }

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
})();
