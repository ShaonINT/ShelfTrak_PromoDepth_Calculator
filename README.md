# ShelfTrak Promo Depth Calculator

A web-based tool designed to automatically calculate promotion depths from "Price & Promo" text descriptions. Built with Python (Flask) and Pandas.

![ShelfTrak Logo](static/images/logo.png)

## Features

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

-   Python 3.8 or higher
-   pip (Python package installer)

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/ShaonINT/ShelfTrak_PromoDepth_Calculator.git
    cd ShelfTrak_PromoDepth_Calculator
    ```

2.  **Create a virtual environment** (optional but recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  **Run the application**:
    ```bash
    python app.py
    ```

2.  **Open your browser**:
    Navigate to `http://127.0.0.1:5000`

3.  **Prepare your data**:
    -   Ensure your Excel file (`.xlsx` or `.xls`) has a column named **"Price & Promo"** or **"Price & Promo Details"**.
    -   The format should be: `Base Price - Promo Text` (e.g., `400 - Save 33%`).

4.  **Upload and Calculate**:
    -   Drag and drop your file into the upload zone.
    -   Click "Calculate & Download".
    -   Review the preview table and download the full result.

## Deployment Note

This application is built using **Flask (Python)**, which requires a backend server to run the calculation logic.

**GitHub Pages** is designed for *static* websites (HTML/CSS/JS only) and **cannot** host this application directly.

To deploy this app online, you should use a platform that supports Python web apps, such as:
-   **Render** (has a free tier)
-   **Railway**
-   **Heroku**
-   **PythonAnywhere**
