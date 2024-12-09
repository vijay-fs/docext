// JobsContext.js
import React, { createContext, useReducer, useEffect, useRef } from 'react';
import { jobsReducer, initialJobsState } from './jobsReducer';
import axios from 'axios';
import { ENDPOINTS } from '../utils';

export const JobsContext = createContext();

export const JobsProvider = ({ children }) => {
  const [state, dispatch] = useReducer(jobsReducer, initialJobsState);
  const pollingTimeoutsRef = useRef({});

  useEffect(() => {
    const inProgressJobs = state.jobs.filter(
      (job) => job.status === 'pending' && !job.isPolling
    );
    inProgressJobs.forEach((job) => {
      pollForProgress(job);
    });
  }, [state.jobs]);

  const pollForProgress = (job) => {
    dispatch({
      type: 'UPDATE_JOB',
      payload: { jobId: job.jobId, isPolling: true },
    });

    const expTime = job.expTime; // in seconds
    const pollingIntervals = calculatePollingIntervals(expTime);
    let pollIndex = 0;

    const poll = async () => {
      try {
        const { data } = await axios.get(`${ENDPOINTS.EXTRACTJOBID}${job.jobId}`);
        console.log(data, "polling");
        if (data.success) {
          if (data.status === 'completed') {
            // Job completed
            const blob = base64ToBlob(
              data.file_data,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            const downloadUrl = URL.createObjectURL(blob);
            console.log(data, "completed");

            dispatch({
              type: 'UPDATE_JOB',
              payload: {
                jobId: job.jobId,
                status: data.status,
                message: data.message,
                progress: 100,
                fileUrlToDownload: downloadUrl,
                isPolling: false,
              },
            });
          } else {
            // Job still in progress; update progress from backend
            dispatch({
              type: 'UPDATE_JOB',
              payload: {
                jobId: job.jobId,
                progress: data.progress,
                message: data.message
              },
            });

            // Schedule the next poll
            if (pollIndex < pollingIntervals.length) {
              pollingTimeoutsRef.current[job.jobId] = setTimeout(poll, pollingIntervals[pollIndex]);
              pollIndex += 1;
            } else {
              // After exhausting intervals, poll every 15 seconds
              pollingTimeoutsRef.current[job.jobId] = setTimeout(poll, 15000);
            }
          }
        } else {
          // Job failed
          dispatch({
            type: 'UPDATE_JOB',
            payload: {
              jobId: job.jobId,
              status: 'failed',
              message: data.message,
              isPolling: false
            },
          });
        }
      } catch (error) {
        dispatch({
          type: 'UPDATE_JOB',
          payload: {
            jobId: job.jobId,
            status: 'failed',
            message: error.message,
            isPolling: false
          },
        });
      }
    };

    // Instead of waiting for the first interval, poll immediately to avoid delay
    poll();
  };

  const cancelJob = (jobId) => {
    const timeoutId = pollingTimeoutsRef.current[jobId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete pollingTimeoutsRef.current[jobId];
    }

    dispatch({
      type: 'UPDATE_JOB',
      payload: { jobId, status: 'cancelled', message: 'Job cancelled', isPolling: false },
    });
  };

  return (
    <JobsContext.Provider value={{ state, dispatch, cancelJob }}>
      {children}
    </JobsContext.Provider>
  );
};

const calculatePollingIntervals = (expTime) => {
  const expTimeMs = expTime * 1000;
  const intervals = [];

  // For jobs longer than 60 seconds, poll at 25%, 50%, 75%, and 100% of expTime
  if (expTime > 60) {
    intervals.push(expTimeMs * 0.25);
    intervals.push(expTimeMs * 0.25);
    intervals.push(expTimeMs * 0.25);
    intervals.push(expTimeMs * 0.25);
  } else if (expTime > 30) {
    // For jobs between 30 and 60 seconds, poll at 50% and 100%
    intervals.push(expTimeMs * 0.5);
    intervals.push(expTimeMs * 0.5);
  } else {
    // For jobs less than 30 seconds, poll at the end
    intervals.push(expTimeMs);
  }

  return intervals;
};

const base64ToBlob = (base64, type = 'application/octet-stream') => {
  const binary = atob(base64);
  const array = [];
  for (let i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }
  return new Blob([new Uint8Array(array)], { type });
};
