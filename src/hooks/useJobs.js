// useJobs.js
import { useContext } from 'react';
import { JobsContext } from './JobsContext';

export const useJobs = () => {
  const { state, dispatch } = useContext(JobsContext);

  const getJobs = () => state.jobs;

  const addJob = (job) => {
    dispatch({ type: 'ADD_JOB', payload: job });
  };

  const updateJob = (jobId, updatedFields) => {
    dispatch({
      type: 'UPDATE_JOB',
      payload: { jobId, ...updatedFields },
    });
  };

  const deleteJob = (jobId) => {
    dispatch({ type: 'DELETE_JOB', payload: { jobId } });
  };

  return {
    jobs: state.jobs,
    getJobs,
    addJob,
    updateJob,
    deleteJob,
  };
};
