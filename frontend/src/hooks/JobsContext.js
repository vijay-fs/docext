// JobsContext.js
import React, { createContext, useReducer, useEffect, useRef } from 'react';
import { jobsReducer, initialJobsState } from './jobsReducer';
import axios from 'axios';
import { ENDPOINTS } from '../utils';


export const JobsContext = createContext();

export const JobsProvider = ({ children }) => {
  const [state, dispatch] = useReducer(jobsReducer, initialJobsState);
  const pollingIntervalsRef = useRef({});
  useEffect(() => {
    const inProgressJobs = state.jobs.filter(
      (job) => job.status === 'in_progress' && !job.isPolling
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
    const startTime = job.startTime;
    const totalDuration = expTime * 1000; // Convert to milliseconds

    // Decide how often to poll the server
    const pollingIntervals = calculatePollingIntervals(expTime);

    let pollIndex = 0;

    // Start updating progress every second
    const progressInterval = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(Math.floor((elapsedTime / totalDuration) * 100), 99);
      console.log(progress, "progress", job)
      dispatch({
        type: 'UPDATE_JOB',
        payload: {
          jobId: job.jobId,
          progress,
        },
      });
    }, 1000);
    pollingIntervalsRef.current[job.jobId] = progressInterval;
    const poll = async () => {
      try {
        const { data } = await axios.get(`${ENDPOINTS.EXTRACTJOBID}${job.jobId}`);
        console.log(data);

        if (data.success) {
          if (data.status === 'ended') {
            // Job completed
            const blob = base64ToBlob(
              data.file_data,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            const downloadUrl = URL.createObjectURL(blob);

            dispatch({
              type: 'UPDATE_JOB',
              payload: {
                jobId: job.jobId,
                status: 'completed',
                progress: 100,
                fileUrlToDownload: downloadUrl,
                isPolling: false,
              },
            });

            clearInterval(progressInterval); // Stop progress updates
          } else {
            // Continue polling at next interval
            if (pollIndex < pollingIntervals.length) {
              setTimeout(poll, pollingIntervals[pollIndex]);
              pollIndex += 1;
            } else {
              // If polling intervals are exhausted, poll every 15 seconds
              setTimeout(poll, 15000);
            }
          }
        } else {
          // Job failed
          dispatch({
            type: 'UPDATE_JOB',
            payload: { jobId: job.jobId, status: 'failed', isPolling: false },
          });
          clearInterval(progressInterval); // Stop progress updates
        }
      } catch (error) {
        dispatch({
          type: 'UPDATE_JOB',
          payload: { jobId: job.jobId, status: 'failed', isPolling: false },
        });
        clearInterval(progressInterval); // Stop progress updates
      }
    };

    // Start the first poll
    if (pollingIntervals.length > 0) {
      setTimeout(poll, pollingIntervals[pollIndex]);
      pollIndex += 1;
    } else {
      // If expTime is very short, poll immediately
      poll();
    }
  };

  const cancelJob = (jobId) => {
    // Clear polling interval for the job
    const intervalId = pollingIntervalsRef.current[jobId];
    if (intervalId) {
      clearInterval(intervalId);
      delete pollingIntervalsRef.current[jobId];
    }

    // Dispatch the cancellation action
    dispatch({
      type: 'UPDATE_JOB',
      payload: { jobId, status: 'cancelled', isPolling: false },
    });
  };

  return (
    <JobsContext.Provider value={{ state, dispatch, cancelJob }}>
      {children}
    </JobsContext.Provider>
  );
};

// Helper function to calculate polling intervals
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
