import React, { useEffect, useRef, useState } from "react";
import * as markerjs2 from "markerjs2";
import axios from "axios";
import { ENDPOINTS } from "../utils";

const Annotator = ({
  selectedFile,
  selectedPagesToExtract,
  markerData,
  setMarkerData,
}) => {
  const imgRefs = useRef([]);
  const parentElementRefs = useRef([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [localMarkerStates, setLocalMarkerStates] = useState([]);

  useEffect(() => {
    const filteredData = markerData.filter((page) =>
      selectedPagesToExtract.includes(page?.page_num)
    );

    const initialMarkerStates = filteredData.map((result) => {
      return result?.bbox?.bbox_data?.map((box) => {
        return {
          fillColor: "transparent",
          strokeColor: "#EF4444",
          strokeWidth: 3,
          strokeDasharray: "",
          opacity: 1,
          left: box.xyxy[0],
          top: box.xyxy[1],
          width: box.xyxy[2] - box.xyxy[0],
          height: box.xyxy[3] - box.xyxy[1],
          rotationAngle: 0,
          visualTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          containerTransformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          typeName: "FrameMarker",
          state: "select",
          class_id: box.class_id || 1,
        };
      });
    });

    setLocalMarkerStates(initialMarkerStates);
    setFilteredPages(filteredData);
  }, [selectedPagesToExtract, markerData]);

  const showMarkerArea = (index) => {
    if (imgRefs.current[index] && filteredPages && filteredPages[index]) {
      const markerArea = new markerjs2.MarkerArea(imgRefs.current[index]);
      markerArea.targetRoot = parentElementRefs.current[index];
      markerArea.availableMarkerTypes = ["FrameMarker"];
      markerArea.renderAtNaturalSize = true;
      markerArea.uiStyleSettings.redoButtonVisible = true;
      markerArea.uiStyleSettings.zoomButtonVisible = true;
      markerArea.uiStyleSettings.zoomOutButtonVisible = true;

      markerArea.addEventListener("render", (event) => {
        if (imgRefs.current[index]) {
          imgRefs.current[index].src = event.dataUrl;
        }
      });

      markerArea.addEventListener("statechange", () => {
        const updatedMarkers = markerArea.getState().markers.map((marker) => {
          const scaleX = filteredPages[index].bbox?.width / markerArea.imageWidth;
          const scaleY = filteredPages[index].bbox?.height / markerArea.imageHeight;
          const markerLeft = marker.left * scaleX;
          const markerTop = marker.top * scaleY;
          const markerWidth = marker.width * scaleX;
          const markerHeight = marker.height * scaleY;
          const updateMarker = {
            ...marker,
            left: markerLeft,
            top: markerTop,
            width: markerWidth,
            height: markerHeight,
            bbox: [markerLeft, markerTop, markerWidth, markerHeight],
            xyxy: [
              markerLeft,
              markerTop,
              markerLeft + markerWidth,
              markerTop + markerHeight,
            ],
            xywh: [
              markerLeft + markerWidth / 2,
              markerTop + markerHeight / 2,
              markerWidth,
              markerHeight,
            ],
          };
          return updateMarker;
        });

        setLocalMarkerStates((prevStates) => {
          const updatedState = [...prevStates];
          updatedState[index] = updatedMarkers;
          return updatedState;
        });

        const updatedFilteredMarkerData = [...filteredPages];
        updatedFilteredMarkerData[index].bbox.bbox_data = updatedMarkers.map(
          (marker) => ({
            class_id: marker.class_id || 1,
            xyxy: marker.xyxy,
            xywh: marker.xywh,
          })
        );

        savePage(updatedFilteredMarkerData[index]);
        setFilteredPages(updatedFilteredMarkerData);

        // Update markerData to include updated page data
        const updatedPageData = {
          ...markerData[0],
          bbox: {
            ...markerData[0].bbox,
            bbox_data: updatedFilteredMarkerData[index].bbox.bbox_data,
          },
        };
        setMarkerData([updatedPageData]);
      });

      markerArea.show();
      markerArea.restoreState({
        markers: localMarkerStates[index],
        width: filteredPages[index].bbox?.width,
        height: filteredPages[index].bbox?.height,
      });
    }
  };

  const savePage = (pageInfo) => {
    const formData = new FormData();
    formData.append("file_name", selectedFile?.name);
    formData.append("pg_no", pageInfo?.page_num);
    formData.append("category", pageInfo?.category);

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

  const setSourceImage = (source, index) => {
    parentElementRefs.current[index] = source?.parentElement;
  };

  return (
    <div className="annotator-container">
      <div className="playground-container">
        {filteredPages.map((currentPage, index) => {
          return (
            <div key={currentPage.page_num} className="annotator-playground">
              <img
                key={currentPage.page_num}
                id={currentPage.page_num}
                alt="annotator"
                style={{
                  width: `${currentPage?.bbox?.width}`,
                  height: `${currentPage?.bbox?.height}`,
                  maxWidth: "100%",
                  marginTop: "70px",
                }}
                onLoad={() => {
                  setSourceImage(imgRefs.current[index], index);
                  setTimeout(() => {
                    showMarkerArea(index);
                  }, 1000);
                }}
                ref={(el) => (imgRefs.current[index] = el)}
                src={`data:image/png;base64,${currentPage?.bbox?.actual_image}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(Annotator);
