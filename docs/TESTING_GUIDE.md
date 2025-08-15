# Testing Environment Setup Guide

This document outlines the steps required to set up a local testing environment for verifying frontend changes using Playwright.

## Prerequisites

- Node.js and npm
- Python and pip

## Setup Steps

1.  **Install Project Dependencies:**
    Install the necessary Node.js packages defined in `package.json`.
    ```bash
    npm install
    ```

2.  **Install Playwright:**
    Install the Playwright library for Python.
    ```bash
    pip install playwright
    ```

3.  **Install Playwright Browsers:**
    Download and install the browser binaries (Chromium, Firefox, WebKit) that Playwright uses for testing.
    ```bash
    playwright install
    ```
    *Note: If you encounter errors about missing shared libraries on Linux, you may need to install additional system dependencies. The command `playwright install --with-deps` can help automatically install them, or you can install them manually using your system's package manager.*

4.  **Install Japanese Fonts (for Screenshot Verification):**
    To ensure that Japanese characters render correctly in screenshots, it's recommended to install a Japanese font package.
    ```bash
    # For Debian/Ubuntu-based systems
    sudo apt-get update
    sudo apt-get install -y fonts-takao-pgothic fonts-ipaexfont-gothic
    ```

5.  **Start the Application Server:**
    Run the local development server to serve the website.
    ```bash
    npm start
    ```
    The server will typically run on `http://localhost:3000`.

## Running a Test Script

Once the environment is set up, you can run a Playwright script. Here is an example script that navigates to the homepage and takes a screenshot:

```python
# example_test.py
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:3000")
    page.screenshot(path="screenshot.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
```

You can execute the script with:
```bash
python example_test.py
```
This will create a `screenshot.png` file in the same directory.
