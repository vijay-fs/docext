import React, { useState, useMemo } from 'react';
import axios from 'axios';
import Annotator from './components/Annotator';
import './App.css';
import { ENDPOINTS } from './utils';
const App = () => {
  // State hooks
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [selectedPages, setSelectedPages] = useState("201, 202");
  const [response, setResponse] = useState<any>(null);
  const [selectedPagesForExtract, setSelectedPagesForExtract] = useState<Set<number>>(new Set());
  const [dropdownSelections, setDropdownSelections] = useState<{ [page: number]: number }>({});
  const [loading, setLoading] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // File input handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFile(event.target.files[0]);
      setFileName(event.target.files[0].name);
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
  const extractDoc = async () => {
    setLoading(true);
    setExtractLoading(true);

    if (!selectedFile) {
      alert("Please select a PDF file first.");
      setExtractLoading(false);
      setLoading(false);
      return;
    }

    const form2 = new FormData();
    form2.append('pdf_file', selectedFile);
    form2.append(
      'data',
      JSON.stringify(
        transformedData.data.filter((item: any) => selectedPagesForExtract.has(item.page_num))
      )
    );
    try {
      const response = await axios.post(ENDPOINTS.EXTRACT, form2, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob',
      });

      if (response.status === 200) {
        const fileUrl = window.URL.createObjectURL(new Blob([response.data]));
        setFileUrl(fileUrl);
        setExtractLoading(false);
        setLoading(false);
      } else {
        setExtractLoading(false);
        setLoading(false);
        throw new Error("Failed to extract data from the PDF.");
      }
    } catch (error) {
      setExtractLoading(false);
      setLoading(false);
      console.error("Error:", error);
    }
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


  // Render the component
  return (
    <div className="App bg-gray-100 min-h-screen flex flex-col">
      {/* Header */}
      <h1 className="text-4xl font-extrabold text-center text-blue-600 my-8">
        Doc Extractor
      </h1>
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
              placeholder="Enter pages (e.g., 1,2,3)"
              className="border border-gray-300 rounded-md p-2 bg-white shadow-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
            />

            <button
              onClick={categorize}
              className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-blue-700 transition duration-300"
            >
              Upload and Categorize PDF
            </button>
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
      <div className="fixed bottom-0 left-0 right-0 bg-gray-200 py-4 shadow-md z-20">
        <div className="flex justify-center items-center gap-4">
          {extractLoading ? (
            <p className="text-lg font-medium text-gray-700">Extracting...</p>
          ) : (
            <button
              onClick={extractDoc}
              className="bg-green-600 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-green-700 transition duration-300"
            >
              Upload and Extract PDF
            </button>
          )}
          {fileUrl && (
            <a
              href={fileUrl}
              download={`${fileName.slice(0, -4)}.xlsx`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Download Extracted Data
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
