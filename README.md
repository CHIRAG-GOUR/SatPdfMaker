# Skillizee Student PDF Report Generator

This project is fully scaffolded and built locally per your request using **React (Vite), Node.js, Express, Puppeteer, and the Gemini API**.

## Core Folders & Architecture

- `server.js`: The Node.js Express backend. Handles file uploads, Excel parsing, AI summaries via Gemini, and PDF generation with Puppeteer.
- `/templates/report.hbs`: The Handlebars HTML/CSS template to generate the 4-page A4 PDF exactly to your requested specification.
- `/client`: The React frontend application.
- `/output`: Here is where your generated PDFs will be stored.
- `/uploads`: Temporary folder for handling multipart form data.

## Prerequisites
Ensure port `3000` is free for the backend, and port `5173` (or similar) is free for the Vite frontend.

---

## 🚀 How to Run the Project

You need **two** terminal windows open in this project folder.

### Terminal 1: Start the Backend (Node.js)
```bash
# From the root folder (E:\1. Skillizee\SAT Report 1-4)
node server.js
```
*You should see "Backend server running at http://localhost:3000"*

### Terminal 2: Start the Frontend (React)
```bash
# From the root folder, navigate to the client app
cd client

# Start Vite dev server
npm run dev
```
*Open the URL shown in the terminal (usually http://localhost:5173) in your browser.*

---

## 📊 Sample Excel Data Format

To generate reports correctly, ensure your `.xlsx` file uses the following headers on the very first row. The columns match the dynamic fields mapped in your reports:

| Name | Grade | Adaptability | Teamwork | Confidence | ProblemSolving | TimeManagement | Thinkers | Communicators |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Kuldeep Singh | 7 | 46 | 63 | 38 | 46 | 71 | 64 | 63 |
| Jane Doe | 7 | 85 | 90 | 75 | 80 | 88 | 90 | 85 |

*(Scores should be plain numbers out of 100)*

---

## What the tool does step-by-step:
1. **Reads files**: Accepts your chosen .xlsx file, Front Cover image, and Back Cover image.
2. **Converts Imagery**: Converts the covers into Base64 so Puppeteer can flawlessly embed them without HTTP network lags. 
3. **Pulls AI Output**: Foreach student, sends their row data to Gemini and writes a customized 2-3 sentence educator summary. (Can be skipped if API key is not provided/fails).
4. **Triggers Puppeteer**: Compiles `report.hbs` with the student's dataset, maps out standard A4 Pages `width: 210mm; height: 297mm;`, sets strict `page-break-always`, and prints `<StudentName>_Report.pdf` instantly inside the `/output/` folder.