describe('Frontend Verification', () => {
  it('should allow navigation to a detail page and back to home', () => {
    // a. Navigate to the main page
    cy.visit('/');

    // Wait for the main content to be loaded and find the first video
    // This also implicitly handles the data loading issue. If the cards don't appear, this will time out.
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. Click on the first video link to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

    // c. Verify navigation to a detail page, waiting up to 10 seconds
    cy.url({ timeout: 10000 }).should('include', '/pages/');

    // d. Locate the "みどころ" (highlights) list and click the first three items
    cy.get('#highlights-list .highlight-item').should('have.length.gt', 0);
    cy.get('#highlights-list .highlight-item').then($items => {
        const itemsToClick = Math.min(3, $items.length);
        for (let i = 0; i < itemsToClick; i++) {
            cy.wrap($items[i]).click();
            cy.wait(500); // A short delay to allow JS to execute
        }
    });

    // e. Click the "ホームに戻る" (Back to Home) button
    cy.get('#back-to-home').should('be.visible').click();

    // f. Verify that the current URL is the home page URL
    cy.url().should('eq', 'http://localhost:3000/');

    // g. Take a screenshot
    cy.screenshot('final-state');
  });

  it('should navigate back to the main page when using the back button from the detail page', () => {
    // a. Navigate to the main page
    cy.visit('/');

    // Wait for the main content to be loaded
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. Click on the first video link to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

    // c. Verify navigation to a detail page
    cy.url().should('include', '/pages/');

    // d. Press the browser's back button
    cy.go('back');

    // e. Verify that the URL is the home page URL
    cy.location('pathname').should('eq', '/');
  });

  it('should navigate back to the previous language page when using the back button', () => {
    // a. Navigate to the main page (Japanese)
    cy.visit('/');

    // b. Click the language switch button to go to the English page
    cy.get('#lang-en').click();

    // c. Verify navigation to the English page
    cy.url().should('include', '/en/');

    // d. Press the browser's back button
    cy.go('back');

    // e. Verify that the URL is the Japanese home page URL
    cy.location('pathname').should('eq', '/');
  });
});
