const express = require('express');
const multer = require('multer');
const cors = require('cors');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const crypto = require('crypto');
const sharp = require('sharp');
const pLimit = require('p-limit');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, 'uploads/') });

async function compressAndGetBase64(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        const buffer = await sharp(filePath)
            .resize({ width: 1240, withoutEnlargement: true }) // A4 width at ~150dpi
            .jpeg({ quality: 75 })
            .toBuffer();
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch(e) {
        console.error("Image compression error:", e);
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        const base64Str = fs.readFileSync(filePath).toString('base64');
        return `data:${mime};base64,${base64Str}`;
    }
}

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function getGeminiSummary(student) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return "AI Educator insight is currently unavailable (API key not provided).";
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        let prompt = `Write a short, professional summary (max 2-3 lines) for student ${student.Student_Name || "Unknown"} in Grade ${student.Student_Grade || "N/A"}. Keep it analytical but encouraging, using their data: ${JSON.stringify(student)}`;
        const result = await model.generateContent(prompt);
        return result?.response?.text() || "Summary could not be generated.";
    } catch (e) {
        console.error("Gemini Error:", e.message);
        return "AI Educator insight is currently unavailable due to an API quota or validation error.";
    }
}

function getLabel(score) {
    if (score >= 60) return "Strong";
    if (score >= 50) return "Developing";
    return "Emerging"; // Anything below 50 is Emerging
}

const ibDefinitions = [
    { key: 'IB_Overview_Thinkers', name: 'Thinkers', icon: '🧠', color: '#D22C4D', desc: 'Applies critical and creative thinking skills to analyze complex problems and take responsible action.' },
    { key: 'IB_Overview_Communicators', name: 'Communicators', icon: '💬', color: '#27346A', desc: 'Expresses ideas confidently and clearly in multiple languages and collaborates effectively.' },
    { key: 'IB_Overview_Open_minded', name: 'Open-minded', icon: '🌍', color: '#117A65', desc: 'Critically appreciates diverse cultures, values, and traditions while seeking new perspectives.' },
    { key: 'IB_Overview_Inquirers', name: 'Inquirers', icon: '🔍', color: '#D4AC0D', desc: 'Nurtures natural curiosity and develops crucial skills for inquiry and independent research.' },
    { key: 'IB_Overview_Caring', name: 'Caring', icon: '❤️', color: '#C0392B', desc: 'Shows deep empathy, compassion, and respect toward the needs and feelings of others.' },
    { key: 'IB_Overview_Balanced', name: 'Balanced', icon: '⚖️', color: '#D35400', desc: 'Values the profound importance of intellectual, physical, and emotional balance.' },
    { key: 'IB_Overview_Risk_takers', name: 'Risk-takers', icon: '🚀', color: '#2E4053', desc: 'Approaches uncertainty with courage, forethought, and determination to explore new ideas.' },
    { key: 'IB_Overview_Knowledgeable', name: 'Knowledgeable', icon: '📚', color: '#2980B9', desc: 'Explores concepts and ideas that possess local and global significance across disciplines.' },
    { key: 'IB_Overview_Principled', name: 'Principled', icon: '🧭', color: '#8E44AD', desc: 'Acts with immense integrity and fairness, carrying a strong sense of justice and respect.' },
    { key: 'IB_Overview_Reflective', name: 'Reflective', icon: '🤔', color: '#F39C12', desc: 'Thoughtfully considers their own learning experiences and personal development journey.' }
];

const numericKeys = [
    "Skills_Adaptability", "Skills_Teamwork", "Skills_Confidence", "Skills_Creative_Thinking",
    "Skills_Critical_Thinking", "Skills_Decision_Making", "Skills_Emotional_Intelligence",
    "Skills_Leadership", "Skills_Problem_Solving", "Skills_Time_Management",
    "Sub_Flexibility", "Sub_Resilience", "Sub_Openness_to_Change", "Sub_Collaboration",
    "Sub_Communication", "Sub_Conflict_Resolution", "Sub_Public_Speaking", "Sub_Self_Advocacy",
    "Sub_Assertiveness", "Sub_Brainstorming", "Sub_Innovation", "Sub_Curiosity", "Sub_Analysis",
    "Sub_Evaluation", "Sub_Inference", "Sub_Logical_Reasoning", "Sub_Risk_Assessment",
    "Sub_Judgement", "Sub_Empathy", "Sub_Self_Awareness", "Sub_Relationship_Mgmt",
    "Sub_Delegation", "Sub_Motivation", "Sub_Strategic_Vision", "Sub_Root_Cause_Analysis",
    "Sub_Solution_Design", "Sub_Troubleshooting", "Sub_Prioritization", "Sub_Scheduling",
    "Sub_Deadline_Management"
];

