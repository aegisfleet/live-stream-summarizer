describe('History Management', () => {
  it('should exit the app when going back after using the "Back to Home" button', () => {
    // Step 1: Navigate to the main page
    cy.visit('/');

    // Ensure the main grid is loaded
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // Step 2: Click on the first video to go to a detail page
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click({ force: true });
    cy.url().should('include', '/pages/'); // Verify navigation to a detail page

    // Step 3: Click the "Back to Home" button
    cy.get('#back-to-home').should('be.visible').click();

    // Step 4: Verify that the URL is the home page URL
    cy.url().should('eq', 'http://localhost:3000/');
    cy.get('#archive-grid').should('be.visible'); // Verify home page content

    // Step 5: Go back in history
    cy.go('back');

    // Step 6: Verify that the app has exited.
    // The URL should no longer be the app's base URL.
    // Because Cypress runs in an iframe, we can't check the *exact* URL
    // (it might be about:blank), but we can check that it's NOT our app's URL.
    cy.url().should('not.eq', 'http://localhost:3000/');

    // We can also verify that the main content of our app is gone.
    cy.get('body').should('not.contain.html', '<div id="archive-grid"');
  });
});
