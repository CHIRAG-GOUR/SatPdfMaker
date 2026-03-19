import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [excelFile, setExcelFile] = useState(null);
  const [frontCover, setFrontCover] = useState(null);
  const [page2Image, setPage2Image] = useState(null);
  const [backCover, setBackCover] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // Preview & Batch State
  const [session, setSession] = useState(null); // { sessionId, previewHtml, totalStudents, firstStudentName }
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, batchNumber }
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetGrade, setTargetGrade] = useState('all');
  const [generatedNames, setGeneratedNames] = useState([]); // List of newly generated student names

  const namesEndRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom of names list whenever it updates
    namesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [generatedNames]);


  const handleUpload = async (e) => {
    e.preventDefault();
    if (!excelFile || !frontCover || !page2Image || !backCover) {
        alert("Please upload all files (Excel, Front Cover, Page 2 Image, Back Cover).");
        return;
    }

    setLoading(true);
    setStatus('Uploading and parsing data... Getting a preview ready!');
    const formData = new FormData();
    formData.append('excel', excelFile);
    formData.append('frontCover', frontCover);
    formData.append('page2Image', page2Image);
    formData.append('backCover', backCover);
      formData.append('targetGrade', targetGrade);

    try {
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        if (data.error) {
           setStatus(`Error: ${data.error}`);
        } else {
           setStatus("Parsed successfully! Please check the preview below.");
           setSession(data);
           setGeneratedNames([]);
        }
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Failed to connect to the server. Is it running?");
    } finally {
      setLoading(false);
    }
  };

  const startBatchProcessing = async () => {
    setIsGenerating(true);
    let currentIdx = 0;
    let batchNumber = 1;
    let totalGenerated = 0;
    
    // Dynamically calculate batch size based on Total Students
    let dynamicBatchSize;
    if (session.totalStudents > 100) dynamicBatchSize = 25;
    else if (session.totalStudents >= 50) dynamicBatchSize = 15;
    else dynamicBatchSize = 10;
        
    setGeneratedNames([]);

    let localStatus = `Starting generation for ${session.totalStudents} reports using dynamic batch size of ${dynamicBatchSize}...`;
    setStatus(localStatus);
    setBatchProgress({ current: 0, total: session.totalStudents, batchNumber: 1 });

    while (currentIdx < session.totalStudents) {
      try {
        const nextBatchSize = Math.min(dynamicBatchSize, session.totalStudents - currentIdx);
        
        setStatus(`Batch ${batchNumber}: Generating reports [${currentIdx + 1} to ${currentIdx + nextBatchSize}] of ${session.totalStudents}...`);
        
        const response = await fetch('http://localhost:3000/api/generate_batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            startIndex: currentIdx,
            batchSize: nextBatchSize
          })
        });

        const data = await response.json();

        if (!response.ok) {
           throw new Error(data.error || "Batch failed");
        }
        
        // Append newly generated names
        if (data.files && data.files.length > 0) {
            const addedNames = data.files.map(f => f.name || "Unknown");
            setGeneratedNames(prev => [...prev, ...addedNames]);
        }

        totalGenerated += data.generatedCount || 0;
        currentIdx += dynamicBatchSize;
        batchNumber++;

        setBatchProgress({ current: Math.min(currentIdx, session.totalStudents), total: session.totalStudents, batchNumber });

      } catch (err) {
        console.error(err);
        setStatus(`Error during Batch ${batchNumber}: ${err.message}. Stopped.`);
        setIsGenerating(false);
        return;
      }
    }

    setStatus(`✅ All done! Successfully generated ${totalGenerated} reports. Enjoy!`);
    setIsGenerating(false);
  };

  return (
    <div className="container" style={{ maxWidth: session ? '1200px' : '600px' }}>
      <header className="app-header">
        <h1>🎓 Skillizee Report Generator</h1>
        <p>Batch generate Student PDF Reports securely powered by Node.js, Puppeteer & Gemini.</p>
      </header>

      <main className="form-container" style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        
        {!session && (
          <form onSubmit={handleUpload} style={{ flex: '1 1 400px' }}>
            <div className="form-group">
              <label htmlFor="excelFile">Student Data Master Sheet (Excel .xlsx)</label>
              <input
                type="file"
                id="excelFile"
                accept=".xlsx, .xls"
                onChange={(e) => setExcelFile(e.target.files[0])}
                required
              />
              <small>Upload the single master Excel file with all grades 1-4.</small>
            </div>

            <div className="form-group">
              <label htmlFor="frontCover">Front Cover Image (Page 1)</label>
              <input
                type="file"
                id="frontCover"
                accept="image/*"
                onChange={(e) => setFrontCover(e.target.files[0])}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="page2Image">Page 2 Image</label>
              <input
                type="file"
                id="page2Image"
                accept="image/*"
                onChange={(e) => setPage2Image(e.target.files[0])}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="backCover">Back Cover Image (Page 4)</label>
              <input
                type="file"
                id="backCover"
                accept="image/*"
                onChange={(e) => setBackCover(e.target.files[0])}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? "Analyzing Data..." : "Upload & Preview Initial Report"}
            </button>
          </form>
        )}

        {session && (
          <div style={{ flex: '1 1 100%' }}>
            
            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
              <h2>Review Report Preview for "{session.firstStudentName}"</h2>
              <p>Please check the UI below to make sure no pages are cut and shapes are round.</p>
              
              <div style={{ 
                border: '2px solid #333', 
                borderRadius: '8px', 
                overflow: 'hidden',
                height: '800px', // high enough to see scrolling content
                width: '100%',
                background: 'white',
                marginBottom: '20px'
              }}>
                <iframe 
                  title="PDF Preview"
                  srcDoc={session.previewHtml} 
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>

              <div style={{ padding: '20px', background: '#e1f5fe', borderRadius: '10px', textAlign: 'center' }}>
                <h3>Ready to generate all {session.totalStudents} reports?</h3>
                <p>The system will generate reports concurrently with real-time updates and optimized PDF file sizes.</p>
                <button 
                  onClick={startBatchProcessing} 
                  disabled={isGenerating} 
                  style={{ padding: '15px 30px', fontSize: '18px', background: '#0F8947', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '10px'}}
                >
                  {isGenerating ? "Generating..." : `Start Generating All ${session.totalStudents} Reports`}
                </button>
                &nbsp;&nbsp;
                <button 
                  onClick={() => { setSession(null); setStatus(null); setGeneratedNames([]); }} 
                  disabled={isGenerating} 
                  style={{ padding: '15px 30px', fontSize: '18px', background: '#ccc', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '10px'}}
                >
                  Cancel / Re-upload
                </button>
              </div>

              {(batchProgress || generatedNames.length > 0) && (
                <div style={{ marginTop: '20px', padding: '20px', background: 'white', border: '1px solid #ddd', borderRadius: '10px' }}>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px' }}>Real-Time Generation Status</h4>
                  {batchProgress && (
                    <>
                      <div style={{ width: '100%', background: '#ccc', height: '20px', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
                        <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, background: '#2980B9', height: '100%', transition: 'width 0.3s' }}></div>
                      </div>
                      <p style={{ textAlign: 'center', fontWeight: 'bold' }}>{batchProgress.current} / {batchProgress.total} Successfully Generated</p>
                    </>
                  )}
                  
                  {generatedNames.length > 0 && (
                    <div style={{ marginTop: '15px', background: '#f5f5f5', padding: '10px', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                       <p style={{ fontSize: '14px', marginBottom: '8px', color: '#555' }}>Recently Generated Students:</p>
                       <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#0F8947' }}>
                          {generatedNames.map((name, i) => (
                             <li key={i}>{i + 1}. {name}</li>
                          ))}
                          <div ref={namesEndRef} />
                       </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {status && (
          <div className={`status-message ${status.includes('Error') || status.includes('Failed') ? 'error' : 'success'}`} style={{ flex: '1 1 100%', marginTop: '20px' }}>
            {status}
          </div>
        )}

      </main>
    </div>
  );
}

export default App;


