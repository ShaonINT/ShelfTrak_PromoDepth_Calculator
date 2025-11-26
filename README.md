# ShelfTrak Promo Depth Calculator

A web-based tool designed to automatically calculate promotion depths from "Price & Promo" text descriptions. Built with HTML, CSS, and JavaScript, this tool runs entirely in your browser.

![ShelfTrak Logo](static/images/logo.png)

## Features

-   **Client-Side Processing**: All calculations happen directly in your browser. No data is uploaded to any server, ensuring privacy and speed.
-   **Advanced Calculation Logic (v15)**: Parses complex promo strings including:
    -   "Save X%" / "X% Off"
    -   "Buy X Get Y Free"
    -   "Was / Now" pricing
    -   "2 For $15" / "3 For $20"
    -   "Buy 1 Get 2nd for X"
    -   And many more special cases (SGD, Yen, etc.)
-   **Data Preview**: View the first 50 rows of calculated results directly in the browser before downloading.
-   **Row Count Stats**: Instant feedback on how many rows were processed.
-   **Smart Formatting**: The output Excel file automatically highlights high discounts (>85%) in red.
-   **Rules Documentation**: Includes a downloadable PDF of all calculation rules.
-   **User-Friendly Interface**: Drag-and-drop file upload with clear instructions and example images.

## Prerequisites

-   A modern web browser (Chrome, Firefox, Safari, Edge).

## Usage

### Running Locally

1.  **Clone or Download**:
    -   Clone the repository:
        ```bash
        git clone https://github.com/ShaonINT/ShelfTrak_PromoDepth_Calculator.git
        ```
    -   Or download the ZIP file and extract it.

2.  **Open the App**:
    -   Simply double-click `index.html` to open it in your default browser.
    -   Alternatively, you can serve it with a simple static server (e.g., `python -m http.server` or `npx serve`) if you prefer, but it is not required.

3.  **Prepare your data**:
    -   Ensure your Excel file (`.xlsx` or `.xls`) has a column named **"Price & Promo"** or **"Price & Promo Details"**.
    -   The format should be: `Base Price - Promo Text` (e.g., `400 - Save 33%`).

4.  **Upload and Calculate**:
    -   Drag and drop your file into the upload zone.
    -   Click "Calculate & Download".
    -   Review the preview table and download the full result.

## Deployment

This application is a **static website** (HTML/CSS/JS). It can be hosted on any static site hosting service, including:

-   **GitHub Pages** (Recommended)
-   Netlify
-   Vercel
-   Cloudflare Pages

No backend server (Python/Flask) is required.
