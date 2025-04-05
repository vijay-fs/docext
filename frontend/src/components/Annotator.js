import React, { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Image as KonvaImage,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import axios from "axios";
import { ENDPOINTS } from "../utils";
import { ZoomIn, ZoomOut, Maximize, Move, Square } from "lucide-react";

const BoxAnnotation = ({
  box,
  isSelected,
  onSelect,
  onChange,
  scaleX,
  scaleY,
  stageScale,
  imageWidth,
  imageHeight,
  currentTool,
}) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  // Convert box coordinates to stage coordinates based on the original image dimensions
  const x = box.xyxy[0];
  const y = box.xyxy[1];
  const width = box.xyxy[2] - box.xyxy[0];
  const height = box.xyxy[3] - box.xyxy[1];

  return (
    <>
      <Rect
        ref={shapeRef}
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(239, 68, 68, 0.1)"
        stroke="#EF4444"
        strokeWidth={2 / stageScale}
        onClick={onSelect}
        onTap={onSelect}
        draggable={currentTool === "select" && isSelected} // Only draggable in select mode and when selected
        onDragEnd={(e) => {
          // Update box position in parent component
          const node = e.target;
          const newBox = {
            ...box,
            xyxy: [
              node.x(),
              node.y(),
              node.x() + node.width(),
              node.y() + node.height(),
            ],
            xywh: [
              node.x() + node.width() / 2,
              node.y() + node.height() / 2,
              node.width(),
              node.height(),
            ],
          };
          onChange(newBox);
        }}
        onTransformEnd={(e) => {
          // Update box dimensions in parent component
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          // Reset scale to avoid accumulation
          node.scaleX(1);
          node.scaleY(1);

          const newWidth = Math.max(5, node.width() * scaleX);
          const newHeight = Math.max(5, node.height() * scaleY);

          node.width(newWidth);
          node.height(newHeight);

          const newBox = {
            ...box,
            xyxy: [
              node.x(),
              node.y(),
              node.x() + newWidth,
              node.y() + newHeight,
            ],
            xywh: [
              node.x() + newWidth / 2,
              node.y() + newHeight / 2,
              newWidth,
              newHeight,
            ],
          };
          onChange(newBox);
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          borderStroke="#3B82F6"
          borderStrokeWidth={1}
          anchorStroke="#3B82F6"
          anchorFill="#FFFFFF"
          anchorSize={8}
          anchorCornerRadius={2}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit resize to minimum dimensions
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

const ImageAnnotator = ({
  currentPage,
  index,
  markerState,
  onMarkerChange,
  dpi,
  filteredPages,
  selectedFile,
}) => {
  const [image] = useImage(
    `data:image/png;base64,${currentPage?.bbox?.actual_image}`
  );
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState("pan"); // "pan", "select", or "create"
  const [isDrawing, setIsDrawing] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState(null);
  const stageRef = useRef(null);

  // Handle scale factors based on image dimensions and container size
  const containerWidth = 700; // Reduced container width
  const containerHeight = 600; // Reduced container height

  // Calculate the original dimensions and DPI scale
  const originalDpi = currentPage?.original_dpi || currentPage?.dpi || 72;
  const dpiScale = currentPage?.dpi ? currentPage.dpi / originalDpi : 1;

  // Scale image dimensions based on DPI
  const originalWidth = currentPage?.bbox?.width || (image ? image.width : 800);
  const originalHeight =
    currentPage?.bbox?.height || (image ? image.height : 600);

  // Apply DPI scaling to image dimensions
  const scaledWidth = originalWidth * dpiScale;
  const scaledHeight = originalHeight * dpiScale;

  // Handle window wheel for zooming
  const handleWheel = (e) => {
    if (tool !== "pan") return;

    e.evt.preventDefault();

    const stage = stageRef.current;
    const oldScale = scale;

    // Calculate new scale - limit zoom in/out
    const newScale =
      e.evt.deltaY < 0
        ? Math.min(oldScale * 1.1, 10)
        : Math.max(oldScale / 1.1, 0.1);

    // Get pointer position
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    // Calculate new position to zoom toward pointer
    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setScale(newScale);
    setPosition(newPos);
  };

  // Handle drag move for panning
  const handleDragMove = (e) => {
    if (tool !== "pan") return;

    setPosition({
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  // Handle box change
  const handleBoxChange = (updatedBox) => {
    if (!markerState) return;

    // Deep clone the markerState to avoid reference issues
    const markerStateClone = JSON.parse(JSON.stringify(markerState));

    // Update the specific box in the marker state
    const updatedMarkers = markerStateClone.map((box) => {
      if (box === selectedBoxId) {
        return updatedBox;
      }
      return box;
    });

    // Notify parent of changes
    onMarkerChange(updatedMarkers, index);

    // Force backend save after drag
    saveDraggedBoxes(updatedMarkers, index);
  };

  // Save dragged boxes to backend immediately
  const saveDraggedBoxes = (markers, idx) => {
    // This ensures changes persist on refresh
    const currentPage = filteredPages[idx];
    const dpiScale = currentPage.dpi
      ? currentPage.dpi / (currentPage.original_dpi || 72)
      : 1;

    // Update the filtered pages with new marker data
    const updatedFilteredMarkerData = [...filteredPages];
    updatedFilteredMarkerData[idx].bbox.bbox_data = markers.map((marker) => {
      // Revert back to original scale for backend storage
      const originalXyxy = marker.originalXyxy || [
        marker.xyxy[0] / dpiScale,
        marker.xyxy[1] / dpiScale,
        marker.xyxy[2] / dpiScale,
        marker.xyxy[3] / dpiScale,
      ];

      const originalXywh = [
        marker.xywh[0] / dpiScale,
        marker.xywh[1] / dpiScale,
        marker.xywh[2] / dpiScale,
        marker.xywh[3] / dpiScale,
      ];

      return {
        class_id: marker.class_id || 1,
        xyxy: originalXyxy,
        xywh: originalXywh,
      };
    });

    // Save to backend explicitly
    const formData = new FormData();
    formData.append("file_name", selectedFile?.name);
    formData.append("pg_no", currentPage?.page_num);
    formData.append("category", currentPage?.category);
    formData.append(
      "bbox_data",
      JSON.stringify(updatedFilteredMarkerData[idx].bbox.bbox_data)
    );

    axios
      .post(ENDPOINTS.SAVE_M_OBB, formData)
      .then(function (response) {
        console.log(
          `Box modifications saved for page: ${currentPage?.page_num}`,
          response?.data?.message
        );
      })
      .catch(function ({ response }) {
        console.log(
          `Error saving box modifications for page: ${currentPage?.page_num}`,
          response
        );
      });
  };

  // Handle mouse down for creating new annotations
  const handleMouseDown = (e) => {
    if (tool !== "create" || !stageRef.current) return;

    const stage = stageRef.current;
    const point = stage.getPointerPosition();

    // Convert to unscaled coordinates
    const x = (point.x - position.x) / scale;
    const y = (point.y - position.y) / scale;

    setIsDrawing(true);
    setNewAnnotation({
      x,
      y,
      width: 0,
      height: 0,
    });
  };

  // Handle mouse move for creating new annotations
  const handleMouseMove = (e) => {
    if (!isDrawing || !newAnnotation || tool !== "create") return;

    const stage = stageRef.current;
    const point = stage.getPointerPosition();

    // Convert to unscaled coordinates
    const x = (point.x - position.x) / scale;
    const y = (point.y - position.y) / scale;

    setNewAnnotation({
      ...newAnnotation,
      width: x - newAnnotation.x,
      height: y - newAnnotation.y,
    });
  };

  // Handle mouse up for creating new annotations
  const handleMouseUp = () => {
    if (!isDrawing || !newAnnotation || tool !== "create") return;

    setIsDrawing(false);

    // Only add annotation if size is reasonable
    if (
      Math.abs(newAnnotation.width) > 5 &&
      Math.abs(newAnnotation.height) > 5
    ) {
      // Fix negative dimensions
      let x = newAnnotation.x;
      let y = newAnnotation.y;
      let width = newAnnotation.width;
      let height = newAnnotation.height;

      if (width < 0) {
        x += width;
        width = Math.abs(width);
      }

      if (height < 0) {
        y += height;
        height = Math.abs(height);
      }

      // Create new annotation object
      const xyxy = [x, y, x + width, y + height];
      const xywh = [x + width / 2, y + height / 2, width, height];

      // Calculate original unscaled coordinates for backend
      const dpiScale = currentPage.dpi
        ? currentPage.dpi / (currentPage.original_dpi || 72)
        : 1;
      const originalXyxy = [
        xyxy[0] / dpiScale,
        xyxy[1] / dpiScale,
        xyxy[2] / dpiScale,
        xyxy[3] / dpiScale,
      ];

      const newBox = {
        fillColor: "transparent",
        strokeColor: "#EF4444",
        strokeWidth: 3,
        strokeDasharray: "",
        opacity: 1,
        left: x,
        top: y,
        width: width,
        height: height,
        rotationAngle: 0,
        visualTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        containerTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        typeName: "FrameMarker",
        state: "select",
        class_id: 1,
        xyxy: xyxy,
        xywh: xywh,
        originalXyxy: originalXyxy,
      };

      // Add to marker state
      const newMarkerState = [...(markerState || []), newBox];
      onMarkerChange(newMarkerState, index);

      // Force backend save for new annotation
      saveDraggedBoxes(newMarkerState, index);
    }

    setNewAnnotation(null);
  };

  // Reset view to fit image in container
  const resetView = () => {
    if (!image) return;

    // Calculate scale to fit image in container based on scaled dimensions
    const scaleX = containerWidth / scaledWidth;
    const scaleY = containerHeight / scaledHeight;
    const newScale = Math.min(scaleX, scaleY) * 0.9; // 90% of fit

    setScale(newScale);
    setPosition({
      x: (containerWidth - scaledWidth * newScale) / 2,
      y: (containerHeight - scaledHeight * newScale) / 2,
    });
  };

  // Zoom in function
  const zoomIn = () => {
    const newScale = Math.min(scale * 1.2, 10);
    setScale(newScale);
    // Adjust position to keep center
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    setPosition({
      x: centerX - ((centerX - position.x) / scale) * newScale,
      y: centerY - ((centerY - position.y) / scale) * newScale,
    });
  };

  // Zoom out function
  const zoomOut = () => {
    const newScale = Math.max(scale / 1.2, 0.1);
    setScale(newScale);
    // Adjust position to keep center
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    setPosition({
      x: centerX - ((centerX - position.x) / scale) * newScale,
      y: centerY - ((centerY - position.y) / scale) * newScale,
    });
  };

  // Reset view when image or DPI changes
  useEffect(() => {
    if (image) {
      resetView();
    }
  }, [image, dpi]);

  // Ensure no box is selected when marker state changes
  useEffect(() => {
    setSelectedBoxId(null);
  }, [markerState]);

  // If image isn't loaded yet, show loading
  if (!image) {
    return (
      <div
        className="loading-container"
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          backgroundColor: "#f9fafb",
          marginTop: "70px",
        }}
      >
        <div
          className="spinner"
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid rgba(0, 0, 0, 0.1)",
            borderLeftColor: "#3B82F6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        ></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div
        className="toolbar"
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 2,
          display: "flex",
          gap: "8px",
          background: "white",
          padding: "6px",
          borderRadius: "6px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
      >
        <button
          onClick={() => setTool("pan")}
          style={{
            padding: "8px",
            background: tool === "pan" ? "#EBF5FF" : "white",
            color: tool === "pan" ? "#3B82F6" : "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Pan Tool"
        >
          <Move size={18} />
        </button>
        <button
          onClick={() => setTool("select")}
          style={{
            padding: "8px",
            background: tool === "select" ? "#EBF5FF" : "white",
            color: tool === "select" ? "#3B82F6" : "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Select Tool"
        >
          <Square size={18} />
        </button>
        <button
          onClick={() => setTool("create")}
          style={{
            padding: "8px",
            background: tool === "create" ? "#EBF5FF" : "white",
            color: tool === "create" ? "#3B82F6" : "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Create New Annotation"
        >
          <span style={{ fontSize: "18px", lineHeight: "18px" }}>+</span>
        </button>
        <div
          style={{ width: "1px", background: "#e5e7eb", margin: "0 4px" }}
        ></div>
        <button
          onClick={zoomIn}
          style={{
            padding: "8px",
            background: "white",
            color: "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={zoomOut}
          style={{
            padding: "8px",
            background: "white",
            color: "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={resetView}
          style={{
            padding: "8px",
            background: "white",
            color: "#6B7280",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Fit to View"
        >
          <Maximize size={18} />
        </button>
      </div>
      <div
        className="konva-container"
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
          position: "relative",
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          backgroundColor: "#f9fafb",
          marginTop: "70px",
        }}
      >
        <div
          className="info-panel"
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            zIndex: 2,
            background: "rgba(255, 255, 255, 0.9)",
            padding: "6px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#4B5563",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div>DPI: {currentPage?.dpi || "N/A"}</div>
          <div>Zoom: {Math.round(scale * 100)}%</div>
          <div>
            Tool:{" "}
            {tool === "pan" ? "Pan" : tool === "select" ? "Select" : "Create"}
          </div>
        </div>

        <Stage
          ref={stageRef}
          width={containerWidth}
          height={containerHeight}
          onWheel={handleWheel}
          draggable={tool === "pan"}
          onDragMove={handleDragMove}
          x={position.x}
          y={position.y}
          scale={{ x: scale, y: scale }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={(e) => {
            // Only process clicks if in select mode
            if (tool !== "select") return;

            // Deselect when clicking on empty area
            if (e.target === e.target.getStage()) {
              setSelectedBoxId(null);
            }
          }}
        >
          <Layer>
            {/* Scale the image based on DPI change */}
            <KonvaImage
              image={image}
              width={scaledWidth}
              height={scaledHeight}
            />

            {markerState &&
              markerState.map((box, idx) => (
                <BoxAnnotation
                  key={idx}
                  box={box}
                  isSelected={box === selectedBoxId}
                  onSelect={() => {
                    // Switch to select tool when clicking on an annotation
                    setTool("select");
                    setSelectedBoxId(box);
                  }}
                  onChange={handleBoxChange}
                  scaleX={1}
                  scaleY={1}
                  stageScale={scale}
                  imageWidth={originalWidth}
                  imageHeight={originalHeight}
                  currentTool={tool}
                />
              ))}

            {/* Drawing new annotation */}
            {isDrawing && newAnnotation && (
              <Rect
                x={newAnnotation.x}
                y={newAnnotation.y}
                width={newAnnotation.width}
                height={newAnnotation.height}
                fill="rgba(239, 68, 68, 0.1)"
                stroke="#EF4444"
                strokeWidth={2 / scale}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </>
  );
};

const Annotator = ({
  selectedFile,
  selectedPagesToExtract,
  markerData,
  setMarkerData,
}) => {
  const [filteredPages, setFilteredPages] = useState([]);
  const [localMarkerStates, setLocalMarkerStates] = useState([]);

  useEffect(() => {
    const filteredData = markerData.filter((page) =>
      selectedPagesToExtract.includes(page?.page_num)
    );

    // Store original DPI for each page if not already set
    const enhancedFilteredData = filteredData.map((page) => {
      if (!page.original_dpi) {
        return { ...page, original_dpi: page.dpi };
      }
      return page;
    });

    const initialMarkerStates = enhancedFilteredData.map((result) => {
      // Calculate DPI scale factor
      const dpiScale = result.dpi
        ? result.dpi / (result.original_dpi || 72)
        : 1;

      return result?.bbox?.bbox_data?.map((box) => {
        // Apply DPI scaling to coordinates
        const scaledXyxy = [
          box.xyxy[0] * dpiScale,
          box.xyxy[1] * dpiScale,
          box.xyxy[2] * dpiScale,
          box.xyxy[3] * dpiScale,
        ];

        const scaledXywh = box.xywh
          ? [
              box.xywh[0] * dpiScale,
              box.xywh[1] * dpiScale,
              box.xywh[2] * dpiScale,
              box.xywh[3] * dpiScale,
            ]
          : [
              (scaledXyxy[0] + scaledXyxy[2]) / 2,
              (scaledXyxy[1] + scaledXyxy[3]) / 2,
              scaledXyxy[2] - scaledXyxy[0],
              scaledXyxy[3] - scaledXyxy[1],
            ];

        return {
          fillColor: "transparent",
          strokeColor: "#EF4444",
          strokeWidth: 3,
          strokeDasharray: "",
          opacity: 1,
          left: scaledXyxy[0],
          top: scaledXyxy[1],
          width: scaledXyxy[2] - scaledXyxy[0],
          height: scaledXyxy[3] - scaledXyxy[1],
          rotationAngle: 0,
          visualTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          containerTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          typeName: "FrameMarker",
          state: "select",
          class_id: box.class_id || 1,
          xyxy: scaledXyxy,
          xywh: scaledXywh,
          originalXyxy: box.xyxy, // Store original coordinates
        };
      });
    });

    setLocalMarkerStates(initialMarkerStates);
    setFilteredPages(enhancedFilteredData);
  }, [selectedPagesToExtract, markerData]);

  const handleMarkerChange = (updatedMarkers, index) => {
    // Update local marker states
    setLocalMarkerStates((prevStates) => {
      const updatedState = [...prevStates];
      updatedState[index] = updatedMarkers;
      return updatedState;
    });

    // Get the current page data
    const currentPage = filteredPages[index];
    const dpiScale = currentPage.dpi
      ? currentPage.dpi / (currentPage.original_dpi || 72)
      : 1;

    // Update the filtered pages with new marker data
    // Convert the coordinates back to original scale for backend storage
    const updatedFilteredMarkerData = [...filteredPages];
    updatedFilteredMarkerData[index].bbox.bbox_data = updatedMarkers.map(
      (marker) => {
        // Revert back to original scale for backend storage
        const originalXyxy = marker.originalXyxy || [
          marker.xyxy[0] / dpiScale,
          marker.xyxy[1] / dpiScale,
          marker.xyxy[2] / dpiScale,
          marker.xyxy[3] / dpiScale,
        ];

        const originalXywh = [
          marker.xywh[0] / dpiScale,
          marker.xywh[1] / dpiScale,
          marker.xywh[2] / dpiScale,
          marker.xywh[3] / dpiScale,
        ];

        return {
          class_id: marker.class_id || 1,
          xyxy: originalXyxy,
          xywh: originalXywh,
        };
      }
    );

    // Save page to backend
    savePage(updatedFilteredMarkerData[index]);
    setFilteredPages(updatedFilteredMarkerData);

    // Update global marker data
    const updatedPageData = {
      ...markerData[0],
      bbox: {
        ...markerData[0].bbox,
        bbox_data: updatedFilteredMarkerData[index].bbox.bbox_data,
      },
    };
    setMarkerData([updatedPageData]);
  };

  const savePage = (pageInfo) => {
    const formData = new FormData();
    formData.append("file_name", selectedFile?.name);
    formData.append("pg_no", pageInfo?.page_num);
    formData.append("category", pageInfo?.category);
    formData.append("bbox_data", JSON.stringify(pageInfo.bbox.bbox_data));

    axios
      .post(ENDPOINTS.SAVE_M_OBB, formData)
      .then(function (response) {
        console.log(
          `Page modification for page: ${pageInfo?.page_num}`,
          response?.data?.message
        );
      })
      .catch(function ({ response }) {
        console.log(
          `Error while modifying page: ${pageInfo?.page_num}`,
          response
        );
      });
  };

  return (
    <div className="annotator-container">
      <div className="playground-container">
        {filteredPages.map((currentPage, index) => (
          <div key={currentPage.page_num} className="annotator-playground">
            <ImageAnnotator
              currentPage={currentPage}
              index={index}
              markerState={localMarkerStates[index]}
              onMarkerChange={handleMarkerChange}
              dpi={currentPage.dpi}
              filteredPages={filteredPages}
              selectedFile={selectedFile}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(Annotator);