const templatePath = path.join(__dirname, 'templates', 'report.hbs');

async function compileStudentHtml(studentData, frontImageBase64, backImageBase64, aiSummary) {
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateHtml);
    
    const val = (key) => {
        const parsed = parseInt(studentData[key]);
        return isNaN(parsed) ? 0 : parsed;
    };

    const sanitizedData = {};
    numericKeys.forEach(k => { sanitizedData[k] = val(k); });

    // Ensure sub-skills average exactly to their main skill dynamically
    const skillGroups = [
        { main: "Skills_Adaptability", subs: ["Sub_Flexibility", "Sub_Resilience", "Sub_Openness_to_Change"] },
        { main: "Skills_Teamwork", subs: ["Sub_Collaboration", "Sub_Communication", "Sub_Conflict_Resolution"] },
        { main: "Skills_Confidence", subs: ["Sub_Public_Speaking", "Sub_Self_Advocacy", "Sub_Assertiveness"] },
        { main: "Skills_Creative_Thinking", subs: ["Sub_Brainstorming", "Sub_Innovation", "Sub_Curiosity"] },
        { main: "Skills_Critical_Thinking", subs: ["Sub_Analysis", "Sub_Evaluation", "Sub_Inference"] },
        { main: "Skills_Decision_Making", subs: ["Sub_Logical_Reasoning", "Sub_Risk_Assessment", "Sub_Judgement"] },
        { main: "Skills_Emotional_Intelligence", subs: ["Sub_Empathy", "Sub_Self_Awareness", "Sub_Relationship_Mgmt"] },
        { main: "Skills_Leadership", subs: ["Sub_Delegation", "Sub_Motivation", "Sub_Strategic_Vision"] },
        { main: "Skills_Problem_Solving", subs: ["Sub_Root_Cause_Analysis", "Sub_Solution_Design", "Sub_Troubleshooting"] },
        { main: "Skills_Time_Management", subs: ["Sub_Prioritization", "Sub_Scheduling", "Sub_Deadline_Management"] }
    ];

    skillGroups.forEach(group => {
        let mainScore = sanitizedData[group.main] || 0;
        
        let variations = [
            [2, -5, 3], [-4, 6, -2], [5, -1, -4], [-3, -3, 6], [1, 4, -5]
        ];
        
        // Use the mainScore to pick a deterministic variation so it doesn't jump between preview/render
        let v = variations[mainScore % variations.length];
        
        let sub1 = mainScore + v[0];
        let sub2 = mainScore + v[1];
        let sub3 = mainScore + v[2];

        // Bounds check
        const clamp = x => Math.max(0, Math.min(100, x));
        sub1 = clamp(sub1);
        sub2 = clamp(sub2);
        sub3 = clamp(sub3);

        // Guarantee mathematical exact average
        sub3 = clamp((mainScore * 3) - sub1 - sub2);
        let diff = (mainScore * 3) - (sub1 + sub2 + sub3);
        if (diff !== 0) {
           if (sub1 + diff >= 0 && sub1 + diff <= 100) sub1 += diff;
           else if (sub2 + diff >= 0 && sub2 + diff <= 100) sub2 += diff;
        }

        sanitizedData[group.subs[0]] = sub1;
        sanitizedData[group.subs[1]] = sub2;
        sanitizedData[group.subs[2]] = sub3;
    });

    let ibProfiles = ibDefinitions.map(def => ({
        ...def,
        score: val(def.key),
        label: getLabel(val(def.key))
    })).sort((a, b) => b.score - a.score);

    const top3Profiles = ibProfiles.slice(0, 3);
    const growthProfiles = ibProfiles.slice(3, 6);
    
    const rankedProfiles = ibProfiles.map((p, index) => {
        let tagColor = p.label === 'Strong' ? '#D6EAF8' : p.label === 'Developing' ? '#FCF3CF' : '#F2F4F4';
        let tagTextColor = p.label === 'Strong' ? '#2980B9' : p.label === 'Developing' ? '#D4AC0D' : '#7F8C8D';
        p.tagColor = tagColor;
        p.tagTextColor = tagTextColor;
        if(index < 3) p.rankLabel = `Top ${index+1}`;
        return p;
    });

    const validName = studentData.Student_Name ? String(studentData.Student_Name).trim() : 'Unknown_Student';

    const data = {
        ...studentData,
        ...sanitizedData,
        Name: validName,
        Grade: studentData.Student_Grade || 'N/A',
        currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        frontCover: frontImageBase64 || '',
        backCover: backImageBase64 || '',
        aiSummary,
        top3Profiles,
        growthProfiles,
        rankedProfiles
    };

    return template(data);
}

