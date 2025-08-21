describe('PWA Exit Behavior', () => {
  it('should not return to the detail page when the back button is pressed after returning home', () => {
    // a. Navigate to the main page
    cy.visit('/');

    // Wait for the main content to be loaded and find the first video
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. Click on the first video link to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click({ force: true });

    // Wait for navigation to the detail page to complete
    cy.url().should('include', '/pages/');
    cy.get('#detail-title', { timeout: 10000 }).should('be.visible');

    // c. Click the "ホームに戻る" (Back to Home) button
    cy.get('#back-to-home', { timeout: 10000 }).should('be.visible').click();

    // d. Verify that the current URL is the home page URL
    cy.url().should('eq', 'http://localhost:3000/');

    // e. Go back in history
    cy.go('back');

    // f. Verify that the URL is not the application's URL anymore.
    // When there's no more history, Cypress navigates to about:blank.
    // We can also check that we are not on the detail page.
    cy.url().should('not.include', 'localhost:3000');
  });
});
