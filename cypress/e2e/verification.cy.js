describe('Frontend Verification', () => {
  beforeEach(() => {
    // Listen to window:beforeunload event
    cy.window().then((win) => {
      cy.spy(win, 'addEventListener').as('addEventListener');
    });
  });

  it('should navigate back to home page when using browser back button on detail page', () => {
    // Visit the main page
    cy.visit('/');

    // Wait for content to load
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // Store the main page URL
    let mainPageUrl;
    cy.url().then(url => {
      mainPageUrl = url;
    });

    // Click on the first video to go to detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

    // Verify we're on a detail page
    cy.url().should('include', '/pages/');

    // Click browser back button
    cy.go('back');

    // Verify we're back on the main page
    cy.url().then(url => {
      expect(url).to.equal(mainPageUrl);
    });

    // Verify the archive grid is visible
    cy.get('#archive-grid').should('be.visible');
    cy.get('#archive-grid .archive-card').should('have.length.gt', 0);
  });

  it('should allow navigation to a detail page and back to home', () => {
    // a. Navigate to the main page
    cy.visit('/');

    // Wait for the main content to be loaded and find the first video
    // This also implicitly handles the data loading issue. If the cards don't appear, this will time out.
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. Click on the first video link to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

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

  it('should exit the app when using the back button after returning from detail page via back-to-home button', () => {
    // Cypress will navigate to this test URL by default when going back
    const testRunnerUrl = 'about:blank';

    // a. Navigate to the main page
    cy.visit('/');

    // Wait for the main content to be loaded
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. Click on the first video link to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

    // c. Verify navigation to a detail page
    cy.url().should('include', '/pages/');

    // d. Click the "ホームに戻る" (Back to Home) button
    cy.get('#back-to-home', { timeout: 10000 }).should('be.visible').click();

    // e. Verify we're on the home page
    cy.url().should('eq', 'http://localhost:3000/');

    // f. Press the browser's back button - should exit the app
    cy.go('back');

    // g. Verify that the app has "exited" by checking we're no longer in the app
    cy.url().should('not.include', 'localhost:3000');
  });

  it('should exit the app when using the back button after switching languages', () => {
    // a. Navigate to the main page
    cy.visit('/');

    // b. Click the language switch button to go to the English page
    cy.get('#lang-en').click();

    // c. Verify navigation to the English page
    cy.url().should('include', '/en/');

    // f. Press the browser's back button again
    cy.go('back');

    // g. Verify that the app has "exited"
    cy.location('pathname').should('not.eq', '/');
  });
});