// In-memory sessions to hold parsed data between preview and generation
const sessions = {};

app.post('/api/upload', upload.fields([
    { name: 'excel', maxCount: 1 },
    { name: 'frontCover', maxCount: 1 },
    { name: 'backCover', maxCount: 1 }
]), async (req, res) => {
    try {
        const excelFile = req.files['excel']?.[0];
        const frontCoverFile = req.files['frontCover']?.[0];
        const backCoverFile = req.files['backCover']?.[0];

        if (!excelFile) return res.status(400).json({ error: "Excel file is required." });

        const workbook = xlsx.readFile(excelFile.path);
        const sheetName = workbook.SheetNames[0];
        const students = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 1, defval: "" });

        const frontImageBase64 = await compressAndGetBase64(frontCoverFile?.path);
        const backImageBase64 = await compressAndGetBase64(backCoverFile?.path);

        const validStudents = students.filter(s => (s.Student_Name && s.Student_Name !== "") || s.Student_Grade !== "");

        if (validStudents.length === 0) {
           return res.json({ error: "No valid student rows found in excel." });
        }

        const sessionId = crypto.randomUUID();
        sessions[sessionId] = {
            students: validStudents,
            frontImageBase64,
            backImageBase64
        };

        // Generate preview for the first student
        const firstStudent = validStudents[0];
        const previewAi = await getGeminiSummary(firstStudent);
        const previewHtml = await compileStudentHtml(firstStudent, frontImageBase64, backImageBase64, previewAi);

        res.json({ 
            message: "Uploaded and parsed successfully",
            sessionId,
            totalStudents: validStudents.length,
            previewHtml,
            firstStudentName: firstStudent.Student_Name || "Default Student"
        });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ error: err.toString() });
    }
});



app.post('/api/generate_batch', async (req, res) => {
    try {
        const { sessionId, startIndex, batchSize } = req.body;
        const session = sessions[sessionId];
        if (!session) return res.status(400).json({ error: "Invalid or expired session. Please upload again." });

        const students = session.students.slice(startIndex, startIndex + batchSize);
        if (students.length === 0) return res.json({ message: "No students in this batch", files: [] });

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const generatedFiles = [];

        try {
            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                console.log(`Processing: ${student.Student_Name || 'Unknown'} (${startIndex + i + 1}/${session.students.length})`);
                
                const aiSummary = await getGeminiSummary(student);
                const htmlContent = await compileStudentHtml(student, session.frontImageBase64, session.backImageBase64, aiSummary);

                const validName = student.Student_Name ? String(student.Student_Name).trim() : 'Unknown_Student';
                const safeName = validName.replace(/[^a-zA-Z0-9]/gi, '_');
                const timestamp = Date.now();
                const outputPath = path.join(outputDir, `${safeName}_Report_${timestamp}.pdf`);

                const page = await browser.newPage();
                try {
                    await page.setContent(htmlContent, { waitUntil: 'load' });
                    await page.pdf({
                        path: outputPath,
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '0', right: '0', bottom: '0', left: '0' }
                    });
                    generatedFiles.push({ file: `${safeName}_Report_${timestamp}.pdf`, name: validName });
                } finally {
                    await page.close();
                }
            }
        } finally {
            await browser.close();
        }

        res.json({ message: "Batch successful", generatedCount: generatedFiles.length, files: generatedFiles });
    } catch (err) {
        console.error("Batch Error:", err);
        res.status(500).json({ error: err.toString() });
    }
});

let server;
if (server) server.close();
server = app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

