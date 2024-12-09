import React, { useState, useMemo } from 'react';
import axios from 'axios';
import Annotator from './components/Annotator';
import './App.css';
import { ENDPOINTS } from './utils';
import { useJobs } from './hooks/useJobs';
import { LinearProgress, Typography } from '@mui/material';
import { LoadingButton } from '@mui/lab';
import { ArrowBack, DocumentScanner } from '@mui/icons-material';
import { Link } from 'react-router';
const App = () => {
  // State hooks
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPages, setSelectedPages] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [selectedPagesForExtract, setSelectedPagesForExtract] = useState<Set<number>>(new Set());
  const [dropdownSelections, setDropdownSelections] = useState<{ [page: number]: number }>({});
  const [loading, setLoading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const { addJob, jobs } = useJobs();
  // File input handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFile(event.target.files[0]);
    }
  };

  // Categorize API call
  const categorize = async () => {
    setLoading(true);
    if (!selectedFile) {
      alert("Please select a PDF file first.");
      setLoading(false);
      return;
    }

    const form = new FormData();
    form.append('pdf_file', selectedFile);
    form.append('selected_pages', selectedPages);

    try {
      const response = await axios.post(ENDPOINTS.CATEGORIZE, form, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200 && Array.isArray(response.data)) {
        setResponse(response.data);

        // Set initial DPI from response data
        const initialDropdownSelections: { [page: number]: number } = {};
        response.data.forEach((result: any) => {
          if (result.dpi === 275 || result.dpi === 300) {
            initialDropdownSelections[result.page_num] = result.dpi;
          }
        });
        setDropdownSelections(initialDropdownSelections);

        setLoading(false);
      } else {
        setLoading(false);
        throw new Error("Response status is not 200 or response data is not an array");
      }
    } catch (error) {
      setLoading(false);
      console.error("Error:", error);
    }
  };

  // Prepare data for extraction
  const transformedData = useMemo(() => {
    if (!response) return {};
    return {
      pdf_file: selectedFile,
      data: response.map((item: any) => ({
        page_num: item.page_num,
        category: item.category,
        dpi: dropdownSelections[item.page_num] || item.dpi,
        bbox: item.bbox.bbox_data.map((box: any) => ({
          class_id: box.class_id || 1,
          xyxy: box.xyxy,
        })),
      })),
    };
  }, [response, selectedFile, dropdownSelections]);

  // Extract PDF data
  const onExtract = () => {
    setLoading(true);
    if (!selectedFile) {
      alert("Please select a PDF file first.");
      setLoading(false);
      return;
    }
    const formData = new FormData();

    formData.append('pdf_file', selectedFile);
    formData.append(
      'data',
      JSON.stringify(
        transformedData.data.filter((item: any) => selectedPagesForExtract.has(item.page_num))
      ))
    axios
      .post(ENDPOINTS.EXTRACT,
        formData)
      .then((response) => {
        const serverJobId = response.data.claude_job_id;
        const expTime = response.data.time_est; // in seconds
        console.log(response.data, "serverJobId");
        if (serverJobId) {
          setCurrentJobId(serverJobId);

          addJob({
            jobId: serverJobId,
            fileName: selectedFile.name,
            status: 'in_progress',
            expTime, // Include expTime
            startTime: Date.now(), // Record the start time
            progress: 0,
            fileUrlToDownload: null,
          });
          setLoading(false);

        }
        setLoading(false);

        // Polling will be handled centrally
      })
      .catch(() => {
        setLoading(false);
        setCurrentJobId(null);

        // setError({
        //   status: 500,
        //   message: "An error occurred during extraction.",
        // });
      });
  };

  // Checkbox toggle
  const togglePageSelection = (pageNum: number) => {
    setSelectedPagesForExtract((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pageNum)) {
        newSet.delete(pageNum);
      } else {
        newSet.add(pageNum);
      }
      return newSet;
    });
  };

  // Handle DPI dropdown change
  const handleDropdownChange = (pageNum: number, value: number) => {
    // Update dropdown selection immediately
    setDropdownSelections((prev) => ({
      ...prev,
      [pageNum]: value,
    }));

    const dpiApi = async (pageNum: number, dpiValue: number) => {
      setLoading(true);

      if (!selectedFile) {
        alert("Please select a PDF file first.");
        setLoading(false);
        return;
      }
      const pages = transformedData.data.map((page: any) => {
        const { page_num, bbox } = page;
        const transformedBbox = bbox.map((box: any) => {
          // Calculate xywh from xyxy
          const [x1, y1, x2, y2] = box.xyxy;
          const width = x2 - x1;
          const height = y2 - y1;
          const x = x1; // Assuming x1 is the left coordinate
          const y = y1; // Assuming y1 is the top coordinate

          return {
            xyxy: box.xyxy,
            xywh: [x, y, width, height],
          };
        });

        return {
          page_num,
          bbox: transformedBbox,
        };
      });

      const form = new FormData();
      form.append("pdf_file", selectedFile);
      form.append("dpi", dpiValue.toString());
      form.append("pages", JSON.stringify(pages));
      try {
        const response = await axios.post(ENDPOINTS.SET_DPI, form, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "multipart/form-data",
          },
        });

        if (response.status === 200) {
          // Update the response state with the modified data
          setResponse((prev: any) => {
            const updatedResponse = prev.map((item: any) => {
              if (item.page_num === pageNum) {
                return {
                  ...item,
                  dpi: dpiValue, // Update DPI
                  bbox: {
                    ...item.bbox,
                    bbox_data: response.data.updated_bbox_data || item.bbox.bbox_data, // Update bbox_data from API response
                  },
                };
              }
              return item; // Keep other pages unchanged
            });
            return updatedResponse;
          });

          console.log("DPI updated successfully");
        } else {
          throw new Error("Failed to update DPI.");
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    // Trigger DPI API call for the selected page
    dpiApi(pageNum, value);
  };

  console.log(jobs, "jobs")
  // Render the component
  const currentJobIdStatus = useMemo(() => {
    if (currentJobId && jobs && jobs.length > 0) {
      return jobs.find((job: any) => job.jobId === currentJobId);
    }
    return null;
  }, [currentJobId, jobs]);
  return (
    <div className="App bg-gray-100 min-h-screen flex flex-col relative">
      <Link to="/">
        <LoadingButton
          variant="contained"
          startIcon={<ArrowBack />}
          size="large"
          color='primary'
          sx={{ mt: "30px", position: 'absolute', top: 0, right: "30px" }}
        >
          <Typography variant="button">Go back</Typography>
        </LoadingButton>
      </Link>
      {/* Header */}
      <Typography variant="h3" color='primary' sx={{ my: "30px", fontWeight: "bold" }}>Doc Extractor</Typography>

      {/* Main Content */}
      {loading ? (<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
        {/* Spinner */}
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
      </div>) : (
        <div className="flex-1 flex flex-col items-center gap-6 px-4 mb-[100px]">
          {/* File Input Section */}
          <div className="flex flex-col justify-center items-center gap-6">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="border border-gray-300 rounded-md p-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
            />
            <input
              type="text"
              value={selectedPages}
              onChange={(e) => setSelectedPages(e.target.value)}
              placeholder="Enter pages (e.g., 1,2,3 or 1-5)"
              className="border border-gray-300 rounded-md p-2 bg-white shadow-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
            />

            <LoadingButton
              variant="contained"
              startIcon={<DocumentScanner />}
              size="large"
              onClick={categorize}
              color='primary'
              sx={{ mt: "30px" }}
            >
              <Typography variant="button">Upload and Categorize</Typography>
            </LoadingButton>
          </div>

          {/* Annotator Component */}
          {response && (
            <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto p-4 bg-white rounded-lg shadow-md">
              {response.map((result: any, index: number) => (
                <div
                  key={result.page_num}
                  className="mt-8 p-4 bg-white shadow-md rounded-lg w-full max-w-3xl mx-auto"
                >
                  <h2 className="text-xl font-bold text-gray-800">
                    Page {result.page_num} - {result.category}
                  </h2>

                  {/* Checkbox and DPI dropdown */}
                  <div className="flex justify-between gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`page-${result.page_num}`}
                        checked={selectedPagesForExtract.has(result.page_num)}
                        onChange={() => togglePageSelection(result.page_num)}
                        className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor={`page-${result.page_num}`} className="text-gray-700">
                        Select for extraction
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`dpi-${result.page_num}`} className="text-gray-700">
                        Set  DPI:
                      </label>
                      <select

                        value={dropdownSelections[result.page_num] || ''}
                        onChange={(e) => handleDropdownChange(result.page_num, parseInt(e.target.value))}
                        className="border border-gray-300 rounded-md p-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
                      >
                        <option value="" disabled>
                          Select a value
                        </option>
                        <option value="275">275</option>
                        <option value="300">300</option>
                      </select>
                    </div>

                  </div>

                  {/* Annotator component for this page */}
                  <Annotator
                    selectedFile={selectedFile}
                    selectedPagesToExtract={[result.page_num]}
                    markerData={[result]}
                    setMarkerData={(updatedMarkerData: any) => {
                      // Update the response state
                      setResponse((prev: any) => {
                        const newResponse = [...prev];
                        newResponse[index] = {
                          ...newResponse[index],
                          ...updatedMarkerData[0],
                        };
                        return newResponse;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Buttons */}
      {transformedData.pdf_file && selectedPagesForExtract?.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-200 py-4 shadow-md z-20 px-[10%]">
          {currentJobIdStatus ? (
            <div key={currentJobIdStatus.jobId} style={{ marginBottom: '20px' }}>
              <Typography variant="overline"
                sx={{
                  fontWeight: "600",
                  display: "block",
                }}>{currentJobIdStatus.fileName}</Typography>
              <div className='flex justify-between'>
                <Typography variant="overline"
                  sx={{
                    fontWeight: "600",
                  }}>Status: {currentJobIdStatus.status}</Typography>
                <Typography variant="overline"
                  sx={{
                    fontWeight: "600",
                  }}> {currentJobIdStatus.progress}%</Typography>
              </div>
              <LinearProgress color="success" variant="determinate" value={currentJobIdStatus.progress} />
              {currentJobIdStatus.status === 'completed' && (
                <a
                  href={currentJobIdStatus.fileUrlToDownload}
                  download={`${currentJobIdStatus.fileName.slice(0, -4)}.xlsx`}
                  target="_blank"
                  rel="noopener noreferrer"

                >
                  <LoadingButton
                    variant="contained"
                    startIcon={<DocumentScanner />}
                    size="large"
                    color='success'
                    sx={{ mt: "30px" }}
                  >
                    <Typography variant="button">Download Extracted Data</Typography>
                  </LoadingButton>
                </a>
              )}

              <Link
                to='/'
              >
                <LoadingButton
                  variant="contained"
                  startIcon={<DocumentScanner />}
                  size="large"
                  color='primary'
                  sx={{ mt: "30px", ml: `${currentJobIdStatus.status === 'completed' ? '10px' : '0px'}` }}
                >
                  <Typography variant="button">Do you want to extract more?</Typography>
                </LoadingButton>
              </Link>

            </div>
          ) : (
            <LoadingButton
              variant="contained"
              startIcon={<DocumentScanner />}
              size="large"
              onClick={onExtract}
              color='primary'
              sx={{ mt: "30px" }}
            >
              <Typography variant="button">Extract Data</Typography>
            </LoadingButton>

          )}
        </div>
      )}
    </div>
  );
};

// export default App;
export default React.memo(App);
